import * as THREE from 'three';

// A timer yields even in a background tab, unlike requestAnimationFrame.
export const yieldToBrowser = () => new Promise(resolve => setTimeout(resolve, 0));

export async function prepareScene(renderer, scene, camera, onProgress = () => {}) {
  const objects = [], textures = new Set();
  scene.traverse(object => {
    if (!(object.isMesh || object.isPoints || object.isLine || object.isSprite)) return;
    objects.push(object);
    for (const material of [].concat(object.material || [])) {
      for (const value of Object.values(material)) if (value?.isTexture && !value.isRenderTargetTexture) textures.add(value);
      for (const uniforms of [material.uniforms, material.userData?.u, material.userData?.surface]) {
        for (const uniform of Object.values(uniforms || {})) if (uniform.value?.isTexture && !uniform.value.isRenderTargetTexture) textures.add(uniform.value);
      }
    }
  });
  // Uploads are synchronous WebGL calls. Spread them across browser tasks;
  // source-sharing still lets Three reuse uploads for different UV repeats.
  let tick = performance.now();
  for (const texture of textures) {
    if (texture.image) renderer.initTexture(texture);
    if (performance.now() - tick >= 8) { await yieldToBrowser(); tick = performance.now(); }
  }
  // compileAsync traverses hidden objects too. Use small visitor batches with
  // the real scene's lights/environment, without reparenting game objects.
  const batch = new THREE.Group();
  const pending = new Set();
  let done = 0;
  try {
    for (let i = 0; i < objects.length; i += 12) {
      batch.children = objects.slice(i, i + 12);
      const count = batch.children.length;
      // Keep a bounded pipeline instead of waiting for each shader batch in
      // sequence. compileAsync submits synchronously, then polls GPU readiness.
      const job = renderer.compileAsync(batch, camera, scene).then(() => {
        done += count;
        onProgress(done, objects.length);
      });
      pending.add(job);
      job.then(() => pending.delete(job), () => {});
      await yieldToBrowser();
      if (pending.size >= 4) await Promise.race(pending);
    }
    await Promise.all(pending);
  } finally { batch.children = []; }
}
