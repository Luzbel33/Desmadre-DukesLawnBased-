// Una sala (lobby) del juego: estado compartido y relay de mensajes.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { isOwnerName, checkOwnerKey, allowTry } from './owner.js';
import {
  PROTOCOL, GRASSMAP, GRASS, SURFACES, SURFACE_BY_ID, SCREENS, VEHICLES, PROPS, FIELD, PAINT, parsePatch, grassAllowed, CLUB, CASTLE,
} from '../public/js/shared/mapdata.js';
import { applyDots, cutRect, growAll, fieldMask, mowField, DOT_BYTES } from '../public/js/shared/raster.js';
import { Football } from './football.js';
import { PokerTable } from './poker.js';
import { DEMON_FIRE as FIRE, fireVector, fireShot } from '../public/js/shared/demon-fire.js';

const MAX_PLAYERS = 24;
const SNAP_MS = 50;
const MAX_DYNAMIC_PROPS = 260;
const PROP_RESPAWN_MS = 75_000;
const COLORS = ['#ff5b5b', '#ffb13b', '#ffe45b', '#7dff6b', '#4de8ff', '#6b8cff', '#c76bff', '#ff6bd5', '#ffffff'];

const r3 = (v) => Math.round(v * 1000) / 1000;
const r4 = (v) => Math.round(v * 10000) / 10000;
const clampStr = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, n);

