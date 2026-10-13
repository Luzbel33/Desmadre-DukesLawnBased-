// Los NPC que agrega o saca un admin (ui/admin.js). El servidor guarda la lista (y los nombres de los NPC del mapa
// que se sacaron) y se la manda a todos: cada cliente los crea y los anima por su cuenta, como al resto de la gente.
//   mode: 'idle' (parado, mira al que pasa), 'dance' (baila al compás del Búnker), 'walk' (pasea alrededor)
import * as THREE from 'three';
import { G } from '../core/G.js';
import { Npc, prepareNpcCulling } from './npc.js';
import { MODELS } from '../char/human.js';

const V1 = new THREE.Vector3();
const BPM = 126;

export class AdminNpcs {
  constructor(scene) {
    this.scene = scene;
    this.list = new Map(); // id -> Npc
    this.hidden = new Set();
  }
  // lista que manda el servidor: crea los nuevos, borra los que ya no están
  sync({ list = [], hidden = [] } = {}) {
    const keep = new Set();
    for (const d of list) {
      keep.add(d.id);
      if (this.list.has(d.id)) continue;
      const model = MODELS[d.model] ? d.model : 'v_vecino';
      const home = new THREE.Vector3(...d.p);
      const n = new Npc(this.scene, { name: d.name, look: { model }, pos: home.clone(), yaw: d.yaw || 0, role: this._role(d.mode, home) });
      n.adminId = d.id;
      this.list.set(d.id, n);
      G.sfx?.trigger('ui-ok', home, 0.4, { full: 3, max: 25 });
      G.fx?.puff(home.clone().setY(home.y + 0.8), V1.set(0, 1, 0), 1.2, 0xd8d0c0);
    }
    for (const [id, n] of this.list) if (!keep.has(id)) { G.fx?.puff(n.pos.clone().setY(n.pos.y + 0.8), V1.set(0, 1, 0), 1.2, 0xd8d0c0); n.dispose?.(); if (n.char) n.char.root.visible = false; this.list.delete(id); }
    this.hidden = new Set(hidden);
    this.applyHidden();
  }
  // los NPC del mapa que un admin sacó: no se dibujan ni se animan (se los saltea su dueño: club.js / villagers.js)
  applyHidden() {
    for (const n of G.allNpcs?.() || []) {
      if (n.adminId) continue;
      const h = this.hidden.has(n.name);
      if (h && !n.hidden) G.fx?.puff(n.pos.clone().setY(n.pos.y + 0.8), V1.set(0, 1, 0), 1.2, 0xd8d0c0);
      n.hidden = h;
      if (h && n.char) n.char.root.visible = false;
    }
  }
  _role(mode, home) {
    if (mode === 'dance') {
      return (n) => {
        n.emote = MODELS[n.look.model]?.gender === 'f' ? 'gogo' : 'club';
        n.emoteT = (G.club?.beat?.beat ?? G.time * BPM / 60) + (n.adminId || 0) * 3;
        n.lookAt = null;
      };
    }
    if (mode === 'walk') {
      return (n, dt) => {
        const d = n.data;
        d.t = (d.t ?? 1) - dt;
        if (d.t <= 0 || !d.to) { d.t = 4 + Math.random() * 6; d.to = home.clone().add(V1.set((Math.random() - 0.5) * 9, 0, (Math.random() - 0.5) * 9)); }
        const v = V1.subVectors(d.to, n.pos); v.y = 0;
        const l = v.length();
        if (l > 0.15) { n.speed = 1.3; n.baseYaw = Math.atan2(v.x, v.z); n.pos.addScaledVector(v, Math.min(1, dt * 1.3 / l)); } else n.speed = 0;
        n.emote = null;
      };
    }
    return (n) => {
      const me = G.me;
      n.lookAt = me && me.pos.distanceToSquared(n.pos) < 36 ? me.pos : null;
    };
  }
  all() { return [...this.list.values()]; }
  update(dt, camera) {
    if (!this.list.size) return;
    prepareNpcCulling(camera);
    for (const n of this.list.values()) n.update(Math.min(0.1, dt), camera, true);
  }
}
