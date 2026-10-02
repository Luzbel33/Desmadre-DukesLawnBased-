// Baile de caño (y de jaula): rutinas enteras al compás del club, hechas de movimientos con curvas suaves y
// transiciones de tiempo y medio entre uno y otro (nada de poses al azar que cambian de golpe).
// El reloj es en TIEMPOS (beats), no en segundos: el rol de la bailarina (game/club.js) pone st.emoteT = tiempo
// del club, así la cadera marca el bombo. De acá salen las dos cosas que tienen que coincidir:
//   polePose(J, beat, addY) -> la pose (character.js, emote 'pole')
//   polePlace(beat)         -> dónde está respecto del caño (ángulo, de qué lado lo tiene, altura, qué mano agarra)
// El rol después corre el cuerpo para que el puño que agarra quede justo en el caño.
//
// Convenciones de las articulaciones (character.js): x > 0 inclina hacia adelante (en piernas y brazos, x < 0 los
// lleva adelante; rodillas x > 0 doblan); z > 0 lleva lo que cuelga hacia la izquierda de ella (hombro izq. afuera)
// y lo que apunta arriba hacia su derecha; y > 0 gira a su izquierda.

const TAU = Math.PI * 2;
const JN = ['hips', 'spine', 'neck', 'shoulderL', 'elbowL', 'shoulderR', 'elbowR', 'hipL', 'kneeL', 'hipR', 'kneeR'];
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
// sube de 0 a 1 entre a y b, y vuelve a 0 entre c y d (todo suave)
const env = (x, a, b, c, d) => ease((x - a) / (b - a)) * (1 - ease((x - c) / (d - c)));
const S = (b, period, ph = 0) => Math.sin(TAU * (b / period + ph));

function blank() {
  const P = { y: 0 };
  for (const n of JN) P[n] = [0, 0, 0];
  return P;
}
function mix(A, B, w, out = blank()) {
  for (const n of JN) for (let i = 0; i < 3; i++) out[n][i] = lerp(A[n][i], B[n][i], w);
  out.y = lerp(A.y, B.y, w);
  return out;
}
// la cadera se ladea (peso en una pierna) sin que los pies se vayan de abajo del cuerpo
function roll(P, a) { P.hips[2] += a; P.hipL[2] -= a; P.hipR[2] -= a; }

// ajustes finos de brazos y piernas, resueltos numéricamente sobre el modelo (manos una arriba de la otra sobre el
// caño, el muslo del gancho abrazándolo, el cuerpo sin atravesarlo): se suman a la pose de cada movimiento
const FIT = {
  CHAIR: { elbowL: [0.195, 0, 0], elbowR: [0.067, 0, 0], shoulderL: [0.07, -0.891, -0.539], shoulderR: [0.227, 0, 0.047], spine: [0, -0.145, 0.018] },
  WAVE0: { elbowL: [0.164, 0, 0], elbowR: [0.336, 0, 0], shoulderL: [0.563, -0.406, -0.008], shoulderR: [0.25, 0.031, 0] },
  WAVE1: { elbowL: [0.008, 0, 0], shoulderL: [0.313, -0.359, -0.25], shoulderR: [0, 0.078, 0] },
  BACK0: { elbowL: [-0.159, 0, 0], elbowR: [-0.19, 0, 0], shoulderL: [-0.676, 0.731, -0.516], shoulderR: [-0.269, -0.191, 0.5], spine: [-0.228, 0, 0] },
  BACK1: { elbowL: [0.128, 0, 0], elbowR: [-0.083, 0, 0], shoulderL: [-0.783, 0.625, -0.688], shoulderR: [-0.264, -0.144, 0.456], spine: [-0.304, 0, 0] },
  HOOK: { elbowR: [-0.25, 0, 0], hipR: [0.438, -0.258, -0.5], kneeR: [0.109, 0, 0], shoulderR: [0.492, 0, 0.273], spine: [0, 0, 0.25] },
};
// suma el ajuste A (o la mezcla de A y B con peso w), escalado por k
function fit(P, A, k = 1, B = null, w = 0) {
  for (const n of JN) {
    const a = A[n], b = B?.[n];
    if (!a && !b) continue;
    for (let i = 0; i < 3; i++) P[n][i] += ((a ? a[i] : 0) * (1 - w) + (b ? b[i] : 0) * w) * k;
  }
}

