// Lo del Búnker que se usa con el click: tirar billetes, disparar y revolear granadas.
// - Billetes: una lluvia de papel que revolotea y queda en el piso un rato (lo ven todos: evento 'cash').
// - Pistola: tiro instantáneo por la mira. Al que le pega le avisa (él valida el daño, como un golpe: 'hitdealt'
//   con a = 'g'); a los NPCs y a los objetos los empuja acá. Trazadora, fogonazo y ruido para todos (evento 'shot').
// - Granada: sale de la mano con física propia, rebota y a los 2.8 s explota. Cada cliente simula la misma granada
//   (evento 'nade' con salida y velocidad) y cada uno calcula lo suyo: su jugador, los NPCs, el humo y el fuego.
import * as THREE from 'three';
import { G, clamp } from '../core/G.js';
import { RAPIER, GR, groups } from '../core/physics.js';
import { billTexture } from './equipment.js';
import { isPvpAt } from '../shared/mapdata.js';

const V1 = new THREE.Vector3();
const V2 = new THREE.Vector3();
const V3 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const FUSE = 2.8, BLAST = 7.5;
const SHOT_GROUPS = groups(0xffff, GR.WORLD | GR.REMOTE | GR.PROP | GR.VEHICLE | GR.RAGDOLL);

export class BunkerItems {
  constructor({ getLocal, getNet, kick, shake }) {
    this.getLocal = getLocal; this.getNet = getNet; this.kick = kick; this.shake = shake;
    this.bills = [];
    this.tracers = [];
    this.nades = [];
    this.shotT = 0;
    this._billMesh();
  }

