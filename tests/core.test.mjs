import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from 'three';
import { Physics, RAPIER, GR, groups } from '../public/js/core/physics.js';
import { G, clamp, dampAngle } from '../public/js/core/G.js';
import { LocalPlayer } from '../public/js/game/player.js';
import { World } from '../public/js/world/world.js';
import { TEX } from '../public/js/world/textures.js';
import { GraffitiManager } from '../public/js/game/graffiti.js';
import { fakeMeta } from './ragdoll-bench.mjs';
// Only canvas rendering is stubbed: movement, Three geometry and Rapier are real.
TEX.grass=()=>new THREE.Texture();
const playerSource=fs.readFileSync(new URL('../public/js/game/player.js',import.meta.url),'utf8');
const BODY=+playerSource.match(/const BODY_Y = ([0-9.]+)/)[1];
// Personaje de prueba: el esqueleto sintético de los bancos de ragdoll, sin GLB ni canvas.
function stubCharacter(){
 const target={root:new THREE.Group(),meta:fakeMeta()};
 return new Proxy(target,{get:(o,k)=>k in o?o[k]:()=>null});
}
async function fixture(keys=new Set(['KeyW'])) {
 const ph=new Physics();await ph.init();G.phys=ph;G.scene=new THREE.Scene();G.inGame=true;G.time=0;
 G.input={enabled:true,locked:true,key:k=>keys.has(k),hit:()=>false,btn:()=>false};
 new World(G.scene,ph)._ground();
 const p=new LocalPlayer({},{character:stubCharacter()});
 p.teleport(new THREE.Vector3(0,.02,0),0);
 return {p,ph,keys};
}
// Un paso completo como en el juego: física a paso fijo + animación del frame
function frame(p,ph,dt,yaw){ph.step(dt,d=>p.physicsStep(d,yaw),()=>p.afterPhysics());G.time+=dt;p.update(dt);}
test('D strafes to camera right, for four camera headings',async()=>{
 for(const yaw of [0,Math.PI/2,Math.PI,3*Math.PI/2]){
  const {p,ph}=await fixture(new Set(['KeyD']));
  for(let n=0;n<60;n++)frame(p,ph,1/60,yaw);
  const dir=p.pos.clone().setY(0).normalize();const cameraRight=new THREE.Vector3(-Math.cos(yaw),0,Math.sin(yaw));
  assert.ok(dir.dot(cameraRight)>.99,`D moves left for yaw=${yaw}`);ph.world.free();
 }
});
test('flat floor supports steady six-second walking without stopped frames',async()=>{
 const {p,ph}=await fixture();let min=Infinity,maxY=-Infinity,minY=Infinity;
 for(let n=0;n<360;n++){
  const prev=p.pos.clone();frame(p,ph,1/60,0);
  if(n>60){min=Math.min(min,p.pos.z-prev.z);minY=Math.min(minY,p.pos.y);maxY=Math.max(maxY,p.pos.y);}
 }
 assert.ok(min>.06,`Smallest movement step=${min}`); // caminar = 3.9 m/s -> 0.065 m por frame
 assert.ok(maxY-minY<.002,`Vertical jitter=${maxY-minY}`);assert.ok(Math.abs(p.pos.y)<.005,`Feet penetrate floor: y=${p.pos.y}`);ph.world.free();
});
test('walking stays consistent at 30, 60 and 144 render fps',async()=>{
 const distances=[];
 for(const fps of [30,60,144]){
  const {p,ph}=await fixture();for(let n=0;n<fps*3;n++)frame(p,ph,1/fps,0);
  distances.push(p.pos.z);ph.world.free();
 }
 assert.ok(Math.max(...distances)-Math.min(...distances)<.1,JSON.stringify(distances));
});
function cameraFunction(){
 const src=fs.readFileSync(new URL('../public/js/main.js',import.meta.url),'utf8');
 return src.slice(src.indexOf('function updateCamera(dt)'),src.indexOf('function updateHud(dt)'));
}
test('first person camera comes from head anchor, not 1.32m chest height',()=>{
 const root=new THREE.Group();const local={pos:new THREE.Vector3(),renderPos:new THREE.Vector3(),char:{root,headWorld:o=>o.set(0,1.72,0),setVisibleHead:()=>{}}};
 const ctx={THREE,G:{camera:new THREE.PerspectiveCamera(),phys:{raycast:()=>null}},state:{local,viewYaw:0,viewPitch:0,cameraMode:2},tmpV:new THREE.Vector3(),tmpV2:new THREE.Vector3(),clamp,GR,groups};
 vm.createContext(ctx);vm.runInContext(cameraFunction()+';updateCamera(1/60);',ctx);
 assert.ok(Math.abs(ctx.G.camera.position.y-1.72)<.06,`Camera y=${ctx.G.camera.position.y}`);
});
function sprayFixture(){
 const g=Object.create(GraffitiManager.prototype);g.ray=new THREE.Raycaster();g.ray.far=5.5;
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(4,4),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.position.set(0,1.5,2);mesh.userData.surfaceId='test';mesh.updateMatrixWorld(true);
 g.surfaces=new Map([['test',{mesh,def:{id:'test',pw:256,ph:256,ppm:64}}]]);g.fixedMeshes=[mesh];g.sent=[];g._sendDots=(id,dots)=>g.sent.push(...dots);G.phys=null;
 return g;
}
function cam(z){const c=new THREE.PerspectiveCamera();c.position.set(0,1.5,z);c.lookAt(0,1.5,20);c.updateMatrixWorld(true);return c;}
test('third-person spray reaches a wall 2m from player, camera 5m behind',()=>{
 const g=sprayFixture();const hit=g.spray(cam(-5),{origin:new THREE.Vector3(0,1.5,0),maxReach:3});assert.ok(hit,'Wall in player reach was missed');
});
test('spray refuses targets out of player reach even if camera is nearby',()=>{
 const g=sprayFixture();assert.equal(g.spray(cam(.08),{origin:new THREE.Vector3(0,1.5,-8),maxReach:3}),null);
});
test('spray preserves selected sRGB colour bytes',()=>{
 const g=sprayFixture();g.spray(cam(.08),{origin:new THREE.Vector3(0,1.5,0),color:'#ff2d55'});assert.deepEqual([g.sent[0].r,g.sent[0].g,g.sent[0].b],[255,45,85]);
});
test('spray cannot paint through a world obstruction',()=>{
 const g=sprayFixture();assert.equal(g.spray(cam(.08),{origin:new THREE.Vector3(0,1.5,0),isBlocked:()=>true}),null);
});
test('each consumable has a visible, correctly scaled 3D object',async()=>{
 let api;try{api=await import('../public/js/game/equipment.js');}catch{}
 assert.ok(api?.createEquippedModel,'Missing equipment model factory');
 for(const slot of [1,2,3]){
  const group=api.createEquippedModel(slot);assert.ok(group?.children.length>0);
  const box=new THREE.Box3().setFromObject(group);const size=box.getSize(new THREE.Vector3());
  assert.ok(size.length()>.03&&size.length()<.55,`slot ${slot} has invalid physical scale`);
 }
});
test('menu includes a live avatar preview surface',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/id="avatar-preview"/);
});

