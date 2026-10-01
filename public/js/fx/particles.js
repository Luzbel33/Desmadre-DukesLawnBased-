// Partículas: sprites (humo, fuego, polvo) y mini-mallas (sangre, recortes de pasto, vidrio).
import * as THREE from 'three';
import { smokeTexture } from '../world/textures.js';

const UPV = new THREE.Vector3(0, 1, 0);
const FX_RENDER_DISTANCE_SQ = 120 * 120;

function withinFxRange(camera, x, y, z) {
  if (!camera) return true;
  const dx = x - camera.position.x, dy = y - camera.position.y, dz = z - camera.position.z;
  return dx * dx + dy * dy + dz * dz <= FX_RENDER_DISTANCE_SQ;
}

class SpritePool {
  constructor(scene, max, tex, additive = false) {
    this.max = max;
    this.n = 0;
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.attributes.position);
    g.setAttribute('uv', base.attributes.uv);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    this.aSR = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2);
    for (const a of [this.aPos, this.aCol, this.aSR]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos);
    g.setAttribute('iCol', this.aCol);
    g.setAttribute('iSR', this.aSR);
    g.instanceCount = 0;
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog) },
      vertexShader: /* glsl */ `
        attribute vec3 iPos; attribute vec4 iCol; attribute vec2 iSR;
        varying vec2 vUv; varying vec4 vCol;
        #include <fog_pars_vertex>
        void main() {
          vUv = uv; vCol = iCol;
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          float c = cos(iSR.y), s = sin(iSR.y);
          vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * iSR.x;
          vec3 wp = iPos + right * p.x + up * p.y;
          vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; varying vec2 vUv; varying vec4 vCol;
        #include <fog_pars_fragment>
        void main() {
          vec4 t = texture2D(map, vUv);
          gl_FragColor = vec4(vCol.rgb, vCol.a * t.a);
          if (gl_FragColor.a < 0.004) discard;
          #include <fog_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
    this.p = []; // partículas vivas
  }
  spawn(o) {
    if (this.p.length >= this.max) this.p.shift();
    this.p.push({
      x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0,
      age: 0, life: o.life || 2, s0: o.s0 ?? 0.3, s1: o.s1 ?? 1.2,
      r: o.r ?? 1, g: o.g ?? 1, b: o.b ?? 1, a0: o.a0 ?? 0.5, a1: o.a1 ?? 0,
      rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * (o.spin ?? 1), drag: o.drag ?? 1.2, grav: o.grav ?? 0.4,
    });
  }
  update(dt, camera) {
    const P = this.p;
    let w = 0, draw = 0;
    const pa = this.aPos.array, ca = this.aCol.array, sa = this.aSR.array;
    for (let i = 0; i < P.length; i++) {
      const q = P[i];
      q.age += dt;
      if (q.age >= q.life) continue;
      const k = Math.exp(-q.drag * dt);
      q.vx *= k; q.vy = q.vy * k + q.grav * dt; q.vz *= k;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      q.rot += q.vr * dt;
      P[w++] = q;
      if (!withinFxRange(camera, q.x, q.y, q.z)) continue;
      const t = q.age / q.life;
      pa[draw * 3] = q.x; pa[draw * 3 + 1] = q.y; pa[draw * 3 + 2] = q.z;
      ca[draw * 4] = q.r; ca[draw * 4 + 1] = q.g; ca[draw * 4 + 2] = q.b;
      ca[draw * 4 + 3] = (q.a0 + (q.a1 - q.a0) * t) * Math.min(1, q.age * 8);
      sa[draw * 2] = q.s0 + (q.s1 - q.s0) * Math.sqrt(t);
      sa[draw * 2 + 1] = q.rot;
      draw++;
    }
    P.length = w;
    this.geo.instanceCount = draw;
    if (draw) {
      for (const [attribute, count] of [[this.aPos, draw * 3], [this.aCol, draw * 4], [this.aSR, draw * 2]]) {
        attribute.clearUpdateRanges(); attribute.addUpdateRange(0, count); attribute.needsUpdate = true;
      }
    }
  }
}

class MeshPool {
  constructor(scene, max, geo, mat) {
    this.max = max;
    this.im = new THREE.InstancedMesh(geo, mat, max);
    this.im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.im.count = 0;
    this.im.frustumCulled = false;
    this.im.castShadow = false;
    this.im.setColorAt(0, new THREE.Color());
    scene.add(this.im);
    this.p = [];
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.c = new THREE.Color();
  }
  spawn(o) {
    if (this.p.length >= this.max) this.p.shift();
    this.p.push({
      x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, age: 0, life: o.life || 3,
      s: o.s || 0.02, sy: o.sy || 1, rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6,
      wr: (Math.random() - 0.5) * (o.spin ?? 12), col: o.col ?? 0xffffff, grav: o.grav ?? -9.8, landed: false,
      onLand: o.onLand || null, bounce: o.bounce ?? 0.2, drag: o.drag ?? 0.3,
      stretch: o.stretch || 0, // > 0: se estira en la dirección en que vuela (gotas de líquido)
    });
  }
  update(dt, groundY = () => 0, camera) {
    const P = this.p;
    let w = 0, draw = 0;
    for (let i = 0; i < P.length; i++) {
      const q = P[i];
      q.age += dt;
      if (q.age >= q.life) continue;
      if (!q.landed) {
        const k = Math.exp(-q.drag * dt);
        q.vx *= k; q.vz *= k;
        q.vy += q.grav * dt;
        q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
        q.rx += q.wr * dt; q.rz += q.wr * 0.7 * dt;
        const gy = groundY(q.x, q.z) + q.s * 0.5;
        if (q.y < gy) {
          q.y = gy;
          if (q.onLand) { q.onLand(q); q.onLand = null; }
          if (Math.abs(q.vy) > 2 && q.bounce > 0) {
            q.vy = -q.vy * q.bounce; q.vx *= 0.5; q.vz *= 0.5;
          } else {
            q.landed = true;
            q.vx = q.vy = q.vz = 0;
          }
        }
      }
      P[w++] = q;
      if (!withinFxRange(camera, q.x, q.y, q.z)) continue;
      const fade = q.age > q.life - 0.5 ? (q.life - q.age) / 0.5 : 1;
      if (q.stretch) {
        if (!q.landed) {
          // gota: alargada en la dirección de la velocidad
          const sp = Math.hypot(q.vx, q.vy, q.vz);
          this.v.set(q.vx, q.vy, q.vz).divideScalar(sp || 1);
          if (sp < 1e-4) this.v.set(0, 1, 0);
          this.q.setFromUnitVectors(UPV, this.v);
          this.s.set(q.s * fade, q.s * (1 + sp * q.stretch) * fade, q.s * fade);
        } else {
          // en el piso: una gotita aplastada
          this.q.identity();
          this.s.set(q.s * 1.7 * fade, q.s * 0.18, q.s * 1.7 * fade);
        }
      } else {
        this.e.set(q.rx, q.ry, q.rz);
        this.q.setFromEuler(this.e);
        this.s.set(q.s * fade, q.s * q.sy * fade, q.s * fade);
      }
      this.m.compose(this.v.set(q.x, q.y, q.z), this.q, this.s);
      this.im.setMatrixAt(draw, this.m);
      this.im.setColorAt(draw, this.c.setHex(q.col));
      draw++;
    }
    P.length = w;
    this.im.count = draw;
    if (draw) {
      this.im.instanceMatrix.clearUpdateRanges(); this.im.instanceMatrix.addUpdateRange(0, draw * 16);
      this.im.instanceMatrix.needsUpdate = true;
      this.im.instanceColor.clearUpdateRanges(); this.im.instanceColor.addUpdateRange(0, draw * 3);
      this.im.instanceColor.needsUpdate = true;
    }
  }
}

export class FX {
  constructor(scene) {
    const smoke = smokeTexture();
    this.smoke = new SpritePool(scene, 1600, smoke, false);
    this.glow = new SpritePool(scene, 500, smoke, true);
    this.bits = new MeshPool(scene, 1400, new THREE.TetrahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 0.4 }));
    this.drops = new MeshPool(scene, 2200, new THREE.SphereGeometry(1, 5, 4), new THREE.MeshStandardMaterial({ roughness: 0.15, color: 0xffffff }));
    this.onBloodLand = null;
  }
  update(dt, camera) {
    this.smoke.update(dt, camera);
    this.glow.update(dt, camera);
    this.bits.update(dt, undefined, camera);
    this.drops.update(dt, undefined, camera);
  }

  // bocanada de humo (sale de la boca)
  puff(pos, dir, amount = 1, color = 0xdddddd) {
    const c = new THREE.Color(color);
    for (let i = 0; i < 14 * amount; i++) {
      this.smoke.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: dir.x * (0.6 + Math.random()) + (Math.random() - 0.5) * 0.4,
        vy: dir.y * 0.5 + 0.15 + Math.random() * 0.2,
        vz: dir.z * (0.6 + Math.random()) + (Math.random() - 0.5) * 0.4,
        life: 2.5 + Math.random() * 2.5 * amount, s0: 0.08, s1: 0.8 + amount * 0.6,
        r: c.r, g: c.g, b: c.b, a0: 0.35, a1: 0, drag: 1.6, grav: 0.12,
      });
    }
  }
  // humito de la brasa
  ember(pos) {
    this.smoke.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: (Math.random() - 0.5) * 0.05, vy: 0.25, vz: (Math.random() - 0.5) * 0.05,
      life: 1.8, s0: 0.02, s1: 0.25, r: 0.85, g: 0.85, b: 0.85, a0: 0.25, a1: 0, drag: 0.8, grav: 0.1 });
  }
  fire(pos) {
    this.glow.spawn({ x: pos.x + (Math.random() - 0.5) * 0.3, y: pos.y, z: pos.z + (Math.random() - 0.5) * 0.3, vy: 0.8 + Math.random(),
      life: 0.6 + Math.random() * 0.4, s0: 0.35, s1: 0.05, r: 1, g: 0.45 + Math.random() * 0.2, b: 0.1, a0: 0.9, a1: 0, drag: 1, grav: 0.5 });
    if (Math.random() < 0.3) this.smoke.spawn({ x: pos.x, y: pos.y + 0.6, z: pos.z, vy: 0.8, life: 3, s0: 0.3, s1: 1.4, r: 0.3, g: 0.3, b: 0.3, a0: 0.25, a1: 0, grav: 0.2 });
  }
  // recortes de pasto
  clippings(pos, dir, n = 6) {
    for (let i = 0; i < n; i++) {
      this.bits.spawn({
        x: pos.x + (Math.random() - 0.5) * 0.6, y: pos.y + 0.1, z: pos.z + (Math.random() - 0.5) * 0.6,
        vx: dir.x * (2 + Math.random() * 3) + (Math.random() - 0.5) * 2, vy: 1.5 + Math.random() * 2.5, vz: dir.z * (2 + Math.random() * 3) + (Math.random() - 0.5) * 2,
        life: 2 + Math.random() * 2, s: 0.025 + Math.random() * 0.02, sy: 2.5, col: Math.random() < 0.8 ? 0x3f7a1f : 0x9aa83a, grav: -6, drag: 1.5,
      });
    }
  }
  // chorro de sangre: gotas finas que se estiran al volar + una nubecita roja en el impacto
  blood(pos, dir, amount = 1) {
    const n = Math.round(14 + amount * 34);
    for (let i = 0; i < n; i++) {
      const sp = 0.8 + Math.random() * 4.5 * amount;
      this.drops.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: dir.x * sp + (Math.random() - 0.5) * 1.8, vy: dir.y * sp + Math.random() * 1.8, vz: dir.z * sp + (Math.random() - 0.5) * 1.8,
        life: 1.6 + Math.random() * 1.2, s: 0.005 + Math.random() * 0.011, col: Math.random() < 0.5 ? 0x5a0006 : 0x7e0a0e, grav: -9.8,
        bounce: 0, drag: 0.5, stretch: 0.09,
        onLand: i % 4 === 0 && this.onBloodLand ? (q) => this.onBloodLand(q.x, q.z, 0.06 + Math.random() * 0.14 * amount) : null,
      });
    }
    this.bloodMist(pos, dir, amount);
  }
  // niebla de sangre (el "pff" rojo del golpe)
  bloodMist(pos, dir, amount = 1) {
    const n = Math.round(3 + amount * 5);
    for (let i = 0; i < n; i++) {
      this.smoke.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: dir.x * (0.6 + Math.random() * 1.4) + (Math.random() - 0.5) * 0.6, vy: dir.y * 0.8 + Math.random() * 0.4, vz: dir.z * (0.6 + Math.random() * 1.4) + (Math.random() - 0.5) * 0.6,
        life: 0.45 + Math.random() * 0.35, s0: 0.04, s1: 0.28 + amount * 0.18, r: 0.42, g: 0.02, b: 0.03, a0: 0.55, a1: 0, drag: 3, grav: -0.4,
      });
    }
  }
  // agua de la fuente: un chorrito que sube y cae salpicando
  water(pos, spread = 0.2, up = 1.6) {
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * spread;
      this.drops.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: Math.cos(a) * (0.4 + r * 2), vy: up * (0.8 + Math.random() * 0.4), vz: Math.sin(a) * (0.4 + r * 2),
        life: 1.4, s: 0.006 + Math.random() * 0.008, sy: 2, col: Math.random() < 0.5 ? 0xcfe6f0 : 0x9fc4d4, grav: -9.8, bounce: 0, drag: 0.2, spin: 1,
      });
    }
  }
  // chorro fino y continuo (muñones, heridas abiertas): pocas gotas por llamada
  bloodStream(pos, dir, n = 3, speed = 3) {
    for (let i = 0; i < n; i++) {
      const sp = speed * (0.7 + Math.random() * 0.6);
      this.drops.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: dir.x * sp + (Math.random() - 0.5) * 0.5, vy: dir.y * sp + (Math.random() - 0.5) * 0.5, vz: dir.z * sp + (Math.random() - 0.5) * 0.5,
        life: 1.8, s: 0.004 + Math.random() * 0.008, col: Math.random() < 0.5 ? 0x5a0006 : 0x7e0a0e, grav: -9.8,
        bounce: 0, drag: 0.25, stretch: 0.12,
        onLand: i === 0 && this.onBloodLand ? (q) => this.onBloodLand(q.x, q.z, 0.04 + Math.random() * 0.07) : null,
      });
    }
  }
  vomit(pos, dir) {
    for (let i = 0; i < 6; i++) {
      this.drops.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: dir.x * (2 + Math.random() * 1.5) + (Math.random() - 0.5) * 0.6, vy: -0.5 + Math.random(), vz: dir.z * (2 + Math.random() * 1.5) + (Math.random() - 0.5) * 0.6,
        life: 2, s: 0.02 + Math.random() * 0.025, col: Math.random() < 0.5 ? 0x9a9a2a : 0xb0a040, grav: -9.8, bounce: 0,
        onLand: i === 0 && this.onVomitLand ? (q) => this.onVomitLand(q.x, q.z) : null,
      });
    }
  }
  glass(pos, n = 18, col = 0x3a7a3a) {
    for (let i = 0; i < n; i++) {
      this.bits.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: (Math.random() - 0.5) * 5, vy: 1 + Math.random() * 3, vz: (Math.random() - 0.5) * 5,
        life: 3, s: 0.015 + Math.random() * 0.025, col, grav: -9.8, bounce: 0.3 });
    }
  }
  spray(pos, dir, color) {
    const c = new THREE.Color(color);
    this.smoke.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: dir.x * 3 + (Math.random() - 0.5) * 0.3, vy: dir.y * 3 + (Math.random() - 0.5) * 0.3, vz: dir.z * 3 + (Math.random() - 0.5) * 0.3,
      life: 0.5, s0: 0.03, s1: 0.35, r: c.r, g: c.g, b: c.b, a0: 0.5, a1: 0, drag: 4, grav: 0 });
  }
  // chispas de metal contra algo duro (filo contra pared)
  sparks(pos, normal, n = 14) {
    for (let i = 0; i < n; i++) {
      const sp = 2 + Math.random() * 5;
      this.glow.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: (normal?.x || 0) * sp + (Math.random() - 0.5) * 4, vy: (normal?.y || 0) * sp + Math.random() * 3, vz: (normal?.z || 0) * sp + (Math.random() - 0.5) * 4,
        life: 0.18 + Math.random() * 0.3, s0: 0.035, s1: 0.006, r: 1, g: 0.75 + Math.random() * 0.2, b: 0.35, a0: 1, a1: 0, drag: 0.6, grav: -9, spin: 0,
      });
    }
  }
  // polvillo de un golpe de madera o contra el revoque
  dust(pos, normal, amount = 1) {
    for (let i = 0; i < 4 + amount * 4; i++) {
      this.smoke.spawn({
        x: pos.x, y: pos.y, z: pos.z,
        vx: (normal?.x || 0) * (0.4 + Math.random()) + (Math.random() - 0.5) * 0.5, vy: (normal?.y || 0) * 0.6 + Math.random() * 0.4, vz: (normal?.z || 0) * (0.4 + Math.random()) + (Math.random() - 0.5) * 0.5,
        life: 0.6 + Math.random() * 0.6, s0: 0.03, s1: 0.22, r: 0.72, g: 0.66, b: 0.56, a0: 0.35, a1: 0, drag: 2.5, grav: 0.05,
      });
    }
  }
  confetti(pos, n = 40) {
    const cols = [0xff4f6d, 0xffcc33, 0x7dff6b, 0x4de8ff, 0xc76bff];
    for (let i = 0; i < n; i++) {
      this.bits.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: (Math.random() - 0.5) * 4, vy: 3 + Math.random() * 3, vz: (Math.random() - 0.5) * 4,
        life: 3, s: 0.03, sy: 0.2, col: cols[i % cols.length], grav: -4, drag: 2 });
    }
  }
}

// Manchas en el piso (sangre / vómito). Se achican y desaparecen con el tiempo.
export class Decals {
  constructor(scene, max = 300) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 10, 64, 64, 62);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.beginPath();
    for (let a = 0; a < Math.PI * 2; a += 0.3) {
      const r = 42 + Math.random() * 20;
      x.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
    }
    x.fill();
    const tex = new THREE.CanvasTexture(c);
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ alphaMap: tex, transparent: true, depthWrite: false, roughness: 0.15,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, color: 0xffffff });
    this.im = new THREE.InstancedMesh(geo, mat, max);
    this.im.count = 0;
    this.im.frustumCulled = false;
    this.im.receiveShadow = true;
    this.im.setColorAt(0, new THREE.Color());
    scene.add(this.im);
    this.max = max;
    this.list = [];
    this.m = new THREE.Matrix4();
    this.c = new THREE.Color();
  }
  add(x, z, size, color = 0x5a0006, y = 0.03, life = 240) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ x, z, y, size, rot: Math.random() * 6.28, color, age: 0, life });
    this.dirty = true;
  }
  update(dt) {
    let w = 0;
    for (const d of this.list) {
      d.age += dt;
      if (d.age < d.life) this.list[w++] = d;
    }
    this.list.length = w;
    this._t = (this._t || 0) + dt;
    if (!this.dirty && this._t < 1) return;
    this._t = 0;
    this.dirty = false;
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    for (let i = 0; i < w; i++) {
      const d = this.list[i];
      const k = d.age > d.life - 20 ? (d.life - d.age) / 20 : 1;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.rot);
      s.set(d.size * k, 1, d.size * k);
      this.m.compose(new THREE.Vector3(d.x, d.y, d.z), q, s);
      this.im.setMatrixAt(i, this.m);
      this.im.setColorAt(i, this.c.setHex(d.color));
    }
    this.im.count = w;
    this.im.instanceMatrix.needsUpdate = true;
    if (this.im.instanceColor) this.im.instanceColor.needsUpdate = true;
  }
}
