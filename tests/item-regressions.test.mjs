import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { G } from '../public/js/core/G.js';
import { LocalPlayer } from '../public/js/game/player.js';
import { PropManager, defOf } from '../public/js/game/props.js';
import { Npc } from '../public/js/game/npc.js';

for (const item of ['beer','smoke','spray','cash','pistol','grenade','potion','chori','apple']) {
  test(`dropping ${item} creates that physical item rather than deleting it`, () => {
    const spawned=[];
    G.props={spawnThrow(type,pos,vel){const prop={type};spawned.push({type,pos,vel});return prop;}};
    G.camera={getWorldDirection:v=>v.set(0,0,1)};
    const player=Object.assign(Object.create(LocalPlayer.prototype),{hands:{r:{item}},handPos:(_,v)=>v.set(0,1.3,0),handVelocity:()=>new THREE.Vector3(),onEvent(){}});
    assert.equal(player.release('r',false),true);
    assert.equal(spawned.length,1,'a gentle release must not discard a consumable');
    assert.equal(defOf(spawned[0].type).item,item,'physical item identity must match what left the hand');
    assert.equal(player.hands.r.item,null);
    assert.ok(spawned[0].vel.length()<2,'dropping must not secretly launch the item');
  });
}

test('failed physical spawn keeps the equipped item in the hand', () => {
  G.props={spawnThrow(){return null;}};G.camera={getWorldDirection:v=>v.set(0,0,1)};
  const player=Object.assign(Object.create(LocalPlayer.prototype),{hands:{r:{item:'potion'}},handPos:(_,v)=>v.set(0,1.3,0),handVelocity:()=>new THREE.Vector3(),onEvent(){}});
  assert.equal(player.release('r',false),false);
  assert.equal(player.hands.r.item,'potion');
});

test('thrown bottles invoke the NPC damage, recoil, voice and onHurt pipeline once', () => {
  let voices=0,reactions=0;
  const npc=Object.assign(Object.create(Npc.prototype),{char:{wound(){},worldToPart:()=>new THREE.Vector3()},dead:false,hp:100,pos:new THREE.Vector3(),heightK:1,yaw:0,snap:{headV:new THREE.Vector2(),torsoV:new THREE.Vector2()},_hitCd:-Infinity,vocal(){voices++;},onHurt(){reactions++;},_floatDmg(){},knockout(){},die(){}});
  const collider={translation:()=>({x:0,y:1,z:0})};
  G.phys={world:{contactPairsWith(_,fn){fn(collider);},contactPair(_,__,fn){fn({numContacts:()=>1});}},info:()=>({kind:'bag',ref:npc,part:1})};
  const prop={collider:{},lastV:new THREE.Vector3(0,0,10),mass:.45,type:'bottle'};
  PropManager.prototype._thrownHits.call({},prop);
  const hp=npc.hp;
  assert.ok(hp<100,'the bottle collided but never damaged the NPC');
  assert.ok(npc.snap.torsoV.length()>0,'NPC has no physical recoil');
  assert.equal(voices,1);assert.equal(reactions,1);
  PropManager.prototype._thrownHits.call({},prop);
  assert.equal(npc.hp,hp,'multiple limb contacts counted the same thrown object twice');
});

test('all equipped drops preserve meshes, state and replica identity with real Rapier bodies', async () => {
  const { Physics } = await import('../public/js/core/physics.js');
  const { HELD_ITEMS, heldType } = await import('../public/js/shared/held-items.js');
  const { createEquippedModel } = await import('../public/js/game/equipment.js');
  const ph = new Physics(); await ph.init(); G.phys = ph; G.scene = new THREE.Scene(); G.myId = 1;
  const packets = [], pm = new PropManager({ send: p => packets.push(p) }, null); G.props = pm;
  for (const [item, spec] of Object.entries(HELD_ITEMS)) {
    const p = pm.spawnThrow(heldType(item), new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, -.2, 0), { bites: 2 });
    assert.equal(p.def.item, item); assert.equal(p.group.name, `equipped-${spec.slot}`);
    assert.ok(p.body.mass() > 0); assert.ok(Math.abs(p.body.mass() - spec.mass) < .001);
    const reference = createEquippedModel(spec.slot), expected = new THREE.Box3().setFromObject(reference).getSize(new THREE.Vector3());
    const clone = p.group.clone(); clone.position.set(0,0,0); clone.quaternion.identity();
    const actual = new THREE.Box3().setFromObject(clone).getSize(new THREE.Vector3());
    assert.ok(expected.distanceTo(actual) < .00001, `dropped ${item} changed its mesh dimensions`);
    assert.equal(p.extra.bites, 2); assert.equal(packets.at(-1).k, heldType(item)); assert.equal(packets.at(-1).x.bites, 2);
    pm.remove(p.id);
  }
  ph.world.free(); G.phys = null; G.props = null;
});

