// Poderes del dueño (SmokePyro jugando con El Diablo). El servidor decide quién es el dueño; acá van las teclas,
// el fuego por la boca, lo que se quema, el invisible, el inmortal y la risa.
//   K: aliento (gruñe al arrancar) · N: bola de fuego · I: invisible · O: inmortal · L o menú de gestos: risa
//   (el click de la rueda ahora abre el menú circular de gestos)
// Las quemaduras las decide cada víctima (como los golpes): el dueño avisa "te quemé" y el otro se prende fuego.
import * as THREE from 'three';
import { G, clamp } from '../core/G.js';
import { FireBreath, setBreathPhysics } from '../fx/breath.js';
import { FireBalls, SurfaceFires, clearFirePath } from '../fx/demon-fire.js';
import { DEMON_FIRE as F, fireVector } from '../shared/demon-fire.js';

const V1 = new THREE.Vector3();
const V2 = new THREE.Vector3();
const V3 = new THREE.Vector3();
const REACH = F.breathReach;
const LAUGH_S = [4.0, 3.0, 2.2]; // lo que dura cada risa (audio/diablo/risa-1..3) para mover la mandíbula

export class OwnerPowers {
  constructor({ getNet, getLocal, isOwner, notify, onHurt }) {
    this.getNet = getNet;
    this.getLocal = getLocal;
    this.isOwner = isOwner;
    this.notify = notify;
    this.onHurt = onHurt;
    setBreathPhysics(G.phys);
    this.breath = new FireBreath(G.scene);
    this.patches = new SurfaceFires(() => G.world);
    this.balls = new FireBalls(G.scene, G.phys, this.breath, b => this._impact(b));
    this.ballT = 0; this.fireSync = 0; this.patchT = 0; this.contactT = 0; this.shotSeq = 0;
    this.aims = new Map(); this.burnSource = new Map(); this.seenShots = new Map();
    this.firing = false;
    this.burnT = 0; // tiempo para revisar a quién quema el chorro
    this.laughT = 0;
    this.laughEnd = new Map(); // id ('me' o remoto) -> hasta cuándo se está riendo (G.time)
    this.burning = new Map(); // id ('me' o id remoto) -> segundos que le quedan prendido fuego
    this.slots = new Map(); // id -> { fire, flames[] }
    this.freeSlots = [];
    this.badges = document.getElementById('owner-badges');
    this._badgeKey = '';
  }

  // ¿soy el dueño jugando con el Diablo? (los poderes van con el personaje)
  active() {
    const L = this.getLocal();
    return !!(L && this.isOwner() && L.look?.model === 'diablo');
  }

  // teclas (solo en modo juego)
  input(inp) {
    const L = this.getLocal();
    const on = this.active();
    const net = this.getNet();
    const want = on && !L.dead && inp.key('KeyK');
    if (want !== this.firing) {
      if (want) this._growl(null);
      this.firing = want;
      this.breath.set('me', want);
      this.breath.attachLight('me', G.world?.pool);
      net?.send({ t: 'pow', a: 'fire', v: want ? 1 : 0 });
    }
    if (!on) {
      if (L?.invisible) this.setInvisible(false);
      if (L?.immortal) L.immortal = false;
      return;
    }
    if (!L.dead && inp.hit('KeyN') && G.time >= this.ballT) {
      const o=new THREE.Vector3(), d=new THREE.Vector3(); this._pose('me',o,d);
      const shot=String(++this.shotSeq);
      if(this.balls.launch(`${G.myId}:${shot}`,G.myId,o,d,true)) {
        this.ballT=G.time+F.ballCooldown;
        net?.send({t:'pow',a:'ball',shot,o:o.toArray(),d:d.toArray()});
        G.sfx?.trigger('fire-flare',o,.7);
      }
    }
    if (inp.hit('KeyI')) this.setInvisible(!L.invisible);
    if (inp.hit('KeyO')) {
      L.immortal = !L.immortal;
      if (L.immortal) { L.hp = 100; L.bleedRate = 0; }
      this.notify(L.immortal ? '☠ <b>INMORTAL</b>: nada te lastima.' : 'Inmortal: <b>apagado</b>.');
    }
    if (inp.hit('KeyL')) this.laugh();
  }

