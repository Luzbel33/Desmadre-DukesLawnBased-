// Fútbol físico: la pelota se simula en el servidor y choca con cada parte del cuerpo de los jugadores
// (usando las poses de ragdoll que ya mandan), con los arcos, la red y los carteles.
import { FIELD as F } from '../public/js/shared/mapdata.js';

const R = 0.11; // radio de la pelota
const G = 9.81;
const MATCH_S = 300;
// punta local de cada parte (desde la articulación) y radio
const TIP = [[0, 0.16, 0], [0, 0.42, 0], [0, 0.24, 0.02], [0, -0.3, 0], [0, -0.34, 0.02], [0, -0.3, 0], [0, -0.34, 0.02], [0, -0.42, 0], [0, -0.52, 0.06], [0, -0.42, 0], [0, -0.52, 0.06]];
const RAD = [0.15, 0.17, 0.11, 0.055, 0.05, 0.055, 0.05, 0.08, 0.065, 0.08, 0.065];

function rotate(q, v) {
  const [x, y, z, w] = q;
  const [vx, vy, vz] = v;
  const ix = w * vx + y * vz - z * vy, iy = w * vy + z * vx - x * vz, iz = w * vz + x * vy - y * vx, iw = -x * vx - y * vy - z * vz;
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}

export class Football {
  constructor(hooks) {
    this.hooks = hooks; // { broadcast(obj), sys(msg), players() -> iterable de {id, name, st, fbPrev} }
    this.p = [F.cx, R, F.cz];
    this.v = [0, 0, 0];
    this.score = [0, 0]; // [rojo, azul]
    this.running = false;
    this.timeLeft = MATCH_S;
    this.lastTouch = 0;
    this.lastTouchName = '';
    this.freezeUntil = 0;
    this.outSince = 0;
    this.dirty = true;
    this.kick = null;
    this.sent = 0;
  }

  state() {
    return { score: this.score, running: this.running, time: Math.ceil(this.timeLeft) };
  }

  control(p, a) {
    if (a === 'start') {
      this.score = [0, 0];
      this.timeLeft = MATCH_S;
      this.running = true;
      this._center();
      this.hooks.sys(`⚽ ${p.name} arrancó un partido de fútbol (5 minutos). ¡Rojo ataca a la derecha, Azul a la izquierda!`);
    } else if (a === 'ball') this._center();
    this.hooks.broadcast({ t: 'fbs', st: this.state() });
  }

  _center() {
    this.p = [F.cx, R + 0.4, F.cz];
    this.v = [0, 0, 0];
    this.freezeUntil = Date.now() + 1200;
    this.outSince = 0;
  }

  // colisión pelota vs cápsula (a,b,rad) con velocidad de la parte (va, vb)
  _capsule(a, b, rad, va, vb, restitution, boost) {
    const p = this.p;
    const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
    const apx = p[0] - a[0], apy = p[1] - a[1], apz = p[2] - a[2];
    const L2 = abx * abx + aby * aby + abz * abz || 1e-6;
    let t = (apx * abx + apy * aby + apz * abz) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const cx = a[0] + abx * t, cy = a[1] + aby * t, cz = a[2] + abz * t;
    let nx = p[0] - cx, ny = p[1] - cy, nz = p[2] - cz;
    const d = Math.hypot(nx, ny, nz);
    const minD = R + rad;
    if (d >= minD || d < 1e-5) return false;
    nx /= d; ny /= d; nz /= d;
    // sacar la pelota
    p[0] = cx + nx * minD; p[1] = cy + ny * minD; p[2] = cz + nz * minD;
    const pvx = va[0] + (vb[0] - va[0]) * t, pvy = va[1] + (vb[1] - va[1]) * t, pvz = va[2] + (vb[2] - va[2]) * t;
    const rvx = this.v[0] - pvx, rvy = this.v[1] - pvy, rvz = this.v[2] - pvz;
    const vn = rvx * nx + rvy * ny + rvz * nz;
    if (vn < 0) {
      const j = -(1 + restitution) * vn * boost;
      this.v[0] += j * nx; this.v[1] += j * ny; this.v[2] += j * nz;
      // arrastre tangencial (permite gambetear)
      const tx = rvx - vn * nx, ty = rvy - vn * ny, tz = rvz - vn * nz;
      this.v[0] -= tx * 0.25; this.v[1] -= ty * 0.1; this.v[2] -= tz * 0.25;
      return Math.abs(vn) * boost;
    }
    return 0.01;
  }

