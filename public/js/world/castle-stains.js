// Dónde se ensucia el castillo: filtraciones que bajan del cielorraso, humedad que sube del piso, hollín sobre
// cada antorcha y chimenea, moho, mugre y rajaduras sueltas; y la sangre, que cuenta lo que pasó en cada cuarto
// (la cocina, el arrastre del comedor, el altar del cuarto secreto, las manos contra la puerta).
import { Stains, STAIN as S } from './stains.js';
import { CASTLE } from '../shared/mapdata.js';
import { rng } from '../core/G.js';

const F0 = CASTLE.keep.floor; // 3.5
const F1 = 10; // cielorraso de los cuartos laterales
const KZ1 = CASTLE.keep.z1, KX0 = CASTLE.keep.x0, KX1 = CASTLE.keep.x1;
const IX0 = KX0 + 1.2, IX1 = KX1 - 1.2, IZ0 = CASTLE.keep.z0 + 1.2, IZ1 = KZ1 - 1.2;
const FL = F0 + 0.024; // piso de los cuartos (arriba de las lajas / tablas)

// caras de pared: axis 'z' = plano z = c (corre en x); axis 'x' = plano x = c (corre en z).
// n: signo de la normal; [a0, a1] tramo; [y0, y1] alto; holes: [a0, a1, y0, y1] (puertas, ventanas, chimeneas)
const W = (x0, x1) => [x0, x1, 5, 8.6];
const DOOR = (a0, a1, h = 3.2) => [a0, a1, F0 - 0.1, F0 + h];
const FACES = [
  // comedor
  { axis: 'x', c: IX0, n: 1, a0: -114.7, a1: -104.5, y0: F0, y1: F1, holes: [W(-106.95, -105.45), W(-113.55, -112.05), [-111, -108, F0, F0 + 2.3]] },
  { axis: 'z', c: IZ1, n: -1, a0: -23.5, a1: -8.6, y0: F0, y1: F1, holes: [W(-21.25, -19.75), W(-13.25, -11.75)] },
  { axis: 'x', c: -8.3, n: -1, a0: -114.7, a1: -104.5, y0: F0, y1: F1, holes: [DOOR(-107.1, -104.9)] },
  { axis: 'z', c: -114.7, n: 1, a0: -23.5, a1: -8.6, y0: F0, y1: F1, holes: [DOOR(-17.1, -14.9), [-13, -11.3, F0, F0 + 2.5]] },
  // cocina
  { axis: 'x', c: IX0, n: 1, a0: -125.5, a1: -115.3, y0: F0, y1: F1, holes: [W(-119.25, -117.75), [-124.9, -121.5, F0, F0 + 2.8]] },
  { axis: 'z', c: IZ0, n: 1, a0: -23.5, a1: -8.6, y0: F0, y1: F1, holes: [W(-21.25, -19.75), W(-13.25, -11.75)] },
  { axis: 'x', c: -8.3, n: -1, a0: -125.5, a1: -115.3, y0: F0, y1: F1, holes: [DOOR(-122.6, -120.4)] },
  { axis: 'z', c: -115.3, n: -1, a0: -23.5, a1: -8.6, y0: F0, y1: F1, holes: [DOOR(-17.1, -14.9)] },
  // biblioteca (los estantes tapan lo de abajo: solo filtraciones desde arriba)
  { axis: 'x', c: IX1, n: -1, a0: -114.7, a1: -104.5, y0: F0, y1: F1, holes: [W(-106.35, -104.85), [-113, -110, F0, F0 + 2.3]] },
  { axis: 'z', c: IZ1, n: -1, a0: 8.6, a1: 23.5, y0: F0, y1: F1, holes: [W(11.75, 13.25), W(19.75, 21.25), [15.6, 17.4, F0, F0 + 2.6]] },
  { axis: 'x', c: 8.3, n: 1, a0: -114.7, a1: -104.5, y0: F0, y1: F1, holes: [DOOR(-110.6, -108.4), [-106.8, -105, F0, F0 + 2.6], [-113.8, -112, F0, F0 + 2.6]] },
  { axis: 'z', c: -114.7, n: 1, a0: 8.6, a1: 23.5, y0: 6.3, y1: F1, holes: [] },
  // cuarto secreto
  { axis: 'z', c: IZ0, n: 1, a0: 8.6, a1: 20.3, y0: F0, y1: F1, holes: [[11.4, 14.6, F0, F0 + 1.1], [17.2, 18.4, F0, F0 + 0.7]] },
  { axis: 'x', c: 8.3, n: 1, a0: -125.5, a1: -115.3, y0: F0, y1: F1, holes: [] },
  { axis: 'z', c: -115.3, n: -1, a0: 8.6, a1: 20.3, y0: F0, y1: F1, holes: [DOOR(15.6, 17.4, 2.7)] },
  // sala de los retratos
  { axis: 'z', c: IZ0, n: 1, a0: -7.4, a1: 7.4, y0: F0, y1: F1, holes: [W(-4.75, -3.25), W(3.25, 4.75), [-4.6, -3.2, F0 + 1.2, F0 + 2.2], [3.2, 4.6, F0 + 1.2, F0 + 2.2]] },
  { axis: 'x', c: -7.7, n: 1, a0: -125.5, a1: -117.4, y0: F0, y1: F1, holes: [DOOR(-122.6, -120.4), [-124.8, -123.4, F0 + 1.2, F0 + 2.2], [-119.9, -118.5, F0 + 1.2, F0 + 2.2]] },
  { axis: 'x', c: 7.7, n: -1, a0: -125.5, a1: -117.4, y0: F0, y1: F1, holes: [[-124.3, -122.9, F0 + 1.2, F0 + 2.2], [-120.5, -119.1, F0 + 1.2, F0 + 2.2]] },
  { axis: 'z', c: -117.1, n: -1, a0: -7.4, a1: 7.4, y0: F0, y1: F1, holes: [DOOR(1.8, 4.2)] },
  // salón (alto: el cielorraso está a 16,2)
  { axis: 'z', c: IZ1, n: -1, a0: -7.4, a1: 7.4, y0: F0, y1: 16.2, holes: [DOOR(-1.8, 1.8, 5.2), [-5.8, -4.2, 5, 14.6], [4.2, 5.8, 5, 14.6], [-3.2, 3.2, F0, F0 + 1.5]] },
  { axis: 'x', c: -7.7, n: 1, a0: -116.2, a1: -104.5, y0: F0, y1: 16.2, holes: [DOOR(-107.1, -104.9), [-114.2, -108.2, F0 + 1.8, F0 + 5.3]] },
  { axis: 'x', c: 7.7, n: -1, a0: -116.2, a1: -104.5, y0: F0, y1: 16.2, holes: [DOOR(-110.6, -108.4), [-107.3, -105.3, F0, F0 + 2.3], [-113.2, -112, F0, F0 + 2.5]] },
  { axis: 'z', c: -116.5, n: 1, a0: -7.4, a1: 7.4, y0: F0, y1: 16.2, holes: [DOOR(1.8, 4.2), [-7.4, 7.4, 7.7, 8.3], [-0.6, 1.4, F0 + 7.8, F0 + 10.3]] },
  // cripta (0 .. 3,2)
  { axis: 'x', c: 8.3, n: 1, a0: -125.5, a1: -104.5, y0: 0, y1: 3.2, holes: [[-110.8, -109.2, 0, 1], [-122.3, -120.7, 0, 1]], crypt: true },
  { axis: 'x', c: IX1 - 0.06, n: -1, a0: -116, a1: -104.5, y0: 0, y1: 3.2, holes: [[-109.6, -107.2, 0, 2.7]], crypt: true },
  { axis: 'z', c: IZ1 - 0.06, n: -1, a0: 8.6, a1: 23.5, y0: 0, y1: 3.2, holes: [], crypt: true },
  { axis: 'z', c: IZ0 + 0.06, n: 1, a0: 8.6, a1: 20.5, y0: 0, y1: 3.2, holes: [], crypt: true },
];

