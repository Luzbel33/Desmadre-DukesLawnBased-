// Animaciones de captura de movimiento (Quaternius Universal Animation Library, CC0) horneadas al esqueleto virtual
// del juego (scripts/bake-mocap.mjs -> assets/anim/ual.json). Reemplazan el caminar/correr/estar parado hecho a mano:
// cada personaje mezcla parado, caminar, trotar y correr según su velocidad, sincronizados por fase (los pies de todos
// los ciclos pisan en el mismo momento), con la cadencia y el largo del paso ajustados a la velocidad real para que
// los pies no patinen ("stride warping", como los motores de los juegos grandes). Arriba de esto siguen las capas
// del animador (lo que tiene en la mano, piñas, mirar, apuntar, bailes...).
//
// Fila de cada cuadro: 11 articulaciones x3 (Euler YXZ, igual que J del animador), cadera xyz (en altos de cadera),
// pie izq, pie der, punta izq, punta der (x3, respecto de la pierna / del pie).
import { clamp } from '../core/G.js';

const ROW = 48;
export const MOCAP = { ready: false, clips: null };
let loading = null;
const REQUIRED = ['Idle_Loop', 'Idle_Talking_Loop', 'Walk_Loop', 'Walk_Formal_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Crouch_Idle_Loop', 'Crouch_Fwd_Loop'];

export function loadMocap(url = new URL('../../assets/anim/ual.json', import.meta.url)) {
  if (MOCAP.ready) return Promise.resolve(true);
  if (loading) return loading;
  if (typeof fetch !== 'function') return Promise.resolve(false);
  loading = fetch(url).then((r) => {
    if (!r.ok) throw new Error(`mocap HTTP ${r.status}`);
    return r.json();
  }).then((d) => {
    if (!(d.fps > 0)) throw new Error('invalid mocap FPS');
    const clips = {};
    for (const name of REQUIRED) {
      const c = d.clips?.[name];
      if (!c || !(c.dur > 0) || !Number.isFinite(c.speed) || !Number.isFinite(c.phase0) || !Array.isArray(c.frames) || c.frames.length < 2) throw new Error(`invalid mocap clip ${name}`);
      const nf = c.frames.length;
      const f = new Float32Array(nf * ROW);
      c.frames.forEach((row, i) => {
        if (row.length !== ROW || !row.every(Number.isFinite)) throw new Error(`invalid mocap frame ${name}:${i}`);
        f.set(row, i * ROW);
      });
      // promedio de cada valor en el ciclo (el centro alrededor del que se achica o se alarga el paso)
      const mean = new Float32Array(ROW);
      for (let i = 0; i < nf; i++) for (let k = 0; k < ROW; k++) mean[k] += f[i * ROW + k] / nf;
      clips[name] = { name, dur: c.dur, loop: c.loop, speed: c.speed, phase0: c.phase0, nf, f, mean, fps: d.fps };
    }
    MOCAP.clips = clips;
    MOCAP.ready = true;
    return true;
  }).catch((e) => { console.warn('mocap', e); return false; }).finally(() => { loading = null; });
  return loading;
}

// suma w * (pose del clip en u) en out. u: fase 0..1 (ciclos) o segundos (de una vez). warp: cuánto se alarga (>1) o
// se achica (<1) el paso respecto del de la animación
export function addClip(out, clip, u, w, warp = 1, loop = clip.loop) {
  if (w <= 1e-4) return;
  const nf = clip.nf, f = clip.f;
  let x;
  if (loop) { x = (((u + clip.phase0) % 1) + 1) % 1 * nf; }
  else x = clamp(u * clip.fps, 0, nf - 1);
  const i0 = Math.floor(x) % nf, i1 = loop ? (i0 + 1) % nf : Math.min(nf - 1, i0 + 1), a = x - Math.floor(x);
  const o0 = i0 * ROW, o1 = i1 * ROW, m = clip.mean;
  for (let k = 0; k < ROW; k++) {
    let v = f[o0 + k] + (f[o1 + k] - f[o0 + k]) * a;
    if (warp !== 1) {
      // el paso: la cadera (adelante/atrás) y los brazos acompañan; la rodilla un poco; el vaivén de la cadera también
      const s = k === 21 || k === 27 ? warp : k === 24 || k === 30 ? 0.7 + 0.3 * warp : k === 9 || k === 15 ? 0.55 + 0.45 * warp : k === 35 ? warp : 1;
      if (s !== 1) v = m[k] + (v - m[k]) * s;
    }
    out[k] += v * w;
  }
}

