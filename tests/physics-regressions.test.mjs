import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Physics, GR, groups } from '../public/js/core/physics.js';
import { G } from '../public/js/core/G.js';
import { LocalPlayer, PROXY_FILTER } from '../public/js/game/player.js';
import { Ragdoll, PART } from '../public/js/game/ragdoll.js';
import { PoseRig } from '../public/js/char/rig.js';
import { fakeMeta } from './ragdoll-bench.mjs';

function character() {
  const c = { root: new THREE.Group(), meta: fakeMeta(), grip: { l: 0, r: 0 }, expr: {}, handR: new THREE.Object3D(), handL: new THREE.Object3D() };
  return new Proxy(c, { get: (o, k) => k in o ? o[k] : () => null });
}
async function fixture(keys = new Set()) {
  const ph = new Physics(); await ph.init();
  Object.assign(G, { phys: ph, scene: new THREE.Scene(), inGame: true, time: 0, myId: 1, players: new Map(), props: null, net: null, settings: { desmadre: false }, camera: new THREE.PerspectiveCamera() });
  G.input = { enabled: true, locked: true, key: k => keys.has(k), hit: () => false, btn: () => false };
  ph.ground(0);
  const p = new LocalPlayer({}, { character: character() });
  p.teleport(new THREE.Vector3(0, .02, 0), 0);
  return { p, ph };
}
function remote(ph, z = .5) {
  const c = character(), rig = new PoseRig(c.meta.jointRest);
  rig.place(new THREE.Vector3(0, .02, z), 0); rig.animate({ speed: 0, grounded: true }, 1 / 60);
  const rp = { id: 2, char: c, pos: new THREE.Vector3(0, .02, z), stateName: 'active', isArmedPart: () => false };
  rp.proxy = new Ragdoll(ph, c.meta, { kinematic: true, member: GR.REMOTE, filter: PROXY_FILTER, tag: { kind: 'remote', id: 2, ref: rp } });
  rp.proxy.build(rig.transforms()); G.players.set(2, rp); return rp;
}
function frame(p, ph, dt = 1 / 60) {
  ph.step(dt, d => p.physicsStep(d, 0), () => p.afterPhysics()); G.time += dt; p.update(dt);
}

test('a duplicate grab packet does not replace the physical constraint', async () => {
  const {p, ph} = await fixture(); remote(ph);
  try {
    p.grabbedByRemote(2, 'r', 0, [0, 0, 0], true);
    const first = p.grabbedBy.get('2:r'); assert.ok(first);
    p.grabbedByRemote(2, 'r', 0, [0, 0, 0], true);
    assert.equal(p.grabbedBy.get('2:r'), first);
    assert.equal(p.held, 1);
  } finally { ph.world.free(); }
});

test('disconnecting the holder releases its constraints and permits recovery', async () => {
  const {p, ph} = await fixture(); const rp = remote(ph);
  try {
    p.grabbedByRemote(2, 'r', 0, [0, 0, 0], true);
    rp.proxy.destroy(); G.players.delete(2); frame(p, ph);
    assert.equal(p.held, 0); assert.equal(p.grabbedBy.size, 0);
  } finally { ph.world.free(); }
});

test('releasing one hand leaves the other grip intact', async () => {
  const {p, ph} = await fixture(); remote(ph);
  try {
    p.grabbedByRemote(2, 'r', 0, [0, 0, 0], true);
    p.grabbedByRemote(2, 'l', 0, [0, 0, 0], true);
    p.grabbedByRemote(2, 'r', 0, [0, 0, 0], false);
    assert.equal(p.held, 1); assert.ok(p.grabbedBy.has('2:l'));
  } finally { ph.world.free(); }
});

test('knockout does not silently remove an incoming grip', async () => {
  const {p, ph} = await fixture(); remote(ph);
  try {
    p.grabbedByRemote(2, 'r', 0, [0, 0, 0], true);
    p.knockout(2);
    assert.equal(p.held, 1); assert.ok(p.grabbedBy.get('2:r').isValid());
  } finally { ph.world.free(); }
});

test('a body released in mid-air does not teleport to the floor to get up', async () => {
  const {p, ph} = await fixture();
  try {
    p.knockout(2);
    for (const b of p.rag.bodies) { const t = b.translation(); b.setTranslation({x:t.x+4,y:t.y+4,z:t.z},true); b.setLinvel({x:1,y:2,z:0},true); }
    p.rag.snapshot(); p.koT = 0;
    p.update(1 / 60);
    assert.equal(p.physMode, 'rag'); assert.equal(p.state, 'ko');
    assert.ok(p.rag.pelvis().translation().y > 4);
  } finally { ph.world.free(); }
});