// ---------------------------------------------------------------- los movimientos (b = tiempo dentro del movimiento)
// cada uno: { len (tiempos), pose(b), face (de qué lado tiene el caño), turn(b) (vueltas alrededor), up(b), hands(b), r }
// hands: qué manos agarran (cierran los dedos); pin: con cuáles se ubica el cuerpo sobre el caño (si no, las mismas)
// face: 0 = mirándolo, PI = de espaldas, +PI/2 = el caño a su derecha

// Paseo: agarrada con la derecha bien arriba, camina alrededor del caño con pasos cruzados, lentos (uno cada dos
// tiempos), la cadera que se mece con cada paso y el otro brazo abierto, suelto
const WALK = {
  len: 8, face: Math.PI / 2, r: 0.5,
  turn: (b) => -(Math.PI * 0.9) * (b / 8),
  up: () => 0, hands: () => ({ l: 0, r: 1 }),
  pose(b) {
    const P = blank(), ph = TAU * (b / 4), s = Math.sin(ph), c = Math.cos(ph);
    P.shoulderR = [-0.35, 0, -2.5]; P.elbowR = [-0.3, 0, 0];
    P.shoulderL = [0.25 + 0.12 * S(b, 8), 0, 0.95 + 0.15 * S(b, 4, 0.2)]; P.elbowL = [-0.35 - 0.15 * S(b, 4), 0, 0];
    P.spine = [-0.1, -0.12 * s, -0.05]; P.neck = [-0.12, 0.25, 0.05 * s];
    P.hips = [0.04, 0.16 * s, 0];
    // piernas: la que avanza se cruza por delante, en punta; la de atrás se estira
    P.hipL = [-0.38 * s, 0, -0.06]; P.hipR = [0.38 * s, 0, 0.06];
    P.kneeL = [0.12 + 0.42 * Math.max(0, c), 0, 0]; P.kneeR = [0.12 + 0.42 * Math.max(0, -c), 0, 0];
    roll(P, 0.07 * s);
    P.y = -0.02 - 0.025 * Math.abs(c);
    return P;
  },
};

// Ola: de frente al caño, las dos manos arriba: ondas de cuerpo (pecho, panza, cadera) de a dos tiempos y cada
// ocho una bajada hasta abajo con las rodillas abiertas, y vuelve a subir ondulando
const WAVE = {
  len: 8, face: 0, r: 0.42,
  turn: (b) => -0.25 * (b / 8),
  up: () => 0, hands: () => ({ l: 1, r: 1 }),
  pose(b) {
    const P = blank(), w = TAU * (b / 2), d = 0.5 - 0.5 * Math.cos(TAU * (b / 8));
    P.shoulderL = [-2.25 + d * 0.5, 0, -0.18]; P.shoulderR = [-2.25 + d * 0.5, 0, 0.18];
    P.elbowL = [-0.55 - d * 0.45, 0, 0]; P.elbowR = [-0.55 - d * 0.45, 0, 0];
    P.neck = [0.22 * Math.sin(w + 0.9) - 0.1, 0, 0];
    P.spine = [-0.28 * Math.sin(w), 0, 0];
    P.hips = [0.2 * Math.sin(w - 1.3) + d * 0.15, 0.08 * Math.sin(w * 0.5), 0];
    const k = 0.22 + 0.22 * (0.5 + 0.5 * Math.sin(w - 2.2));
    P.hipL = [-0.15 - d * 0.95, 0, 0.12 + d * 0.45]; P.hipR = [-0.15 - d * 0.95, 0, -0.12 - d * 0.45];
    P.kneeL = [k + d * 1.35, 0, 0]; P.kneeR = [k + d * 1.35, 0, 0];
    P.y = -0.03 - d * 0.48 - 0.03 * (0.5 + 0.5 * Math.sin(w - 2.2));
    fit(P, FIT.WAVE0, 1, FIT.WAVE1, d);
    return P;
  },
};