  // risa del Diablo (tecla L o el menú de gestos); devuelve false si todavía se está riendo
  laugh() {
    if (!this.active() || performance.now() - this.laughT < 2200) return false;
    this.laughT = performance.now();
    const v = (Math.random() * 3) | 0;
    this.laughEnd.set('me', G.time + LAUGH_S[v]);
    G.sfx?.trigger('devil-laugh', null, 1, { variant: v, rate: 1 });
    this.getNet()?.send({ t: 'pow', a: 'laugh', v });
    return true;
  }

  // gruñido al arrancar a escupir fuego (a lo sumo uno cada 1.2 s: soltar y volver a apretar no lo repite)
  _growl(pos, id = 'me') {
    const now = performance.now();
    this._growlT = this._growlT || new Map();
    if (now - (this._growlT.get(id) || -1e9) < 1200) return;
    this._growlT.set(id, now);
    G.sfx?.trigger('devil-growl', pos, 0.95, pos ? { full: 8, max: 60 } : {});
  }

  setInvisible(v) {
    const L = this.getLocal();
    if (!L) return;
    L.invisible = v;
    L.char.devil?.setGhost(v ? 1 : 0);
    this.getNet()?.send({ t: 'pow', a: 'inv', v: v ? 1 : 0 });
    this.notify(v ? '👻 <b>INVISIBLE</b>: nadie te ve (pero te escuchan).' : 'Invisible: <b>apagado</b>.');
  }

  // ---------------------------------------------------------------- lo que manda el servidor de otros dueños
  onPow(m) {
    if (m.a === 'ritual') { G.club?.onRitual(m); return; } // el pentagrama: lo aprobó el servidor
    if(m.a==='patch') {
      const p=fireVector(m.p),n=fireVector(m.n);
      if(p&&n)this.patches.add(new THREE.Vector3(...p),new THREE.Vector3(...n),clamp(+m.life||F.patchSeconds,0,F.patchSeconds),m.id);
      return;
    }
    const rp = G.players.get(m.id);
    if (!rp) return;
    if (m.a === 'inv') { rp.inv = !!m.v; rp.char.root.visible = !rp.inv; }
    else if (m.a === 'fire') { if (m.v && !this.breath.isOn(m.id)) this._growl(rp.pos, m.id); this.breath.set(m.id, !!m.v); this.breath.attachLight(m.id, G.world?.pool); if(fireVector(m.d))this.aims.set(m.id,new THREE.Vector3(...m.d).normalize()); }
    else if(m.a==='ball' && fireVector(m.o) && fireVector(m.d))this.balls.launch(`${m.id}:${m.shot}`,m.id,new THREE.Vector3(...m.o),new THREE.Vector3(...m.d));
    else if (m.a === 'laugh') {
      this.laughEnd.set(m.id, G.time + LAUGH_S[(m.v | 0) % 3]);
      G.sfx?.trigger('devil-laugh', rp.pos, 1, { variant: (m.v | 0) % 3, full: 8, max: 70, rate: 1 });
    }
  }

