import * as THREE from 'three';

// Aiming chooses a surface; reach is always measured from the player's shoulder.
// First- and third-person cameras therefore share the same physical reach.
export function gripCandidate(body, cap, hand, shoulder, camera, direction, reach, visible) {
  if (!body || body.isValid?.() === false) return null;
  const t = body.translation(), q = body.rotation();
  if (![t.x, t.y, t.z, q.x, q.y, q.z, q.w].every(Number.isFinite)) return null;
  const position = new THREE.Vector3(t.x, t.y, t.z), rotation = new THREE.Quaternion(q.x, q.y, q.z, q.w).normalize();
  const a = cap?.a ? new THREE.Vector3().copy(cap.a) : new THREE.Vector3(0, -.1, 0);
  const b = cap?.b ? new THREE.Vector3().copy(cap.b) : new THREE.Vector3(0, .1, 0);
  a.applyQuaternion(rotation).add(position); b.applyQuaternion(rotation).add(position);
  const radius = Math.max(.025, Math.min(.4, cap?.r || .12));
  const ray = new THREE.Ray(camera, direction), onRay = new THREE.Vector3(), onAxis = new THREE.Vector3();
  ray.distanceSqToSegment(a, b, onRay, onAxis);
  const segment = new THREE.Line3(a, b), closeHand = segment.closestPointToPoint(hand, true, new THREE.Vector3());
  const handDistance = Math.max(0, closeHand.distanceTo(hand) - radius);
  const aimedDistance = Math.max(0, onRay.distanceTo(onAxis) - radius);
  const aimed = onRay.clone().sub(camera).dot(direction) >= 0 && aimedDistance < .24;
  if (handDistance > .4 && !aimed) return null;
  const axis = aimed ? onAxis : closeHand;
  const toward = (aimed ? onRay : hand).clone().sub(axis);
  if (toward.lengthSq() < 1e-8) toward.copy(hand).sub(axis);
  if (toward.lengthSq() < 1e-8) toward.copy(direction).negate();
  const point = axis.clone().addScaledVector(toward.normalize(), radius * .9);
  if (point.distanceTo(shoulder) > reach || !visible(shoulder, point)) return null;
  return { score: Math.min(handDistance, aimed ? aimedDistance + .08 : Infinity), point,
    anchor: point.clone().sub(position).applyQuaternion(rotation.clone().invert()) };
}
