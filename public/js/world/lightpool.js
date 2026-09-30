// Pool de luces puntuales. El mapa tiene muchas luces "virtuales" (velas, antorchas, lámparas, fogones)
// pero la GPU sombrea solo N reales: cada cuadro se le asignan a las que más aportan cerca de la cámara.
// Así el castillo puede tener decenas de velas sin que cada material pague decenas de luces, y la cantidad
// de luces de la escena no cambia nunca (cambiarla recompila todos los shaders: tirón).
// Una luz virtual es cualquier objeto con { position, color, intensity, distance, decay, visible } (sirve un
// THREE.PointLight fuera de la escena). Se leen cada cuadro: el parpadeo y el movimiento se ven solos.
// Además hay UNA luz "heroica" con sombras reales (cubemap): la toma la luz marcada `shadow: true` que más
// aporta (el fogón, el candelabro del salón, las chimeneas). Proyectan los objetos de la capa 1 (personajes, muebles,
// leños, el galpón) y la capa 4: cajas simples de los muros del torreón con sus puertas (castle.js), para que la luz
// no atraviese tabiques. Las mallas grandes del mapa (capa 0) no: renderizarlas seis veces costaba varios ms.
import * as THREE from 'three';

export const SHADOW_LAYER = 1;
export const PROXY_LAYER = 4;
const FADE = 3.2; // 1/s: velocidad del fundido al cambiar de dueña (lento: no se nota)
const V = new THREE.Vector3();
const SPH = new THREE.Sphere();
const FR = new THREE.Frustum();
const PM = new THREE.Matrix4();