test('diagonal input does not increase movement speed',async()=>{
 const distances=[];
 for(const keys of [new Set(['KeyW']),new Set(['KeyW','KeyD'])]){
  const {p,ph}=await fixture(keys);
  for(let n=0;n<120;n++)frame(p,ph,1/60,0);
  distances.push(Math.hypot(p.pos.x,p.pos.z));ph.world.free();
 }
 assert.ok(Math.abs(distances[0]-distances[1])<.03,JSON.stringify(distances));
});
test('buffered jump survives a render frame without a physics step',async()=>{
 const {p,ph}=await fixture(new Set());
 for(let n=0;n<60;n++)frame(p,ph,1/60,0);
 p.queueJump();frame(p,ph,1/240,0);
 assert.ok(p.jumpBuffer>0,'jump disappeared before physics consumed it');
 let peak=p.pos.y;
 for(let n=0;n<75;n++){frame(p,ph,1/60,0);peak=Math.max(peak,p.pos.y);}
 assert.ok(peak>.8,`jump peak=${peak}`);assert.ok(p.grounded);assert.ok(Math.abs(p.pos.y)<.005);ph.world.free();
});
test('losing pointer lock stops translation even with a held key',async()=>{
 const {p,ph}=await fixture();
 for(let n=0;n<60;n++)frame(p,ph,1/60,0);
 const before=p.pos.clone();G.input.locked=false;
 for(let n=0;n<30;n++)frame(p,ph,1/60,0);
 assert.ok(p.pos.clone().setY(0).distanceTo(before.setY(0))<.002);ph.world.free();
});
test('the controller stops at a wall without tunnelling',async()=>{
 const {p,ph}=await fixture();ph.box(0,1,3,4,1,.2);
 for(let n=0;n<180;n++)frame(p,ph,1/60,0);
 assert.ok(p.pos.z>2&&p.pos.z<2.55,`player crossed wall at z=${p.pos.z}`);
 assert.ok(Math.abs(p.pos.y)<.01);ph.world.free();
});
// C: agacharse / barrida corriendo / dive en el aire (nunca Ctrl: Ctrl+W cierra la pestaña)
test('C agacha (más lento), corriendo es barrida y en el aire es dive',async()=>{
 const {p,ph,keys}=await fixture(new Set(['KeyW','KeyC']));
 for(let n=0;n<90;n++)frame(p,ph,1/60,0);
 assert.ok(p.crouching,'no se agacha');
 assert.ok(p.speed>1.2&&p.speed<2.6,`agachado va a ${p.speed.toFixed(2)} m/s`);
 keys.delete('KeyC');keys.add('ShiftLeft');
 for(let n=0;n<60;n++)frame(p,ph,1/60,0);
 assert.ok(p.speed>6,`corriendo va a ${p.speed.toFixed(2)}`);
 keys.add('KeyC');frame(p,ph,1/60,0);
 assert.ok(p.mv.slideT>0,'corriendo + C no barre');
 for(let n=0;n<12;n++)frame(p,ph,1/60,0);
 assert.ok(p.speed>6,`la barrida frenó de golpe (${p.speed.toFixed(2)})`);
 for(let n=0;n<90;n++)frame(p,ph,1/60,0);
 assert.equal(p.mv.slideT,0,'la barrida no termina');
 ph.world.free();
 const f=await fixture(new Set(['KeyW','ShiftLeft']));
 for(let n=0;n<60;n++)frame(f.p,f.ph,1/60,0);
 f.p.queueJump();for(let n=0;n<8;n++)frame(f.p,f.ph,1/60,0);
 assert.ok(!f.p.grounded,'no saltó corriendo');
 f.keys.add('KeyC');frame(f.p,f.ph,1/60,0);
 assert.equal(f.p.mv.dive,1,'C en el aire no hace dive');
 let top=0;const seen=new Set();
 for(let n=0;n<150;n++){frame(f.p,f.ph,1/60,0);top=Math.max(top,f.p.speed);seen.add(f.p.mv.dive);}
 assert.ok(top>8,`el dive no lanza (${top.toFixed(2)} m/s)`);
 assert.ok(seen.has(2)&&seen.has(3),'no cae de panza ni se levanta: '+[...seen]);
 assert.equal(f.p.mv.dive,0,'se quedó tirado');
 assert.equal(f.p.state,'active');
 f.ph.world.free();
});
test('saltar corriendo no tropieza: cae y sigue corriendo',async()=>{
 const {p,ph}=await fixture(new Set(['KeyW','ShiftLeft']));
 for(let n=0;n<60;n++)frame(p,ph,1/60,0);
 p.queueJump();
 let air=false,landed=false;
 for(let n=0;n<90;n++){frame(p,ph,1/60,0);if(!p.grounded)air=true;else if(air)landed=true;}
 assert.ok(air&&landed);
 assert.equal(p.state,'active');assert.equal(p.mv.dive,0);
 assert.ok(p.speed>6,`después del salto va a ${p.speed.toFixed(2)}`);
 ph.world.free();
});
