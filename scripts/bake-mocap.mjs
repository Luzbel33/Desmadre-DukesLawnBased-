// Hornea animaciones de captura de movimiento (GLB con esqueleto estilo Unreal: Quaternius Universal Animation
// Library, CC0) al esqueleto virtual de 11 articulaciones del juego (char/character.js), más pies y dedos del pie.
//
// Idea: el juego define cada articulación virtual como "cuánto giró ese hueso respecto de la pose neutra" (brazos
// colgando, piernas rectas: ver buildMeta en char/human.js). Si ponemos el esqueleto de la animación en esa misma
// pose neutra, la rotación en mundo de cada hueso animado por la inversa de su rotación neutra ES la rotación virtual
// en mundo; de ahí salen las locales (Euler YXZ, como las usa el animador) sin depender de cómo esté armado cada
// esqueleto ni de su pose de reposo.
//
// Uso: node --loader ./tests/loader.mjs scripts/bake-mocap.mjs <UAL1_Standard.glb> <UAL1_Standard_RM.glb> <salida.json>
import fs from 'node:fs';
import { Quaternion, Vector3, Euler, Matrix4 } from 'three';

const [, , SRC, SRC_RM, OUT] = process.argv;
const FPS = 30;

function readGlb(path) {
  const b = fs.readFileSync(path);
  const jl = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jl).toString('utf8'));
  const bo = 20 + jl;
  const bl = b.readUInt32LE(bo);
  const bin = b.subarray(bo + 8, bo + 8 + bl);
  const acc = (i) => {
    const a = json.accessors[i], v = json.bufferViews[a.bufferView];
    const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    if (a.componentType !== 5126) throw new Error('accessor no float');
    const off = (v.byteOffset || 0) + (a.byteOffset || 0), stride = v.byteStride || n * 4;
    const out = new Float32Array(a.count * n);
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = bin.readFloatLE(off + k * stride + c * 4);
    return { data: out, n, count: a.count };
  };
  return { json, acc };
}

function skeleton(glb) {
  const { json } = glb;
  const nodes = json.nodes.map((n, i) => ({
    i, name: n.name || 'n' + i, parent: -1,
    t: new Vector3(...(n.translation || [0, 0, 0])),
    r: new Quaternion(...(n.rotation || [0, 0, 0, 1])),
    s: new Vector3(...(n.scale || [1, 1, 1])),
  }));
  json.nodes.forEach((n, i) => (n.children || []).forEach((c) => { nodes[c].parent = i; }));
  const byName = Object.fromEntries(nodes.map((n) => [n.name, n]));
  // orden padres antes que hijos
  const order = [];
  const seen = new Set();
  const visit = (n) => { if (seen.has(n.i)) return; if (n.parent >= 0) visit(nodes[n.parent]); seen.add(n.i); order.push(n); };
  nodes.forEach(visit);
  return { nodes, byName, order };
}

// pose: arrays de t/r/s locales por nodo -> mundo (matrices y cuaterniones)
function world(sk, pose) {
  const M = [], Q = [], P = [];
  const m = new Matrix4();
  for (const n of sk.order) {
    m.compose(pose.t[n.i], pose.r[n.i], pose.s[n.i]);
    M[n.i] = n.parent >= 0 ? new Matrix4().multiplyMatrices(M[n.parent], m) : m.clone();
    const q = new Quaternion(), p = new Vector3(), s = new Vector3();
    M[n.i].decompose(p, q, s);
    Q[n.i] = q; P[n.i] = p;
  }
  return { M, Q, P };
}
const restPose = (sk) => ({ t: sk.nodes.map((n) => n.t.clone()), r: sk.nodes.map((n) => n.r.clone()), s: sk.nodes.map((n) => n.s.clone()) });

// gira un hueso (en mundo) para que su dirección hacia `child` sea `dir` (igual que aimBone de human.js)
function aim(sk, pose, bone, child, dir) {
  const W = world(sk, pose);
  const b = sk.byName[bone], c = sk.byName[child];
  const from = W.P[c.i].clone().sub(W.P[b.i]).normalize();
  const rot = new Quaternion().setFromUnitVectors(from, dir.clone().normalize());
  const wq = W.Q[b.i].clone().premultiply(rot);
  const pq = b.parent >= 0 ? W.Q[b.parent].clone() : new Quaternion();
  pose.r[b.i].copy(pq.invert().multiply(wq));
}

const src = readGlb(SRC);
const sk = skeleton(src);
const need = ['pelvis', 'spine_03', 'Head', 'upperarm_l', 'lowerarm_l', 'upperarm_r', 'lowerarm_r', 'thigh_l', 'calf_l', 'thigh_r', 'calf_r', 'foot_l', 'foot_r', 'ball_l', 'ball_r', 'hand_l', 'middle_01_l'];
for (const n of need) if (!sk.byName[n]) throw new Error('falta hueso ' + n);

