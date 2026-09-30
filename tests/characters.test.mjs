// Real shipped GLB geometry/bones and real Rapier. Only texture decoding is
// omitted in Node; the browser review covers the packed textures and shaders.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { preloadHumans, HumanCharacter, MODELS } from '../public/js/char/human.js';
import { Physics } from '../public/js/core/physics.js';
import { PoseRig } from '../public/js/char/rig.js';
import { Ragdoll } from '../public/js/game/ragdoll.js';
import { LocalPlayer, RemotePlayer } from '../public/js/game/player.js';
import { G } from '../public/js/core/G.js';
import { FireBalls, SurfaceFires, clearFirePath } from '../public/js/fx/demon-fire.js';
import { FireBreath, setBreathPhysics } from '../public/js/fx/breath.js';
import { FireSet } from '../public/js/fx/fire.js';
import { Flames } from '../public/js/fx/flame.js';
import { OwnerPowers } from '../public/js/game/owner.js';
import { DEMON_FIRE as FIRE, fireShot } from '../public/js/shared/demon-fire.js';

globalThis.self = globalThis;
const loadAsync = GLTFLoader.prototype.loadAsync;
GLTFLoader.prototype.loadAsync = async function(file) {
  const data = fs.readFileSync(new URL('../public/' + file, import.meta.url));
  const jsonSize = data.readUInt32LE(12);
  const doc = JSON.parse(data.subarray(20, 20 + jsonSize).toString());
  doc.materials = [{ name: 'Node texture-free material', pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] } }];
  delete doc.images; delete doc.textures; delete doc.samplers;
  for (const mesh of doc.meshes) for (const p of mesh.primitives) p.material = 0;
  const json = Buffer.from(JSON.stringify(doc));
  const padding = (4 - json.length % 4) % 4;
  const bin = data.subarray(20 + jsonSize);
  const out = Buffer.alloc(20 + json.length + padding + bin.length, 32);
  data.copy(out, 0, 0, 20);
  out.writeUInt32LE(out.length, 8); out.writeUInt32LE(json.length + padding, 12);
  json.copy(out, 20); bin.copy(out, 20 + json.length + padding);
  return this.parseAsync(out.buffer.slice(out.byteOffset, out.byteOffset + out.length), '');
};
try { await preloadHumans(); } finally { GLTFLoader.prototype.loadAsync = loadAsync; }

function bounds(ch) {
  ch.root.updateMatrixWorld(true);
  ch.skinned.skeleton.update();
  const box = new THREE.Box3(), p = new THREE.Vector3();
  for (let i = 0; i < ch.skinned.geometry.attributes.position.count; i++) {
    ch.skinned.getVertexPosition(i, p);
    assert.ok(p.toArray().every(Number.isFinite), 'finite deformed vertex');
    box.expandByPoint(p);
  }
  return box;
}