// Silla: un paso de impulso y gira colgada (mano derecha arriba, la izquierda más abajo), las rodillas juntas y
// recogidas como sentada en el aire, el cuerpo hacia afuera y la cabeza atrás; aterriza suave
const CHAIR = {
  len: 8, face: Math.PI / 2, r: 0.42,
  turn: (b) => -TAU * ease((b - 0.8) / 6.4) - 0.35 * ease(b / 1.2),
  up: (b) => 0.2 * env(b, 1, 2, 6.4, 7.6),
  hands: (b) => ({ l: env(b, 1, 2.1, 6.3, 7.5), r: 1 }), pin: () => ({ l: 0, r: 1 }),
  pose(b) {
    const P = blank(), a = env(b, 1, 2.1, 6.3, 7.5), sw = Math.sin(TAU * b / 4);
    P.shoulderR = [-0.3, 0, -2.6]; P.elbowR = [-0.2, 0, 0];
    // la izquierda cruza por delante y agarra el caño más abajo; antes y después, abierta
    P.shoulderL = [lerp(0.3, -1.2, a), 0, lerp(0.9, -0.55, a)]; P.elbowL = [lerp(-0.3, -1.0, a), 0, 0];
    P.spine = [-0.15 * a, 0, -0.18 * a]; P.neck = [-0.1 - 0.35 * a, -0.2 * a, 0];
    P.hips = [-0.15 * a, 0.12 * a, -0.22 * a];
    P.hipL = [lerp(-0.1, -1.45, a), 0, -0.04]; P.hipR = [lerp(0.1, -1.3, a), 0, 0.04];
    P.kneeL = [lerp(0.15, 1.75, a), 0, 0]; P.kneeR = [lerp(0.15, 1.85, a), 0, 0];
    P.hipL[0] += 0.08 * sw * a; P.hipR[0] -= 0.08 * sw * a;
    P.y = -0.02 + 0.06 * a;
    fit(P, FIT.CHAIR, a);
    return P;
  },
};

// Espalda: de espaldas al caño con las manos arriba detrás de la cabeza; baja despacio abriendo las rodillas
// (cuatro tiempos) con la cadera que dibuja círculos, y vuelve a subir ondulando el pecho
const BACK = {
  len: 8, face: Math.PI, r: 0.22,
  turn: () => 0, up: () => 0, hands: () => ({ l: 1, r: 1 }),
  pose(b) {
    const P = blank(), d = 0.5 - 0.5 * Math.cos(TAU * (b / 8)), circ = TAU * (b / 2), rise = env(b, 4, 5.5, 6.5, 8);
    P.shoulderL = [-2.75, 0, 0.35]; P.shoulderR = [-2.75, 0, -0.35];
    P.elbowL = [-0.95 - d * 0.35, 0, 0]; P.elbowR = [-0.95 - d * 0.35, 0, 0];
    P.spine = [0.12 * d + 0.1 * rise * Math.sin(circ), 0, 0.05 * Math.sin(circ)]; P.neck = [-0.18 + 0.15 * rise * Math.sin(circ + 0.9), 0, -0.1 * Math.sin(circ)];
    P.hips = [0.1 * d, 0.09 * Math.sin(circ) * (0.4 + d), 0];
    roll(P, 0.07 * Math.cos(circ) * (0.4 + d));
    P.hipL[0] = -0.12 - d * 1.15; P.hipR[0] = -0.12 - d * 1.15;
    P.hipL[2] += 0.1 + d * 0.55; P.hipR[2] -= 0.1 + d * 0.55;
    P.kneeL = [0.2 + d * 1.75, 0, 0]; P.kneeR = [0.2 + d * 1.75, 0, 0];
    P.y = -0.03 - d * 0.55;
    fit(P, FIT.BACK0, 1, FIT.BACK1, d);
    return P;
  },
};