  // ---------------------------------------------------------------- billetes
  _billMesh() {
    if (typeof document === 'undefined') return;
    const MAX = 400;
    const geo = new THREE.PlaneGeometry(0.155, 0.068);
    const mat = new THREE.MeshStandardMaterial({ map: billTexture(), side: THREE.DoubleSide, roughness: 0.9 });
    this.billMesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.billMesh.count = 0;
    this.billMesh.frustumCulled = false;
    G.scene.add(this.billMesh);
    this.MAX = MAX;
  }
  cash(o, d, n = 14) {
    for (let i = 0; i < n; i++) {
      if (this.bills.length >= this.MAX) this.bills.shift();
      const v = new THREE.Vector3(d.x + (Math.random() - 0.5) * 0.9, d.y + 0.5 + Math.random() * 0.8, d.z + (Math.random() - 0.5) * 0.9).multiplyScalar(2.2 + Math.random() * 1.6);
      this.bills.push({ p: o.clone().add(V1.set((Math.random() - 0.5) * 0.1, 0, (Math.random() - 0.5) * 0.1)), v, rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6), spin: new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9), t: 0, seed: Math.random() * 10, floor: null });
    }
    G.sfx?.trigger('bills', o, 0.8, { full: 4, max: 30 });
  }
  throwCash(L) {
    const o = L.handPos('r', new THREE.Vector3());
    const d = G.camera.getWorldDirection(new THREE.Vector3());
    this.cash(o, d);
    this.getNet()?.send({ t: 'ev', k: 'cash', o: o.toArray().map((x) => +x.toFixed(2)), d: d.toArray().map((x) => +x.toFixed(2)) });
  }
  _stepBills(dt) {
    if (!this.billMesh) return;
    const M = this._m || (this._m = new THREE.Matrix4());
    const Q = this._q || (this._q = new THREE.Quaternion());
    const S = this._s || (this._s = new THREE.Vector3(1, 1, 1));
    let k = 0;
    for (let i = this.bills.length - 1; i >= 0; i--) {
      const b = this.bills[i];
      b.t += dt;
      if (b.t > 25) { this.bills.splice(i, 1); continue; }
      if (b.floor === null) {
        // papel: mucho freno, cae lento y se hamaca de costado
        b.v.y -= 9.8 * dt * 0.35;
        b.v.multiplyScalar(Math.exp(-dt * 2.6));
        b.v.x += Math.sin(G.time * 3 + b.seed) * dt * 1.4;
        b.v.z += Math.cos(G.time * 2.3 + b.seed * 2) * dt * 1.4;
        b.v.y = Math.max(b.v.y, -1.1);
        b.p.addScaledVector(b.v, dt);
        b.rot.x += b.spin.x * dt; b.rot.y += b.spin.y * dt; b.rot.z += b.spin.z * dt;
        const hit = G.phys.raycast(b.p.x, b.p.y + 0.05, b.p.z, 0, -1, 0, 0.08, groups(0xffff, GR.WORLD));
        if (hit || b.p.y < 0.02) { b.floor = hit ? hit.y + 0.004 : 0.012; b.p.y = b.floor; b.rot.set(-Math.PI / 2, b.rot.y, 0); }
      }
      Q.setFromEuler(b.rot);
      M.compose(b.p, Q, S);
      this.billMesh.setMatrixAt(k++, M);
    }
    this.billMesh.count = k;
    this.billMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- pistola
  shoot(L) {
    if (!L || L.dead || L.combatBlocked || G.time < this.shotT) return false;
    this.shotT = G.time + 0.3;
    const cam = G.camera;
    const o = cam.position.clone(), d = cam.getWorldDirection(new THREE.Vector3());
    const hit = G.phys.raycast(o.x, o.y, o.z, d.x, d.y, d.z, 90, SHOT_GROUPS, null, (col) => {
      const info = G.phys.info(col);
      return !(info && (info.kind === 'me' || info.kind === 'player' || info.kind === 'gib' || info.holes));
    });
    const end = hit ? new THREE.Vector3(hit.x, hit.y, hit.z) : o.clone().addScaledVector(d, 90);
    const muzzle = L.handPos('r', new THREE.Vector3()).addScaledVector(d, 0.25).add(V1.set(0, 0.035, 0));
    if (hit) this._impact(L, hit, end, d);
    this.tracer(muzzle, end);
    L.equipment?.shoot?.();
    G.sfx?.trigger('shot', null, 1);
    this.kick?.(0.06);
    this.getNet()?.send({ t: 'ev', k: 'shot', o: muzzle.toArray().map((x) => +x.toFixed(2)), e: end.toArray().map((x) => +x.toFixed(2)) });
    return true;
  }
  _impact(L, hit, point, d) {
    const info = hit.info;
    if (info?.kind === 'remote') {
      L._claimHit(info.id, info.part ?? 1, 22, point, 'pistol', 'g');
      G.fx?.blood(point.clone(), V1.copy(d).negate().add(UP).normalize(), 0.9);
    } else if (info?.kind === 'bag' && info.ref?.punch) {
      info.ref.punch(16, point, d.clone(), 1.6, true, 'bullet');
    } else if (info?.kind === 'prop' && info.ref) {
      L._whack?.(info.ref, d.clone(), 12, point, { mass: 1 });
      G.fx?.sparks(point.clone(), V1.set(-d.x, -d.y, -d.z), 8);
    } else {
      G.fx?.sparks(point.clone(), V1.set(hit.nx, hit.ny, hit.nz), 10);
      G.fx?.puff(point.clone(), V1.set(hit.nx, hit.ny, hit.nz), 0.3, 0x9a948a);
    }
    G.sfx?.trigger('hit-soft', point, 0.35, { full: 3, max: 25 });
  }
  remoteShot(m) {
    const o = new THREE.Vector3().fromArray(m.o || []), e = new THREE.Vector3().fromArray(m.e || []);
    if (!Number.isFinite(o.x + e.x)) return;
    this.tracer(o, e);
    G.sfx?.trigger('shot', o, 1, { full: 8, max: 120 });
    G.fx?.sparks(e.clone(), V1.subVectors(o, e).normalize(), 6);
  }
  tracer(a, b) {
    const len = a.distanceTo(b);
    if (len < 0.01) return;
    const m = new THREE.Mesh(this._tgeo || (this._tgeo = new THREE.BoxGeometry(0.012, 0.012, 1).translate(0, 0, 0.5)),
      new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    m.material.color.multiplyScalar(3);
    m.position.copy(a); m.lookAt(b); m.scale.set(1, 1, len);
    G.scene.add(m);
    this.tracers.push({ m, t: 0 });
  }

  // ---------------------------------------------------------------- granada
  throwNade(L, side = 'r') {
    const hand=L.hands[side], generation=hand.itemGeneration || 0;
    setTimeout(() => {
      if(this.getLocal()!==L || L.dead || L.combatBlocked || hand.item!=='grenade' || (hand.itemGeneration||0)!==generation) return;
      hand.item=null; hand.itemGeneration=generation+1; L.onEvent?.('release',{side,equipped:true});
      const o = L.handPos(side, new THREE.Vector3());
      const d = G.camera.getWorldDirection(new THREE.Vector3());
      const v = d.multiplyScalar(12.5).add(V1.set(0, 3.2, 0));
      this.nade(o, v, G.myId);
      this.getNet()?.send({ t: 'ev', k: 'nade', o: o.toArray().map((x) => +x.toFixed(2)), v: v.toArray().map((x) => +x.toFixed(2)) });
    }, 170);
  }
  nade(o, v, by) {
    const body = G.phys.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(o.x, o.y, o.z).setLinvel(v.x, v.y, v.z).setAngvel({ x: 6, y: 3, z: 2 }).setCcdEnabled(true).setLinearDamping(0.1));
    const col = G.phys.world.createCollider(RAPIER.ColliderDesc.ball(0.045).setDensity(900).setRestitution(0.35).setFriction(0.8).setCollisionGroups(groups(GR.DEBRIS, GR.WORLD | GR.PROP | GR.VEHICLE)), body);
    const mesh = new THREE.Group();
    const olive = new THREE.MeshStandardMaterial({ color: 0x3d4a26, roughness: 0.7, metalness: 0.2 });
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), olive); s.scale.set(1, 1.2, 1); mesh.add(s);
    G.scene.add(mesh);
    this.nades.push({ body, col, mesh, t: 0, by });
    G.sfx?.trigger('swing', o, 0.5);
  }
  _explode(n) {
    const t = n.body.translation();
    const p = new THREE.Vector3(t.x, t.y, t.z);
    G.phys.world.removeRigidBody(n.body);
    n.mesh.removeFromParent();
    this._blastFx(p);
    // la onda: a mí (si estoy cerca), a los NPC, a las cosas sueltas
    const L = this.getLocal();
    if (L && !L.dead) {
      const d = L.pos.distanceTo(p);
      this.shake?.(clamp(1.6 - d / 16, 0, 1.3));
      if (d < BLAST) {
        const k = 1 - d / BLAST;
        const away = V2.subVectors(L.pos, p).setY(0).normalize();
        const pvp = G.settings?.desmadre || isPvpAt(L.pos.x, L.pos.z);
        const by = n.by !== G.myId ? n.by : 0;
        if (pvp) L.damage?.(k * 85, by);
        if (pvp && !L.dead) L.blastGore?.(k, V3.copy(away).multiplyScalar(3 + k * 5).setY(2 + k * 3), by);
        // salís volando: más cuanto más cerca (hasta ~5 m de alto), girando
        if (!L.dead && k > 0.15) L.knockout?.(1.8 + k * 3, by, away.multiplyScalar(5 + k * 11).setY(4 + k * 8));
        else if (L.dead && L.rag) for (const b of L.rag.bodies) b.applyImpulse({ x: away.x * k * 12, y: k * 14, z: away.z * k * 12 }, true);
      }
    }
    for (const npc of G.allNpcs?.() || []) {
      const d = npc.pos.distanceTo(p);
      if (d >= BLAST || npc.dead) continue;
      const k = 1 - d / BLAST;
      const v = V2.subVectors(npc.pos, p).setY(0).normalize().multiplyScalar(5 + k * 11).setY(4 + k * 8);
      npc.hp -= 40 + k * 90; npc.hpShowT = 4;
      npc.blastGore?.(k, v.clone());
      if (k > 0.55) npc.ignite?.(4);
      if (!npc.dead) { if (npc.hp <= 0) npc.die(v.clone()); else npc.knockout(v.clone(), 4 + k * 3); }
    }
    // cosas sueltas (sillas, botellas, cajas): salen despedidas
    for (const q of G.props?.items?.values?.() || []) {
      if (!q.dynamic || !q.body) continue;
      const qt = q.body.translation();
      const d = Math.hypot(qt.x - p.x, qt.y - p.y, qt.z - p.z);
      if (d > BLAST) continue;
      const k = (1 - d / BLAST) * Math.min(6, q.mass || 1) * 7;
      q.body.applyImpulse({ x: (qt.x - p.x) / (d || 1) * k, y: k * 0.9, z: (qt.z - p.z) / (d || 1) * k }, true);
    }
  }
  // lo que se ve y se oye: bola de fuego que crece, onda en el piso, tierra y esquirlas, humo que sube, mancha negra
  _blastFx(p) {
    G.sfx?.trigger('boom', p, 1, { full: 14, max: 200 });
    G.sfx?.trigger('fire-flare', p, 0.8, { full: 6, max: 60 });
    const flash = { position: p.clone().setY(p.y + 1), color: new THREE.Color(0xffb060), intensity: 160, distance: 30, decay: 1.4, visible: true, priority: 9, base: 160 };
    G.world?.pool?.add(flash);
    const t0 = performance.now();
    const grp = new THREE.Group(); grp.position.copy(p);
    const mk = (col, op) => new THREE.Mesh(this._sphere || (this._sphere = new THREE.SphereGeometry(1, 20, 14)), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const core = mk(0xfff0b0, 1), fire = mk(0xff6010, 0.85), outer = mk(0x802000, 0.5);
    core.material.color.multiplyScalar(3); fire.material.color.multiplyScalar(2);
    grp.add(core, fire, outer);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd8a0, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
    ring.position.set(p.x, Math.max(0.05, p.y - 0.3), p.z);
    G.scene.add(grp, ring);
    const tick = () => {
      const u = (performance.now() - t0) / 1000;
      const a = Math.min(1, u / 0.35);
      core.scale.setScalar(0.4 + a * 1.6); fire.scale.setScalar(0.6 + a * 2.8); outer.scale.setScalar(0.8 + a * 3.6);
      core.material.opacity = Math.max(0, 1 - u / 0.25); fire.material.opacity = Math.max(0, 0.85 - u / 0.5); outer.material.opacity = Math.max(0, 0.5 - u / 0.7);
      ring.scale.setScalar(1 + u * 22); ring.material.opacity = Math.max(0, 0.8 - u * 2.4);
      flash.intensity = 160 * Math.max(0, 1 - u / 0.35);
      if (u < 0.8) requestAnimationFrame(tick);
      else { grp.removeFromParent(); ring.removeFromParent(); for (const m of [core, fire, outer, ring]) m.material.dispose(); ring.geometry.dispose(); G.world?.pool?.remove(flash); }
    };
    tick();
    for (let i = 0; i < 16; i++) G.fx?.fire(p.clone().add(V1.set((Math.random() - 0.5) * 2.2, Math.random() * 1.6, (Math.random() - 0.5) * 2.2)));
    for (let i = 0; i < 14; i++) G.fx?.puff(p.clone().add(V1.set((Math.random() - 0.5) * 2.5, 0.5 + Math.random() * 2.5, (Math.random() - 0.5) * 2.5)), V1.set((Math.random() - 0.5) * 0.6, 1, (Math.random() - 0.5) * 0.6).normalize(), 3.5, i % 2 ? 0x2a2624 : 0x4a4440);
    G.fx?.sparks(p.clone(), UP, 60);
    G.fx?.dust?.(p.clone(), UP, 3);
    // tierra y esquirlas que vuelan y rebotan
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 9;
      G.fx?.bits?.spawn({ x: p.x, y: p.y + 0.2, z: p.z, vx: Math.cos(a) * sp, vy: 3 + Math.random() * 8, vz: Math.sin(a) * sp, life: 3 + Math.random() * 3, s: 0.015 + Math.random() * 0.04, col: Math.random() < 0.6 ? 0x2a2018 : 0x5a4a38, grav: -9.8, bounce: 0.3, drag: 0.4 });
    }
    // la mancha negra en el piso (se borra sola con el tiempo)
    if (p.y < 1.5) G.blood?.add(p.x, p.z, 3.4, 0x0c0906, 0.035, 150);
  }

  // ---------------------------------------------------------------- cada cuadro
  update(dt) {
    this._stepBills(dt);
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.t += dt;
      tr.m.material.opacity = Math.max(0, 0.9 - tr.t * 12);
      if (tr.t > 0.08) { tr.m.removeFromParent(); tr.m.material.dispose(); this.tracers.splice(i, 1); }
    }
    for (let i = this.nades.length - 1; i >= 0; i--) {
      const n = this.nades[i];
      n.t += dt;
      const t = n.body.translation(), r = n.body.rotation();
      n.mesh.position.set(t.x, t.y, t.z);
      n.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      if (n.t >= FUSE || t.y < -20) { this.nades.splice(i, 1); this._explode(n); }
    }
  }
}
