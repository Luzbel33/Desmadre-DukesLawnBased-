// Physical stability regressions: preserve mass and player control during constraints.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Physics, GR } from '../public/js/core/physics.js';
import { G } from '../public/js/core/G.js';
import { LocalPlayer, PROXY_FILTER } from '../public/js/game/player.js';
import { Ragdoll } from '../public/js/game/ragdoll.js';
import { PoseRig } from '../public/js/char/rig.js';
import { fakeMeta } from './ragdoll-bench.mjs';
function character(){const c={root:new THREE.Group(),meta:fakeMeta(),grip:{l:0,r:0},expr:{},handR:new THREE.Object3D(),handL:new THREE.Object3D()};return new Proxy(c,{get:(o,k)=>k in o?o[k]:()=>null});}
async function fixture(){const ph=new Physics();await ph.init();Object.assign(G,{phys:ph,scene:new THREE.Scene(),inGame:true,time:0,myId:1,players:new Map(),props:null,net:null,sfx:null,gore:null,settings:{desmadre:true},camera:new THREE.PerspectiveCamera()});G.input={enabled:true,locked:true,key:()=>false,hit:()=>false,btn:()=>false};ph.ground(0);const p=new LocalPlayer({},{character:character()});p.teleport(new THREE.Vector3(0,.02,0),0);return {p,ph};}
function peer(ph){const c=character(),rig=new PoseRig(c.meta.jointRest);rig.place(new THREE.Vector3(0,.02,.5),0);rig.animate({speed:0,grounded:true},1/60);const rp={id:2,char:c,pos:new THREE.Vector3(0,.02,.5),stateName:'active',isArmedPart:()=>false};rp.proxy=new Ragdoll(ph,c.meta,{kinematic:true,member:GR.REMOTE,filter:PROXY_FILTER,tag:{kind:'remote',id:2,ref:rp}});rp.proxy.build(rig.transforms());G.players.set(2,rp);return rp;}
function frame(p,ph){ph.step(1/60,d=>p.physicsStep(d,0),()=>p.afterPhysics());G.time+=1/60;p.update(1/60);}
test('inactive parts cannot anchor the simulated body with zero mass',async()=>{const {p,ph}=await fixture();try{p.knockout(60);p.rag.setPartCollide(3,false);p.rag.setPartCollide(4,false);ph.world.step();for(const j of p.rag.joints){if(!j?.isValid())continue;const a=j.body1(),b=j.body2();assert.ok(!a.isEnabled()||!b.isEnabled()||(a.mass()>0&&b.mass()>0),'massless anchor');}for(let i=0;i<180;i++)frame(p,ph);assert.ok(p.rag.bodies.filter(b=>b.isEnabled()).every(b=>{const v=b.linvel();return Math.hypot(v.x,v.y,v.z)<12;}),'unstable velocity');}finally{ph.world.free();}});
test('standing constraint preserves locomotion and available arm controls',async()=>{const {p,ph}=await fixture();peer(ph);try{p.grabbedByRemote(2,'r',1,[0,0,0],true);assert.equal(p.state,'active');assert.equal(p._canUseArms(),true);assert.equal(p.held,1);}finally{ph.world.free();}});
test('restoring disabled parts restores all joints and positive masses',async()=>{const {p,ph}=await fixture();try{p.rag.setPartCollide(3,false);p.rag.setPartCollide(4,false);p.rag.setPartCollide(3,true);p.rag.setPartCollide(4,true);ph.world.step();assert.equal(p.rag.joints.filter(j=>j?.isValid()).length,10);assert.ok(p.rag.bodies.every(b=>b.isEnabled()&&b.mass()>0));}finally{ph.world.free();}});
test('an arm injury is survivable and affects only its own controls',async()=>{const {p,ph}=await fixture();try{p._impact(4,1.5,{src:'prop',by:2,kind:'cut'},new THREE.Vector3(.2,1.1,0),new THREE.Vector3(0,0,1));assert.ok(p.gore&(1<<4));assert.equal(p.dead,false);assert.ok(p.hp>0);assert.equal(p.hasHand('l'),false);assert.equal(p.hasHand('r'),true);}finally{ph.world.free();}});
test('body contacts produce a voice cue for non-head impacts',async()=>{const {p,ph}=await fixture();const sounds=[];G.sfx={trigger:(name)=>sounds.push(name)};try{p._impact(1,.8,{src:'remote',by:2,kind:'blunt'},new THREE.Vector3(0,1.2,0),new THREE.Vector3(0,0,1));assert.ok(sounds.includes('pain'));}finally{G.sfx=null;ph.world.free();}});
