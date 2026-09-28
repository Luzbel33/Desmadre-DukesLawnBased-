// DESMADRE — cliente jugable integrado.
import * as THREE from 'three';
import { G, clamp } from './core/G.js';
import { Physics, GR, groups } from './core/physics.js';
import { Input } from './core/input.js';
import { Net } from './net/net.js';
import { World } from './world/world.js';
import { Grass } from './world/grass.js';
import { setMaxAniso } from './world/textures.js';
import { installFarShadowChunk } from './world/shadows.js';
import { Post } from './fx/post.js';
import { FX, Decals } from './fx/particles.js';
import { LocalPlayer, RemotePlayer, predictHit } from './game/player.js';
import { VehicleManager } from './game/entities.js';
import { PropManager, defOf } from './game/props.js';
import { preloadAssets, registerManifest } from './game/assets.js';
import { Haunt } from './game/haunt.js';
import { pbrReady } from './world/builder.js';

// Que no se vea nada provisorio: compila todos los shaders de la escena (también los de los fantasmas, que arrancan
// ocultos) para el estado en que se dibujan de verdad (adentro del pase de post), antes de mostrar el menú.
async function precompileScene(renderer) {
  try {
    const rt = G.post?.ao?.beautyRenderTarget || G.post?.composer?.renderTarget1 || null;
    const hidden = [];
    for (const o of [G.haunt?.count?.root, G.haunt?.lady?.g?.char?.root]) if (o && !o.visible) { o.visible = true; hidden.push(o); }
    G.world?.update(1 / 60, { x: 0, z: -60 });
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    await Promise.race([renderer.compileAsync(G.scene, G.camera), new Promise((r) => setTimeout(r, 12000))]);
    renderer.setRenderTarget(prev);
    for (const o of hidden) o.visible = false;
  } catch (e) { console.warn('precompilación de shaders', e); }
}
import { ASSET_MANIFEST } from './game/asset-manifest.js';
import { SFX_MANIFEST } from './audio/sfx-manifest.js';
import { VoiceChat } from './audio/voice.js';
import { PokerView } from './game/poker.js';
import { FootballView } from './game/football.js';
import { PART } from './game/ragdoll.js';
import { PunchBag } from './game/punchbag.js';
import { GraffitiManager } from './game/graffiti.js';
import { Gore } from './game/gore.js';
import { ACTIVITIES, ActivityMarkers } from './ui/activities.js';
import { AvatarPreview } from './ui/avatar-preview.js';
import { Hud } from './ui/hud.js';
import { preloadHumans, MODELS, DEFAULT_MODEL } from './char/human.js';
import { AudioEngine } from './audio/audio.js';
import { voiceOf, voiceRate, vocalName } from './audio/vocals.js';
import { YouTubeScreenManager } from './media/screens.js';
import { youtubeId, mediaPosition } from './media/youtube.js';
import { ZONES, zoneAt, isPvpAt, INTERACT, SCREENS, SCREEN_BY_ID, FIELD } from './shared/mapdata.js';

const $ = (id) => document.getElementById(id);
const loadingText = $('loading-text');
const status = (t) => { loadingText.textContent = t; };
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

const state = {
  mode: 'boot', // boot | menu | game | pause | chat | media | emotes | palette
  net: null,
  local: null,
  props: null,
  vehicles: null,
  graffiti: null,
  viewYaw: Math.PI,
  viewPitch: 0.08,
  cameraMode: 2, // first-person by default; C cycles cameras
  selected: 4,
  welcome: null,
  media: {},
  mediaScreen: null,
  hurt: 0,
  sprayT: 0,
  stateT: 0,
  promptAction: null,
  reconnecting: false,
  room: null,
  joinedName: null,
};

const SWATCHES = {
  skin: ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#6f4328', '#f0d5bd'],
  shirt: ['#c8312b', '#3b6fd8', '#2f8f3a', '#ffe45b', '#8e44ad', '#161616', '#f2f2ee'],
  pants: ['#2b2f3a', '#1f376b', '#5b4636', '#151515', '#66705a'],
  hair: ['#16110d', '#3a2a1a', '#6f4328', '#d2b06d', '#b62b2b', '#eeeeee'],
  hatColor: ['#c8312b', '#2f8f3a', '#1b1b1b', '#f2f2ee', '#e0b020', '#3b6fd8'],
};
const selectedLook = { skin: '#e0ac69', shirt: '#c8312b', pants: '#2b2f3a', hair: '#3a2a1a', hatColor: '#2f8f3a', model: DEFAULT_MODEL };
const WEAPONS = new Set(['bat', 'sword', 'axe', 'machete', 'sledge', 'knife', 'pan', 'guitar', 'cue']);
const nameTags = new Map();

function show(el, yes = true) { el?.classList.toggle('hidden', !yes); }

function setMode(mode) {
  state.mode = mode;
  const ingame = !!state.local && G.inGame;
  show($('menu'), mode === 'menu');
  show($('pause'), mode === 'pause');
  show($('media'), mode === 'media');
  show($('emotes'), mode === 'emotes');
  show($('activities'), mode === 'activities');
  show($('palette'), mode === 'palette');
  show($('poker'), mode === 'poker');
  // sentado al póker no hay HUD del juego (zona, barras, etc.): solo la mesa
  show($('hud'), ingame && mode !== 'menu' && mode !== 'poker');
  show($('chat'), ingame);
  if (mode !== 'chat') $('chat')?.classList.remove('open');
  if (G.input) { G.input.enabled = mode === 'game'; if (mode !== 'game') G.input.releaseAll(); }
  if (mode !== 'game') G.voice?.setPTT(false);
  if (mode === 'pause') renderPlayerList();
  G.media?.focus(mode === 'media' ? state.mediaScreen : null, mode === 'media' ? $('media-view') : null);
}

function populateSwatches() {
  try { const saved = JSON.parse(localStorage.getItem('dukes.look') || 'null'); if (saved) for (const key of Object.keys(SWATCHES)) if (SWATCHES[key].includes(saved[key])) selectedLook[key] = saved[key]; } catch {}
  document.querySelectorAll('.swatches[data-key]').forEach((row) => {
    const key = row.dataset.key;
    for (const color of SWATCHES[key] || []) {
      const b = document.createElement('button');
      b.type = 'button'; b.style.background = color; b.title = color;
      b.classList.toggle('sel', selectedLook[key] === color);
      b.addEventListener('click', () => {
        selectedLook[key] = color;
        row.querySelectorAll('button').forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel');
      });
      row.appendChild(b);
    }
  });

  const colors = ['#ff2d55', '#ff6b35', '#ffd23f', '#7dff6b', '#4de8ff', '#3b6fd8', '#c76bff', '#ff6bd5', '#ffffff', '#111111'];
  const pal = $('pal-swatches');
  for (const color of colors) {
    const b = document.createElement('button'); b.style.background = color; b.dataset.color = color;
    b.addEventListener('click', () => {
      $('pal-color').value = color;
      pal.querySelectorAll('button').forEach((x) => x.classList.remove('sel'));
      b.classList.add('sel');
    });
    pal.appendChild(b);
  }
  pal.firstElementChild?.classList.add('sel');
}

function readLook() {
  return {
    ...selectedLook,
    hat: 'none',
    glasses: 'none',
    body: 'normal',
    beard: false,
    shoes: '#1b1b1b',
  };
}

function setupModelPicker() {
  try {
    const saved = JSON.parse(localStorage.getItem('dukes.look') || 'null');
    if (saved && MODELS[saved.model]) selectedLook.model = saved.model;
  } catch {}
  document.querySelectorAll('#m-models button[data-model]').forEach((b) => {
    b.classList.toggle('sel', b.dataset.model === selectedLook.model);
    b.addEventListener('click', () => {
      selectedLook.model = b.dataset.model;
      document.querySelectorAll('#m-models button').forEach((x) => x.classList.toggle('sel', x === b));
    });
  });
}

function setupMenuDefaults() {
  try {
    const saved = JSON.parse(localStorage.getItem('dukes.audio') || '{}');
    for (const key of ['vol', 'volSfx', 'volMusic', 'volAmbient']) if (Number.isFinite(saved[key])) G.opts[key] = clamp(saved[key], 0, 1);
    G.opts.muted = saved.muted === true;
  } catch {}
  $('m-name').value = localStorage.getItem('dukes.name') || '';
  const q = new URLSearchParams(location.search).get('sala');
  $('m-room').value = q || localStorage.getItem('dukes.room') || 'principal';
  try {
    const saved = JSON.parse(localStorage.getItem('dukes.look') || 'null');

  } catch {}
  $('o-sens').value = G.opts.sens;
  $('o-fov').value = G.opts.fov;
  $('o-vol').value = G.opts.vol;
  $('o-music').value = G.opts.volMusic;
  $('o-voice').value = G.opts.volVoice;
  $('o-sfx').value = G.opts.volSfx;
  $('o-ambient').value = G.opts.volAmbient;
  $('o-mute').checked = !!G.opts.muted;
  for (const def of SCREENS) { const option = document.createElement('option'); option.value = def.id; option.textContent = def.name; $('media-screen').appendChild(option); }
  updateAudioUI();
  $('o-grass').value = G.opts.grass;
  $('o-shadows').value = G.opts.shadows;
  $('o-voicemode').value = G.opts.voiceMode;
  $('o-hints').value = G.hud?.mode || 'primeras';
  $('o-spatial').checked = G.opts.voiceSpatial;
  $('o-invert').checked = G.opts.invertY;
  updateMicUI();
}

function setupHotbar() {
  const slots = [
    ['🍺', 'Birra'], ['🚬', 'Faso'], ['🎨', 'Aerosol'], ['✋', 'Mano libre'],
  ];
  const el = $('hotbar'); el.innerHTML = '';
  slots.forEach(([ic, nm], i) => {
    const s = document.createElement('div'); s.className = 'slot'; s.dataset.slot = i + 1;
    s.innerHTML = `<span class="k">${i + 1}</span><span class="ic">${ic}</span><span class="nm">${nm}</span>`;
    el.appendChild(s);
  });
  const hands = document.createElement('div');
  hands.id = 'hands-info';
  el.appendChild(hands);
  updateHotbar();
}

function updateHotbar() {
  const L = state.local;
  const item = L?.hands.r.item;
  const sel = item === 'beer' ? 1 : item === 'smoke' ? 2 : item === 'spray' ? 3 : 4;
  state.selected = sel;
  document.querySelectorAll('#hotbar .slot').forEach((s) => s.classList.toggle('sel', +s.dataset.slot === sel));
  const hi = $('hands-info');
  if (hi && L) {
    const lbl = (h) => h.prop ? (defOf(state.props?.get(h.prop)?.type).label) : h.player ? `a ${nameOf(h.player)}` : null;
    const l = lbl(L.hands.l), r = L.hands.r.item ? null : lbl(L.hands.r);
    hi.innerHTML = l || r
      ? `<span><b>Q</b> izq: ${escapeHtml(l || 'libre')}</span><span><b>E</b> der: ${escapeHtml(r || 'libre')}</span><span><b>G</b> revolear</span>`
      : '<span><b>Click</b> piña · <b>sostenido</b> mover brazo · <b>los dos</b> guardia</span><span><b>E / Q</b> agarrar · <b>X</b> usar</span>';
  }
}

