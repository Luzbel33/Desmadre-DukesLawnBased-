// La explanada del castillo con vida: feria de la bruja alrededor del aljibe (pociones, manzanas acarameladas, el
// tarot de la abuela), la Taberna del Ahorcado bajo una pérgola con guirnaldas, y una fogata con troncos para sentarse.
// Acá solo lo que se ve y se choca (más asientos y puntos de uso); la gente que atiende y anda es game/villagers.js.
import * as THREE from 'three';
import { Builder, getMat } from './builder.js';

const HAS_DOM = typeof document !== 'undefined';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(cv) { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

// lona a rayas, gastada y con manchas
function awningTex(a, b, n = 8) {
  const cv = canvas(256, 128), g = cv.getContext('2d');
  for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect((i * 256) / n, 0, 256 / n + 1, 128); }
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(30,20,10,${Math.random() * 0.12})`; g.fillRect(Math.random() * 256, Math.random() * 128, 3 + Math.random() * 8, 2 + Math.random() * 6); }
  // festón: el borde de abajo recortado en ondas
  g.globalCompositeOperation = 'destination-out';
  for (let x = 0; x < 256; x += 256 / n) { g.beginPath(); g.arc(x + 128 / n, 128, 128 / n, Math.PI, 0); g.fill(); }
  return tex(cv);
}
// cartel de madera pintado
function signTex(text, sub, fg = '#f2d7a0') {
  const cv = canvas(512, 160), g = cv.getContext('2d');
  g.fillStyle = '#3a2414'; g.fillRect(0, 0, 512, 160);
  for (let y = 0; y < 160; y += 3) { g.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.08})`; g.fillRect(0, y, 512, 1); }
  g.strokeStyle = '#1c1008'; g.lineWidth = 10; g.strokeRect(5, 5, 502, 150);
  g.fillStyle = fg; g.textAlign = 'center'; g.font = 'bold 56px Georgia, serif'; g.fillText(text, 256, sub ? 82 : 100);
  if (sub) { g.font = 'italic 28px Georgia, serif'; g.fillStyle = '#c9a979'; g.fillText(sub, 256, 128); }
  return tex(cv);
}

export class Fair {
  constructor(decor) {
    this.d = decor;
    this.c = decor.c;
    this.scene = decor.scene;
    this.phys = decor.phys;
    this.r = decor.r;
    this.spots = {}; // dónde se para cada uno (para villagers.js): { potions: {pos, yaw}, ... }
    this.bulbs = []; // lamparitas de las guirnaldas (parpadean)
  }

  build() {
    if (!HAS_DOM) return this;
    const b = this.b = new Builder(this.phys);
    const well = new THREE.Vector2(-21, -66.5);
    const facing = (x, z) => Math.atan2(well.x - x, well.y - z);
    this._stall('potions', -29.2, -59.6, facing(-29.2, -59.6), ['#3a0f4a', '#120a14'], 'POCIONES', 'de la Bruja Morgana');
    this._stall('apples', -12.6, -59.4, facing(-12.6, -59.4), ['#8a1016', '#efe6d0'], 'MANZANAS', 'acarameladas');
    this._stall('tarot', -29.4, -73.2, facing(-29.4, -73.2), ['#0f2a24', '#b08a3a'], 'TAROT', 'la Abuela Nieves');
    this._tavern(22, -65.2);
    this._bonfire(35.2, -60.8);
    for (const m of b.finish(this.scene) || []) m.layers.enable(1);
    return this;
  }

