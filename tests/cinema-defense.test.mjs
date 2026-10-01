import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { G } from '../public/js/core/G.js';
import { LocalPlayer } from '../public/js/game/player.js';
import { Villagers, SHOPS } from '../public/js/game/villagers.js';

test('front-facing inspection camera cannot initiate attacks', () => {
  const p=Object.assign(Object.create(LocalPlayer.prototype),{combatBlocked:true,state:'active',dead:false});
  assert.equal(p._canUseArms(),false);
});

test('ordinary villagers react with self defense, not just guards', () => {
  G.time=10; G.fx=null; G.sfx=null;
  const target={pos:new THREE.Vector3(0,0,1),dead:false};
  const v=new Villagers({scene:new THREE.Scene(),world:{seats:[]},getLocal:()=>target});
  const npc={data:{key:'paseo'},home:{pos:new THREE.Vector3()},pos:new THREE.Vector3(),hp:100,dead:false,down:0,sit:false,say(){}};
  v._hurt(npc,.4,new THREE.Vector3(),true);
  assert.ok(npc.defense,'a non-guard did not remember the aggressor');
});

test('cinema has a vendor and viewers seated in actual world seats; bar patrons use real seats', () => {
  assert.ok(SHOPS.cinema?.items.some(i=>i.id==='popcorn'));
  const seats=[];
  for(let i=0;i<70;i++) seats.push({x:104+Math.floor(i/12)*2.2,y:.46,z:-4+(i%12)*.75,yaw:Math.PI/2});
  for(let i=0;i<5;i++)seats.push({x:96.1,y:.48,z:-26+i*.6,yaw:Math.PI/2});
  const v=new Villagers({scene:new THREE.Scene(),world:{seats},getLocal:()=>null}).build();
  assert.ok(v.byKey.cineVendor);
  const viewers=v.list.filter(n=>n.data.key?.startsWith('cineViewer'));
  assert.ok(viewers.length>=3);
  for(const n of [...viewers,v.byKey.toro2,v.byKey.venus2]){
    assert.ok(n && n.sit); assert.ok(seats.includes(n.data.seat)); assert.ok(n.data.seat.taken);
    assert.ok(Math.abs(n.pos.y-(n.data.seat.y-.46))<.001);
  }
});

test('defense attacks once per strike, cannot hit through a wall and returns home', async () => {
  const {startNpcDefense,stepNpcDefense}=await import('../public/js/game/npc-defense.js');
  let hits=0;const target={pos:new THREE.Vector3(0,0,1.2),dead:false,npcHit(){hits++;}};
  const n={pos:new THREE.Vector3(),home:{pos:new THREE.Vector3()},dead:false,data:{}};
  G.time=0;G.phys={raycast:()=>({dist:.2})};startNpcDefense(n,target);
  for(let i=0;i<140;i++){G.time+=.02;if(i%30===0)n.action=null;stepNpcDefense(n,.02);}
  assert.equal(hits,0,'defender struck through a wall');
  G.phys={raycast:()=>null};
  for(let i=0;i<140;i++){G.time+=.02;if(i%30===0)n.action=null;stepNpcDefense(n,.02);}
  assert.ok(hits>=1&&hits<=3,'strike cadence is missing or repeats every frame');
  n.pos.set(3,0,3);target.dead=true;
  for(let i=0;i<400;i++){G.time+=.02;stepNpcDefense(n,.02);}
  assert.equal(n.defense,null);assert.ok(n.pos.length()<.13);
});

test('the popcorn sign is readable from both sides, not mirrored backface text', async () => {
  const {readableSign}=await import('../public/js/world/readable-sign.js');
  const sign=readableSign(new THREE.Texture(),2.4,.6);sign.updateMatrixWorld(true);
  const ray=new THREE.Raycaster();
  for(const side of [1,-1]){ray.set(new THREE.Vector3(0,0,2*side),new THREE.Vector3(0,0,-side));const hit=ray.intersectObject(sign,true)[0];assert.ok(hit);assert.equal(hit.object.material.side,THREE.FrontSide);assert.ok(hit.uv.x>.49&&hit.uv.x<.51);}
});

test('burning bodies use an independent reusable pool without altering model materials', async () => {
  const {BodyFireView}=await import('../public/js/fx/body-fire.js');
  const root=new THREE.Group(), material=new THREE.MeshStandardMaterial({color:0x123456});root.add(new THREE.Mesh(new THREE.BoxGeometry(),material));
  const bone=new THREE.Object3D();bone.position.set(0,1,0);root.add(bone);
  const char={root,bones:{hip:bone},headVisible:true};const scene=new THREE.Scene(),view=new BodyFireView(scene,2);
  for(let i=0;i<100;i++){view.update(i,[{char,seconds:4}],new THREE.PerspectiveCamera());assert.ok(view.active>0);view.update(i+.1,[],null);assert.equal(view.active,0);}
  assert.equal(material.color.getHex(),0x123456);assert.equal(view.flames.n,10,'pool grew on each ignition');view.dispose();assert.equal(scene.children.length,0);
});

test('contact with real fire ignites, but candles and cosmetic body flames do not', async () => {
  const {FireSet}=await import('../public/js/fx/fire.js');const {touchingWorldFire}=await import('../public/js/fx/body-fire.js');
  const fires=new FireSet();fires.add(0,0,0,.6,.6,.72,{hazard:true});
  const char={capsules:()=>[{a:new THREE.Vector3(0,.2,0),b:new THREE.Vector3(0,1,0),r:.1}]};
  assert.ok(touchingWorldFire(char,fires,null));fires.list[0].hazard=false;assert.equal(touchingWorldFire(char,fires,null),false);
});