  // Ayudas de juego (como en los juegos de fútbol): llevar la pelota corriendo y patear con F
  _assist(now) {
    const p = this.p, v = this.v;
    const onGround = p[1] < R + 0.12;
    for (const pl of this.hooks.players()) {
      const st = pl.st;
      if (!st || !Array.isArray(st.rb) || st.rb.length !== 77 || st.veh || st.s === 2 || st.s === 3) continue;
      const rb = st.rb, prev = pl.fbPrev;
      const px = rb[0], pz = rb[2];
      const dx = p[0] - px, dz = p[2] - pz;
      const dist = Math.hypot(dx, dz);
      if (dist > 1.6) continue;
      const yaw = +st.y || 0;
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      const front = dist > 1e-3 ? (dx * fx + dz * fz) / dist : 1;
      // patada: F cerca de la pelota -> sale hacia donde mira (más fuerte corriendo)
      if (st.ac === 'kick' && dist < 1.45 && front > -0.2 && now - (pl.fbKickAt || 0) > 600) {
        pl.fbKickAt = now;
        const sp = +st.sp || 0;
        const power = 11 + Math.min(7, sp * 1.1);
        const lift = 2.2 + Math.max(0, (+st.ap || 0)) * 6;
        v[0] = fx * power; v[2] = fz * power; v[1] = lift;
        p[1] = Math.max(p[1], R + 0.02);
        this.lastTouch = pl.id; this.lastTouchName = pl.name;
        this.kick = { x: p[0], y: p[1], z: p[2], s: power };
        continue;
      }
      // conducción: corriendo contra la pelota, queda adelante de los pies
      if (!onGround || !prev || dist > 1.1 || front < 0.35) continue;
      const pdt = Math.max(0.02, (pl.fbPrevDt || 50) / 1000);
      const vx = (rb[0] - prev[0]) / pdt, vz = (rb[2] - prev[2]) / pdt;
      const sp = Math.hypot(vx, vz);
      if (sp < 1 || sp > 12) continue;
      const tx = px + (vx / sp) * 0.62, tz = pz + (vz / sp) * 0.62;
      v[0] = vx * 1.04 + (tx - p[0]) * 5;
      v[2] = vz * 1.04 + (tz - p[2]) * 5;
      if (v[1] > 0) v[1] *= 0.5;
      this.lastTouch = pl.id; this.lastTouchName = pl.name;
    }
  }

  _players(dt) {
    let touched = null, power = 0;
    for (const pl of this.hooks.players()) {
      const st = pl.st;
      if (!st || !Array.isArray(st.rb) || st.rb.length !== 77 || st.veh) continue;
      const rb = st.rb;
      // cerca de la pelota? (la pelvis)
      if (Math.hypot(rb[0] - this.p[0], rb[2] - this.p[2]) > 2.6) continue;
      const prev = pl.fbPrev;
      const pdt = prev ? Math.max(0.02, (pl.fbPrevDt || 50) / 1000) : 0.05;
      for (let i = 0; i < 11; i++) {
        const o = i * 7;
        const a = [rb[o], rb[o + 1], rb[o + 2]];
        const q = [rb[o + 3], rb[o + 4], rb[o + 5], rb[o + 6]];
        const tip = rotate(q, TIP[i]);
        const b = [a[0] + tip[0], a[1] + tip[1], a[2] + tip[2]];
        let va = [0, 0, 0], vb = [0, 0, 0];
        if (prev) {
          const pa = [prev[o], prev[o + 1], prev[o + 2]];
          const pq = [prev[o + 3], prev[o + 4], prev[o + 5], prev[o + 6]];
          const ptip = rotate(pq, TIP[i]);
          const pb = [pa[0] + ptip[0], pa[1] + ptip[1], pa[2] + ptip[2]];
          va = [(a[0] - pa[0]) / pdt, (a[1] - pa[1]) / pdt, (a[2] - pa[2]) / pdt];
          vb = [(b[0] - pb[0]) / pdt, (b[1] - pb[1]) / pdt, (b[2] - pb[2]) / pdt];
          // limitar velocidades absurdas (teletransportes)
          for (const v of [va, vb]) { const s = Math.hypot(v[0], v[1], v[2]); if (s > 25) { v[0] *= 25 / s; v[1] *= 25 / s; v[2] *= 25 / s; } }
        }
        const foot = i === 8 || i === 10;
        const kicking = foot && st.ac === 'kick';
        const hit = this._capsule(a, b, RAD[i], va, vb, foot ? 0.55 : i === 2 ? 0.6 : 0.3, kicking ? 1.35 : 1);
        if (hit) { touched = pl; if (hit > power) power = hit; }
      }
    }
    if (touched) {
      this.lastTouch = touched.id;
      this.lastTouchName = touched.name;
      if (power > 4) this.kick = { x: this.p[0], y: this.p[1], z: this.p[2], s: power };
    }
  }

