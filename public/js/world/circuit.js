// El Circuito del Desmadre (rincón suroeste, donde estaba la pista de saltos). Trazado en mapdata.js (CIRCUIT).
// - La pista: asfalto de 9 m con líneas blancas, pianitos rojos y blancos en las curvas, la largada a cuadros, el
//   pórtico con el semáforo de 5 luces (lo prende game/race.js), la tribuna (se puede sentar) y paredes de gomas
//   en el lado de afuera de las curvas (con colisión: si te pasás, te comés las gomas).
// - El tramo "Guts and Glory" (las dos rectas del norte): hacha péndulo, rampa sobre una cama de pinchos, dos sierras
//   que van y vienen, la prensa, minas y una bola de demolición. Se mueven con la hora del servidor
//   (shared/circuit-traps.js): todos las ven igual. A quién agarran lo decide game/race.js.
// Rendimiento: lo quieto va fusionado por material (Builder); pinchos y gomas instanciados; las trampas se animan
// solo con la cámara cerca.
import * as THREE from 'three';
import { G } from '../core/G.js';
import { Builder, getMat } from './builder.js';
import { CIRCUIT, circuitSamples } from '../shared/mapdata.js';
import { TRAPS, MINES, axeBlade, sawX, crusherY, ballPos } from '../shared/circuit-traps.js';

const HAS_DOM = typeof document !== 'undefined';
const W = CIRCUIT.width, HALF = W / 2;
const V1 = new THREE.Vector3();
const M4 = new THREE.Matrix4(), Q1 = new THREE.Quaternion(), S1 = new THREE.Vector3(1, 1, 1);

