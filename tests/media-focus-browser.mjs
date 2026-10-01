import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('/tmp/browser-qa/node_modules/playwright');
for (const [file, pattern] of [
  ['public/js/game/player.js', /^  (release\(|giveItem\(|_claimHit\(|grab\(|ignite\()/],
  ['public/js/game/npc.js', /tag\(|receiveHit|hitClaim|ignite\(|burnT|kind: 'remote'|^  punch\(/],
  ['server/room.js', /case 'pn'|spawnProp\(|PROP_TYPES|propTypes/],
  ['public/js/shared/mapdata.js', /fogon|fogón|campfire|marsh/i],
]) {
  const lines=fs.readFileSync(file,'utf8').split(/\r?\n/), marked=new Set();
  for(let i=0;i<lines.length;i++) if(pattern.test(lines[i])) for(let j=Math.max(0,i-2);j<Math.min(lines.length,i+55);j++) marked.add(j);
  console.log('SOURCE',file,[...marked].map(i=>`${i+1}: ${lines[i]}`).join('\n'));
}
const port = 31992, origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: String(port) }, stdio: 'pipe' });
let output = ''; server.stdout.on('data', d => output += d); server.stderr.on('data', d => output += d);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let browser;
try {
  for (let n = 0;; n++) { try { if ((await fetch(origin)).ok) break; } catch {} if (n > 100) throw Error(output); await sleep(100); }
  browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const html = fs.readFileSync('public/index.html', 'utf8').replace(/<script\b[^>]*type=["']module["'][^>]*>[\s\S]*?<\/script>/gi, '');
  await page.route('**/__media_probe', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto(origin + '/__media_probe');
  await page.evaluate(async () => {
    for (const el of document.body.children) if (el.id !== 'media') el.classList.add('hidden');
    document.querySelector('#media').classList.remove('hidden');
    const THREE = await import('three');
    const { YouTubeScreenManager } = await import('/js/media/screens.js');
    const { enhanceMedia } = await import('/js/ui/social.js');
    window.manager = new YouTubeScreenManager({ scene: new THREE.Scene(), net: { now: () => Date.now(), send() {} }, opts: { vol: .8, volMusic: .7 } });
    window.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, .01, 1000); camera.position.set(0, 2, 0);
    enhanceMedia({ getState: () => ({ cur: null }), getNow: () => Date.now(), send() {}, getScreen: () => manager.focused });
    window.probe = id => {
      manager.focus(id, document.querySelector('#media-view'));
      manager.update(camera, { x: 0, y: 0, z: 0 }, { active: true });
      const e = manager.screens.get(id), slot = document.querySelector('#media-view').getBoundingClientRect(), surface = e.object.element.getBoundingClientRect();
      const center = document.elementFromPoint(slot.x + slot.width / 2, slot.y + slot.height / 2);
      return { id, slot: { x: slot.x, y: slot.y, w: slot.width, h: slot.height }, surface: { x: surface.x, y: surface.y, w: surface.width, h: surface.height }, inside: !!center?.closest('.yt-surface') };
    };
  });
  const ids = await page.evaluate(() => [...manager.screens.keys()]), results=[];
  for (const id of ids) results.push(await page.evaluate(id => probe(id), id));
  console.log('MEDIA_LAYOUT', JSON.stringify(results));
  const variants=await page.evaluate(()=>{
    const e=manager.screens.get('fogon'), variants=[];
    probe('fogon');
    const check=name=>{const r=document.querySelector('#media-view').getBoundingClientRect();variants.push({name,inside:!!document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('.yt-surface')});};
    check('baseline');
    e.object.element.style.backfaceVisibility='visible';check('backface-visible');e.object.element.style.backfaceVisibility='hidden';
    const view=e.layer.firstElementChild;view.style.transformStyle='preserve-3d';check('view-preserve3d');view.style.transformStyle='';
    e.layer.style.clipPath='none';check('no-clip');e.layer.style.clipPath='inset(0px)';
    e.layer.style.isolation='auto';check('no-isolation');e.layer.style.isolation='isolate';
    return variants;
  });
  console.log('CSS3D_VARIANTS',JSON.stringify(variants));
  fs.mkdirSync('/tmp/media-qa', { recursive: true });
  await page.screenshot({ path: '/tmp/media-qa/focused-fogon.png' });
  for (const result of results) {
    assert.ok(result.inside, `Focused ${result.id} surface is not painted at the video slot center: ${JSON.stringify(result)}`);
    assert.ok(Math.abs(result.surface.x - result.slot.x) < 3 && Math.abs(result.surface.y - result.slot.y) < 3, `Focused ${result.id} is displaced from its slot`);
  }
  assert.deepEqual(errors, []);
  console.log('PASS focused video surfaces visible and centered for every screen');
} finally { await browser?.close(); server.kill('SIGTERM'); }