// Gancho: el caño a su derecha, engancha la pierna derecha alrededor y se arquea hacia atrás con el brazo libre
// por arriba de la cabeza (el pelo cae); se mece y gira despacito sobre el caño, y suelta
const HOOK = {
  len: 8, face: Math.PI / 2, r: 0.4,
  turn: (b) => -0.9 * ease((b - 1.5) / 5),
  up: () => 0, hands: () => ({ l: 0, r: 1 }),
  pose(b) {
    const P = blank(), a = env(b, 0.4, 2, 6, 7.6), sw = S(b, 4);
    P.shoulderR = [-0.35, 0, -2.4 + 0.25 * a]; P.elbowR = [-0.35, 0, 0];
    P.shoulderL = [lerp(0.25, -0.5, a), 0, lerp(0.95, 2.55, a)]; P.elbowL = [lerp(-0.35, -0.25, a), 0, 0];
    P.spine = [-0.4 * a, -0.15 * a, -0.15 * a]; P.neck = [-0.1 - 0.55 * a + 0.08 * sw, 0, 0];
    P.hips = [-0.1 * a, 0.25 * a, -0.18 * a + 0.04 * sw];
    // pierna de adentro: muslo arriba hacia el caño, rodilla doblada que lo abraza; la otra, estirada en punta
    P.hipR = [lerp(0.05, -1.35, a), lerp(0, -0.3, a), lerp(0.04, -0.35, a)]; P.kneeR = [lerp(0.15, 1.55, a), 0, 0];
    P.hipL = [lerp(-0.05, 0.12, a), 0, lerp(-0.04, 0.12, a)]; P.kneeL = [0.08 + 0.1 * a, 0, 0];
    P.y = -0.02 + 0.04 * a;
    fit(P, FIT.HOOK, a);
    return P;
  },
};

// Piso: de espaldas al caño, una mano lo agarra atrás; baja hasta quedar de rodillas, dos ondas de cuerpo con
// revoleo de pelo y la mano libre que sube por el muslo, y se para despacio
const KNEEL = {
  len: 8, face: Math.PI, r: 0.32,
  turn: () => 0, up: () => 0, hands: () => ({ l: 0, r: 1 }),
  pose(b) {
    const P = blank(), d = env(b, 0, 2, 6, 8), w = TAU * ((b - 2) / 2), on = env(b, 1.6, 2.4, 5.6, 6.4);
    P.shoulderR = [-2.65, 0, -0.45]; P.elbowR = [-0.55, 0, 0];
    P.shoulderL = [lerp(-0.25, -0.15, d) + on * -0.9 * (0.5 + 0.5 * Math.sin(w)), 0, 0.25 + on * 0.6 * (0.5 + 0.5 * Math.sin(w))]; P.elbowL = [-0.5 - on * 0.9, 0, 0];
    P.spine = [0.1 * d + on * 0.3 * Math.sin(w), 0, 0]; P.neck = [on * (0.35 * Math.sin(w + 0.9)) - 0.1 * d, 0, 0];
    P.hips = [-0.05 * d + on * 0.2 * Math.sin(w - 1.2), 0, 0];
    // de rodillas: muslos casi verticales, las canillas atrás en el piso, abiertas
    P.hipL = [lerp(-0.05, -0.15, d), 0, 0.06 + 0.18 * d]; P.hipR = [lerp(-0.05, -0.15, d), 0, -0.06 - 0.18 * d];
    P.kneeL = [0.1 + 1.6 * d, 0, 0]; P.kneeR = [0.1 + 1.6 * d, 0, 0];
    P.y = -0.02 - 0.47 * d;
    return P;
  },
};

