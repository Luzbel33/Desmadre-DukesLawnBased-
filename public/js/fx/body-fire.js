// A bounded, independent flame pool: world candles cannot consume body-fire slots.
// It follows bone positions without modifying character materials, meshes or rigs.
import * as THREE from 'three';
import { Flames } from './flame.js';
import { clearFirePath } from './demon-fire.js';
const a = new THREE.Vector3(), mid = new THREE.Vector3(), origin = new THREE.Vector3();
const PARTS = ['hip', 'upperarm_l', 'upperarm_r', 'lowerleg_l', 'lowerleg_r'];
export function touchingWorldFire(char, fires, physics) {
  if (!char?.capsules || !fires) return false;
  for (const cap of char.capsules()) {
    mid.copy(cap.a).lerp(cap.b,.5);
    for (const p of [cap.a,mid,cap.b]) for (const f of fires.touching(p,cap.r)) {
      origin.set(f.x,f.y+f.h*f.k*.7,f.z);
      if (!physics || clearFirePath(physics,origin,p)) return true;
    }
  }
  return false;
}
export class BodyFireView {
  constructor(scene, maxBodies = 24) {
    this.limit = maxBodies; this.flames = new Flames(scene, maxBodies * PARTS.length);
    for(let i=0;i<this.flames.max;i++)this.flames.add(0,-100,0,.22,.55,{intensity:0});
    this.active = 0;
  }
  update(time, actors, camera, fog = 0) {
    this.clear();
    const visible = actors.filter(v => v.seconds > 0 && v.char?.root?.visible !== false && v.char?.bones?.hip && !v.hidden);
    if(camera) visible.sort((x,y)=>camera.position.distanceToSquared(x.char.root.position)-camera.position.distanceToSquared(y.char.root.position));
    let index=0;
    for(const actor of visible.slice(0,this.limit)) {
      const ch=actor.char; ch.root.updateWorldMatrix(true,true);
      for(const name of PARTS) {
        const bone=ch.bones[name] || ch.bones.hip;
        bone.getWorldPosition(a);
        // In first person keep the flame off the face/camera; limbs remain visible.
        if(ch.headVisible===false && name==='hip') {index++;continue;}
        const low=name.startsWith('lowerleg'), width=low?.18:.28;
        this.flames.move(index,a.x,a.y-(low?.05:.16),a.z);
        this.flames.scale(index,width,low?.45:.65);
        this.flames.set(index,Math.min(1,actor.seconds/.5));index++;
      }
    }
    this.active=index;this.flames.update(time,fog);
  }
  clear() {for(let i=0;i<this.active;i++)this.flames.set(i,0);this.active=0;}
  dispose(){this.flames.mesh.removeFromParent();this.flames.mesh.geometry.dispose();this.flames.mesh.material.dispose();}
}
