import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Vector3, Group, Euler, Quaternion } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HumanCharacter } from '../public/js/char/human.js';
import { PoseRig } from '../public/js/char/rig.js';
import { loadMocap, MOCAP, addClip } from '../public/js/char/mocap.js';

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


test('mocap interpolation and blending take the short path across the angle seam', () => {
  const makeClip = (a, b) => {
    const f = new Float32Array(96);
    f[31] = a; f[48 + 31] = b;
    return { nf: 2, f, mean: new Float32Array(48), phase0: 0, loop: true };
  };
  const out = new Float32Array(48);
  addClip(out, makeClip(3.1, -3.1), .25, 1);
  assert.ok(Math.abs(out[31]) > 3, `interpolation rotated through zero: ${out[31]}`);
  out.fill(0);
  addClip(out, makeClip(3.1, 3.1), 0, .5, 1, true, 0);
  addClip(out, makeClip(-3.1, -3.1), 0, .5, 1, true, .5);
  assert.ok(Math.abs(out[31]) > 3, `blending rotated through zero: ${out[31]}`);
});


test('the real crouch loop interpolates equivalent knee rotations without a visual flip', async () => {
  const raw = fs.readFileSync(new URL('../public/assets/anim/ual.json', import.meta.url), 'utf8');
  const fetchBefore = globalThis.fetch;
  globalThis.fetch = async () => new Response(raw, { status: 200 });
  try {
    await loadMocap();
    const clip = MOCAP.clips.Crouch_Fwd_Loop, k = 30;
    const quat = (a) => new Quaternion().setFromEuler(new Euler(a[0], a[1], a[2], 'YXZ'));
    const first = quat(clip.f.slice(k, k + 3));
    const last = quat(clip.f.slice((clip.nf - 1) * 48 + k, (clip.nf - 1) * 48 + k + 3));
    const out = new Float32Array(48);
    addClip(out, { ...clip, phase0: 0 }, (clip.nf - .5) / clip.nf, 1);
    const mid = quat(out.slice(k, k + 3));
    assert.ok(mid.angleTo(last.clone().slerp(first, .5)) < .05, 'the loop seam must take the same short rotation as its endpoints');
  } finally { globalThis.fetch = fetchBefore; MOCAP.ready = false; MOCAP.clips = null; }
});


test('crouch motion stays continuous across every loop and through the joint filter', async () => {
  const raw = fs.readFileSync(new URL('../public/assets/anim/ual.json', import.meta.url), 'utf8');
  const fetchBefore = globalThis.fetch;
  globalThis.fetch = async () => new Response(raw, { status: 200 });
  try {
    await loadMocap();
    const rig = new PoseRig(rest), prev = new Quaternion();
    for (let i = 0; i < 600; i++) {
      rig.animate({ speed: 1.7, fwdSpeed: 1.7, grounded: true, crouch: true }, 1 / 60);
      const current = rig.joints[10].quaternion;
      if (i > 60) assert.ok(current.angleTo(prev) < .2, `knee jumped at frame ${i}: ${current.angleTo(prev)}`);
      prev.copy(current);
    }
  } finally { globalThis.fetch = fetchBefore; MOCAP.ready = false; MOCAP.clips = null; }
});
