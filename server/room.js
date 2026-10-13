// Una sala (lobby) del juego: estado compartido y relay de mensajes.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { isOwnerName, checkOwnerKey, allowTry } from './owner.js';
import {
  PROTOCOL, GRASSMAP, GRASS, SURFACES, SURFACE_BY_ID, SCREENS, VEHICLES, PROPS, FIELD, PAINT, parsePatch, grassAllowed, CLUB, CASTLE, playableAt,
  CHESS_BOARDS, POOL_TABLE,
} from '../public/js/shared/mapdata.js';
import { rack as poolRack, simulate as poolSimulate, judge as poolJudge } from '../public/js/shared/pool.js';
import { initial as chessInitial, isLegal as chessLegal, apply as chessApply, status as chessStatus } from '../public/js/shared/chess.js';
import { applyDots, cutRect, growAll, fieldMask, mowField, DOT_BYTES } from '../public/js/shared/raster.js';
import { Football } from './football.js';
import { PokerTable } from './poker.js';
import { DEMON_FIRE as FIRE, fireVector, fireShot } from '../public/js/shared/demon-fire.js';

const MAX_PLAYERS = 24;
const SNAP_MS = 50;
const MAX_DYNAMIC_PROPS = 260;
// lo que cada jugador suelta o revolea (birras, puchos, aerosoles, plata...): tope propio y vida corta sin tocar
const MAX_SPAWNED_PER_PLAYER = 16;
const SPAWNED_IDLE_MS = 90_000;
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
    this.settings = { desmadre: false, tod: 0, godAll: false, speed: 1, jump: 1, grav: 1 }; // tod: hora del día (0 día, 0.5 atardecer, 1 noche); speed/jump/grav: física de todos (panel de admin)
    this.adminNpcs = []; // NPC que agregó un admin: { id, model, name, p, yaw, mode }
    this.hiddenNpcs = []; // nombres de NPC del mapa que un admin sacó
    this.npcSeq = 1;
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
        p: [...v.p], q: yawQuat(v.yaw), o: 0, seats: v.type === 'mower' || v.type === 'racecar' ? [0] : [0, 0],
        s: [0, 0, 0], idleSince: Date.now(),
      });
    }
    for (const s of SCREENS) this.media.set(s.id, { queue: [], cur: null });
    this.chess = new Map(CHESS_BOARDS.map((b) => [b.id, { ...this._chessNew(), seats: { w: 0, b: 0 }, ai: null }]));
    this.pool = { players: [0, 0], ...this._poolNew(true) };
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
          // lo que ahora es piso duro (el asfalto del circuito, por ejemplo) no tiene pasto aunque el archivo diga otra cosa
          const allowed = grassAllowed();
          for (let k = 0; k < n; k++) if (!allowed[k]) this.grass.hgt[k] = 0;
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
    for (const id of this.chess.keys()) this._chessLeave(p, id);
    this._poolLeave(p);
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
      if (o !== p) players.push({ id: o.id, name: o.name, look: o.look, color: o.color, st: o.st, owner: o.owner ? 1 : 0, admin: o.admin ? 1 : 0, inv: o.inv ? 1 : 0 });
    }
    const props = [];
    for (const pr of this.props.values()) {
      if (pr.gone) continue;
      props.push([pr.id, pr.type, ...pr.p.map(r3), ...pr.q.map(r4), pr.o, pr.h, ...(pr.extra ? [pr.extra] : [])]);
    }
    const vehicles = [];
    for (const v of this.vehicles.values()) {
      vehicles.push({ id: v.id, p: v.p.map(r3), q: v.q.map(r4), o: v.o, seats: v.seats });
    }
    const media = {};
    for (const [id, m] of this.media) media[id] = m;
    this.send(p, {
      t: 'welcome', id: p.id, color: p.color, now: Date.now(), room: this.name, owner: p.owner ? 1 : 0, admin: p.admin ? 1 : 0,
      npcs: { list: this.adminNpcs, hidden: this.hiddenNpcs },
      players, props, vehicles, media, settings: this.settings, gtick: this.grass.tick,
      chatHistory: this.chatHistory,
      fires: this.firePatches.filter(f=>f.end>Date.now()).map(f=>({id:f.id,p:f.p,n:f.n,life:(f.end-Date.now())/1000})),
      poker: this.poker.publicState(),
      chess: [...this.chess.keys()].map((id) => this._chessPub(id)),
      pool: this._poolPub(),
      fb: this.football.state(),
    });
    if ([...this.players.values()].some((o) => o.muted || o.frozen || o.tune)) this._adminRoles();
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
        if (msg.k === 'bodybump') {
          const target = this.players.get(msg.to), a = p.st?.p, b = target?.st?.p;
          if (!target?.ready || target === p || !Array.isArray(a) || !Array.isArray(b) || ![...a, ...b].every(Number.isFinite) || now - (p.lastBodyBump || 0) < 800) break;
          if (Math.hypot(a[0] - b[0], a[2] - b[2]) > 2 || Math.abs(a[1] - b[1]) > 1.3) break;
          if (!Array.isArray(msg.v) || msg.v.length !== 3 || !msg.v.every(Number.isFinite)) break;
          const speed = Math.hypot(msg.v[0], msg.v[2]);
          if (speed < 4.2 || speed > 20) break;
          const scale = Math.min(1, 9 / speed);
          p.lastBodyBump = now;
          this.send(target, { t: 'ev', k: 'bodybump', id: p.id, to: target.id, v: [msg.v[0] * scale, 0, msg.v[2] * scale] });
          break;
        }
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
      case 'name': {
        // cambiarse el nombre sin salir de la sala (antes el cliente recargaba la página)
        const nn = clampStr(msg.name, 20) || 'Anónimo';
        if (nn === p.name || now - (p.lastRename || 0) < 1500) break;
        if (isOwnerName(nn) && !p.owner) { this.send(p, { t: 'sys', m: 'El nombre SmokePyro está reservado.' }); break; }
        p.lastRename = now;
        const old = p.name;
        p.name = nn;
        this.broadcast({ t: 'name', id: p.id, name: nn });
        this.sys(old + ' ahora se llama ' + nn + '.');
        break;
      }
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
      case 'adm': this.onAdmin(p, msg); break;
      case 'chess': this.onChess(p, msg); break;
      case 'pool': this.onPool(p, msg); break;
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
    if (p.muted) { if (now - (p.lastMuteNote || 0) > 3000) { p.lastMuteNote = now; this.send(p, { t: 'sys', m: '🔇 Un admin te muteó: no podés hablar ni escribir.' }); } return; }
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
    // tope de props dinámicos (de todos y de este jugador)
    let dyn = 0, mine = 0;
    let oldest = null, oldestMine = null;
    for (const o of this.props.values()) {
      if (!o.dyn) continue;
      dyn++;
      if (!o.h && (!oldest || o.touched < oldest.touched)) oldest = o;
      if (Math.floor(o.id / 100000) === p.id) { mine++; if (!o.h && (!oldestMine || o.touched < oldestMine.touched)) oldestMine = o; }
    }
    if (mine > (p.owner || p.admin ? 60 : MAX_SPAWNED_PER_PLAYER) && oldestMine) this._deleteProp(oldestMine);
    else if (dyn > MAX_DYNAMIC_PROPS && oldest) this._deleteProp(oldest);
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

  // ------------------------------------------------------------------ ajedrez (game/chess.js; reglas en shared/chess.js)
  // Cada mesa: el estado, quién está sentado de cada color (o el Conde, la IA: la calcula el cliente del que juega
  // contra él y el servidor la valida igual), la última jugada y el resultado.
  _chessNew() { return { st: chessInitial(), last: null, res: null, n: 0 }; }
  _chessPub(id) { const c = this.chess.get(id); return { b: id, st: c.st, seats: c.seats, ai: c.ai, last: c.last, res: c.res, n: c.n }; }
  _chessName(c, col) { return c.ai === col ? 'el Conde' : this.players.get(c.seats[col])?.name || '?'; }
  _chessOver(c, r, why) {
    c.res = { r, why };
    const w = this._chessName(c, 'w'), b = this._chessName(c, 'b');
    if (r === 'draw') this.sys(`♟️ ${w} y ${b} empataron al ajedrez (${why}).`, '#e8dcc0');
    else this.sys(`♟️ ${r === 'w' ? w : b} le ganó a ${r === 'w' ? b : w} al ajedrez (${why}).`, '#e8dcc0');
  }
  _chessLeave(p, id) {
    const c = this.chess.get(id);
    if (!c) return;
    let changed = false;
    for (const col of ['w', 'b']) {
      if (c.seats[col] !== p.id) continue;
      c.seats[col] = 0; changed = true;
      if (!c.res && c.n > 0) this._chessOver(c, col === 'w' ? 'b' : 'w', 'el otro se levantó');
    }
    if (!changed) return;
    if (!c.seats.w && !c.seats.b) c.ai = null;
    this.broadcast({ t: 'chess', ...this._chessPub(id) });
  }
  onChess(p, msg) {
    const c = this.chess.get(msg.b), def = CHESS_BOARDS.find((d) => d.id === msg.b);
    if (!c || !def) return;
    const mine = c.seats.w === p.id ? 'w' : c.seats.b === p.id ? 'b' : null, other = mine === 'w' ? 'b' : 'w';
    switch (msg.a) {
      case 'sit': {
        const col = msg.c === 'b' ? 'b' : 'w', at = p.st?.p;
        if (mine || c.seats[col] || c.ai === col) return;
        if (!Array.isArray(at) || Math.hypot(at[0] - def.c[0], at[2] - def.c[2]) > 4 || Math.abs(at[1] - def.c[1]) > 3) return;
        for (const id of this.chess.keys()) if (id !== msg.b) this._chessLeave(p, id);
        if (c.res || (!c.seats.w && !c.seats.b)) Object.assign(c, this._chessNew());
        c.seats[col] = p.id;
        break;
      }
      case 'leave': this._chessLeave(p, msg.b); return;
      case 'ai': { // jugar contra el Conde (o dejar de): partida nueva
        if (!mine || c.seats[other]) return;
        c.ai = msg.on ? other : null;
        Object.assign(c, this._chessNew());
        break;
      }
      case 'move': {
        if (c.res || !mine) return;
        const turn = c.st.turn;
        if (turn !== mine && !(msg.ai && c.ai === turn)) return;
        const mm = Array.isArray(msg.m) ? msg.m : [], m = { f: mm[0] | 0, t: mm[1] | 0 }; // m: [desde, hasta, coronación]
        if (['q', 'r', 'b', 'n'].includes(mm[2])) m.p = mm[2];
        if (m.f < 0 || m.f > 63 || m.t < 0 || m.t > 63 || !chessLegal(c.st, m)) return;
        c.st = chessApply(c.st, m).st; c.last = m; c.n++;
        const s = chessStatus(c.st);
        if (s.over) this._chessOver(c, s.result, s.why === 'mate' ? 'jaque mate' : s.why);
        break;
      }
      case 'resign': if (!mine || c.res || !c.n) return; this._chessOver(c, other, 'abandono'); break;
      case 'reset': { // revancha: terminada, contra el Conde o solo en la mesa (nunca a mitad de una partida entre dos)
        if (!mine || (!c.res && c.n && c.seats.w && c.seats.b)) return;
        Object.assign(c, this._chessNew());
        break;
      }
      default: return;
    }
    this.broadcast({ t: 'chess', ...this._chessPub(msg.b) });
  }

  // ------------------------------------------------------------------ pool (game/pool.js; física y reglas en shared/pool.js)
  // El servidor simula cada tiro (es la verdad) y manda la posición de antes y el tiro: los clientes repiten la
  // misma simulación para verla y al final quedan donde dijo el servidor.
  _poolNew(solo) { return { balls: poolRack((Math.random() * 4294967296) >>> 0), g: { cur: 0, grp: [null, null], win: null, solo, msg: '' }, n: 0 }; }
  _poolPub(shot = null) {
    const P = this.pool;
    return { players: P.players, g: P.g, balls: P.balls, n: P.n, shot };
  }
  _poolName(i) { return this.players.get(this.pool.players[i])?.name || '?'; }
  _poolLeave(p) {
    const P = this.pool, i = P.players.indexOf(p.id);
    if (i < 0) return;
    P.players[i] = 0;
    const rest = P.players.filter(Boolean).length;
    if (!P.g.solo && P.g.win == null && P.n > 0 && rest) this.sys(`🎱 ${this._poolName(1 - i)} gana al pool: ${p.name} dejó la mesa.`, '#e8dcc0');
    if (rest < 2) { const keep = P.players.find(Boolean) || 0; Object.assign(P, this._poolNew(true)); P.players = [keep, 0]; }
    this.broadcast({ t: 'pool', ...this._poolPub() });
  }
  onPool(p, msg) {
    const P = this.pool, i = P.players.indexOf(p.id);
    switch (msg.a) {
      case 'join': {
        const at = p.st?.p;
        if (i >= 0 || !Array.isArray(at) || Math.hypot(at[0] - POOL_TABLE.c[0], at[2] - POOL_TABLE.c[2]) > 4.5 || Math.abs(at[1]) > 2.5) return;
        const slot = P.players.indexOf(0);
        if (slot < 0) return;
        P.players[slot] = p.id;
        // dos en la mesa: partida nueva (el que estaba practicando saca)
        const two = P.players.every(Boolean);
        if (two || P.g.win != null) { const pl = [...P.players]; Object.assign(P, this._poolNew(!two)); P.players = two ? pl : [p.id, 0]; }
        if (two) this.sys(`🎱 ${this._poolName(0)} y ${this._poolName(1)} arman un pool en el bar.`, '#e8dcc0');
        break;
      }
      case 'leave': this._poolLeave(p); return;
      case 'rack': { // otra partida: terminada o practicando solo
        if (i < 0 || (P.g.win == null && !P.g.solo && P.n > 0)) return;
        const pl = [...P.players]; Object.assign(P, this._poolNew(!pl.every(Boolean))); P.players = pl;
        break;
      }
      case 'aim': { // dónde apunta el que tira (solo para que los demás vean el taco)
        const now = Date.now();
        if (i < 0 || now - (p.poolAimT || 0) < 80 || !Number.isFinite(msg.ang)) return;
        p.poolAimT = now;
        this.broadcast({ t: 'poolaim', id: p.id, ang: msg.ang, pull: Math.min(1, Math.max(0, +msg.pull || 0)), on: msg.on ? 1 : 0 }, p);
        return;
      }
      case 'shot': {
        const ang = +msg.ang, pow = +msg.pow;
        if (i < 0 || P.g.win != null || !Number.isFinite(ang) || !Number.isFinite(pow) || pow < 0 || pow > 1) return;
        if (!P.g.solo && P.g.cur !== i) return;
        if (P.g.solo) P.g.cur = i;
        const now = Date.now();
        if (now - (P.shotT || 0) < 1500) return; // un tiro a la vez (las bolas todavía ruedan en los clientes)
        P.shotT = now;
        const before = P.balls.map((b) => ({ ...b }));
        const { ev } = poolSimulate(P.balls, ang, pow);
        poolJudge(P.g, P.balls, ev);
        P.n++;
        if (P.g.win != null && !P.g.solo) this.sys(`🎱 ${this._poolName(P.g.win)} le ganó a ${this._poolName(1 - P.g.win)} al pool (${P.g.msg.toLowerCase()}).`, '#e8dcc0');
        this.broadcast({ t: 'pool', ...this._poolPub({ ang, pow, before, by: p.id }) });
        return;
      }
      default: return;
    }
    this.broadcast({ t: 'pool', ...this._poolPub() });
  }

  // ------------------------------------------------------------------ admin (ui/admin.js)
  // Dos escalones: el dueño (la clave, con cualquier nombre o como SmokePyro) y los admins que nombra el dueño
  // durante la partida. Un admin no puede echar ni tocar al dueño ni a otros admins, ni nombrar admins.
  _adminRoles() {
    const roles = [];
    for (const o of this.players.values()) if (o.ready) roles.push([o.id, o.owner ? 2 : o.admin ? 1 : 0, o.muted ? 1 : 0, o.frozen ? 1 : 0, o.tune || null]);
    this.broadcast({ t: 'adm', a: 'roles', roles });
  }
  _npcSync() { this.broadcast({ t: 'adm', a: 'npcs', list: this.adminNpcs, hidden: this.hiddenNpcs }); }
  onAdmin(p, msg) {
    const lvl = p.owner ? 2 : p.admin ? 1 : 0;
    const vec = (v) => (Array.isArray(v) && v.length === 3 && v.every(Number.isFinite) ? v.map(r3) : null);
    const target = this.players.get(msg.to);
    if (msg.a === 'login') {
      if (lvl === 2) return;
      if (!allowTry(p.ws.ip || '') || !checkOwnerKey(msg.key)) { this.send(p, { t: 'adm', a: 'denied', m: 'Clave incorrecta.' }); return; }
      p.owner = true;
      this._adminRoles();
      this.sys('👑 ' + p.name + ' es el dueño de la sala.', '#ffd98a');
      return;
    }
    if (!lvl) return;
    const now = Date.now();
    // sin spamear: hasta 12 por segundo (los clicks rápidos no se pierden)
    if (now - (p.admT || 0) > 1000) { p.admT = now; p.admN = 0; }
    if (++p.admN > 12) return;
    // ¿puede tocar a ese jugador? (a sí mismo siempre; el admin no toca al dueño ni a otros admins)
    const canTouch = (t) => t && t.ready && (t === p || lvl === 2 || (!t.owner && !t.admin));
    switch (msg.a) {
      case 'tp': { // traer a alguien (a donde está el admin o a un punto)
        const to = vec(msg.p);
        if (!canTouch(target) || !to || !playableAt(to[0], to[2])) return;
        this.send(target, { t: 'adm', a: 'tp', p: to, yaw: Number.isFinite(msg.yaw) ? msg.yaw : 0, by: p.name });
        break;
      }
      case 'god': {
        if (!canTouch(target)) return;
        this.send(target, { t: 'adm', a: 'god', on: !!msg.on, by: p.name });
        break;
      }
      case 'heal': if (canTouch(target)) this.send(target, { t: 'adm', a: 'heal', by: p.name }); break;
      case 'kill': if (canTouch(target) && target !== p) this.send(target, { t: 'adm', a: 'kill', by: p.name }); break;
      case 'kick': {
        if (!target || target === p || target.owner || (lvl < 2 && target.admin)) return;
        this.send(target, { t: 'err', m: p.name + ' te echó de la sala.' });
        this.sys('🥾 ' + p.name + ' echó a ' + target.name + '.', '#ff9a7a');
        setTimeout(() => target.ws.close(1000), 200);
        break;
      }
      case 'freeze': { // dejarlo quieto (no se mueve, no pega, no salta)
        if (!canTouch(target) || target === p) return;
        target.frozen = !!msg.on;
        this.send(target, { t: 'adm', a: 'freeze', on: target.frozen, by: p.name });
        this._adminRoles();
        break;
      }
      case 'mute': { // muteo global: ni voz ni chat (todos dejan de escucharlo)
        if (!canTouch(target) || target === p) return;
        target.muted = !!msg.on;
        this._adminRoles();
        this.sys((target.muted ? '🔇 ' + p.name + ' muteó a ' : '🔊 ' + p.name + ' desmuteó a ') + target.name + '.', '#ffd98a');
        break;
      }
      case 'give': { // algo a la mano de otro (o plata)
        const k = typeof msg.k === 'string' && /^[a-z_0-9]{1,24}$/.test(msg.k) ? msg.k : null;
        if (!k || !canTouch(target)) return;
        this.send(target, { t: 'adm', a: 'give', k, by: p.name });
        break;
      }
      case 'tune': { // la física de un jugador: velocidad, salto y gravedad (1 = normal)
        if (!canTouch(target)) return;
        const n = (v, lo, hi) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v * 100) / 100)) : 1);
        const t = { speed: n(msg.speed, 0.25, 3), jump: n(msg.jump, 0.5, 3), grav: n(msg.grav, 0.15, 2.5) };
        target.tune = t.speed === 1 && t.jump === 1 && t.grav === 1 ? null : t;
        this.send(target, { t: 'adm', a: 'tune', ...t, by: p.name });
        this._adminRoles();
        break;
      }
      case 'admin': { // solo el dueño nombra o saca admins
        if (lvl < 2 || !target || target.owner) return;
        target.admin = !!msg.on;
        this._adminRoles();
        this.sys(target.admin ? '🛡️ ' + target.name + ' ahora es admin.' : target.name + ' ya no es admin.', '#ffd98a');
        break;
      }
      case 'set': {
        const S = this.settings;
        if (msg.k === 'tod') S.tod = [0, 0.5, 1].includes(msg.v) ? msg.v : 0;
        else if (msg.k === 'godAll') S.godAll = !!msg.v;
        else if (msg.k === 'desmadre') S.desmadre = !!msg.v;
        else if (msg.k === 'speed') S.speed = [0.5, 1, 1.6, 2.5].includes(msg.v) ? msg.v : 1;
        else if (msg.k === 'jump') S.jump = [1, 1.6, 2.5].includes(msg.v) ? msg.v : 1;
        else if (msg.k === 'grav') S.grav = [0.25, 0.5, 1, 1.8].includes(msg.v) ? msg.v : 1;
        else return;
        this.broadcast({ t: 'set', settings: S });
        const said = {
          tod: ['☀️ Es de día.', '🌇 Cae el atardecer.', '🌙 Se hizo de noche.'][[0, 0.5, 1].indexOf(S.tod)],
          godAll: S.godAll ? '😇 Nadie se puede morir (por ahora).' : '💀 Se terminó la inmortalidad.',
          desmadre: S.desmadre ? '☠ MODO DESMADRE: PvP y gore en todo el mapa.' : '☮ Modo desmadre apagado.',
          speed: S.speed === 1 ? '🚶 Todos caminan normal otra vez.' : S.speed < 1 ? '🐢 Todo el mundo va en cámara lenta.' : '🐇 ¡Todos más rápidos! (x' + S.speed + ')',
          jump: S.jump === 1 ? '🦘 Saltos normales.' : '🦘 ¡Saltos de canguro para todos! (x' + S.jump + ')',
          grav: S.grav === 1 ? '🌍 Gravedad normal.' : S.grav < 1 ? '🌙 Gravedad de luna (x' + S.grav + ').' : '🪨 Gravedad aplastante (x' + S.grav + ').',
        };
        this.sys(said[msg.k] + ' (' + p.name + ')', '#ffd98a');
        break;
      }
      case 'clean': { // lo tirado y spawneado se va, lo del mapa vuelve a su lugar, los autos a su estacionamiento
        for (const pr of [...this.props.values()]) {
          if (pr.h) continue;
          if (pr.dyn) this._deleteProp(pr);
          else if (pr.spawn && (pr.gone || pr.o)) this._respawnProp(pr);
        }
        if (msg.veh) for (const v of this.vehicles.values()) if (!v.seats.some(Boolean)) this._resetVehicle(v);
        this.firePatches = [];
        this.broadcast({ t: 'adm', a: 'clean', by: p.name });
        this.sys('🧹 ' + p.name + ' limpió la sala.', '#ffd98a');
        break;
      }
      case 'npc': {
        if (msg.op === 'add') {
          const at = vec(msg.p);
          if (!at || !playableAt(at[0], at[2]) || this.adminNpcs.length >= 24) return;
          this.adminNpcs.push({
            id: this.npcSeq++, model: clampStr(msg.model, 24), name: clampStr(msg.name, 24) || 'Extra', p: at,
            yaw: Number.isFinite(msg.yaw) ? r3(msg.yaw) : 0, mode: ['idle', 'dance', 'walk'].includes(msg.mode) ? msg.mode : 'idle',
          });
        } else if (msg.op === 'del') this.adminNpcs = this.adminNpcs.filter((n) => n.id !== msg.id);
        else if (msg.op === 'hide') { const n = clampStr(msg.name, 40); if (n && !this.hiddenNpcs.includes(n) && this.hiddenNpcs.length < 200) this.hiddenNpcs.push(n); }
        else if (msg.op === 'reset') { this.adminNpcs = []; this.hiddenNpcs = []; }
        else return;
        this._npcSync();
        break;
      }
    }
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
      else if (pr.dyn && !pr.h && now - pr.touched > SPAWNED_IDLE_MS) this._deleteProp(pr);
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
    model: ['eric', 'carla', 'claudia', 'galleta', 'gian', ...(owner ? ['diablo'] : [])].includes(l.model) ? l.model : 'eric',
  };
}
