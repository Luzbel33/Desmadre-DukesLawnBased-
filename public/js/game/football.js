// Fútbol (lado cliente): cancha, arcos, carteles, pelota interpolada y marcador.
// La pelota la simula el servidor (server/football.js) chocando con los cuerpos físicos de todos.
import * as THREE from 'three';
import { G } from '../core/G.js';
import { FIELD as F } from '../shared/mapdata.js';
import { assetModel } from './assets.js';

const R = 0.11;

function lineMat() {
  return new THREE.MeshStandardMaterial({ color: 0xf4f4ee, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
}

function boardTexture(text, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, 1024, 96);
  x.fillStyle = fg; x.font = '900 56px Impact, "Arial Black", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 512, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function netTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.strokeStyle = 'rgba(250,250,245,0.95)';
  x.lineWidth = 3;
  for (let i = 0; i <= 128; i += 16) {
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 128); x.stroke();
    x.beginPath(); x.moveTo(0, i); x.lineTo(128, i); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function ballTexture() {
  // pelota clásica: base blanca con pentágonos negros (proyección aproximada)
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#f6f6f2'; x.fillRect(0, 0, 512, 256);
  x.fillStyle = '#16161a';
  const pent = (cx, cy, r) => {
    x.beginPath();
    for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k / 5) * Math.PI * 2; x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.9); }
    x.closePath(); x.fill();
  };
  for (let row = 0; row < 3; row++) for (let i = 0; i < 6; i++) pent(i * 85 + (row % 2) * 42 + 20, 45 + row * 83, 26);
  x.strokeStyle = 'rgba(40,40,40,0.35)'; x.lineWidth = 2;
  for (let i = 0; i < 12; i++) { x.beginPath(); x.moveTo(i * 43, 0); x.lineTo(i * 43 + 30, 256); x.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class FootballView {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.samples = []; // {t, p:[3], v:[3]}
    this.score = [0, 0];
    this.running = false;
    this.time = 0;
    this._build();
    this.ballPos = new THREE.Vector3(F.cx, R, F.cz);
    this.spin = new THREE.Quaternion();
  }

  _build() {
    const g = this.group;
    const lm = lineMat();
    const y = 0.045;
    const L = (x0, z0, x1, z1, w = 0.1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), lm);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = -Math.atan2(x1 - x0, z1 - z0);
      m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
      m.receiveShadow = true;
      g.add(m);
    };
    const { cx, cz, hx, hz } = F;
    L(cx - hx, cz - hz, cx + hx, cz - hz); L(cx - hx, cz + hz, cx + hx, cz + hz);
    L(cx - hx, cz - hz, cx - hx, cz + hz); L(cx + hx, cz - hz, cx + hx, cz + hz);
    L(cx, cz - hz, cx, cz + hz);
    // círculo central
    const ring = new THREE.Mesh(new THREE.RingGeometry(4.45, 4.55, 64), lm);
    ring.rotation.x = -Math.PI / 2; ring.position.set(cx, y, cz); g.add(ring);
    const spot = new THREE.Mesh(new THREE.CircleGeometry(0.18, 16), lm);
    spot.rotation.x = -Math.PI / 2; spot.position.set(cx, y, cz); g.add(spot);
    // áreas
    for (const s of [-1, 1]) {
      const gx = cx + s * hx;
      const ax = gx - s * 8, bx = gx - s * 3;
      L(ax, cz - 9, ax, cz + 9); L(gx, cz - 9, ax, cz - 9); L(gx, cz + 9, ax, cz + 9);
      L(bx, cz - 5, bx, cz + 5); L(gx, cz - 5, bx, cz - 5); L(gx, cz + 5, bx, cz + 5);
      const pk = new THREE.Mesh(new THREE.CircleGeometry(0.14, 12), lm);
      pk.rotation.x = -Math.PI / 2; pk.position.set(gx - s * 6, y, cz); g.add(pk);
    }
    // arcos
    const post = new THREE.MeshStandardMaterial({ color: 0xf6f6f0, roughness: 0.35, metalness: 0.1 });
    const net = new THREE.MeshStandardMaterial({ map: netTexture(), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 1, color: 0xffffff });
    for (const s of [-1, 1]) {
      const gx = cx + s * hx;
      for (const pz of [cz - F.goalHalfW, cz + F.goalHalfW]) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, F.goalH, 16), post);
        p.position.set(gx, F.goalH / 2, pz); p.castShadow = true; g.add(p);
        const back = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, F.goalH, 8), post);
        back.position.set(gx + s * F.goalDepth, F.goalH / 2, pz); g.add(back);
      }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, F.goalHalfW * 2 + 0.12, 16), post);
      bar.rotation.x = Math.PI / 2; bar.position.set(gx, F.goalH, cz); bar.castShadow = true; g.add(bar);
      const mk = (w, h, px, py, pz, ry, rx = 0) => {
        const geo = new THREE.PlaneGeometry(w, h);
        const uv = geo.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * 4, uv.getY(i) * h * 4);
        const m = new THREE.Mesh(geo, net);
        m.position.set(px, py, pz); m.rotation.set(rx, ry, 0); g.add(m);
      };
      mk(F.goalHalfW * 2, F.goalH, gx + s * F.goalDepth, F.goalH / 2, cz, Math.PI / 2);
      mk(F.goalDepth, F.goalH, gx + s * F.goalDepth / 2, F.goalH / 2, cz - F.goalHalfW, 0);
      mk(F.goalDepth, F.goalH, gx + s * F.goalDepth / 2, F.goalH / 2, cz + F.goalHalfW, 0);
      // techo de la red: plano horizontal (ancho = profundidad en X, alto = ancho del arco en Z)
      mk(F.goalDepth, F.goalHalfW * 2, gx + s * F.goalDepth / 2, F.goalH, cz, 0, -Math.PI / 2);
    }
    // carteles perimetrales
    const texts = [['EL DUQUE F.C.', '#0f3d8a', '#ffd23b'], ['BIRRA DEL DUQUE', '#8a1010', '#fff4d6'], ['CORTÁ EL PASTO', '#1e5a28', '#ffffff'], ['FERNET & DESMADRE', '#151515', '#ff4f6d']];
    let ti = 0;
    const board = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const [t, bg, fg] = texts[ti++ % texts.length];
      const mat = new THREE.MeshStandardMaterial({ map: boardTexture(t, bg, fg), roughness: 0.6 });
      const frame = new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.5 });
      const m = new THREE.Mesh(new THREE.BoxGeometry(len, F.boardH, 0.06), [frame, frame, frame, frame, mat, mat]);
      m.position.set((x0 + x1) / 2, F.boardH / 2, (z0 + z1) / 2);
      m.rotation.y = Math.atan2(z1 - z0, x1 - x0) * -1;
      m.castShadow = true; m.receiveShadow = true;
      g.add(m);
      // colisión física de los carteles
      G.phys?.box(m.position.x, F.boardH / 2, m.position.z, len / 2, F.boardH / 2, 0.05, -Math.atan2(z1 - z0, x1 - x0) + 0, { mat: 'wood' });
    };
    const BX = F.boardX, BZ = F.boardZ, gap = F.gapHalf;
    board(cx - BX, cz - BZ, cx - gap, cz - BZ); board(cx + gap, cz - BZ, cx + BX, cz - BZ);
    board(cx - BX, cz + BZ, cx - gap, cz + BZ); board(cx + gap, cz + BZ, cx + BX, cz + BZ);
    board(cx - BX, cz - BZ, cx - BX, cz + BZ); board(cx + BX, cz - BZ, cx + BX, cz + BZ);
    // banderines
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.5, 8), post);
      pole.position.set(cx + sx * hx, 0.75, cz + sz * hz); g.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.25), new THREE.MeshStandardMaterial({ color: sx < 0 ? 0xc8312b : 0x2a5bd7, side: THREE.DoubleSide }));
      flag.position.set(cx + sx * hx + 0.18, 1.35, cz + sz * hz); g.add(flag);
    }
    // cartel para arrancar el partido
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.9), new THREE.MeshStandardMaterial({ map: boardTexture('⚽ [X] ARRANCAR PARTIDO', '#10321a', '#ffffff'), side: THREE.DoubleSide }));
    sign.position.set(0, 1.35, F.cz - F.boardZ - 0.9);
    g.add(sign);
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 8), post);
    sp.position.set(0, 0.65, F.cz - F.boardZ - 0.9); g.add(sp);
    // pelota
    const model = assetModel('football');
    if (model) {
      // el modelo tiene el origen abajo: lo centramos dentro de un grupo que es el que gira
      model.position.y = -R;
      this.ball = new THREE.Group();
      this.ball.add(model);
    } else {
      this.ball = new THREE.Mesh(new THREE.SphereGeometry(R, 28, 20), new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.45 }));
    }
    this.ball.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.ballPivot = new THREE.Group();
    this.ballPivot.add(this.ball);
    g.add(this.ballPivot);
  }

  applyPacket(B, ts) {
    if (!Array.isArray(B) || B.length < 6) return;
    const s = { t: ts, p: [B[0], B[1], B[2]], v: [B[3], B[4], B[5]] };
    const last = this.samples[this.samples.length - 1];
    if (last && ts <= last.t) return;
    this.samples.push(s);
    if (this.samples.length > 12) this.samples.shift();
    if (B.length >= 7 && B[6] > 4) G.sfx?.trigger('hit-soft', new THREE.Vector3(B[0], B[1], B[2]), Math.min(1, B[6] / 14));
    if (B.length >= 8 && B[7]) G.sfx?.trigger('metal', new THREE.Vector3(B[0], B[1], B[2]), 0.9);
  }

  applyState(st) {
    if (!st) return;
    this.score = st.score || this.score;
    this.running = !!st.running;
    this.time = st.time || 0;
    this.timeAt = performance.now();
  }

  update(dt) {
    const now = (G.net ? G.net.now() : Date.now()) - 90;
    const S = this.samples;
    if (S.length) {
      let a = S[0], b = S[S.length - 1];
      if (now >= b.t) {
        // extrapolación corta con la velocidad
        const e = Math.min(0.12, (now - b.t) / 1000);
        this.ballPos.set(b.p[0] + b.v[0] * e, Math.max(R, b.p[1] + b.v[1] * e), b.p[2] + b.v[2] * e);
      } else {
        for (let i = 0; i < S.length - 1; i++) if (S[i].t <= now && S[i + 1].t >= now) { a = S[i]; b = S[i + 1]; break; }
        if (now <= a.t) this.ballPos.set(a.p[0], a.p[1], a.p[2]);
        else {
          // Hermite con velocidades: movimiento suave
          const T = (b.t - a.t) / 1000, u = (now - a.t) / (b.t - a.t);
          const h00 = 2 * u * u * u - 3 * u * u + 1, h10 = u * u * u - 2 * u * u + u, h01 = -2 * u * u * u + 3 * u * u, h11 = u * u * u - u * u;
          this.ballPos.set(
            h00 * a.p[0] + h10 * T * a.v[0] + h01 * b.p[0] + h11 * T * b.v[0],
            Math.max(R, h00 * a.p[1] + h10 * T * a.v[1] + h01 * b.p[1] + h11 * T * b.v[1]),
            h00 * a.p[2] + h10 * T * a.v[2] + h01 * b.p[2] + h11 * T * b.v[2],
          );
        }
      }
    }
    // rodar
    const prev = this.ballPivot.position.clone();
    this.ballPivot.position.copy(this.ballPos);
    const d = this.ballPos.clone().sub(prev);
    d.y = 0;
    const dist = d.length();
    if (dist > 1e-4 && dist < 3) {
      const axis = new THREE.Vector3(d.z, 0, -d.x).normalize();
      this.spin.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, dist / R));
      this.ball.quaternion.copy(this.spin);
    }
  }

  // tiempo restante mostrado
  clock() {
    if (!this.running) return null;
    const left = Math.max(0, this.time - (performance.now() - (this.timeAt || 0)) / 1000);
    const m = Math.floor(left / 60), s = Math.floor(left % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
}