  // el dueño dice que me quemó: lo valido yo (como un golpe)
  onBurn(m) {
    const L = this.getLocal();
    const rp = G.players.get(m.id);
    if (!L || !rp || !rp.owner || rp.look?.model !== 'diablo' || L.dead) return;
    if (rp.pos.distanceTo(L.pos) > (m.mode==='ball'?F.ballRange:REACH) + 4) return;
    const target=L.char.headWorld().add(new THREE.Vector3(0,-.35,0));
    if(m.mode==='ball') {
      if(!fireVector(m.p))return;
      const key=`${m.id}:${m.shot}`;
      if(this.seenShots.has(key))return;
      const impact=new THREE.Vector3(...m.p);
      if(!this._near(L.char,impact,F.blastRadius)||!clearFirePath(G.phys,impact,target))return;
      this.seenShots.set(key,G.time+5);
    } else {
      const origin=fireVector(m.o)?new THREE.Vector3(...m.o):rp.char.mouthWorld();
      if(origin.distanceTo(rp.pos)>3.5||origin.distanceTo(target)>REACH+.3||!clearFirePath(G.phys,origin,target))return;
      if(fireVector(m.d)) {
        const to=target.clone().sub(origin).normalize(),dir=new THREE.Vector3(...m.d).normalize();
        if(to.dot(dir)<.88)return;
      }
    }
    const s = clamp(+m.s || 0, 0, 1);
    if (!L.immortal) {
      L.damage(m.mode==='ball'?18+10*s:3+6*s, m.id);
      L._vocal?.(s > 0.45 ? 'scream' : 'hurt');
    }
    this.onHurt?.(0.25 + s * 0.3);
    this.ignite('me', F.burnSeconds,m.id);
    this.getNet()?.send({ t: 'ev', k: 'onfire', d: F.burnSeconds });
  }
  // otro jugador avisa que se prendió fuego
  onFire(m) { if (G.players.has(m.id)) this.ignite(m.id, clamp(+m.d || 3, 0.5, 6)); }

  ignite(id, secs, by=0) { this.burning.set(id, Math.max(this.burning.get(id) || 0, secs)); if(by)this.burnSource.set(id,by); }
  remove(id) {
    this.breath.remove(id);this.aims.delete(id);this.burning.delete(id);this.burnSource.delete(id);this.laughEnd.delete(id);
    this._slotOff(id);const slot=this.slots.get(id);
    if(slot){this.freeSlots.push(slot);this.slots.delete(id);}
  }
  reset() {
    for(const id of [...this.slots.keys()])this.remove(id);
    for(const id of [...this.breath.emitters.keys()])this.breath.remove(id);
    this.breath.lastAlive=-1e9;this.burning.clear();this.burnSource.clear();this.aims.clear();this.seenShots.clear();this.laughEnd.clear();
    for(const s of this.patches.slots)s.life=0;this.patches.update(0);
    for(const b of this.balls.balls)b.mesh.removeFromParent();this.balls.balls.length=0;this.firing=false;
  }

  // la boca del Diablo (la mandíbula es un hueso del modelo): de par en par al tirar fuego y "ja, ja, ja" mientras suena la risa
  _mouths(dt) {
    const L = this.getLocal();
    const k = Math.min(1, dt * 14);
    const set = (ch, model, fire, laughEnd) => {
      if (!ch) return;
      let t = 0;
      if (model === 'diablo') {
        if (fire) t = 1;
        if (laughEnd > G.time) t = Math.max(t, 0.5 + 0.5 * Math.sin(G.time * 14));
      }
      const r = ch.roar || 0;
      if (r || t) { const n = r + (t - r) * k; ch.roar = n < 0.002 ? 0 : n; }
    };
    set(L?.char, L?.look?.model, this.firing, this.laughEnd.get('me') || 0);
    for (const [id, rp] of G.players) set(rp.char, rp.look?.model, this.breath.isOn(id), this.laughEnd.get(id) || 0);
  }

