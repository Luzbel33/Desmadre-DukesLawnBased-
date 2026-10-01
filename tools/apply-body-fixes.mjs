import fs from 'node:fs';
function edit(file,before,after){const raw=fs.readFileSync(file,'utf8'),eol=raw.includes('\r\n')?'\r\n':'\n',src=raw.replace(/\r\n/g,'\n');if(src.includes(after))return;if(src.split(before).length!==2)throw new Error('Missing/ambiguous body patch '+file+': '+before.slice(0,100));fs.writeFileSync(file,src.replace(before,()=>after).replace(/\n/g,eol));}
function region(file,start,end,replacement,marker){const src=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');if(src.includes(marker))return;const a=src.indexOf(start),b=src.indexOf(end,a+start.length);if(a<0||b<0||src.indexOf(start,a+1)>=0)throw new Error('Missing body region '+file+': '+start);edit(file,src.slice(a,b),replacement);}
const p='public/js/game/player.js',n='public/js/game/npc.js',g='public/js/game/gore.js',v='public/js/game/villagers.js';
edit(p,"import { PoseContact } from './pose-contact.js';","import { PoseContact } from './pose-contact.js';\nimport { gripCandidate } from './grip-target.js';");
edit(p,"      if (mySp > 5.2 && this.state === 'active' && Math.hypot(this.pos.x - bpp.x, this.pos.z - bpp.z) < 0.72 && (this._tripT || 0) < G.time) this._trip(bpp, null);",`      const contactD = Math.hypot(this.pos.x - bpp.x, this.pos.z - bpp.z);
      const closing = contactD > .001 ? ((bpp.x - this.pos.x) * this.velocity.x + (bpp.z - this.pos.z) * this.velocity.y) / contactD : 0;
      if (mySp > 5.2 && closing > 4.2 && this.state === 'active' && contactD < Math.max(.72, this.capsuleRadius + (rp.capsuleRadius || CAPSULE_RADIUS) + .12) && Math.abs(this.pos.y - rp.pos.y) < 1.1 && (this._bodyContactT || 0) < G.time) {
        this._bodyContactT = G.time + 1;
        G.net?.send({ t: 'ev', k: 'bodybump', to: rp.id, v: [this.velocity.x, 0, this.velocity.y] });
        if ((this._tripT || 0) < G.time) this._trip(bpp, null);
      }`);
edit(p,'  _crowdNpcs(dt, sep, ns) {',`  receiveBodyBump(m) {
    if (!m || this.dead || !['active', 'stun', 'getup'].includes(this.state) || (this._receivedBumpT || 0) > G.time) return false;
    const other = G.players.get(m.id), at = other?.bodyPos || other?.pos;
    if (!at || !Array.isArray(m.v) || m.v.length !== 3 || !m.v.every(Number.isFinite)) return false;
    const dx = this.pos.x - at.x, dz = this.pos.z - at.z, distance = Math.hypot(dx, dz);
    const speed = Math.min(9, Math.hypot(m.v[0], m.v[2]));
    if (distance > 1.8 || Math.abs(this.pos.y - at.y) > 1.2 || speed < 4.2 || dx * m.v[0] + dz * m.v[2] < -.1) return false;
    this._receivedBumpT = G.time + 1;
    const direction = new THREE.Vector3(m.v[0], 0, m.v[2]).normalize();
    // Ordinary walking remains harmless; sprinting actually displaces the struck body.
    if (speed > 6.4) this.knockout(.9, m.id, direction.multiplyScalar(Math.min(4.5, speed * .5)).setY(.65));
    else this.stun(.45, direction.multiplyScalar(2.4));
    return true;
  }

  _crowdNpcs(dt, sep, ns) {`);
edit('public/js/main.js',"    case 'hc': //", "    case 'bodybump':\n      if (m.to === G.myId) state.local?.receiveBodyBump(m);\n      break;\n    case 'hc': //");
edit('server/room.js',"      case 'ev':\n",`      case 'ev':
        if (msg.k === 'bodybump') {
          const target = this.players.get(msg.to), a = p.st?.p, b = target?.st?.p;
          if (!target?.ready || target === p || !Array.isArray(a) || !Array.isArray(b) || ![...a, ...b].every(Number.isFinite) || now - (p.lastBodyBump || 0) < 800) break;
          if (Math.hypot(a[0] - b[0], a[2] - b[2]) > 2 || Math.abs(a[1] - b[1]) > 1.3) break;
          if (!Array.isArray(msg.v) || msg.v.length !== 3 || !msg.v.every(Number.isFinite)) break;
          const speed = Math.hypot(msg.v[0], msg.v[2]);
          if (speed < 4.2 || speed > 20) break;
          const scale = Math.min(1, 9 / speed);
          p.lastBodyBump = now;
          this.send(target, { t: 'ev', k: 'bodybump', id: p.id, to: target.id, v: [msg.v[0] * scale, 0, msg.v[2] * scale] });
          break;
        }
`);
region(p,'    // 1) partes de otros jugadores cerca de la mano o apuntadas','    // 2) objetos',`    // Reach is physical, not limited by the third-person camera's distance.
    const shoulder = this.rig.shoulderWorld(side, new THREE.Vector3());
    const reach = this._armLen(side) + .6;
    const visible = (a, b) => {
      const delta = b.clone().sub(a), length = delta.length();
      if (length < .05) return true;
      delta.multiplyScalar(1 / length);
      return !G.phys.raycast(a.x, a.y, a.z, delta.x, delta.y, delta.z, Math.max(0, length - .05));
    };
    let best = null;
    const offer = (body, cap, extra) => {
      const hit = gripCandidate(body, cap, hp, shoulder, cam.position, dir, reach, visible);
      if (hit && (!best || hit.score < best.score)) best = { ...extra, body, ...hit };
    };
    for (const rp of G.players.values()) {
      if (!rp.proxy?.alive) continue;
      for (let i = 0; i < 11; i++) {
        if (rp.char.detached?.[i] || (rp.sv & (1 << i))) continue;
        offer(rp.proxy.bodies[i], rp.char.meta.caps?.[i], { kind: 'player', rp, part: i });
      }
    }
    // Downed NPCs and severed physical limbs were previously absent from selection.
    for (const npc of G.allNpcs?.() || []) if (npc.rag?.alive && (npc.down > 0 || npc.dead)) {
      for (let i = 0; i < 11; i++) if (!npc.char?.detached?.[i] && !(npc.lost & (1 << i))) offer(npc.rag.bodies[i], npc.char.meta.caps?.[i], { kind: 'loose', npc, part: i });
    }
    const seen = new Set();
    G.phys.world.forEachCollider(collider => {
      if (G.phys.info(collider)?.kind !== 'gib') return;
      const body = collider.parent();
      if (!body || seen.has(body.handle)) return;
      seen.add(body.handle); offer(body, null, { kind: 'loose' });
    });
`, '    // Reach is physical, not limited by');
edit(p,'    const h = this.hands[side];\n    if (best.kind === \'prop\') {',`    const h = this.hands[side];
    if (best.kind === 'loose') {
      const forearm = this.rag.bodies[side === 'l' ? PART.FARM_L : PART.FARM_R];
      const grip = this.meta.gripLocal[side];
      const data = RAPIER.JointData.spring(.04, 950, 75, grip, best.anchor);
      h.joint = G.phys.world.createImpulseJoint(data, forearm, best.body, true);
      h.joint.setContactsEnabled?.(false);
      h.loose = { body: best.body, npc: best.npc, part: best.part, rag: best.npc?.rag };
      h.anchor = best.anchor;
      best.body.grabCount = (best.body.grabCount || 0) + 1;
      return true;
    }
    if (best.kind === 'prop') {`);
edit(p,'    const a2 = hp.clone().applyMatrix4(M1);','    const a2 = best.anchor ? best.anchor.clone() : hp.clone().applyMatrix4(M1);');
edit(p,'    if (!b || !h.anchor) return null;','    if (!b || !h.anchor || rp.char.detached?.[h.part] || (rp.sv & (1 << h.part))) return null;');
edit(p,'    if (!h.joint) return false;\n    if (h.joint !== HOLD_JOINT',`    if (!h.joint) return false;
    if (h.loose) {
      const b = h.loose.body;
      b.grabCount = Math.max(0, (b.grabCount || 1) - 1);
      if (b.gibItem) b.gibItem.t = Math.min(b.gibItem.t, 1);
      if (throwIt && b.isValid()) {
        const velocity = this.handVelocity(side).clampLength(0, 10);
        b.setLinvel(velocity, true);
      }
      h.loose = null;
    }
    if (h.joint !== HOLD_JOINT`);
edit(p,"      if (h.joint !== PLAYER_GRIP) continue;\n      const anc = this._gripAnchor(h, GA);",`      if (h.loose) {
        const b = h.loose.body, npc = h.loose.npc;
        if (!b.isValid() || (npc && (npc.rag !== h.loose.rag || !(npc.down > 0 || npc.dead)))) { this.release(side, false); continue; }
        if (npc && !npc.dead) npc.down = Math.max(npc.down, .3);
        const anchor = new THREE.Vector3().copy(h.anchor).applyQuaternion(new THREE.Quaternion().copy(b.rotation())).add(new THREE.Vector3().copy(b.translation()));
        if (anchor.distanceTo(this.handPos(side, new THREE.Vector3())) > 2.2) this.release(side, false);
        continue;
      }
      if (h.joint !== PLAYER_GRIP) continue;
      const anc = this._gripAnchor(h, GA);`);
edit(p,'      handWorld(rp.proxy, rp.char.meta, g.side, g.hand);\n      // tirado:',`      handWorld(rp.proxy, rp.char.meta, g.side, g.hand);
      const heldBody = this.rag.bodies[g.part];
      const bodyPoint = heldBody?.translation();
      if (!bodyPoint || this.char.detached?.[g.part] || g.hand.distanceTo(new THREE.Vector3().copy(bodyPoint)) > brk + .7) {
        this._dropGrip(key); this.onEvent?.('gripbreak', { to: g.id, side: g.side }); continue;
      }
      // tirado:`);
edit(p,'RAPIER.JointData.spring(0.05, 1800, 90,','RAPIER.JointData.spring(0.05, 1100, 85,');

edit(n,'  update(dt, camera, show = true) {',`  syncRagdollPosition() {
    if ((!this.dead && !(this.down > 0)) || !this.rag?.alive) return;
    const center = this.rag.bodies[PART.PELVIS]?.translation();
    if (center && [center.x, center.y, center.z].every(Number.isFinite)) this.pos.set(center.x, center.y, center.z);
  }

  update(dt, camera, show = true) {
    this.syncRagdollPosition();
    if ((this.down > 0 || this.dead) && this.rag?.alive && camera?.position.distanceToSquared(this.pos) < NPC_DRAW_DISTANCE * NPC_DRAW_DISTANCE) show = true;`);
edit(n,'    if (simulate && !(this.burnT > 0) && !(this.down > 0)) this.role?.(this, dt);\n    if (simulate) this._resolveMove();',`    const moveX = this.pos.x, moveZ = this.pos.z;
    if (simulate && !(this.burnT > 0) && !(this.down > 0)) this.role?.(this, dt);
    if (simulate) this._resolveMove();
    if (simulate && !this.sit && !this.down && !this.dead && !(this.burnT > 0) && dt > 0) this.speed = Math.min(5, Math.hypot(this.pos.x - moveX, this.pos.z - moveZ) / dt);`);
region(v,'      // pegado a su puesto; el segundo camina un poco a lo largo de la muralla y vuelve','      const p = this._near(npc, 3.2);',`      // Pursuit and patrol are mutually exclusive; never apply two movement steps.
      if (d.aggro > G.time) { this._brawl(npc, dt); return; }
      const step = Math.min(.1, Math.max(0, dt));
      const target = patrol && (d.patrolOut ?? true) ? home.x + 9 : home.x;
      const dx = target - npc.pos.x, dz = home.z - npc.pos.z, distance = Math.hypot(dx, dz);
      if (d.patrolWait > 0) { d.patrolWait -= step; npc.speed = 0; }
      else if (distance < .08) {
        npc.speed = 0;
        if (patrol) { d.patrolOut = !(d.patrolOut ?? true); d.patrolWait = 1.2; }
      } else {
        const travel = Math.min(distance, step * 1.1);
        npc.pos.x += dx / distance * travel; npc.pos.z += dz / distance * travel;
        npc.speed = dt > 0 ? travel / dt : 0;
        npc.baseYaw = Math.atan2(dx, dz);
        d.stuckFor = npc.blocked ? (d.stuckFor || 0) + step : 0;
        if (patrol && d.stuckFor > .7) { d.patrolOut = !(d.patrolOut ?? true); d.patrolWait = .6; d.stuckFor = 0; }
      }
`, '      // Pursuit and patrol are mutually exclusive;');
edit(g,'    this.items.push(item);','    this.items.push(item);\n    for (const body of item.bodies) body.gibItem = item;');
edit(g,'      const old = this.items.shift();',`      const index = this.items.findIndex(it => !it.bodies.some(b => b.grabCount > 0));
      if (index < 0) break;
      const [old] = this.items.splice(index, 1);`);
edit(g,'      it.t += dt;','      if (!it.bodies.some(b => b.grabCount > 0)) it.t += dt;');
edit('public/js/char/human.js','    sk.frustumCulled = true;',`    // A ragdoll can extend well beyond its pelvis sphere. Include every current bone.
    const inverse = M1.copy(sk.matrixWorld).invert();
    const padding = .45 * Math.max(1e-6, this.root.matrixWorld.getMaxScaleOnAxis()) / Math.max(1e-6, sk.matrixWorld.getMaxScaleOnAxis());
    for (const joint of this.joints) {
      if (!joint) continue;
      joint.updateWorldMatrix(true, false);
      V1.setFromMatrixPosition(joint.matrixWorld).applyMatrix4(inverse);
      const radius = V1.distanceTo(bs.center) + padding;
      if (Number.isFinite(radius)) bs.radius = Math.max(bs.radius, radius);
    }
    sk.frustumCulled = true;`);
edit('package.json','./tests/social-regressions.test.mjs"','./tests/social-regressions.test.mjs ./tests/body-regressions.test.mjs"');