for (const key of ['galleta', 'diablo']) {
  test(`${key}: GLB skin, locomotion, grasp and independent instances`, () => {
    const ch = new HumanCharacter({ model: key }), clone = new HumanCharacter({ model: key });
    assert.equal(ch.modelKey, key);
    assert.equal(ch.meta.jointRest.length, 11);
    assert.ok(Math.abs(ch.meta.height - (key === 'galleta' ? 1.8 : 2.2)) < .12);
    assert.ok(ch.meta.vparts.every(p => p.length > 0), 'all eleven hit regions have vertices');
    const skin = ch.skinned.geometry.attributes.skinWeight;
    for (let i = 0; i < skin.count; i++) {
      const sum = skin.getX(i) + skin.getY(i) + skin.getZ(i) + skin.getW(i);
      assert.ok(Math.abs(sum - 1) < .001, `normalized weights at vertex ${i}`);
    }
    for (const st of [{speed: 0}, {speed: 3}, {speed: 6}, {speed: 0, action: 'punchR', actionT: .15}, {speed: 0, sit: true}, {speed: 0, emote: 'dance2', emoteT: .7}]) {
      for (let i = 0; i < 40; i++) { ch.animate({...st, grounded: true}, 1/60); ch.update(1/60); }
      const box = bounds(ch), size = box.getSize(new THREE.Vector3());
      assert.ok(size.length() < 4.5 && box.min.y > -1.4, `no skin explosion: ${JSON.stringify(st)} ${size.toArray()}`);
      assert.ok(ch.fistWorld('l').toArray().every(Number.isFinite));
      assert.ok(ch.mouthWorld().toArray().every(Number.isFinite));
    }
    ch.setVisibleHead(false); assert.equal(clone.bones.head.scale.x, 1);
    ch.resetBody(); assert.equal(ch.bones.head.scale.x, .0001);
    ch.setVisibleHead(true); assert.equal(ch.bones.head.scale.x, 1);
    if (MODELS[key].devil) {
      ch.devil.setGhost(1); assert.equal(ch.material.depthWrite, false);
      ch.devil.setGhost(0); assert.equal(ch.material.opacity, 1);
    }
    ch.dispose(); clone.dispose();
  });

  test(`${key}: real ragdoll falls on the floor with connected joints`, async () => {
    const ch = new HumanCharacter({ model: key });
    const physics = new Physics(); await physics.init(); physics.ground();
    const rig = new PoseRig(ch.meta.jointRest, ch.meta.clavPivot);
    rig.place(new THREE.Vector3(0, .5, 0), 0); rig.animate({speed:0,grounded:true}, 1/60);
    const rag = new Ragdoll(physics, ch.meta); rag.build(rig.transforms()); rag.strength = 0;
    for (let i = 0; i < 240; i++) physics.step(1/60);
    const pose = rag.read();
    assert.ok(pose.flat().every(Number.isFinite));
    assert.ok(pose.every(p => p[1] > -.3 && p[1] < 1.2), 'body settles on floor');
    ch.applyWorldTransforms(pose); ch.update(1/60); bounds(ch);
    rag.destroy(); physics.world.free(); ch.dispose();
  });
}

for(const model of ['galleta','diablo'])test(`${model}: raising the arms keeps the central chest attached to the spine`, () => {
  const ch = new HumanCharacter({model});
  ch.update(0); ch.root.updateMatrixWorld(true); ch.skinned.skeleton.update();
  const pos=ch.skinned.geometry.attributes.position, baseline=[], point=new THREE.Vector3();
  for(let i=0;i<pos.count;i++) {
    const low=model==='galleta'?1.02:1.22,high=model==='galleta'?1.31:1.68;
    if(Math.abs(pos.getX(i))<(model==='galleta'?.13:.10) && pos.getY(i)>low && pos.getY(i)<high) {
      ch.skinned.getVertexPosition(i,point); baseline.push([i,point.clone()]);
    }
  }
  assert.ok(baseline.length>100,'measurable central chest region');
  ch.joints[3].rotation.set(-1.2,0,1.9); ch.joints[4].rotation.x=-1.4;
  ch.joints[5].rotation.set(-.8,0,-1.5); ch.joints[6].rotation.x=-1;
  ch.update(0); ch.root.updateMatrixWorld(true); ch.skinned.skeleton.update();
  let moved=0,detail=[];
  for(const [i,p] of baseline) { ch.skinned.getVertexPosition(i,point);if(point.distanceTo(p)>moved){moved=point.distanceTo(p);detail=[i,[pos.getX(i),pos.getY(i),pos.getZ(i)],Array.from({length:4},(_,k)=>[ch.meta.boneNames[ch.skinned.geometry.attributes.skinIndex.getComponent(i,k)],ch.skinned.geometry.attributes.skinWeight.getComponent(i,k)])];} }
  ch.dispose();
  assert.ok(moved<.001,`arms pulled the central chest ${moved.toFixed(4)} m ${JSON.stringify(detail)}`);
});

