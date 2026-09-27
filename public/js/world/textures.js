// Texturas procedurales dibujadas en canvas (sin assets externos).
import * as THREE from 'three';
import { rng } from '../core/G.js';

const cache = new Map();
let maxAniso = 8;
export function setMaxAniso(a) { maxAniso = a; }

// ---------------------------------------------------------------- ruido
function makeNoise(seed) {
  const r = rng(seed);
  const p = new Uint8Array(512);
  const perm = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const val = new Float32Array(256);
  for (let i = 0; i < 256; i++) val[i] = r();
  // ruido de valor 2D periódico (tileable) con período `per`
  return function noise(x, y, per = 256) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const X0 = ((xi % per) + per) % per, Y0 = ((yi % per) + per) % per;
    const X1 = (X0 + 1) % per, Y1 = (Y0 + 1) % per;
    const a = val[p[p[X0] + Y0]], b = val[p[p[X1] + Y0]];
    const c = val[p[p[X0] + Y1]], d = val[p[p[X1] + Y1]];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
const N = makeNoise(1337);
export function fbm(x, y, oct = 4, per = 256) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += N(x * f, y * f, per * f) * a;
    n += a;
    a *= 0.5;
    f *= 2;
  }
  return s / n;
}

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function toTex(c, repeat = true, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
function hexRgb(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

// Llena con un color base + ruido fbm tileable
function noiseFill(ctx, w, h, c1, c2, scale = 8, oct = 4, seedOff = 0) {
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const a = hexRgb(c1), b = hexRgb(c2);
  const per = scale;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = fbm((x / w) * scale + seedOff, (y / h) * scale + seedOff, oct, per);
      const i = (y * w + x) * 4;
      d[i] = a[0] + (b[0] - a[0]) * n;
      d[i + 1] = a[1] + (b[1] - a[1]) * n;
      d[i + 2] = a[2] + (b[2] - a[2]) * n;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}
function speckle(ctx, w, h, count, colors, rmin, rmax, seed) {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(r() * colors.length)];
    const x = r() * w, y = r() * h, s = rmin + r() * (rmax - rmin);
    ctx.beginPath();
    ctx.arc(x, y, s, 0, Math.PI * 2);
    ctx.fill();
    // tileable: copiar en los bordes
    if (x < s) { ctx.beginPath(); ctx.arc(x + w, y, s, 0, Math.PI * 2); ctx.fill(); }
    if (y < s) { ctx.beginPath(); ctx.arc(x, y + h, s, 0, Math.PI * 2); ctx.fill(); }
  }
}

function get(name, fn) {
  if (!cache.has(name)) cache.set(name, fn());
  return cache.get(name);
}