export class LightPool {
  constructor(scene, n = 12, { shadow = true } = {}) {
    this.slots = [];
    for (let i = 0; i < n; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 10, 1.7);
      light.name = 'pool-' + i;
      scene.add(light);
      this.slots.push({ light, src: null, next: null, k: 0 });
    }
    this.hero = null;
    if (shadow) {
      const light = new THREE.PointLight(0xffffff, 0, 10, 1.7);
      light.name = 'pool-hero';
      light.castShadow = true;
      light.shadow.mapSize.set(512, 512);
      light.shadow.bias = -0.004;
      light.shadow.normalBias = 0.05;
      light.shadow.radius = 3;
      light.shadow.camera.near = 0.15;
      light.shadow.camera.layers.set(SHADOW_LAYER);
      light.shadow.camera.layers.enable(PROXY_LAYER);
      // el mapa de sombra se rehace a ~20 Hz: el fuego no se mueve, solo la gente (a 60 Hz costaba 6 ms)
      light.shadow.autoUpdate = false;
      light.shadow.needsUpdate = true;
      scene.add(light);
      this.hero = { light, src: null, next: null, k: 0, tick: 0 };
    }
    this.virt = [];
    this._rank = [];
    this.roomAt = null;
  }

  add(v) {
    if (v.visible === undefined) v.visible = true;
    if (v.decay === undefined) v.decay = 1.7;
    this.virt.push(v);
    return v;
  }
  remove(v) {
    const i = this.virt.indexOf(v);
    if (i >= 0) this.virt.splice(i, 1);
    for (const s of [...this.slots, this.hero]) {
      if (!s) continue;
      if (s.src === v) s.src = null;
      if (s.next === v) s.next = null;
    }
  }

  // Pasa al pool las PointLight que ya están en la escena (las de los edificios y muebles)
  adopt(scene) {
    const mine = new Set(this.slots.map((s) => s.light));
    if (this.hero) mine.add(this.hero.light);
    const found = [];
    scene.traverse((o) => { if (o.isPointLight && !mine.has(o)) found.push(o); });
    for (const l of found) {
      l.updateMatrixWorld(true);
      const p = new THREE.Vector3().setFromMatrixPosition(l.matrixWorld);
      l.removeFromParent();
      l.position.copy(p);
      this.add(l);
    }
    return found.length;
  }

  // aporte estimado de una luz a lo que ve la cámara
  _score(v, cam, inView, camRoom) {
    const range = v.distance > 0 ? v.distance : 25;
    const d2 = V.copy(v.position).sub(cam).lengthSq();
    let s = (v.base ?? v.intensity) * (v.priority || 1) * range * range / (d2 + range * range * 0.35);
    // detrás de la cámara y lejos: no ilumina nada que se vea
    if (!inView && d2 > range * range) s *= 0.08;
    // luz de adentro de un cuarto con la cámara afuera (o al revés): apenas se ve por las ventanas.
    // Los cuartos van numerados por edificio (101, 102... el torreón; 201 la cripta): el de al lado, por la puerta, algo
    const room = v.room || 0;
    if (room !== camRoom) s *= room && camRoom && Math.floor(room / 100) === Math.floor(camRoom / 100) ? 0.3 : room ? 0.04 : 0.3;
    return s;
  }

  _fade(s, dt) {
    const step = Math.min(1, dt * FADE);
    if (s.next !== s.src) {
      s.k = Math.max(0, s.k - step * 1.6);
      if (s.k <= 0 || !s.src) { s.src = s.next; s.k = 0; }
    } else if (s.src) s.k = Math.min(1, s.k + step);
    const L = s.light, v = s.src;
    if (!v) { L.intensity = 0; return; }
    L.position.copy(v.position);
    L.color.copy(v.color);
    L.distance = v.distance;
    L.decay = v.decay;
    L.intensity = (v.visible ? v.intensity : 0) * s.k;
  }

  update(dt, camera) {
    if (!camera) return;
    const cam = camera.position;
    PM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    FR.setFromProjectionMatrix(PM);
    const rank = this._rank;
    rank.length = 0;
    const camRoom = this.roomAt ? this.roomAt(cam.x, cam.y, cam.z) : 0;
    let best = null, bestS = 0;
    for (const v of this.virt) {
      // una luz apagada por un susto sigue "reservando" su lugar si ya lo tenía (volver a prenderla no salta)
      if (!v.visible || !((v.base ?? v.intensity) > 0)) continue;
      SPH.center.copy(v.position);
      SPH.radius = v.distance > 0 ? v.distance : 25;
      const s = this._score(v, cam, FR.intersectsSphere(SPH), camRoom);
      if (s <= 0.004) continue;
      if (v.shadow && s > bestS) { best = v; bestS = s; }
      rank.push({ v, s });
    }
    // la heroica (con sombra) elige primero; esa no ocupa otro lugar
    const hero = this.hero;
    if (hero) {
      const cur = hero.next || hero.src;
      // histéresis: la actual se queda salvo que otra aporte bastante más
      const curS = cur ? (rank.find((r) => r.v === cur)?.s || 0) : 0;
      hero.next = best && (!cur || cur === best || bestS > curS * 1.5) ? best : (curS > 0 ? cur : best);
      const hv = hero.next;
      if (hv) for (let i = rank.length - 1; i >= 0; i--) if (rank[i].v === hv || rank[i].v === hero.src) rank.splice(i, 1);
    }
    // histéresis: la que ya tiene lugar suma un 35% (no se suelta por una diferencia chica: no parpadea), pero una
    // que aporta claramente más siempre entra (antes una vieja "retenida" podía dejar afuera a la del cuarto nuevo)
    const cur = new Set();
    for (const s of this.slots) { const c = s.next || s.src; if (c) cur.add(c); }
    for (const r of rank) if (cur.has(r.v)) r.s *= 1.35;
    rank.sort((a, b) => b.s - a.s);
    const n = this.slots.length;
    const want = new Set();
    for (let i = 0; i < Math.min(n, rank.length); i++) want.add(rank[i].v);
    const taken = new Set();
    for (const s of this.slots) {
      const c = s.next || s.src;
      s.next = c && want.has(c) && !taken.has(c) ? c : null;
      if (s.next) taken.add(s.next);
    }
    const fresh = [];
    for (const v of want) if (!taken.has(v)) fresh.push(v);
    for (const s of this.slots) if (!s.next) s.next = fresh.shift() || null;
    for (const s of this.slots) this._fade(s, dt);
    if (hero) {
      const prev = hero.src;
      this._fade(hero, dt);
      const v = hero.src;
      if (v) {
        const far = Math.max(2, v.distance || 12);
        if (hero.light.shadow.camera.far !== far) { hero.light.shadow.camera.far = far; hero.light.shadow.camera.updateProjectionMatrix(); }
        hero.tick += dt;
        if (hero.tick > 0.05 || prev !== v) { hero.tick = 0; hero.light.shadow.needsUpdate = true; }
      }
    }
  }
}
