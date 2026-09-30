// Pisos del castillo con mezcla de capas (ground-blend.js): la explanada del frente deja de ser una sola textura.
// Tierra pedregosa de base; barro donde se pisa (los bordes del camino de lajas, al pie de la muralla y alrededor del
// aljibe) y en manchones; pasto hacia los bordes, donde empieza el césped de verdad. Charcos en el barro, cerca de la
// tormenta.
import { getMat } from './builder.js';
import { blendGround } from './ground-blend.js';

const PLAZA_MASK = /* glsl */ `
  float inPath = step(-74.6, gp.y) * step(gp.y, -58.0);
  float dP = abs(abs(gp.x) - 2.6);
  wB = max(wB, smoothstep(1.7, 0.1, dP) * inPath * (0.5 + 0.5 * gbF(gp * 0.9)));
  wB = max(wB, smoothstep(-68.5, -74.4, gp.y) * (0.45 + 0.55 * gbF(gp * 0.5 + 9.0)));
  wB = max(wB, smoothstep(0.58, 0.8, gbF(gp * 0.07 + 1.7)));
  wB = max(wB, smoothstep(3.6, 1.2, length(gp - vec2(-21.0, -66.5))));
  float dEdge = min(40.0 - abs(gp.x), -52.0 - gp.y);
  wC = max(smoothstep(7.5, 0.3, dEdge), smoothstep(0.62, 0.82, gbF(gp * 0.11 + 5.3)) * 0.85);
  wC *= smoothstep(0.8, 2.6, abs(gp.x) - 2.6 + (1.0 - inPath) * 10.0);
  wC *= 1.0 - smoothstep(-66.0, -73.0, gp.y) * 0.8;
`;

export function groundCastle() {
  blendGround(getMat('plaza'), {
    aSize: 2.6,
    b: { id: 'mud_forest', size: 3.2, tint: 0xb0a898 },
    c: { id: 'forrest_ground_01', size: 3.0, tint: 0x9aa088 },
    mask: PLAZA_MASK,
    wet: 0.65,
  });
}