  _world(dt) {
    const p = this.p, v = this.v;
    // suelo
    if (p[1] < R) {
      p[1] = R;
      if (v[1] < -1.2) v[1] = -v[1] * 0.55; else v[1] = 0;
      const k = Math.exp(-1.15 * dt);
      v[0] *= k; v[2] *= k;
      const sp = Math.hypot(v[0], v[2]);
      if (sp > 0) { const dec = Math.min(sp, 0.4 * dt); v[0] -= (v[0] / sp) * dec; v[2] -= (v[2] / sp) * dec; }
    }
    // arcos: palos y travesaño
    for (const side of [-1, 1]) {
      const gx = F.cx + side * F.hx;
      for (const pz of [F.cz - F.goalHalfW, F.cz + F.goalHalfW]) {
        if (p[1] < F.goalH + R) this._pillar(gx, pz, 0.065);
      }
      this._bar(gx, F.goalH, F.cz - F.goalHalfW, F.cz + F.goalHalfW, 0.065);
      // red: caja detrás de la línea
      const inside = side * (p[0] - gx) > 0 && Math.abs(p[2] - F.cz) < F.goalHalfW && p[1] < F.goalH;
      if (inside) {
        const back = gx + side * F.goalDepth;
        if (side * (p[0] - back) > -R) { p[0] = back - side * R; v[0] *= -0.15; v[2] *= 0.6; v[1] *= 0.6; }
        for (const sz of [F.cz - F.goalHalfW, F.cz + F.goalHalfW]) {
          if (Math.abs(p[2] - sz) < R) { p[2] = sz + Math.sign(F.cz - sz) * R; v[2] *= -0.2; }
        }
        if (p[1] > F.goalH - R) { p[1] = F.goalH - R; v[1] *= -0.2; }
      }
    }
    // carteles perimetrales (con huecos en el medio de los laterales largos)
    if (p[1] < F.boardH + R * 0.5) {
      if (Math.abs(p[0] - F.cx) > F.boardX - R) {
        p[0] = F.cx + Math.sign(p[0] - F.cx) * (F.boardX - R);
        v[0] = -v[0] * 0.5;
      }
      if (Math.abs(p[2] - F.cz) > F.boardZ - R && Math.abs(p[0] - F.cx) > F.gapHalf) {
        p[2] = F.cz + Math.sign(p[2] - F.cz) * (F.boardZ - R);
        v[2] = -v[2] * 0.5;
      }
    }
  }

  _pillar(x, z, r) {
    const p = this.p, v = this.v;
    const dx = p[0] - x, dz = p[2] - z;
    const d = Math.hypot(dx, dz);
    if (d < R + r && d > 1e-5) {
      const nx = dx / d, nz = dz / d;
      p[0] = x + nx * (R + r); p[2] = z + nz * (R + r);
      const vn = v[0] * nx + v[2] * nz;
      if (vn < 0) { v[0] -= 1.6 * vn * nx; v[2] -= 1.6 * vn * nz; this.post = true; }
    }
  }

  _bar(x, y, z0, z1, r) {
    const p = this.p, v = this.v;
    if (p[2] < z0 || p[2] > z1) return;
    const dx = p[0] - x, dy = p[1] - y;
    const d = Math.hypot(dx, dy);
    if (d < R + r && d > 1e-5) {
      const nx = dx / d, ny = dy / d;
      p[0] = x + nx * (R + r); p[1] = y + ny * (R + r);
      const vn = v[0] * nx + v[1] * ny;
      if (vn < 0) { v[0] -= 1.6 * vn * nx; v[1] -= 1.6 * vn * ny; this.post = true; }
    }
  }

