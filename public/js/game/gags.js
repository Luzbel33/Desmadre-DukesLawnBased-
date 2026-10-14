// Humor físico estilo POSTAL 2. Los gestos de la rueda (mear, vomitar, eructar, pedo, cagarse) tienen sonido y lo que
// sale de verdad, y el encendedor: click = pedo prendido fuego (lanzallamas para atrás).
//  - Mear, vomitar, eructar y el pedo son ACCIONES del torso (char/character.js 'pee', 'puke', 'burp', 'fart'): se
//    puede caminar mientras tanto. Cagarse es un gesto (en cuclillas, quieto).
//  - El chorro (pis o vómito) va adonde apuntás con la mira. Si le pega a alguien (jugador o NPC) lo mancha
//    (HumanCharacter.filth: se seca solo en ~70 s); la caca que revienta también mancha a los de al lado.
//  - Los NPC tienen nariz: se quejan y a veces vomitan del asco (como en POSTAL 2).
// Lo ven y lo oyen todos: evento 'gag' (quién y qué) y 'filth' (a quién manchó y dónde).
import * as THREE from 'three';
import { G } from '../core/G.js';
import { MODELS } from '../char/human.js';

export const GAGS = new Set(['mear', 'vomitar', 'eructar', 'pedo', 'cagar']);
// la acción del cuerpo y cuánto dura (cagar: gesto)
const ACTION = { mear: ['pee', 5.2], vomitar: ['puke', 3.4], eructar: ['burp', 2.0], pedo: ['fart', 2.2] };
const COL = { mear: 0xd8c24a, vomitar: 0x9aa23a, caca: 0x4a2a10 };
const PUDDLE = { mear: 0x8f7a26, vomitar: 0x5f5c22 };
const SAY = {
  mear: ['¡¿ME ESTÁS MEANDO?!', '¡Está caliente! ¡¿Qué es esto?!', '¡Animal! ¡Me measte!', '¡Ehhh, cochino!'],
  vomitar: ['¡¡ME VOMITASTE ENCIMA!!', '¡Buaj, tiene pedazos!', '¡Noooo, la ropa nueva!'],
  caca: ['¡¿Eso es caca?!', '¡Me tiraste mierda!', '¡Qué olor, por favor!'],
};
const SICK = ['¡BUAAJ!', 'Me... me descompongo...', 'Ay no, voy a...', '¡GLUARGH!'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const V1 = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3();

export class Gags {
  // getLocal: el jugador local; getAim: { yaw, pitch } de la mira; net; spawnProp(type, pos, vel); bigMessage; escape
  constructor({ getLocal, getAim, getNet, spawnProp, bigMessage, notify, escape }) {
    Object.assign(this, { getLocal, getAim, getNet, spawnProp, bigMessage, notify, escape });
    this.live = []; // { P, kind, t, mine, done }
    this.hitT = new Map(); // a quién ya manchó hace poco (no mandar un evento por gota)
  }

  // arranca un gag de P (mine: soy yo, lo mando a los demás y pongo el cuerpo)
  start(P, kind, mine) {
    if (!P?.pos) return;
    this.live = this.live.filter((g) => g.P !== P);
    this.live.push({ P, kind, t: 0, mine, done: {} });
    if (!mine) return;
    const a = ACTION[kind];
    if (a) { P.setEmote?.(null); P.setAction?.(a[0], a[1]); } else if (kind === 'cagar') P.setEmote?.('cagar');
    this.getNet()?.send({ t: 'ev', k: 'gag', g: kind });
  }

  // un NPC vomita del asco (con su arcada y su charco), como mucho cada 25 s
  npcPuke(n) {
    if (!n || n.dead || n.down > 0 || (n._pukeT || 0) > (G.time || 0)) return;
    n._pukeT = (G.time || 0) + 25;
    n.say?.(pick(SICK), 2.2);
    setTimeout(() => {
      if (n.dead) return;
      n.action = 'puke'; n.actionT = 0; n.actionEnd = 3.4;
      n.aimPitch = -0.8; setTimeout(() => { n.aimPitch = 0; }, 3500); // del asco se dobla y vomita al piso
      this.live.push({ P: n, kind: 'vomitar', t: 0, mine: false, npc: true, done: {} });
    }, 500 + Math.random() * 700);
  }

  // ---------------------------------------------------------------- dónde está cada cosa
  _pos(P, out) { return P.char?.root && P.npcWorld !== false && !P.stateData && P !== this.getLocal() ? P.char.root.getWorldPosition(out) : out.copy(P.pos); }
  _aim(P) {
    if (P === this.getLocal()) { const a = this.getAim(); return { yaw: a.yaw, pitch: a.pitch }; }
    return { yaw: P.yaw || 0, pitch: P.stateData ? +P.stateData.ap || 0 : +P.aimPitch || 0 };
  }
  _fwd(P) { const y = this._aim(P).yaw; return V2.set(Math.sin(y), 0, Math.cos(y)); }
  _at(P, up, fwd) { const f = this._fwd(P), p = this._pos(P, new THREE.Vector3()); return p.set(p.x + f.x * fwd, p.y + up, p.z + f.z * fwd); }
  _voice(P) { return MODELS[P.look?.model]?.gender === 'f' ? 'burp-f' : 'burp-m'; }

  // los NPC de cerca reaccionan (se quejan; con asco fuerte, vomitan)
  _npcs(P, lines, r = 5, sick = 0) {
    const at = this._pos(P, V3);
    for (const n of G.allNpcs?.() || []) {
      if (n.dead || n === P) continue;
      const d = this._pos(n, V1).distanceTo(at);
      if (d > r || Math.random() < 0.4) continue;
      n.lookAt = at.clone();
      if (sick && d < r * 0.6 && Math.random() < sick) this.npcPuke(n);
      else n.say?.(pick(lines), 2.2);
    }
  }

  // ---------------------------------------------------------------- manchar
  // ¿el chorro que sale de `from` con velocidad `vel` le pega a alguien? (arco con gravedad, cápsulas de cuerpo)
  _trace(P, from, vel, kind) {
    const targets = [];
    const me = this.getLocal();
    for (const rp of G.players?.values() || []) if (rp !== P && rp.pos && !rp.dead) targets.push(rp);
    if (me && me !== P && !me.dead) targets.push(me);
    for (const n of G.allNpcs?.() || []) if (n !== P && !n.dead) targets.push(n);
    const p = V1.copy(from), v = V3.copy(vel), floor = from.y - 2.5;
    for (let i = 0; i < 45 && p.y > floor; i++) {
      v.y -= 9.8 * 0.03; p.addScaledVector(v, 0.03);
      for (const t of targets) {
        const tp = this._pos(t, V2);
        if (p.y < tp.y + 0.05 || p.y > tp.y + 1.85) continue;
        if ((p.x - tp.x) ** 2 + (p.z - tp.z) ** 2 < 0.3 * 0.3) { this._hit(P, t, p.clone(), kind); return; }
      }
    }
  }
  _hit(P, t, at, kind) {
    const now = G.time || 0;
    if ((this.hitT.get(t) || 0) > now) return;
    this.hitT.set(t, now + 0.3);
    t.char?.filth?.(at, COL[kind], kind === 'vomitar' ? 1.4 : 1);
    G.sfx?.trigger('hit', at, 0.12, { full: 2, max: 10, rate: 1.6 });
    if (t.stateData && t.id != null) this.getNet()?.send({ t: 'ev', k: 'filth', to: t.id, f: kind, p: at.toArray().map((v) => Math.round(v * 100) / 100) });
    else if (!t.stateData && t !== this.getLocal()) { // un NPC: se queja (cada tanto) o vomita del asco
      if ((t._gagSay || 0) < now) { t._gagSay = now + 2.5; t.lookAt = this._pos(P, new THREE.Vector3()); if (Math.random() < 0.3) this.npcPuke(t); else t.say?.(pick(SAY[kind] || SAY.mear), 2.2); }
    }
  }
  // me mancharon a mí (o a otro, visto desde acá): llega por evento
  remoteFilth(m, by) {
    const at = Array.isArray(m.p) && m.p.length === 3 && m.p.every(Number.isFinite) ? new THREE.Vector3().fromArray(m.p) : null;
    if (!at || !COL[m.f]) return;
    const me = this.getLocal();
    const t = m.to === G.myId ? me : G.players?.get(m.to);
    if (!t || t.pos.distanceTo(at) > 3) return;
    t.char?.filth?.(at, COL[m.f], m.f === 'vomitar' ? 1.4 : 1);
    if (t === me && by) {
      const now = G.time || 0;
      if ((this._noteT || 0) < now) { this._noteT = now + 4; this.notify?.(`${m.f === 'mear' ? '💦' : m.f === 'vomitar' ? '🤮' : '💩'} ${this.escape(by.name)} ${m.f === 'mear' ? 'te está meando encima' : m.f === 'vomitar' ? 'te vomitó encima' : 'te enchastró'}.`); }
    }
  }
  // la caca revienta: mancha a los que estaban al lado
  splat(pos) {
    const me = this.getLocal();
    const near = [...(G.players?.values() || []), ...(me ? [me] : []), ...(G.allNpcs?.() || [])];
    for (const t of near) {
      if (!t?.pos || t.dead) continue;
      const tp = this._pos(t, V2);
      if (Math.hypot(tp.x - pos.x, tp.z - pos.z) > 0.9 || pos.y < tp.y - 0.2 || pos.y > tp.y + 2) continue;
      t.char?.filth?.(V3.set(tp.x, Math.max(tp.y + 0.3, Math.min(tp.y + 1.6, pos.y)), tp.z).lerp(pos, 0.4), COL.caca, 1.6);
      if (!t.stateData && t !== me) { t.say?.(pick(SAY.caca), 2.2); if (Math.random() < 0.5) this.npcPuke(t); }
    }
    this._npcs({ pos }, ['¡Qué asco!', '¡Eso es caca!'], 4, 0.15);
  }

  // ---------------------------------------------------------------- por cuadro
  update(dt) {
    const me = this.getLocal();
    for (let i = this.live.length - 1; i >= 0; i--) {
      const g = this.live[i], P = g.P, t = (g.t += dt), once = (k, at) => (t >= at && !g.done[k] ? (g.done[k] = true) : false);
      // el mío se corta si la acción se cortó (me pegaron, me caí, agarré otra cosa)
      const act = ACTION[g.kind]?.[0];
      if (!P.pos || P.dead || (P === me && g.mine && g.kind !== 'fuego' && t > 0.2 && (act ? P.action !== act : P.emote !== g.kind))) { this._end(g); this.live.splice(i, 1); continue; }
      const f = this._fwd(P).clone(), aim = this._aim(P), cp = Math.cos(aim.pitch), sp = Math.sin(aim.pitch);
      if (g.kind === 'mear') {
        if (t > 0.55 && t < 4.6) {
          // ella en cuclillas: sale de abajo, corto y hacia el piso (no se apunta); él, adonde apunta
          const fem = MODELS[P.look?.model]?.gender === 'f';
          const from = fem ? this._at(P, 0.36, 0.08) : this._at(P, 0.88, 0.2);
          const dir = fem ? V1.set(f.x * 0.35, -0.75, f.z * 0.35).normalize() : V1.set(f.x * cp, sp + 0.25, f.z * cp).normalize(), speed = fem ? 1.6 : 3.7;
          G.fx?.liquid(from, dir, 3, speed, COL.mear, (q) => G.blood?.add(q.x, q.z, 0.1 + Math.random() * 0.08, PUDDLE.mear, (q.y ?? 0) + 0.031, 120, 0.55));
          const step = Math.floor((t - 0.55) / 1.1);
          if (once('s' + step, 0.55 + step * 1.1)) G.sfx?.trigger('pee', this._at(P, 0.3, 0.9), 0.55, { full: 2, max: 14 });
          if (g.mine && once('h' + Math.floor(t / 0.15), Math.floor(t / 0.15) * 0.15)) this._trace(P, from, dir.clone().multiplyScalar(speed), 'mear');
        }
        if (once('ahh', 1.2)) G.sfx?.trigger(this._voice(P) === 'burp-f' ? 'ahh-f1' : 'ahh-m', this._pos(P, V3), 0.45, { full: 2, max: 14 });
        if (once('nose', 2)) this._npcs(P, ['¡Andá al baño, cochino!', '¡Acá no se mea!', '¡Ehhh, la puta madre!'], 5, 0.06);
        if (t > 5.3) { this.live.splice(i, 1); continue; }
      } else if (g.kind === 'vomitar') {
        if (once('retch', 0.35)) G.sfx?.trigger('retch', this._pos(P, V3), 0.85, { full: 2, max: 18 });
        // tres arcadas (las mismas de la animación 'puke': 1.0, 1.6 y 2.1 s), casi seguidas: un chorro a presión que va
        // adonde apuntás (arriba, al frente, a la cara de alguien o al piso), como en POSTAL 2
        for (const [c, w] of [[1.0, 0.5], [1.6, 0.42], [2.1, 0.32]]) {
          if (t > c - 0.05 && t < c + w) {
            const m = P.char?.mouthWorld ? P.char.mouthWorld(new THREE.Vector3()) : this._at(P, 1.45, 0.2);
            const pp = Math.max(-1.45, aim.pitch - 0.1), dir = V1.set(f.x * Math.cos(pp), Math.sin(pp), f.z * Math.cos(pp)).normalize();
            const surge = Math.max(0, 1 - (t - c) / w); // cada arcada sale con todo y se va apagando
            const speed = (c === 1.0 ? 5.6 : 4.6) * (0.55 + 0.45 * surge);
            G.fx?.liquid(m, dir, 5, speed, Math.random() < 0.5 ? 0x9a9a2a : 0xb0a040, (q) => G.blood?.add(q.x, q.z, 0.12 + Math.random() * 0.1, PUDDLE.vomitar, (q.y ?? 0) + 0.031, 140, 0.7));
            G.fx?.vomit(m, dir, speed);
            if (g.mine && once('h' + c + Math.floor(t / 0.1), 0)) this._trace(P, m, dir.clone().multiplyScalar(speed), 'vomitar');
          }
        }
        if (once('nose', 1.4) && !g.npc) this._npcs(P, ['¡Qué asco!', '¡Ehh, en el piso no!', 'Uh, se descompuso.'], 5, 0.2);
        if (t > 3.5) { this.live.splice(i, 1); continue; }
      } else if (g.kind === 'eructar') {
        if (once('b', 0.5)) {
          G.sfx?.trigger(this._voice(P), this._pos(P, V3), 1, { full: 3, max: 22, rate: 0.85 + Math.random() * 0.2 });
          G.fx?.puff(P.char?.mouthWorld?.(new THREE.Vector3()) || this._at(P, 1.5, 0.2), f, 0.3, 0xd8d0b0);
          this._npcs(P, ['¡Qué ordinario!', '¡Salud... digo, provecho!', 'Ese vino de adentro.'], 4);
        }
        if (t > 2) { this.live.splice(i, 1); continue; }
      } else if (g.kind === 'pedo') {
        if (once('f', 0.55)) {
          const butt = this._at(P, 0.95, -0.18);
          G.sfx?.trigger('fart', butt, 1, { full: 3, max: 24 });
          G.fx?.puff(butt, V1.set(-f.x * 0.6, 0.1, -f.z * 0.6), 0.7, 0x9a8a48);
          this._npcs(P, ['¡Qué baranda!', '¡¿Quién fue?!', 'Ay no, el que se lo tiró...', '¡Andá al baño, che!'], 5, 0.12);
        }
        if (t > 2.5) { this.live.splice(i, 1); continue; }
      } else if (g.kind === 'cagar') {
        if (once('strain', 0.9)) G.sfx?.trigger('pain', this._pos(P, V3), 0.35, { full: 2, max: 10, rate: 0.7 });
        if (once('plop', 2.1)) {
          const at = this._at(P, 0.22, -0.12);
          G.sfx?.trigger('plop', at, 0.9, { full: 2, max: 16 });
          G.sfx?.trigger('fart', at, 0.5, { full: 2, max: 14, rate: 1.3 });
          if (g.mine) this.spawnProp('poop', at, { x: 0, y: -0.5, z: 0 });
          this._npcs(P, ['¡NO! ¡Acá no!', '¡Un animal!', 'Esto no lo limpio yo.'], 6, 0.3);
        }
        if (t > 3.9) { this.live.splice(i, 1); continue; }
      } else if (g.kind === 'fuego') {
        // el encendedor: chispazo, pedo y la llamarada para atrás un segundo y medio
        if (once('click', 0.3)) G.sfx?.trigger('lighter', this._pos(P, V3), 0.6, { full: 2, max: 12 });
        if (once('f', 0.42)) G.sfx?.trigger('fart', this._at(P, 0.95, -0.2), 1, { full: 3, max: 26, rate: 0.85 });
        if (t > 0.45 && t < 1.95) {
          const butt = this._at(P, 0.92, -0.25), back = V3.set(-f.x, 0.08, -f.z);
          for (let k = 0; k < 6; k++) {
            const s = 5 + Math.random() * 4, sx = (Math.random() - 0.5) * 1.6, sy = (Math.random() - 0.5) * 1.2;
            G.fx?.glow.spawn({ x: butt.x, y: butt.y, z: butt.z, vx: back.x * s + f.z * sx, vy: back.y * s + sy, vz: back.z * s - f.x * sx,
              life: 0.35 + Math.random() * 0.25, s0: 0.12, s1: 0.55, r: 1, g: 0.45 + Math.random() * 0.3, b: 0.12, a0: 0.95, a1: 0, drag: 1.5, grav: 1.5 });
          }
          if (!g.light) { g.light = { position: butt.clone(), color: new THREE.Color(0xff8a30), intensity: 40, distance: 9, decay: 1.6, visible: true, priority: 6, base: 40 }; G.world?.pool?.add(g.light); }
          g.light.position.copy(butt); g.light.intensity = 30 + Math.random() * 20;
          if (g.mine && once('hit' + Math.floor(t / 0.25), Math.floor(t / 0.25) * 0.25)) this._burn(P, butt, back.clone());
        }
        if (t >= 1.95) this._end(g);
        if (t > 2.4) { this.live.splice(i, 1); continue; }
      }
    }
  }
  _end(g) { if (g.light) { G.world?.pool?.remove?.(g.light); g.light.visible = false; g.light.intensity = 0; g.light = null; } }
  // a quién le llega la llamarada (detrás tuyo, hasta 4,5 m, en un cono)
  _burn(P, from, dir) {
    const inCone = (p) => { const d = V1.copy(p).sub(from); const l = d.length(); return l < 4.5 && d.normalize().dot(dir) > 0.75; };
    for (const n of G.allNpcs?.() || []) if (!n.dead && inCone(this._pos(n, V2).setY(V2.y + 1))) { n.ignite?.(4); n.say?.('¡ME PRENDISTE FUEGO EL ORTO... DIGO, EL CULO!', 2); }
    for (const rp of G.players?.values() || []) if (rp.pos && inCone(V2.copy(rp.pos).setY(rp.pos.y + 1))) this.getNet()?.send({ t: 'ev', k: 'fartburn', to: rp.id });
    // a veces te quemás vos
    const me = this.getLocal();
    if (P === me && Math.random() < 0.06 && !me.immortal) { G.owner?.ignite('me', 2); this.getNet()?.send({ t: 'ev', k: 'onfire', d: 2 }); this.bigMessage?.('🔥', 'Te quemaste la cola', 1400); }
  }
}
