// Construye el mundo: cielo, luces, suelo, edificios, muebles, árboles y la máscara de pasto.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { G, rng } from '../core/G.js';
import { Builder, pbrMaps } from './builder.js';
import { TEX } from './textures.js';
import { Forest } from './trees.js';
import { FURNITURE, MAP_BOUNDS, LAWN, INTERACT, NO_GRASS, MEDKITS } from '../shared/mapdata.js';
import { buildFurniture, WATER_T } from './furniture.js';
import { makeFarSun } from './shadows.js';
import {
  buildBar, buildCinema, buildAlley, buildMansion, buildTerrace, buildForecourt, buildGarage,
  buildTown, buildAutocine, buildStuntPark, buildPerimeter,
} from './buildings.js';

const E1 = new THREE.Vector3();
const E2 = new THREE.Vector3();

// Zonas sin pasto ni árboles: la misma lista que usa el pasto cortable
const HARD = NO_GRASS;

export class World {
  constructor(scene, phys) {
    this.scene = scene;
    this.phys = phys;
    this.seats = [];
    this.lights = [];
    this.flicker = [];
    this.anim = []; // (t, dt) => void: cosas animadas del escenario (rockola, carteles)
    this.emitters = [];
    this.interact = INTERACT.map((i) => ({ ...i }));
    this.sunDir = new THREE.Vector3(-0.82, 0.3, 0.42).normalize();
  }

  build(renderer, quality) {
    this.renderer = renderer;
    const scene = this.scene;
    this._sky(renderer);
    this._lights(quality);
    this._ground();
    const b = new Builder(this.phys);
    const out = { seats: this.seats, lights: this.lights, flicker: this.flicker, emitters: this.emitters, pokerTables: [], anim: this.anim };
    this.pokerTables = out.pokerTables;
    buildMansion(b, scene);
    buildTerrace(b);
    buildForecourt(b);
    buildBar(b, scene, this.lights);
    buildCinema(b, scene, this.lights);
    buildAlley(b);
    buildGarage(b, scene);
    buildTown(b, scene);
    buildAutocine(b, scene);
    buildStuntPark(b);
    buildPerimeter(b);
    buildFurniture(FURNITURE, b, scene, out);
    this._hedges(b);
    b.finish(scene);
    this._medkits();
    // todo lo construido hasta acá es quieto: entra en la sombra lejana horneada
    scene.traverse((o) => { if (o.isMesh) o.userData.static = true; });
    this._trees();
    this.mask = this._mask();
    this._bakeAt = performance.now() + 9000; // si los árboles no cargan, se hornea igual
  }

  _sky(renderer) {
    const sky = new Sky();
    sky.scale.setScalar(4000);
    const u = sky.material.uniforms;
    // tarde de sol con cúmulos (como la referencia): cielo celeste suave, nubes gordas que se mueven
    const skyCfg = (uu) => {
      uu.turbidity.value = 4.2;
      uu.rayleigh.value = 1.25;
      uu.mieCoefficient.value = 0.0042;
      uu.mieDirectionalG.value = 0.82;
      if (uu.cloudCoverage) {
        uu.cloudCoverage.value = 0.52;
        uu.cloudDensity.value = 0.62;
        uu.cloudScale.value = 0.00015;
        uu.cloudElevation.value = 0.6;
        uu.cloudSpeed.value = 0.00004;
      }
      uu.sunPosition.value.copy(this.sunDir).multiplyScalar(1000);
    };
    skyCfg(u);
    // el cielo no pasa del umbral del bloom: se ve igual (el tone mapping ya lo satura) pero no genera halo
    sky.material.fragmentShader = sky.material.fragmentShader.replace(
      'gl_FragColor = vec4( texColor, 1.0 );',
      'gl_FragColor = vec4( min( texColor, vec3( 1.35 ) ), 1.0 );',
    );
    sky.material.needsUpdate = true;
    this.scene.add(sky);
    this.sky = sky;
    // ambiente (IBL) a partir del cielo
    const pmrem = new THREE.PMREMGenerator(renderer);
    const skyScene = new THREE.Scene();
    const sky2 = new Sky();
    sky2.scale.setScalar(4000);
    skyCfg(sky2.material.uniforms);
    skyScene.add(sky2);
    const env = pmrem.fromScene(skyScene, 0, 1, 5000);
    this.scene.environment = env.texture;
    // relleno del cielo: sombras que no quedan negras, cromo y pintura con reflejos
    this.scene.environmentIntensity = 0.3;
    pmrem.dispose();
    // bruma de distancia (perspectiva aérea): lo lejano se funde en celeste, como en la referencia
    this.scene.fog = new THREE.FogExp2(0xc3d3df, 0.0036);
  }

