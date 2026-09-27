// Joint limits, safe state transitions, and physically detached branches.
import { RAPIER } from '../core/physics.js';
import { Ragdoll as RagdollCore } from './ragdoll-core.js';
export * from './ragdoll-core.js';
export const JOINT_LIMITS = Object.freeze({
  1:[[-.65,.8],[-.85,.85],[-.55,.55]],2:[[-.7,.75],[-1.25,1.25],[-.55,.55]],
  3:[[-2.5,1.4],[-1.5,1.5],[-.55,2.8]],5:[[-2.5,1.4],[-1.5,1.5],[-2.8,.55]],
  7:[[-1.65,.65],[-.6,.6],[-.3,1]],9:[[-1.65,.65],[-.6,.6],[-1,.3]],
});
const PARENT=[-1,0,1,1,3,1,5,0,7,0,9];
const HINGE={4:[-2.55,.08],6:[-2.55,.08],8:[-.08,2.5],10:[-.08,2.5]};
const IDENTITY={x:0,y:0,z:0,w:1};
export class Ragdoll extends RagdollCore {
  build(transforms,velocity=null){
    this.disabledParts=new Set();
    super.build(transforms,velocity);
    for(let part=1;part<this.bodies.length;part++)this._configureJoint(part,this.joints[part-1]);
  }
  _configureJoint(part,joint){
    const rest=this.meta.jointRest[part];
    joint.setLocalFrame1({x:rest.x,y:rest.y,z:rest.z},IDENTITY);
    joint.setLocalFrame2({x:0,y:0,z:0},IDENTITY);
    joint.setContactsEnabled(false);
    const limits=JOINT_LIMITS[part];
    if(limits){const raw=this.phys.world.impulseJoints.raw;const axes=[RAPIER.JointAxis.AngX,RAPIER.JointAxis.AngY,RAPIER.JointAxis.AngZ];for(let i=0;i<3;i++)raw.jointSetLimits(joint.handle,axes[i],limits[i][0],limits[i][1]);}
    else if(HINGE[part]&&joint.setLimits)joint.setLimits(...HINGE[part]);
  }
  _restoreJoint(part){
    if(part<=0||this.joints[part-1]?.isValid()||!this.bodies[part]?.isEnabled()||!this.bodies[PARENT[part]]?.isEnabled())return;
    const p=this.meta.jointRest[part],a={x:p.x,y:p.y,z:p.z},zero={x:0,y:0,z:0};
    const data=HINGE[part]?RAPIER.JointData.revolute(a,zero,{x:1,y:0,z:0}):RAPIER.JointData.spherical(a,zero);
    const joint=this.phys.world.createImpulseJoint(data,this.bodies[PARENT[part]],this.bodies[part],true);
    this.joints[part-1]=joint;this._configureJoint(part,joint);
  }
  setPartCollide(part,on){
    const body=this.bodies[part],collider=this.colliders[part];if(!body||!collider)return;
    this.disabledParts??=new Set();
    if(!on){
      // Disabling only a collider removes its mass. If its joint remains, it becomes
      // an infinite-mass anchor. Remove incident joints BEFORE disabling the body.
      this.disabledParts.add(part);
      for(let child=1;child<this.bodies.length;child++)if(child===part||PARENT[child]===part){const joint=this.joints[child-1];if(joint?.isValid())this.phys.world.removeImpulseJoint(joint,true);this.joints[child-1]=null;}
      body.setEnabled(false);
    }else{
      this.disabledParts.delete(part);collider.setEnabled(true);body.setEnabled(true);
      this._restoreJoint(part);
      for(let child=1;child<this.bodies.length;child++)if(PARENT[child]===part)this._restoreJoint(child);
    }
  }
  setKinematic(kinematic,extra=null){
    // Cached finite-difference velocities are not trustworthy across teleports or a
    // render stall. Limit transition energy, not the velocities of ordinary play.
    if(!kinematic&&this.kinematic&&this.kvel)for(const v of this.kvel){if(!Number.isFinite(v.x+v.y+v.z))v.set(0,0,0);else v.clampLength(0,14);}
    super.setKinematic(kinematic,extra);
    if(!kinematic&&this.alive){this.cur=this.read();this.prev=this.cur.map(t=>t.slice());}
  }
  teleport(transforms){
    super.teleport(transforms);this.klast=transforms.map(()=>null);this.kvel?.forEach(v=>v.set(0,0,0));
    if(this.kinematic)for(let i=0;i<transforms.length;i++){const t=transforms[i],body=this.bodies[i];body.setNextKinematicTranslation({x:t[0],y:t[1],z:t[2]});body.setNextKinematicRotation({x:t[3],y:t[4],z:t[5],w:t[6]});}
  }
}