  _checkGoal() {
    const p = this.p;
    if (Math.abs(p[2] - F.cz) > F.goalHalfW - R || p[1] > F.goalH - R) return;
    for (const side of [-1, 1]) {
      const gx = F.cx + side * F.hx;
      if (side * (p[0] - gx) > R) {
        // pelota adentro del arco: side=-1 es el arco de Rojo (gol de Azul)
        const team = side < 0 ? 1 : 0;
        this.score[team]++;
        const name = this.lastTouchName || 'alguien';
        this.hooks.broadcast({ t: 'fbgoal', team, by: this.lastTouch, name, score: this.score });
        this.hooks.sys(`⚽ ¡GOOOL de ${team === 0 ? 'ROJO' : 'AZUL'}! (${name}) · Rojo ${this.score[0]} - ${this.score[1]} Azul`);
        this.freezeUntil = Date.now() + 3500;
        this._afterGoal = true;
        return;
      }
    }
  }

  step(dt, now) {
    if (this.running) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.running = false;
        this.timeLeft = 0;
        const [a, b] = this.score;
        this.hooks.sys(a === b ? `⚽ ¡Terminó el partido! Empate ${a}-${b}.` : `⚽ ¡Terminó el partido! Gana ${a > b ? 'ROJO' : 'AZUL'} ${Math.max(a, b)}-${Math.min(a, b)}.`);
        this.hooks.broadcast({ t: 'fbs', st: this.state(), end: 1 });
      }
    }
    if (now < this.freezeUntil) {
      if (!this._afterGoal) return;
      // la pelota queda en la red hasta el saque
      this._world(dt);
      return;
    }
    if (this._afterGoal) { this._afterGoal = false; this._center(); return; }
    const sub = 3;
    const h = dt / sub;
    for (let k = 0; k < sub; k++) {
      this.v[1] -= G * h;
      const sp = Math.hypot(this.v[0], this.v[1], this.v[2]);
      const drag = Math.exp(-0.01 * sp * h);
      this.v[0] *= drag; this.v[1] *= drag; this.v[2] *= drag;
      this.p[0] += this.v[0] * h; this.p[1] += this.v[1] * h; this.p[2] += this.v[2] * h;
      this._players(h);
      this._world(h);
      this._checkGoal();
      if (now < this.freezeUntil) break;
    }
    this._assist(now);
    // afuera: cruzó la línea de costado (lateral) o la de fondo fuera del arco (saque de arco)
    const ox = Math.abs(this.p[0] - F.cx) - F.hx, oz = Math.abs(this.p[2] - F.cz) - F.hz;
    const inGoalMouth = Math.abs(this.p[2] - F.cz) < F.goalHalfW && this.p[1] < F.goalH;
    const out = oz > R || (ox > R && !inGoalMouth) || this.p[1] < -5;
    if (out) {
      if (!this.outSince) this.outSince = now;
      if (now - this.outSince > 900) this._restart(oz > R ? 'lateral' : 'arco');
    } else this.outSince = 0;
  }

  _restart(kind) {
    const p = this.p;
    if (kind === 'lateral') {
      const x = Math.max(F.cx - F.hx + 1, Math.min(F.cx + F.hx - 1, p[0]));
      const z = F.cz + Math.sign(p[2] - F.cz) * (F.hz - 0.7);
      this.p = [x, R + 0.3, z];
    } else {
      const s = Math.sign(p[0] - F.cx) || 1;
      this.p = [F.cx + s * (F.hx - 5.5), R + 0.3, F.cz];
    }
    this.v = [0, 0, 0];
    this.freezeUntil = Date.now() + 700;
    this.outSince = 0;
    this.hooks.broadcast({ t: 'fbout', kind });
  }

  // paquete de red (20 Hz)
  packet() {
    const r = (x) => Math.round(x * 1000) / 1000;
    const out = [r(this.p[0]), r(this.p[1]), r(this.p[2]), r(this.v[0]), r(this.v[1]), r(this.v[2])];
    if (this.kick) { out.push(r(this.kick.s)); this.kick = null; }
    if (this.post) { out.length = 7; out[6] = out[6] || 0; out.push(1); this.post = false; }
    return out;
  }
}