test('Diablo arm joints sit inside their skin segments and follow manual IK',()=>{
  const ch=new HumanCharacter({model:'diablo'});ch.update(0);
  ch.root.updateMatrixWorld(true);ch.skinned.skeleton.update();
  const geo=ch.skinned.geometry,point=new THREE.Vector3();
  let distal=0;
  for(let v=0;v<geo.attributes.position.count;v++) {
    ch.skinned.getVertexPosition(v,point);
    let arm=0,core=0;
    for(let k=0;k<4;k++) {
      const name=ch.meta.boneNames[geo.attributes.skinIndex.getComponent(v,k)],w=geo.attributes.skinWeight.getComponent(v,k);
      if(name.startsWith('hand_')||name.startsWith('lowerarm_'))arm+=w;
      if(name.startsWith('spine_')||name==='hip')core+=w;
    }
    if(point.y<1.30&&arm>.5) {assert.ok(core<.001,'hands/forearms cannot remain attached to the torso');distal++;}
  }
  assert.ok(distal>300,'both distal arms covered');
  for(const side of ['l','r'])for(const name of ['upperarm','lowerarm']) {
    const bone=name+'_'+side,next=(name==='upperarm'?'lowerarm':'hand')+'_'+side;
    const a=ch.bones[bone].getWorldPosition(new THREE.Vector3()),b=ch.bones[next].getWorldPosition(new THREE.Vector3());
    const dir=b.clone().sub(a).normalize();let count=0,proximal=0;
    for(let v=0;v<geo.attributes.position.count;v++) {
      let weight=0;for(let k=0;k<4;k++)if(ch.meta.boneNames[geo.attributes.skinIndex.getComponent(v,k)]===bone)weight+=geo.attributes.skinWeight.getComponent(v,k);
      if(weight<.7)continue;
      ch.skinned.getVertexPosition(v,point);proximal=Math.max(proximal,-point.clone().sub(a).dot(dir));count++;
    }
    assert.ok(count>60,`${bone}: measurable skin`);
    assert.ok(proximal<.10,`${bone}: skin extends ${proximal.toFixed(3)} m above the joint`);
  }
  const rig=new PoseRig(ch.meta.jointRest,ch.meta.clavPivot,ch.meta.gripLocal);
  rig.place(new THREE.Vector3(),0);
  for(const height of [.7,1.4,2.1]) {
    rig.resetShoulders();rig.reach('l',new THREE.Vector3(.38,height,.42));rig.reach('r',new THREE.Vector3(-.38,height,.42));
    ch.applyWorldTransforms(rig.transforms());ch.update(0);bounds(ch);
    for(const [side,j]of [['l',3],['r',5]])for(const [name,offset]of [['upperarm',0],['lowerarm',1]]) {
      const skin=ch.bones[name+'_'+side].getWorldPosition(new THREE.Vector3()),target=ch.joints[j+offset].getWorldPosition(new THREE.Vector3());
      assert.ok(skin.distanceTo(target)<.002,`${name}_${side}: physical and visible joint agree`);
    }
  }
  ch.dispose();
});

test('first person keeps head and mouth anchors stable when hiding the skin',()=>{
  for(const model of ['eric','galleta','diablo']) {
    const ch=new HumanCharacter({model});ch.joints[2].rotation.set(.15,.3,0);ch.update(0);
    const head=ch.headWorld(),mouth=ch.mouthWorld();
    ch.setVisibleHead(false);
    assert.ok(ch.headWorld().distanceTo(head)<.000001,`${model}: camera stays at head height`);
    assert.ok(ch.mouthWorld().distanceTo(mouth)<.000001,`${model}: fire origin stays at mouth`);
    ch.setVisibleHead(true);ch.dispose();
  }
});