test('G launches the actual item and drops do not require arm movement', async () => {
  const { releaseEquipped } = await import('../public/js/game/held-release.js');
  const spawned=[]; G.props={spawnThrow(type,pos,vel){spawned.push({type,pos,vel}); return {id:1};}};
  G.camera={getWorldDirection:v=>v.set(0,0,1)};
  const p={hands:{l:{item:'potion'}},handPos:(_,v)=>v.set(0,1,0),handVelocity:()=>new THREE.Vector3()};
  assert.ok(releaseEquipped(p,'l',{throwing:true}));
  assert.equal(spawned[0].type,'held_potion'); assert.ok(spawned[0].vel.z>12);
  assert.equal(p.hands.l.item,null);
});

test('dropped and thrown items clean themselves up: per-player cap and idle lifetime', async () => {
  const { Physics } = await import('../public/js/core/physics.js');
  const { heldType } = await import('../public/js/shared/held-items.js');
  const { SPAWN_MAX, SPAWN_LIFE } = await import('../public/js/game/props.js');
  const ph = new Physics(); await ph.init(); G.phys = ph; G.scene = new THREE.Scene(); G.myId = 2;
  const packets = [], pm = new PropManager({ send: p => packets.push(p) }, null); G.props = pm;
  const ids = [];
  for (let i = 0; i < SPAWN_MAX + 8; i++) ids.push(pm.spawnThrow(heldType(i % 2 ? 'beer' : 'spray'), new THREE.Vector3(i * .3, 1, 0), new THREE.Vector3()).id);
  assert.equal(pm.items.size, SPAWN_MAX, 'spamming the pocket slots piled up unlimited props');
  assert.deepEqual(packets.filter(p => p.t === 'pd').map(p => p.id), ids.slice(0, 8), 'the oldest drops must go first and replicas must be told');
  // el que tengo en la mano no se borra aunque pase el tiempo
  const held = pm.get(ids.at(-1)); held.heldBy = G.myId;
  for (const p of pm.items.values()) p.handledAt -= SPAWN_LIFE + 1;
  pm.update(1.1);
  assert.deepEqual([...pm.items.keys()], [held.id], 'idle drops must vanish by themselves, the held one must stay');
  ph.world.free(); G.phys = null; G.props = null;
});

test('lo que se pide en el Búnker: cada cosa tiene modelo, versión física, número propio y está en un menú', async () => {
  const { CONSUMABLES, BAR_MENU, CAFE_MENU } = await import('../public/js/shared/consumables.js');
  const { HELD_ITEMS } = await import('../public/js/shared/held-items.js');
  const { ITEM_EQ } = await import('../public/js/game/player.js');
  const { createEquippedModel } = await import('../public/js/game/equipment.js');
  const slots = new Set(Object.values(ITEM_EQ).filter((s, i, a) => a.indexOf(s) !== i));
  assert.equal(slots.size, 0, 'two items share a held-model number');
  for (const [item, c] of Object.entries(CONSUMABLES)) {
    assert.equal(ITEM_EQ[item], c.slot, `${item} is not synced to other players`);
    assert.equal(HELD_ITEMS[item]?.slot, c.slot, `${item} has no physical drop`);
    assert.ok(createEquippedModel(c.slot).children.length > 0, `${item} has no model in the hand`);
    assert.ok(c.uses >= 1 && ['drink', 'smoke', 'eat'].includes(c.kind));
  }
  for (const m of [...BAR_MENU, ...CAFE_MENU]) assert.ok(m.item in ITEM_EQ, `${m.item} in a menu cannot be held`);
});
