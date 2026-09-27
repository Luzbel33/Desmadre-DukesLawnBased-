// Interaction controller. Standing locomotion remains kinematic; held bodies use
// bounded, mass-scaled displacement until a real hit or loss of balance knocks them down.
import * as THREE from 'three';
import { G } from '../core/G.js';
import { GR, groups, RAPIER } from '../core/physics.js';
import { LocalPlayer as PlayerCore, RemotePlayer as RemoteCore, PROXY_FILTER as BASE_PROXY_FILTER } from './player-core.js';
import { branchOf, GORE_HEAD_POP } from './gore.js';
export * from './player-core.js';
const BODY_Y = 0.80;
export const PROXY_FILTER = BASE_PROXY_FILTER | GR.ME;
const WALK_GROUPS = groups(GR.ME,GR.WORLD|GR.VEHICLE|GR.REMOTE);
const round=n=>Math.round(n*1000)/1000;
const vec=o=>new THREE.Vector3(o.x,o.y,o.z);
function anchorWorld(body,anchor){return vec(anchor).applyQuaternion(body.rotation()).add(body.translation());}

export class LocalPlayer extends PlayerCore {
  constructor(look,opts={}){
    super(look,opts);this.collider.setCollisionGroups(WALK_GROUPS);this.controller.setApplyImpulsesToDynamicBodies(false);
    this._gripVelocity=new THREE.Vector2();this._cutTrauma=new Map();
    // Adapt this instance's public query, not the Rapier world/prototype. The core
    // reads movement, grounding and fall speed from this SAME query result.
    const query=this.controller.computeColliderMovement.bind(this.controller);
    this.controller.computeColliderMovement=(collider,desired,flags,filter,predicate)=>{
      if(collider===this.collider&&this._movementDt>0){
        desired.x+=this._gripVelocity.x*this._movementDt;
        desired.z+=this._gripVelocity.y*this._movementDt;
        filter=WALK_GROUPS;
      }
      return query(collider,desired,flags,filter,predicate);
    };
  }
  _dropGrip(key){const joint=this.grabbedBy.get(key);if(!joint)return;if(joint.isValid())G.phys.world.removeImpulseJoint(joint,true);this.grabbedBy.delete(key);this.held=this.grabbedBy.size;if(!this.held&&this.state==='ko')this.koT=Math.max(this.koT,.5);}
  _clearIncomingGrips(){if(this.grabbedBy)for(const key of this.grabbedBy.keys())this._dropGrip(key);this._gripVelocity?.set(0,0);}
  _pruneGrips(){
    for(const [key,joint] of this.grabbedBy){const rp=G.players.get(Number(key.split(':')[0]));if(!rp?.proxy?.alive||!joint.isValid()){this._dropGrip(key);continue;}const a=joint.body1(),b=joint.body2();if(!a.isEnabled()||!b.isEnabled()||anchorWorld(a,joint.anchor1()).distanceTo(anchorWorld(b,joint.anchor2()))>3)this._dropGrip(key);}
    for(const side of ['l','r']){const h=this.hands[side];if(h.player&&(!G.players.get(h.player)?.proxy?.alive||!G.players.get(h.player).proxy.bodies[h.part]?.isEnabled()))this.release(side,false);}
    this.held=this.grabbedBy.size;
  }
  grabbedByRemote(id,side,part,anchor,on){
    if(!Number.isInteger(id)||id===G.myId||!['l','r'].includes(side))return false;
    const key=`${id}:${side}`;
    if(!on){this._dropGrip(key);return true;}
    if(this.grabbedBy.get(key)?.isValid())return true;
    if(!Number.isInteger(part)||part<0||part>=this.rag.bodies.length||!Array.isArray(anchor)||anchor.length!==3||!anchor.every(Number.isFinite)||Math.hypot(...anchor)>1.5||this.state==='driving')return false;
    const rp=G.players.get(id),fore=rp?.proxy?.bodies[side==='l'?4:6],grip=rp?.char?.meta?.gripLocal?.[side],mine=this.rag.bodies[part];
    if(!rp?.proxy?.alive||!fore?.isEnabled()||!grip||!mine?.isEnabled()||(this.gore&(1<<part)))return false;
    if(anchorWorld(fore,grip).distanceTo(anchorWorld(mine,{x:anchor[0],y:anchor[1],z:anchor[2]}))>1.4)return false;
    if(this.seat)this.standUp();
    // Being held is not being unconscious. Keep free hands, actions and equipment.
    // On a later KO the same spring naturally starts pulling the dynamic body.
    if(this.dead||this.state==='ko'){this.strength=0;this._toRag();}
    const data=RAPIER.JointData.spring(.02,1800,120,{x:grip.x,y:grip.y,z:grip.z},{x:anchor[0],y:anchor[1],z:anchor[2]});
    const joint=G.phys.world.createImpulseJoint(data,fore,mine,true);joint.setContactsEnabled(false);
    this.grabbedBy.set(key,joint);this.held=this.grabbedBy.size;return true;
  }
  releaseAll(keepItems=false){for(const side of ['l','r']){const h=this.hands[side];if(h.joint)this.release(side,false);else if(!keepItems)h.item=null;}this.held=this.grabbedBy.size;}
  teleport(pos,yaw=this.yaw){this._clearIncomingGrips();super.teleport(pos,yaw);}
  respawn(){this._clearIncomingGrips();this._cutTrauma?.clear();super.respawn();}
  _standingPull(dt){
    this._gripVelocity??=new THREE.Vector2();
    const velocity=this._gripVelocity;let fx=0,fz=0,tension=0;
    for(const joint of this.grabbedBy.values()){
      if(!joint.isValid())continue;
      const a=joint.body1(),b=joint.body2(),error=anchorWorld(a,joint.anchor1()).sub(anchorWorld(b,joint.anchor2()));
      if(error.length()<.08)continue;
      const hand=a.linvel();
      const force=new THREE.Vector3(error.x*900+(hand.x-velocity.x)*70,0,error.z*900+(hand.z-velocity.y)*70).clampLength(0,900);
      fx+=force.x;fz+=force.z;tension+=Math.hypot(force.x,force.z);
    }
    const mass=this.meta.mass.reduce((sum,n)=>sum+n,0);
    velocity.x+=fx/mass*dt;velocity.y+=fz/mass*dt;
    velocity.multiplyScalar(Math.exp(-(this.held?3.5:8)*dt));
    if(velocity.length()>3.2)velocity.setLength(3.2);
    // Sustained force can upset balance; a stationary hold cannot knock someone out.
    if(tension>1000&&this.grounded&&this.state==='active'){
      this.balance=Math.max(0,this.balance-(tension-1000)*.045*dt);
      if(this.balance<=0){this.balance=45;this.knockout(1.8);}
    }
    return velocity;
  }
  physicsStep(dt,viewYaw){
    if(!G.inGame)return;
    this._pruneGrips();
    if(this.physMode==='anim'&&['active','stun','getup'].includes(this.state))this._standingPull(dt);
    if(this.physMode==='rag')this.strength=0;
    this.collider.setEnabled(this.physMode!=='rag');
    this._movementDt=dt;
    try { super.physicsStep(dt,viewYaw); }
    finally { this._movementDt=0; }
    if(this.physMode==='rag'){
      const pt=this.rag.pelvis().translation();
      this.body.setNextKinematicTranslation({x:pt.x,y:pt.y-this.meta.jointRest[0].y+BODY_Y,z:pt.z});
    }
  }
  _poseRig(base,dt=0){
    super._poseRig(base,dt);
    if(this.physMode!=='anim'||!this.grabbedBy)return;
    // A held arm follows the actual grip; the other arm can still attack or block.
    for(const joint of this.grabbedBy.values()){
      if(!joint.isValid())continue;
      const part=this.rag.bodies.indexOf(joint.body2());
      if([3,4,5,6].includes(part))this.rig.reach(part<5?'l':'r',anchorWorld(joint.body1(),joint.anchor1()));
    }
  }
  afterPhysics(){super.afterPhysics();if(this.physMode==='rag'){const pt=this.rag.pelvis().translation();this.pos.set(pt.x,pt.y-this.meta.jointRest[0].y,pt.z);}}
  _startGetup(){
    if(this.held||this.dead)return;
    const pelvis=this.rag.pelvis(),pt=pelvis.translation(),v=pelvis.linvel();
    const support=G.phys.raycast(pt.x,pt.y+.12,pt.z,0,-1,0,1.15,groups(GR.ME,GR.WORLD|GR.VEHICLE));
    if(!support||support.ny<.55||Math.abs(v.y)>1.3||Math.hypot(v.x,v.z)>2.8){this.koT=Math.max(this.koT,.2);return;}
    super._startGetup();this.pos.y=support.y+.02;this.previousPos.copy(this.pos);
    const center={x:this.pos.x,y:this.pos.y+BODY_Y,z:this.pos.z};this.body.setTranslation(center,true);this.body.setNextKinematicTranslation(center);this.collider.setEnabled(true);
  }
  hitClaim(message){if(!this.rag.bodies[message.p|0]?.isEnabled())return;super.hitClaim(message);}
  _impact(part,severity,hit,point,normal){
    if(!this.rag.bodies[part]?.isEnabled())return;
    const before=this.hp,wasDead=this.dead;
    super._impact(part,severity,hit,point,normal);
    if(wasDead)return;
    if(before>this.hp){
      // The existing local head cue is already emitted by main.js. Other impacts
      // need their own cue; remote players hear the corresponding health change.
      if(part!==2&&G.time-(this._lastPain??-10)>.65){G.sfx?.trigger('pain',null,.75);this._lastPain=G.time;}
      if(hit.kind==='cut'&&part>=3&&!this.dead&&!(this.gore&(1<<part))){
        this._cutTrauma??=new Map();const last=this._cutTrauma.get(part);
        const value=(last&&G.time-last.time<12?last.value:0)+Math.min(2,Math.max(0,severity));
        this._cutTrauma.set(part,{value,time:G.time});
        if(value>=([4,6,8,10].includes(part)?2.8:4))this._gore(1<<part,new THREE.Vector3(normal.x,Math.max(.15,normal.y),normal.z).normalize().multiplyScalar(2.2),hit.by||0);
      }
    }
    if(this.physMode==='rag'&&this.rag.bodies[part]?.isEnabled()){
      const n=new THREE.Vector3(normal.x,normal.y,normal.z);if(n.lengthSq()>.001){n.normalize().multiplyScalar(Math.min(26,Math.max(0,severity)*12));this.rag.impulse(part,n);}
    }
  }
  update(dt){this._pruneGrips();super.update(dt);if(this.physMode==='rag')this.strength=0;}
  netState(){const state=super.netState();if(this.physMode==='rag'){const pose=this.rag.read();state.rb=pose.flat().map(round);state.p=[round(pose[0][0]),round(pose[0][1]-this.meta.jointRest[0].y),round(pose[0][2])];}return state;}
  dispose(){this._clearIncomingGrips();super.dispose();}
}
export class RemotePlayer extends RemoteCore {
  constructor(data){super(data);this.proxy.setGroups(GR.REMOTE,PROXY_FILTER);}
  applyState(st,immediate=false,ts=0){
    const prev=this.stateData,oldHP=this.hp;
    super.applyState(st,immediate,ts);if(!st)return;
    if(!immediate&&Number.isFinite(oldHP)&&oldHP-(st.hp??oldHP)>=3&&G.time-(this._lastPain??-10)>.65){G.sfx?.trigger('pain',this.target,.85);this._lastPain=G.time;}
    // Apply collision state even when a new proxy is built AFTER its visual mask.
    if(this.proxy?.alive){const disabled=new Set();for(let i=0;i<11;i++)if(st.sv&(1<<i))for(const k of branchOf(i))disabled.add(k);if(st.sv&GORE_HEAD_POP)disabled.add(2);for(let i=0;i<11;i++)if(this.proxy.disabledParts?.has(i)!==disabled.has(i))this.proxy.setPartCollide(i,!disabled.has(i));}
    if(prev&&prev.s===3&&st.s!==3)this.char.clearDamage?.();
  }
  dispose(){if(G.me?.grabbedBy)for(const key of G.me.grabbedBy.keys())if(key.startsWith(`${this.id}:`))G.me._dropGrip?.(key);super.dispose();}
}