  _lights(quality) {
    const hemi = new THREE.HemisphereLight(0xd6e7ff, 0x5b6b38, 0.42);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffdcae, 2.4);
    sun.castShadow = true;
    const size = quality === 'baja' ? 1024 : quality === 'ultra' ? 4096 : 2048;
    sun.shadow.mapSize.set(size, size);
    const S = quality === 'ultra' ? 48 : quality === 'baja' ? 30 : 38;
    sun.shadow.camera.left = -S;
    sun.shadow.camera.right = S;
    sun.shadow.camera.top = S;
    sun.shadow.camera.bottom = -S;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 400;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.04;
    sun.shadow.radius = 1.6;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;
    this.shadowSize = S;
    // segunda capa: sombra de todo el mapa, horneada una vez (ver shadows.js). Va después del sol (luz 1)
    this.farSun = makeFarSun(this.sunDir, quality === 'baja' ? 2048 : 4096);
    this.scene.add(this.farSun);
    this.scene.add(this.farSun.target);
    this.farSun.target.updateMatrixWorld();
  }

  // Hornea la sombra lejana con lo quieto (edificios, árboles, setos): se dibuja una sola vez
  bakeFarShadows(camera) {
    if (!this.farSun || !this.renderer) return;
    const off = [];
    this.scene.traverse((o) => {
      if ((o.isMesh || o.isInstancedMesh) && o.castShadow && !o.userData.static) { o.castShadow = false; off.push(o); }
    });
    this.forest?.showAll(true);
    this.farSun.shadow.needsUpdate = true;
    const prev = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, camera);
    this.renderer.setRenderTarget(prev);
    this.forest?.showAll(false);
    for (const o of off) o.castShadow = true;
    this._baked = true;
  }

  _ground() {
    const size = 900;
    const tex = TEX.grass().clone();
    tex.needsUpdate = true;
    tex.repeat.set(size / 4, size / 4);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, color: 0x8a9a6a });
    // pasto base PBR (Poly Haven) cuando carga
    pbrMaps('sparse_grass', new THREE.Vector2(size / 2.2, size / 2.2), ({ map, normalMap, roughnessMap }) => {
      if (!map) return;
      mat.map = map; mat.normalMap = normalMap; mat.roughnessMap = roughnessMap; mat.color.setHex(0xa8b48c);
      mat.needsUpdate = true;
    });
    // anti-repetición: variación de tono a gran escala (evita el "patrón de baldosa" a lo lejos)
    mat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        #ifdef USE_MAP
          float macro = texture2D(map, vMapUv * 0.043).g * 0.6 + texture2D(map, vMapUv * 0.011 + 0.37).g * 0.4;
          diffuseColor.rgb *= mix(0.78, 1.2, smoothstep(0.15, 0.6, macro));
        #endif`);
    };
    const g = new THREE.PlaneGeometry(size, size, 1, 1);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    this.scene.add(m);
    // Analytic support plane; avoids numerical stalls in capsule/cuboid sweeps.
    this.phys.ground(0, { mat: 'grass' });
  }

  // Botiquines (cajita blanca con cruz roja, en una pared o en un poste)
  _medkits() {
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 96;
    const c = cv.getContext('2d');
    c.fillStyle = '#f4f1ea'; c.fillRect(0, 0, 128, 96);
    c.fillStyle = '#d4232a'; c.fillRect(52, 18, 24, 60); c.fillRect(34, 36, 60, 24);
    c.strokeStyle = '#c9c3b8'; c.lineWidth = 4; c.strokeRect(2, 2, 124, 92);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const front = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 });
    const side = new THREE.MeshStandardMaterial({ color: 0xece8df, roughness: 0.5 });
    const pole = new THREE.MeshStandardMaterial({ color: 0x3b3f44, roughness: 0.5, metalness: 0.6 });
    const box = new THREE.BoxGeometry(0.36, 0.27, 0.13);
    const mats = [side, side, side, side, front, side];
    for (const m of MEDKITS) {
      const g = new THREE.Group();
      g.position.set(m.p[0], m.wall ? m.p[1] : 0, m.p[2]);
      g.rotation.y = m.yaw;
      const k = new THREE.Mesh(box, mats);
      k.position.set(0, m.wall ? 0 : 1.25, m.wall ? 0.07 : 0);
      k.castShadow = true;
      g.add(k);
      if (!m.wall) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.12, 10), pole);
        p.position.y = 0.56;
        p.castShadow = true;
        g.add(p);
      }
      this.scene.add(g);
    }
  }

  _hedges(b) {
    // setos alrededor del Gran Pasto con entradas
    const L = LAWN;
    const hedge = (x0, z0, x1, z1) => {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      b.box('hedge', cx, 0.6, cz, Math.max(0.9, Math.abs(x1 - x0)), 1.2, Math.max(0.9, Math.abs(z1 - z0)));
    };
    // lado oeste (entrada frente al galpón), lado este (entrada hacia la ruta)
    hedge(L.x0 - 2.2, L.z0 + 4, L.x0 - 2.2, -20);
    hedge(L.x0 - 2.2, 0, L.x0 - 2.2, L.z1 - 4);
    hedge(L.x1 + 2.2, L.z0 + 4, L.x1 + 2.2, -20);
    hedge(L.x1 + 2.2, 0, L.x1 + 2.2, L.z1 - 4);
    // sur (con hueco para el autocine)
    hedge(L.x0 + 4, L.z1 + 2.2, -24, L.z1 + 2.2);
    hedge(24, L.z1 + 2.2, L.x1 - 4, L.z1 + 2.2);
  }

  _trees() {
    const r = rng(4242);
    const pts = [];
    const ok = (x, z, pad) => {
      if (x > LAWN.x0 - 4 && x < LAWN.x1 + 4 && z > LAWN.z0 - 4 && z < LAWN.z1 + 4) return false;
      for (const h of HARD) if (x > h[0] - pad && x < h[2] + pad && z > h[1] - pad && z < h[3] + pad) return false;
      return true;
    };
    let tries = 0;
    while (pts.length < 230 && tries++ < 6000) {
      const x = MAP_BOUNDS.x0 + 5 + r() * (MAP_BOUNDS.x1 - MAP_BOUNDS.x0 - 10);
      const z = MAP_BOUNDS.z0 + 5 + r() * (MAP_BOUNDS.z1 - MAP_BOUNDS.z0 - 10);
      if (!ok(x, z, 5)) continue;
      if (pts.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 36)) continue;
      pts.push({ x, z, s: 0.8 + r() * 0.45, rot: r() * Math.PI * 2, v: Math.floor(r() * 4) });
    }
    // árboles cerca del Gran Pasto (como en la foto de referencia)
    for (const [x, z] of [[-76, -30], [-77, 25], [77, 30], [76, -35], [-60, 66], [60, 66], [-30, 68], [30, 68]]) {
      pts.push({ x, z, s: 1.15, rot: r() * 6, v: Math.floor(r() * 4) });
    }
    this.treePts = pts;
    // colisión de los troncos
    for (const p of pts) this.phys.cylinder(p.x, 2, p.z, 2, 0.32 * p.s, { mat: 'wood' });
    // árboles realistas (ez-tree) con impostores a distancia; se generan cuando cargan sus texturas
    this.forestReady = Forest.create(this.scene, this.renderer, pts).then((f) => { this.forest = f; }).catch((e) => console.warn('árboles', e));
  }

  // Máscara de pasto silvestre (blanco = pasto), 1 px = 0.5 m
  _mask() {
    const W = (MAP_BOUNDS.x1 - MAP_BOUNDS.x0) * 2;
    const H = (MAP_BOUNDS.z1 - MAP_BOUNDS.z0) * 2;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = '#fff';
    x.fillRect(0, 0, W, H);
    x.fillStyle = '#000';
    const rect = (x0, z0, x1, z1) => x.fillRect((x0 - MAP_BOUNDS.x0) * 2, (z0 - MAP_BOUNDS.z0) * 2, (x1 - x0) * 2, (z1 - z0) * 2);
    for (const h of HARD) rect(...h);
    // cerca de los setos y árboles, pasto más bajo
    x.filter = 'blur(2px)';
    x.drawImage(c, 0, 0);
    x.filter = 'none';
    return c;
  }

  update(dt, focus) {
    // la sombra del sol sigue al jugador, corrida hacia donde mira la cámara (más sombra en pantalla),
    // encajada a la grilla de texels para que no titile
    const sun = this.sun;
    const S = this.shadowSize;
    const texel = (S * 2) / sun.shadow.mapSize.x;
    let cx = focus.x, cz = focus.z;
    if (G.camera) {
      G.camera.getWorldDirection(E1);
      const l = Math.hypot(E1.x, E1.z) || 1;
      cx += (E1.x / l) * S * 0.5;
      cz += (E1.z / l) * S * 0.5;
    }
    const fx = Math.round(cx / texel) * texel;
    const fz = Math.round(cz / texel) * texel;
    sun.target.position.set(fx, 0, fz);
    sun.position.set(fx + this.sunDir.x * 200, this.sunDir.y * 200, fz + this.sunDir.z * 200);
    sun.target.updateMatrixWorld();
    if (this.forest) this.forest.update(G.camera ? G.camera.position : focus, G.time);
    if (this.sky?.material.uniforms.time) this.sky.material.uniforms.time.value = G.time;
    // sombra lejana: cuando están los árboles (o si tardan demasiado)
    if (!this._baked && G.camera && (this.forest || performance.now() > this._bakeAt)) this.bakeFarShadows(G.camera);
    WATER_T.value = G.time;
    for (const a of this.anim) a(G.time, dt);
    // emisores (fuego, parrilla, fuente): solo los cercanos a la cámara
    const cam = G.camera?.position || focus;
    if (G.fx) {
      for (const e of this.emitters) {
        const dx = e.x - cam.x, dz = e.z - cam.z;
        if (dx * dx + dz * dz > 70 * 70) continue;
        e.acc = (e.acc || 0) + e.rate * dt;
        while (e.acc >= 1) {
          e.acc -= 1;
          E1.set(e.x, e.y, e.z);
          if (e.kind === 'fire') G.fx.fire(E1);
          else if (e.kind === 'grill') { if (Math.random() < 0.5) G.fx.ember(E1.set(e.x + (Math.random() - 0.5) * 1.4, e.y, e.z + (Math.random() - 0.5) * 0.5)); else G.fx.puff(E1, E2.set(0, 1, 0), 0.25, 0xbbbbbb); }
          else if (e.kind === 'fountain') G.fx.water(E1, e.r || 0.2, e.up ?? 1.6);
        }
      }
    }
    for (const f of this.flicker) {
      const t = G.time + f.seed;
      const k = f.fire
        ? 0.75 + Math.sin(t * 13) * 0.12 + Math.sin(t * 29) * 0.08 + Math.random() * 0.08
        : Math.random() < 0.004 ? 0.15 : 1;
      if (f.light) f.light.intensity = f.base * k;
      if (f.mesh) f.mesh.material.opacity = k > 0.5 ? 1 : 0.35;
    }
  }
}

function mergeSimple(geos) {
  // fusión simple de geometrías indexadas con position/normal/color
  let vCount = 0, iCount = 0;
  for (const g of geos) {
    vCount += g.attributes.position.count;
    iCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), col = new Float32Array(vCount * 3);
  const idx = new Uint32Array(iCount);
  let vo = 0, io = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    col.set(g.attributes.color.array, vo * 3);
    if (g.index) {
      for (let k = 0; k < g.index.count; k++) idx[io + k] = g.index.array[k] + vo;
      io += g.index.count;
    } else {
      for (let k = 0; k < g.attributes.position.count; k++) idx[io + k] = k + vo;
      io += g.attributes.position.count;
    }
    vo += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}