// ---------------------------------------------------------------- texturas
export const TEX = {
  grass: () => get('grass', () => {
    const c = canvas(512), x = c.getContext('2d');
    noiseFill(x, 512, 512, 0x2f4f1c, 0x6d8f33, 8, 5);
    const r = rng(7);
    for (let i = 0; i < 9000; i++) {
      const px = r() * 512, py = r() * 512, l = 3 + r() * 7;
      const g = 90 + r() * 90;
      x.strokeStyle = `rgba(${40 + r() * 50},${g},${20 + r() * 30},0.55)`;
      x.lineWidth = 1;
      x.beginPath();
      x.moveTo(px, py);
      x.lineTo(px + (r() - 0.5) * 3, py - l);
      x.stroke();
    }
    return toTex(c);
  }),
  asphalt: () => get('asphalt', () => {
    const c = canvas(512), x = c.getContext('2d');
    noiseFill(x, 512, 512, 0x2a2b2e, 0x4a4b50, 16, 4, 3);
    speckle(x, 512, 512, 5000, ['#5a5b60', '#1e1f22', '#66676b', '#3c3d41'], 0.4, 1.4, 11);
    return toTex(c);
  }),
  gravel: () => get('gravel', () => {
    const c = canvas(512), x = c.getContext('2d');
    noiseFill(x, 512, 512, 0x7a7163, 0x9f9582, 12, 4, 5);
    speckle(x, 512, 512, 6000, ['#6a6256', '#b0a58f', '#8a806e', '#57514a', '#c2b7a0'], 0.8, 2.6, 13);
    return toTex(c);
  }),
  dirt: () => get('dirt', () => {
    const c = canvas(512), x = c.getContext('2d');
    noiseFill(x, 512, 512, 0x5b3f26, 0x8f6a42, 10, 5, 9);
    speckle(x, 512, 512, 2500, ['#3f2b1a', '#a07a50', '#6e5033'], 0.6, 2.2, 17);
    return toTex(c);
  }),
  brick: () => get('brick', () => {
    const c = canvas(512), x = c.getContext('2d');
    x.fillStyle = '#b8ab98';
    x.fillRect(0, 0, 512, 512);
    const r = rng(21);
    const bw = 64, bh = 28;
    for (let row = 0; row < 512 / bh + 1; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let col = -1; col < 512 / bw + 1; col++) {
        const px = col * bw + off, py = row * bh;
        const h = 8 + r() * 14, s = 45 + r() * 20, l = 30 + r() * 14;
        x.fillStyle = `hsl(${h},${s}%,${l}%)`;
        x.fillRect(px + 2, py + 2, bw - 4, bh - 4);
      }
    }
    // suciedad
    const img = x.getImageData(0, 0, 512, 512);
    const d = img.data;
    for (let y = 0; y < 512; y++) for (let xx = 0; xx < 512; xx++) {
      const n = fbm(xx / 64, y / 64, 3, 8) * 0.35 + 0.8;
      const i = (y * 512 + xx) * 4;
      d[i] *= n; d[i + 1] *= n; d[i + 2] *= n;
    }
    x.putImageData(img, 0, 0);
    return toTex(c);
  }),
  plaster: () => get('plaster', () => {
    const c = canvas(512), x = c.getContext('2d');
    noiseFill(x, 512, 512, 0xb5a787, 0xcfc2a2, 10, 5, 23);
    return toTex(c);
  }),
  stone: () => get('stone', () => {
    const c = canvas(512), x = c.getContext('2d');
    noiseFill(x, 512, 512, 0xa89c7e, 0xc4b797, 12, 4, 29);
    x.strokeStyle = 'rgba(120,108,85,0.55)';
    x.lineWidth = 2;
    const bh = 64;
    for (let row = 0; row < 8; row++) {
      x.beginPath(); x.moveTo(0, row * bh); x.lineTo(512, row * bh); x.stroke();
      const off = row % 2 ? 64 : 0;
      for (let col = 0; col < 5; col++) {
        x.beginPath(); x.moveTo(off + col * 128, row * bh); x.lineTo(off + col * 128, row * bh + bh); x.stroke();
      }
    }
    return toTex(c);
  }),
  wood: () => get('wood', () => {
    const c = canvas(512), x = c.getContext('2d');
    const r = rng(31);
    const pw = 64;
    for (let i = 0; i < 8; i++) {
      const base = 0.75 + r() * 0.3;
      const img = x.createImageData(pw, 512);
      const d = img.data;
      const seed = r() * 100;
      for (let yy = 0; yy < 512; yy++) for (let xx = 0; xx < pw; xx++) {
        const g = fbm(xx / 40 + seed, yy / 6 + seed, 3, 64);
        const ring = Math.sin((xx / pw) * 6 + g * 12) * 0.5 + 0.5;
        const v = base * (0.7 + ring * 0.2 + g * 0.2);
        const k = (yy * pw + xx) * 4;
        d[k] = 150 * v; d[k + 1] = 100 * v; d[k + 2] = 58 * v; d[k + 3] = 255;
      }
      x.putImageData(img, i * pw, 0);
      x.fillStyle = 'rgba(30,18,8,0.8)';
      x.fillRect(i * pw, 0, 2, 512);
      const cut = Math.floor(r() * 400);
      x.fillRect(i * pw, cut, pw, 2);
    }
    return toTex(c);
  }),
  woodDark: () => get('woodDark', () => {
    const c = canvas(256), x = c.getContext('2d');
    const img = x.createImageData(256, 256);
    const d = img.data;
    for (let yy = 0; yy < 256; yy++) for (let xx = 0; xx < 256; xx++) {
      const g = fbm(xx / 60, yy / 5, 4, 32);
      const v = 0.55 + g * 0.5;
      const k = (yy * 256 + xx) * 4;
      d[k] = 92 * v; d[k + 1] = 52 * v; d[k + 2] = 28 * v; d[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return toTex(c);
  }),
  tiles: () => get('tiles', () => {
    const c = canvas(256), x = c.getContext('2d');
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      x.fillStyle = (i + j) % 2 ? '#1d1d20' : '#d9d3c6';
      x.fillRect(i * 64, j * 64, 64, 64);
    }
    const img = x.getImageData(0, 0, 256, 256);
    const d = img.data;
    for (let y = 0; y < 256; y++) for (let xx = 0; xx < 256; xx++) {
      const n = 0.82 + fbm(xx / 32, y / 32, 3, 8) * 0.3;
      const k = (y * 256 + xx) * 4;
      d[k] *= n; d[k + 1] *= n; d[k + 2] *= n;
    }
    x.putImageData(img, 0, 0);
    return toTex(c);
  }),
  roof: () => get('roof', () => {
    const c = canvas(256), x = c.getContext('2d');
    noiseFill(x, 256, 256, 0x3b3f47, 0x5a5f69, 8, 3, 41);
    x.strokeStyle = 'rgba(20,20,25,0.7)';
    for (let row = 0; row < 8; row++) {
      x.lineWidth = 3;
      x.beginPath(); x.moveTo(0, row * 32); x.lineTo(256, row * 32); x.stroke();
      x.lineWidth = 1.5;
      const off = row % 2 ? 16 : 0;
      for (let col = 0; col < 9; col++) {
        x.beginPath(); x.moveTo(off + col * 32, row * 32); x.lineTo(off + col * 32, row * 32 + 32); x.stroke();
      }
    }
    return toTex(c);
  }),
  metal: () => get('metal', () => {
    const c = canvas(256), x = c.getContext('2d');
    for (let i = 0; i < 256; i++) {
      const v = 0.75 + Math.sin(i / 256 * Math.PI * 16) * 0.2;
      x.fillStyle = `rgb(${120 * v},${128 * v},${132 * v})`;
      x.fillRect(i, 0, 1, 256);
    }
    x.globalAlpha = 0.25;
    speckle(x, 256, 256, 400, ['#6b4a2a', '#8a6038'], 1, 5, 43);
    x.globalAlpha = 1;
    return toTex(c);
  }),
  concrete: () => get('concrete', () => {
    const c = canvas(512), x = c.getContext('2d');
    noiseFill(x, 512, 512, 0x6d6c68, 0x8e8c86, 10, 5, 47);
    speckle(x, 512, 512, 1500, ['#6d6c67', '#bdbbb4'], 0.5, 1.5, 49);
    x.strokeStyle = 'rgba(60,60,58,0.35)';
    x.lineWidth = 2;
    x.strokeRect(0, 0, 512, 512);
    return toTex(c);
  }),
  carpet: () => get('carpet', () => {
    const c = canvas(256), x = c.getContext('2d');
    noiseFill(x, 256, 256, 0x5a0f18, 0x7e1a26, 32, 3, 53);
    x.strokeStyle = 'rgba(230,180,60,0.35)';
    x.lineWidth = 3;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      x.beginPath();
      x.arc(i * 64 + 32, j * 64 + 32, 14, 0, Math.PI * 2);
      x.stroke();
    }
    return toTex(c);
  }),
  paving: () => get('paving', () => {
    const c = canvas(512), x = c.getContext('2d');
    noiseFill(x, 512, 512, 0x938770, 0xb1a68c, 12, 4, 59);
    x.strokeStyle = 'rgba(90,80,62,0.6)';
    x.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      x.beginPath(); x.moveTo(i * 128, 0); x.lineTo(i * 128, 512); x.stroke();
      x.beginPath(); x.moveTo(0, i * 128); x.lineTo(512, i * 128); x.stroke();
    }
    return toTex(c);
  }),
  felt: () => get('felt', () => {
    const c = canvas(128), x = c.getContext('2d');
    noiseFill(x, 128, 128, 0x0c5a2e, 0x137a3f, 16, 3, 61);
    return toTex(c);
  }),
  bark: () => get('bark', () => {
    const c = canvas(128, 256), x = c.getContext('2d');
    const img = x.createImageData(128, 256);
    const d = img.data;
    for (let y = 0; y < 256; y++) for (let xx = 0; xx < 128; xx++) {
      const g = fbm(xx / 10, y / 40, 4, 12);
      const v = 0.45 + g * 0.6;
      const k = (y * 128 + xx) * 4;
      d[k] = 90 * v; d[k + 1] = 68 * v; d[k + 2] = 48 * v; d[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return toTex(c);
  }),
  hedge: () => get('hedge', () => {
    const c = canvas(256), x = c.getContext('2d');
    noiseFill(x, 256, 256, 0x1d3a14, 0x3f6b24, 16, 5, 67);
    speckle(x, 256, 256, 2500, ['#2c5a1c', '#4f8a2e', '#173010', '#5f9a36'], 1, 3, 71);
    return toTex(c);
  }),
  mansionFacade: () => get('mansionFacade', () => {
    // un "módulo" de fachada de 4m x 14m con tres pisos de ventanas
    const c = canvas(256, 896), x = c.getContext('2d');
    noiseFill(x, 256, 896, 0xb3a584, 0xcdbf9e, 6, 4, 73);
    const floorH = 896 / 3;
    for (let f = 0; f < 3; f++) {
      const top = 896 - (f + 1) * floorH;
      // cornisa
      x.fillStyle = 'rgba(150,135,105,0.9)';
      x.fillRect(0, top + floorH - 10, 256, 10);
      x.fillStyle = 'rgba(255,250,235,0.5)';
      x.fillRect(0, top + floorH - 12, 256, 3);
      // ventana
      const ww = 96, wh = f === 0 ? 190 : 170, wx = 128 - ww / 2, wy = top + 50;
      x.fillStyle = '#e8dfc8';
      x.fillRect(wx - 12, wy - 12, ww + 24, wh + 24);
      x.fillStyle = '#20262c';
      x.fillRect(wx, wy, ww, wh);
      // reflejos
      const g = x.createLinearGradient(wx, wy, wx + ww, wy + wh);
      g.addColorStop(0, 'rgba(160,190,210,0.55)');
      g.addColorStop(0.5, 'rgba(40,50,60,0.2)');
      g.addColorStop(1, 'rgba(120,150,170,0.4)');
      x.fillStyle = g;
      x.fillRect(wx, wy, ww, wh);
      x.fillStyle = '#efe8d6';
      x.fillRect(wx + ww / 2 - 3, wy, 6, wh);
      for (let k = 1; k < 4; k++) x.fillRect(wx, wy + (wh / 4) * k - 2, ww, 4);
      // frontón
      x.fillStyle = '#e2d8bf';
      x.beginPath();
      x.moveTo(wx - 20, wy - 14);
      x.lineTo(wx + ww / 2, wy - 44);
      x.lineTo(wx + ww + 20, wy - 14);
      x.fill();
      x.strokeStyle = 'rgba(120,105,80,0.6)';
      x.stroke();
    }
    return toTex(c);
  }),
};

// Cartel con texto (letreros, marquesinas)
export function textTexture(text, opts = {}) {
  const w = opts.w || 512, h = opts.h || 128;
  const c = canvas(w, h), x = c.getContext('2d');
  if (opts.bg) {
    x.fillStyle = opts.bg;
    x.fillRect(0, 0, w, h);
  }
  x.font = `${opts.weight || 900} ${opts.size || 72}px ${opts.font || 'Impact, "Arial Black", sans-serif'}`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  if (opts.glow) {
    x.shadowColor = opts.glow;
    x.shadowBlur = 24;
  }
  if (opts.stroke) {
    x.lineWidth = opts.strokeW || 6;
    x.strokeStyle = opts.stroke;
    x.strokeText(text, w / 2, h / 2);
  }
  x.fillStyle = opts.color || '#fff';
  x.fillText(text, w / 2, h / 2);
  const t = toTex(c, false);
  return t;
}

// Textura de salpicadura de sangre (para decals)
export function bloodSplatTexture() {
  return get('bloodSplat', () => {
    const c = canvas(256), x = c.getContext('2d');
    const r = rng(99);
    // 4 variantes en una grilla 2x2
    for (let v = 0; v < 4; v++) {
      const ox = (v % 2) * 128 + 64, oy = Math.floor(v / 2) * 128 + 64;
      x.fillStyle = 'rgba(255,255,255,1)';
      x.beginPath();
      x.arc(ox, oy, 22 + r() * 10, 0, Math.PI * 2);
      x.fill();
      const n = 10 + Math.floor(r() * 10);
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2, d = 18 + r() * 36, s = 2 + r() * 9;
        x.beginPath();
        x.arc(ox + Math.cos(a) * d, oy + Math.sin(a) * d, s, 0, Math.PI * 2);
        x.fill();
        // chorrito
        x.lineWidth = s * 0.8;
        x.strokeStyle = 'rgba(255,255,255,1)';
        x.beginPath();
        x.moveTo(ox + Math.cos(a) * 12, oy + Math.sin(a) * 12);
        x.lineTo(ox + Math.cos(a) * d, oy + Math.sin(a) * d);
        x.stroke();
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.NoColorSpace;
    return t;
  });
}

// Sprite redondo suave (partículas)
export function softDotTexture() {
  return get('softDot', () => {
    const c = canvas(64), x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    return t;
  });
}

export function smokeTexture() {
  return get('smoke', () => {
    const c = canvas(128), x = c.getContext('2d');
    const img = x.createImageData(128, 128);
    const d = img.data;
    for (let y = 0; y < 128; y++) for (let xx = 0; xx < 128; xx++) {
      const dx = (xx - 64) / 64, dy = (y - 64) / 64;
      const r = Math.sqrt(dx * dx + dy * dy);
      const n = fbm(xx / 20, y / 20, 4, 8);
      let a = Math.max(0, 1 - r) * (0.4 + n * 0.9);
      a = Math.min(1, a * a * 1.6);
      const k = (y * 128 + xx) * 4;
      d[k] = d[k + 1] = d[k + 2] = 255;
      d[k + 3] = a * 255;
    }
    x.putImageData(img, 0, 0);
    return new THREE.CanvasTexture(c);
  });
}
