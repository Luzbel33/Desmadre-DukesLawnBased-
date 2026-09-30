// Barrido de la plataforma real: sigue curvas y marcha atrás sin rectángulos largos
// orientados sólo con el giro final. Nunca une un respawn con el recorrido anterior.
export function mowerSweep(previous, next, halfWidth) {
  const distance = previous ? Math.hypot(next.x - previous.x, next.z - previous.z) : 0;
  const valid = previous && previous.id === next.id && distance < 5;
  const turn = valid ? Math.atan2(Math.sin(next.yaw - previous.yaw), Math.cos(next.yaw - previous.yaw)) : 0;
  const steps = valid ? Math.max(1, Math.ceil(distance / 0.2), Math.ceil(Math.abs(turn) / 0.12)) : 1;
  const stamps = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    stamps.push([
      valid ? previous.x + (next.x - previous.x) * t : next.x,
      valid ? previous.z + (next.z - previous.z) * t : next.z,
      valid ? previous.yaw + turn * t : next.yaw, halfWidth, 0.55,
    ].map(v => Math.round(v * 10000) / 10000));
  }
  return stamps;
}
