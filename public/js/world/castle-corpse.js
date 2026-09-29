// El cadáver de la mesa de carnicero (cocina): un cuerpo tapado con una sábana manchada de sangre. La sábana se
// simuló en Blender (tela real cayendo sobre un cuerpo acostado y sobre el mismo cuerpo sentado) y el modelo trae las
// dos formas: acostado y "sit" (sentado, con la cabeza caída y la tela colgando por la espalda). Al "levantar la
// sábana" haunt.js gira `hinge.rotation.z` (0 -> 1,15) y acá eso se convierte en la mezcla entre las dos formas.
// Del brazo que cuelga por el borde de la mesa (antebrazo y mano del modelo de Eric, pálidos y con sangre) gotea sangre
// al charco del piso.
import * as THREE from 'three';
import { assetModel, hasAsset } from '../game/assets.js';
import { CASTLE } from '../shared/mapdata.js';
import { G } from '../core/G.js';

const F0 = CASTLE.keep.floor;
const TABLE_Y = F0 + 0.91; // tapa de la mesa (woodDark, centro F0 + 0.85, alto 0.12)
const TX = -16, TZ = -121; // centro de la mesa
const HANG = 0.592; // lo que cuelga la sábana (acostada) por debajo de la tapa; medido en el modelo de Blender
const DRIP = { x: TX - 0.416, y: TABLE_Y - 0.434, z: TZ + 0.583 }; // punta de los dedos de la mano que cuelga (medido en el modelo)
const FLOOR = F0 + 0.03; // encima del charco pintado en el piso
const V = new THREE.Vector3();

export class Corpse {
  constructor(decor, hinge) {
    this.decor = decor;
    this.hinge = hinge; // Object3D cuya rotation.z anima haunt.js (0 = acostado, ~1.15 = sentado)
    this.root = null;
    this.mesh = null;
    this.k = -1;
    this.drop = null;
    this.wait = 1.2;
    this.ring = null;
  }

  _build() {
    const model = assetModel('c_corpse');
    if (!model) return false;
    model.position.set(TX, 0, TZ);
    model.traverse((o) => {
      if (o.isMesh && o.morphTargetInfluences) this.mesh = o;
      if (o.isMesh) o.frustumCulled = false; // la forma sentada se sale de la caja del modelo acostado
    });
    if (!this.mesh) return false;
    this.decor.scene.add(model);
    // apoyo: el punto más bajo de la sábana acostada tiene que quedar HANG por debajo de la tapa de la mesa (no se puede
    // usar la caja del modelo: incluye las formas de los morphs y sale más grande)
    model.updateMatrixWorld(true);
    const pos = this.mesh.geometry.attributes.position;
    let lo = 0;
    for (let i = 1; i < pos.count; i++) if (pos.getY(i) < pos.getY(lo)) lo = i;
    V.fromBufferAttribute(pos, lo).applyMatrix4(this.mesh.matrixWorld);
    model.position.y += TABLE_Y - HANG - V.y;
    model.updateMatrixWorld(true);
    this.root = model;
    // la gota que cae del borde y la onda que levanta en el charco
    const blood = new THREE.MeshStandardMaterial({ color: 0x2c0407, roughness: 0.3, metalness: 0 });
    this.drop = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), blood);
    this.drop.scale.set(0.8, 1.7, 0.8);
    this.drop.visible = false;
    this.decor.scene.add(this.drop);
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.0, 24),
      new THREE.MeshBasicMaterial({ color: 0x6a0c10, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.set(DRIP.x, FLOOR, DRIP.z);
    this.ring.visible = false;
    this.decor.scene.add(this.ring);
    this.fall = 0;
    this.ripple = 1;
    return true;
  }

  update(dt) {
    if (!this.root) {
      if (!hasAsset('c_corpse') || !this._build()) return;
    }
    // solo se dibuja y se anima cerca
    const near = G.camera && G.camera.position.distanceToSquared(V.set(TX, TABLE_Y, TZ)) < 40 * 40;
    this.root.visible = !!near;
    if (!near) { this.drop.visible = false; this.ring.visible = false; return; }
    const k = Math.max(0, Math.min(1, this.hinge.rotation.z / 1.15));
    if (Math.abs(k - this.k) > 0.001) {
      this.k = k;
      this.mesh.morphTargetInfluences[0] = k;
    }
    // goteo: espera, cae con la gravedad y al llegar al charco levanta una onda que se abre y se apaga
    const d = this.drop;
    if (!d.visible) {
      this.wait -= dt;
      if (this.wait <= 0) {
        d.visible = true;
        this.fall = 0;
        d.position.set(DRIP.x, DRIP.y, DRIP.z);
      }
    } else {
      this.fall += dt;
      d.position.y = DRIP.y - 4.9 * this.fall * this.fall;
      if (d.position.y <= FLOOR) {
        d.visible = false;
        this.wait = 1.1 + Math.random() * 2.4;
        this.ripple = 0;
        this.ring.visible = true;
        G.sfx?.trigger('drip', V.set(DRIP.x, FLOOR, DRIP.z), 0.3, { full: 1.5, max: 14 });
      }
    }
    if (this.ring.visible) {
      this.ripple += dt;
      const r = 0.012 + this.ripple * 0.16;
      this.ring.scale.set(r, r, r);
      this.ring.material.opacity = Math.max(0, 0.6 * (1 - this.ripple / 0.9));
      if (this.ripple > 0.9) this.ring.visible = false;
    }
  }
}
