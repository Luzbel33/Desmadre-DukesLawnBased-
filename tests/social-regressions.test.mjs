import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../server/room.js';
import { VoiceChat } from '../public/js/audio/voice.js';
import { RemotePlayer } from '../public/js/game/player.js';
import { G } from '../public/js/core/G.js';
import * as THREE from 'three';

function roomFixture() {
  const room = Object.create(Room.prototype);
  room.players = new Map(); room.chatHistory = []; room.chatSequence = 0;
  const delivered = new Map();
  for (let id = 1; id <= 4; id++) {
    const messages = []; delivered.set(id, messages);
    room.players.set(id, { id, name: `Player ${id}`, color: '#abcdef', ready: true, lastChat: 0,
      rate: 0, rateT: Date.now(), ws: { readyState: 1, bufferedAmount: 0,
        send(value) { messages.push(typeof value === 'string' ? JSON.parse(value) : value); }, close() {} } });
  }
  return { room, delivered, sender: room.players.get(1) };
}

test('whisper text is delivered only to the sender and selected recipients', () => {
  const { room, delivered, sender } = roomFixture();
  room.onChat(sender, { m: 'private message', to: [2, 3, 3] });
  for (const id of [1, 2, 3]) {
    const packet = delivered.get(id).find(m => m.t === 'chat');
    assert.ok(packet, `missing private delivery to ${id}`);
    assert.deepEqual(packet.to, [2, 3]);
    assert.equal(packet.name, sender.name);
  }
  assert.equal(delivered.get(4).filter(m => m.t === 'chat').length, 0, 'private text leaked to another player');
  assert.equal(room.chatHistory.length, 0, 'private messages must never enter room-wide history');
});

test('invalid or empty private recipient sets fail closed, including commands', () => {
  for (const to of [[], [999], '2']) {
    const { room, delivered, sender } = roomFixture();
    room.onChat(sender, { m: '/dados hidden', to });
    for (const id of [2, 3, 4]) assert.equal(delivered.get(id).length, 0, 'private input became a room broadcast');
  }
});

test('public chat retains a bounded history with immutable names and message IDs', () => {
  const { room, sender, delivered } = roomFixture();
  for (let i = 0; i < 230; i++) { sender.lastChat = 0; room.onChat(sender, { m: `message ${i}` }); }
  assert.equal(room.chatHistory.length, 200);
  assert.equal(room.chatHistory.at(-1).m, 'message 229');
  assert.equal(new Set(room.chatHistory.map(m => m.mid)).size, 200);
  sender.name = 'renamed';
  assert.equal(room.chatHistory.at(-1).name, 'Player 1');
  assert.equal(delivered.get(1).filter(m => m.t === 'chat').length, 230, 'the sender needs a server acknowledgement');
});

test('server accepts the five existing masks and strips them from the demon', () => {
  const { room, sender } = roomFixture();
  for (const mask of ['bull', 'horse', 'lion', 'cat', 'rabbit']) {
    room.onMessage(sender, JSON.stringify({ t: 'look', look: { model: 'galleta', mask } }), false);
    assert.equal(sender.look.mask, mask);
  }
  sender.owner = true;
  room.onMessage(sender, JSON.stringify({ t: 'look', look: { model: 'diablo', mask: 'bull' } }), false);
  assert.equal(sender.look.mask, 'none');
  room.onMessage(sender, JSON.stringify({ t: 'look', look: { model: 'eric', mask: '__proto__' } }), false);
  assert.equal(sender.look.mask, 'none');
});

function voiceFixture() {
  return new VoiceChat({ net: { send() {} }, opts: { voiceMode: 'open' }, getCtx: () => null });
}

test('ICE received before the SDP offer is queued instead of dropped', async () => {
  const voice = voiceFixture();
  const candidates = [];
  voice._peer = function(id) {
    const peer = { id, remoteSet: false, pending: [], pc: {
      async setRemoteDescription() {}, async addIceCandidate(c) { candidates.push(c); },
      async createAnswer() { return { type: 'answer', sdp: 'answer' }; },
      async setLocalDescription() { this.localDescription = { toJSON: () => ({ type: 'answer', sdp: 'answer' }) }; },
    } };
    this.peers.set(id, peer); return peer;
  };
  const candidate = { candidate: 'early-candidate', sdpMid: '0', sdpMLineIndex: 0 };
  await voice.onSignal(2, { c: candidate });
  await voice.onSignal(2, { sdp: { type: 'offer', sdp: 'offer' } });
  assert.deepEqual(candidates, [candidate]);
});

test('outgoing whisper audio is disabled at the sender for all unselected peers', async () => {
  const voice = voiceFixture();
  voice.enabled = true; voice.track = { enabled: true, readyState: 'live', clone() { return { enabled: false, readyState: 'live', stop() {} }; } };
  for (const id of [2, 3, 4]) {
    const peer = { id, sender: { async replaceTrack(track) { this.track = track; } } };
    voice.peers.set(id, peer); await voice._attachTrack(peer);
  }
  voice.setRecipients([2, 3]);
  assert.equal(voice.peers.get(2).sender.track.enabled, true);
  assert.equal(voice.peers.get(3).sender.track.enabled, true);
  assert.equal(voice.peers.get(4).sender.track.enabled, false, 'private audio still sent to a nonrecipient');
  voice.setRecipients([]);
  for (const peer of voice.peers.values()) assert.equal(peer.sender.track.enabled, false, 'empty private audience must not become public');
  voice.setRecipients(null);
  for (const peer of voice.peers.values()) assert.equal(peer.sender.track.enabled, true);
  voice.disableMic();
  for (const peer of voice.peers.values()) assert.equal(peer.sender.track.enabled, false, 'mute must immediately silence every outgoing track');
});

test('invalid ragdoll poses do not overwrite the last valid remote state', () => {
  G.net = { now: () => 1000 };
  const valid = { p: [1, 0, 1], s: 2, rb: Array.from({ length: 77 }, (_, i) => i % 7 === 6 ? 1 : 0) };
  const remote = Object.assign(Object.create(RemotePlayer.prototype), {
    stateData: valid, target: new THREE.Vector3(1, 0, 1), pos: new THREE.Vector3(1, 0, 1),
    targetYaw: 0, hp: 100, sv: 0, afHist: [], buf: [], proxy: { alive: true },
  });
  remote.applyState(valid, false, 1000);
  for (const bad of [NaN, Infinity, null, 'not-a-number']) {
    const rb = valid.rb.slice(); rb[0] = bad;
    remote.applyState({ p: [90, 0, 90], s: 2, rb }, false, 1100);
    assert.equal(remote.buf.length, 1, 'malformed pose entered interpolation');
    assert.equal(remote.target.x, 1, 'invalid snapshot moved the collision capsule');
  }
  G.net = null;
});