// para las herramientas de ajuste y los tests
export const POLE_MOVES = { WALK, WAVE, CHAIR, BACK, HOOK, KNEEL };

// la rutina: cuatro tiempos por compás, ~32 s y vuelve a empezar
const ROUTINE = [WALK, WAVE, CHAIR, BACK, { ...WALK, len: 4, turn: (b) => -(Math.PI * 0.45) * (b / 4) }, HOOK, KNEEL, CHAIR, WAVE];
const XF = 1.5; // transición: tiempo y medio (el cuerpo va de una postura a la otra sin saltos)
const STARTS = [];
let TOTAL = 0, TURN = 0;
for (const m of ROUTINE) { STARTS.push({ at: TOTAL, turn0: TURN }); TOTAL += m.len; TURN += m.turn(m.len); }

function at(beat) {
  const loops = Math.floor(beat / TOTAL), t = beat - loops * TOTAL;
  let i = ROUTINE.length - 1;
  while (i > 0 && STARTS[i].at > t) i--;
  return { i, b: t - STARTS[i].at, turnBase: loops * TURN + STARTS[i].turn0 };
}

const TMP_A = blank(), TMP_B = blank();
// pose de la rutina en el tiempo 'beat' (se mezcla con el final del movimiento anterior durante la transición)
export function polePose(J, beat, addY) {
  const { i, b } = at(beat), m = ROUTINE[i];
  let P = m.pose(b);
  if (b < XF) {
    const pm = ROUTINE[(i + ROUTINE.length - 1) % ROUTINE.length];
    P = mix(pm.pose(pm.len), P, ease(b / XF), TMP_A);
  }
  for (const n of JN) { const j = J[n] || (J[n] = [0, 0, 0]); j[0] = P[n][0]; j[1] = P[n][1]; j[2] = P[n][2]; }
  addY(P.y);
}

const lerpAng = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
// dónde está: ang = ángulo (alrededor del caño) desde el caño hacia ella; face = de qué lado lo tiene;
// up = cuánto se levanta del piso; l/rh = qué mano lo agarra (0..1); pl/pr = con cuáles se ubica; r = distancia si no agarra
export function polePlace(beat, out = {}) {
  const { i, b, turnBase } = at(beat), m = ROUTINE[i];
  out.ang = turnBase + m.turn(b);
  out.face = m.face; out.up = m.up(b); out.r = m.r;
  const h = m.hands(b), q = m.pin ? m.pin(b) : h;
  out.l = h.l; out.rh = h.r; out.pl = q.l; out.pr = q.r;
  if (b < XF) {
    const pm = ROUTINE[(i + ROUTINE.length - 1) % ROUTINE.length], w = ease(b / XF), ph = pm.hands(pm.len), pq = pm.pin ? pm.pin(pm.len) : ph;
    out.face = lerpAng(pm.face, m.face, w); out.up = lerp(pm.up(pm.len), out.up, w); out.r = lerp(pm.r, m.r, w);
    out.l = lerp(ph.l, h.l, w); out.rh = lerp(ph.r, h.r, w); out.pl = lerp(pq.l, q.l, w); out.pr = lerp(pq.r, q.r, w);
  }
  return out;
}

