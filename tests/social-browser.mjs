// Run with Playwright installed in /tmp/browser-qa (CI) or locally as a dev tool.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/tmp/browser-qa/node_modules/playwright')); }
const port = 31991, origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = ''; server.stdout.on('data', d => serverLog += d); server.stderr.on('data', d => serverLog += d);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser;
try {
  for (let i = 0; ; i++) { try { if ((await fetch(origin)).ok) break; } catch {} if (i > 100) throw new Error(serverLog); await sleep(100); }
  browser = await chromium.launch({ headless: true, ignoreDefaultArgs: ['--mute-audio'], args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['microphone'] });
  const pageErrors = [];


  // Render the real HTML/CSS, without starting the 3D world a second time.
  const html = fs.readFileSync('public/index.html', 'utf8').replace(/<script\b[^>]*type=["']module["'][^>]*>[\s\S]*?<\/script>/gi, '');
  const ui = await context.newPage(); ui.on('pageerror', error => pageErrors.push(error.message));
  await ui.route('**/__social_qa', route => route.fulfill({ contentType: 'text/html', body: html }));
  await ui.goto(origin + '/__social_qa');
  await ui.evaluate(async () => {
    const { SocialPanel, setupMaskPicker, enhanceMedia } = await import('/js/ui/social.js');
    for (const el of [...document.body.children]) if (el.id && !['chat', 'media'].includes(el.id)) el.classList.add('hidden');
    document.querySelector('#chat').classList.remove('hidden'); document.querySelector('#chat').classList.add('open');
    window.players = new Map([[2, { id: 2, name: 'Ana' }], [3, { id: 3, name: 'Beto' }], [4, { id: 4, name: 'Ciro' }]]);
    window.audience = null;
    window.panel = new SocialPanel({ getPlayers: () => players, getMyId: () => 1, getVoice: () => ({ setRecipients(ids) { window.audience = ids; } }), onClose() {} });
    panel.begin('qa', 'Browser QA');
    for (let i = 0; i < 120; i++) panel.receive({ m: 'Message ' + i, mid: 'test:' + i, name: 'Ana', ts: Date.now() });
    window.look = { model: 'eric' }; setupMaskPicker(look);
    window.mediaState = { cur: { v: 'test', playId: 'instance1', start: Date.now() - 20000, d: 100, pos: 20, paused: false } };
    window.mediaCommands = [];
    enhanceMedia({ getState: () => mediaState, getNow: () => Date.now(), send: m => mediaCommands.push(m), getScreen: () => 'cine' });
  });
  assert.equal(await ui.locator('#chat-log .msg').count(), 120);
  await ui.evaluate(() => { panel.log.scrollTop = 0; panel.receive({ m: 'new while reading', mid: 'new' }); });
  assert.equal(await ui.evaluate(() => panel.log.scrollTop), 0, 'new messages moved the reader away from history');
  assert.ok(await ui.locator('#chat-new').isVisible());
  await ui.locator('#chat-text-mode').selectOption('private');
  await ui.locator('#chat-voice-mode').selectOption('private');
  assert.deepEqual(await ui.evaluate(() => panel.recipients()), []);
  await ui.locator('.chat-roster input[value="2"]').check();
  await ui.locator('.chat-roster input[value="3"]').check();
  assert.deepEqual(await ui.evaluate(() => panel.recipients()), [2, 3]);
  assert.deepEqual(await ui.evaluate(() => audience), [2, 3]);
  await ui.evaluate(() => { players.clear(); panel.renderRoster(); });
  assert.deepEqual(await ui.evaluate(() => audience), [], 'last recipient leaving reopened public audio');
  await ui.evaluate(() => { look.model = 'diablo'; window.importPromise = import('/js/ui/social.js').then(m => m.setupMaskPicker(look)); return importPromise; });
  assert.ok(await ui.locator('#m-mask').isDisabled());
  await ui.evaluate(() => { document.querySelector('#chat').classList.add('hidden'); document.querySelector('#media').classList.remove('hidden'); });
  await ui.waitForFunction(() => !document.querySelector('#media-seek').disabled);
  const size = await ui.locator('#media-view').boundingBox(); assert.ok(Math.abs(size.width / size.height - 16 / 9) < .05);
  await ui.locator('#media-seek').focus(); await ui.keyboard.press('ArrowRight');
  assert.equal(await ui.evaluate(() => mediaCommands.at(-1)?.a), 'seek');
  await ui.setViewportSize({ width: 390, height: 844 });
  const bounds = await ui.locator('#media').boundingBox(); assert.ok(bounds.width <= 390 && bounds.x >= -1 && bounds.x + bounds.width <= 391, 'YouTube panel overflow on small viewport');
  console.log('PASS chat history, scroll preservation, multi-recipient controls, demon exclusion, YouTube seek and responsive sizing');
  await ui.close();

  const rtc = await context.newPage();
  await rtc.route('**/__rtc_qa', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>WebRTC regression</title>' }));
  await rtc.goto(origin + '/__rtc_qa');
  const result = await rtc.evaluate(async () => {
    const { VoiceChat } = await import('/js/audio/voice.js');
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const ctx = new AudioContext(); await ctx.resume();
    const voices = new Map();
    for (const id of [1, 2, 3, 4]) voices.set(id, new VoiceChat({ net: { id, send(m) { queueMicrotask(() => void voices.get(m.to)?.onSignal(id, m.d)); } }, opts: { voiceMode: 'open' }, getCtx: () => ctx }));
    const sender = voices.get(1);
    if (!await sender.enableMic()) throw new Error('Browser microphone permission failed: ' + sender.error);
    if (sender.track.readyState !== 'live') throw new Error('getUserMedia returned no live microphone');
    sender.disableMic(); if (sender.track.enabled) throw new Error('Microphone did not mute');
    const osc = ctx.createOscillator(), tone = ctx.createMediaStreamDestination(); osc.frequency.value = 360; osc.connect(tone); osc.start();
    const capture = sender.stream;
    sender.track = tone.stream.getAudioTracks()[0]; sender.stream = tone.stream; sender.enabled = true;
    capture.getTracks().forEach(t => t.stop()); sender.setRecipients([2, 3]);
    for (const id of [2, 3, 4]) sender._peer(id, true);
    // This app routes decoded audio through Web Audio while muting its duplicate
    // HTMLAudioElement. Chromium's inbound totalAudioEnergy stays zero in that path.
    // Measure actual decoded PCM at the game's analyser, not that playback counter.
    const measured = new Map();
    const energy = async id => {
      const peer = voices.get(id).peers.get(1), samples = new Float32Array(512);
      peer?.nodes?.analyser.getFloatTimeDomainData(samples);
      const square = samples.reduce((n, x) => n + x * x, 0) / samples.length;
      const sum = (measured.get(id) || 0) + square;
      measured.set(id, sum); return sum;
    };
    let energies;
    for (let i = 0; i < 80; i++) {
      await wait(100); energies = await Promise.all([2, 3, 4].map(energy));
      if (energies[0] > .001 && energies[1] > .001) break;
    }
    if (!(energies[0] > .001 && energies[1] > .001)) throw new Error('Selected peers did not receive decoded audio: ' + energies);
    for (const voice of voices.values()) for (const peer of voice.peers.values()) {
      if (peer.pc.getTransceivers().length !== 1 || peer.pc.getTransceivers()[0].currentDirection !== 'sendrecv') throw new Error('Audio negotiation is not bidirectional');
    }
    if (energies[2] > .000001) throw new Error('Whisper audio leaked to excluded peer: ' + energies);
    sender.setRecipients([]); await wait(350);
    const baseline = await Promise.all([2, 3, 4].map(energy)); await wait(600);
    const after = await Promise.all([2, 3, 4].map(energy));
    if (after.some((n, i) => n - baseline[i] > .00001)) throw new Error('Empty audience continued sending audio');
    sender.setRecipients([4]); await wait(1000);
    if (await energy(4) <= .001) throw new Error('Changing recipient did not resume audio');
    sender.disableMic(); if ([...sender.peers.values()].some(p => p.outboundTrack.enabled)) throw new Error('Mute left an outgoing peer active');
    // The answerer must also be able to speak after the connection was established.
    const answerer = voices.get(2);
    answerer.stream = tone.stream; answerer.track = tone.stream.getAudioTracks()[0]; answerer.enabled = true;
    answerer.setRecipients([1]);
    await Promise.all([...answerer.peers.values()].map(peer => answerer._attachTrack(peer)));
    let reverseRms = 0;
    for (let i = 0; i < 40 && reverseRms < .01; i++) {
      await wait(100); const sample = new Float32Array(512);
      sender.peers.get(2).nodes?.analyser.getFloatTimeDomainData(sample);
      reverseRms = Math.sqrt(sample.reduce((n, x) => n + x*x, 0) / sample.length);
    }
    if (reverseRms < .01) throw new Error('Answerer microphone did not travel back to the offerer');
    console.log('Reverse audio RMS', reverseRms);
    for (const voice of voices.values()) voice.dispose(); osc.stop(); await ctx.close();
    return { incomingAudioEnergy: energies, selected: [2, 3], excluded: 4, capture: 'live', mute: 'passed' };
  });
  console.log('PASS real Chromium WebRTC microphone capture, peer audio and fail-closed privacy', JSON.stringify(result));
// Full-world smoke runs after isolated UI and microphone checks.
  const page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.locator('#m-mask').waitFor({ state: 'visible', timeout: 90000 });
  assert.equal(await page.locator('#m-mask option').count(), 6);
  // Only CI drawing resolution is reduced; game and network logic stay unchanged.
  await page.evaluate(async () => { const { G } = await import('/js/core/G.js'); if (G.renderer) { G.renderer.setPixelRatio(.25); G.renderer.setSize(640, 400, false); G.renderer.shadowMap.enabled = false; } });
  await page.locator('#m-name').fill('Browser QA');
  await page.locator('#m-room').fill('social-qa');
  await page.locator('#m-mask').selectOption('horse');
  assert.ok(await page.locator('#m-play').isVisible());
  assert.ok(await page.locator('#m-play').isEnabled());
  // Boot smoke test does not depend on consecutive GPU animation frames.
  // Normal pointer/keyboard interactions are covered by the independent UI tests.
  await page.locator('#m-play').dispatchEvent('click');
  await page.waitForFunction(async () => { const { G } = await import('/js/core/G.js'); return !!G.me && G.myId > 0; }, null, { timeout: 90000, polling: 100 });
  await page.waitForFunction(async () => { const { G } = await import('/js/core/G.js'); return G.me?.char?.look?.mask === 'horse' && !!G.me.char.mask; }, null, { timeout: 30000, polling: 100 });
  const gameCheck = await page.evaluate(async () => { const { G } = await import('/js/core/G.js'); return { id: G.myId, mask: G.me.char.look.mask, finite: [G.me.pos.x, G.me.pos.y, G.me.pos.z].every(Number.isFinite) }; });
  assert.equal(gameCheck.mask, 'horse'); assert.ok(gameCheck.finite);
  console.log('PASS full game boot, real player join and loaded selected mask', gameCheck);
  await page.close();
  assert.deepEqual(pageErrors, [], 'Unexpected browser runtime errors');
} finally { await browser?.close(); server.kill('SIGTERM'); }
