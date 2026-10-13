// Ilusiones ópticas de La Mente (sala psicodélica): todo propio, dibujado o calculado acá, sin imágenes de nadie.
// - Serpientes rotantes (al estilo de Kitaoka): una imagen QUIETA que parece girar cuando la mirás de reojo; la deriva
//   la hace el orden de luminancias (negro, azul, blanco, amarillo) de cada gajo.
// - El "lilac chaser": doce manchas lilas en ronda y una que falta, dando vueltas; mirando la cruz del medio aparece
//   una mancha verde que no existe y las lilas se borran.
// - El triángulo de Penrose: tres barras rectas que solo cierran un triángulo desde un punto de vista. Acá el triángulo
//   siempre se acomoda para mirarte con ese punto (gira despacito en su plano): desde donde lo mires es imposible.
import * as THREE from 'three';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

export function snakesTexture(seed = 0) {
  const S = 1024, cv = canvas(S, S), g = cv.getContext('2d');
  g.fillStyle = '#1a6a2a'; g.fillRect(0, 0, S, S);
  const cols = ['#000000', '#1c3cff', '#ffffff', '#ffe600'];
  const disc = (cx, cy, R, dir) => {
    const rings = 5;
    for (let r = rings; r >= 1; r--) {
      const r0 = (R * (r - 1)) / rings, r1 = (R * r) / rings, seg = 6 + r * 2, d = ((r + dir) % 2) ? 1 : -1;
      for (let k = 0; k < seg; k++) {
        const a0 = (k / seg) * Math.PI * 2 + r * 0.37 + seed;
        for (let q = 0; q < 4; q++) {
          const qa = a0 + (d > 0 ? q : 3 - q) * (Math.PI * 2 / seg / 4);
          g.fillStyle = cols[q];
          g.beginPath(); g.arc(cx, cy, r1, qa, qa + Math.PI * 2 / seg / 4 + 0.004); g.arc(cx, cy, r0, qa + Math.PI * 2 / seg / 4 + 0.004, qa, true); g.closePath(); g.fill();
        }
      }
    }
  };
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) disc(170 + i * 342, 170 + j * 342, 165, (i + j) % 2);
  // discos chicos en los huecos
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) disc(341 + i * 342, 341 + j * 342, 70, (i + j + 1) % 2);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export function lilacMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 } },
    toneMapped: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */ `
      uniform float uT; varying vec2 vUv;
      void main(){
        vec2 p = vUv - 0.5;
        vec3 col = vec3(0.5);
        float miss = mod(floor(uT * 8.0), 12.0);
        for (int i = 0; i < 12; i++) {
          if (float(i) == miss) continue;
          float a = float(i) / 12.0 * 6.2832;
          vec2 c = vec2(cos(a), sin(a)) * 0.33;
          float d = length(p - c);
          col = mix(col, vec3(0.85, 0.3, 0.85), exp(-d * d / 0.0022));
        }
        float cross = step(abs(p.x), 0.004) * step(abs(p.y), 0.03) + step(abs(p.y), 0.004) * step(abs(p.x), 0.03);
        col = mix(col, vec3(0.0), clamp(cross, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// devuelve el grupo y una función por cuadro (cam: la cámara)
export function penrose({ L = 1.5, t = 0.26 } = {}) {
  const root = new THREE.Group(), inner = new THREE.Group();
  root.add(inner);
  const c = (hex) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(1.25), toneMapped: false });
  // una cara por eje: así se ve el triángulo clásico de tres tonos (las caras ± del mismo eje van del mismo color)
  const mats = [c(0xff3ac8), c(0xff3ac8), c(0x30e8ff), c(0x30e8ff), c(0xb8ff3a), c(0xb8ff3a)];
  const bar = (x, y, z, sx, sy, sz) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mats); m.position.set(x, y, z); inner.add(m); return m; };
  // A: a lo largo de x desde el origen, B: a lo largo de y, C: a lo largo de z (su punta cae sobre el origen visto en
  // diagonal (1,1,1))
  bar(L / 2, 0, 0, L + t, t, t);
  bar(L, L / 2, 0, t, L + t, t);
  bar(L, L, L / 2, t, t, L);
  // la esquina de A en el origen se dibuja encima de la punta de C (eso "cierra" el triángulo imposible)
  const corner = bar(0, 0, 0, t, t, t);
  corner.material = mats.map((m) => { const k = m.clone(); k.depthTest = false; return k; });
  corner.renderOrder = 5;
  // centrar: el baricentro del triángulo que se ve
  inner.position.set(-(2 * L) / 3, -L / 3, 0);
  const pivot = new THREE.Group(); // la diagonal (1,1,1) del triángulo pasa a ser el eje +Z de este grupo
  root.remove(inner); pivot.add(inner); root.add(pivot);
  const toZ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 1, 1).normalize(), new THREE.Vector3(0, 0, 1));
  pivot.quaternion.copy(toZ);
  // el baricentro proyectado: corrida a lo largo de la diagonal no importa; se corrige en el plano
  const spin = new THREE.Group(); root.remove(pivot); spin.add(pivot); root.add(spin);
  const look = new THREE.Object3D();
  const step = (time, cam) => {
    if (!cam) return;
    root.updateWorldMatrix(true, false);
    look.position.setFromMatrixPosition(root.matrixWorld);
    look.lookAt(cam.position);
    root.quaternion.copy(look.quaternion);
    spin.rotation.z = time * 0.18;
  };
  return { group: root, step };
}
