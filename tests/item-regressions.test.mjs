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
