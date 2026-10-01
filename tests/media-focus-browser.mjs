// Real Chromium composition, iframe interaction and personal volume regression.
// Run with Playwright installed locally or in /tmp/browser-qa (the CI runner).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/tmp/browser-qa/node_modules/playwright')); }
const port = 31992, origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: String(port) }, stdio: 'pipe' });
let output = ''; server.stdout.on('data', d => output += d); server.stderr.on('data', d => output += d);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let browser;
try {
  for (let n = 0;; n++) { try { if ((await fetch(origin)).ok) break; } catch {} if (n > 100) throw Error(output); await sleep(100); }
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
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
      manager.lastTick = -Infinity;
      manager.update(camera, { x: 0, y: 0, z: 0 }, { active: true });
      const e = manager.screens.get(id), slot = document.querySelector('#media-view').getBoundingClientRect(), surface = e.object.element.getBoundingClientRect();
      const center = document.elementFromPoint(slot.x + slot.width / 2, slot.y + slot.height / 2);
      return { id, slot: { x: slot.x, y: slot.y, w: slot.width, h: slot.height }, surface: { x: surface.x, y: surface.y, w: surface.width, h: surface.height }, inside: !!center?.closest('.yt-surface') };
    };
  });
  const ids = await page.evaluate(() => [...manager.screens.keys()]);
  for (const id of ids) {
    const r = await page.evaluate(id => probe(id), id);
    assert.ok(r.inside, `Focused ${id} is not painted at the slot center: ${JSON.stringify(r)}`);
    assert.ok(Math.abs(r.surface.x - r.slot.x) < 3 && Math.abs(r.surface.y - r.slot.y) < 3, `Focused ${id} is displaced`);
  }
  await page.evaluate(() => {
    const e = manager.screens.get('fogon');
    const frame = document.createElement('iframe'); frame.id = 'fixture-video'; frame.title = 'Video surface regression fixture';
    Object.assign(frame.style, { width: '960px', height: '540px', border: '0' });
    frame.srcdoc = '<body style="margin:0;display:grid;place-items:center;height:100vh;background:linear-gradient(135deg,#263a47,#895c29);color:white;font:28px sans-serif"><div style="text-align:center">FOGÓN · PRUEBA DE SUPERFICIE<br><button style="margin-top:30px;padding:18px;font-size:22px" onclick="this.textContent=\'Pausa recibida\'">Pausar video</button></div></body>';
    e.stage.replaceChildren(frame); window.fixtureFrame = frame;
    e.player = { getPlayerState: () => 1, getCurrentTime: () => 20, getDuration: () => 100, setVolume(v) { window.playerVolume = v; }, loadVideoById() {}, seekTo() {}, pauseVideo() {}, playVideo() {}, destroy() {}, unMute() {} };
    e.ready = true; e.control.attach(e.player); e.control.setState({ cur: { v: 'fixture', playId: 'one', start: Date.now() - 20000, d: 100 } });
    probe('fogon');
  });
  await page.frameLocator('#fixture-video').getByRole('button').click();
  assert.equal(await page.frameLocator('#fixture-video').getByRole('button').textContent(), 'Pausa recibida');
  await page.locator('#media-volume').evaluate(el => { el.value = '25'; });
  await page.locator('#media-volume').dispatchEvent('input');
  await page.evaluate(() => probe('fogon'));
  assert.equal(await page.evaluate(() => playerVolume), 20, 'personal volume was not applied to the actual player adapter');
  await page.locator('#media-mute').click(); await page.evaluate(() => probe('fogon'));
  assert.equal(await page.evaluate(() => playerVolume), 0);
  await page.locator('#media-mute').click(); await page.evaluate(() => probe('fogon'));
  assert.equal(await page.evaluate(() => playerVolume), 20);
  const continuity = await page.evaluate(() => {
    const e = manager.screens.get('fogon');
    manager.focus(null); manager.update(camera, { x: 0, y: 0, z: 0 });
    const restored = e.object.position.toArray().every((n, i) => n === e.def.c[i]) && e.object.rotation.y === e.def.yaw;
    probe('cine'); probe('fogon');
    return { restored, sameFrame: fixtureFrame === e.stage.querySelector('iframe'), count: document.querySelectorAll('#fixture-video').length, stored: localStorage.getItem('dukes.youtube.volume') };
  });
  assert.deepEqual(continuity, { restored: true, sameFrame: true, count: 1, stored: '0.25' });
  fs.mkdirSync('/tmp/media-qa', { recursive: true });
  await page.screenshot({ path: '/tmp/media-qa/focused-fogon.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  const small = await page.evaluate(() => probe('fogon'));
  assert.ok(small.inside && small.slot.x >= 0 && small.slot.x + small.slot.w <= 391);
  await page.locator('#media-volume').scrollIntoViewIfNeeded();
  await page.evaluate(() => probe('fogon'));
  await page.locator('#media-volume').focus(); await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#media-volume').inputValue(), '26');
  await page.screenshot({ path: '/tmp/media-qa/focused-mobile.png' });
  assert.deepEqual(errors, []);
  console.log('PASS every screen painted, clickable persistent iframe, world restoration, personal volume/mute/persistence and mobile keyboard controls');
} finally { await browser?.close(); server.kill('SIGTERM'); }