test('Diablo fire: swept hits stop at a real wall, hit skin capsules and expire at range',async()=>{
  const ph=new Physics();await ph.init();ph.ground();ph.box(0,1.4,2,.8,1.4,.05);ph.step(1/60);
  const ch=new HumanCharacter({model:'galleta'});ch.root.position.z=4;ch.update(0);
  const scene=new THREE.Scene(),breath=new FireBreath(scene),hits=[];
  const balls=new FireBalls(scene,ph,breath,b=>hits.push(b));
  const origin=new THREE.Vector3(0,1.2,0),dir=new THREE.Vector3(0,0,1);
  balls.launch('wall',1,origin,dir,true);
  balls.update(.3,0,[{id:2,char:ch}]);
  assert.equal(hits.length,1);assert.equal(hits[0].player,null,'wall blocks victim');
  assert.ok(Math.abs(hits[0].p.z-1.95)<.02);
  assert.equal(clearFirePath(ph,origin,new THREE.Vector3(0,1.2,4)),false);
  balls.launch('skin',1,new THREE.Vector3(0,1.2,2.5),dir,true);
  balls.update(.3,.3,[{id:2,char:ch}]);
  assert.equal(hits[1].player.id,2,'sweep cannot tunnel through body');
  balls.launch('expiry',1,new THREE.Vector3(5,3,0),dir,true);
  for(let i=0;i<150;i++)balls.update(1/60,i/60,[]);
  assert.equal(balls.balls.length,0,'out-of-range projectiles disappear');
  assert.equal(fireShot([0,0,0],[0,0,0],[0,0,0]),null);
  assert.equal(fireShot([100,0,0],[0,0,1],[0,0,0]),null);
  assert.deepEqual(fireShot([0,2,0],[0,0,4],[0,0,0]).d,[0,0,1]);
  balls.dispose();ch.dispose();ph.world.free();
});

test('surface flames reuse a bounded pool, burn on contact and go out after six seconds',()=>{
  const world={fires:new FireSet(),quality:'alta'},patches=new SurfaceFires(()=>world);
  const ch=new HumanCharacter({model:'galleta'});ch.update(0);
  patches.add(new THREE.Vector3(0,0,0),new THREE.Vector3(0,1,0),6,1);
  patches.update(.1);
  assert.equal(patches.touching(ch).length,1);assert.equal(patches.touching(ch,1).length,0,'caster immune to own patch');
  for(let i=1;i<100;i++)patches.add(new THREE.Vector3(i*2,0,0),new THREE.Vector3(0,1,0),6,1);
  assert.equal(world.fires.list.length,FIRE.maxPatches,'no permanent emitter per impact');
  patches.update(6.1);
  assert.ok(world.fires.list.every(f=>f.intensity===0));assert.ok(patches.slots.every(s=>s.life===0));
  patches.add(new THREE.Vector3(0,0,0),new THREE.Vector3(0,1,0),6,1);
  assert.equal(world.fires.list.length,FIRE.maxPatches);
  ch.dispose();
});

test('victim fire validation applies impact damage, credited DOT, immunity and wall blocking',async()=>{
  const ph=new Physics();await ph.init();ph.ground();
  G.phys=ph;G.scene=new THREE.Scene();G.time=0;G.myId=2;G.camera=new THREE.PerspectiveCamera();G.settings={desmadre:false};
  G.world={quality:'baja',flames:new Flames(G.scene)};G.sfx=null;G.input={};
  globalThis.document={getElementById:()=>null};
  const victim=new LocalPlayer({model:'galleta'});victim.teleport(new THREE.Vector3(0,0,4),0);
  const caster=new HumanCharacter({model:'diablo'});caster.update(0);
  G.players=new Map([[1,{id:1,owner:true,pos:new THREE.Vector3(),look:{model:'diablo'},char:caster,stateData:{s:0}}]]);
  const sent=[],powers=new OwnerPowers({getLocal:()=>victim,getNet:()=>({send:m=>sent.push(m)}),isOwner:()=>false,notify:()=>{}});
  const hit={id:1,mode:'ball',shot:'1',s:1,p:[0,1.2,3.8]};
  powers.onBurn(hit);assert.equal(victim.hp,72);
  powers.onBurn(hit);assert.equal(victim.hp,72,'one impact cannot damage twice');
  for(let i=0;i<30;i++){G.time+=1/60;powers.update(1/60);}
  assert.ok(victim.hp<70,'burn continues after initial impact');assert.equal(victim.lastHitBy,1);assert.equal(victim.lastHurtT,G.time);
  assert.ok(sent.some(m=>m.k==='onfire'));
  ph.box(0,1.5,2,.8,1.5,.05);ph.step(1/60);const hp=victim.hp;
  powers.onBurn({id:1,s:1,o:[0,1.2,0],d:[0,0,1]});assert.equal(victim.hp,hp,'breath cannot hurt through a wall');
  victim.immortal=true;powers.onBurn({...hit,shot:'2'});assert.equal(victim.hp,hp,'immortal blocks direct fire damage');
  // Immortality belongs only to the actual owner/Diablo. With that role it also blocks DOT.
  powers.isOwner=()=>true;victim.look.model='diablo';G.time+=.1;powers.update(.1);assert.equal(victim.hp,hp);
  powers.reset();powers.balls.dispose();victim.dispose();caster.dispose();ph.world.free();
});