  _pose(id, origin, dir) {
    const L=this.getLocal();
    if(id==='me') {
      if(!L)return false;
      G.camera.getWorldDirection(dir);
      if(!L.char.headVisible)origin.copy(G.camera.position).addScaledVector(dir,.22).add(new THREE.Vector3(0,-.12,0));
      else L.char.mouthWorld(origin);
      return true;
    }
    const rp=G.players.get(id);
    if(!rp||rp.stateData?.s===3||rp.look?.model!=='diablo')return false;
    rp.char.mouthWorld(origin);
    if(this.aims.has(id))dir.copy(this.aims.get(id));
    else dir.set(Math.sin(rp.yaw||0),0,Math.cos(rp.yaw||0));
    return true;
  }
  _near(ch,point,radius) {
    return ch.capsules().some(c=>new THREE.Line3(c.a,c.b).closestPointToPoint(point,true,new THREE.Vector3()).distanceTo(point)<=radius+c.r);
  }
  _patch(point,normal) {
    this.patches.add(point,normal,F.patchSeconds,G.myId);
    this.getNet()?.send({t:'pow',a:'patch',p:point.toArray(),n:normal.toArray()});
  }
  _impact(b) {
    if(!b.authoritative)return;
    if(!b.player)this._patch(b.p,b.normal);
    const point=b.p.clone().addScaledVector(b.normal,.04);
    for(const rp of G.players.values()) {
      if(rp.stateData?.s===3||!this._near(rp.char,b.p,F.blastRadius))continue;
      const target=rp.char.headWorld().add(new THREE.Vector3(0,-.35,0));
      if(!clearFirePath(G.phys,point,target))continue;
      this.getNet()?.send({t:'ev',k:'burn',mode:'ball',to:rp.id,shot:b.id.split(':').pop(),p:point.toArray(),s:1});
      this.ignite(rp.id,F.burnSeconds,G.myId);
    }
  }

  // ---------------------------------------------------------------- cada cuadro
  update(dt) {
    const L = this.getLocal();
    if (L && !this.active()) {
      if (L.invisible) this.setInvisible(false);
      L.immortal = false;
    }
    // A respawn/model rebuild creates a new material; retain the active ghost
    // state without recompiling its shader every frame.
    L?.char.devil?.setGhost(L.invisible ? 1 : 0);
    if (this.firing && (!this.active() || L?.dead)) {
      this.firing = false;
      this.breath.set('me', false);
      this.getNet()?.send({t:'pow', a:'fire', v:0});
    }
    // de dónde sale el fuego: mi boca (en primera persona, un poco abajo de la cámara) o la de otro
    this.breath.update(dt, G.time, (id,o,d)=>this._pose(id,o,d));
    this._mouths(dt);
    this.balls.update(dt,G.time,[...G.players.values(),...(L?[{id:G.myId,char:L.char,dead:L.dead}]:[])]);
    this.patches.update(dt);
    this.patchT-=dt; this.fireSync-=dt; this.contactT-=dt;
    for(const [id,end]of this.seenShots)if(end<G.time)this.seenShots.delete(id);
    // a quién quema mi chorro (cada 0,2 s): los que están en el cono, hasta la pared
    if (this.firing && L && !L.dead) {
      this.burnT -= dt;
      if (this.burnT <= 0) {
        this.burnT = 0.2;
        const e = this.breath.emitters.get('me');
        if (e) {
          const reach = Math.min(REACH, e.hit);
          if(this.fireSync<=0) {this.fireSync=.15;this.getNet()?.send({t:'pow',a:'fire',v:1,d:e.dir.toArray()});}
          if(e.surface&&e.hit<=REACH&&this.patchT<=0) {
            this.patchT=.4;this._patch(e.origin.clone().addScaledVector(e.dir,e.hit),new THREE.Vector3(e.surface.nx,e.surface.ny,e.surface.nz));
          }
          for (const rp of G.players.values()) {
            if (rp.stateData?.s === 3) continue;
            const target = rp.headPosition(V3).add(V1.set(0, -0.45, 0));
            const to = V2.subVectors(target, e.origin);
            const d = to.length();
            if (d > reach || d < 0.05) continue;
            if (to.dot(e.dir) / d < 0.9) continue;
            if(!clearFirePath(G.phys,e.origin,target))continue;
            this.getNet()?.send({ t: 'ev', k: 'burn', to: rp.id, o:e.origin.toArray(),d:e.dir.toArray(),s: +(1 - d / (REACH + 1)).toFixed(2) });
            this.ignite(rp.id, 2.5);
          }
        }
      }
    }
    // prendido fuego: yo pierdo vida mientras dure (salvo inmortal); a todos se les ve el fuego encima
    let mine = this.burning.get('me') || 0;
    if(L&&!L.dead&&this.contactT<=0) {
      this.contactT=.3;
      const patch=this.patches.touching(L.char,G.myId).find(s=>clearFirePath(G.phys,s.p.clone().addScaledVector(s.n,.06),L.char.headWorld().add(new THREE.Vector3(0,-.35,0))));
      let campfire = false;
      if (G.world?.fires) for (let i = 0; i < L.rag.bodies.length && !campfire; i++) {
        const b = L.rag.bodies[i], cap = L.meta.caps[i], rot = b.rotation();
        const part = cap.a.clone().add(cap.b).multiplyScalar(.5).applyQuaternion(new THREE.Quaternion(rot.x, rot.y, rot.z, rot.w)).add(new THREE.Vector3(b.translation().x,b.translation().y,b.translation().z));
        campfire = G.world.fires.touching(part, cap.r).some(f => clearFirePath(G.phys,new THREE.Vector3(f.x,f.y+f.h*.7,f.z),part));
      }
      if(patch || campfire){this.ignite('me',F.burnSeconds,patch?.by || 0);this.getNet()?.send({t:'ev',k:'onfire',d:F.burnSeconds});mine=F.burnSeconds;}
    }
    if (mine > 0 && L && !L.dead && !L.immortal) {
      L.damage(F.burnDps*dt,this.burnSource.get('me')||0);
    }
    for (const [id, t] of this.burning) {
      const left = t - dt;
      if (left <= 0) { this.burning.delete(id); this.burnSource.delete(id); this._slotOff(id); continue; }
      this.burning.set(id, left);
      const ch = id === 'me' ? L?.char : G.players.get(id)?.char;
      if (!ch || (id !== 'me' && G.players.get(id)?.inv)) { this._slotOff(id); continue; }
      this._slotOn(id, ch, Math.min(1, left / 0.6));
    }
    this._badges();
  }