// marco del personaje: Y arriba, mirando a +Z, su izquierda en +X (como los modelos del juego)
const rest = restPose(sk);
const W0 = world(sk, rest);
const P = (n) => W0.P[sk.byName[n].i];
const leftX = P('upperarm_l').x - P('upperarm_r').x, fwdZ = P('ball_l').z - P('foot_l').z;
console.log('izquierda en +X:', leftX > 0, ' mira a +Z:', fwdZ > 0, ' cadera', P('pelvis').toArray().map((v) => +v.toFixed(3)));
// corrección (si el esqueleto mira para otro lado): giro en Y
let C = new Quaternion();
if (fwdZ < 0) C.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI);
const Ci = C.clone().invert();
const toChar = (q) => C.clone().multiply(q).multiply(Ci); // delta en el marco del personaje
void toChar;

// pose neutra (las mismas direcciones que buildMeta de human.js, en el marco del personaje)
const neutral = restPose(sk);
const dirC = (x, y, z) => new Vector3(x, y, z).applyQuaternion(Ci);
aim(sk, neutral, 'upperarm_l', 'lowerarm_l', dirC(0.1, -1, 0));
aim(sk, neutral, 'lowerarm_l', 'hand_l', dirC(0.04, -1, 0.07));
aim(sk, neutral, 'upperarm_r', 'lowerarm_r', dirC(-0.1, -1, 0));
aim(sk, neutral, 'lowerarm_r', 'hand_r', dirC(-0.04, -1, 0.07));
aim(sk, neutral, 'hand_l', 'middle_01_l', dirC(0.02, -1, 0.04));
aim(sk, neutral, 'hand_r', 'middle_01_r', dirC(-0.02, -1, 0.04));
aim(sk, neutral, 'thigh_l', 'calf_l', dirC(0.015, -1, 0));
aim(sk, neutral, 'thigh_r', 'calf_r', dirC(-0.015, -1, 0));
aim(sk, neutral, 'calf_l', 'foot_l', dirC(0, -1, -0.03));
aim(sk, neutral, 'calf_r', 'foot_r', dirC(0, -1, -0.03));
const WN = world(sk, neutral);
const QN = (n) => WN.Q[sk.byName[n].i];
const hipH = WN.P[sk.byName.pelvis.i].y - Math.min(WN.P[sk.byName.ball_l.i].y, WN.P[sk.byName.foot_l.i].y) + 0.03;
console.log('altura de cadera (neutra):', hipH.toFixed(3));

// virtual j -> hueso de la animación
const VB = ['pelvis', 'spine_03', 'Head', 'upperarm_l', 'lowerarm_l', 'upperarm_r', 'lowerarm_r', 'thigh_l', 'calf_l', 'thigh_r', 'calf_r'];
const PARENT = [-1, 0, 1, 1, 3, 1, 5, 0, 7, 0, 9];

// Euler YXZ con continuidad: de las dos soluciones equivalentes, la más cercana al cuadro anterior (las rodillas
// pasan de 90°, que es justo la singularidad de esa descomposición)
const E = new Euler();
function euler(q, prev) {
  E.setFromQuaternion(q, 'YXZ');
  let a = [E.x, E.y, E.z];
  const sgn = (v) => (v >= 0 ? 1 : -1);
  const b = [Math.PI - E.x, E.y - Math.PI * sgn(E.y), E.z - Math.PI * sgn(E.z)];
  // Equivalent bends must stay in the anatomical interval across clips too.
  // 4.1 rad is the same crouch as -2.18 rad, but blending it from idle folds the leg backwards.
  const wrap = (v) => { while (v > Math.PI) v -= Math.PI * 2; while (v < -Math.PI) v += Math.PI * 2; return v; };
  b[0] = wrap(b[0]);
  const cost = (s) => prev ? Math.abs(s[0] - prev[0]) + Math.abs(s[1] - prev[1]) + Math.abs(s[2] - prev[2]) : Math.abs(s[1]) + Math.abs(s[2]);
  if (cost(b) < cost(a)) a = b;
  return a;
}

function sampleClip(glb, sk2, anim, t) {
  const pose = restPose(sk2);
  for (const ch of anim.channels) {
    const node = ch.target.node, path = ch.target.path;
    const s = anim.samplers[ch.sampler];
    const tin = glb.acc(s.input).data, out = glb.acc(s.output);
    let k = 0;
    while (k < tin.length - 2 && tin[k + 1] <= t) k++;
    const t0 = tin[k], t1 = tin[Math.min(k + 1, tin.length - 1)];
    const f = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 0;
    const n = out.n, d = out.data, i0 = k * n, i1 = Math.min(k + 1, tin.length - 1) * n;
    if (path === 'rotation') {
      const qa = new Quaternion(d[i0], d[i0 + 1], d[i0 + 2], d[i0 + 3]), qb = new Quaternion(d[i1], d[i1 + 1], d[i1 + 2], d[i1 + 3]);
      pose.r[node].copy(qa.slerp(qb, f));
    } else if (path === 'translation') {
      pose.t[node].set(d[i0] + (d[i1] - d[i0]) * f, d[i0 + 1] + (d[i1 + 1] - d[i0 + 1]) * f, d[i0 + 2] + (d[i1 + 2] - d[i0 + 2]) * f);
    } else if (path === 'scale') {
      pose.s[node].set(d[i0] + (d[i1] - d[i0]) * f, d[i0 + 1] + (d[i1 + 1] - d[i0 + 1]) * f, d[i0 + 2] + (d[i1 + 2] - d[i0 + 2]) * f);
    }
  }
  return pose;
}
// el acceso a accessors se cachea (cada canal se lee muchas veces)
function cacheAcc(glb) { const c = new Map(); const raw = glb.acc; glb.acc = (i) => { if (!c.has(i)) c.set(i, raw(i)); return c.get(i); }; }
cacheAcc(src);

