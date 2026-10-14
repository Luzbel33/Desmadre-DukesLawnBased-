// Cosas apoyadas en el piso que se veían pero se atravesaban caminando (calabazas, sillas de la mesa del bar, escaleras
// de mano, estantes, la horca y la jaula del cementerio, barriles tirados, candelabros de pie, esqueletos sentados...).
// Una vez armado todo (y ya adentro de la sala) se recorre lo que se dibuja: si un objeto de esos tipos está parado en
// un piso y no tiene nada físico adentro, se le pone una caja estática a su medida (un poco más chica, para no trabarse
// con el borde) que llega hasta la altura de la cadera como mucho si es bajito. Lo que se mueve en los sustos (la
// mecedora, la silla de ruedas, los portones) no: tiene su propia física o anda solo.
import * as THREE from 'three';
import { G } from '../core/G.js';

// nombres de modelos (o de sus instancias) que son cosas sólidas de verdad
const SOLID = /pumpkin|c_jack|barrel|ladder|instances-c_chair|painted_wooden_chair|bookshelf|gallows|gibbet|candleholder|Circle022|skeleton_sit|c_skel_sit|c_crate|c_chest|c_haybale|c_winebarrel|c_stool|c_cabinet|c_drawer|c_commode|cannon|c_bucket|c_cart|scarecrow|c_stump|c_firepit|c_brazier|c_cauldron|c_statue|c_bust/i;
const MOVING = /rocking|wheelchair|gate|door/i;
const NOT_PAWN = (c) => { const k = G.phys.info(c)?.kind; return k !== 'me' && k !== 'npc' && k !== 'player' && k !== 'remote' && k !== 'bag'; };

function nameOf(o) {
  let n = o.name || '';
  for (let p = o.parent, k = 0; p && k < 3; p = p.parent, k++) n += ' ' + (p.name || '');
  return n;
}

export function autoColliders(world) {
  let frames = 0, done = false;
  const prev = world.update?.bind(world);
  world.update = (...a) => {
    prev?.(...a);
    if (done || !G.inGame || !G.phys?.world || ++frames < 150) return;
    done = true;
    try { run(world); } catch (e) { console.warn('colisiones automáticas', e); }
  };
}

function run(world) {
  const box = new THREE.Box3(), m4 = new THREE.Matrix4(), sz = new THREE.Vector3(), ct = new THREE.Vector3();
  const made = [];
  const consider = (name, b) => {
    b.getSize(sz); b.getCenter(ct);
    if (sz.y < 0.25 || sz.y > 4.5 || sz.x > 4 || sz.z > 4 || Math.max(sz.x, sz.z) < 0.18) return;
    // ¿está parado en un piso?
    const g = G.phys.raycast(ct.x, b.min.y + 0.3, ct.z, 0, -1, 0, 0.8, undefined, null, (c) => G.phys.info(c)?.kind === 'world');
    if (!g || Math.abs(g.y - b.min.y) > 0.2) return;
    // ¿ya tiene algo físico adentro?
    const hx = Math.max(0.04, sz.x * 0.3), hz = Math.max(0.04, sz.z * 0.3), hy = Math.min(0.45, sz.y * 0.3);
    if (G.phys.overlapBox(ct.x, b.min.y + Math.min(0.9, sz.y * 0.5), ct.z, hx, hy, hz, 0, undefined, NOT_PAWN)) return;
    // la caja: 80% del ancho (las formas redondas no llenan su caja), todo el alto
    const ex = Math.max(0.08, sz.x * 0.4), ez = Math.max(0.08, sz.z * 0.4);
    G.phys.box(ct.x, b.min.y + sz.y / 2, ct.z, ex, sz.y / 2, ez, 0, { paint: false, mat: 'wood' });
    made.push(name);
  };
  world.scene.traverse((o) => {
    if (!o.visible || o.isSkinnedMesh || o.isPoints || o.isSprite || o.isLine || !o.isMesh) return;
    const name = nameOf(o);
    if (!SOLID.test(name) || MOVING.test(name)) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    if (o.isInstancedMesh) {
      for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m4); m4.premultiply(o.matrixWorld); box.copy(o.geometry.boundingBox).applyMatrix4(m4); consider(name, box); }
    } else {
      box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      consider(name, box);
    }
  });
  if (made.length) console.info('colisiones automáticas:', made.length);
}
