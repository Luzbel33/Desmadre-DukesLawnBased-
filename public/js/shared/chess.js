// Reglas del ajedrez (las usan el servidor para validar y el cliente para mostrar las jugadas y la IA del Conde).
// Tablero: string de 64 casillas, índice = fila * 8 + columna (fila 0 = la primera de las blancas, columna 0 = "a").
// Mayúsculas blancas, minúsculas negras, '.' vacío. Estado: { b, turn: 'w'|'b', castle: 'KQkq', ep: casilla de
// captura al paso o -1, half: jugadas sin captura ni peón (regla de 50) }. Las jugadas: { f, t, p } (p: coronación).

export const START = 'RNBQKBNRPPPPPPPP' + '.'.repeat(32) + 'pppppppprnbqkbnr';
export function initial() { return { b: START, turn: 'w', castle: 'KQkq', ep: -1, half: 0 }; }

const colorOf = (c) => (c === '.' ? null : c === c.toUpperCase() ? 'w' : 'b');
const N = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const K = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const ROOK = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
export const sq = (file, rank) => rank * 8 + file;
export const fileOf = (i) => i & 7;
export const rankOf = (i) => i >> 3;
export const name = (i) => 'abcdefgh'[i & 7] + ((i >> 3) + 1);

// ¿la casilla i está atacada por el color `by`?
export function attacked(b, i, by) {
  const f = fileOf(i), r = rankOf(i);
  const at = (ff, rr) => (ff >= 0 && ff < 8 && rr >= 0 && rr < 8 ? b[sq(ff, rr)] : '');
  const own = (c, t) => c && c !== '.' && colorOf(c) === by && c.toLowerCase() === t;
  const dir = by === 'w' ? -1 : 1; // un peón blanco ataca desde la fila de abajo
  if (own(at(f - 1, r + dir), 'p') || own(at(f + 1, r + dir), 'p')) return true;
  for (const [df, dr] of N) if (own(at(f + df, r + dr), 'n')) return true;
  for (const [df, dr] of K) if (own(at(f + df, r + dr), 'k')) return true;
  for (const [dirs, t] of [[ROOK, 'r'], [BISHOP, 'b']]) {
    for (const [df, dr] of dirs) {
      let ff = f + df, rr = r + dr;
      while (ff >= 0 && ff < 8 && rr >= 0 && rr < 8) {
        const c = b[sq(ff, rr)];
        if (c !== '.') { if (own(c, t) || own(c, 'q')) return true; break; }
        ff += df; rr += dr;
      }
    }
  }
  return false;
}
export function inCheck(st, color = st.turn) {
  const k = st.b.indexOf(color === 'w' ? 'K' : 'k');
  return k >= 0 && attacked(st.b, k, color === 'w' ? 'b' : 'w');
}

// jugadas que respetan el movimiento de las piezas (todavía pueden dejar al rey en jaque)
function pseudo(st) {
  const out = [], b = st.b, me = st.turn, foe = me === 'w' ? 'b' : 'w';
  const push = (f, t) => {
    const c = b[f].toLowerCase(), r = rankOf(t);
    if (c === 'p' && (r === 7 || r === 0)) for (const p of 'qrbn') out.push({ f, t, p });
    else out.push({ f, t });
  };
  for (let i = 0; i < 64; i++) {
    const c = b[i];
    if (colorOf(c) !== me) continue;
    const t = c.toLowerCase(), f = fileOf(i), r = rankOf(i);
    const free = (ff, rr) => ff >= 0 && ff < 8 && rr >= 0 && rr < 8 && b[sq(ff, rr)] === '.';
    const enemy = (ff, rr) => ff >= 0 && ff < 8 && rr >= 0 && rr < 8 && colorOf(b[sq(ff, rr)]) === foe;
    if (t === 'p') {
      const d = me === 'w' ? 1 : -1, home = me === 'w' ? 1 : 6;
      if (free(f, r + d)) {
        push(i, sq(f, r + d));
        if (r === home && free(f, r + 2 * d)) out.push({ f: i, t: sq(f, r + 2 * d) });
      }
      for (const df of [-1, 1]) {
        if (enemy(f + df, r + d)) push(i, sq(f + df, r + d));
        else if (f + df >= 0 && f + df < 8 && st.ep === sq(f + df, r + d)) out.push({ f: i, t: st.ep });
      }
    } else if (t === 'n' || t === 'k') {
      for (const [df, dr] of t === 'n' ? N : K) if (free(f + df, r + dr) || enemy(f + df, r + dr)) out.push({ f: i, t: sq(f + df, r + dr) });
      if (t === 'k') {
        // enroque: rey y torre sin mover, casillas libres y el rey no pasa por jaque
        const R = me === 'w' ? 0 : 7, KS = me === 'w' ? 'K' : 'k', QS = me === 'w' ? 'Q' : 'q';
        if (i === sq(4, R) && !attacked(b, i, foe)) {
          if (st.castle.includes(KS) && b[sq(5, R)] === '.' && b[sq(6, R)] === '.' && !attacked(b, sq(5, R), foe) && !attacked(b, sq(6, R), foe)) out.push({ f: i, t: sq(6, R) });
          if (st.castle.includes(QS) && b[sq(3, R)] === '.' && b[sq(2, R)] === '.' && b[sq(1, R)] === '.' && !attacked(b, sq(3, R), foe) && !attacked(b, sq(2, R), foe)) out.push({ f: i, t: sq(2, R) });
        }
      }
    } else {
      const dirs = t === 'r' ? ROOK : t === 'b' ? BISHOP : [...ROOK, ...BISHOP];
      for (const [df, dr] of dirs) {
        let ff = f + df, rr = r + dr;
        while (free(ff, rr)) { out.push({ f: i, t: sq(ff, rr) }); ff += df; rr += dr; }
        if (enemy(ff, rr)) out.push({ f: i, t: sq(ff, rr) });
      }
    }
  }
  return out;
}