function addChat(text, opts = {}) {
  const d = document.createElement('div');
  d.className = 'msg' + (opts.sys ? ' sys' : '');
  if (opts.html) d.innerHTML = opts.html; else d.textContent = text;
  if (opts.color) d.style.color = opts.color;
  $('chat-log').appendChild(d);
  $('chat-log').scrollTop = $('chat-log').scrollHeight;
  setTimeout(() => d.classList.add('old'), 10000);
  setTimeout(() => { if (!d.matches(':hover')) d.remove(); }, 22000);
}

function killfeed(text) {
  const d = document.createElement('div'); d.textContent = text; $('killfeed').appendChild(d);
  setTimeout(() => d.remove(), 5000);
}

// cartelito con la fuerza del golpe (bolsa de boxeo)
function showHitMeter(speed) {
  let el = $('hitmeter');
  if (!el) { el = document.createElement('div'); el.id = 'hitmeter'; $('hud').appendChild(el); }
  const kmh = Math.round(speed * 3.6);
  const grade = speed > 9 ? '¡NOCAUT!' : speed > 7 ? '¡TREMENDA!' : speed > 5 ? 'Buena' : 'Suave';
  const best = (showHitMeter.best = Math.max(showHitMeter.best || 0, kmh));
  el.innerHTML = `<b>${kmh}</b> km/h <small>${grade}${best === kmh && kmh > 20 ? ' · récord' : ''}</small>`;
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  clearTimeout(showHitMeter._t); showHitMeter._t = setTimeout(() => el.classList.remove('pop'), 1400);
}

function bigMessage(text, sub = '', ms = 1800) {
  if (G.hud) { G.hud.big(text, sub, ms); return; }
  const el = $('bigmsg'); el.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`; show(el, true);
  clearTimeout(bigMessage._t); bigMessage._t = setTimeout(() => show(el, false), ms);
}

function nameOf(id) {
  if (id === G.myId) return state.local?.name || 'Vos';
  return G.players.get(id)?.name || `Jugador ${id}`;
}

function renderPlayerList() {
  const el = $('players-list'); el.innerHTML = '';
  const arr = [{ id: G.myId, name: state.local?.name || 'Vos', color: '#ffcc33' }, ...[...G.players.values()]];
  for (const p of arr) {
    const row = document.createElement('div'); row.className = 'pl';
    row.innerHTML = `<span class="dot" style="background:${p.color || '#fff'}"></span><span class="nm">${escapeHtml(p.name)}${p.id === G.myId ? ' (vos)' : ''}</span>`;
    el.appendChild(row);
  }
  $('pcount').textContent = arr.length;
  // en pausa: silenciar gente
  const pp = $('pause-players');
  if (pp) {
    pp.innerHTML = '';
    for (const p of G.players.values()) {
      const row = document.createElement('div'); row.className = 'pp-row';
      const muted = !!G.voice?.peers.get(p.id)?.muted;
      row.innerHTML = `<span class="dot" style="background:${p.color || '#fff'}"></span><span class="nm">${escapeHtml(p.name)}</span>`;
      const b = document.createElement('button'); b.textContent = muted ? '🔇 Silenciado' : '🔊 Se escucha';
      b.onclick = () => { G.voice?.setMuted(p.id, !muted); renderPlayerList(); };
      row.appendChild(b); pp.appendChild(row);
    }
  }
}

function escapeHtml(s) {
  const d = document.createElement('div'); d.textContent = String(s ?? ''); return d.innerHTML;
}

function ensureNameTag(p) {
  let el = nameTags.get(p.id);
  if (el) return el;
  el = document.createElement('div');
  el.className = 'tag3d';
  el.innerHTML = `<div class="bubble hidden"></div><div class="name"></div><div class="hpbar"><i></i></div>`;
  $('overlay').appendChild(el);
  nameTags.set(p.id, el);
  return el;
}

function removeNameTag(id) {
  const el = nameTags.get(id);
  if (el) el.remove();
  nameTags.delete(id);
}

function clearNameTags() {
  for (const el of nameTags.values()) el.remove();
  nameTags.clear();
}

function chatBubble(id, text) {
  const p = G.players.get(id); if (!p) return;
  const el = ensureNameTag(p);
  const b = el.querySelector('.bubble');
  b.textContent = String(text || '').slice(0, 160);
  b.classList.remove('hidden');
  clearTimeout(el._bubbleTimer);
  el._bubbleTimer = setTimeout(() => b.classList.add('hidden'), 5200);
}

// Globito propio (se ve en tercera persona; los demás lo ven siempre)
function ownBubble(text) {
  let el = nameTags.get('me');
  if (!el) {
    el = document.createElement('div');
    el.className = 'tag3d';
    el.innerHTML = '<div class="bubble me hidden"></div>';
    $('overlay').appendChild(el);
    nameTags.set('me', el);
  }
  const b = el.querySelector('.bubble');
  b.textContent = String(text || '').slice(0, 160);
  b.classList.remove('hidden');
  clearTimeout(el._bubbleTimer);
  el._bubbleTimer = setTimeout(() => b.classList.add('hidden'), 5200);
}

function updateOwnBubble() {
  const el = nameTags.get('me');
  if (!el || !state.local) return;
  const hidden = el.querySelector('.bubble').classList.contains('hidden');
  state.local.char.headWorld(tmpV2); tmpV2.y += 0.3;
  const dist = G.camera.position.distanceTo(tmpV2);
  tmpV2.project(G.camera);
  const visible = !hidden && state.cameraMode !== 2 && tmpV2.z > -1 && tmpV2.z < 1;
  el.style.display = visible ? '' : 'none';
  if (!visible) return;
  const x = (tmpV2.x * 0.5 + 0.5) * innerWidth, y = (-tmpV2.y * 0.5 + 0.5) * innerHeight;
  el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%) scale(${clamp(1.12 - dist / 95, 0.62, 1)})`;
}