function yawQuat(yaw) {
  return [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
}

export class Room {
  constructor(name, dataRoot) {
    this.name = name;
    this.dir = path.join(dataRoot, name);
    this.players = new Map();
    this.nextId = 1;
    this.chatHistory = [];
    this.chatSequence = 0;
    this.chatEpoch = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    this.firePatches = []; // temporary; never persisted with the world
    this.settings = { desmadre: false };
    this.props = new Map();
    this.dirtyProps = new Set();
    this.vehicles = new Map();
    this.dirtyVeh = new Set();
    this.media = new Map();
    this.graffiti = new Map();
    this.grass = {
      hgt: grassAllowed().map((a) => (a ? 255 : 0)),
      dir: new Uint8Array(GRASSMAP.w * GRASSMAP.h),
      tick: 0,
      dirty: false,
    };
    this.lastGrow = Date.now();
    this.lastSave = Date.now();

    for (const pr of PROPS) this._addMapProp(pr);
    for (const v of VEHICLES) {
      this.vehicles.set(v.id, {
        id: v.id, type: v.type, color: v.color,
        spawn: { p: [...v.p], q: yawQuat(v.yaw) },
        p: [...v.p], q: yawQuat(v.yaw), o: 0, seats: v.type === 'mower' ? [0] : [0, 0],
        s: [0, 0, 0], idleSince: Date.now(),
      });
    }
    for (const s of SCREENS) this.media.set(s.id, { queue: [], cur: null });
    this.poker = new PokerTable('bar', 6, {
      broadcast: (o) => this.broadcast(o),
      sendTo: (pid, o) => { const pl = this.players.get(pid); if (pl) this.send(pl, o); },
      sys: (m) => this.sys(m, '#ffd98a'),
    });
    for (const s of SURFACES) this.graffiti.set(s.id, { buf: null, w: s.pw, h: s.ph, dirty: false });
    this.patchCount = 0; // parches de pintura libre creados (tope PAINT.maxPatches)
    this._load();
    // la cancha siempre queda cortita y con franjas
    this.fieldMask = fieldMask(FIELD);
    // no crecen: la cancha (siempre corta) y el piso duro (sin pasto)
    const allowed = grassAllowed();
    this.noGrow = this.fieldMask.map((f, k) => (f || !allowed[k] ? 1 : 0));
    mowField(this.grass.hgt, this.grass.dir, FIELD, this.fieldMask, GRASS.cutHeight);
    this.football = new Football({
      broadcast: (o) => this.broadcast(o),
      sys: (m) => this.sys(m, '#9fe08a'),
      players: () => this.players.values(),
    });
  }

  _addMapProp(pr) {
    const q = yawQuat(pr.yaw || 0);
    this.props.set(pr.id, {
      id: pr.id, type: pr.type, p: [...pr.p], q, o: 0, h: 0,
      spawn: { p: [...pr.p], q: [...q] }, dyn: false, gone: false, goneAt: 0, touched: Date.now(),
    });
  }

  get count() { return this.players.size; }

  // ------------------------------------------------------------------ persistencia
  _load() {
    try {
      const g = path.join(this.dir, 'grass.bin');
      if (fs.existsSync(g)) {
        const raw = zlib.inflateSync(fs.readFileSync(g));
        const n = GRASSMAP.w * GRASSMAP.h;
        if (raw.length === n * 2) {
          this.grass.hgt.set(raw.subarray(0, n));
          this.grass.dir.set(raw.subarray(n));
        }
      }
    } catch (e) { console.warn('[sala', this.name, '] no pude cargar el pasto:', e.message); }
    // parches de pintura libre guardados
    try {
      const gdir = path.join(this.dir, 'graffiti');
      if (fs.existsSync(gdir)) {
        for (const f of fs.readdirSync(gdir)) {
          if (!f.startsWith('p') || !f.endsWith('.rgba.z')) continue;
          const id = f.slice(0, -'.rgba.z'.length);
          const def = parsePatch(id);
          if (def && this.patchCount < PAINT.maxPatches) {
            this.graffiti.set(id, { buf: null, w: def.pw, h: def.ph, dirty: false });
            this.patchCount++;
          }
        }
      }
    } catch (e) { console.warn('[sala', this.name, '] parches', e.message); }
    for (const [id, s] of this.graffiti) {
      try {
        const f = path.join(this.dir, 'graffiti', id + '.rgba.z');
        if (!fs.existsSync(f)) continue;
        const raw = zlib.inflateSync(fs.readFileSync(f));
        if (raw.length === s.w * s.h * 4) {
          s.buf = new Uint8ClampedArray(raw.buffer, raw.byteOffset, raw.byteLength).slice();
        }
      } catch (e) { console.warn('[sala', this.name, '] graffiti', id, e.message); }
    }
  }

  save(force = false) {
    try {
      fs.mkdirSync(path.join(this.dir, 'graffiti'), { recursive: true });
      if (this.grass.dirty || force) {
        const buf = Buffer.concat([Buffer.from(this.grass.hgt), Buffer.from(this.grass.dir)]);
        fs.writeFileSync(path.join(this.dir, 'grass.bin'), zlib.deflateSync(buf, { level: 6 }));
        this.grass.dirty = false;
      }
      for (const [id, s] of this.graffiti) {
        if (!s.dirty || !s.buf) continue;
        const b = Buffer.from(s.buf.buffer, s.buf.byteOffset, s.buf.byteLength);
        fs.writeFileSync(path.join(this.dir, 'graffiti', id + '.rgba.z'), zlib.deflateSync(b, { level: 6 }));
        s.dirty = false;
      }
    } catch (e) {
      console.warn('[sala', this.name, '] error guardando:', e.message);
    }
  }

  // ------------------------------------------------------------------ envío
  send(p, obj) {
    if (p.ws.closed) return;
    if (p.ws.bufferedAmount > 12 * 1024 * 1024) { p.ws.close(1008); return; }
    p.ws.send(typeof obj === 'string' || obj instanceof Uint8Array ? obj : JSON.stringify(obj));
  }
  broadcast(obj, except = null) {
    const data = typeof obj === 'string' || obj instanceof Uint8Array ? obj : JSON.stringify(obj);
    for (const p of this.players.values()) if (p !== except && p.ready) this.send(p, data);
  }
  sys(m, color) {
    this.broadcast({ t: 'sys', m, c: color });
  }

  // ------------------------------------------------------------------ jugadores
  accept(ws) {
    if (this.players.size >= MAX_PLAYERS) {
      ws.send(JSON.stringify({ t: 'err', m: 'La sala está llena (máximo ' + MAX_PLAYERS + ').' }));
      ws.close(1013);
      return;
    }
    const p = {
      id: this.nextId++, ws, name: 'Anónimo', look: {}, st: null, stDirty: false, ready: false,
      color: COLORS[(this.nextId - 2) % COLORS.length], rate: 0, rateT: Date.now(), lastChat: 0,
    };
    ws.on('message', (data, isBin) => {
      try { this.onMessage(p, data, isBin); } catch (e) { console.warn('msg error', e); }
    });
    ws.on('close', () => this.remove(p));
  }

  remove(p) {
    if (!this.players.has(p.id)) return;
    this.players.delete(p.id);
    // soltar props y vehículos
    for (const pr of this.props.values()) {
      if (pr.o === p.id || pr.h === p.id) {
        pr.o = 0; pr.h = 0;
        this.broadcast({ t: 'po', id: pr.id, o: 0, h: 0 });
      }
    }
    for (const v of this.vehicles.values()) {
      let ch = false;
      v.seats = v.seats.map((s) => { if (s === p.id) { ch = true; return 0; } return s; });
      if (v.o === p.id) { v.o = 0; ch = true; }
      if (!v.seats[0]) this._parkVehicle(v);
      if (ch) this.broadcast({ t: 'vs', id: v.id, seats: v.seats, o: v.o });
    }
    this.poker.leave(p.id);
    this.broadcast({ t: 'pleave', id: p.id });
    if (p.ready) this.sys(p.name + ' se fue del lobby.');
  }

  join(p, msg) {
    if (msg.v !== PROTOCOL) {
      this.send(p, { t: 'err', m: 'Tu versión del juego es vieja: recargá la página (Ctrl+F5).' });
      p.ws.close(1008);
      return;
    }
    p.name = clampStr(msg.name, 20) || 'Anónimo';
    // SmokePyro es el dueño: el nombre está reservado y solo entra con la clave (y ahí tiene al Diablo y sus poderes)
    if (isOwnerName(p.name)) {
      if (!allowTry(p.ws.ip || '') || !checkOwnerKey(msg.key)) {
        this.send(p, { t: 'err', m: 'El nombre SmokePyro está reservado.' });
        p.ws.close(1008);
        return;
      }
      p.owner = true;
    }
    p.look = sanitizeLook(msg.look, p.owner);
    p.ready = true;
    this.players.set(p.id, p);
    const players = [];
    for (const o of this.players.values()) {
      if (o !== p) players.push({ id: o.id, name: o.name, look: o.look, color: o.color, st: o.st, owner: o.owner ? 1 : 0, inv: o.inv ? 1 : 0 });
    }
    const props = [];
    for (const pr of this.props.values()) {
      if (pr.gone) continue;
      props.push([pr.id, pr.type, ...pr.p.map(r3), ...pr.q.map(r4), pr.o, pr.h]);
    }
    const vehicles = [];
    for (const v of this.vehicles.values()) {
      vehicles.push({ id: v.id, p: v.p.map(r3), q: v.q.map(r4), o: v.o, seats: v.seats });
    }
    const media = {};
    for (const [id, m] of this.media) media[id] = m;
    this.send(p, {
      t: 'welcome', id: p.id, color: p.color, now: Date.now(), room: this.name, owner: p.owner ? 1 : 0,
      players, props, vehicles, media, settings: this.settings, gtick: this.grass.tick,
      chatHistory: this.chatHistory,
      fires: this.firePatches.filter(f=>f.end>Date.now()).map(f=>({id:f.id,p:f.p,n:f.n,life:(f.end-Date.now())/1000})),
      poker: this.poker.publicState(),
      fb: this.football.state(),
    });
    // pasto (binario)
    this.send(p, this._grassPacket());
    // graffiti (binario, solo superficies pintadas)
    for (const [id, s] of this.graffiti) {
      if (!s.buf) continue;
      this.send(p, this._surfacePacket(id, s));
    }
    this.send(p, { t: 'ready' });
    this.broadcast({ t: 'pjoin', p: { id: p.id, name: p.name, look: p.look, color: p.color, st: null, owner: p.owner ? 1 : 0 } }, p);
    this.sys(p.name + ' entró al lobby. ¡Bienvenido/a!');
  }

  _grassPacket() {
    const n = GRASSMAP.w * GRASSMAP.h;
    const raw = Buffer.allocUnsafe(n * 2);
    raw.set(this.grass.hgt, 0);
    raw.set(this.grass.dir, n);
    const z = zlib.deflateSync(raw, { level: 4 });
    const head = Buffer.alloc(9);
    head[0] = 1;
    head.writeUInt32LE(this.grass.tick, 1);
    head.writeUInt16LE(GRASSMAP.w, 5);
    head.writeUInt16LE(GRASSMAP.h, 7);
    return Buffer.concat([head, z]);
  }

  _surfacePacket(id, s) {
    const idb = Buffer.from(id, 'utf8');
    const z = zlib.deflateSync(Buffer.from(s.buf.buffer, s.buf.byteOffset, s.buf.byteLength), { level: 4 });
    const head = Buffer.alloc(2 + idb.length + 4);
    head[0] = 2;
    head[1] = idb.length;
    idb.copy(head, 2);
    head.writeUInt16LE(s.w, 2 + idb.length);
    head.writeUInt16LE(s.h, 4 + idb.length);
    return Buffer.concat([head, z]);
  }

  // ------------------------------------------------------------------ mensajes
  onMessage(p, data, isBin) {
    // límite de mensajes por segundo (anti-flood)
    const now = Date.now();
    if (now - p.rateT > 1000) { p.rate = 0; p.rateT = now; }
    if (++p.rate > 400) { p.ws.close(1008); return; }

    if (isBin) return this.onBinary(p, data);
    if (data.length > 256 * 1024) return;
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    if (!p.ready) {
      if (msg.t === 'join') this.join(p, msg);
      return;
    }
    switch (msg.t) {
      case 'st':
        if (msg.s && typeof msg.s === 'object') {
          const now2 = Date.now();
          if (p.st?.rb) { p.fbPrev = p.st.rb; p.fbPrevDt = now2 - (p.stT || now2); }
          p.stT = now2;
          p.st = msg.s;
          p.stDirty = true;
        }
        break;
      case 'fbctl':
        this.football.control(p, String(msg.a || ''));
        break;
      case 'ping':
        this.send(p, { t: 'pong', c: msg.c, s: Date.now() });
        break;
      case 'chat': this.onChat(p, msg); break;
      case 'ev':
        // quemar a alguien con el fuego de la boca: solo el dueño
        if (msg.k === 'burn' && (!p.owner || p.look.model !== 'diablo')) break;
        if(msg.k==='burn') {
          if(!this.players.has(msg.to)||msg.to===p.id)break;
          if(msg.mode==='ball') {
            const hit=fireVector(msg.p),shot=p.fireShots?.get(String(msg.shot));
            if(!hit||!shot||now-shot.time>4000||shot.targets.has(msg.to))break;
            if(Math.hypot(...hit.map((n,i)=>n-shot.o[i]))>FIRE.ballRange+1)break;
            const target=fireVector(this.players.get(msg.to).st?.p);
            if(!target||Math.hypot(hit[0]-target[0],hit[2]-target[2])>FIRE.blastRadius+.5||Math.abs(hit[1]-target[1])>3)break;
            shot.targets.add(msg.to);msg.p=hit;msg.shot=String(msg.shot);
          }
          msg.s=Math.max(0,Math.min(1,+msg.s||0));
        }
        msg.id = p.id;
        this.broadcast(msg, p);
        break;
      case 'pow': // poderes del dueño: invisible, fuego por la boca, risa
        if (!p.owner || p.look.model !== 'diablo') break;
        if (msg.a === 'ritual') {
          // los pentagramas: el del cuarto secreto (castillo) lleva al Búnker y el del Búnker vuelve al castillo. El
          // Diablo parado adentro se lleva a los que elija de los que también están parados ahí (cada 6 s como mucho)
          const F0 = CASTLE.keep.floor;
          const at = (P, y) => (q) => Array.isArray(q?.st?.p) && Math.hypot(q.st.p[0] - P.x, q.st.p[2] - P.z) < P.r + 0.6 && Math.abs(q.st.p[1] - y) < 1.6;
          const onCastle = at(CLUB.pentagram, F0), onBunker = at(CLUB.pentagram2, 0);
          const on = onCastle(p) ? onCastle : onBunker(p) ? onBunker : null;
          if (!on || now - (p.lastRitual || 0) < 6000) break;
          p.lastRitual = now;
          const ids = (Array.isArray(msg.ids) ? msg.ids : []).slice(0, 16).map(Number).filter((id) => id !== p.id && this.players.has(id) && on(this.players.get(id)));
          this.broadcast({ t: 'pow', id: p.id, a: 'ritual', ids: [...new Set(ids)], to: on === onCastle ? 'bunker' : 'castle' });
          break;
        }
        if (msg.a === 'inv') {
          p.inv = !!msg.v;
          this.broadcast({ t: 'pow', id: p.id, a: 'inv', v: p.inv ? 1 : 0 }, p);
        } else if (msg.a === 'fire') {
          const d=fireVector(msg.d),length=d?Math.hypot(...d):0;
          this.broadcast({t:'pow',id:p.id,a:'fire',v:msg.v?1:0,...(length>.001?{d:d.map(n=>n/length)}:{})},p);
        }
        else if(msg.a==='ball') {
          const shot=fireShot(msg.o,msg.d,p.st?.p),key=String(msg.shot||'');
          if(!shot||!/^\d{1,10}$/.test(key)||now-(p.lastFireBall||0)<FIRE.ballCooldown*1000)break;
          p.fireShots||=new Map();
          for(const [id,s]of p.fireShots)if(now-s.time>4000)p.fireShots.delete(id);
          if(p.fireShots.has(key))break;
          p.lastFireBall=now;p.fireShots.set(key,{...shot,time:now,targets:new Set()});
          this.broadcast({t:'pow',id:p.id,a:'ball',shot:key,...shot},p);
        }
        else if(msg.a==='patch') {
          const point=fireVector(msg.p),normal=fireVector(msg.n),caster=fireVector(p.st?.p);
          if(!point||!normal||!caster||Math.hypot(...normal)<.001||Math.hypot(...point.map((n,i)=>n-caster[i]))>FIRE.ballRange+4||now-(p.lastFirePatch||0)<250)break;
          p.lastFirePatch=now;const len=Math.hypot(...normal),n=normal.map(v=>v/len);
          this.firePatches=this.firePatches.filter(f=>f.end>now);
          let patch=this.firePatches.find(f=>f.id===p.id&&Math.hypot(...f.p.map((v,i)=>v-point[i]))<.65);
          if(!patch){if(this.firePatches.length>=FIRE.maxPatches)this.firePatches.shift();patch={};this.firePatches.push(patch);}
          Object.assign(patch,{id:p.id,p:point,n,end:now+FIRE.patchSeconds*1000});
          this.broadcast({t:'pow',id:p.id,a:'patch',p:point,n,life:FIRE.patchSeconds},p);
        }
        else if (msg.a === 'laugh') this.broadcast({ t: 'pow', id: p.id, a: 'laugh', v: Math.max(0, Math.min(2, msg.v | 0)) }, p);
        break;
      case 'look':
        p.look = sanitizeLook(msg.look, p.owner);
        if (p.look.model !== 'diablo' && p.owner) {
          p.inv = false;
          this.broadcast({t:'pow', id:p.id, a:'inv', v:0}, p);
          this.broadcast({t:'pow', id:p.id, a:'fire', v:0}, p);
        }
        this.broadcast({ t: 'look', id: p.id, look: p.look }, p);
        break;
      case 'cut': this.onCut(p, msg); break;
      case 'pc': this.onPropClaim(p, msg); break;
      case 'ph': this.onPropHold(p, msg); break;
      case 'ps': this.onPropState(p, msg); break;
      case 'pn': this.onPropSpawn(p, msg); break;
      case 'pd': this.onPropDelete(p, msg); break;
      case 've': this.onVehEnter(p, msg); break;
      case 'vx': this.onVehExit(p, msg); break;
      case 'vc': this.onVehClaim(p, msg); break;
      case 'vu': this.onVehState(p, msg); break;
      case 'vr': this.onVehReset(p, msg); break;
      case 'media': this.onMedia(p, msg); break;
      case 'pk':
        if (msg.a === 'sit') this.poker.sit(p.id, p.name, msg.seat | 0);
        else if (msg.a === 'leave') this.poker.leave(p.id);
        else if (msg.a === 'act') this.poker.action(p.id, String(msg.act || ''), +msg.amt || 0);
        else if (msg.a === 'rebuy') this.poker.rebuy(p.id);
        else if (msg.a === 'sitin') this.poker.sitIn(p.id);
        break;
      case 'rtc': {
        const to = this.players.get(msg.to);
        if (to) this.send(to, { t: 'rtc', from: p.id, d: msg.d });
        break;
      }
      case 'set':
        if (msg.k === 'desmadre') {
          this.settings.desmadre = !!msg.v;
          this.broadcast({ t: 'set', settings: this.settings });
          this.sys(this.settings.desmadre
            ? '☠ ' + p.name + ' activó el MODO DESMADRE: PvP y gore en todo el mapa.'
            : '☮ ' + p.name + ' desactivó el modo desmadre: PvP solo en el bar.', this.settings.desmadre ? '#ff5b5b' : '#7dff6b');
        }
        break;
    }
  }

  onChat(p, msg) {
    const now = Date.now();
    if (now - p.lastChat < 350) return;
    p.lastChat = now;
    const m = clampStr(msg.m, 240);
    if (!m) return;
    // A private audience is explicit: invalid/empty lists never fall back to public.
    if (Object.prototype.hasOwnProperty.call(msg, 'to')) {
      const to = Array.isArray(msg.to) ? [...new Set(msg.to.filter(id => Number.isSafeInteger(id) && id !== p.id && this.players.get(id)?.ready))].slice(0, MAX_PLAYERS) : [];
      if (!to.length) { this.send(p, { t: 'sys', m: 'No se envió el susurro: elegí al menos un jugador conectado.' }); return; }
      const packet = this._chatPacket(p, m, now);
      packet.to = to;
      packet.recipients = to.map(id => ({ id, name: this.players.get(id).name }));
      this.send(p, packet);
      for (const id of to) this.send(this.players.get(id), packet);
      return;
    }
    if (m.startsWith('/dados')) {
      const n = 1 + Math.floor(Math.random() * 6);
      const n2 = 1 + Math.floor(Math.random() * 6);
      this.sys('🎲 ' + p.name + ' tiró los dados: ' + n + ' y ' + n2 + (n === n2 ? ' ¡PARES!' : ''));
      return;
    }
    if (m.startsWith('/moneda')) {
      this.sys('🪙 ' + p.name + ' tiró una moneda: ' + (Math.random() < 0.5 ? 'CARA' : 'CECA'));
      return;
    }
    const packet = this._chatPacket(p, m, now);
    this.chatHistory.push(packet);
    if (this.chatHistory.length > 200) this.chatHistory.splice(0, this.chatHistory.length - 200);
    this.broadcast(packet); // Sender acknowledgement avoids optimistic duplicates.
  }

  _chatPacket(p, m, ts) {
    this.chatSequence = (this.chatSequence || 0) + 1;
    return { t: 'chat', id: p.id, name: p.name, c: p.color, m, ts, mid: (this.chatEpoch || 'session') + ':' + this.chatSequence };
  }

  onBinary(p, data) {
    if (!p.ready || data.length < 3) return;
    const type = data[0];
    if (type === 3) {
      // lote de aerosol: [3][idLen][id][u16 count][puntos]
      const idLen = data[1];
      const id = data.subarray(2, 2 + idLen).toString('utf8');
      let s = this.graffiti.get(id);
      if (!s) {
        // pintura libre: el id describe el parche; se crea la primera vez que alguien lo pinta
        const def = parsePatch(id);
        if (!def || this.patchCount >= PAINT.maxPatches) return;
        s = { buf: null, w: def.pw, h: def.ph, dirty: false };
        this.graffiti.set(id, s);
        this.patchCount++;
      } else if (!SURFACE_BY_ID[id] && id[0] !== 'p') return;
      const off = 2 + idLen;
      if (data.length < off + 2) return;
      const count = Math.min(data.readUInt16LE(off), 512);
      if (data.length < off + 2 + count * DOT_BYTES) return;
      if (!s.buf) s.buf = new Uint8ClampedArray(s.w * s.h * 4);
      applyDots(s.buf, s.w, s.h, data, off + 2, count);
      s.dirty = true;
      this.broadcast(data, p);
    }
  }

  onCut(p, msg) {
    if (!Array.isArray(msg.s)) return;
    const list = msg.s.slice(0, 64);
    const out = [];
    for (const st of list) {
      if (!Array.isArray(st) || st.length < 5) continue;
      const [x, z, a, hw, hl] = st.map(Number);
      if (![x, z, a, hw, hl].every(Number.isFinite)) continue;
      if (hw > 2.5 || hl > 3 || hw <= 0 || hl <= 0) continue;
      cutRect(this.grass.hgt, this.grass.dir, x, z, a, hw, hl, GRASS.cutHeight);
      out.push([r3(x), r3(z), r4(a), r3(hw), r3(hl)]);
    }
    if (out.length) {
      this.grass.dirty = true;
      this.broadcast({ t: 'cut', s: out }, p);
    }
  }

  // ------------------------------------------------------------------ props
  onPropClaim(p, msg) {
    const pr = this.props.get(msg.id);
    if (!pr || pr.gone) return;
    if (pr.h && pr.h !== p.id) {
      this.send(p, { t: 'po', id: pr.id, o: pr.o, h: pr.h });
      return;
    }
    if (pr.o !== p.id) {
      pr.o = p.id;
      pr.touched = Date.now();
      this.broadcast({ t: 'po', id: pr.id, o: pr.o, h: pr.h });
    }
  }

  onPropHold(p, msg) {
    const pr = this.props.get(msg.id);
    if (!pr || pr.gone) return;
    if (msg.h) {
      if (pr.h && pr.h !== p.id) {
        this.send(p, { t: 'po', id: pr.id, o: pr.o, h: pr.h });
        return;
      }
      // hasta dos objetos en mano (una por mano)
      const mine = [...this.props.values()].filter((o) => o.h === p.id && o !== pr);
      if (mine.length >= 2) { const o = mine[0]; o.h = 0; this.broadcast({ t: 'po', id: o.id, o: o.o, h: 0 }); }
      pr.h = p.id;
      pr.o = p.id;
    } else if (pr.h === p.id) {
      pr.h = 0;
    } else return;
    pr.touched = Date.now();
    this.broadcast({ t: 'po', id: pr.id, o: pr.o, h: pr.h });
  }

  onPropState(p, msg) {
    if (!Array.isArray(msg.u)) return;
    for (const u of msg.u.slice(0, 128)) {
      if (!Array.isArray(u) || u.length < 8) continue;
      const pr = this.props.get(u[0]);
      if (!pr || pr.gone || pr.o !== p.id) continue;
      const v = u.slice(1, 8).map(Number);
      if (!v.every(Number.isFinite)) continue;
      pr.p = v.slice(0, 3);
      pr.q = v.slice(3, 7);
      pr.touched = Date.now();
      // si cae fuera del mundo, vuelve a su lugar
      if (pr.p[1] < -30) {
        if (pr.dyn) { this._deleteProp(pr); continue; }
        this._respawnProp(pr);
        continue;
      }
      this.dirtyProps.add(pr);
    }
  }

  onPropSpawn(p, msg) {
    const id = Number(msg.id);
    // rango de ids reservado para cada jugador: id*100000 .. id*100000+99999
    if (!Number.isInteger(id) || Math.floor(id / 100000) !== p.id) return;
    if (this.props.has(id)) return;
    const type = clampStr(msg.k, 24);
    if (!type) return;
    const pos = Array.isArray(msg.p) ? msg.p.slice(0, 3).map(Number) : null;
    const q = Array.isArray(msg.q) ? msg.q.slice(0, 4).map(Number) : [0, 0, 0, 1];
    if (!pos || !pos.every(Number.isFinite) || !q.every(Number.isFinite)) return;
    const pr = {
      id, type, p: pos, q, o: p.id, h: msg.hold ? p.id : 0, spawn: null, dyn: true, gone: false, touched: Date.now(),
      extra: msg.x && typeof msg.x === 'object' ? msg.x : undefined,
    };

    this.props.set(id, pr);
    this.broadcast({ t: 'pa', pr: [id, type, ...pos.map(r3), ...q.map(r4), pr.o, pr.h], v: msg.v, w: msg.w, x: pr.extra }, p);
    // tope de props dinámicos
    let dyn = 0;
    let oldest = null;
    for (const o of this.props.values()) {
      if (!o.dyn) continue;
      dyn++;
      if (!o.h && (!oldest || o.touched < oldest.touched)) oldest = o;
    }
    if (dyn > MAX_DYNAMIC_PROPS && oldest) this._deleteProp(oldest);
  }

  onPropDelete(p, msg) {
    const pr = this.props.get(msg.id);
    if (!pr || pr.gone) return;
    if (pr.o !== p.id && pr.h !== p.id && pr.o !== 0) return;
    if (pr.dyn) this._deleteProp(pr, p);
    else {
      pr.gone = true;
      pr.goneAt = Date.now();
      pr.o = 0; pr.h = 0;
      this.dirtyProps.delete(pr);
      this.broadcast({ t: 'pd', id: pr.id }, p);
    }
  }

  _deleteProp(pr, except = null) {
    this.props.delete(pr.id);
    this.dirtyProps.delete(pr);
    this.broadcast({ t: 'pd', id: pr.id }, except);
  }

  _respawnProp(pr) {
    pr.gone = false;
    pr.p = [...pr.spawn.p];
    pr.q = [...pr.spawn.q];
    pr.o = 0; pr.h = 0;
    pr.touched = Date.now();
    this.dirtyProps.delete(pr);
    this.broadcast({ t: 'pa', pr: [pr.id, pr.type, ...pr.p.map(r3), ...pr.q.map(r4), 0, 0], respawn: 1 });
  }

  // ------------------------------------------------------------------ vehículos
  onVehEnter(p, msg) {
    const v = this.vehicles.get(msg.id);
    if (!v) return;
    const seat = Math.max(0, Math.min(v.seats.length - 1, msg.seat | 0));
    // no estar en dos lugares a la vez
    for (const o of this.vehicles.values()) {
      if (o.seats.includes(p.id)) {
        o.seats = o.seats.map((s) => (s === p.id ? 0 : s));
        this.broadcast({ t: 'vs', id: o.id, seats: o.seats, o: o.o });
      }
    }
    if (v.seats[seat]) {
      this.send(p, { t: 'vs', id: v.id, seats: v.seats, o: v.o, deny: 1 });
      return;
    }
    v.seats[seat] = p.id;
    if (seat === 0) v.o = p.id;
    v.idleSince = Date.now();
    this.broadcast({ t: 'vs', id: v.id, seats: v.seats, o: v.o });
  }

  onVehExit(p, msg) {
    const v = this.vehicles.get(msg.id);
    if (!v || !v.seats.includes(p.id)) return;
    v.seats = v.seats.map((s) => (s === p.id ? 0 : s));
    v.idleSince = Date.now();
    if (!v.seats[0]) this._parkVehicle(v);
    this.broadcast({ t: 'vs', id: v.id, seats: v.seats, o: v.o });
  }

  // Sin conductor: motor apagado y cuchillas quietas (antes quedaban prendidas y sonaban para todos)
  _parkVehicle(v) {
    if (!v.s?.some((n) => n)) return;
    v.s = v.s.map(() => 0);
    this.dirtyVeh.add(v);
  }

  onVehClaim(p, msg) {
    const v = this.vehicles.get(msg.id);
    if (!v || v.seats[0]) return;
    if (v.o !== p.id) {
      v.o = p.id;
      this.broadcast({ t: 'vs', id: v.id, seats: v.seats, o: v.o });
    }
  }

  onVehState(p, msg) {
    if (!Array.isArray(msg.u)) return;
    for (const u of msg.u.slice(0, 16)) {
      if (!Array.isArray(u) || u.length < 8) continue;
      const v = this.vehicles.get(u[0]);
      if (!v || v.o !== p.id) continue;
      const a = u.slice(1, 8).map(Number);
      if (!a.every(Number.isFinite)) continue;
      v.p = a.slice(0, 3);
      v.q = a.slice(3, 7);
      v.s = u.slice(8, 12).map((n) => (Number.isFinite(+n) ? +n : 0));
      if (!v.seats[0]) v.s = v.s.map(() => 0); // sin conductor no hay motor ni cuchillas
      if (v.p[1] < -30) { this._resetVehicle(v); continue; }
      this.dirtyVeh.add(v);
    }
  }

  onVehReset(p, msg) {
    const v = this.vehicles.get(msg.id);
    if (!v) return;
    if (v.seats.some((s) => s && s !== p.id)) return;
    this._resetVehicle(v);
  }

  _resetVehicle(v) {
    v.p = [...v.spawn.p];
    v.q = [...v.spawn.q];
    v.o = 0;
    v.seats = v.seats.map(() => 0);
    v.idleSince = Date.now();
    this.dirtyVeh.delete(v);
    this.broadcast({ t: 'vreset', id: v.id, p: v.p, q: v.q });
    this.broadcast({ t: 'vs', id: v.id, seats: v.seats, o: v.o });
  }

  // ------------------------------------------------------------------ pantallas / música
  onMedia(p, msg) {
    const m = this.media.get(msg.s);
    if (!m) return;
    const now = Date.now();
    switch (msg.a) {
      case 'add': {
        const vid = String(msg.v || '');
        if (!/^[A-Za-z0-9_-]{11}$/.test(vid)) return;
        if (m.queue.length >= 40) return;
        const item = { v: vid, title: vid, by: p.name, list: msg.list ? clampStr(msg.list, 64) : undefined };
        m.queue.push(item);
        this._fetchTitle(item, msg.s);
        if (!m.cur) this._next(msg.s);
        this.sys('🎬 ' + p.name + ' agregó un video en ' + (SCREENS.find((x) => x.id === msg.s)?.name || msg.s) + '.');
        break;
      }
      case 'skip':
        if (m.cur) this.sys('⏭ ' + p.name + ' salteó "' + m.cur.title + '".');
        this._next(msg.s);
        return;
      case 'pause':
        if (m.cur && !m.cur.paused) { m.cur.pos = Math.max(0, (now - m.cur.start) / 1000); m.cur.paused = true; }
        break;
      case 'play':
        if (m.cur && m.cur.paused) { m.cur.start = now - (m.cur.pos || 0) * 1000; m.cur.paused = false; }
        break;
      case 'seek':
        if (m.cur && Number.isFinite(+msg.pos)) {
          const pos = Math.min(m.cur.d > 0 ? m.cur.d : 86400, Math.max(0, +msg.pos));
          if (m.cur.paused) m.cur.pos = pos; else m.cur.start = now - pos * 1000;
        }
        break;
      case 'remove': {
        const i = msg.i | 0;
        if (i >= 0 && i < m.queue.length) m.queue.splice(i, 1);
        break;
      }
      case 'clear':
        m.queue.length = 0;
        break;
      case 'dur':
        if (!m.cur || msg.playId !== m.cur.playId) return;
        if (m.cur && m.cur.v === msg.v && Number.isFinite(+msg.d) && +msg.d > 0 && +msg.d <= 86400) m.cur.d = +msg.d;
        if (m.cur && m.cur.v === msg.v && msg.title && m.cur.title === m.cur.v) m.cur.title = clampStr(msg.title, 120);
        break;
      case 'ended':
        if (m.cur && m.cur.v === msg.v && msg.playId === m.cur.playId && !m.cur.paused && now - m.cur.start > 4000) this._next(msg.s);
        return;
      case 'error':
        // Playback restrictions/autoplay/network failures are client-local. Never skip for everyone.
        return;
      default:
        return;
    }
    this.broadcast({ t: 'ms', s: msg.s, st: m });
  }

  _next(sid) {
    const m = this.media.get(sid);
    const it = m.queue.shift();
    m.serial = (m.serial || 0) + 1;
    m.cur = it ? { ...it, playId: `${Date.now().toString(36)}-${m.serial}`, start: Date.now() + 1500, paused: false, pos: 0, d: 0 } : null;
    this.broadcast({ t: 'ms', s: sid, st: m });
  }

  async _fetchTitle(item, sid) {
    try {
      const url = 'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + item.v);
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 5000);
      const r = await fetch(url, { signal: ctrl.signal });
      clearTimeout(to);
      if (!r.ok) return;
      const j = await r.json();
      if (j && j.title) {
        item.title = clampStr(j.title, 120);
        const m = this.media.get(sid);
        if (m.cur && m.cur.v === item.v && m.cur.title === item.v) m.cur.title = item.title;
        this.broadcast({ t: 'ms', s: sid, st: m });
      }
    } catch { /* sin internet o bloqueado: queda el id */ }
  }

  // ------------------------------------------------------------------ loop
  tick() {
    const now = Date.now();
    // snapshot
    if (this.players.size) {
      const P = [];
      for (const p of this.players.values()) {
        if (p.stDirty && p.st) { P.push([p.id, p.st]); p.stDirty = false; }
      }
      const R = [];
      for (const pr of this.dirtyProps) R.push([pr.id, ...pr.p.map(r3), ...pr.q.map(r4)]);
      this.dirtyProps.clear();
      const V = [];
      for (const v of this.dirtyVeh) V.push([v.id, ...v.p.map(r3), ...v.q.map(r4), ...v.s]);
      this.dirtyVeh.clear();
      this.football.step(0.05, now);
      this.broadcast({ t: 'snap', ts: now, P, R, V, B: this.football.packet() });
    }
    this.poker.tick(now);
    // crecimiento del pasto
    while (now - this.lastGrow >= GRASS.growTickMs) {
      this.lastGrow += GRASS.growTickMs;
      growAll(this.grass.hgt, GRASS.growPerTick, this.noGrow);
      this.grass.tick++;
      this.grass.dirty = true;
      this.broadcast({ t: 'gt', n: this.grass.tick });
    }
    // props rotos que vuelven a su lugar
    for (const pr of this.props.values()) {
      if (pr.gone && now - pr.goneAt > PROP_RESPAWN_MS) this._respawnProp(pr);
      else if (pr.dyn && !pr.h && now - pr.touched > 240_000) this._deleteProp(pr);
      else if (!pr.dyn && !pr.gone && !pr.h && pr.o === 0 && now - pr.touched > 900_000) {
        const d = Math.hypot(pr.p[0] - pr.spawn.p[0], pr.p[2] - pr.spawn.p[2]);
        if (d > 2) this._respawnProp(pr);
        else pr.touched = now;
      }
    }
    // pantallas: avance automático si nadie avisa que terminó
    for (const [sid, m] of this.media) {
      if (m.cur && !m.cur.paused && m.cur.d > 0 && now > m.cur.start + (m.cur.d + 4) * 1000) this._next(sid);
    }
    // vehículos abandonados y volcados/lejos: vuelven al galpón después de 10 min
    for (const v of this.vehicles.values()) {
      if (v.seats.some((s) => s)) continue;
      if (now - v.idleSince > 600_000) {
        const d = Math.hypot(v.p[0] - v.spawn.p[0], v.p[2] - v.spawn.p[2]);
        if (d > 6) this._resetVehicle(v);
        else v.idleSince = now;
      }
    }
    if (now - this.lastSave > 30_000) {
      this.lastSave = now;
      this.save();
    }
  }
}

function sanitizeLook(l, owner = false) {
  const col = (c, d) => (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c : d);
  l = l && typeof l === 'object' ? l : {};
  return {
    skin: col(l.skin, '#e0ac69'),
    shirt: col(l.shirt, '#3b6fd8'),
    pants: col(l.pants, '#2b2f3a'),
    shoes: col(l.shoes, '#1b1b1b'),
    hair: col(l.hair, '#3a2a1a'),
    hat: ['none', 'cap', 'cowboy', 'beanie', 'tophat', 'crown', 'chef', 'boina'].includes(l.hat) ? l.hat : 'cap',
    hatColor: col(l.hatColor, '#c8312b'),
    beard: !!l.beard,
    glasses: ['none', 'sun', 'nerd'].includes(l.glasses) ? l.glasses : 'none',
    body: ['normal', 'gordo', 'flaco'].includes(l.body) ? l.body : 'normal',
    mask: l.model !== 'diablo' && ['bull', 'horse', 'lion', 'cat', 'rabbit'].includes(l.mask) ? l.mask : 'none',
    model: ['eric', 'carla', 'claudia', 'galleta', ...(owner ? ['diablo'] : [])].includes(l.model) ? l.model : 'eric',
  };
}
