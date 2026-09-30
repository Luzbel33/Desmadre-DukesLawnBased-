// Árboles realistas generados con ez-tree (MIT) + impostores para los lejanos (rendimiento).
import * as THREE from 'three';
import { yieldToBrowser } from '../core/startup.js';

const VARIANTS = [
  { preset: 'Oak Large', seed: 1311, h: 13.5 },
  { preset: 'Ash Large', seed: 2417, h: 14.5 },
  { preset: 'Oak Medium', seed: 3529, h: 10.5 },
  { preset: 'Ash Medium', seed: 4631, h: 11.5 },
];
const NEAR = 75; // m: más cerca de esto, malla completa
const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const S = new THREE.Vector3();
const P = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// Materiales PBR propios (los de ez-tree no soportan instancing en el viento de las hojas)
function barkMaterial(src) {
  return new THREE.MeshStandardMaterial({
    map: src.map || null, normalMap: src.normalMap || null, aoMap: src.aoMap || null,
    roughnessMap: src.roughnessMap || null, roughness: 1, color: src.color || new THREE.Color(0xffffff),
  });
}
const LEAF_TIME = { value: 0 };
function leafMaterial(src) {
  const m = new THREE.MeshStandardMaterial({
    map: src.map || null, color: src.color || new THREE.Color(0xffffff), alphaTest: src.alphaTest ?? 0.5,
    side: THREE.DoubleSide, roughness: 0.82, metalness: 0,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = LEAF_TIME;
    sh.vertexShader = 'uniform float uTime;' + String.fromCharCode(10) + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 lw = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        lw = instanceMatrix * lw;
      #endif
      float lph = lw.x * 0.31 + lw.z * 0.23 + lw.y * 0.4;
      float lsway = (sin(uTime * 1.25 + lph) * 0.6 + sin(uTime * 2.9 + lph * 1.7) * 0.25) * 0.05 * (0.4 + uv.y);
      transformed.x += lsway;
      transformed.z += lsway * 0.7;
      transformed.y += lsway * 0.25;`);
  };
  m.customProgramCacheKey = () => 'leaf-instanced';
  return m;
}

function texturesReady(mats) {
  const texs = [];
  for (const m of mats) for (const k of ['map', 'normalMap', 'aoMap', 'roughnessMap']) if (m[k]) texs.push(m[k]);
  return texs.every((t) => t.image && (t.image.complete === undefined || t.image.complete) && (t.image.width || t.image.naturalWidth));
}

async function renderImpostor(renderer, tree, size) {
  // saca una "foto" del árbol de frente (fondo transparente) para usarla de lejos
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdfeaff, 0x3a4a22, 1.6));
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.4);
  sun.position.set(-1, 1.5, 2);
  scene.add(sun);
  const clone = tree.clone();
  scene.add(clone);
  const box = new THREE.Box3().setFromObject(clone);
  const s = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  const half = Math.max(s.x, s.y, s.z) / 2;
  const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, half * 6);
  cam.position.set(c.x, c.y, c.z + half * 3);
  cam.lookAt(c);
  const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
  const prevRT = renderer.getRenderTarget();
  const prevClear = renderer.getClearAlpha();
  const prevTone = renderer.toneMapping;
  // Wait for shader linking before the first draw; never force a driver wait.
  renderer.setRenderTarget(rt);
  try { await renderer.compileAsync(scene, cam); } finally { renderer.setRenderTarget(prevRT); }
  await yieldToBrowser();
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, cam);
  renderer.setRenderTarget(prevRT);
  renderer.setClearAlpha(prevClear);
  renderer.toneMapping = prevTone;
  rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
  return { tex: rt.texture, width: half * 2, height: half * 2, center: c, bottom: c.y - half };
}

export class Forest {
  // Crea el bosque cuando las texturas de ez-tree terminaron de cargar
  static async create(scene, renderer, points) {
    // import diferido: ez-tree carga sus texturas al importarse (necesita navegador)
    const { Tree } = await import('../../vendor/ez-tree/ez-tree.es.js');
    const trees = [];
    for (const def of VARIANTS) {
      await yieldToBrowser();
      const t = new Tree();
      t.loadPreset(def.preset);
      t.options.seed = def.seed;
      t.generate();
      trees.push(t);
    }
    const t0 = performance.now();
    while (!texturesReady(trees.flatMap((t) => [t.branchesMesh.material, t.leavesMesh.material])) && performance.now() - t0 < 5000) {
      await new Promise((r) => setTimeout(r, 50));
    }
    const forest = new Forest(scene, points);
    await forest.prepare(renderer, trees);
    return forest;
  }

  constructor(scene, points) {
    this.scene = scene;
    this.points = points;
    this.variants = [];
    this.timer = 0;
  }

  async prepare(renderer, trees) {
    const scene = this.scene, points = this.points;
    for (let v = 0; v < VARIANTS.length; v++) {
      const def = VARIANTS[v];
      const t = trees[v];
      t.branchesMesh.material = barkMaterial(t.branchesMesh.material);
      t.leavesMesh.material = leafMaterial(t.leavesMesh.material);
      t.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(t);
      const k = def.h / Math.max(0.01, box.max.y - box.min.y);
      t.scale.setScalar(k);
      t.updateMatrixWorld(true);
      const pts = points.filter((p) => p.v % VARIANTS.length === v);
      const cap = Math.max(1, pts.length);
      const branches = new THREE.InstancedMesh(t.branchesMesh.geometry, t.branchesMesh.material, cap);
      const leaves = new THREE.InstancedMesh(t.leavesMesh.geometry, t.leavesMesh.material, cap);
      for (const im of [branches, leaves]) {
        im.castShadow = true;
        im.receiveShadow = true;
        im.frustumCulled = false;
        im.count = 0;
        im.userData.static = true; // entran en la sombra lejana horneada
        scene.add(im);
      }
      // impostor: dos planos cruzados con la foto del árbol
      const imp = await renderImpostor(renderer, t, 512);
      const pg = new THREE.PlaneGeometry(imp.width, imp.height);
      pg.translate(0, imp.height / 2, 0);
      const g2 = pg.clone();
      g2.rotateY(Math.PI / 2);
      const cross = mergePlanes(pg, g2);
      const impMat = new THREE.MeshBasicMaterial({ map: imp.tex, alphaTest: 0.45, side: THREE.DoubleSide, color: 0xc8c8c8 });
      const far = new THREE.InstancedMesh(cross, impMat, cap);
      far.count = 0;
      far.frustumCulled = false;
      far.castShadow = false;
      far.receiveShadow = false;
      scene.add(far);
      pg.dispose(); g2.dispose();
      await yieldToBrowser();
      this.variants.push({ tree: t, scale: k, pts, branches, leaves, far, impBottom: imp.bottom });
    }
    this.update(new THREE.Vector3(0, 0, -60), 0, true);
  }

  // Todos los árboles con malla completa (para hornear la sombra lejana) o de vuelta a lo normal
  showAll(on) {
    if (!on) { this.update(this._cam || new THREE.Vector3(0, 0, -60), LEAF_TIME.value, true); return; }
    for (const v of this.variants) {
      let n = 0;
      for (const p of v.pts) {
        Q.setFromAxisAngle(UP, p.rot);
        const s = p.s * v.scale;
        S.set(s, s * (0.92 + (p.rot % 0.16)), s);
        M.compose(P.set(p.x, 0, p.z), Q, S);
        v.branches.setMatrixAt(n, M);
        v.leaves.setMatrixAt(n, M);
        n++;
      }
      v.branches.count = n;
      v.leaves.count = n;
      v.far.count = 0;
      v.branches.instanceMatrix.needsUpdate = true;
      v.leaves.instanceMatrix.needsUpdate = true;
    }
  }

  // Reparte cada árbol entre malla completa (cerca) e impostor (lejos)
  update(cam, time, force = false) {
    LEAF_TIME.value = time;
    this._cam = (this._cam || new THREE.Vector3()).copy(cam);
    this.timer -= 1;
    if (!force && this.timer > 0) return;
    this.timer = 20; // cada ~20 frames
    for (const v of this.variants) {
      let n = 0, f = 0;
      for (const p of v.pts) {
        const d = Math.hypot(p.x - cam.x, p.z - cam.z);
        Q.setFromAxisAngle(UP, p.rot);
        const s = p.s * v.scale;
        if (d < NEAR) {
          S.set(s, s * (0.92 + (p.rot % 0.16)), s);
          M.compose(P.set(p.x, 0, p.z), Q, S);
          v.branches.setMatrixAt(n, M);
          v.leaves.setMatrixAt(n, M);
          n++;
        } else {
          // el impostor mira siempre hacia la cámara de costado (cruz), con la escala del árbol
          const k = p.s;
          S.set(k, k, k);
          Q.setFromAxisAngle(UP, Math.atan2(cam.x - p.x, cam.z - p.z));
          M.compose(P.set(p.x, v.impBottom * p.s, p.z), Q, S);
          v.far.setMatrixAt(f, M);
          f++;
        }
      }
      v.branches.count = n;
      v.leaves.count = n;
      v.far.count = f;
      v.branches.instanceMatrix.needsUpdate = true;
      v.leaves.instanceMatrix.needsUpdate = true;
      v.far.instanceMatrix.needsUpdate = true;
    }
  }
}

function mergePlanes(a, b) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(a.attributes.position.count * 3 + b.attributes.position.count * 3);
  pos.set(a.attributes.position.array, 0);
  pos.set(b.attributes.position.array, a.attributes.position.count * 3);
  const uv = new Float32Array(a.attributes.uv.count * 2 + b.attributes.uv.count * 2);
  uv.set(a.attributes.uv.array, 0);
  uv.set(b.attributes.uv.array, a.attributes.uv.count * 2);
  const nor = new Float32Array(pos.length);
  for (let i = 0; i < nor.length; i += 3) { nor[i] = 0; nor[i + 1] = 1; nor[i + 2] = 0; }
  const idx = [...a.index.array, ...Array.from(b.index.array, (x) => x + a.attributes.position.count)];
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}
