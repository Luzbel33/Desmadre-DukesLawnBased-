// Copia las librerías del cliente (three.js + addons + Rapier) desde node_modules a public/vendor.
// Solo hace falta correrlo si actualizás versiones: los archivos ya quedan commiteados en public/vendor.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nm = path.join(root, 'node_modules');
const out = path.join(root, 'public', 'vendor');

function copy(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}
function copyDir(src, dst) {
  for (const f of fs.readdirSync(src)) {
    const s = path.join(src, f);
    if (fs.statSync(s).isDirectory()) copyDir(s, path.join(dst, f));
    else copy(s, path.join(dst, f));
  }
}

fs.rmSync(out, { recursive: true, force: true });
const three = path.join(nm, 'three');
copy(path.join(three, 'build', 'three.module.js'), path.join(out, 'three', 'three.module.js'));
copy(path.join(three, 'build', 'three.core.js'), path.join(out, 'three', 'three.core.js'));
copy(path.join(three, 'LICENSE'), path.join(out, 'three', 'LICENSE'));
const jsm = path.join(three, 'examples', 'jsm');
copyDir(path.join(jsm, 'postprocessing'), path.join(out, 'three', 'addons', 'postprocessing'));
copyDir(path.join(jsm, 'shaders'), path.join(out, 'three', 'addons', 'shaders'));
copy(path.join(jsm, 'renderers', 'CSS3DRenderer.js'), path.join(out, 'three', 'addons', 'renderers', 'CSS3DRenderer.js'));
copy(path.join(jsm, 'objects', 'Sky.js'), path.join(out, 'three', 'addons', 'objects', 'Sky.js'));
copy(path.join(jsm, 'utils', 'BufferGeometryUtils.js'), path.join(out, 'three', 'addons', 'utils', 'BufferGeometryUtils.js'));
copy(path.join(jsm, 'utils', 'SkeletonUtils.js'), path.join(out, 'three', 'addons', 'utils', 'SkeletonUtils.js'));
copy(path.join(jsm, 'loaders', 'GLTFLoader.js'), path.join(out, 'three', 'addons', 'loaders', 'GLTFLoader.js'));

const rapier = path.join(nm, '@dimforge', 'rapier3d-compat');
copy(path.join(rapier, 'dist', 'rapier.mjs'), path.join(out, 'rapier', 'rapier.mjs'));
copy(path.join(rapier, 'LICENSE'), path.join(out, 'rapier', 'LICENSE'));

console.log('vendor listo en', out);