test('the walking capsule cannot cross a stationary remote torso', async () => {
  const {p, ph} = await fixture(new Set(['KeyW'])); remote(ph, 1.4);
  try {
    for (let i=0;i<90;i++) frame(p,ph);
    assert.ok(p.pos.z < 1.1, `walked through remote player: z=${p.pos.z}`);
    assert.ok(p.pos.z > .1, 'walking stopped before reaching the obstacle');
  } finally { ph.world.free(); }
});

test('teleporting a kinematic body clears cached velocity before ragdoll', async () => {
  const {p, ph} = await fixture();
  try {
    const old = p.rag.read(), moved = old.map(t => [t[0]+3,...t.slice(1)]);
    p.rag.follow(old, 1/60); ph.world.step();
    p.rag.follow(moved, 1/60); ph.world.step();
    p.rag.teleport(old); p.rag.setKinematic(false);
    assert.ok(p.rag.bodies.every(b => {const v=b.linvel();return Math.hypot(v.x,v.y,v.z)<.01;}), 'stale interpolation velocity launched the body');
  } finally { ph.world.free(); }
});

test('ragdoll network snapshots use current physical positions, not an old render pose', async () => {
  const {p, ph} = await fixture();
  try {
    frame(p,ph); p.knockout(2);
    for(const b of p.rag.bodies){const t=b.translation();b.setTranslation({x:t.x+4,y:t.y,z:t.z},true);}
    p.rag.snapshot(); p.afterPhysics();
    const st=p.netState();
    assert.ok(Math.abs(st.rb[0]-p.rag.pelvis().translation().x)<.01);
    assert.ok(Math.abs(st.p[0]-st.rb[0])<.1, 'root and physical pelvis disagree');
  } finally { ph.world.free(); }
});

test('drag for four metres, release, and recover near the release point', async () => {
  const {p, ph}=await fixture(); const rp=remote(ph,.5);
  try {
    assert.equal(p.grabbedByRemote(2,'r',0,[0,0,0],true),true);
    const start=rp.proxy.read();
    for(let i=0;i<240;i++) {
      const x=4*(i+1)/240;
      rp.proxy.follow(start.map(t=>[t[0]+x,...t.slice(1)]),1/60);
      frame(p,ph);
      assert.ok(p.rag.read().flat().every(Number.isFinite));
    }
    const released=p.rag.pelvis().translation().x;
    assert.ok(released>3,`body did not follow holder: ${released}`);
    p.grabbedByRemote(2,'r',0,[0,0,0],false);
    for(let i=0;i<300;i++) frame(p,ph);
    assert.equal(p.held,0);
    assert.equal(p.state,'active');
    assert.ok(Math.abs(p.pos.x-released)<1,`snapped from ${released} to ${p.pos.x}`);
    assert.ok(p.pos.x>3,'returned to original position');
  } finally {ph.world.free();}
});

test('all anatomical joints have finite angular stops, not free spherical rotations', async () => {
  const {p,ph}=await fixture();
  try {
    const raw=ph.world.impulseJoints.raw;
    for(const part of [1,2,3,5,7,9]) {
      const j=p.rag.joints[part-1];
      for(const axis of [3,4,5]) assert.equal(raw.jointLimitsEnabled(j.handle,axis),true,`part ${part}, axis ${axis} is unlimited`);
    }
  } finally {ph.world.free();}
});

test('an angular stop is enforced by the Rapier solver under repeated impulses', async () => {
  const {p,ph}=await fixture();
  try {
    ph.world.gravity={x:0,y:0,z:0};
    p.rag.setKinematic(false);
    const testedJoint=p.rag.joints[1];
    for(const j of p.rag.joints) if(j!==testedJoint) ph.world.removeImpulseJoint(j,true);
    for(let i=0;i<p.rag.bodies.length;i++) if(i!==1&&i!==2)p.rag.bodies[i].setEnabled(false);
    const parent=p.rag.bodies[1],child=p.rag.bodies[2],pos=parent.translation(),rest=p.meta.jointRest[2];
    parent.setBodyType(1,true);
    parent.setRotation({x:0,y:0,z:0,w:1},true);
    child.setRotation({x:0,y:0,z:0,w:1},true);
    child.setTranslation({x:pos.x+rest.x,y:pos.y+rest.y,z:pos.z+rest.z},true);
    for(let i=0;i<180;i++){child.applyTorqueImpulse({x:0,y:0,z:.08},true);ph.world.step();}
    const q=child.rotation(),angle=2*Math.atan2(q.z,q.w);
    assert.ok(angle>.2&&angle<.75,`angular stop failed: ${angle} rad`);
    const t=child.translation();
    assert.ok(Math.hypot(t.x-pos.x-rest.x,t.y-pos.y-rest.y,t.z-pos.z-rest.z)<.05,'joint separated');
  } finally {ph.world.free();}
});