// ---------------------------------------------------------------- gogó (las de las jaulas): sin caño, en el lugar
// cadera que marca el tiempo, ondas, manos que bajan por el cuerpo, bajadas y revoleo de pelo; encadenado igual
// que el caño (cada parte dura dos compases y se mezcla con la anterior)
function groove(P, beat) {
  const hit = Math.sin(TAU * beat / 2);
  roll(P, 0.09 * hit);
  P.hips[1] += 0.18 * hit;
  P.kneeL[0] += 0.2 + 0.18 * Math.max(0, hit); P.kneeR[0] += 0.2 + 0.18 * Math.max(0, -hit);
  P.hipL[0] += -0.1 - 0.12 * Math.max(0, hit); P.hipR[0] += -0.1 - 0.12 * Math.max(0, -hit);
  P.y += -0.04 - 0.02 * Math.abs(hit);
}
const GOGO = [
  { len: 8, pose(b, beat) { // manos arriba, el cuerpo ondula
    const P = blank(), w = TAU * (beat / 2);
    P.shoulderL = [-0.4, 0, 2.6]; P.shoulderR = [-0.4, 0, -2.6]; P.elbowL = [-0.7, 0, 0]; P.elbowR = [-0.7, 0, 0];
    P.spine[0] = -0.22 * Math.sin(w); P.hips[0] = 0.15 * Math.sin(w - 1.3); P.neck[0] = 0.15 * Math.sin(w + 0.9) - 0.1;
    groove(P, beat); return P;
  } },
  { len: 8, pose(b, beat) { // las manos bajan por el cuerpo y la cadera dibuja un ocho
    const P = blank(), s = 0.5 + 0.5 * Math.cos(TAU * b / 8), c = TAU * beat / 4;
    P.shoulderL = [-0.5 - 0.6 * s, 0, 0.2 + 0.4 * s]; P.shoulderR = [-0.5 - 0.6 * s, 0, -0.2 - 0.4 * s];
    P.elbowL = [-1.6 + 0.4 * s, 0, 0]; P.elbowR = [-1.6 + 0.4 * s, 0, 0];
    P.hips[1] = 0.12 * Math.sin(c); P.spine[2] = 0.12 * Math.sin(c + 1); P.neck[2] = -0.1 * Math.sin(c);
    groove(P, beat); return P;
  } },
  { len: 8, pose(b, beat) { // bajada lenta con las rodillas abiertas y subida ondulando, una mano en la nuca
    const P = blank(), d = 0.5 - 0.5 * Math.cos(TAU * b / 8), w = TAU * (beat / 2);
    P.shoulderL = [-0.2, 0, 2.3]; P.elbowL = [-1.9, 0, 0]; P.shoulderR = [-0.35, 0, -0.5]; P.elbowR = [-0.5, 0, 0];
    P.hipL[0] = -d * 0.9; P.hipR[0] = -d * 0.9; P.hipL[2] = d * 0.5; P.hipR[2] = -d * 0.5;
    P.kneeL[0] = d * 1.3; P.kneeR[0] = d * 1.3; P.y = -d * 0.42;
    P.spine[0] = 0.15 * d - 0.2 * Math.sin(w) * (1 - d);
    groove(P, beat); return P;
  } },
  { len: 8, pose(b, beat) { // revoleo de pelo: el torso dibuja un círculo y los brazos se abren
    const P = blank(), c = TAU * beat / 4, k = env(b, 0, 1.5, 6.5, 8);
    P.spine[0] = k * (0.25 + 0.2 * Math.sin(c)); P.spine[2] = k * 0.25 * Math.cos(c);
    P.neck[0] = k * 0.3 * Math.sin(c + 0.6); P.neck[2] = k * 0.2 * Math.cos(c + 0.6);
    P.shoulderL = [-0.3, 0, 1.2 + 0.4 * Math.sin(c)]; P.shoulderR = [-0.3, 0, -1.2 + 0.4 * Math.sin(c)]; P.elbowL = [-0.5, 0, 0]; P.elbowR = [-0.5, 0, 0];
    groove(P, beat); return P;
  } },
];
export function gogoPose(J, beat, addY) {
  const t = beat % 32, i = Math.floor(t / 8), b = t - i * 8, m = GOGO[i];
  let P = m.pose(b, beat);
  if (b < XF) { const pm = GOGO[(i + 3) % 4]; P = mix(pm.pose(pm.len, beat), P, ease(b / XF), TMP_B); }
  for (const n of JN) { const j = J[n] || (J[n] = [0, 0, 0]); j[0] = P[n][0]; j[1] = P[n][1]; j[2] = P[n][2]; }
  addY(P.y);
}

