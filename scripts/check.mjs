// Cross-platform syntax check. No shell glob or extra dependency required.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : /\.(?:js|mjs)$/.test(file) ? [file] : [];
  });
}
let failed = 0;
const files = ['public/js', 'server', 'scripts', 'tests'].flatMap(dir => walk(path.join(root, dir)));
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed++;
    console.error(path.relative(root, file), result.stderr || result.error?.message || 'Check failed');
  }
}
console.log(`${files.length} módulos comprobados. Errores de sintaxis: ${failed}.`);
process.exitCode = failed ? 1 : 0;
