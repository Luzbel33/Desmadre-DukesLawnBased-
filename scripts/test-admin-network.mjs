// Exercise the actual HTTP/WebSocket server with a disposable key and data directory.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROTOCOL } from '../public/js/shared/mapdata.js';

if (typeof WebSocket === 'undefined') throw new Error('Esta prueba requiere Node 22+.');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reservation = createServer();
await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dukes-admin-test-'));
const key = randomBytes(32).toString('hex');
const server = spawn(process.execPath, ['server/server.js'], {
  cwd: root,
  env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DATA_DIR: directory, OWNER_KEY: key },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '', startupError = null;
server.stdout.on('data', (chunk) => { log += chunk; });
server.stderr.on('data', (chunk) => { log += chunk; });
server.on('error', (error) => { startupError = error; });
const exited = new Promise((resolve) => { server.once('exit', resolve); server.once('error', resolve); });
const peers = [], checks = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(check, label) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (startupError) throw startupError;
    if (server.exitCode !== null) throw new Error('Server exited during ' + label + '\n' + log);
    const result = check();
    if (result) return result;
    await sleep(10);
  }
  throw new Error('Timeout: ' + label + '\n' + log);
}

async function connect(name, options = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?sala=${options.room || 'qa-admin'}`);
  const peer = { ws, name, messages: [], closed: false, closeCode: null };
  peer.send = (message) => ws.send(JSON.stringify(message));
  ws.addEventListener('message', (event) => {
    if (typeof event.data === 'string') peer.messages.push(JSON.parse(event.data));
  });
  ws.addEventListener('close', (event) => { peer.closed = true; peer.closeCode = event.code; });
  ws.addEventListener('error', () => { peer.error = true; });
  peers.push(peer);
  await until(() => ws.readyState === WebSocket.OPEN || peer.error, 'open ' + name);
  assert.equal(peer.error, undefined, 'socket opens for ' + name);
  peer.send({ t: 'join', v: options.version ?? PROTOCOL, name, key: options.key, look: {} });
  if (options.rejected) {
    await until(() => peer.closed, 'rejected join ' + name);
    assert.ok(peer.messages.some((m) => m.t === 'err'), 'rejection has a readable error');
    assert.equal(peer.closeCode, 1008);
    assert.ok(!peer.messages.some((m) => m.t === 'welcome'));
  } else {
    await until(() => peer.messages.some((m) => m.t === 'ready'), 'ready ' + name);
    peer.welcome = peer.messages.find((m) => m.t === 'welcome');
    peer.id = peer.welcome.id;
  }
  return peer;
}

let sequence = 0;
async function barrier(peer) {
  assert.equal(peer.ws.readyState, WebSocket.OPEN, peer.name + ' remains connected');
  const nonce = ++sequence;
  peer.send({ t: 'ping', c: nonce });
  await until(() => peer.messages.some((m) => m.t === 'pong' && m.c === nonce), 'message barrier');
}

async function admin(peer, message) {
  peer.send({ t: 'adm', ...message });
  await barrier(peer);
  // Respect the same 12/s limit as the browser, including intentionally rejected actions.
  await sleep(100);
}

async function ignored(actor, message, recipients) {
  const starts = recipients.map((peer) => peer.messages.length);
  await admin(actor, message);
  for (let i = 0; i < recipients.length; i++) {
    const peer = recipients[i];
    await barrier(peer);
    assert.ok(!peer.messages.slice(starts[i]).some((m) => m.t === 'adm' || m.t === 'err'),
      `${actor.name}: ${message.a} must not affect ${peer.name}`);
  }
}

const latestRoles = (peer) => peer.messages.findLast((m) => m.t === 'adm' && m.a === 'roles')?.roles;
async function role(peer, id, level) {
  await until(() => latestRoles(peer)?.some(([player, rank]) => player === id && rank === level), 'shared role ' + level);
}

try {
  await until(() => log.includes('servidor andando'), 'startup');
  await connect('SmokePyro', { key: 'invalid-test-key', rejected: true });
  await connect('Old protocol', { version: -1, rejected: true });
  checks.push('reserved name and incompatible protocol reject cleanly');

  const owner = await connect('Camarada QA');
  const moderator = await connect('Admin QA');
  const otherModerator = await connect('Otro Admin QA');
  const guest = await connect('Invitado QA');
  assert.equal(owner.welcome.owner, 0);
  await ignored(guest, { a: 'kick', to: moderator.id }, [moderator]);
  await ignored(guest, { a: 'admin', to: guest.id, on: true }, [owner, guest]);
  await admin(owner, { a: 'login', key: 'invalid-test-key' });
  assert.ok(owner.messages.some((m) => m.t === 'adm' && m.a === 'denied'));
  assert.equal(latestRoles(guest), undefined);
  await admin(owner, { a: 'login', key });
  await Promise.all([owner, moderator, guest].map((peer) => role(peer, owner.id, 2)));
  checks.push('owner key works with any display name; guest and invalid-key escalation denied');

  await admin(owner, { a: 'admin', to: moderator.id, on: true });
  await admin(owner, { a: 'admin', to: otherModerator.id, on: true });
  await role(guest, moderator.id, 1);
  await role(guest, otherModerator.id, 1);
  const late = await connect('Testigo QA');
  assert.equal(late.welcome.players.find((p) => p.id === owner.id).owner, 1);
  assert.equal(late.welcome.players.find((p) => p.id === moderator.id).admin, 1);
  checks.push('promotion reaches all clients and late joiners');

  for (const target of [owner, otherModerator]) {
    await ignored(moderator, { a: 'kick', to: target.id }, [target]);
    await ignored(moderator, { a: 'tp', to: target.id, p: [0, 0, 20] }, [target]);
  }
  await ignored(moderator, { a: 'admin', to: guest.id, on: true }, [owner, guest]);
  await ignored(owner, { a: 'kick', to: owner.id }, [owner]);
  checks.push('admins cannot kick or move peers/owner, promote players, or self-kick');

  const destination = [0, 0, 20];
  const start = guest.messages.length;
  await admin(moderator, { a: 'tp', to: guest.id, p: destination, yaw: 1.2 });
  const teleport = await until(() => guest.messages.slice(start).find((m) => m.t === 'adm' && m.a === 'tp'), 'guest teleport');
  assert.deepEqual(teleport.p, destination);
  assert.equal(teleport.yaw, 1.2);
  assert.equal(teleport.by, moderator.name);
  const bring = [1, 0, 21.6];
  await admin(owner, { a: 'tp', to: moderator.id, p: bring });
  await until(() => moderator.messages.some((m) => m.t === 'adm' && m.a === 'tp' && m.p[2] === bring[2]), 'owner brings admin');
  // The real browser applies this command; this client acknowledges with its next state packet.
  guest.send({ t: 'st', s: { p: destination, y: 1.2 } });
  await until(() => late.messages.some((m) => m.t === 'snap' && m.P?.some(([id, state]) => id === guest.id && state.p?.[2] === 20)), 'post-teleport state relay');
  checks.push('teleport/bring reaches permitted targets; subsequent position reaches observers');

  for (const position of [null, [0, 0], [0, 'bad', 20], [1e9, 0, 1e9]]) {
    await ignored(moderator, { a: 'tp', to: guest.id, p: position }, [guest]);
  }
  await ignored(owner, { a: 'tp', to: -1, p: destination }, [guest]);
  guest.ws.send('{malformed');
  guest.send({ t: 'unknown' });
  await barrier(guest);
  checks.push('invalid vectors, missing targets and malformed messages do not affect peers or crash');

  const otherRoom = await connect('Otra sala QA', { room: 'qa-isolated' });
  assert.equal(otherRoom.welcome.players.length, 0);
  const isolatedStart = otherRoom.messages.length;
  await admin(owner, { a: 'set', k: 'tod', v: 1 });
  await barrier(otherRoom);
  assert.ok(!otherRoom.messages.slice(isolatedStart).some((m) => m.t === 'adm'));
  checks.push('admin changes remain inside their room');

  await admin(moderator, { a: 'kick', to: guest.id });
  await until(() => guest.closed, 'guest kicked');
  assert.equal(guest.closeCode, 1000);
  assert.ok(guest.messages.some((m) => m.t === 'err' && m.m.includes('te echó')));
  await until(() => late.messages.some((m) => m.t === 'pleave' && m.id === guest.id), 'kick departure broadcast');
  await ignored(owner, { a: 'tp', to: guest.id, p: destination }, [late]);
  await admin(owner, { a: 'admin', to: moderator.id, on: false });
  await role(late, moderator.id, 0);
  await ignored(moderator, { a: 'kick', to: late.id }, [late]);
  await admin(owner, { a: 'kick', to: otherModerator.id });
  await until(() => otherModerator.closed, 'owner kicks admin');
  checks.push('kick closes actual socket and broadcasts departure; revocation removes privileges immediately');

  // Exhaust only this disposable server's loopback-IP budget, after all positive auth checks.
  for (let i = 0; i < 10; i++) await admin(late, { a: 'login', key: 'invalid-test-key' });
  const previous = late.messages.length;
  await admin(late, { a: 'login', key });
  assert.ok(late.messages.slice(previous).some((m) => m.t === 'adm' && m.a === 'denied'));
  const limited = await fetch(`http://127.0.0.1:${port}/api/owner`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'SmokePyro', key }),
  });
  assert.equal(limited.status, 429);
  await barrier(late);
  checks.push('HTTP and WebSocket auth share attempt limits while guest play stays available');
  assert.ok(!/msg error|uncaught/i.test(log), 'no server message handling errors');
  console.log(JSON.stringify({ result: 'PASS', transport: 'real loopback HTTP/WebSocket', connections: peers.length, checks }, null, 2));
} finally {
  for (const peer of peers) if (peer.ws.readyState < WebSocket.CLOSING) peer.ws.close();
  await sleep(50);
  if (server.exitCode === null && !startupError) server.kill('SIGTERM');
  await exited;
  const absolute = path.resolve(directory);
  if (path.dirname(absolute) === path.resolve(os.tmpdir()) && path.basename(absolute).startsWith('dukes-admin-test-')) {
    fs.rmSync(absolute, { recursive: true, force: true });
  }
}