const LOOPS = /_Loop$|^Sword_Idle$/;
const USED = new Set(['Idle_Loop', 'Idle_Talking_Loop', 'Walk_Loop', 'Walk_Formal_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Crouch_Idle_Loop', 'Crouch_Fwd_Loop']);
const r3 = (v) => Math.round(v * 1000) / 1000;
const clips = {};
// velocidad natural de cada ciclo: con la versión con root motion (lo que avanza la raíz por segundo)
const rm = SRC_RM ? readGlb(SRC_RM) : null;
if (rm) cacheAcc(rm);
const skRM = rm ? skeleton(rm) : null;

for (const anim of src.json.animations) {
  const name = anim.name;
  if (!USED.has(name)) continue;
  let dur = 0;
  for (const s of anim.samplers) { const tin = src.acc(s.input).data; dur = Math.max(dur, tin[tin.length - 1]); }
  const loop = LOOPS.test(name);
  const nf = Math.max(2, Math.round(dur * FPS) + (loop ? 0 : 1));
  const frames = [];
  let prev = null;
  const pelv0 = WN.P[sk.byName.pelvis.i];
  let footFwdBest = -1e9, phase0 = 0;
  for (let f = 0; f < nf; f++) {
    const t = Math.min(dur, f / FPS);
    const W = world(sk, sampleClip(src, sk, anim, t));
    const Q = (n) => W.Q[sk.byName[n].i];
    const D = (n) => C.clone().multiply(Q(n)).multiply(QN(n).clone().invert()).multiply(Ci); // delta en el marco del personaje
    const V = VB.map(D);
    const L = V.map((v, j) => (PARENT[j] < 0 ? v.clone() : V[PARENT[j]].clone().invert().multiply(v)));
    const row = [];
    const cur = [];
    L.forEach((q, j) => { const e = euler(q, prev?.[j]); cur.push(e); row.push(...e.map(r3)); });
    // cadera: desplazamiento respecto de la neutra, en altos de cadera (el juego lo escala a su personaje)
    const pp = W.P[sk.byName.pelvis.i].clone().sub(pelv0).applyQuaternion(C).multiplyScalar(1 / hipH);
    row.push(r3(pp.x), r3(pp.y), r3(pp.z));
    // pies (respecto de la pierna virtual) y puntas (respecto del pie)
    const fl = D('foot_l'), fr = D('foot_r'), bl = D('ball_l'), br = D('ball_r');
    const FL = V[8].clone().invert().multiply(fl), FR = V[10].clone().invert().multiply(fr);
    const BL = fl.clone().invert().multiply(bl), BR = fr.clone().invert().multiply(br);
    for (const [q, k] of [[FL, 11], [FR, 12], [BL, 13], [BR, 14]]) { const e = euler(q, prev?.[k]); cur.push(e); row.push(...e.map(r3)); }
    prev = cur;
    frames.push(row);
    // fase 0 del ciclo: el pie izquierdo bien adelante (para sincronizar caminar/trotar/correr entre sí)
    const fz = W.P[sk.byName.foot_l.i].clone().sub(W.P[sk.byName.pelvis.i]).applyQuaternion(C).z;
    if (loop && fz > footFwdBest) { footFwdBest = fz; phase0 = f / nf; }
  }
  let speed = 0;
  if (rm && loop) {
    const a2 = rm.json.animations.find((a) => a.name === name);
    if (a2) {
      const p0 = world(skRM, sampleClip(rm, skRM, a2, 0)), p1 = world(skRM, sampleClip(rm, skRM, a2, dur));
      const root = skRM.byName.root || skRM.byName.pelvis;
      const d = p1.P[root.i].clone().sub(p0.P[root.i]);
      speed = Math.hypot(d.x, d.z) / dur / hipH; // en altos de cadera por segundo
    }
  }
  clips[name] = { dur: r3(dur), loop, speed: r3(speed), phase0: r3(phase0), frames };
  console.log(name.padEnd(24), 'dur', dur.toFixed(2), 'frames', nf, loop ? 'loop' : '', speed ? 'speed ' + (speed * 0.95).toFixed(2) + ' m/s (cadera .95)' : '', 'fase0', phase0.toFixed(2));
}

fs.writeFileSync(OUT, JSON.stringify({ fps: FPS, src: 'Quaternius Universal Animation Library (CC0)', layout: '11 articulaciones x3 (Euler YXZ), cadera xyz (en altos de cadera), pie L, pie R, punta L, punta R (x3)', clips }));
console.log('ok', OUT, (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB');
