// Restricciones físicas y discontinuidades de pose; conserva el animador existente.
import { RAPIER } from '../core/physics.js';
import { Ragdoll as RagdollCore } from './ragdoll-core.js';
export * from './ragdoll-core.js';

// Rangos de juego (radianes) respecto de la pose de reposo, no de la pose al caer.
// X: flexión; Y: giro; Z: apertura lateral. Hombros y caderas se espejan.
export const JOINT_LIMITS = Object.freeze({
  1: [[-.65,.8],[-.85,.85],[-.55,.55]],
  2: [[-.7,.75],[-1.25,1.25],[-.55,.55]],
  3: [[-2.5,1.4],[-1.5,1.5],[-.55,2.8]],
  5: [[-2.5,1.4],[-1.5,1.5],[-2.8,.55]],
  7: [[-1.65,.65],[-.6,.6],[-.3,1]],
  9: [[-1.65,.65],[-.6,.6],[-1,.3]],
});

export class Ragdoll extends RagdollCore {
  build(transforms, velocity = null) {
    super.build(transforms, velocity);
    const raw = this.phys.world.impulseJoints.raw;
    const axes = [RAPIER.JointAxis.AngX, RAPIER.JointAxis.AngY, RAPIER.JointAxis.AngZ];
    for (let part=1; part<this.bodies.length; part++) {
      const joint=this.joints[part-1], rest=this.meta.jointRest[part];
      // La articulación conserva el marco anatómico aunque el cuerpo nazca animado.
      joint.setLocalFrame1({x:rest.x,y:rest.y,z:rest.z},{x:0,y:0,z:0,w:1});
      joint.setLocalFrame2({x:0,y:0,z:0},{x:0,y:0,z:0,w:1});
      const limits=JOINT_LIMITS[part];
      if (!limits) continue; // Codos y rodillas ya son bisagras limitadas.
      // Rapier 0.21 expone límites multieje en raw; mantener este adaptador aislado.
      for(let i=0;i<axes.length;i++) raw.jointSetLimits(joint.handle,axes[i],limits[i][0],limits[i][1]);
    }
  }

  teleport(transforms) {
    super.teleport(transforms);
    // Respawn/corrección de red no son un movimiento: no heredar un envión inexistente.
    this.klast=transforms.map(()=>null);
    this.kvel?.forEach(v=>v.set(0,0,0));
    if(this.kinematic) for(let i=0;i<transforms.length;i++) {
      const t=transforms[i], body=this.bodies[i];
      body.setNextKinematicTranslation({x:t[0],y:t[1],z:t[2]});
      body.setNextKinematicRotation({x:t[3],y:t[4],z:t[5],w:t[6]});
    }
  }
}