// ---------------------------------------------------------------- DJ: detrás de las bandejas, al compás
// cabecea en cada tiempo y rebota las rodillas; la izquierda en la bandeja (mueve perillas); la derecha va del
// auricular a la mezcla y, en el final de cada frase, puño arriba
const TMP_D = blank();
export function djPose(J, beat, addY) {
  const P = TMP_D, b = ((beat % 16) + 16) % 16, pulse = Math.pow(0.5 + 0.5 * Math.cos(TAU * beat), 3);
  for (const n of JN) { P[n][0] = 0; P[n][1] = 0; P[n][2] = 0; }
  const phone = env(b, 0, 1, 6.5, 7.5), pump = env(b, 12, 12.6, 15.2, 16);
  P.spine[0] = 0.2; P.spine[1] = 0.1 * Math.sin(TAU * beat / 4);
  P.neck[0] = 0.05 + 0.24 * pulse; P.neck[1] = -0.15 * phone;
  P.hipL[0] = P.hipR[0] = -0.12 - 0.07 * pulse; P.kneeL[0] = P.kneeR[0] = 0.2 + 0.14 * pulse;
  P.hipL[2] = -0.06; P.hipR[2] = 0.06;
  P.shoulderL[0] = -0.8 + 0.06 * Math.sin(TAU * beat / 2); P.shoulderL[1] = 0.25 * Math.sin(TAU * beat / 8); P.shoulderL[2] = 0.12; P.elbowL[0] = -1.05;
  // derecha: mezcla -> auricular -> puño
  const mixR = [-0.8, -0.2, -0.12], earR = [-0.35, 0, -1.3], upR = [-2.75 + 0.3 * pulse, 0, -0.2];
  for (let i = 0; i < 3; i++) P.shoulderR[i] = lerp(lerp(mixR[i], earR[i], phone), upR[i], pump);
  P.elbowR[0] = lerp(lerp(-1.05, -2.4, phone), -0.35 - 0.5 * pulse, pump);
  P.y = -0.02 - 0.03 * pulse;
  for (const n of JN) { const j = J[n] || (J[n] = [0, 0, 0]); j[0] = P[n][0]; j[1] = P[n][1]; j[2] = P[n][2]; }
  addY(P.y);
}

