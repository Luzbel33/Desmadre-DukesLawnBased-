// El dueño (SmokePyro): nombre reservado, clave verificada en el servidor, Diablo y poderes solo para él.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Room } from '../server/room.js';
import { PROTOCOL, CLUB, CASTLE } from '../public/js/shared/mapdata.js';

let ipN = 1;
function fakeWs() {
  return {
    sent: [], closed: false, ip: '10.0.0.' + ipN++, bufferedAmount: 0, lastSeen: Date.now(), handlers: {},
    on(ev, fn) { this.handlers[ev] = fn; },
    send(d) { if (typeof d === 'string') this.sent.push(JSON.parse(d)); },
    close() { this.closed = true; },
    ping() {},
  };
}
const say = (ws, obj) => ws.handlers.message(JSON.stringify(obj), false);
const join = (ws, name, look, key) => say(ws, { t: 'join', v: PROTOCOL, name, look, key });

test('SmokePyro sin la clave no entra; con la clave es el dueño y puede ser el Diablo', () => {
  const room = new Room('test-owner', fs.mkdtempSync(path.join(os.tmpdir(), 'desmadre-')));
  const bad = fakeWs(); room.accept(bad); join(bad, 'SmokePyro', { model: 'diablo' }, 'silencio');
  assert.ok(bad.closed, 'con la clave mal no entra');
  assert.equal(bad.sent.find((m) => m.t === 'err')?.m, 'El nombre SmokePyro está reservado.');
  const own = fakeWs(); room.accept(own); join(own, 'smokepyro', { model: 'diablo' }, 'Silencio');
  assert.equal(own.sent.find((m) => m.t === 'welcome')?.owner, 1, 'con la clave es el dueño');
  const other = fakeWs(); room.accept(other); join(other, 'Tano', { model: 'diablo' });
  const w = other.sent.find((m) => m.t === 'welcome');
  const ownerSeen = w.players.find((p) => p.owner);
  assert.equal(ownerSeen?.look.model, 'diablo', 'los demás ven al dueño como el Diablo');
  // el que no es dueño no puede ponerse el Diablo
  own.sent.length = 0;
  const pj = own.sent;
  say(other, { t: 'look', look: { model: 'diablo' } });
  const lk = pj.find((m) => m.t === 'look');
  assert.equal(lk?.look.model, 'eric');
});

test('poderes: solo el dueño se hace invisible o quema; los demás no', () => {
  const room = new Room('test-pow', fs.mkdtempSync(path.join(os.tmpdir(), 'desmadre-')));
  const own = fakeWs(); room.accept(own); join(own, 'SmokePyro', { model: 'diablo' }, 'Silencio');
  const a = fakeWs(); room.accept(a); join(a, 'Ana', {});
  a.sent.length = 0;
  say(own, { t: 'pow', a: 'inv', v: 1 });
  say(own, { t: 'ev', k: 'burn', to: 2, s: 1 });
  assert.ok(a.sent.some((m) => m.t === 'pow' && m.a === 'inv' && m.v === 1), 'el invisible se avisa');
  assert.ok(a.sent.some((m) => m.t === 'ev' && m.k === 'burn'), 'la quemadura del dueño llega');
  own.sent.length = 0;
  say(a, { t: 'pow', a: 'inv', v: 1 });
  say(a, { t: 'ev', k: 'burn', to: 1, s: 1 });
  assert.ok(!own.sent.some((m) => m.t === 'pow' || (m.t === 'ev' && m.k === 'burn')), 'un jugador común no tiene poderes');
});

test('galleta is allowed online; leaving Diablo clears invisibility and rejects powers', () => {
  const room=new Room('test-model-switch',fs.mkdtempSync(path.join(os.tmpdir(),'desmadre-')));
  const own=fakeWs();room.accept(own);join(own,'SmokePyro',{model:'diablo'},'Silencio');
  const guest=fakeWs();room.accept(guest);join(guest,'Galletita',{model:'galleta'});
  assert.equal(room.players.get(2).look.model,'galleta');
  say(own,{t:'pow',a:'inv',v:1});guest.sent.length=0;
  say(own,{t:'look',look:{model:'galleta'}});
  assert.equal(room.players.get(1).inv,false);
  assert.ok(guest.sent.some(m=>m.t==='pow'&&m.a==='inv'&&m.v===0));
  assert.ok(guest.sent.some(m=>m.t==='pow'&&m.a==='fire'&&m.v===0));
  guest.sent.length=0;
  say(own,{t:'pow',a:'inv',v:1});say(own,{t:'ev',k:'burn',to:2,s:1});
  assert.ok(!guest.sent.some(m=>m.t==='pow'||m.k==='burn'));
});

