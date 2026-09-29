// Shared gameplay bounds. Visual particles do not determine hits or lifetime.
export const DEMON_FIRE = Object.freeze({
  breathReach:8.5, ballSpeed:18, ballRange:32, ballCooldown:.85,
  ballRadius:.18, blastRadius:1.35, burnSeconds:3.2, burnDps:4.5,
  patchSeconds:6, patchRadius:.48, maxPatches:12, maxBalls:8,
});
export function fireVector(v) {
  return Array.isArray(v)&&v.length===3&&v.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<10000) ? v.slice() : null;
}
export function fireShot(origin, direction, caster) {
  const o=fireVector(origin), d=fireVector(direction), c=fireVector(caster);
  if(!o||!d||!c||Math.hypot(...o.map((n,i)=>n-c[i]))>3.5)return null;
  const length=Math.hypot(...d);
  if(length<.001)return null;
  return {o,d:d.map(n=>n/length)};
}