// aplica una jugada (sin validar): devuelve el estado nuevo y qué pasó (captura, enroque, coronación)
export function apply(st, m) {
  const b = st.b.split(''), c = b[m.f], t = c.toLowerCase(), me = st.turn;
  const info = { cap: b[m.t] !== '.' ? b[m.t] : null, capAt: m.t, castle: null, promo: null, ep: false };
  if (t === 'p' && m.t === st.ep && b[m.t] === '.') { // al paso: el peón comido está detrás
    info.capAt = m.t + (me === 'w' ? -8 : 8); info.cap = b[info.capAt]; info.ep = true; b[info.capAt] = '.';
  }
  b[m.t] = c; b[m.f] = '.';
  if (t === 'p' && (rankOf(m.t) === 7 || rankOf(m.t) === 0)) { const p = m.p || 'q'; b[m.t] = me === 'w' ? p.toUpperCase() : p; info.promo = b[m.t]; }
  if (t === 'k' && Math.abs(fileOf(m.t) - fileOf(m.f)) === 2) { // enroque: la torre salta al otro lado
    const R = rankOf(m.f), kingSide = fileOf(m.t) === 6;
    const rf = sq(kingSide ? 7 : 0, R), rt = sq(kingSide ? 5 : 3, R);
    b[rt] = b[rf]; b[rf] = '.'; info.castle = { f: rf, t: rt };
  }
  let castle = st.castle;
  const drop = (s) => { castle = castle.replace(s, ''); };
  if (c === 'K') { drop('K'); drop('Q'); } if (c === 'k') { drop('k'); drop('q'); }
  for (const [s, i] of [['Q', 0], ['K', 7], ['q', 56], ['k', 63]]) if (m.f === i || m.t === i) drop(s);
  const ep = t === 'p' && Math.abs(rankOf(m.t) - rankOf(m.f)) === 2 ? (m.f + m.t) / 2 : -1;
  return { st: { b: b.join(''), turn: me === 'w' ? 'b' : 'w', castle: castle || '', ep, half: t === 'p' || info.cap ? 0 : st.half + 1 }, info };
}

export function legal(st) {
  return pseudo(st).filter((m) => !inCheck({ ...apply(st, m).st, turn: st.turn }, st.turn));
}
export function isLegal(st, m) {
  return legal(st).some((x) => x.f === m.f && x.t === m.t && (x.p || null) === (m.p || (x.p ? 'q' : null)));
}

// cómo está la partida: jaque, mate, ahogado o tablas (material insuficiente, 50 jugadas)
export function status(st) {
  const moves = legal(st), check = inCheck(st);
  if (!moves.length) return { check, over: true, result: check ? (st.turn === 'w' ? 'b' : 'w') : 'draw', why: check ? 'mate' : 'ahogado' };
  if (st.half >= 100) return { check, over: true, result: 'draw', why: '50 jugadas' };
  const rest = st.b.replace(/[.kK]/g, '');
  if (!rest || rest === 'n' || rest === 'N' || rest === 'b' || rest === 'B') return { check, over: true, result: 'draw', why: 'material insuficiente' };
  return { check, over: false };
}

// ---------------------------------------------------------------- el Conde (la IA): poda alfa-beta a 2-3 jugadas
const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const CENTER = [0, 1, 2, 3, 3, 2, 1, 0];
function evaluate(b) { // a favor de las blancas
  let s = 0;
  for (let i = 0; i < 64; i++) {
    const c = b[i];
    if (c === '.') continue;
    const t = c.toLowerCase(), w = c !== t, f = fileOf(i), r = rankOf(i);
    let v = VAL[t];
    if (t === 'n' || t === 'b') v += (CENTER[f] + CENTER[r]) * 6;
    if (t === 'p') v += (w ? r : 7 - r) * 8 + (f === 3 || f === 4 ? 10 : 0);
    if (t === 'q') v += (CENTER[f] + CENTER[r]) * 2;
    s += w ? v : -v;
  }
  return s;
}
function search(st, depth, alpha, beta, ply) {
  const moves = legal(st);
  if (!moves.length) return inCheck(st) ? -100000 + ply : 0;
  if (depth <= 0) return (st.turn === 'w' ? 1 : -1) * evaluate(st.b);
  // las capturas primero (poda mejor)
  moves.sort((a, b) => (st.b[b.t] !== '.' ? VAL[st.b[b.t].toLowerCase()] : 0) - (st.b[a.t] !== '.' ? VAL[st.b[a.t].toLowerCase()] : 0));
  for (const m of moves) {
    const v = -search(apply(st, m).st, depth - 1, -beta, -alpha, ply + 1);
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return alpha;
}
export function bestMove(st, depth = 3, rnd = Math.random) {
  const moves = legal(st);
  if (!moves.length) return null;
  let best = [], bv = -Infinity;
  for (const m of moves) {
    if (m.p && m.p !== 'q') continue; // corona siempre dama
    const v = -search(apply(st, m).st, depth - 1, -Infinity, Infinity, 1) + rnd() * 12; // un poco de azar: no juega siempre igual
    if (v > bv) { bv = v; best = [m]; }
  }
  return best[0] || moves[0];
}
