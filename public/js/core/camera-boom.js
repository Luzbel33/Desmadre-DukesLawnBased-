import * as THREE from 'three';
import { RAPIER, GR, groups } from './physics.js';

const ROTATION = { x: 0, y: 0, z: 0, w: 1 };
const FILTER = groups(0xffff, GR.WORLD);

// A sphere protects the entire near plane, including at doorway edges. Resolve
// again after smoothing: interpolating two safe poses can still cross a wall.
export class CameraBoom {
  constructor() {
    this.shape = new RAPIER.Ball(0.18);
    this.direction = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.position = new THREE.Vector3();
    this.previousPivot = new THREE.Vector3();
    this.mode = null;
  }

  reset() { this.mode = null; }

  focusAtEyes(camera, pivot, eyes, physics) {
    const distance = this.position.distanceTo(pivot);
    const t = Math.max(0, Math.min(1, (1.15 - distance) / 0.45));
    const blend = t * t * (3 - 2 * t);
    if (blend > 0) {
      camera.position.lerp(eyes, blend);
      this.constrain(pivot, camera.position, physics);
    }
    return blend;
  }

  constrain(pivot, position, physics) {
    const direction = this.direction.subVectors(position, pivot);
    const distance = direction.length();
    if (distance < 1e-5) return position;
    direction.multiplyScalar(1 / distance);
    const hit = physics.world.castShape(pivot, ROTATION, direction, this.shape, 0.01, distance, true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, FILTER);
    if (hit) position.copy(pivot).addScaledVector(direction, Math.max(0, hit.time_of_impact - 0.015));
    return position;
  }

  update(camera, pivot, desired, physics, dt, mode, shakeX = 0, shakeY = 0) {
    // Wider FOVs and ultrawide displays need more near-plane clearance.
    const halfHeight = camera.near * Math.tan(camera.fov * Math.PI / 360);
    this.shape.radius = Math.max(0.18, Math.hypot(halfHeight, halfHeight * camera.aspect) + 0.025);
    this.constrain(pivot, this.target.copy(desired), physics);
    const reset = this.mode !== mode || this.previousPivot.distanceToSquared(pivot) > 25;
    if (reset) this.position.copy(this.target);
    else {
      this.position.lerp(this.target, 1 - Math.exp(-16 * Math.max(0, dt)));
      this.constrain(pivot, this.position, physics);
    }
    // Keep the boom history separate from the temporary eye view. Otherwise the
    // close-body adjustment feeds back into smoothing and can pin the camera in.
    camera.position.copy(this.position);
    camera.position.x += shakeX;
    camera.position.y += shakeY;
    if (shakeX || shakeY) this.constrain(pivot, camera.position, physics);
    this.mode = mode;
    this.previousPivot.copy(pivot);
  }
}