const NAMES = ['hips', 'spine', 'neck', 'shoulderL', 'elbowL', 'shoulderR', 'elbowR', 'hipL', 'kneeL', 'hipR', 'kneeR'];
const BUF = new Float32Array(ROW);

// Locomoción: llena J (11 articulaciones) y A.mc (cadera y pies) para un personaje que va a `spd` m/s.
// H: alto de cadera del personaje (m, ya con su escala). Devuelve false si todavía no cargó.
export function locomotion(A, st, dt, J, H) {
  if (!MOCAP.ready) return false;
  const C = MOCAP.clips;
  const spd = st.speed || 0;
  const crouch = !!st.crouch;
  const walkC = st.female ? C.Walk_Formal_Loop : C.Walk_Loop;
  const gaits = A.mcGaits || (A.mcGaits = [null, null, null]);
  gaits[0] = crouch ? C.Crouch_Fwd_Loop : walkC;
  gaits[1] = C.Jog_Fwd_Loop; gaits[2] = C.Sprint_Loop;
  const gaitCount = crouch ? 1 : 3;
  const idleC = crouch ? C.Crouch_Idle_Loop : st.talking ? C.Idle_Talking_Loop : C.Idle_Loop;
  // pesos: parado <-> en marcha; entre los modos de andar, transición lineal entre el final de uno y el comienzo del otro
  const move = clamp((spd - 0.12) / 0.5, 0, 1);
  const W = A.mcW || (A.mcW = [0, 0, 0]);
  for (let i = 0; i < 3; i++) W[i] = 0;
  if (gaitCount === 1) W[0] = 1;
  else {
    const s = spd;
    if (s <= 2.3) W[0] = 1;
    else if (s < 3) { const t = (s - 2.3) / 0.7; W[0] = 1 - t; W[1] = t; }
    else if (s <= 5) W[1] = 1;
    else if (s < 6.2) { const t = (s - 5) / 1.2; W[1] = 1 - t; W[2] = t; }
    else W[2] = 1;
  }
  // fase común: avanza a la cadencia mezclada; para atrás, el ciclo corre al revés
  const back = (A.dirF ?? 1) < -0.2 ? -1 : 1;
  let dphi = 0;
  const WARP = A.mcK || (A.mcK = [1, 1, 1]);
  const sMove = Math.max(spd, 0.35);
  for (let i = 0; i < gaitCount; i++) {
    if (W[i] <= 1e-4) continue;
    const c = gaits[i], v = Math.max(0.05, c.speed * H);
    const r = clamp(sMove / v, i === 0 ? 0.6 : 0.82, 1.3);
    WARP[i] = clamp(sMove / (r * v), 0.55, 1.3);
    dphi += W[i] * r / c.dur;
  }
  if (st.grounded !== false) A.mcPhase = ((A.mcPhase || 0) + back * dphi * dt * (move > 0 ? 1 : 0) + 1) % 1;
  A.mcIdle = (A.mcIdle ?? Math.random() * 10) + dt;
  // mezcla
  BUF.fill(0);
  if (move < 1) addClip(BUF, idleC, (A.mcIdle / idleC.dur) % 1, 1 - move);
  for (let i = 0; i < gaitCount; i++) addClip(BUF, gaits[i], A.mcPhase, W[i] * move, WARP[i]);
  for (let j = 0; j < 11; j++) { const a = J[NAMES[j]]; a[0] = BUF[j * 3]; a[1] = BUF[j * 3 + 1]; a[2] = BUF[j * 3 + 2]; }
  const mc = A.mc || (A.mc = { hx: 0, hy: 0, hz: 0, foot: { l: [0, 0, 0], r: [0, 0, 0], bl: [0, 0, 0], br: [0, 0, 0] }, on: 0 });
  mc.hx = BUF[33] * H; mc.hy = BUF[34] * H; mc.hz = BUF[35] * H;
  const F = mc.foot, smoothing = mc.on ? 1 - Math.exp(-dt * 18) : 1;
  // Match the joint filter: unsmoothed ankles would lead the shins by a frame during a step.
  for (let k = 0; k < 3; k++) {
    F.l[k] += (BUF[36 + k] - F.l[k]) * smoothing;
    F.r[k] += (BUF[39 + k] - F.r[k]) * smoothing;
    F.bl[k] += (BUF[42 + k] - F.bl[k]) * smoothing;
    F.br[k] += (BUF[45 + k] - F.br[k]) * smoothing;
  }
  mc.on = 1;
  return true;
}
