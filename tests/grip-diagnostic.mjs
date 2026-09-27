// Reproduce standing drag with event traces; no changes to runtime state transitions.
import * as THREE from 'three';
import {Physics,GR} from '../public/js/core/physics.js';
import {G} from '../public/js/core/G.js';
import {LocalPlayer,PROXY_FILTER} from '../public/js/game/player.js';
import {Ragdoll} from '../public/js/game/ragdoll.js';
import {PoseRig} from '../public/js/char/rig.js';
import {fakeMeta} from './ragdoll-bench.mjs';
function character(){const c={root:new THREE.Group(),meta:fakeMeta(),grip:{l:0,r:0},expr:{},handR:new THREE.Object3D(),handL:new THREE.Object3D()};return new Proxy(c,{get:(o,k)=>k in o?o[k]:()=>null});}
for(let run=0;run<4;run++){
 const ph=new Physics();await ph.init();Object.assign(G,{phys:ph,scene:new THREE.Scene(),inGame:true,time:0,myId:1,players:new Map(),props:null,net:null,sfx:null,gore:null,settings:{desmadre:false},camera:new THREE.PerspectiveCamera()});G.input={enabled:true,locked:true,key:()=>false,hit:()=>false,btn:()=>false};ph.ground(0);
 const p=new LocalPlayer({},{character:character()});p.teleport(new THREE.Vector3(0,.02,0),0);
 const c=character(),rig=new PoseRig(c.meta.jointRest);rig.place(new THREE.Vector3(0,.02,.5),0);rig.animate({speed:0,grounded:true},1/60);
 const rp={id:2,char:c,pos:new THREE.Vector3(0,.02,.5),stateName:'active',isArmedPart:()=>false};rp.proxy=new Ragdoll(ph,c.meta,{kinematic:true,member:GR.REMOTE,filter:PROXY_FILTER,tag:{kind:'remote',id:2,ref:rp}});rp.proxy.build(rig.transforms());G.players.set(2,rp);
 const events=[];p.onEvent=(kind,data)=>{if(['ko','impact','death'].includes(kind))events.push({kind,data,time:G.time,pos:p.pos.toArray()});};
 const start=rp.proxy.read();p.grabbedByRemote(2,'r',0,[0,0,0],true);
 const frame=()=>{ph.step(1/60,dt=>p.physicsStep(dt,0),()=>p.afterPhysics());G.time+=1/60;p.update(1/60);};
 for(let i=0;i<240;i++){rp.proxy.follow(start.map(t=>[t[0]+4*(i+1)/240,...t.slice(1)]),1/60);frame();}
 const released={state:p.state,pos:p.pos.toArray(),koT:p.koT,balance:p.balance,vy:p.vy};p.grabbedByRemote(2,'r',0,[0,0,0],false);
 for(let i=0;i<300;i++)frame();
 console.log(JSON.stringify({run,released,end:{state:p.state,pos:p.pos.toArray(),koT:p.koT,hp:p.hp,balance:p.balance,held:p.held,vel:p.rag.pelvis().linvel()},events}));ph.world.free();
}
