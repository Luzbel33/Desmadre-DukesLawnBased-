// Descarte de modelos sueltos (faroles, bancos, autos, sillas, cuadros...): cada llamada de dibujo cuesta CPU
// aunque el objeto sea chico o no se vea. Se ocultan:
// - por distancia (según su tamaño: una lata desaparece antes que un auto),
// - y por zona: con la cámara adentro de las murallas del castillo no se dibuja el pueblo (solo lo que se ve por
//   el portón), y adentro del torreón tampoco el patio lejano.
// Solo toca modelos que carga assetModel (userData.asset) colgados directo de la escena; si otro sistema los
// escondió (visible = false sin que lo hayamos hecho nosotros) no se meten.
import * as THREE from 'three';
import { CASTLE } from '../shared/mapdata.js';

const BOX = new THREE.Box3();
const S = new THREE.Sphere();

export class Culler {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.seen = new WeakSet();
    this.tick = 0;
    this.last = new THREE.Vector3(1e9, 0, 0);
  }
  // busca modelos nuevos (los lentos llegan después: se llama cada tanto)
  scan() {
    for (const o of this.scene.children) {
      if (this.seen.has(o)) continue;
      if (!o.userData.asset || o.userData.noCull) continue;
      this.seen.add(o);
      o.updateMatrixWorld(true);
      BOX.setFromObject(o);
      if (BOX.isEmpty()) continue;
      BOX.getBoundingSphere(S);
      if (S.radius > 9) continue; // lo grande (edificios, estatuas enormes) queda siempre
      this.items.push({ o, c: S.center.clone(), r: S.radius, hidden: false, far: o.userData.cullDist ?? Math.min(220, Math.max(45, 40 + S.radius * 30)), p0: o.position.clone(), dyn: false });
    }
  }
  update(cam, force = false) {
    if (!cam) return;
    this.tick++;
    if (this.tick % 90 === 1) this.scan();
    const p = cam.position;
    if (!force && this.tick % 4 !== 0 && p.distanceToSquared(this.last) < 1) return;
    this.last.copy(p);
    const inCastle = p.x > CASTLE.x0 && p.x < CASTLE.x1 && p.z > CASTLE.z0 && p.z < CASTLE.z1 && p.y < 14;
    const inKeep = p.x > CASTLE.keep.x0 && p.x < CASTLE.keep.x1 && p.z > CASTLE.keep.z0 && p.z < CASTLE.keep.z1 && p.y < CASTLE.keep.top;
    for (const it of this.items) {
      const o = it.o;
      if (!o.parent || it.dyn) continue;
      // si se movió (autos, cosas que se caen o se patean), no es un adorno quieto: se deja siempre a la vista
      if (o.position.distanceToSquared(it.p0) > 1e-6) { it.dyn = true; if (it.hidden) { o.visible = true; it.hidden = false; } continue; }
      if (!it.hidden && !o.visible) continue; // lo escondió otro sistema
      const c = it.c;
      const d = Math.hypot(c.x - p.x, c.y - p.y, c.z - p.z) - it.r;
      let show = d < it.far;
      if (show && inCastle) {
        const outside = c.x < CASTLE.x0 - 3 || c.x > CASTLE.x1 + 3 || c.z < CASTLE.z0 - 3 || c.z > CASTLE.z1 + 3;
        // por el portón se ve la explanada: una franja hacia el sur
        const gate = c.x > -14 && c.x < 14 && c.z > CASTLE.z1 - 2 && c.z < CASTLE.z1 + 45;
        if (outside && !gate) show = false;
      }
      if (show && inKeep) {
        const inKeepBox = c.x > CASTLE.keep.x0 - 1 && c.x < CASTLE.keep.x1 + 1 && c.z > CASTLE.keep.z0 - 1 && c.z < CASTLE.keep.z1 + 1;
        // desde adentro del torreón: lo de afuera solo por la puerta (el frente del patio)
        const front = c.x > -10 && c.x < 10 && c.z > CASTLE.keep.z1 && c.z < CASTLE.z1 + 30;
        if (!inKeepBox && !front) show = false;
      }
      if (show === !it.hidden) continue;
      o.visible = show;
      it.hidden = !show;
    }
  }
}