test('changing models updates the local rig and remote hit volumes', async () => {
  const ph=new Physics();await ph.init();ph.ground();
  G.phys=ph;G.scene=new THREE.Scene();G.players=new Map();G.time=0;G.myId=1;
  G.settings={desmadre:false};G.camera=new THREE.PerspectiveCamera();G.input={};
  const p=new LocalPlayer({model:'eric'});
  const oldBodyCount=ph.world.bodies.len();
  const oldHp=p.hp; const oldPos=p.pos.clone();
  p.setLook({model:'diablo'});
  assert.equal(p.meta,p.char.meta);assert.equal(p.rag.meta,p.char.meta);
  assert.ok(p.rig.jointRest[0].distanceTo(p.char.meta.jointRest[0])<1e-8);
  assert.equal(p.hp,oldHp);assert.ok(p.pos.equals(oldPos));
  const movementHeight=2*(p.collider.halfHeight()+p.collider.radius());
  assert.ok(movementHeight>2.1 && movementHeight<2.3,'movement collider protects the larger demon head');
  assert.ok(Math.abs(p.rig.foreLen[0]-p.meta.gripLocal.l.length())<1e-8,'IK uses the actual forearm reach');
  assert.equal(ph.world.bodies.len(),oldBodyCount,'model replacement does not leak physics bodies');
  p.setLook({model:'galleta'});
  assert.equal(p.meta,p.char.meta);bounds(p.char);
  // A model switch while falling preserves dynamic physics and momentum.
  p.physMode='rag';p.rag.setKinematic(false);
  p.rag.bodies[0].setLinvel({x:1,y:-1,z:.5},true);
  p.setLook({model:'diablo'});
  assert.equal(p.rag.kinematic,false);assert.equal(p.rag.bodies[0].linvel().x,1);
  bounds(p.char);
  const remote=new RemotePlayer({id:2,look:{model:'eric'}});
  remote.buf.push({t:1,rb:p.rag.read().flat()});
  remote.setLook({model:'diablo'});
  assert.ok(Math.abs(remote.pawn.halfHeight()-p.collider.halfHeight())<.001,'remote movement volume matches local size');
  assert.equal(remote.proxy.meta,remote.char.meta);assert.equal(remote.buf.length,0);
  p.dispose();remote.dispose();ph.world.free();
});

test('real cookie and Diablo walk and jump without foot penetration or invalid skin',async()=>{
  for(const model of ['galleta','diablo']) {
    const ph=new Physics();await ph.init();ph.ground();
    G.phys=ph;G.scene=new THREE.Scene();G.players=new Map();G.time=0;G.myId=1;G.settings={desmadre:false};G.world=null;G.inGame=true;
    G.camera=new THREE.PerspectiveCamera();G.input={enabled:true,locked:true,key:k=>k==='KeyW',hit:()=>false,btn:()=>false};
    const p=new LocalPlayer({model});p.teleport(new THREE.Vector3(0,.02,0),0);
    let minStep=Infinity;
    const frame=()=>{ph.step(1/60,d=>p.physicsStep(d,0),()=>p.afterPhysics());G.time+=1/60;p.update(1/60);};
    for(let i=0;i<120;i++){const z=p.pos.z;frame();if(i>40)minStep=Math.min(minStep,p.pos.z-z);}
    assert.ok(minStep>.06,`${model}: smooth walking`);assert.ok(Math.abs(p.pos.y)<.008,`${model}: feet stay on floor`);
    p.queueJump();let peak=0;for(let i=0;i<90;i++){frame();peak=Math.max(peak,p.pos.y);}
    assert.ok(peak>.8&&p.grounded,`${model}: jumps and lands`);bounds(p.char);
    p.dispose();ph.world.free();
  }
});
