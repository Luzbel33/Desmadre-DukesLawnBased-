import * as THREE from 'three';
import { GR, groups } from '../core/physics.js';
import { DEMON_FIRE as F } from '../shared/demon-fire.js';

const ray=new THREE.Ray(), onRay=new THREE.Vector3(), onSegment=new THREE.Vector3();
const v=new THREE.Vector3();
const FIRE_GROUPS=groups(0xffff,GR.WORLD|GR.PROP|GR.VEHICLE);
export function surfaceHit(ph, origin, dir, distance) {
  return ph?.raycast(origin.x,origin.y,origin.z,dir.x,dir.y,dir.z,distance,FIRE_GROUPS);
}
export function clearFirePath(ph, a, b) {
  const dir=new THREE.Vector3().subVectors(b,a), distance=dir.length();
  if(distance<.05)return true;
  dir.divideScalar(distance);
  const hit=surfaceHit(ph,a,dir,distance);
  return !hit||hit.dist>=distance-.06;
}

export class FireBalls {
  constructor(scene,phys,breath,onImpact) {
    this.scene=scene;this.phys=phys;this.breath=breath;this.onImpact=onImpact;this.balls=[];
    this.geometry=new THREE.SphereGeometry(1,12,8);
    this.core=new THREE.MeshBasicMaterial({color:0xfff1a8,toneMapped:false});
    this.halo=new THREE.MeshBasicMaterial({color:0xff6c13,transparent:true,opacity:.45,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
  }
  launch(id, caster, origin, direction, authoritative=false) {
    if(this.balls.some(b=>b.id===id)||this.balls.length>=F.maxBalls)return false;
    const mesh=new THREE.Group();
    const core=new THREE.Mesh(this.geometry,this.core),halo=new THREE.Mesh(this.geometry,this.halo);
    core.scale.setScalar(.12);halo.scale.setScalar(.27);mesh.add(core,halo);mesh.position.copy(origin);this.scene.add(mesh);
    this.balls.push({id,caster,p:origin.clone(),d:direction.clone().normalize(),travel:0,mesh,authoritative});return true;
  }
  update(dt,time,players) {
    for(let i=this.balls.length-1;i>=0;i--) {
      const b=this.balls[i],distance=Math.min(F.ballSpeed*dt,F.ballRange-b.travel);
      let hit=surfaceHit(this.phys,b.p,b.d,distance),dist=hit?.dist??Infinity,player=null;
      ray.origin.copy(b.p);ray.direction.copy(b.d);
      for(const p of players) {
        if(p.id===b.caster||p.dead||p.stateData?.s===3)continue;
        for(const c of p.char.capsules()) {
          const r=c.r+F.ballRadius, sq=ray.distanceSqToSegment(c.a,c.b,onRay,onSegment);
          if(sq>r*r)continue;
          const entry=Math.max(0,onRay.distanceTo(b.p)-Math.sqrt(Math.max(0,r*r-sq)));
          if(entry<=distance&&entry<dist) {dist=entry;player=p;hit={dist:entry,nx:-b.d.x,ny:-b.d.y,nz:-b.d.z};}
        }
      }
      b.p.addScaledVector(b.d,Math.min(distance,dist));b.travel+=Math.min(distance,dist);
      b.mesh.position.copy(b.p);b.mesh.children[1].scale.setScalar(.25+.04*Math.sin(time*30));
      this.breath.burst(b.p,v.copy(b.d).negate(),time,Math.max(1,Math.ceil(distance*6)));
      if(hit&&dist<=distance) {
        this.breath.burst(b.p,v.copy(b.d).negate(),time,24);
        this.onImpact?.({...b,player,normal:new THREE.Vector3(hit.nx,hit.ny,hit.nz)});
        b.mesh.removeFromParent();this.balls.splice(i,1);
      } else if(b.travel>=F.ballRange) {b.mesh.removeFromParent();this.balls.splice(i,1);}
    }
  }
  dispose(){for(const b of this.balls)b.mesh.removeFromParent();this.balls.length=0;this.geometry.dispose();this.core.dispose();this.halo.dispose();}
}

// A bounded pool reuses the world's campfire/candle renderers. No permanent
// emitter is added for every frame or impact; expired patches release their slot.
export class SurfaceFires {
  constructor(getWorld) {this.getWorld=getWorld;this.slots=[];}
  add(point,normal,seconds=F.patchSeconds,by=0) {
    let slot=this.slots.find(s=>s.life>0&&s.by===by&&s.p.distanceToSquared(point)<.45);
    if(!slot)slot=this.slots.find(s=>s.life<=0);
    if(!slot&&this.slots.length<F.maxPatches) {
      const w=this.getWorld();if(!w)return null;
      slot={p:new THREE.Vector3(),n:new THREE.Vector3(),life:0,fire:-1,flames:[],world:w};
      if(w.quality!=='baja'&&w.fires&&w.fires.list.length<48)slot.fire=w.fires.add(0,-50,0,.28,.28,.72,{intensity:0,speed:1.3});
      else if(w.flames)for(let i=0;i<3;i++)slot.flames.push(w.flames.add(0,-50,0,.4,.6,{intensity:0}));
      this.slots.push(slot);
    }
    if(!slot&&this.slots.length)slot=this.slots.reduce((a,b)=>a.life<b.life?a:b);
    if(!slot)return null;
    slot.p.copy(point).addScaledVector(normal,.025);slot.n.copy(normal);slot.life=Math.min(F.patchSeconds,seconds);slot.by=by;
    const w=slot.world;
    if(slot.fire>=0)w.fires.move(slot.fire,slot.p.x,slot.p.y,slot.p.z);
    slot.flames.forEach((f,i)=>w.flames.move(f,slot.p.x+(i-1)*.12,slot.p.y,slot.p.z));
    return slot;
  }
  update(dt) {
    for(const s of this.slots) {
      s.life=Math.max(0,s.life-dt);const k=Math.min(1,s.life/.8);
      if(s.fire>=0)s.world.fires.set(s.fire,k);
      for(const f of s.flames)s.world.flames.set(f,k);
    }
  }
  touching(ch,exceptBy=0) {
    const out=[];
    for(const s of this.slots) {
      if(s.life<=0||s.by===exceptBy)continue;
      const center=s.p.clone().add(new THREE.Vector3(0,.25,0));
      for(const cap of ch.capsules()) {
        const closest=new THREE.Line3(cap.a,cap.b).closestPointToPoint(center,true,new THREE.Vector3());
        if(closest.distanceTo(center)<cap.r+F.patchRadius){out.push(s);break;}
      }
    }
    return out;
  }
}