function updateNameTags() {
  if (!G.inGame) return;
  updateOwnBubble();
  const W = innerWidth, H = innerHeight;
  for (const p of G.players.values()) {
    const el = ensureNameTag(p);
    p.headPosition(tmpV2); tmpV2.y += 0.32;
    const dist = G.camera.position.distanceTo(tmpV2);
    tmpV2.project(G.camera);
    const visible = tmpV2.z > -1 && tmpV2.z < 1 && Math.abs(tmpV2.x) < 1.12 && Math.abs(tmpV2.y) < 1.12 && dist < 65;
    el.style.display = visible ? '' : 'none';
    if (!visible) continue;
    const x = (tmpV2.x * 0.5 + 0.5) * W;
    const y = (-tmpV2.y * 0.5 + 0.5) * H;
    const scale = clamp(1.12 - dist / 95, 0.62, 1);
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%) scale(${scale})`;
    const nm = el.querySelector('.name');
    nm.textContent = p.name + (G.voice?.isTalking(p.id) ? ' 🔊' : '');
    nm.style.borderBottom = `2px solid ${p.color || '#fff'}`;
    el.querySelector('.hpbar i').style.width = `${clamp(p.hp ?? 100, 0, 100)}%`;
  }
  for (const id of [...nameTags.keys()]) if (id !== 'me' && !G.players.has(id)) removeNameTag(id);
}

function openChat() {
  if (state.mode !== 'game' && state.mode !== 'poker') return;
  state.chatFrom = state.mode; // sentado al póker también se chatea (y al cerrar se vuelve a la mesa)
  state.mode = 'chat';
  G.input.enabled = false;
  G.input.unlock();
  $('chat').classList.add('open');
  $('chat-input').value = '';
  $('chat-input').focus();
}

function closeChat(lock = true) {
  $('chat').classList.remove('open');
  if (!G.inGame) return;
  if (state.chatFrom === 'poker' && G.poker?.isSeated()) { state.mode = 'poker'; G.input.enabled = false; }
  else { state.mode = 'game'; G.input.enabled = true; }
  state.chatFrom = null;
  if (lock) setTimeout(() => G.input.lock(), 0);
}

function sendChat() {
  const input = $('chat-input'); const text = input.value.trim();
  if (text) {
    state.net.send({ t: 'chat', m: text });
    if (!text.startsWith('/')) {
      addChat('', { html: `<b style="color:#ffcc33">${escapeHtml(state.local.name)}</b>${escapeHtml(text)}` });
      ownBubble(text);
    }
  }
  closeChat(true);
}

function openPause() {
  if (!G.inGame || ['chat', 'media', 'emotes', 'palette', 'menu', 'activities', 'poker'].includes(state.mode)) return;
  setMode('pause');
}

function resumeGame() {
  if (!G.inGame) return;
  G.sfx?.unlock();
  setMode('game');
  setTimeout(() => G.input.lock(), 0);
}

function nearestWorldInteract() {
  if (!state.local) return null;
  let best = null;
  for (const it of INTERACT) {
    const d = Math.hypot(state.local.pos.x - it.p[0], state.local.pos.y + 1 - it.p[1], state.local.pos.z - it.p[2]);
    if (d <= it.r && (!best || d < best.dist)) best = { kind: 'world', item: it, dist: d };
  }
  return best;
}

// Ayudas contextuales (chiquitas, al costado, se desvanecen según la opción de la pausa):
// X usa el mundo (sentarse, subir, heladerita...), E/Q agarran o sueltan. Nunca comparten tecla.
// La mira se marca cuando hay algo para usar o agarrar (eso se ve siempre, aunque las ayudas estén apagadas).
function updatePrompt() {
  state.promptAction = null;
  const L = state.local;
  const H = G.hud;
  if (!G.inGame || state.mode !== 'game' || !L || !H) { H?.crosshair(false); return; }
  const it = L.hands.r.item;
  const itemHint = () => {
    if (it === 'beer') H.hint('beer', 'Click', 'Tomar');
    else if (it === 'smoke') H.hint('smoke', 'Click', 'Pitar');
    else if (it === 'spray') H.hint('spray', 'Click', 'Pintar (sostenido) · B colores');
  };
  const popcornHint = () => {
    const pl = state.props?.get(L.hands.l.prop)?.type === 'popcorn', pr = state.props?.get(L.hands.r.prop)?.type === 'popcorn';
    if (pl || pr) H.hint('popcorn', 'Click', `${pr ? 'Der.' : 'Izq.'} revolear · ${pr ? 'izq.' : 'der.'} comer`);
  };
  let canUse = false;
  if (L.vehicle) {
    state.promptAction = { kind: 'exitVehicle', item: L.vehicle, dist: 0 };
    H.hint('veh-exit', 'X', 'Bajarse');
    if (L.vehicle.type !== 'cart') H.hint('veh-blades', 'Espacio', L.vehicle.blades ? 'Apagar cuchillas' : 'Prender cuchillas: cortá y cobrá');
    H.hint('veh-horn', 'H', 'Bocina');
    itemHint();
    H.crosshair(false);
    return;
  }
  if (L.seat) {
    state.promptAction = { kind: 'stand' };
    H.hint('stand', 'X', L.seat.poker ? 'Levantarse de la mesa' : 'Levantarse');
    popcornHint();
    itemHint();
    const g = !L.hands.r.joint && grabbableFor(L);
    if (g) H.hint('grab', 'E', `Agarrar ${g.prop.def.label}`);
    H.crosshair(!!g);
    return;
  }
  if (L.state === 'ko' || L.state === 'dead') { H.crosshair(false); return; }
  const v = state.vehicles.nearest(L.pos, 2.7);
  const w = nearestWorldInteract();
  const seat = nearestSeat();
  const choices = [];
  if (v) choices.push({ kind: 'vehicle', item: v.item, dist: v.dist });
  if (w) choices.push(w);
  if (seat) choices.push(seat);
  choices.sort((a, b) => a.dist - b.dist);
  const x = choices[0];
  if (x) {
    state.promptAction = x;
    canUse = true;
    if (x.kind === 'vehicle') H.hint('use-veh', 'X', `Subir a ${x.item.type === 'tractor' ? 'el tractor' : x.item.type === 'cart' ? 'el carrito' : 'la cortadora'}`);
    else if (x.kind === 'seat') H.hint('use-seat', 'X', x.item.poker ? 'Sentarse a jugar al póker' : 'Sentarse');
    else H.hint('use-' + x.item.k, 'X', x.item.label);
  }
  // objetos al alcance
  const g = !L.hands.r.joint ? grabbableFor(L) : null;
  if (g) { canUse = true; H.hint('grab', 'E / Q', `Agarrar ${g.prop.def.label} (der. / izq.)`); }
  else if (L.hands.r.joint || L.hands.l.joint) {
    popcornHint();
    H.hint('drop', 'E / Q', 'Soltar');
    H.hint('throw', 'G', 'Revolear');
  }
  itemHint();
  H.crosshair(canUse);
}

function grabbableFor(L) {
  const hp = L.handPos('r', tmpV);
  const dir = G.camera.getWorldDirection(tmpV2);
  return state.props.findGrabbable(hp, G.camera.position, dir, 'r');
}

// X: usar lo que hay en el mundo (nunca agarra ni suelta: eso es E/Q)
function interact() {
  const L = state.local;
  if (!L) return;
  const a = state.promptAction;
  if (!a) return;
  if (a.kind === 'exitVehicle') return state.vehicles.exitCurrent();
  if (a.kind === 'stand') { if (L.seat?.poker) G.poker?.leave(); L.standUp(); return; }
  if (a.kind === 'vehicle') return state.vehicles.enter(a.item);
  if (a.kind === 'seat') {
    if (a.item.poker) { G.poker?.sit(a.item); return; }
    L.sitAt(a.item);
    return;
  }
  if (a.kind === 'world') {
    const it = a.item;
    if (it.k === 'media') return openMedia(it.screen);
    if (it.k === 'bong') {
      L.setAction('bong', 3.0);
      setTimeout(() => { if (!state.local) return; state.local.high = clamp(state.local.high + 0.24, 0, 1.6); puffFrom(state.local, 1.8); G.sfx?.trigger('cough', null, 0.7); }, 1800);
      state.net.send({ t: 'ev', k: 'bong' });
      return;
    }
    if (it.k === 'cooler') { L.giveItem('beer'); updateHotbar(); G.sfx?.trigger('pickup'); return; }
    if (it.k === 'grill') {
      L.setAction('eat', 1.6);
      setTimeout(() => { state.local?.heal(22, { blood: 12 }); G.sfx?.trigger('munch', null, 0.6); }, 700);
      return;
    }
    if (it.k === 'medkit') {
      const left = 25 - (G.time - (state.medT ?? -99));
      if (left > 0) { bigMessage('BOTIQUÍN VACÍO', `Se repone en ${Math.ceil(left)} s`, 1400); G.sfx?.trigger('ui-err', null, 0.5); return; }
      state.medT = G.time;
      L.setAction('eat', 1.2);
      L.heal(65, { blood: 70, stopBleed: true });
      G.sfx?.trigger('ui-ok', null, 0.7);
      bigMessage('+ VIDA', 'Te vendaste y tomaste algo para el dolor', 1600);
      return;
    }
    if (it.k === 'football') { state.net.send({ t: 'fbctl', a: 'start' }); G.sfx?.trigger('ui-ok'); return; }
    if (it.k === 'haunt') { G.haunt?.use(it); return; }
  }
}

function nearestSeat() {
  const L = state.local;
  let best = null;
  for (const s of G.world?.seats || []) {
    const d = Math.hypot(L.pos.x - s.x, L.pos.z - s.z);
    if (s.poker && G.poker?.st?.seats?.[s.seatIndex]) continue; // silla de póker ocupada (jugador o parroquiano)
    if (d < 1.35 && (!best || d < best.dist) && !s.taken) best = { kind: 'seat', item: s, dist: d + 0.2 };
  }
  return best;
}

function puffFrom(p, amount = 1) {
  if (!G.fx || !p?.char) return;
  const m = p.char.mouthWorld(new THREE.Vector3());
  const yaw = p.yaw || 0;
  G.fx.puff(m, new THREE.Vector3(Math.sin(yaw), 0.15, Math.cos(yaw)), amount);
}

function openEmotes() {
  if (state.mode !== 'game') return;
  setMode('emotes'); G.input.unlock();
}
function closeOverlayToGame() { setMode('game'); setTimeout(() => G.input.lock(), 0); }

// Panel "¿Qué hacemos?": lista de actividades con distancia; tocar una la marca como destino
function openActivities() {
  if (state.mode !== 'game') return;
  const L = state.local;
  const list = $('act-list');
  list.innerHTML = '';
  const items = ACTIVITIES.map((a) => ({ a, d: L ? Math.hypot(a.p[0] - L.pos.x, a.p[2] - L.pos.z) : 0 })).sort((x, y) => x.d - y.d);
  for (const { a, d } of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.classList.toggle('sel', G.markers?.target === a.id);
    b.innerHTML = `<span class="t">${a.icon} ${escapeHtml(a.name)}</span><span class="w">${escapeHtml(a.where)} · ${Math.round(d)} m</span><span class="h">${escapeHtml(a.how)}</span>`;
    b.addEventListener('click', () => {
      G.markers?.setTarget(a.id);
      G.sfx?.trigger('ui-select', null, 0.5);
      closeOverlayToGame();
    });
    list.appendChild(b);
  }
  setMode('activities'); G.input.unlock();
}

function openPalette() {
  if (state.mode !== 'game') return;
  setMode('palette'); G.input.unlock();
}

function mediaState(screen) { return state.media[screen] || { queue: [], cur: null }; }
function renderMedia() {
  const m = mediaState(state.mediaScreen);
  $('media-title').textContent = SCREEN_BY_ID[state.mediaScreen]?.name || 'Pantallas';
  $('media-screen').value = state.mediaScreen || 'cine';
  $('media-play').textContent = m.cur?.paused ? 'Reanudar sala' : 'Pausar sala';
  for (const id of ['media-play', 'media-back', 'media-fwd', 'media-skip']) $(id).disabled = !m.cur;
  renderMediaStatus();
  $('media-now').textContent = m.cur ? `${m.cur.paused ? '⏸' : '▶'} ${m.cur.title || m.cur.v} · por ${m.cur.by || '?'}` : 'Nada sonando';
  const ol = $('media-queue'); ol.innerHTML = '';
  (m.queue || []).forEach((it, i) => {
    const li = document.createElement('li'); li.textContent = `${it.title || it.v} · ${it.by || '?'}`;
    const b = document.createElement('button'); b.textContent = '×';
    b.onclick = () => state.net.send({ t: 'media', s: state.mediaScreen, a: 'remove', i });
    li.appendChild(b); ol.appendChild(li);
  });
}
function openMedia(screen) {
  state.mediaScreen = SCREEN_BY_ID[screen] ? screen : 'autocine';
  setMode('media'); renderMedia(); G.input.unlock();
}
function renderMediaStatus() {
  const info = G.media?.info(state.mediaScreen);
  if (!info) return;
  $('media-status').textContent = info.text;
  $('media-status').classList.toggle('err', info.error);
  $('media-unlock').textContent = info.blocked ? 'Activar YouTube · requiere clic' : 'Activar YouTube';
  $('media-retry').classList.toggle('hidden', !info.error);
}
function updateAudioUI() {
  const muted = !!G.opts.muted;
  const value = muted ? 'Silenciado' : G.opts.vol === 0 ? 'Volumen general en 0' : G.sfx?.status || 'requiere clic';
  if ($('audio-state')) $('audio-state').textContent = `Sonido: ${value}`;
  if ($('audio-toggle')) {
    $('audio-toggle').textContent = muted ? 'Activar sonido' : value === 'activo' ? 'Sonido activado' : 'Activar sonido';
    // en el HUD solo aparece si el navegador bloqueó el audio (silenciar a propósito se maneja en la pausa)
    show($('audio-toggle'), !muted && value !== 'activo' && G.opts.vol > 0);
  }
  if ($('o-mute')) $('o-mute').checked = muted;
}
function saveAudioOptions() {
  try { localStorage.setItem('dukes.audio', JSON.stringify(Object.fromEntries(['vol','volSfx','volMusic','volAmbient','muted'].map(k=>[k,G.opts[k]])))); } catch {}
  G.sfx?.refresh(); updateAudioUI();
}


// G: revolear. El brazo toma envión y suelta al final del movimiento ('throwrelease')
function quickThrow() {
  const L = state.local;
  if (!L || !['active', 'stun', 'seated'].includes(L.state)) return;
  const side = L.hands.r.joint || L.hands.r.item ? 'r' : L.hands.l.joint ? 'l' : null;
  if (!side) return;
  if (L.startThrow(side)) G.sfx?.trigger('swing', null, 0.45);
}

function doThrowRelease(side) {
  const L = state.local;
  if (!L) return;
  const h = L.hands[side];
  const dir = G.camera.getWorldDirection(new THREE.Vector3());
  const hv = L.handVelocity(side);
  if (h.item) {
    const item = h.item;
    h.item = null;
    if (item === 'smoke') { G.fx?.ember(L.handPos(side, new THREE.Vector3())); updateHotbar(); return; }
    const pos = L.handPos(side, new THREE.Vector3()).addScaledVector(dir, 0.18);
    state.props.spawnThrow(item === 'beer' ? 'bottle' : 'spraycan', pos, dir.clone().multiplyScalar(14.5).addScaledVector(hv, 0.3).add(new THREE.Vector3(0, 1.8, 0)));
    G.sfx?.trigger('swing', null, 0.6);
    updateHotbar();
    return;
  }
  const p = state.props.get(h.prop);
  if (p) {
    // lo liviano sale disparado; lo pesado apenas
    const sp = clamp(17 - Math.sqrt(p.mass || 1) * 3.3, 5.5, 16.5);
    L.release(side, false);
    state.props.setVelocity(p, { x: dir.x * sp + hv.x * 0.3, y: dir.y * sp + hv.y * 0.3 + 1.6, z: dir.z * sp + hv.z * 0.3 });
    p.body.setAngvel({ x: (Math.random() - 0.5) * 10, y: (Math.random() - 0.5) * 10, z: (Math.random() - 0.5) * 10 }, true);
    state.props.markThrown(p);
    G.sfx?.trigger('swing', null, 0.7);
  } else L.release(side, true);
  updateHotbar();
}

// Puñado de pochoclos revoleado (partículas que rebotan; no lastiman)
function throwPopcorn(side) {
  const L = state.local;
  if (!L || !G.fx) return;
  const pos = L.handPos(side, new THREE.Vector3());
  const dir = G.camera.getWorldDirection(new THREE.Vector3());
  for (let i = 0; i < 18; i++) {
    const s = 4 + Math.random() * 3.5;
    G.fx.bits.spawn({
      x: pos.x, y: pos.y, z: pos.z,
      vx: dir.x * s + (Math.random() - 0.5) * 1.6, vy: dir.y * s + 1.2 + Math.random() * 1.4, vz: dir.z * s + (Math.random() - 0.5) * 1.6,
      life: 5 + Math.random() * 3, s: 0.012 + Math.random() * 0.006, col: Math.random() < 0.85 ? 0xfff2c8 : 0xf0c060, grav: -9.8, bounce: 0.35, drag: 0.6,
    });
  }
  G.sfx?.trigger('swing', null, 0.3);
  state.net?.send({ t: 'ev', k: 'pop', x: +pos.x.toFixed(2), y: +pos.y.toFixed(2), z: +pos.z.toFixed(2), dx: +dir.x.toFixed(2), dy: +dir.y.toFixed(2), dz: +dir.z.toFixed(2) });
}

// Voz de dolor de un jugador (cada uno con su voz y su tono). pos null = la mía (sin espacializar)
function playVocal(kind, vi, look, id, pos) {
  const voice = voiceOf(MODELS[look?.model]?.gender || MODELS[DEFAULT_MODEL].gender, id);
  G.sfx?.trigger(vocalName(kind, voice), pos, kind === 'hurt' ? 0.8 : 0.95, { variant: vi | 0, rate: voiceRate(id), full: 3, max: 32, slot: 'vo' + id });
}

function hitFx(pos, amount = 0.5, dir = null) {
  G.sfx?.trigger('hit', pos, clamp(0.4 + amount * 0.5, 0, 1));
  if (amount > 0.8) G.sfx?.trigger('hit-soft', pos, clamp(amount * 0.45, 0, 0.8), { rate: 0.72 }); // el peso del golpe
  if (!G.fx) return;
  const d = dir || tmpV.set(Math.random() - 0.5, 0.5 + Math.random(), Math.random() - 0.5).normalize();
  G.fx.blood(pos.clone ? pos.clone() : new THREE.Vector3(pos.x, pos.y, pos.z), d, amount);
}

// click corto de un brazo
function doTap(side) {
  const L = state.local;
  if (!L) return;
  const r = L.tap(side);
  if (r === 'drink') {
    G.sfx?.trigger('pickup', null, 0.25);
    setTimeout(() => {
      if (!state.local) return;
      state.local.drunk = clamp(state.local.drunk + 0.1, 0, 1.6);
      G.sfx?.trigger('gulp', null, 0.6);
      state.net.send({ t: 'ev', k: 'drink' });
    }, 650);
  } else if (r === 'smoke') {
    setTimeout(() => {
      if (!state.local) return;
      state.local.high = clamp(state.local.high + 0.1, 0, 1.6);
      puffFrom(state.local, 1);
      state.net.send({ t: 'ev', k: 'puff' });
    }, 900);
  } else if (r === 'eat') {
    setTimeout(() => { state.local?.heal(3); G.sfx?.trigger('munch', null, 0.55); }, 450);
  } else if (r === 'punch' || r === 'swing') G.sfx?.trigger('swing', null, r === 'swing' ? 0.45 : 0.28);
}

function handleEvent(m) {
  const rp = G.players.get(m.id);
  switch (m.k) {
    case 'haunt': // algo del castillo que arrancó otro (puertas, campana, sustos en grupo)
      G.haunt?.remote(m);
      break;
    case 'horn':
      if (rp && performance.now() - (rp._lastHorn || 0) > 700) { rp._lastHorn = performance.now(); G.sfx?.trigger('horn', rp.pos, 0.8); }
      break;
    case 'wd': // herida de otro jugador (la calculó su dueño)
      if (rp) rp.char.wound(m.p | 0, new THREE.Vector3(m.l?.[0] || 0, m.l?.[1] || 0, m.l?.[2] || 0), m.kd || 'blunt', +m.s || 0.5, null, (m.p * 7919 + (m.s * 1000 | 0)) | 0);
      break;
    case 'imp': { // impacto (sangre/sonido/reacción del cuerpo) visto por los demás
      const pos = new THREE.Vector3(+m.x || 0, +m.y || 0, +m.z || 0);
      // si el golpe fue mío ya lo vi y lo escuché al instante (predicción): no repetir
      const predicted = rp && m.by === G.myId && G.time - rp.react.predictT < 0.9;
      if (predicted) break;
      if (rp && (m.p | 0) >= 0 && m.p != null) rp.hitReact(m.p | 0, +m.s || 0, pos, +m.nx || 0, +m.nz || 0);
      if (!m.hl && m.s > 0.15) hitFx(pos, clamp(m.s, 0.2, 1.4), new THREE.Vector3(+m.nx || 0, Math.abs(+m.ny || 0.5), +m.nz || 0));
      else G.sfx?.trigger('hit', pos, 0.35);
      break;
    }
    case 'vo': // quejido / grito de otro (él eligió la toma: todos oyen lo mismo)
      if (rp) playVocal(String(m.kd || 'hurt'), m.vi | 0, rp.look, rp.id, tmpV.set(rp.pos.x, rp.pos.y + 1.55, rp.pos.z));
      break;
    case 'ko':
      if (m.by && m.by !== m.id) killfeed(`💫 ${nameOf(m.by)} dejó KO a ${nameOf(m.id)}`);
      else killfeed(`💫 ${nameOf(m.id)} quedó KO`);
      break;
    case 'death':
      killfeed(m.by ? `☠ ${nameOf(m.by)} liquidó a ${nameOf(m.id)}` : `☠ ${nameOf(m.id)} se murió`);
      break;
    case 'passout':
      killfeed(`🍺 ${nameOf(m.id)} se desmayó de tanto escabio`);
      break;
    case 'grab':
      if (m.to === G.myId && state.local) state.local.grabbedByRemote(m.id, m.side, m.part | 0, m.a || [0, 0, 0], !!m.on, m.v);
      break;
    case 'gbrk': // el que tenía agarrado se zafó
      if (m.to === G.myId && state.local) { state.local.gripLost(m.id, m.side === 'l' ? 'l' : 'r'); updateHotbar(); }
      break;
    case 'hc': // "te pegué": el atacante avisa; el golpeado valida y decide el daño
      if (m.to === G.myId) state.local?.hitClaim(m);
      break;
    case 'pop': { // pochoclos revoleados por otro
      if (!G.fx) break;
      for (let i = 0; i < 14; i++) {
        const s = 4 + Math.random() * 3;
        G.fx.bits.spawn({ x: +m.x || 0, y: +m.y || 0, z: +m.z || 0, vx: (+m.dx || 0) * s + (Math.random() - 0.5) * 1.5, vy: (+m.dy || 0) * s + 1.2 + Math.random(), vz: (+m.dz || 0) * s + (Math.random() - 0.5) * 1.5,
          life: 5, s: 0.013, col: 0xfff2c8, grav: -9.8, bounce: 0.35, drag: 0.6 });
      }
      break;
    }
    case 'puff':
      if (rp) puffFrom(rp, 1);
      break;
    case 'bong':
      if (rp) setTimeout(() => puffFrom(rp, 1.8), 1800);
      break;
    case 'drink':
      if (rp) G.sfx?.trigger('gulp', rp.pos, 0.5);
      break;
    case 'crash':
      G.sfx?.trigger('hit', new THREE.Vector3(+m.x || 0, 0.6, +m.z || 0), 1);
      break;
    case 'clang': { // el arma de otro rebotó contra una pared
      const pos = new THREE.Vector3(+m.x || 0, +m.y || 0, +m.z || 0);
      G.sfx?.trigger(m.m ? 'metal' : 'wood', pos, clamp((+m.s || 6) / 12, 0.3, 1));
      if (m.m) G.fx?.sparks(pos, null, 10); else G.fx?.dust(pos, null, 1);
      break;
    }
    case 'emote':
      if (rp) rp.stateData = { ...(rp.stateData || {}), em: m.e, et: 0 };
      break;
    case 'rs': // reapareció: cuerpo entero y limpio para todos
      rp?.resetBody();
      break;
    default:
      break;
  }
}

// Eventos del cuerpo del jugador local -> FX + red
function onLocalEvent(type, d) {
  const net = state.net;
  switch (type) {
    case 'wound':
      net?.send({ t: 'ev', k: 'wd', p: d.p, l: d.l, kd: d.k, s: d.s });
      break;
    case 'impact': {
      const pos = new THREE.Vector3(d.x, d.y, d.z);
      if (d.blocked) G.sfx?.trigger('hit-soft', pos, 0.6);
      else if (!d.harmless && d.s > 0.1) {
        hitFx(pos, clamp(d.s, 0.2, 1.5), new THREE.Vector3(d.nx, Math.abs(d.ny) + 0.3, d.nz));
        state.hurt = Math.min(1, state.hurt + 0.35 + d.s * 0.3);
      } else G.sfx?.trigger('hit', pos, 0.4);
      // la vista se va con el golpe (hacia donde me empuja); en la cabeza, más
      if (d.src !== 'world') camHit(d.nx, d.nz, (d.blocked ? 0.35 : 1) * clamp(0.35 + d.s * 0.6, 0.2, 1.8) * (d.part === PART.HEAD ? 1.4 : 1));
      state.shake = Math.min(1, (state.shake || 0) + (d.blocked ? 0.06 : 0.1 + d.s * 0.2));
      net?.send({ t: 'ev', k: 'imp', p: d.src === 'world' ? -1 : d.part, by: d.by || 0, x: +d.x.toFixed(2), y: +d.y.toFixed(2), z: +d.z.toFixed(2), nx: +d.nx.toFixed(2), ny: +d.ny.toFixed(2), nz: +d.nz.toFixed(2), s: +d.s.toFixed(2), hl: d.harmless ? 1 : 0 });
      break;
    }
    case 'vocal':
      playVocal(d.kind, d.vi, state.local.look, G.myId, null);
      net?.send({ t: 'ev', k: 'vo', kd: d.kind, vi: d.vi });
      break;
    case 'hitdealt': {
      // mi piña/patada/arma tocó a alguien: le aviso (él valida y decide el daño), pero lo que se ve y se
      // escucha va YA: su cuerpo acusa el golpe, salta la sangre si ahí lastima, mi brazo frena un instante
      const L = state.local, rp = G.players.get(d.id), pt = new THREE.Vector3(d.x, d.y, d.z);
      let s = predictHit(d.a, d.dv, d.w || null);
      if (rp) {
        const dx = rp.pos.x - L.pos.x, dz = rp.pos.z - L.pos.z;
        s = rp.hitReact(d.part, s, pt, dx, dz, true);
        if (s > 0.15 && (G.settings.desmadre || isPvpAt(rp.pos.x, rp.pos.z))) hitFx(pt, clamp(s, 0.2, 1.4), tmpV2.set(dx, 0.6, dz).normalize());
        else G.sfx?.trigger('hit', pt, clamp(d.dv / 8, 0.3, 1));
      } else G.sfx?.trigger('hit', pt, clamp(d.dv / 8, 0.3, 1));
      if (s > 0.1) {
        L.hitStop = Math.max(L.hitStop, 0.035 + Math.min(0.06, s * 0.04));
        camKick.v.x -= 0.45 + Math.min(1.4, s * 0.9);
        camKick.v.z += (Math.random() - 0.5) * 0.9 * Math.min(1.5, s);
      }
      state.shake = Math.min(1, (state.shake || 0) + clamp(d.dv / 40, 0.03, 0.15));
      net?.send({ t: 'ev', k: 'hc', to: d.id, p: d.part, s: +d.dv.toFixed(2), x: +d.x.toFixed(2), y: +d.y.toFixed(2), z: +d.z.toFixed(2), w: d.w || 0, a: d.a || 'p' });
      break;
    }
    case 'handwall':
      G.sfx?.trigger(d.s > 5 ? 'hit' : 'hit-soft', new THREE.Vector3(d.x, d.y, d.z), clamp(d.s / 10, 0.2, 0.7));
      break;
    case 'clang': {
      // el arma rebotó contra algo duro: se siente en la mano (sonido, chispas, sacudón)
      const pos = new THREE.Vector3(d.x, d.y, d.z), n = new THREE.Vector3(d.nx || 0, d.ny || 0, d.nz || 0);
      G.sfx?.trigger(d.metal ? 'metal' : 'wood', pos, clamp(d.s / 12, 0.35, 1));
      if (d.metal) G.fx?.sparks(pos, n, Math.round(8 + d.s)); else G.fx?.dust(pos, n, 1);
      state.shake = Math.min(1, (state.shake || 0) + clamp(d.s / 45, 0.05, 0.2));
      net?.send({ t: 'ev', k: 'clang', x: +d.x.toFixed(2), y: +d.y.toFixed(2), z: +d.z.toFixed(2), m: d.metal ? 1 : 0, s: +d.s.toFixed(1) });
      break;
    }
    case 'whack':
      G.sfx?.trigger(d.metal ? 'metal' : 'wood', new THREE.Vector3(d.x, d.y, d.z), clamp(d.s / 14, 0.3, 0.9));
      break;
    case 'throwrelease':
      doThrowRelease(d.side);
      break;
    case 'handful':
      throwPopcorn(d.side);
      break;
    case 'ko':
      bigMessage('KO', 'Quedaste en el piso...', 2200);
      net?.send({ t: 'ev', k: 'ko', by: d.by || 0 });
      break;
    case 'death':
      bigMessage('TE LIQUIDARON', 'Reaparecés en unos segundos', 4500);
      net?.send({ t: 'ev', k: 'death', by: d.by || 0 });
      break;
    case 'passout':
      bigMessage('COMA ALCOHÓLICO', 'Te pasaste de escabio', 3500);
      net?.send({ t: 'ev', k: 'passout' });
      break;
    case 'grabplayer':
      net?.send({ t: 'ev', k: 'grab', to: d.to, side: d.side, part: d.part, a: d.a, on: 1 });
      updateHotbar();
      break;
    case 'releaseplayer':
      net?.send({ t: 'ev', k: 'grab', to: d.to, side: d.side, on: 0, v: d.v });
      updateHotbar();
      break;
    case 'gripbreak': // me zafé (o reaparecí): el que me tenía tiene que soltarme
      net?.send({ t: 'ev', k: 'gbrk', to: d.to, side: d.side });
      break;
    case 'grab':
    case 'release':
      updateHotbar();
      break;
    case 'respawn':
      net?.send({ t: 'ev', k: 'rs' });
      break;
    case 'throwitem': {
      const L = state.local;
      const dir = G.camera.getWorldDirection(new THREE.Vector3());
      const v = L.handVelocity(d.side);
      if (v.length() > 2.5) {
        const pos = L.handPos(d.side, new THREE.Vector3());
        state.props.spawnThrow(d.item === 'beer' ? 'bottle' : 'spraycan', pos, v.multiplyScalar(1.4).addScaledVector(dir, 3));
      }
      updateHotbar();
      break;
    }
    default:
      break;
  }
}

function onCrash(v, speed, other) {
  const L = state.local;
  state.shake = Math.min(1, (state.shake || 0) + speed / 10);
  state.net?.send({ t: 'ev', k: 'crash', x: +v.pos.x.toFixed(2), z: +v.pos.z.toFixed(2), s: +speed.toFixed(1) });
  if (!L || L.vehicle !== v) return;
  if (speed > 7.5) {
    // salir despedido
    const dir = new THREE.Vector3(Math.sin(v.yaw), 0.4, Math.cos(v.yaw)).multiplyScalar(speed * 0.9);
    L.damage((speed - 7) * 6);
    L.eject(dir);
    state.vehicles.exitCurrent();
    bigMessage('¡PALO!', 'Saliste volando del vehículo', 1800);
  } else if (speed > 4) L.damage((speed - 4) * 2);
  void other;
}

function setupNetHandlers(net) {
  net.on('welcome', (m) => {
    G.myId = m.id; G.settings = { ...G.settings, ...(m.settings || {}) };
    state.welcome = m; state.media = m.media || {}; G.media?.applyAll(state.media);
    for (const old of G.players.values()) old.dispose(); G.players.clear(); clearNameTags();
    for (const p of m.players || []) { const rp = new RemotePlayer(p); G.players.set(rp.id, rp); }
    G.voice?.connectAll((m.players || []).map((p) => p.id));
    if (m.poker) G.poker?.applyState(m.poker);
    if (m.fb) G.football?.applyState(m.fb);
    state.props.load(m.props || []);
    state.vehicles.load(m.vehicles || []);
    renderPlayerList();
    updateDesmadreUI();
  });
  net.on('pjoin', (m) => {
    if (!m.p || m.p.id === G.myId) return;
    G.players.get(m.p.id)?.dispose();
    const rp = new RemotePlayer(m.p); G.players.set(rp.id, rp); ensureNameTag(rp); renderPlayerList();
  });
  net.on('pleave', (m) => { const p = G.players.get(m.id); p?.dispose(); G.players.delete(m.id); removeNameTag(m.id); G.voice?.remove(m.id); renderPlayerList(); });
  net.on('rtc', (m) => G.voice?.onSignal(m.from, m.d));
  net.on('pk', (m) => G.poker?.applyState(m.st));
  net.on('fbs', (m) => G.football?.applyState(m.st));
  net.on('fbgoal', (m) => {
    G.football?.applyState({ score: m.score, running: G.football.running, time: G.football.time });
    bigMessage('¡GOOOOL!', `${m.team === 0 ? 'ROJO' : 'AZUL'} · ${m.name || ''}`, 3000);
    G.sfx?.trigger('ui-ok', null, 0.9);
    if (G.fx && G.football) G.fx.confetti(G.football.ballPos.clone().add(new THREE.Vector3(0, 1, 0)), 80);
  });
  net.on('fbout', (m) => {
    killfeed(m.kind === 'lateral' ? '⚽ Afuera: saque lateral' : '⚽ Afuera: saque de arco');
    G.sfx?.trigger('ui', null, 0.5);
  });
  net.on('pkc', (m) => G.poker?.setCards(m));
  net.on('pke', (m) => G.poker?.event(m));
  net.on('look', (m) => G.players.get(m.id)?.setLook(m.look));
  net.on('snap', (m) => {
    for (const [id, st] of m.P || []) if (id !== G.myId) G.players.get(id)?.applyState(st, false, m.ts);
    state.props.handleSnap(m.R || []);
    if (m.B) G.football?.applyPacket(m.B, m.ts);
    state.vehicles.handleSnap(m.V || []);
  });
  net.on('chat', (m) => { addChat('', { html: `<b style="color:${G.players.get(m.id)?.color || '#fff'}">${escapeHtml(nameOf(m.id))}</b>${escapeHtml(m.m)}` }); chatBubble(m.id, m.m); });
  net.on('sys', (m) => addChat(m.m, { sys: true, color: m.c }));
  net.on('ev', handleEvent);
  net.on('cut', (m) => G.grass.cut(m.s || [], true));
  net.on('gt', (m) => G.grass.growTo(m.n));
  net.on('po', (m) => { state.props.handleOwnership(m); updateHotbar(); });
  net.on('pa', (m) => {
    const p = state.props.addRow(m.pr);
    // algo revoleado por otro (una birra, un aerosol): peligroso por un rato
    if (p && m.v) { p.thrownAt = performance.now(); p.thrownBy = m.pr[9] || 0; }
  });
  net.on('pd', (m) => { state.props.remove(m.id); updateHotbar(); });
  net.on('vs', (m) => state.vehicles.handleSeats(m));
  net.on('vreset', (m) => state.vehicles.handleReset(m));
  net.on('ms', (m) => { state.media[m.s] = m.st; G.media?.apply(m.s, m.st); if (state.mediaScreen === m.s) renderMedia(); });
  net.on('set', (m) => { G.settings = { ...G.settings, ...(m.settings || {}) }; updateDesmadreUI(); });
  net.on('close', () => {
    if (!G.inGame) return;
    G.inGame = false; G.input.enabled = false; G.sfx?.stop(); G.media?.stop();
    bigMessage('DESCONECTADO', 'Recargá la página para volver a entrar', 6000);
  });

  net.onBin(1, (u8) => G.grass.applyFull(u8).catch((e) => console.warn('grass full', e)));
  net.onBin(2, (u8) => state.graffiti.applyFullPacket(u8));
  net.onBin(3, (u8) => state.graffiti.applyDotsPacket(u8));
}

function updateMicUI() {
  const el = $('mic-state');
  if (!el) return;
  const st = G.voice ? G.voice.status() : { cls: 'mic-off', text: '🎙 Voz: entrá a una sala' };
  el.textContent = st.text;
  el.className = st.cls;
}

function updateDesmadreUI() {
  $('p-desmadre').classList.toggle('on', !!G.settings.desmadre);
  $('desmadre-tag').classList.toggle('hidden', !G.settings.desmadre);
}

async function joinGame() {
  G.sfx?.unlock(); // user gesture, BEFORE awaiting the connection
  if (state.reconnecting) return;
  const name = $('m-name').value.trim() || 'Anónimo';
  const room = ($('m-room').value.trim() || 'principal').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24) || 'principal';
  const look = readLook();
  $('m-err').textContent = 'Conectando...';
  localStorage.setItem('dukes.look', JSON.stringify(look));
  localStorage.setItem('dukes.name', name); localStorage.setItem('dukes.room', room);

  if (G.inGame && state.local) {
    if (room !== state.room || name !== state.joinedName) {
      // El protocolo actual no tiene rename/cambio de sala en caliente: recargar hace un join limpio.
      location.href = `${location.pathname}?sala=${encodeURIComponent(room)}`;
      return;
    }
    state.local.setLook(look); state.net.send({ t: 'look', look });
    $('m-err').textContent = ''; resumeGame(); return;
  }

  state.reconnecting = true;
  try {
    state.local = new LocalPlayer(look); state.local.name = name; G.me = state.local;
    state.net = new Net(); G.net = state.net;
    G.voice?.dispose();
    G.voice = new VoiceChat({ net: state.net, opts: G.opts, getCtx: () => G.sfx?.ctx, onState: updateMicUI });
    G.media?.dispose();
    G.media = new YouTubeScreenManager({ scene: G.scene, net: state.net, opts: G.opts, changed: (id) => { if (state.mediaScreen === id) renderMediaStatus(); } });
    state.props = new PropManager(state.net, state.local); G.props = state.props;
    state.props.onBreak = (p, pos, def, how) => {
      if (how === 'chop') G.fx?.clippings(pos, new THREE.Vector3(0, 1, 0), 10);
      if (def.glass) { G.fx?.glass(pos, 22, def.glass); G.sfx?.trigger('glass', pos, 0.9); }
      else if (def.splat) { G.fx?.blood(pos, new THREE.Vector3(0, 1, 0), 1.2); G.sfx?.trigger('hit', pos, 0.9); }
      else { G.fx?.glass(pos, 14, p.type === 'gnome' ? 0xd8413a : 0x7a5a3a); G.sfx?.trigger('hit', pos, 0.9); }
    };
    state.local.onEvent = onLocalEvent;
    state.vehicles = new VehicleManager(state.net, state.local); G.vehicles = state.vehicles;
    state.vehicles.onCrash = onCrash;
    state.graffiti = new GraffitiManager(G.scene, state.net); G.graffiti = state.graffiti;
    G.poker = new PokerView({
      scene: G.scene, net: state.net, tables: G.world.pokerTables || [], seats: G.world.seats || [],
      // sentado a la mesa el mouse sigue capturado: se mira alrededor y se juega con el teclado (sin botones)
      onSit: (seat) => { state.local.sitAt({ ...seat, poker: true }); setMode('poker'); if (!G.input.locked) setTimeout(() => G.input.lock(), 0); },
      onLeave: () => { if (state.local?.seat) state.local.standUp(); if (state.mode === 'poker') { setMode('game'); setTimeout(() => G.input.lock(), 0); } },
      onAct: (act) => state.local?.pokerGesture(act),
    });
    setupNetHandlers(state.net);
    await state.net.connect(room, name, look);
    G.inGame = true; G.sfx?.trigger('ui', null, .35); state.eyeOffset = undefined; state.room = room; state.joinedName = name;
    $('m-err').textContent = '';
    state.viewYaw = state.local.yaw;
    setMode('game');
    history.replaceState(null, '', `${location.pathname}?sala=${encodeURIComponent(room)}`);
    setTimeout(() => G.input.lock(), 0);
    // bienvenida: cómo descubrir lo que hay para hacer (un aviso chico que se va solo)
    setTimeout(() => G.hud?.notify('<b>J</b> = ¿qué hacemos? Póker, fútbol, cortadoras, cine, graffiti... Los carteles flotantes marcan cada lugar.', 7000), 1500);
  } catch (e) {
    console.error(e); $('m-err').textContent = e.message || String(e);
    state.local?.dispose(); state.local = null; G.me = null; G.media?.dispose(); G.media = null; G.sfx?.stop(); state.net?.close();
  } finally { state.reconnecting = false; }
}

function setupUIEvents() {
  $('m-play').addEventListener('click', joinGame);
  $('p-resume').addEventListener('click', resumeGame);
  $('p-respawn').addEventListener('click', () => { state.local?.respawn(); resumeGame(); });
  $('p-char').addEventListener('click', () => { setMode('menu'); G.input.unlock(); $('m-play').textContent = 'APLICAR Y VOLVER'; });
  $('p-desmadre').addEventListener('click', () => state.net?.send({ t: 'set', k: 'desmadre', v: !G.settings.desmadre }));

  $('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); sendChat(); }
    else if (e.key === 'Escape') { e.preventDefault(); closeChat(true); }
  });

  $('audio-toggle').addEventListener('click', () => {
    if (G.sfx?.ctx?.state !== 'running' || G.opts.muted) { G.opts.muted = false; G.sfx?.unlock(); }
    else G.opts.muted = true;
    saveAudioOptions();
  });
  $('audio-test').addEventListener('click', () => { G.sfx?.test(); updateAudioUI(); });
  $('o-mute').addEventListener('change', (e) => { G.opts.muted = e.target.checked; G.sfx?.unlock(); saveAudioOptions(); });
  $('o-ambient').addEventListener('input', (e) => { G.opts.volAmbient = +e.target.value; saveAudioOptions(); });
  $('p-media').addEventListener('click', () => openMedia(G.media?.nearest(state.local.pos)));
  $('media-close').addEventListener('click', closeOverlayToGame);
  $('media-screen').addEventListener('change', (e) => openMedia(e.target.value));
  $('media-unlock').addEventListener('click', () => { G.sfx?.unlock(); G.media?.unlock(state.mediaScreen); });
  $('media-retry').addEventListener('click', () => G.media?.retry(state.mediaScreen));
  $('media-url').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('media-add').click(); } });
  $('media-add').addEventListener('click', () => {
    const v = youtubeId($('media-url').value);
    if (!v) { $('media-input-error').textContent = 'Pegá un enlace de video de YouTube. Las listas sin un video seleccionado no se importan.'; return; }
    $('media-input-error').textContent = '';
    G.media?.unlock(state.mediaScreen); G.sfx?.unlock();
    state.net.send({ t: 'media', s: state.mediaScreen, a: 'add', v }); $('media-url').value = '';
  });
  $('media-play').addEventListener('click', () => {
    const m = mediaState(state.mediaScreen); if (!m.cur) return;
    G.media?.unlock(state.mediaScreen);
    state.net.send({ t: 'media', s: state.mediaScreen, a: m.cur.paused ? 'play' : 'pause' });
  });
  $('media-skip').addEventListener('click', () => state.net.send({ t: 'media', s: state.mediaScreen, a: 'skip' }));
  $('media-back').addEventListener('click', () => {
    const m = mediaState(state.mediaScreen); if (m.cur) state.net.send({ t: 'media', s: state.mediaScreen, a: 'seek', pos: Math.max(0, mediaPos(m) - 10) });
  });
  $('media-fwd').addEventListener('click', () => {
    const m = mediaState(state.mediaScreen); if (m.cur) state.net.send({ t: 'media', s: state.mediaScreen, a: 'seek', pos: mediaPos(m) + 10 });
  });

  document.querySelectorAll('#emotes button').forEach((b) => b.addEventListener('click', () => {
    const e = b.dataset.e; state.local?.setEmote(e); state.net?.send({ t: 'ev', k: 'emote', e }); closeOverlayToGame();
  }));

  $('o-sens').addEventListener('input', (e) => { G.opts.sens = +e.target.value; });
  $('o-fov').addEventListener('input', (e) => { G.opts.fov = +e.target.value; G.camera.fov = G.opts.fov; G.camera.updateProjectionMatrix(); });
  $('o-vol').addEventListener('input', (e) => { G.opts.vol = +e.target.value; saveAudioOptions(); });
  $('o-music').addEventListener('input', (e) => { G.opts.volMusic = +e.target.value; saveAudioOptions(); });
  $('o-voice').addEventListener('input', (e) => { G.opts.volVoice = +e.target.value; });
  $('o-sfx').addEventListener('input', (e) => { G.opts.volSfx = +e.target.value; saveAudioOptions(); });
  $('o-voicemode').addEventListener('change', (e) => { G.opts.voiceMode = e.target.value; G.voice?._applyTrackEnabled(); updateMicUI(); });
  $('o-spatial').addEventListener('change', (e) => { G.opts.voiceSpatial = e.target.checked; });
  $('o-invert').addEventListener('change', (e) => { G.opts.invertY = e.target.checked; });
  $('o-hints').addEventListener('change', (e) => G.hud?.setHintMode(e.target.value));
  $('o-grass').addEventListener('change', (e) => { G.opts.grass = e.target.value; G.grass.build(G.opts.grass); });

  addEventListener('keydown', (e) => {
    if (!G.inGame) return;
    const typing = e.target?.matches?.('input, textarea, select, [contenteditable="true"]');
    if (!typing && !e.repeat && ['game', 'poker'].includes(state.mode)) {
      if (e.code === 'KeyM') { G.sfx?.unlock(); G.voice?.toggleMic(); }
      if (e.code === 'KeyV') { G.sfx?.unlock(); G.voice?.setPTT(true); }
    }
    if (state.mode === 'activities' && (e.key === 'Escape' || e.code === 'KeyJ')) { e.preventDefault(); closeOverlayToGame(); return; }
    if (state.mode === 'media' || state.mode === 'emotes' || state.mode === 'palette') {
      if (e.key === 'Escape' || (state.mode === 'palette' && e.code === 'KeyR')) { e.preventDefault(); closeOverlayToGame(); }
    } else if (state.mode === 'pause' && e.key === 'Escape') { e.preventDefault(); resumeGame(); }
    else if (state.mode === 'poker' && !typing) {
      // póker: las teclas de la mesa primero (apostar, pasar, retirarse, ver jugadas); X se levanta; T/Enter chat
      if (G.poker?.key(e, true)) { e.preventDefault(); return; }
      if (e.code === 'KeyX') { e.preventDefault(); G.poker?.leave(); }
      else if ((e.code === 'KeyT' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); openChat(); }
    }
  });
  addEventListener('keyup', (e) => {
    if (e.code === 'KeyV') G.voice?.setPTT(false);
    if (state.mode === 'poker' && G.poker?.key(e, false)) e.preventDefault();
  });
  addEventListener('blur', () => G.voice?.setPTT(false));
}

function mediaPos(m) { return mediaPosition(m.cur, state.net.now()); }

function updateInput(dt) {
  if (state.mode !== 'game' || !G.input.locked || !state.local) return;
  const L = state.local;
  const inp = G.input;
  const sens = 0.0022 * G.opts.sens;
  // al subirte a un vehículo la mirada baja un poco: se ven el volante, el tablero y las manos
  if (!!L.vehicle !== !!state.driving) {
    state.driving = L.vehicle || null;
    if (L.vehicle) { state.viewYaw = L.vehicle.yaw; state.viewPitch = Math.min(state.viewPitch, -0.3); }
  }
  const painting = L.hands.r.item === 'spray';
  const driving = !!L.vehicle;
  const onFoot = !driving && !L.seat;
  const down = L.dead || L.state === 'ko';
  // los dos clicks: guardia (manos arriba, la cámara sigue libre)
  const bothHeld = inp.btn(0) && inp.btn(2) && !painting && !driving && !down;
  L.setGuard(bothHeld);
  // brazo controlado con el mouse (Half Sword): el mouse mueve la mano; lo que sobra al llegar al tope del
  // brazo gira el cuerpo (el brazo arrastra). Pintando, la mira sigue a la cámara.
  const armOn = L.armActive() && !painting;
  let mx = inp.dx, my = inp.dy;
  if (armOn) { const o = L.moveArms(inp.dx, inp.dy); mx = o[0] * 0.6; my = o[1] * 0.6; }
  state.viewYaw -= mx * sens;
  state.viewPitch -= my * sens * (G.opts.invertY ? -1 : 1);
  state.viewPitch = clamp(state.viewPitch, -1.32, 1.32);
  L.aimPitch = state.viewPitch;

  if (inp.hit('Space') && onFoot) L.queueJump();
  // X usa el mundo; E y Q solo agarran/sueltan (derecha/izquierda). Nunca se pisan.
  if (inp.hit('KeyX')) interact();
  if (!driving && !down) {
    if (inp.hit('KeyE')) { if (L.toggleGrab('r')) G.sfx?.trigger('pickup', null, 0.4); updateHotbar(); }
    if (inp.hit('KeyQ')) { if (L.toggleGrab('l')) G.sfx?.trigger('pickup', null, 0.4); updateHotbar(); }
    if (inp.hit('KeyG')) quickThrow();
  }
  if (inp.hit('KeyF') && onFoot) L.kick();
  if (inp.hit('KeyR') && onFoot) L.headbutt();
  if (inp.hit('KeyZ')) openEmotes();
  if (inp.hit('KeyJ')) openActivities();
  if (inp.hit('KeyB') && L.hands.r.item === 'spray') openPalette();
  // rueda del mouse: tamaño del aerosol, o qué tan estirado va el brazo que controlás
  if (inp.wheel) {
    if (painting) {
      const el = $('pal-size');
      el.value = String(clamp(+el.value - inp.wheel * 0.03, 0.03, 0.7));
    } else if (armOn) L.armWheel(inp.wheel);
    inp.wheel = 0;
  }
  if (inp.hit('KeyP')) openMedia(G.media?.nearest(L.pos));
  if (inp.hit('KeyH') && L.vehicle && performance.now() - (state.lastHorn || 0) > 750) {
    state.lastHorn = performance.now(); G.sfx?.trigger('horn', null, 0.75); state.net?.send({ t: 'ev', k: 'horn' });
  }
  if (inp.hit('KeyT') || inp.hit('Enter')) openChat();
  if (inp.hit('Tab')) renderPlayerList();
  if (inp.hit('KeyC')) state.cameraMode = (state.cameraMode + 1) % 3;
  const items = [null, 'beer', 'smoke', 'spray', null];
  for (let i = 1; i <= 4; i++) {
    if (inp.hit(`Digit${i}`) && !down && !(driving && i === 3)) {
      if (i === 4) L.release('r', false);
      else L.giveItem(items[i]);
      G.sfx?.trigger('pickup', null, 0.25);
      updateHotbar();
    }
  }

  // brazos: click corto = usar / piña; sostenido = controlar el brazo con el mouse (parado o sentado)
  const now = performance.now();
  state.press = state.press || { l: 0, r: 0 };
  for (const [btn, side] of [[0, 'r'], [2, 'l']]) {
    if (down) { L.armControl(side, false); continue; }
    if (side === 'r' && painting) { L.armControl('r', inp.btn(0) && !driving); continue; }
    if (inp.btnHit(btn)) state.press[side] = now;
    if (bothHeld) { L.armControl(side, false); state.press[side] = -1e9; continue; } // la guardia no dispara piñas al soltar
    if (inp.btn(btn) && now - state.press[side] > 170 && !L.arm[side].on && !driving) L.armControl(side, true);
    if (inp.btnUp(btn)) {
      if (now - state.press[side] <= 170) doTap(side);
      L.armControl(side, false);
    }
  }

  // aerosol
  if (painting && inp.btn(0) && !driving) {
    state.sprayT -= dt;
    if (state.sprayT <= 0) {
      state.sprayT = 0.045;
      const origin = L.handPos('r', new THREE.Vector3());
      const hit = state.graffiti.spray(G.camera, {
        origin,
        maxReach: 3.2,
        isBlocked: (from, to) => {
          const delta = to.clone().sub(from), length = delta.length();
          if (length < 0.05) return false;
          delta.divideScalar(length);
          const solid = G.phys.raycast(from.x, from.y, from.z, delta.x, delta.y, delta.z, length);
          return !!solid && solid.dist < length - 0.06;
        },
        color: $('pal-color').value,
        size: +$('pal-size').value,
        alpha: +$('pal-alpha').value,
        erase: $('pal-erase').checked,
        drip: $('pal-drip').checked,
      });
      if (hit) {
        G.camera.getWorldDirection(tmpV);
        G.fx?.spray(hit.point.clone().addScaledVector(hit.normal, 0.05), tmpV, $('pal-color').value);
      }
    }
  } else state.sprayT = 0;
}

// Lo que se empuña queda en el puño: la muñeca gira para agarrar el mango y eso corre el puño respecto del
// antebrazo; se corre lo que se ve (la física del objeto sigue al brazo)
function snapHeldToFists() {
  const fix = (char, pid, side) => {
    const p = pid ? state.props.get(pid) : null;
    if (!p?.group || !char?.fistWorld || !char.gripOn?.[side] || !(char.gripRadius?.[side] > 0) || !p.def?.grip) return;
    const fist = char.fistWorld(side, tmpV);
    const g = p.def.grip;
    const gw = tmpV2.set(g[0], g[1], g[2]).applyQuaternion(p.group.quaternion).add(p.group.position);
    if (fist.distanceToSquared(gw) < 0.04) p.group.position.add(fist.sub(gw));
  };
  const L = state.local;
  if (L?._heldList) for (const { p, side } of L._heldList()) fix(L.char, p.id, side);
  for (const rp of G.players.values()) {
    const s = rp.stateData;
    if (!s) continue;
    const two = s.hd && s.hd === s.hl;
    if (s.hd) fix(rp.char, s.hd, two ? (s.tw === 'l' ? 'l' : 'r') : 'r');
    if (s.hl && !two) fix(rp.char, s.hl, 'l');
  }
}

function updateCamera(dt) {
  const L = state.local; if (!L) return;
  const pitch = state.viewPitch;
  const cp = Math.cos(pitch);
  const fwd = tmpV.set(Math.sin(state.viewYaw) * cp, Math.sin(pitch), Math.cos(state.viewYaw) * cp).normalize();
  const down = L.state === 'ko' || L.state === 'dead';
  const mode = down ? 0 : state.cameraMode;
  state.shake = Math.max(0, (state.shake || 0) - dt * 2.5);
  stepCamKick(dt);
  const sh = state.shake * 0.08, tt = G.time || 0;
  const shx = sh * (Math.sin(tt * 43.1) * 0.6 + Math.sin(tt * 67.7 + 1.3) * 0.4) * 0.6;
  const shy = sh * (Math.sin(tt * 51.3 + 2.1) * 0.6 + Math.sin(tt * 79.1) * 0.4) * 0.6;
  if (mode === 2) {
    // primera persona: los ojos del cuerpo. Se suaviza solo el bamboleo de la cabeza RESPECTO del cuerpo
    // (antes se suavizaba la posición absoluta y a velocidad la cámara quedaba atrás, dentro del torso)
    const head = L.char.headWorld(tmpV2);
    head.addScaledVector(fwd, 0.1);
    head.y += 0.03;
    const base = L.vehicle || L.seat ? L.pos : L.renderPos;
    const off = head.sub(base);
    state.eyeOff = state.eyeOff || off.clone();
    state.eyeOff.lerp(off, 1 - Math.exp(-30 * dt));
    state.eye = (state.eye || new THREE.Vector3()).copy(base).add(state.eyeOff);
    G.camera.position.copy(state.eye);
    G.camera.position.x += shx; G.camera.position.y += shy;
    G.camera.lookAt(state.eye.clone().addScaledVector(fwd, 10));
    G.camera.rotateX(camKick.a.x); G.camera.rotateY(camKick.a.y); G.camera.rotateZ(camKick.a.z);
    L.char.setVisibleHead(false);
    return;
  }
  L.char.setVisibleHead(true);
  // tercera persona: pivote en el cuerpo (si está tirado, sigue a la pelvis)
  let pivot;
  if (down) {
    const pt = L.rag.pelvis().translation();
    pivot = new THREE.Vector3(pt.x, pt.y + 0.6, pt.z);
  } else pivot = L.renderPos.clone().add(new THREE.Vector3(0, L.seat || L.vehicle ? 1.3 : 1.62, 0));
  let dist = mode === 0 ? 4.2 : 2.4;
  if (L.vehicle) dist += 1.8;
  if (down) dist = 3.6;
  const side = mode === 1 ? 0.45 : 0.25;
  const right = new THREE.Vector3(-Math.cos(state.viewYaw), 0, Math.sin(state.viewYaw));
  const desired = pivot.clone().addScaledVector(fwd, -dist).addScaledVector(right, -side);
  const dir = desired.clone().sub(pivot); const len = dir.length(); dir.normalize();
  const hit = G.phys.raycast(pivot.x, pivot.y, pivot.z, dir.x, dir.y, dir.z, len, groups(0xffff, GR.WORLD));
  if (hit && hit.dist < len) desired.copy(pivot).addScaledVector(dir, Math.max(0.45, hit.dist - 0.18));
  const k = 1 - Math.exp(-16 * dt);
  G.camera.position.lerp(desired, k);
  G.camera.position.x += shx; G.camera.position.y += shy;
  G.camera.lookAt(pivot.clone().addScaledVector(right, -side));
  G.camera.rotateX(camKick.a.x); G.camera.rotateY(camKick.a.y); G.camera.rotateZ(camKick.a.z);
}

// Sacudón de la cámara: resorte en cabeceo (x), giro (y) y rolido (z) que los golpes patean
const camKick = { a: new THREE.Vector3(), v: new THREE.Vector3() };
function stepCamKick(dt) {
  const w = 24, z = 0.5, n = Math.max(1, Math.ceil(dt * 240)), h = dt / n, a = camKick.a, v = camKick.v;
  for (let i = 0; i < n; i++) {
    v.x += (-w * w * a.x - 2 * z * w * v.x) * h;
    v.y += (-w * w * a.y - 2 * z * w * v.y) * h;
    v.z += (-w * w * a.z - 2 * z * w * v.z) * h;
    a.addScaledVector(v, h);
  }
  a.clampScalar(-0.35, 0.35);
}
// me pegaron: la vista se va hacia donde me empujan ((nx, nz) = empujón, k = fuerza)
function camHit(nx, nz, k) {
  const fx = Math.sin(state.viewYaw), fz = Math.cos(state.viewYaw);
  const f = nx * fx + nz * fz, l = nx * fz - nz * fx;
  camKick.v.x += -f * 2.4 * k;
  camKick.v.y += l * 1.1 * k;
  camKick.v.z += l * 1.8 * k;
}

function updateHud(dt) {
  if (!state.local) return;
  const z = zoneAt(state.local.pos.x, state.local.pos.z);
  $('zone').textContent = z ? ZONES[z].name : 'Afueras';
  $('pvp').classList.toggle('hidden', !(G.settings.desmadre || isPvpAt(state.local.pos.x, state.local.pos.z)));
  $('ping').textContent = Math.round(state.net?.rtt || 0);
  $('pcount').textContent = G.players.size + 1;
  // marcador del fútbol cuando estás cerca de la cancha
  const fb = G.football;
  const nearField = fb && Math.abs(state.local.pos.x - FIELD.cx) < FIELD.boardX + 14 && Math.abs(state.local.pos.z - FIELD.cz) < FIELD.boardZ + 14;
  show($('fb-score'), !!nearField);
  if (nearField) {
    $('fb-a').textContent = fb.score[0]; $('fb-b').textContent = fb.score[1];
    $('fb-clock').textContent = fb.clock() || 'amistoso';
    if (state.mode === 'game' && !state.local.vehicle) {
      G.hud?.hint('fb-kick', 'F', 'Patear (corré contra la pelota para llevarla)');
      if (!fb.running) G.hud?.hint('fb-start', 'X', 'En el cartel ⚽ del costado: partido de 5 min');
    }
  }
  const pct = G.grass.percent || 0; $('lawn-pct').textContent = `${pct.toFixed(0)}%`; $('lawn-bar').style.width = `${Math.min(100, pct)}%`;
  document.querySelector('#st-hp .bar i').style.width = `${state.local.hp}%`;
  document.querySelector('#st-blood .bar i').style.width = `${state.local.blood}%`;
  document.querySelector('#st-drunk .bar i').style.width = `${Math.min(100, state.local.drunk * 100)}%`;
  document.querySelector('#st-high .bar i').style.width = `${Math.min(100, state.local.high * 100)}%`;
  // sangre, birra y faso solo se ven cuando importan (menos cosas en pantalla)
  $('st-blood').classList.toggle('off', state.local.blood > 97);
  $('st-drunk').classList.toggle('off', state.local.drunk < 0.03);
  $('st-high').classList.toggle('off', state.local.high < 0.03);
  $('drunk-lbl').textContent = state.local.drunk > 0.65 ? 'en pedo' : state.local.drunk > 0.2 ? 'entonado' : '';
  $('high-lbl').textContent = state.local.high > 0.65 ? 'volando' : state.local.high > 0.2 ? 'relajado' : '';
  const v = state.local.vehicle;
  show($('vehicle-hud'), !!v);
  $('hud').classList.toggle('driving', !!v);
  if (v) {
    $('speed').textContent = Math.round(Math.abs(v.speed || 0) * 3.6);
    $('blades-state').textContent = v.type === 'cart' ? 'no tiene' : v.blades ? 'prendidas' : 'apagadas';
    $('blades-state').classList.toggle('on', !!v.blades);
  }
  show($('spray-info'), state.selected === 3 && state.mode === 'game');
  $('spray-swatch').style.background = $('pal-color').value;
  $('spray-size').textContent = `Tamaño ${Math.round(+$('pal-size').value * 100)} cm`;
  if (state.hurt > 0) state.hurt = Math.max(0, state.hurt - dt * 2.4);
  if (state.local.dead && state.local.deadT > 4) state.local.respawn();
}

function updatePost() {
  if (!state.local) return;
  const u = G.post.u;
  u.uDrunk.value = state.local.drunk;
  u.uHigh.value = state.local.high;
  u.uHurt.value = state.hurt;
  u.uLowBlood.value = clamp((40 - state.local.blood) / 40, 0, 1);
  u.uBlack.value = state.local.dead ? clamp(state.local.deadT / 2, 0, 0.85) : 0;
}

function benders() {
  const a = [];
  if (state.local) a.push({ x: state.local.pos.x, z: state.local.pos.z, r: 0.65, s: 1 });
  for (const p of G.players.values()) a.push({ x: p.pos.x, z: p.pos.z, r: 0.6, s: 0.9 });
  return a;
}

async function boot() {
  try {
    status('Iniciando motor...');
    const canvas = $('game');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setSize(innerWidth, innerHeight);
    renderer.setClearColor(0x000000, 0); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.86;
    installFarShadowChunk(); // sombra lejana horneada + la dinámica de cerca (antes de compilar materiales)
    setMaxAniso(renderer.capabilities.getMaxAnisotropy()); G.renderer = renderer;
    G.scene = new THREE.Scene(); G.camera = new THREE.PerspectiveCamera(G.opts.fov, innerWidth / innerHeight, 0.05, 3000);

    status('Cargando física...'); G.phys = new Physics(); await G.phys.init();
    status('Cargando personajes...');
    await preloadHumans((n, total) => status(`Cargando personajes... ${n}/${total}`));
    status('Cargando objetos...');
    registerManifest(ASSET_MANIFEST);
    await preloadAssets((n, total) => status(`Cargando objetos... ${n}/${total}`));
    status('Construyendo el mundo...'); G.world = new World(G.scene, G.phys); G.world.build(renderer, G.opts.shadows);
    G.grass = new Grass(G.scene); G.grass.setMask(G.world.mask); G.grass.makeLawnGround(); G.grass.build(G.opts.grass);
    G.post = new Post(renderer, G.scene, G.camera, { bloom: G.opts.shadows !== 'baja', ao: G.opts.shadows !== 'baja' }); G.fx = new FX(G.scene); G.blood = new Decals(G.scene);
    G.post.vol?.setShafts(G.world.castle?.shafts || [], G.world.storm, { x0: -40, x1: 40, z0: -140, z1: -80 });
    G.gore = new Gore(G.scene, G.phys);
    G.football = new FootballView(G.scene);
    G.markers = new ActivityMarkers(G.scene);
    G.hud = new Hud();
    // bolsa de boxeo al lado del ring (física local, para practicar)
    G.bag = new PunchBag(G.scene, G.phys, 111.2, -36.4);
    G.bag.onHit = (speed, at) => {
      G.sfx?.trigger(speed > 6 ? 'hit' : 'hit-soft', at, Math.min(1, 0.3 + speed / 12));
      showHitMeter(speed);
    };
    G.fx.onBloodLand = (x, z, size) => G.blood.add(x, z, size);
    G.input = new Input(canvas); G.input.enabled = false;
    G.input.onLockChange = (locked) => { if (!locked && G.inGame && state.mode === 'game') openPause(); };
    canvas.addEventListener('click', () => { if (G.inGame && (state.mode === 'game' || state.mode === 'poker') && !G.input.locked) G.input.lock(); });

    G.sfx = new AudioEngine({ opts: G.opts, changed: updateAudioUI });
    G.sfx.setSamples(SFX_MANIFEST);
    // castillo del terror: sustos, apariciones y cosas para usar; la tormenta y el castillo suenan por el motor
    G.hudMessage = (title, text) => bigMessage(title, text, 2600);
    try { G.haunt = new Haunt(G.world, { onScare: (k) => { state.shake = Math.max(state.shake || 0, 0.9 * k); } }); } catch (e) { console.warn('castillo: sustos', e); }
    G.sfx.ambientHook = (dt, sfx) => {
      const st = G.world?.storm;
      if (st) { sfx.birdMute = st.s; st.ambience(dt, sfx); }
      G.haunt?.ambience(dt, sfx);
    };
    populateSwatches(); setupModelPicker(); setupMenuDefaults(); setupHotbar(); setupUIEvents();
    addEventListener('pagehide', () => { G.sfx?.stop(); G.media?.stop(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { G.sfx?.stop(); G.media?.stop(); } });
    // texturas, modelos del castillo y shaders listos antes de mostrar nada (al entrar no aparece nada a medio cargar)
    status('Cargando texturas y modelos...');
    await Promise.race([Promise.allSettled([pbrReady(), G.world.castleAssets]), new Promise((r) => setTimeout(r, 20000))]);
    status('Preparando luces, sombras y materiales...');
    await precompileScene(renderer);
    show($('loading'), false); setMode('menu');
  try { state.preview = new AvatarPreview($('avatar-preview'), readLook()); }
  catch (error) { console.warn('Avatar preview unavailable', error); $('avatar-preview').textContent = 'Vista previa no disponible en este navegador.'; }


    addEventListener('resize', () => {
      renderer.setSize(innerWidth, innerHeight); G.camera.aspect = innerWidth / innerHeight; G.camera.updateProjectionMatrix(); G.post.setSize(innerWidth, innerHeight);
    });

    let last = performance.now();
    let lastErr = 0;
    // resolución dinámica: si el juego no llega a ~48 fps baja un poco la resolución interna; si sobra, la sube
    const DYN = { ema: 16.7, t: 0, pr: renderer.getPixelRatio(), max: Math.min(devicePixelRatio || 1, 1.5), min: 0.7 };
    function dynRes(dt) {
      if (document.hidden || !G.inGame) return;
      DYN.ema += (dt * 1000 - DYN.ema) * 0.05;
      DYN.t += dt;
      if (DYN.t < 2.5) return;
      let pr = DYN.pr;
      if (DYN.ema > 21 && pr > DYN.min) pr = Math.max(DYN.min, +(pr - 0.1).toFixed(2));
      else if (DYN.ema < 12.5 && pr < DYN.max) pr = Math.min(DYN.max, +(pr + 0.1).toFixed(2));
      DYN.t = pr !== DYN.pr ? 0 : 2;
      if (pr === DYN.pr) return;
      DYN.pr = pr;
      renderer.setPixelRatio(pr);
      G.post.setPixelRatio(pr);
      G.post.setSize(innerWidth, innerHeight);
    }
    function frame(now) {
      // se agenda primero: un error en un frame no congela el juego
      requestAnimationFrame(frame);
      if (window.__dukesPause) { last = now; return; }
      step(now);
    }
    // depuración: window.__dukesStep(ms) avanza un cuadro a mano; window.__dukesPause congela el loop
    window.__dukesStep = (ms = 1000 / 60) => step(last + ms);
    function step(now) {
      try {
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000)); last = now; G.time += dt; G.dt = dt; G.frame++;
      dynRes(dt);
      if (G.inGame && state.local) {
        updateInput(dt);
        G.phys.step(dt, (fd) => { state.local.physicsStep(fd, state.viewYaw); state.props.physicsStep(fd); }, () => state.local.afterPhysics());
        state.vehicles.update(dt); state.local.update(dt);
        for (const p of G.players.values()) p.update(dt);
        state.props.update(dt); // attach props after local and remote skeletons have animated
        snapHeldToFists();
        // sentado al póker: el mouse mira alrededor de la mesa y la rueda elige cuánto apostar
        if (state.mode === 'poker' && G.poker && G.input.locked) { G.poker.lookAround(G.input.dx, G.input.dy); G.poker.wheel(G.input.wheel); }
        if (state.mode === 'poker' && G.poker?.cameraPose(G.camera, dt)) state.local.char.setVisibleHead(false); // cámara en los ojos: sin ver la propia cabeza
        else updateCamera(dt);
        G.poker?.update(G.camera, dt);
        updateNameTags(); updatePrompt(); updateHud(dt); updatePost();
        G.world.update(dt, state.local.pos); G.grass.update(dt, G.camera, benders()); G.haunt?.update(dt);
        G.fx.update(dt); G.blood.update(dt); G.football?.update(dt); G.gore?.update(dt); state.graffiti?.flush();
        G.bag?.update(dt);
        G.hud?.flushHints(dt);
        G.markers?.update(G.camera, state.mode === 'game', (ox, oy, oz, dx, dy, dz, dist) => G.phys.raycast(ox, oy, oz, dx, dy, dz, dist));
        state.stateT += dt;
        if (state.stateT > 0.05 && state.net?.connected) { state.stateT = 0; state.net.send({ t: 'st', s: state.local.netState() }); }
        show($('players'), G.input.key('Tab') && state.mode === 'game');
      } else {
        // mantener el mundo vivo detrás del menú
        G.world.update(dt, { x: 0, z: -60 }); G.grass.update(dt, G.camera, []); G.haunt?.update(dt); G.fx.update(dt); G.blood.update(dt);
        const t = now * 0.00008; G.camera.position.set(Math.sin(t) * 7, 3.4, -60 + Math.cos(t) * 7); G.camera.lookAt(0, 1.2, -60);
      }
      G.sfx?.update(dt, { active: G.inGame, local: state.local, remotes: G.players.values(), vehicles: state.vehicles?.items.values() || [], camera: G.camera, spraying: state.mode === 'game' && state.selected === 3 && G.input.locked && G.input.btn(0) });
      G.media?.update(G.camera, state.local?.pos, { active: G.inGame && state.mode !== 'menu' });
      if (G.inGame && G.voice) {
        G.voice.update(G.camera, state.local?.pos, G.players);
        if (state.local) state.local.talk = Math.min(1, G.voice.level);
        if ((G.frame % 15) === 0) updateMicUI();
      }
      { const st = G.world?.storm; G.post.setZone(st ? st.s : 0, st ? st.indoor : 0, st ? st.flash * (1 - st.indoor * 0.8) : 0, G.time); }
      G.post.render(dt);
      if (state.mode === 'menu') state.preview?.update(dt, readLook());
      } catch (err) {
        if (now - lastErr > 3000) { lastErr = now; console.error('Error en el frame', err); }
      } finally {
        G.input.endFrame();
      }
    }
    requestAnimationFrame(frame);
    window.G = G; window.__dukes = state;
  } catch (e) {
    console.error(e); status('Error: ' + (e?.message || e));
  }
}

boot();