export function stainCastle(castle) {
  const st = new Stains(castle.scene, 1100);
  const r = rng(9191);
  const pos = (f, a, y) => (f.axis === 'z' ? [a, y, f.c] : [f.c, y, a]);
  const nrm = (f) => (f.axis === 'z' ? [0, 0, f.n] : [f.n, 0, 0]);
  const hit = (f, a, y, w, h) => f.holes.find(([h0, h1, y0, y1]) => a + w / 2 > h0 - 0.05 && a - w / 2 < h1 + 0.05 && y + h / 2 > y0 - 0.05 && y - h / 2 < y1 + 0.05);
  const put = (cell, f, a, y, w, h, o = {}) => st.add(cell, ...pos(f, a, y), ...nrm(f), w, h, o);

  for (const f of FACES) {
    const tall = f.y1 - f.y0;
    // filtraciones que bajan del cielorraso (si hay una ventana abajo, se cortan antes)
    for (let a = f.a0 + 0.6 + r() * 1.4; a < f.a1 - 0.6; a += 2.1 + r() * 2.4) {
      const w = 1.2 + r() * 1.3;
      let h = Math.min(tall * 0.7, (f.crypt ? 1.2 : 1.6) + r() * 1.8);
      let y = f.y1 - h / 2 - 0.02;
      const o = hit(f, a, y, w, h);
      if (o) {
        h = f.y1 - 0.02 - (o[3] + 0.08);
        if (h < 0.7) continue;
        y = f.y1 - h / 2 - 0.02;
        if (hit(f, a, y, w, h)) continue;
      }
      put(S.leak1 + Math.floor(r() * 3), f, a, y, w, h, { opacity: 0.55 + r() * 0.4, flip: r() < 0.5, tint: f.crypt ? [0.55, 0.62, 0.5] : [0.6, 0.6, 0.56] });
    }
    // humedad que sube del piso
    if (f.y0 < F0 + 0.5 || f.crypt) {
      for (let a = f.a0 + 0.9; a < f.a1 - 0.5; a += 1.9 + r() * 1.6) {
        const w = 2 + r() * 1.5, h = (f.crypt ? 1.1 : 0.8) + r() * 0.7, y = f.y0 + h / 2 - 0.03;
        if (hit(f, a, y, w, h)) continue;
        put(S.damp, f, a, y, w, h, { opacity: 0.5 + r() * 0.35, flip: r() < 0.5, tint: f.crypt ? [0.62, 0.7, 0.58] : [0.72, 0.7, 0.66] });
      }
    }
    // mugre, moho y rajaduras sueltas
    const k = Math.max(1, Math.round((f.a1 - f.a0) / 4.5));
    for (let i = 0; i < k; i++) {
      const a = f.a0 + 0.6 + r() * (f.a1 - f.a0 - 1.2);
      const kind = r();
      const cell = kind < 0.4 ? S.grime : kind < (f.crypt ? 0.85 : 0.7) ? S.mold : S.crack;
      const w = cell === S.crack ? 0.9 + r() * 0.8 : 0.9 + r() * 1.3;
      const h = cell === S.crack ? w * 1.6 : w;
      const y = f.y0 + 0.8 + r() * Math.max(0.2, Math.min(tall, 6) - 1.6);
      if (hit(f, a, y, w, h) || y + h / 2 > f.y1) continue;
      put(cell, f, a, y, w, h, { opacity: 0.45 + r() * 0.4, rot: (r() - 0.5) * 0.5, flip: r() < 0.5 });
    }
  }

  // ---------------------------------------------------------------- hollín: antorchas, candeleros y chimeneas
  for (const [x, y, z, nx, nz, big] of castle.soot || []) {
    const w = big ? 1.0 : 0.55, h = big ? 1.9 : 1.0;
    st.add(S.soot, x, y + h / 2 - 0.15, z, nx, 0, nz, w, h, { opacity: big ? 0.8 : 0.55 });
  }
  st.add(S.soot, IX0, F0 + 3.4, -109.5, 1, 0, 0, 2.3, 2.6, { opacity: 0.65 });
  st.add(S.soot, IX1, F0 + 3.4, -111.5, -1, 0, 0, 2.3, 2.6, { opacity: 0.65 });
  st.add(S.soot, IX0, F0 + 4.0, -123.2, 1, 0, 0, 2.8, 2.8, { opacity: 0.8 });

  // ---------------------------------------------------------------- afuera: chorreado bajo los alféizares y humedad al pie
  for (const x of [-20.5, -12.5, 12.5, 20.5, -5, 5]) {
    st.add(S.leak1 + Math.floor(r() * 3), x, 3.9, KZ1 + 0.01, 0, 0, 1, 1.5, 1.9, { opacity: 0.55, flip: r() < 0.5, off: 0.02 });
  }
  for (let x = -24; x < 24; x += 2.6 + r() * 1.5) {
    if (Math.abs(x) < 5) continue;
    // zócalo (sobresale 25 cm) y el muro encima
    st.add(S.damp, x, 0.45, KZ1 + 0.25, 0, 0, 1, 2.6, 0.9, { opacity: 0.55, flip: r() < 0.5, tint: [0.8, 0.9, 0.75] });
    st.add(S.damp, x + 0.7, 1.4, KZ1, 0, 0, 1, 2.8, 1.1, { opacity: 0.4, flip: r() < 0.5, tint: [0.8, 0.9, 0.75] });
  }

  // ---------------------------------------------------------------- sangre: lo que pasó en cada cuarto
  const B = (cell, x, y, z, nx, ny, nz, w, h, o = {}) => st.add(cell, x, y, z, nx, ny, nz, w, h, { opacity: 0.92, ...o });
  const floor = (cell, x, z, w, h, rot = 0, o = {}) => B(cell, x, FL, z, 0, 1, 0, w, h, { rot, ...o });
  const along = (x0, z0, x1, z1) => Math.atan2(-(z1 - z0), x1 - x0);
  // cocina: el charco bajo la mesa de carnicero, salpicaduras, manos en el marco y las pisadas hacia el comedor
  floor(S.pool, -16, -121, 2.3, 1.9, 0.4);
  floor(S.pool, -16.42, -120.4, 0.8, 0.62, 0.9, { opacity: 0.95 }); // drip-pool: donde cae el goteo de la sábana (castle-corpse.js)
  floor(S.splat, -14.6, -122.3, 1.2, 1.2, 1.1, { opacity: 0.8 });
  B(S.splat, -15.6, F0 + 1.7, IZ0, 0, 0, 1, 1.7, 1.7);
  B(S.spray, IX0, F0 + 1.9, -120.6, 1, 0, 0, 2.1, 1.5, { flip: true });
  B(S.hands, -17.6, F0 + 1.35, -115.3, 0, 0, -1, 0.9, 0.9);
  for (let i = 0; i < 4; i++) floor(S.feet, -16.2 + (i % 2) * 0.12, -119.7 + i * 1.15, 0.62, 0.62, Math.PI, { opacity: 0.85 - i * 0.17 });
  // comedor: algo (alguien) arrastrado desde la cabecera hasta la puerta de la cocina
  const drag = [[-19.6, -110.6], [-18.6, -111.9], [-17.5, -113.2], [-16.5, -114.4]];
  for (let i = 0; i < drag.length - 1; i++) {
    const [x0, z0] = drag[i], [x1, z1] = drag[i + 1];
    floor(S.smear, (x0 + x1) / 2, (z0 + z1) / 2, 2.0, 1.0, along(x0, z0, x1, z1), { opacity: 0.9 - i * 0.12 });
  }
  floor(S.pool, -20.1, -109.7, 1.5, 1.3, 2.2);
  B(S.spray, -22.4, F0 + 1.9, IZ1, 0, 0, -1, 2.2, 1.5);
  // salón: manos contra la pared junto a la puerta (quiso salir), gotas desde el balcón
  B(S.hands, -2.9, F0 + 1.45, IZ1, 0, 0, -1, 0.95, 0.95);
  B(S.smear, -3.1, F0 + 0.9, IZ1, 0, 0, -1, 1.4, 0.7, { rot: -1.2, opacity: 0.8 });
  floor(S.splat, 2.2, -113.9, 0.9, 0.9, 0.3, { opacity: 0.7 });
  B(S.scratch, 7.7, F0 + 1.3, -114.4, -1, 0, 0, 1.0, 1.0, { opacity: 0.85 });
  // sala de los retratos: manos corridas bajo los cuadros, alguien que escribió contando días
  B(S.hands, 0, F0 + 1.3, IZ0, 0, 0, 1, 0.9, 0.9, { opacity: 0.75, rot: 0.2 });
  B(S.drips, -5.6, F0 + 3.2, -117.1, 0, 0, -1, 1.2, 1.4);
  floor(S.smear, -1.5, -121.5, 1.8, 0.9, 0.9, { opacity: 0.6 });
  // cuarto secreto: el altar
  B(S.splat, 13, F0 + 2.2, IZ0, 0, 0, 1, 2.4, 2.4);
  B(S.drips, 13, F0 + 0.55, -124.64, 0, 0, 1, 2.8, 0.9, { off: 0.004 });
  floor(S.pool, 13, -123.7, 2.1, 1.7, 0.2);
  B(S.scratch, 8.3, F0 + 1.1, -120.2, 1, 0, 0, 1.2, 1.2);
  B(S.hands, 8.3, F0 + 1.5, -123.3, 1, 0, 0, 0.9, 0.9, { opacity: 0.8, rot: -0.3 });
  floor(S.feet, 15.2, -118.4, 0.6, 0.6, 0.6, { opacity: 0.6 });
  floor(S.feet, 16.0, -116.9, 0.6, 0.6, 0.3, { opacity: 0.45 });
  // cripta: arañazos en la tumba del Conde (desde adentro...), manos en la pared de la reja
  B(S.scratch, 13.53, 0.5, -114.5, -1, 0, 0, 1.1, 0.75, { off: 0.006 });
  B(S.scratch, 14.87, 0.5, -114.0, 1, 0, 0, 1.0, 0.75, { off: 0.006, flip: true });
  B(S.hands, IX1 - 0.06, 1.3, -106.4, -1, 0, 0, 0.9, 0.9, { opacity: 0.8 });
  B(S.pool, 14.2, 0.07, -117.2, 0, 1, 0, 1.4, 1.1, { opacity: 0.7 });
  // patio: la horca
  B(S.pool, 31.4, 0.515, -90, 0, 1, 0, 1.3, 1.1, { opacity: 0.85 });
  B(S.drips, 30.4, 0.25, -88.39, 0, 0, 1, 1.4, 0.45, { off: 0.006, opacity: 0.8 });

  castle.stains = st.finish();
  return st;
}