function canvasTex(w, h, draw, repeat = true) {
  if (!HAS_DOM) return null;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export class Circuit {
  constructor(world) {
    this.world = world;
    this.scene = world.scene;
    this.phys = world.phys;
    this.group = new THREE.Group();
    this.group.name = 'circuito';
    this.S = circuitSamples();
    this.lights5 = [];
    this.mines = [];
    this.sfxT = {};
  }

  build() {
    const b = new Builder(this.phys);
    this.b = b;
    this._curvature();
    if (HAS_DOM) { this._road(); this._curbs(); }
    this._startLine();
    this._gantry();
    this._stands();
    this._barriers();
    this._gg();
    for (const m of b.finish(this.group)) m.userData.circuit = true;
    this.scene.add(this.group);
    return this;
  }

  // curvatura con signo de cada muestra (1/m): + dobla a la izquierda (hacia +x local), - a la derecha
  _curvature() {
    const S = this.S, n = S.length;
    this.curv = S.map((p, i) => {
      const a = S[(i - 3 + n) % n], c = S[(i + 3) % n];
      const cross = a[2] * c[3] - a[3] * c[2], dot = a[2] * c[2] + a[3] * c[3];
      return Math.atan2(cross, dot) / 6;
    });
  }
  // cinta a lo largo de la pista entre dos corrimientos laterales (o0 < o1); only(i): qué tramos van
  _ribbon(o0, o1, y, uvU, uvV, only = null) {
    const S = this.S, n = S.length, pos = [], uv = [], idx = [];
    const L = CIRCUIT.length;
    for (let i = 0; i <= n; i++) {
      const p = S[i % n], nx = p[3], nz = -p[2]; // normal: a la derecha de la marcha
      const s = i === n ? L : p[4];
      pos.push(p[0] + nx * o0, y, p[1] + nz * o0, p[0] + nx * o1, y, p[1] + nz * o1);
      uv.push(o0 / uvU, s / uvV, o1 / uvU, s / uvV);
    }
    for (let i = 0; i < n; i++) {
      if (only && !only(i)) continue;
      const a = i * 2, c = a + 2;
      idx.push(a, c, a + 1, a + 1, c, c + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // que mire para arriba (según el sentido del trazado, el orden de los triángulos sale al revés)
    if (g.attributes.normal.getY(0) < 0) { const ix = g.index.array; for (let k = 0; k < ix.length; k += 3) { const t = ix[k + 1]; ix[k + 1] = ix[k + 2]; ix[k + 2] = t; } g.computeVertexNormals(); }
    return g;
  }
  _road() {
    const asphalt = getMat('asphalt');
    const road = new THREE.Mesh(this._ribbon(-HALF, HALF, 0.028, asphalt.userData.tileU || 6, asphalt.userData.tileV || 6), asphalt);
    road.receiveShadow = true;
    this.group.add(road);
    // banquina de tierra apisonada a los costados (que la pista no termine en el pasto de golpe)
    const dirt = getMat('gravel');
    for (const [a, b] of [[-HALF - 1.4, -HALF], [HALF, HALF + 1.4]]) {
      const m = new THREE.Mesh(this._ribbon(a, b, 0.022, dirt.userData.tileU || 2.25, dirt.userData.tileV || 2.25), dirt);
      m.receiveShadow = true; this.group.add(m);
    }
    // líneas blancas de los bordes y la del medio, cortada
    const white = new THREE.MeshStandardMaterial({ color: 0xe8e6de, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    for (const [a, b] of [[-HALF + 0.25, -HALF + 0.5], [HALF - 0.5, HALF - 0.25]]) this.group.add(new THREE.Mesh(this._ribbon(a, b, 0.032, 1, 1), white));
    this.group.add(new THREE.Mesh(this._ribbon(-0.09, 0.09, 0.032, 1, 1, (i) => Math.floor(this.S[i][4] / 3) % 2 === 0), white));
  }
  _curbs() {
    const tex = canvasTex(32, 128, (g, w, h) => { g.fillStyle = '#d8231e'; g.fillRect(0, 0, w, h / 2); g.fillStyle = '#f2f0ea'; g.fillRect(0, h / 2, w, h / 2); });
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const curve = (i) => Math.abs(this.curv[i]) > 0.04;
    // el de afuera y el de adentro de cada curva (sobre la banquina)
    for (const [a, b] of [[-HALF - 1.0, -HALF + 0.05], [HALF - 0.05, HALF + 1.0]]) {
      const m = new THREE.Mesh(this._ribbon(a, b, 0.045, 1, 2.2, curve), mat);
      m.receiveShadow = true; this.group.add(m);
    }
  }
  _at(x, z) { // la muestra más cercana a un punto
    let best = null, bd = Infinity;
    for (const p of this.S) { const d = (p[0] - x) ** 2 + (p[1] - z) ** 2; if (d < bd) { bd = d; best = p; } }
    return best;
  }
  _startLine() {
    const st = CIRCUIT.start, p = this._at(st.x, st.z), yaw = Math.atan2(p[2], p[3]);
    this.startYaw = yaw; this.startP = p;
    if (HAS_DOM) {
      const tex = canvasTex(256, 32, (g, w, h) => { const c = w / 16; for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#f4f4f0'; g.fillRect(i * c, j * h / 2, c, h / 2); } }, false);
      const line = new THREE.Mesh(new THREE.PlaneGeometry(W, 1.2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
      line.rotation.set(-Math.PI / 2, 0, yaw + Math.PI / 2, 'YXZ');
      line.rotation.order = 'YXZ'; line.rotation.set(-Math.PI / 2, yaw + Math.PI / 2, 0);
      line.position.set(p[0], 0.036, p[1]);
      line.receiveShadow = true;
      this.group.add(line);
      // los cajones de la grilla: un corchete blanco por auto
      const white = new THREE.MeshStandardMaterial({ color: 0xe8e6de, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
      const slot = new THREE.PlaneGeometry(1.9, 0.18);
      for (let k = 0; k < 4; k++) {
        const back = 5.5 + k * 5, side = k % 2 ? 2.2 : -2.2;
        const fx = p[2], fz = p[3], nx = p[3], nz = -p[2];
        const m = new THREE.Mesh(slot, white);
        m.rotation.order = 'YXZ'; m.rotation.set(-Math.PI / 2, yaw + Math.PI / 2, 0);
        m.position.set(p[0] - fx * (back - 2.4) + nx * side, 0.034, p[1] - fz * (back - 2.4) + nz * side);
        this.group.add(m);
      }
    }
  }
  _gantry() {
    const b = this.b, p = this.startP, yaw = this.startYaw, nx = p[3], nz = -p[2], H = 6.6;
    for (const s of [-1, 1]) {
      const x = p[0] + nx * s * (HALF + 1.2), z = p[1] + nz * s * (HALF + 1.2);
      b.box('darkgray', x, H / 2, z, 0.45, H, 0.45, { yaw });
      for (let k = 0; k < 6; k++) b.box(k % 2 ? 'yellow' : 'black', x, 0.3 + k * 0.32, z, 0.47, 0.32, 0.47, { yaw, collide: false });
    }
    b.box('black', p[0], H - 0.45, p[1], W + 3.0, 0.9, 0.5, { yaw, collide: false });
    if (!HAS_DOM) return;
    const sign = canvasTex(1024, 128, (g, w, h) => {
      g.fillStyle = '#0d0d0f'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffcc33'; g.font = 'bold 84px Bangers, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('DESMADRE GRAND PRIX', w / 2, h / 2 + 4);
      g.fillStyle = '#d8231e'; g.fillRect(0, 0, w, 8); g.fillRect(0, h - 8, w, 8);
    }, false);
    for (const side of [1, -1]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(W + 2.8, 0.82), new THREE.MeshBasicMaterial({ map: sign, toneMapped: false, color: 0xbbbbbb }));
      m.position.set(p[0] - p[2] * side * 0.26, H - 0.45, p[1] - p[3] * side * 0.26);
      m.rotation.y = yaw + (side > 0 ? Math.PI : 0);
      this.group.add(m);
    }
    // el semáforo: cinco luces (rojas al largar, verdes al final) mirando a la grilla
    const housing = new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.5, metalness: 0.4 });
    for (let k = 0; k < 5; k++) {
      const o = (k - 2) * 0.7;
      const hx = p[0] + nx * o - p[2] * 0.35, hz = p[1] + nz * o - p[3] * 0.35;
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.3), housing); h.position.set(hx, H - 1.25, hz); h.rotation.y = yaw; this.group.add(h);
      const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.18, 20), new THREE.MeshStandardMaterial({ color: 0x220404, emissive: 0x000000, emissiveIntensity: 3, roughness: 0.3 }));
      bulb.position.set(hx - p[2] * 0.16, H - 1.25, hz - p[3] * 0.16); bulb.rotation.y = yaw + Math.PI;
      this.group.add(bulb); this.lights5.push(bulb);
    }
  }
  // tribuna al sur de la recta de largada (mira al norte): tres escalones con butacas de plástico y un techito
  _stands() {
    const b = this.b, x0 = -93, x1 = -67, zf = 130.2, depth = 1.3;
    // la calle de boxes: losa de hormigón con las líneas de cada lugar (ahí esperan los autos de carrera)
    b.box('concrete', -110.5, 0.02, 130.6, 27, 0.04, 5.2, { collide: false, noShadow: true });
    for (let k = 0; k < 6; k++) b.box('white', -122 + k * 5.5, 0.045, 130.6, 0.12, 0.01, 4.6, { collide: false, noShadow: true });
    b.box('yellow', -110.5, 0.045, 128.1, 27, 0.01, 0.14, { collide: false, noShadow: true });
    for (let k = 0; k < 3; k++) {
      const top = 0.5 + k * 0.5, z = zf + k * depth;
      b.box('concrete', (x0 + x1) / 2, top / 2, z + depth / 2, x1 - x0, top, depth);
      const seatY = top + 0.42;
      for (let x = x0 + 0.8; x < x1 - 0.4; x += 0.75) {
        b.box(['red', 'yellow', 'fabricBlue'][k], x, top + 0.2, z + 0.45, 0.48, 0.06, 0.42, { collide: false });
        b.box(['red', 'yellow', 'fabricBlue'][k], x, top + 0.45, z + 0.7, 0.48, 0.45, 0.06, { collide: false });
      }
      for (let x = x0 + 1.5; x < x1 - 1; x += 1.5) this.world.seats.push({ x, y: seatY - 0.16, z: z + 0.45, yaw: Math.PI });
    }
    // escalera al costado, techo de chapa en caños
    for (let k = 0; k < 3; k++) b.box('concrete', x0 - 0.7, 0.25 + k * 0.25, zf + 0.5 + k * depth, 1.4, 0.5 + k * 0.5, depth);
    for (const x of [x0 + 0.3, (x0 + x1) / 2, x1 - 0.3]) b.cylinder('iron', x, 2.75, zf + 3.7, 0.08, 0.08, 5.5, 10, { collide: true });
    b.box('metal', (x0 + x1) / 2, 5.55, zf + 2.2, x1 - x0 + 1.2, 0.08, 4.6, { rx: -0.12, collide: false });
    // cartel de la tribuna
    if (HAS_DOM) {
      const t = canvasTex(1024, 128, (g, w, h) => { g.fillStyle = '#f4f2ea'; g.fillRect(0, 0, w, h); g.fillStyle = '#d8231e'; g.font = 'bold 80px Bangers, Impact'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('TRIBUNA · AGUANTE EL DESMADRE', w / 2, h / 2 + 4); }, false);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(18, 1.6), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }));
      m.position.set((x0 + x1) / 2, 0.8, zf - 0.04); m.rotation.y = Math.PI; this.group.add(m);
    }
  }
  // gomas apiladas del lado de afuera de cada curva (y el fondo de la horquilla, para los que vuelan de la rampa)
  _barriers() {
    const S = this.S, n = S.length, stacks = [];
    for (let i = 0; i < n; i += 2) {
      const c = this.curv[i];
      if (Math.abs(c) < 0.045) continue;
      const p = S[i], side = c > 0 ? 1 : -1; // el lado de afuera de la curva (el de la normal con el signo de c)
      const o = side * (HALF + 2.4);
      stacks.push([p[0] + p[3] * o, p[1] - p[2] * o]);
    }
    // paredes rectas: el fondo de la horquilla del norte (si volás de la rampa, terminás ahí)
    for (let x = -123; x <= -101; x += 1.5) stacks.push([x, 8.6]);
    // no encimar con nada de la pista ni entre ellas
    const keep = [];
    for (const [x, z] of stacks) {
      let near = Infinity; for (const p of S) near = Math.min(near, Math.hypot(p[0] - x, p[1] - z));
      if (near < HALF + 1.6) continue;
      if (keep.some(([a, c]) => Math.hypot(a - x, c - z) < 1.3)) continue;
      if (x < -133 || x > 133 || z > 133) continue;
      keep.push([x, z]);
    }
    this.tires = keep;
    for (const [x, z] of keep) this.phys.cylinder(x, 0.45, z, 0.45, 0.45, { mat: 'wood' });
    if (!HAS_DOM) return;
    const geo = new THREE.CylinderGeometry(0.4, 0.4, 0.28, 18, 1, true);
    const mat = new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.92, side: THREE.DoubleSide });
    const im = new THREE.InstancedMesh(geo, mat, keep.length * 3);
    const col = new THREE.Color();
    keep.forEach(([x, z], i) => {
      for (let k = 0; k < 3; k++) {
        M4.compose(V1.set(x, 0.15 + k * 0.29, z), Q1.setFromAxisAngle(V1.set(0, 1, 0), i * 1.3 + k), S1);
        im.setMatrixAt(i * 3 + k, M4);
        im.setColorAt(i * 3 + k, k === 1 && i % 2 ? col.setHex(0xd8d4cc) : col.setHex(0x18181a));
      }
    });
    im.castShadow = true; im.receiveShadow = true;
    im.computeBoundingSphere();
    this.group.add(im);
  }

  // ---------------------------------------------------------------- Guts and Glory
  _gg() {
    const b = this.b;
    const T = TRAPS;
    const hazard = (x, y, z, sx, sy, sz, n = 6, opts = {}) => { for (let k = 0; k < n; k++) b.box(k % 2 ? 'yellow' : 'black', x, y - sy / 2 + (k + 0.5) * sy / n, z, sx, sy / n, sz, { ...opts, collide: k === 0 ? opts.collide ?? true : false }); };
    // arco de entrada con el cartel
    {
      const p = this._at(-97.6, 63.5), yaw = Math.atan2(p[2], p[3]), nx = p[3], nz = -p[2];
      for (const s of [-1, 1]) hazard(p[0] + nx * s * (HALF + 1), 2.8, p[1] + nz * s * (HALF + 1), 0.5, 5.6, 0.5, 8, { yaw });
      b.box('black', p[0], 5.8, p[1], W + 2.6, 1.0, 0.4, { yaw, collide: false });
      if (HAS_DOM) {
        const t = canvasTex(1024, 128, (g, w, h) => {
          g.fillStyle = '#120404'; g.fillRect(0, 0, w, h);
          g.fillStyle = '#ff3a10'; g.font = 'bold 74px Bangers, Impact'; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText('☠ GUTS & GLORY ☠', w / 2, 48);
          g.fillStyle = '#f4e2c0'; g.font = 'bold 30px Rubik, Arial'; g.fillText('a partir de acá, Dios no existe', w / 2, 104);
        }, false);
        for (const side of [1, -1]) {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(W + 2.4, 0.92), new THREE.MeshBasicMaterial({ map: t, toneMapped: false, color: 0xcccccc }));
          m.position.set(p[0] - p[2] * side * 0.21, 5.8, p[1] - p[3] * side * 0.21); m.rotation.y = yaw + (side > 0 ? Math.PI : 0); this.group.add(m);
        }
      }
    }
    // hacha péndulo: pórtico y el hacha (gira en su pivote)
    {
      const A = T.axe, top = A.pivotY + 0.5;
      for (const s of [-1, 1]) hazard(A.x + s * (HALF + 1.6), top / 2, A.z, 0.55, top, 0.55, 10);
      b.box('iron', A.x, top, A.z, W + 3.8, 0.55, 0.7, { collide: false });
      if (HAS_DOM) {
        this.axe = new THREE.Group(); this.axe.position.set(A.x, A.pivotY, A.z);
        const steel = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.9, roughness: 0.28 });
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, A.len, 0.16), new THREE.MeshStandardMaterial({ color: 0x2a2624, metalness: 0.6, roughness: 0.5 }));
        arm.position.y = -A.len / 2; this.axe.add(arm);
        const sh = new THREE.Shape(); sh.moveTo(0, 0.95); sh.quadraticCurveTo(1.35, 0, 0, -0.95); sh.lineTo(0, 0.95);
        const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.03, bevelSegments: 1 }), steel);
        blade.position.set(0, -A.len, -0.03);
        const blade2 = blade.clone(); blade2.rotation.y = Math.PI; blade2.position.z = 0.03;
        this.axe.add(blade, blade2);
        const blood = new THREE.Mesh(new THREE.CircleGeometry(0.3, 12), new THREE.MeshStandardMaterial({ color: 0x5a0006, roughness: 0.3, transparent: true, opacity: 0.85 }));
        blood.position.set(0.9, -A.len + 0.2, 0.065); this.axe.add(blood);
        for (const o of this.axe.children) o.castShadow = true;
        this.group.add(this.axe);
      }
    }
    // la cama de pinchos (detrás de la rampa) con calaveras en los costados
    {
      const P = T.spikes, len = P.z1 - P.z0;
      b.box('iron', P.x, 0.03, (P.z0 + P.z1) / 2, W + 0.4, 0.06, len, { collide: false });
      for (const s of [-1, 1]) for (const z of [P.z0, P.z1]) { b.cylinder('wood', P.x + s * (HALF + 0.6), 0.7, z, 0.06, 0.06, 1.4, 8, { collide: true }); }
      if (HAS_DOM) {
        const nX = 20, nZ = Math.round(len / 0.45), im = new THREE.InstancedMesh(new THREE.ConeGeometry(0.07, 0.5, 6), new THREE.MeshStandardMaterial({ color: 0xa0a4a8, metalness: 0.85, roughness: 0.35 }), nX * nZ);
        let k = 0; const col = new THREE.Color();
        for (let i = 0; i < nX; i++) for (let j = 0; j < nZ; j++) {
          const x = P.x - HALF + 0.25 + i * ((W - 0.5) / (nX - 1)), z = P.z0 + 0.2 + j * ((len - 0.4) / Math.max(1, nZ - 1));
          M4.compose(V1.set(x + ((j % 2) * 0.1), 0.28, z), Q1.identity(), S1); im.setMatrixAt(k, M4);
          im.setColorAt(k++, (i * 7 + j * 3) % 5 === 0 ? col.setHex(0x7a1010) : col.setHex(0xb8bcc0));
        }
        im.castShadow = true; im.computeBoundingSphere(); this.group.add(im);
        this._skulls(P.x, (P.z0 + P.z1) / 2);
        this._warn('SALTÁ O MORÍ', P.x + HALF + 2.2, T.spikes.z1 + 9, -Math.PI / 2);
      }
    }
    // sierras: ranura en el piso y dos discos que van y vienen
    {
      const Sw = T.saws;
      b.box('black', Sw.x, 0.031, Sw.z, W, 0.02, 0.32, { collide: false });
      for (const s of [-1, 1]) hazard(Sw.x + s * (HALF + 0.5), 0.5, Sw.z, 0.6, 1.0, 0.9, 4);
      if (HAS_DOM) {
        const tex = canvasTex(256, 256, (g, w) => {
          g.fillStyle = '#8c9298'; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 2, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#c4c8cc'; for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; g.beginPath(); g.arc(w / 2 + Math.cos(a) * 70, w / 2 + Math.sin(a) * 70, 18, 0, Math.PI * 2); g.fill(); }
          g.fillStyle = '#333'; g.beginPath(); g.arc(w / 2, w / 2, 22, 0, Math.PI * 2); g.fill();
          g.fillStyle = 'rgba(120,0,0,0.7)'; g.beginPath(); g.ellipse(w * 0.7, w * 0.3, 30, 14, 0.6, 0, Math.PI * 2); g.fill();
        }, false);
        const mat = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.85, roughness: 0.3 });
        const disc = new THREE.CylinderGeometry(Sw.r, Sw.r, 0.04, 40);
        disc.rotateX(Math.PI / 2);
        // dientes
        const teeth = [];
        for (let k = 0; k < 36; k++) { const a = k / 36 * Math.PI * 2, t = new THREE.ConeGeometry(0.06, 0.16, 3); t.rotateZ(a - Math.PI / 2); t.translate(Math.cos(a) * (Sw.r + 0.05), Math.sin(a) * (Sw.r + 0.05), 0); teeth.push(t); }
        this.saws = [0, 1].map(() => {
          const g = new THREE.Group();
          g.add(new THREE.Mesh(disc, mat));
          for (const t of teeth) g.add(new THREE.Mesh(t, mat));
          g.position.set(Sw.x, Sw.y, Sw.z);
          g.traverse((o) => { o.castShadow = true; });
          this.group.add(g);
          return g;
        });
      }
      this._warn('SIERRAS', Sw.x + HALF + 2.2, Sw.z + 6, -Math.PI / 2);
    }
    // la prensa
    {
      const C = T.crusher, top = C.top + 2.6;
      for (const s of [-1, 1]) hazard(C.x + s * (HALF + 1.0), top / 2, C.z, 0.8, top, 0.8, 12);
      b.box('iron', C.x, top, C.z, W + 3, 0.8, 1.2, { collide: false });
      b.box('rust', C.x, 0.03, C.z, W, 0.05, C.depth + 1, { collide: false });
      if (HAS_DOM) {
        const blockMat = new THREE.MeshStandardMaterial({ color: 0x3a3c40, metalness: 0.7, roughness: 0.45 });
        const stripe = canvasTex(256, 64, (g, w, h) => { for (let k = -2; k < 10; k++) { g.fillStyle = k % 2 ? '#111' : '#f2c21b'; g.beginPath(); g.moveTo(k * 32, h); g.lineTo(k * 32 + 32, h); g.lineTo(k * 32 + 64, 0); g.lineTo(k * 32 + 32, 0); g.fill(); } });
        stripe.repeat.set(4, 1);
        const sMat = new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.6 });
        this.press = new THREE.Group();
        const blk = new THREE.Mesh(new THREE.BoxGeometry(W + 0.4, 1.6, C.depth), [blockMat, blockMat, blockMat, blockMat, sMat, sMat]);
        blk.position.y = 0.8; blk.castShadow = true; this.press.add(blk);
        this.piston = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1, 16), new THREE.MeshStandardMaterial({ color: 0xe8e8e8, metalness: 1, roughness: 0.12 }));
        this.group.add(this.press, this.piston);
        this.press.position.set(C.x, C.top, C.z);
        this._pressTop = top;
      }
      this._warn('PRENSA', C.x - HALF - 2.2, C.z - 7, Math.PI / 2);
    }
    // minas
    if (HAS_DOM) {
      const body = new THREE.MeshStandardMaterial({ color: 0x3d4426, roughness: 0.6, metalness: 0.3 });
      for (const m of MINES) {
        const g = new THREE.Group();
        const d = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.1, 18), body); d.position.y = 0.05; g.add(d);
        const led = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff1010, emissiveIntensity: 2 }));
        led.position.y = 0.12; g.add(led);
        g.position.set(m.x, 0.03, m.z);
        this.group.add(g);
        this.mines.push({ g, led, armed: true });
      }
      this._warn('CAMPO MINADO', TRAPS.crusher.x - HALF - 2.2, CIRCUIT.gg.mines[0] - 3, Math.PI / 2);
    }
    // bola de demolición colgada de una grúa
    {
      const B = T.ball, px = B.x - HALF - 2.4;
      hazard(px, (B.pivotY + 1) / 2, B.z, 0.7, B.pivotY + 1, 0.7, 12);
      b.box('yellow', (px + B.x) / 2 + 0.4, B.pivotY + 0.6, B.z, B.x - px + 1.6, 0.5, 0.5, { collide: false });
      if (HAS_DOM) {
        this.chain = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 6), new THREE.MeshStandardMaterial({ color: 0x2c2a28, metalness: 0.8, roughness: 0.5 }));
        this.ball = new THREE.Mesh(new THREE.SphereGeometry(B.r, 24, 18), new THREE.MeshStandardMaterial({ color: 0x1c1c1e, metalness: 0.75, roughness: 0.42 }));
        this.ball.castShadow = true;
        this.group.add(this.chain, this.ball);
      }
    }
  }
  _skulls(x, z) {
    for (const s of [-1, 1]) {
      const g = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), getMat('bone'));
      g.position.set(x + s * (HALF + 0.6), 1.5, z); g.scale.set(1, 1.1, 1.15); this.group.add(g);
    }
  }
  _warn(text, x, z, yaw) {
    const b = this.b;
    b.cylinder('iron', x, 1.1, z, 0.05, 0.05, 2.2, 8, { collide: true });
    if (!HAS_DOM) return;
    const t = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#f2c21b'; g.beginPath(); g.moveTo(w / 2, 10); g.lineTo(w - 10, h - 20); g.lineTo(10, h - 20); g.closePath(); g.fill();
      g.lineWidth = 12; g.strokeStyle = '#111'; g.stroke();
      g.fillStyle = '#111'; g.font = 'bold 110px Arial'; g.textAlign = 'center'; g.fillText('☠', w / 2, 170);
      g.font = 'bold 28px Rubik, Arial'; g.fillText(text, w / 2, 222);
    }, false);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.6, side: THREE.DoubleSide }));
    m.position.set(x, 2.5, z); m.rotation.y = yaw; this.group.add(m);
  }

  // ---------------------------------------------------------------- semáforo (lo maneja game/race.js): 0..5 rojas, 6 verde
  setLights(n) {
    this.lights5.forEach((l, i) => {
      const red = n > 0 && n <= 5 && i < n, green = n === 6;
      l.material.emissive.setHex(green ? 0x20ff40 : red ? 0xff1010 : 0x000000);
      l.material.color.setHex(green ? 0x0a3a10 : red ? 0x400404 : 0x220404);
    });
  }
  // la mina i explotó (y vuelve a estar a los 10 s)
  mineGone(i) { const m = this.mines[i]; if (!m) return; m.armed = false; m.g.visible = false; m.back = (G.time || 0) + 10; }

  update(dt, cam) {
    if (!cam) return;
    const near = Math.hypot(cam.position.x + 112, cam.position.z - 42) < 95;
    if (!near) return;
    const t = (G.net?.now?.() ?? Date.now()) / 1000;
    const T = TRAPS;
    if (this.axe) {
      const a = axeBlade(t);
      this.axe.rotation.z = a.a;
      if (Math.abs(a.a) < 0.12 && (this.sfxT.axe ?? 0) < (G.time || 0)) { this.sfxT.axe = (G.time || 0) + 0.8; G.sfx?.trigger('swing', V1.set(a.x, a.y, a.z), 0.9, { full: 4, max: 30, rate: 0.45 }); }
    }
    if (this.saws) {
      this.saws.forEach((s, k) => { s.position.x = sawX(t, k); s.rotation.z -= dt * 28; });
      if ((this.sfxT.saw ?? 0) < (G.time || 0) && cam.position.distanceTo(V1.set(T.saws.x, 0.5, T.saws.z)) < 30) { this.sfxT.saw = (G.time || 0) + 0.24; G.sfx?.trigger('blades', V1, 0.25, { full: 3, max: 24, rate: 1.7 }); }
    }
    if (this.press) {
      const y = crusherY(t);
      this.press.position.y = y;
      const top = this._pressTop, len = Math.max(0.1, top - (y + 1.6));
      this.piston.scale.y = len; this.piston.position.set(T.crusher.x, y + 1.6 + len / 2, T.crusher.z);
      const down = y < T.crusher.low + 0.05;
      if (down && !this._pressDown) { G.sfx?.trigger('door-slam', V1.set(T.crusher.x, 0.6, T.crusher.z), 1, { full: 5, max: 45, rate: 0.6 }); G.fx?.puff(V1.clone(), V1.clone().set(0, 1, 0), 1.6, 0x8a8478); }
      this._pressDown = down;
    }
    if (this.ball) {
      const B = T.ball, p = ballPos(t);
      this.ball.position.set(p.x, p.y, p.z);
      const px = B.x, py = B.pivotY, pz = B.z, len = Math.hypot(p.y - py, p.z - pz);
      this.chain.scale.y = len; this.chain.position.set(px, (py + p.y) / 2, (pz + p.z) / 2); this.chain.rotation.x = p.a;
      if (Math.abs(p.a) < 0.1 && (this.sfxT.ball ?? 0) < (G.time || 0)) { this.sfxT.ball = (G.time || 0) + 1; G.sfx?.trigger('swing', this.ball.position, 0.9, { full: 4, max: 30, rate: 0.35 }); }
    }
    const blink = Math.sin((G.time || 0) * 6) > 0;
    for (const m of this.mines) {
      if (!m.armed && (G.time || 0) > m.back) { m.armed = true; m.g.visible = true; }
      m.led.material.emissiveIntensity = blink ? 2.6 : 0.2;
    }
  }
}