// ---------------------------------------------------------------- la gente de la pista
// "club": rebote con los brazos que acompañan, puño arriba, manos arriba de lado a lado y paso al costado con
// hombros; dos compases cada uno, encadenados como el resto. "trance": la sala psicodélica, lento, los brazos que
// flotan como algas y la cabeza que rueda
function bounce(P, beat, k = 1) {
  const pulse = Math.pow(0.5 + 0.5 * Math.cos(TAU * beat), 2);
  P.hipL[0] += -0.1 - 0.12 * pulse * k; P.hipR[0] += -0.1 - 0.12 * pulse * k;
  P.kneeL[0] += 0.18 + 0.22 * pulse * k; P.kneeR[0] += 0.18 + 0.22 * pulse * k;
  P.neck[0] += 0.12 * pulse * k; P.y += -0.03 - 0.05 * pulse * k;
  return pulse;
}
const CLUB = [
  { len: 8, pose(b, beat) { // rebote, los brazos van y vienen
    const P = blank(), h = Math.sin(TAU * beat / 2);
    bounce(P, beat);
    P.shoulderL = [-0.35 + 0.35 * h, 0, 0.18]; P.shoulderR = [-0.35 - 0.35 * h, 0, -0.18];
    P.elbowL = [-1.35, 0, 0]; P.elbowR = [-1.35, 0, 0]; P.spine[1] = 0.14 * h; P.spine[0] = 0.08;
    return P;
  } },
  { len: 8, pose(b, beat) { // puño arriba en cada tiempo (cuatro con cada mano)
    const P = blank(), pulse = bounce(P, beat), right = b < 4, up = 0.6 + 0.4 * pulse;
    const arm = [-2.5 * up - 0.2, 0, 0], rest = [-0.4, 0, 0];
    P.shoulderR = right ? [arm[0], 0, -0.25] : [rest[0], 0, -0.2]; P.elbowR = [right ? -0.3 - 0.6 * (1 - pulse) : -1.4, 0, 0];
    P.shoulderL = right ? [rest[0], 0, 0.2] : [arm[0], 0, 0.25]; P.elbowL = [right ? -1.4 : -0.3 - 0.6 * (1 - pulse), 0, 0];
    P.spine[2] = (right ? -1 : 1) * 0.08;
    return P;
  } },
  { len: 8, pose(b, beat) { // manos arriba, de lado a lado
    const P = blank(), w = Math.sin(TAU * beat / 4);
    bounce(P, beat, 0.6);
    P.shoulderL = [-0.3, 0, 2.55 + 0.25 * w]; P.shoulderR = [-0.3, 0, -2.55 + 0.25 * w];
    P.elbowL = [-0.35, 0, 0]; P.elbowR = [-0.35, 0, 0]; P.spine[2] = 0.12 * w; P.neck[2] = 0.1 * w;
    roll(P, 0.05 * w);
    return P;
  } },
  { len: 8, pose(b, beat) { // paso al costado y hombros
    const P = blank(), st = Math.sin(TAU * beat / 2), sh = Math.sin(TAU * beat * 2);
    bounce(P, beat, 0.7);
    roll(P, 0.1 * st); P.hips[1] = 0.1 * st;
    P.shoulderL = [-0.5 + 0.12 * sh, 0, 0.25]; P.shoulderR = [-0.5 - 0.12 * sh, 0, -0.25];
    P.elbowL = [-1.6, 0, 0]; P.elbowR = [-1.6, 0, 0]; P.spine[2] = -0.06 * st;
    return P;
  } },
];
export function clubPose(J, beat, addY) {
  const t = ((beat % 32) + 32) % 32, i = Math.floor(t / 8), b = t - i * 8, m = CLUB[i];
  let P = m.pose(b, beat);
  if (b < XF) { const pm = CLUB[(i + 3) % 4]; P = mix(pm.pose(pm.len, beat), P, ease(b / XF), TMP_B); }
  for (const n of JN) { const j = J[n] || (J[n] = [0, 0, 0]); j[0] = P[n][0]; j[1] = P[n][1]; j[2] = P[n][2]; }
  addY(P.y);
}
const TMP_T = blank();
export function trancePose(J, beat, addY) {
  const P = TMP_T, a = TAU * beat / 8, c = TAU * beat / 16;
  for (const n of JN) { P[n][0] = 0; P[n][1] = 0; P[n][2] = 0; }
  P.y = 0;
  bounce(P, beat, 0.35);
  P.shoulderL = [-0.6 + 0.5 * Math.sin(a), 0.3 * Math.sin(c), 1.0 + 0.8 * Math.sin(a + 1.1)];
  P.shoulderR = [-0.6 + 0.5 * Math.sin(a + 2.2), -0.3 * Math.sin(c + 1), -1.0 - 0.8 * Math.sin(a + 3.3)];
  P.elbowL = [-0.6 - 0.5 * (0.5 + 0.5 * Math.sin(a + 2)), 0, 0]; P.elbowR = [-0.6 - 0.5 * (0.5 + 0.5 * Math.sin(a + 4.2)), 0, 0];
  P.spine = [0.05 + 0.08 * Math.sin(c), 0.15 * Math.sin(c + 0.5), 0.12 * Math.sin(a)];
  P.neck = [0.15 * Math.sin(a + 0.7), 0.2 * Math.sin(c), 0.18 * Math.cos(a + 0.7)];
  roll(P, 0.06 * Math.sin(a));
  for (const n of JN) { const j = J[n] || (J[n] = [0, 0, 0]); j[0] = P[n][0]; j[1] = P[n][1]; j[2] = P[n][2]; }
  addY(P.y);
}
