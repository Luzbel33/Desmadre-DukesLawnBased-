import * as THREE from 'three';
import { SURFACES, PAINT, patchAt, patchId, parsePatch } from '../shared/mapdata.js';
import { applyDots, encodeDot, DOT_BYTES } from '../shared/raster.js';
import { G } from '../core/G.js';
import { GR, groups } from '../core/physics.js';
import { floorTopAt } from '../world/builder.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const WORLD_ONLY = groups(0xffff, GR.WORLD);
const M4 = new THREE.Matrix4();
const VU = new THREE.Vector3();
const VV = new THREE.Vector3();
const VN = new THREE.Vector3();

function rgb(hex) {
  // Canvas pixels are sRGB bytes, not the linear values of THREE.Color.r/g/b.
  const safe = /^#[0-9a-f]{6}$/i.test(hex || '') ? hex : '#ff2d55';
  const n = parseInt(safe.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Superficies pintables: las fijas del mapa (SURFACES) + parches libres de 2x2 m creados al pintar cualquier plano
export class GraffitiManager {
  constructor(scene, net) {
    this.scene = scene;
    this.net = net;
    this.surfaces = new Map();
    this.fixedMeshes = [];
    this.ray = new THREE.Raycaster();
    this.ray.far = 5.5;
    for (const def of SURFACES) this._make(def);
  }

  _make(def) {
    const canvas = document.createElement('canvas');
    canvas.width = def.pw; canvas.height = def.ph;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const buf = new Uint8ClampedArray(def.pw * def.ph * 4);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    // la pintura recibe la luz del lugar (se ve oscura de noche y bajo techo, como la pared)
    const material = new THREE.MeshStandardMaterial({
      map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.75,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(def.w, def.h), material);
    mesh.name = `graffiti-${def.id}`;
    mesh.userData.surfaceId = def.id;
    mesh.receiveShadow = true;
    if (def.patch) {
      VU.fromArray(def.u); VV.fromArray(def.v); VN.fromArray(def.n);
      M4.makeBasis(VU, VV, VN);
      mesh.quaternion.setFromRotationMatrix(M4);
      const off = def.horizontal ? 0.012 : 0.016;
      mesh.position.set(def.c[0] + def.n[0] * off, def.c[1] + def.n[1] * off, def.c[2] + def.n[2] * off);
    } else if (def.horizontal) {
      mesh.position.set(def.c[0], (def.c[1] || 0) + 0.035, def.c[2]);
      mesh.rotation.x = -Math.PI / 2;
    } else {
      const nx = Math.sin(def.yaw || 0), nz = Math.cos(def.yaw || 0);
      mesh.position.set(def.c[0] + nx * 0.018, def.c[1], def.c[2] + nz * 0.018);
      mesh.rotation.y = def.yaw || 0;
    }
    mesh.renderOrder = 3;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.updateMatrixWorld(true);
    this.scene.add(mesh);
    const s = { def, canvas, ctx, buf, tex, mesh, dirty: false };
    this.surfaces.set(def.id, s);
    if (!def.patch) this.fixedMeshes.push(mesh);
    return s;
  }

  _get(id) {
    let s = this.surfaces.get(id);
    if (s) return s;
    const def = parsePatch(id);
    if (!def || this.surfaces.size - SURFACES.length >= PAINT.maxPatches) return null;
    return this._make(def);
  }

  _refresh(s) {
    // se sube a la GPU una vez por frame como máximo (flush)
    s.dirty = true;
  }

  flush() {
    for (const s of this.surfaces.values()) {
      if (!s.dirty) continue;
      s.dirty = false;
      s.ctx.putImageData(new ImageData(s.buf, s.def.pw, s.def.ph), 0, 0);
      s.tex.needsUpdate = true;
    }
  }

  async applyFullPacket(u8) {
    try {
      const idLen = u8[1];
      const id = decoder.decode(u8.subarray(2, 2 + idLen));
      const s = this._get(id); if (!s) return;
      const off = 2 + idLen;
      const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
      const w = dv.getUint16(off, true), h = dv.getUint16(off + 2, true);
      if (w !== s.def.pw || h !== s.def.ph) return;
      const ds = new DecompressionStream('deflate');
      const raw = new Uint8Array(await new Response(new Blob([u8.subarray(off + 4)]).stream().pipeThrough(ds)).arrayBuffer());
      if (raw.length !== s.buf.length) return;
      s.buf.set(raw); this._refresh(s);
    } catch (e) { console.warn('graffiti full', e); }
  }

  applyDotsPacket(u8) {
    const idLen = u8[1];
    const id = decoder.decode(u8.subarray(2, 2 + idLen));
    const s = this._get(id); if (!s) return;
    const off = 2 + idLen;
    if (u8.byteLength < off + 2) return;
    const count = new DataView(u8.buffer, u8.byteOffset, u8.byteLength).getUint16(off, true);
    applyDots(s.buf, s.def.pw, s.def.ph, u8, off + 2, count);
    this._refresh(s);
  }

  spray(camera, opts = {}) {
    const origin = opts.origin || camera.position;
    const reach = Number.isFinite(opts.maxReach) ? Math.max(0.1, opts.maxReach) : 3.2;
    camera.updateMatrixWorld(true);
    const far = camera.position.distanceTo(origin) + reach;
    this.ray.far = far;
    this.ray.setFromCamera({ x: 0, y: 0 }, camera);
    const dir = this.ray.ray.direction;
    const cam = this.ray.ray.origin;
    // 1) superficies fijas del mapa (murales, cartel, paredón...)
    const fixed = this.ray.intersectObjects(this.fixedMeshes, false)[0];
    // 2) cualquier plano sólido del mundo
    const solid = G.phys?.raycast(cam.x, cam.y, cam.z, dir.x, dir.y, dir.z, far, WORLD_ONLY);
    const [r, g, b] = rgb(opts.color || '#ff2d55');
    const sizeM = Math.max(0.03, Math.min(0.7, +opts.size || 0.18));
    const alpha = Math.round(Math.max(0.1, Math.min(1, +opts.alpha || 0.7)) * 255);
    const flags = (opts.erase ? 1 : 0) | (opts.drip ? 2 : 0);

    if (fixed && fixed.uv && (!solid || fixed.distance <= solid.dist + 0.12)) {
      if (origin.distanceTo(fixed.point) > reach) return null;
      if (opts.isBlocked?.(origin, fixed.point)) return null;
      const s = this.surfaces.get(fixed.object.userData.surfaceId); if (!s) return null;
      const rad = Math.max(1, Math.min(255, Math.round(sizeM * s.def.ppm)));
      const dots = [{ x: fixed.uv.x * (s.def.pw - 1), y: (1 - fixed.uv.y) * (s.def.ph - 1), rad, r, g, b, a: alpha, flags }];
      if (opts.drip && !s.def.horizontal && Math.random() < 0.28) {
        dots.push({ ...dots[0], y: Math.min(s.def.ph - 1, dots[0].y + rad * 0.9), rad: Math.max(1, Math.round(rad * 0.32)), a: Math.round(alpha * 0.7) });
      }
      this._sendDots(s.def.id, dots);
      const normal = fixed.face?.normal?.clone()?.transformDirection(fixed.object.matrixWorld) || new THREE.Vector3(0, 0, 1);
      if (normal.dot(dir) > 0) normal.negate();
      return { point: fixed.point.clone(), normal };
    }

    if (!solid || !solid.info?.paint) return null;
    const point = new THREE.Vector3(solid.x, solid.y, solid.z);
    // pisos decorativos sin collider (vereda, explanada, terraza): pintar sobre su cara de arriba
    if (solid.ny > 0.9 && solid.y < 0.35) point.y = Math.max(point.y, floorTopAt(point.x, point.z));
    if (origin.distanceTo(point) > reach) return null;
    if (opts.isBlocked?.(origin, point)) return null;
    this._paintPlane(point, solid.nx, solid.ny, solid.nz, sizeM, { r, g, b, a: alpha, flags, drip: opts.drip });
    return { point, normal: new THREE.Vector3(solid.nx, solid.ny, solid.nz) };
  }

  // Mancha sobre un plano libre: se reparte entre los parches que toca (hasta 4)
  _paintPlane(p, nx, ny, nz, sizeM, paint) {
    const C = PAINT.cell;
    const { q, a, b } = patchAt(nx, ny, nz, p.x, p.y, p.z);
    const rad = Math.max(1, Math.min(255, Math.round(sizeM * PAINT.ppm)));
    const horizontal = Math.abs(ny) > 0.7;
    const i0 = Math.floor((a - sizeM) / C), i1 = Math.floor((a + sizeM) / C);
    const j0 = Math.floor((b - sizeM) / C), j1 = Math.floor((b + sizeM) / C);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const id = patchId(q, i, j);
        if (!this._get(id)) continue;
        const x = (a / C - i) * (PAINT.px - 1);
        const y = (1 - (b / C - j)) * (PAINT.px - 1);
        const dots = [{ x, y, rad, r: paint.r, g: paint.g, b: paint.b, a: paint.a, flags: paint.flags }];
        if (paint.drip && !horizontal && Math.random() < 0.28) {
          dots.push({ ...dots[0], y: y + rad * 0.9, rad: Math.max(1, Math.round(rad * 0.32)), a: Math.round(paint.a * 0.7) });
        }
        this._sendDots(id, dots);
      }
    }
  }

  _sendDots(id, dots) {
    const idb = encoder.encode(id);
    const off = 2 + idb.length;
    const out = new Uint8Array(off + 2 + dots.length * DOT_BYTES);
    out[0] = 3; out[1] = idb.length; out.set(idb, 2);
    const dv = new DataView(out.buffer);
    dv.setUint16(off, dots.length, true);
    for (let i = 0; i < dots.length; i++) {
      const d = dots[i];
      encodeDot(dv, off + 2 + i * DOT_BYTES, d.x, d.y, d.rad, d.r, d.g, d.b, d.a, d.flags);
    }
    this.applyDotsPacket(out);
    this.net.sendBin(out);
  }
}
