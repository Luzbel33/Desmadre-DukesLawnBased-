// Qué hay para hacer: marcadores flotantes en el mundo (se ven de lejos; las paredes los tapan)
// y un panel con la lista (tecla J) para marcar un destino.
import * as THREE from 'three';

export const ACTIVITIES = [
  { id: 'poker', icon: '🃏', name: 'Póker', where: 'Bar El Cortacésped', p: [106, 3.3, -26.5], how: 'Acercate a una silla de la mesa y apretá X. Texas Hold\'em con fichas.' },
  { id: 'bar', icon: '🍺', name: 'Bar El Cortacésped', where: 'Pueblo (este)', p: [94.2, 5.6, -31], how: 'Barra (X = trago), rockola, ring de piñas (zona PvP), botiquín, bong.' },
  { id: 'rockola', icon: '🎵', name: 'Rockola', where: 'Bar, al fondo', p: [99.6, 2.4, -21], how: 'X frente a la rockola o P: poné música o videos de YouTube para todos.' },
  { id: 'ring', icon: '🥊', name: 'Ring', where: 'Bar', p: [117.5, 3.2, -31], how: 'Zona PvP: click corto piña, sostenido mueve el brazo, los dos clicks guardia, F patada, R cabezazo. Armas en el estante, bolsa de boxeo para practicar, botiquín en la pared.' },
  { id: 'cine', icon: '🎬', name: 'Cine Gran Duque', where: 'Pueblo (este)', p: [94.2, 6.6, 2], how: 'X en la cabina o P para elegir película/video. Agarrá pochoclos (E/Q) y sentate con X: click para comer o revolear.' },
  { id: 'graffiti', icon: '🎨', name: 'Callejón del Aerosol', where: 'Entre el bar y el cine', p: [109, 4.5, -16], how: '3 = aerosol, click sostenido pinta, B colores, rueda tamaño. Se puede pintar cualquier pared.' },
  { id: 'futbol', icon: '⚽', name: 'Cancha de fútbol', where: 'El Gran Pasto', p: [0, 4.5, 35], how: 'X en el cartel del costado arranca un partido de 5 min. F patea, corré contra la pelota para llevarla.' },
  { id: 'cortadoras', icon: '🚜', name: 'Cortadoras y tractor', where: 'Galpón (oeste)', p: [-80, 3.2, -13], how: 'X para subir y bajar, W/S acelerar, Espacio prende las cuchillas: cortá cualquier pasto del mapa (deja franjas).' },
  { id: 'saltos', icon: '🏁', name: 'Pista de saltos', where: 'Oeste, pasando el galpón', p: [-108, 4, 38], how: 'Rampas para volar con la cortadora, el tractor o el carrito.' },
  { id: 'terraza', icon: '🥩', name: 'Terraza del Duque', where: 'Frente a la mansión', p: [0, 3.8, -82], how: 'Parrilla (X = choripán, cura), heladerita (X = birra), botiquín, bong y sillones.' },
  { id: 'fogon', icon: '🔥', name: 'Fogón', where: 'Explanada de la mansión', p: [-28, 2.8, -65], how: 'Para charlar alrededor del fuego (voz por cercanía: V o M).' },
  { id: 'autocine', icon: '🎥', name: 'Autocine', where: 'Sur del Gran Pasto', p: [0, 15.5, 71.6], how: 'X en el poste del parlante para elegir el video de la pantalla gigante.' },
];

function labelTexture(icon, text) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 128;
  const c = cv.getContext('2d');
  c.font = 'bold 44px system-ui, Segoe UI, Arial';
  const w = Math.min(500, c.measureText(text).width + 120);
  const x0 = (512 - w) / 2;
  c.fillStyle = 'rgba(12,14,18,0.78)';
  c.beginPath();
  c.roundRect(x0, 18, w, 84, 40);
  c.fill();
  c.strokeStyle = 'rgba(255,210,60,0.9)';
  c.lineWidth = 4;
  c.stroke();
  c.font = '48px Segoe UI Emoji, Apple Color Emoji, sans-serif';
  c.fillText(icon, x0 + 22, 78);
  c.font = 'bold 40px system-ui, Segoe UI, Arial';
  c.fillStyle = '#ffffff';
  c.fillText(text, x0 + 88, 74);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class ActivityMarkers {
  constructor(scene) {
    this.items = [];
    this.target = null; // actividad marcada como destino
    for (const a of ACTIVITIES) {
      const mat = new THREE.SpriteMaterial({ map: labelTexture(a.icon, a.name), depthTest: false, depthWrite: false, transparent: true });
      const s = new THREE.Sprite(mat);
      s.position.set(a.p[0], a.p[1], a.p[2]);
      s.renderOrder = 20;
      scene.add(s);
      this.items.push({ a, s });
    }
    // columna de luz sobre el destino marcado
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd23b, transparent: true, opacity: 0.35, depthWrite: false });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 60, 12, 1, true), beamMat);
    this.beam.visible = false;
    scene.add(this.beam);
  }

  // id null = sacar el destino; force = marcarlo aunque ya esté marcado (si no, tocar de nuevo lo desmarca)
  setTarget(id, force = false) {
    this.target = force ? id : this.target === id ? null : id;
    const it = this.items.find((x) => x.a.id === this.target);
    this.beam.visible = !!it;
    if (it) this.beam.position.set(it.a.p[0], 30, it.a.p[2]);
  }

  // raycast: (ox,oy,oz, dx,dy,dz, dist) -> { dist } | null contra paredes/techos (opcional)
  update(camera, enabled = true, raycast = null) {
    const cp = camera.position;
    const now = performance.now();
    // la columna de luz se apaga cuando llegaste (de cerca solo estorba)
    if (this.beam.visible) {
      const bd = Math.hypot(cp.x - this.beam.position.x, cp.z - this.beam.position.z);
      this.beam.material.opacity = 0.35 * Math.max(0, Math.min(1, (bd - 3) / 7));
    }
    this._rr = (this._rr || 0) + 1;
    for (let n = 0; n < this.items.length; n++) {
      const it = this.items[n];
      const { a, s } = it;
      const dx = a.p[0] - cp.x, dy = a.p[1] - cp.y, dz = a.p[2] - cp.z;
      const d = Math.hypot(dx, dy, dz);
      const marked = this.target === a.id;
      // detrás de una pared no se ve (antes atravesaban el bar); se chequea de a uno por cuadro
      if (raycast && (n + this._rr) % 4 === 0 && (!it.t || now - it.t > 90)) {
        it.t = now;
        const hit = d > 0.5 ? raycast(cp.x, cp.y, cp.z, dx / d, dy / d, dz / d, d) : null;
        it.hidden = !!hit && hit.dist < d - 0.6;
      }
      // de cerca no molesta; de lejos se achica y se apaga (el destino marcado se ve siempre, salvo encima)
      let op = marked ? (d < 7 ? 0 : d < 12 ? (d - 7) / 5 : 1) : d < 9 ? 0 : d < 16 ? (d - 9) / 7 : d > 170 ? 0 : d > 130 ? (170 - d) / 40 : 1;
      if (!enabled) op = 0;
      it.vis = (it.vis ?? 1) + ((it.hidden && !marked ? 0 : 1) - (it.vis ?? 1)) * 0.25;
      op *= it.vis;
      s.visible = op > 0.01;
      s.material.opacity = op * (marked ? 1 : 0.85);
      const k = Math.max(0.9, Math.min(4.5, d * 0.045));
      s.scale.set(k * 4, k, 1);
    }
  }
}