  // un fuego que sigue al cuerpo (volumétrico; en calidad baja, llamas planas)
  _slotOn(id, ch, k) {
    let s = this.slots.get(id);
    const W = G.world;
    if (!s) {
      s = this.freeSlots.pop();
      if(!s) {
        s = { fire: -1, flames: [] };
        if (W.fires && W.quality !== 'baja' && W.fires.list.length<48) s.fire = W.fires.add(0, -50, 0, 0.42, 0.38, 2.0, { intensity: 0, speed: 1.5, hazard: false });
        else if (W.flames) for (let i = 0; i < 3; i++) s.flames.push(W.flames.add(0, -50, 0, 0.35, 0.6, { intensity: 0 }));
      }
      this.slots.set(id, s);
    }
    ch.root.updateWorldMatrix(true, true);
    const hip = ch.bones.hip.getWorldPosition(V1);
    if (s.fire >= 0) { W.fires.move(s.fire, hip.x, hip.y - 0.95, hip.z); W.fires.set(s.fire, 1.25 * k); }
    s.flames.forEach((f, i) => { W.flames.move(f, hip.x + (i - 1) * 0.15, hip.y - 0.3 + i * 0.25, hip.z); W.flames.set(f, k); });
  }
  _slotOff(id) {
    const s = this.slots.get(id);
    if (!s) return;
    const W = G.world;
    if (s.fire >= 0) W.fires.set(s.fire, 0);
    for (const f of s.flames) W.flames.set(f, 0);
  }

  // insignias arriba a la derecha (solo el dueño las ve)
  _badges() {
    const L = this.getLocal();
    const on = this.active();
    const key = on ? `${L.invisible ? 1 : 0}${L.immortal ? 1 : 0}` : '';
    if (key === this._badgeKey || !this.badges) return;
    this._badgeKey = key;
    this.badges.classList.toggle('hidden', !on);
    if (!on) return;
    const b = ['<span>😈 EL DIABLO · K: aliento · N: bola de fuego</span>'];
    if (L.invisible) b.push('<span>👻 INVISIBLE</span>');
    if (L.immortal) b.push('<span>☠ INMORTAL</span>');
    this.badges.innerHTML = b.join('');
  }

  // rugido del fuego (lo llama el gancho de ambiente del audio)
  sound(sfx) { this.breath.sound(sfx, G.myId); }
}
