import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Vector3, Group } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HumanCharacter } from '../public/js/char/human.js';
import { PoseRig } from '../public/js/char/rig.js';
import { loadMocap, MOCAP } from '../public/js/char/mocap.js';

const rest = [[0,.95,0],[0,.1,0],[0,.47,0],[.22,.41,0],[0,-.31,0],[-.22,.41,0],[0,-.31,0],[.1,-.06,0],[0,-.44,0],[-.1,-.06,0],[0,-.44,0]].map(v=>new Vector3(...v));

test('a failed mask download does not recursively retry and freeze the character update', async () => {
  const loadBefore=GLTFLoader.prototype.loadAsync,warnBefore=console.warn;
  GLTFLoader.prototype.loadAsync=async()=>{throw new Error('offline mask fixture');};
  console.warn=()=>{};
  const ch=Object.assign(Object.create(HumanCharacter.prototype),{look:{model:'eric'},headAnchor:new Group(),material:{userData:{u:{uMask:{value:0}}}}});
  let calls=0;
  ch.wearMask=function(type){if(++calls>1)throw new Error('recursive mask retry');return HumanCharacter.prototype.wearMask.call(this,type);};
  try {
    ch.wearMask('pig');
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(calls,1,'a failed cached download must not recursively call wearMask');
  } finally {GLTFLoader.prototype.loadAsync=loadBefore;console.warn=warnBefore;}
});

test('procedural locomotion stays anatomical through low FPS and recovers after stalls', () => {
  const rig = new PoseRig(rest);
  for (const dt of [1/60, 1/30, 1/20, .1, 1/60]) {
    for (let i=0;i<240;i++) {
      rig.animate({speed:3,grounded:true},dt);
      for (let j=0;j<11;j++) {
        const angles=rig.joints[j].rotation;
        assert.ok([angles.x,angles.y,angles.z].every(v=>Number.isFinite(v)&&Math.abs(v)<2.6),`joint ${j} unstable at dt=${dt}: ${angles.toArray()}`);
      }
    }
  }
});

test('real mocap loads awaitably and crouch transitions do not turn the thighs backwards', async () => {
  const raw = fs.readFileSync(new URL('../public/assets/anim/ual.json',import.meta.url),'utf8');
  const fetchBefore=globalThis.fetch;
  globalThis.fetch=async()=>new Response(raw,{status:200});
  try {
    await loadMocap();
    assert.equal(MOCAP.ready,true,'the same mocap path used in the browser must run in tests');
    const rig=new PoseRig(rest);
    for(let i=0;i<60;i++)rig.animate({speed:0,grounded:true},1/60);
    for(let i=0;i<60;i++) {
      rig.animate({speed:0,grounded:true,crouch:true},1/60);
      for(const j of [7,9]) assert.ok(rig.anim.cur[j].x>=-2.6&&rig.anim.cur[j].x<.7,`thigh ${j} rotates the long way: ${rig.anim.cur[j].x}`);
    }
  } finally {globalThis.fetch=fetchBefore;MOCAP.ready=false;MOCAP.clips=null;}
});