  // ---------------------------------------------------------------- puesto de feria (mostrador, postes, toldo, cartel)
  _stall(id, x, z, yaw, cols, title, sub) {
    const b = this.b, c = Math.cos(yaw), s = Math.sin(yaw);
    // local -> mundo: +Z local mira a los clientes
    const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    const W = 2.6, D = 0.75;
    // mostrador con frente de tablas y tapa
    const [mx, mz] = at(0, 0.2);
    b.box('oldWood', mx, 0.5, mz, W, 1.0, D, { yaw });
    b.box('woodDark', mx, 1.03, mz, W + 0.12, 0.06, D + 0.14, { yaw, collide: false });
    // postes y el estante de atrás
    for (const [lx, lz] of [[-W / 2, 0.55], [W / 2, 0.55], [-W / 2, -1.25], [W / 2, -1.25]]) {
      const [px, pz] = at(lx, lz);
      b.box('woodDark', px, lz > 0 ? 1.15 : 1.35, pz, 0.1, lz > 0 ? 2.3 : 2.7, 0.1, { yaw });
    }
    for (const y of [1.2, 1.65]) { const [sx, sz] = at(0, -1.2); b.box('oldWood', sx, y, sz, W - 0.1, 0.04, 0.32, { yaw, collide: false }); }
    const [bx, bz] = at(0, -1.3); b.box('woodDark', bx, 1.3, bz, W, 2.6, 0.04, { yaw, collide: false });
    // toldo a rayas en pendiente, con el festón
    const aw = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.5, 2.3), new THREE.MeshStandardMaterial({ map: awningTex(cols[0], cols[1]), roughness: 0.95, side: THREE.DoubleSide, transparent: true, alphaTest: 0.5 }));
    const [ax, az] = at(0, -0.35);
    aw.position.set(ax, 2.5, az);
    aw.rotation.set(0, 0, 0, 'YXZ'); aw.rotation.y = yaw; aw.rotation.x = -Math.PI / 2 + 0.38;
    aw.castShadow = true; aw.receiveShadow = true;
    this.scene.add(aw);
    // cartel colgado del frente del toldo
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.53), new THREE.MeshStandardMaterial({ map: signTex(title, sub), roughness: 0.8 }));
    const [gx, gz] = at(0, 0.62);
    sign.position.set(gx, 2.02, gz); sign.rotation.y = yaw;
    this.scene.add(sign);
    // farol colgado y su luz
    const [lx, lz] = at(W / 2 - 0.3, 0.45);
    this.c.flame(lx, 2.0, lz, 0.035, 0.08, {});
    b.box('iron', lx, 2.05, lz, 0.14, 0.2, 0.14, { collide: false, noShadow: true });
    this.c.light(lx, 2.0, lz, id === 'potions' ? 0xb070ff : 0xffa050, 3.2, 8, { flicker: true, priority: 1 });
    // la mercadería
    this['_goods_' + id]?.(at, yaw);
    // dónde atiende, dónde se pide
    const [vx, vz] = at(0, -0.65), [ix, iz] = at(0, 1.0);
    this.spots[id] = { pos: new THREE.Vector3(vx, 0, vz), yaw };
    const label = { potions: 'Comprarle una poción a la bruja', apples: 'Comprar una manzana acaramelada', tarot: 'Que la abuela te tire las cartas' }[id];
    this.c.interact.push({ id: 'shop_' + id, k: 'npc', shop: id, p: [ix, 1.0, iz], r: 2.2, label });
  }
  _goods_potions(at, yaw) {
    // frascos de colores que brillan, en los estantes y sobre el mostrador
    const cols = [0x2aff70, 0xb040ff, 0xff3050, 0x30c0ff, 0xffd030];
    const geo = new THREE.SphereGeometry(0.06, 12, 8);
    const neck = new THREE.CylinderGeometry(0.018, 0.022, 0.07, 8);
    for (let k = 0; k < cols.length; k++) {
      const mat = new THREE.MeshStandardMaterial({ color: cols[k], emissive: cols[k], emissiveIntensity: 0.9, roughness: 0.15, transparent: true, opacity: 0.85 });
      const pts = [];
      for (let i = 0; i < 16; i++) if (i % cols.length === k) {
        const shelf = i < 6 ? 1.22 : i < 12 ? 1.67 : 1.06;
        const lz = i < 12 ? -1.2 : 0.1 + (i % 2) * 0.12, lx = i < 12 ? -1.05 + (i % 6) * 0.42 : -0.9 + (i - 12) * 0.5;
        const [px, pz] = at(lx, lz);
        pts.push([px, shelf + 0.06, pz]);
      }
      const im = new THREE.InstancedMesh(geo, mat, pts.length), imN = new THREE.InstancedMesh(neck, mat, pts.length);
      const M = new THREE.Matrix4();
      pts.forEach(([px, py, pz], i) => { im.setMatrixAt(i, M.makeTranslation(px, py, pz)); imN.setMatrixAt(i, M.makeTranslation(px, py + 0.08, pz)); });
      this.scene.add(im, imN);
    }
    // caldero chico humeando al costado
    const [cx, cz] = at(-1.75, 0.6);
    const pot = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 10, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65), getMat('iron'));
    pot.position.set(cx, 0.3, cz); this.scene.add(pot);
    const brew = new THREE.Mesh(new THREE.CircleGeometry(0.24, 16), new THREE.MeshStandardMaterial({ color: 0x103a10, emissive: 0x40ff60, emissiveIntensity: 1.2 }));
    brew.rotation.x = -Math.PI / 2; brew.position.set(cx, 0.43, cz); this.scene.add(brew);
    this.phys.cylinder(cx, 0.3, cz, 0.3, 0.3, { mat: 'metal' });
    this.d.world?.smoke?.add(cx, 0.5, cz, 4, { radius: 0.15, height: 0.8, opacity: 0.12, speed: 0.12 });
    this.c.light(cx, 0.8, cz, 0x50ff70, 1.6, 4, { flicker: true, priority: 0.6 });
  }
  _goods_apples(at) {
    // bandejas con manzanas rojas brillantes clavadas en palitos
    const apple = new THREE.SphereGeometry(0.045, 12, 10);
    const stick = new THREE.CylinderGeometry(0.004, 0.004, 0.14, 5).translate(0, 0.07, 0);
    const red = new THREE.MeshPhysicalMaterial({ color: 0x9a0a10, roughness: 0.12, clearcoat: 1 });
    const pts = [];
    for (let i = 0; i < 24; i++) { const [px, pz] = at(-1.0 + (i % 8) * 0.28, 0.02 + Math.floor(i / 8) * 0.14); pts.push([px, 1.1, pz]); }
    for (let i = 0; i < 12; i++) { const [px, pz] = at(-1.0 + (i % 6) * 0.4, -1.2); pts.push([px, (i < 6 ? 1.22 : 1.67) + 0.02, pz]); }
    const im = new THREE.InstancedMesh(apple, red, pts.length), ims = new THREE.InstancedMesh(stick, getMat('cream'), pts.length);
    const M = new THREE.Matrix4();
    pts.forEach(([px, py, pz], i) => { im.setMatrixAt(i, M.makeTranslation(px, py + 0.045, pz)); ims.setMatrixAt(i, M.makeTranslation(px, py + 0.07, pz)); });
    this.scene.add(im, ims);
    // olla del caramelo
    const [cx, cz] = at(1.0, -0.2);
    this.b.cylinder('iron', cx, 1.16, cz, 0.16, 0.14, 0.18, 14, { collide: false });
    const car = new THREE.Mesh(new THREE.CircleGeometry(0.15, 14), new THREE.MeshStandardMaterial({ color: 0x8a1008, emissive: 0x401004, roughness: 0.1 }));
    car.rotation.x = -Math.PI / 2; car.position.set(cx, 1.245, cz); this.scene.add(car);
  }
  _goods_tarot(at) {
    // mantel, bola de cristal que brilla, cartas desplegadas y velas
    const [cx, cz] = at(0, 0.2);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 16), new THREE.MeshStandardMaterial({ color: 0x8fd8ff, emissive: 0x3a90ff, emissiveIntensity: 1.1, roughness: 0.05, transparent: true, opacity: 0.8 }));
    ball.position.set(cx, 1.2, cz); this.scene.add(ball);
    this.b.cylinder('gold', cx, 1.09, cz, 0.08, 0.1, 0.06, 12, { collide: false });
    this.c.light(cx, 1.4, cz, 0x5aa8ff, 2.4, 5, { flicker: true, priority: 0.9 });
    const card = new THREE.PlaneGeometry(0.07, 0.11).rotateX(-Math.PI / 2);
    const cm = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.8 });
    for (let i = 0; i < 5; i++) {
      const [px, pz] = at(-0.9 + i * 0.12, 0.25 + Math.abs(i - 2) * 0.03);
      const m = new THREE.Mesh(card, cm); m.position.set(px, 1.065, pz); m.rotation.y = (i - 2) * 0.2; this.scene.add(m);
    }
    for (const lx of [0.7, 0.95]) { const [px, pz] = at(lx, 0.1); this.d.candle(px, 1.06, pz, 0.15, 0.03, 0); }
  }

  // ---------------------------------------------------------------- la taberna: pérgola con lona, barra de barriles, mesas largas
  _tavern(x, z) {
    const b = this.b, W = 11, D = 7;
    const x0 = x - W / 2, x1 = x + W / 2, z0 = z - D / 2, z1 = z + D / 2;
    for (const px of [x0, x, x1]) for (const pz of [z0, z1]) b.box('woodDark', px, 1.6, pz, 0.2, 3.2, 0.2);
    for (const pz of [z0, z1]) b.box('woodDark', x, 3.25, pz, W + 0.4, 0.2, 0.2, { collide: false });
    for (const px of [x0, x, x1]) b.box('woodDark', px, 3.35, z, 0.16, 0.16, D + 0.4, { collide: false });
    // lona bordó, un poco caída entre vigas
    const roof = new THREE.PlaneGeometry(W + 0.6, D + 0.6, 22, 14).rotateX(-Math.PI / 2);
    const rp = roof.attributes.position;
    for (let i = 0; i < rp.count; i++) {
      const u = (rp.getX(i) + (W + 0.6) / 2) / (W + 0.6), v = (rp.getZ(i) + (D + 0.6) / 2) / (D + 0.6);
      rp.setY(i, -Math.abs(Math.sin(u * Math.PI * 2)) * 0.28 - Math.sin(v * Math.PI) * 0.15);
    }
    roof.computeVertexNormals(); roof.translate(x, 3.5, z);
    const rm = new THREE.Mesh(roof, new THREE.MeshStandardMaterial({ color: 0x4a0d10, roughness: 0.95, side: THREE.DoubleSide }));
    rm.castShadow = true; rm.receiveShadow = true;
    this.scene.add(rm);
    // cartel
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.0), new THREE.MeshStandardMaterial({ map: signTex('LA TABERNA', 'del Ahorcado'), roughness: 0.8 }));
    sign.position.set(x, 2.75, z1 + 0.12); this.scene.add(sign);
    const back = sign.clone(); back.rotation.y = Math.PI; back.position.z = z1 + 0.1; this.scene.add(back);
    // guirnaldas de lamparitas (cuelgan en catenaria entre los postes)
    const bulbs = [];
    for (const pz of [z0 + 0.1, z, z1 - 0.1]) for (let i = 0; i <= 22; i++) {
      const t = i / 22, px = x0 + t * W;
      bulbs.push(new THREE.Vector3(px, 3.1 - Math.sin(t * Math.PI * 2 % Math.PI) * 0.35 - Math.sin(t * Math.PI) * 0.1, pz));
    }
    const bim = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffb050, emissiveIntensity: 2.2 }), bulbs.length);
    const M = new THREE.Matrix4();
    bulbs.forEach((p, i) => bim.setMatrixAt(i, M.makeTranslation(p.x, p.y, p.z)));
    this.scene.add(bim);
    this.bulbs.push(bim);
    for (const [lx, lz] of [[x - 3, z], [x + 3, z], [x, z - 2.4]]) this.c.light(lx, 2.9, lz, 0xffb060, 5, 11, { priority: 1.3 });
    // barra: tablones sobre barriles, atrás un estante con botellas y un barril grande con canilla
    const bz = z0 + 1.3;
    b.box('oldWood', x, 1.08, bz, 4.4, 0.1, 0.7, { collide: false });
    this.phys.box(x, 0.55, bz, 2.2, 0.55, 0.35, 0, { paint: false, mat: 'wood' });
    const kegs = [];
    for (let i = 0; i < 4; i++) kegs.push(this.d.mat4(x - 1.6 + i * 1.07, 0, bz, i, 1));
    this.d.instances('c_barrel_a', kegs);
    b.box('woodDark', x, 1.6, z0 + 0.25, 4.6, 0.05, 0.4, { collide: false });
    b.box('woodDark', x, 2.1, z0 + 0.25, 4.6, 0.05, 0.4, { collide: false });
    b.box('woodDark', x, 1.25, z0 + 0.08, 4.8, 2.5, 0.08);
    this._bottles(x, z0 + 0.3);
    this.spots.tavern = { pos: new THREE.Vector3(x, 0, z0 + 0.62), yaw: 0 };
    this.c.interact.push({ id: 'shop_tavern', k: 'npc', shop: 'tavern', p: [x, 1.0, bz + 0.9], r: 2.6, label: 'Pedirle al tabernero' });
    // mesas largas con bancos (asientos de verdad, a los dos lados)
    this.spots.tables = [];
    for (const tx of [x - 2.7, x + 2.7]) {
      const tz = z + 1.1;
      b.box('oldWood', tx, 0.76, tz, 1.0, 0.08, 4.2);
      for (const lz of [-1.7, 1.7]) b.box('woodDark', tx, 0.37, tz + lz, 0.9, 0.74, 0.1, { collide: false });
      for (const s of [-1, 1]) {
        b.box('woodDark', tx + s * 0.85, 0.44, tz, 0.32, 0.06, 4.2, { collide: false });
        this.phys.box(tx + s * 0.85, 0.22, tz, 0.16, 0.22, 2.1, 0, { paint: false, mat: 'wood' });
        for (let k = 0; k < 4; k++) {
          const seat = { x: tx + s * 0.85, y: 0.5, z: tz - 1.5 + k, yaw: s > 0 ? -Math.PI / 2 : Math.PI / 2, table: true };
          this.c.seats.push(seat);
          this.spots.tables.push(seat);
        }
      }
      // jarras y platos sobre la mesa
      for (let k = 0; k < 5; k++) b.cylinder('glass', tx + (this.r() - 0.5) * 0.5, 0.88, tz - 1.6 + k * 0.8, 0.045, 0.04, 0.16, 10, { collide: false });
    }
  }
  _bottles(x, z) {
    const cols = [0x2a4a1c, 0x5a2a0a, 0x0e2a3a, 0x3a0a0a];
    const geo = new THREE.CylinderGeometry(0.035, 0.035, 0.26, 8).translate(0, 0.13, 0);
    const neck = new THREE.CylinderGeometry(0.012, 0.03, 0.1, 8).translate(0, 0.31, 0);
    const g = mergeSimple([geo, neck]);
    for (let k = 0; k < cols.length; k++) {
      const pts = [];
      for (let i = k; i < 36; i += cols.length) pts.push([x - 2.1 + (i % 18) * 0.24, i < 18 ? 1.63 : 2.13, z]);
      const im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: cols[k], roughness: 0.15, metalness: 0.1 }), pts.length);
      const M = new THREE.Matrix4();
      pts.forEach(([px, py, pz], i) => im.setMatrixAt(i, M.makeTranslation(px, py, pz)));
      this.scene.add(im);
    }
  }

  // ---------------------------------------------------------------- fogata con troncos para sentarse
  _bonfire(x, z) {
    const d = this.d;
    d.place('c_firepit', x, 0, z, 0, 1.1);
    this.c.fire3d(x, 0.18, z, 0.45, 0.45, 1.2, { intensity: 1.1 });
    d.world?.embers?.add(x, 0.4, z, 12, { radius: 0.4, height: 2.2, strength: 0.8 });
    d.world?.smoke?.add(x, 1.2, z, 8, { radius: 0.4, height: 3, opacity: 0.12, speed: 0.25 });
    this.c.light(x, 1.1, z, 0xff7a30, 9, 14, { flicker: true, priority: 1.8, shadow: true, decay: 1.5 });
    this.phys.cylinder(x, 0.25, z, 0.25, 0.75, { mat: 'stone' });
    this.spots.bonfire = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4, R = 2.4;
      const lx = x + Math.sin(a) * R, lz = z + Math.cos(a) * R, yaw = a + Math.PI; // mirando al fuego
      d.place('c_logbench', lx, 0, lz, yaw + Math.PI / 2, 1);
      this.phys.box(lx, 0.22, lz, 0.9, 0.22, 0.22, yaw + Math.PI / 2, { paint: false, mat: 'wood' });
      for (const off of [-0.45, 0.45]) {
        const sx = lx + Math.cos(yaw) * off, sz = lz - Math.sin(yaw) * off;
        const seat = { x: sx, y: 0.48, z: sz, yaw };
        this.c.seats.push(seat);
        this.spots.bonfire.push(seat);
      }
    }
  }

  update(t) {
    // guirnaldas: alguna lamparita que tiembla
    for (const im of this.bulbs) im.material.emissiveIntensity = 2.0 + Math.sin(t * 7.3) * 0.08 + (Math.sin(t * 31) > 0.97 ? -0.8 : 0);
  }
}

function mergeSimple(list) {
  // une geometrías indexadas sencillas (mismos atributos)
  const pos = [], nor = [], uv = [], idx = [];
  let off = 0;
  for (const g of list) {
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); uv.push(u.getX(i), u.getY(i)); }
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i++) idx.push(ix[i] + off);
    off += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}