test('fireballs and temporary flames: validated relay, cooldown, impact deduplication and late join',()=>{
  const room=new Room('test-fire-network',fs.mkdtempSync(path.join(os.tmpdir(),'desmadre-')));
  const own=fakeWs();room.accept(own);join(own,'SmokePyro',{model:'diablo'},'Silencio');
  const guest=fakeWs();room.accept(guest);join(guest,'Galletita',{model:'galleta'});
  say(own,{t:'st',s:{p:[0,0,0]}});say(guest,{t:'st',s:{p:[0,0,4]}});guest.sent.length=0;
  say(own,{t:'pow',a:'ball',shot:'1',o:[100,2,0],d:[0,0,1]});
  say(own,{t:'pow',a:'ball',shot:'1',o:[0,2,0],d:[0,0,0]});
  assert.equal(guest.sent.length,0,'invalid origins/directions rejected');
  say(own,{t:'pow',a:'ball',shot:'1',o:[0,2,0],d:[0,0,5]});
  assert.deepEqual(guest.sent.find(m=>m.a==='ball').d,[0,0,1]);
  say(own,{t:'pow',a:'ball',shot:'2',o:[0,2,0],d:[0,0,1]});
  assert.equal(guest.sent.filter(m=>m.a==='ball').length,1,'cooldown enforced by server');
  const hit={t:'ev',k:'burn',mode:'ball',shot:'1',to:2,s:1,p:[0,1,4]};
  say(own,hit);say(own,hit);say(own,{...hit,shot:'unissued'});
  assert.equal(guest.sent.filter(m=>m.k==='burn').length,1,'one issued projectile/target only');
  say(own,{t:'pow',a:'patch',p:[0,0,5],n:[0,2,0]});
  assert.deepEqual(guest.sent.find(m=>m.a==='patch').n,[0,1,0]);
  const late=fakeWs();room.accept(late);join(late,'Tercero',{});
  assert.equal(late.sent.find(m=>m.t==='welcome').fires.length,1);
  room.firePatches[0].end=Date.now()-1;
  const later=fakeWs();room.accept(later);join(later,'Cuarto',{});
  assert.equal(later.sent.find(m=>m.t==='welcome').fires.length,0,'expired flames do not resurrect on join');
  own.sent.length=0;say(guest,{t:'pow',a:'ball',shot:'1',o:[0,2,4],d:[0,0,-1]});say(guest,{t:'pow',a:'patch',p:[0,0,4],n:[0,1,0]});
  assert.ok(!own.sent.some(m=>m.t==='pow'),'ordinary players cannot emit demon powers');
});

test('ritual: del cuarto secreto al Búnker y del pentagrama del Búnker de vuelta al castillo', () => {
  const room = new Room('test-ritual', fs.mkdtempSync(path.join(os.tmpdir(), 'desmadre-')));
  const own = fakeWs(); room.accept(own); join(own, 'SmokePyro', { model: 'diablo' }, 'Silencio');
  const a = fakeWs(); room.accept(a); join(a, 'Ana', {});
  const P = CLUB.pentagram, P2 = CLUB.pentagram2, F0 = CASTLE.keep.floor;
  const ritual = () => a.sent.find((m) => m.t === 'pow' && m.a === 'ritual');
  say(own, { t: 'st', s: { p: [P.x, F0, P.z] } }); say(a, { t: 'st', s: { p: [P.x + 0.5, F0, P.z] } });
  a.sent.length = 0; say(own, { t: 'pow', a: 'ritual', ids: [2] });
  assert.equal(ritual()?.to, 'bunker', 'desde el castillo se baja al Búnker');
  assert.deepEqual(ritual().ids, [2]);
  room.players.get(1).lastRitual = 0;
  say(own, { t: 'st', s: { p: [P2.x, 0, P2.z] } }); say(a, { t: 'st', s: { p: [P2.x, 0, P2.z + 0.6] } });
  a.sent.length = 0; say(own, { t: 'pow', a: 'ritual', ids: [2] });
  assert.equal(ritual()?.to, 'castle', 'desde el Búnker se vuelve al castillo');
  assert.deepEqual(ritual().ids, [2]);
  room.players.get(1).lastRitual = 0;
  say(own, { t: 'st', s: { p: [0, 0, -60] } });
  a.sent.length = 0; say(own, { t: 'pow', a: 'ritual', ids: [] });
  assert.equal(ritual(), undefined, 'lejos de los pentagramas no hay ritual');
});
