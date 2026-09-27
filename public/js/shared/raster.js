// Rasterizado compartido (servidor + cliente) para que todos vean exactamente lo mismo.
// - Aerosol: puntos suaves con salpicado sobre un buffer RGBA (Uint8ClampedArray).
// - Pasto: corte de rectángulos orientados sobre la grilla de alturas del Gran Pasto.
import { GRASSMAP as LAWN } from './mapdata.js'; // grilla de pasto (todo el mapa)

export const DOT_BYTES = 10; // x u16, y u16 (desplazados +DOT_OFF), radio u8, r, g, b, a, flags
export const DOT_OFF = 1024; // permite centros fuera del lienzo (manchas que cruzan de un parche al vecino)

function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

// flags: bit0 = borrar (removedor), bit1 = sin salpicado (trazo limpio / chorreado)
export function stampDot(buf, w, h, cx, cy, rad, r, g, b, a, flags) {
  if (rad < 1) rad = 1;
  const x0 = Math.max(0, Math.floor(cx - rad));
  const x1 = Math.min(w - 1, Math.ceil(cx + rad));
  const y0 = Math.max(0, Math.floor(cy - rad));
  const y1 = Math.min(h - 1, Math.ceil(cy + rad));
  if (x0 > x1 || y0 > y1) return null;
  const inv = 1 / (rad * rad);
  const baseA = a / 255;
  const erase = flags & 1;
  const clean = flags & 2;
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const d2 = (dx * dx + dy * dy) * inv;
      if (d2 >= 1) continue;
      let f = 1 - d2;
      f *= f;
      if (!clean) {
        const n = hash(x + cx * 31, y + cy * 17);
        if (d2 > 0.3 && n > f * 2.2) continue; // salpicado de los bordes
        f *= 0.75 + n * 0.5;
      }
      let sa = baseA * f;
      if (sa > 1) sa = 1;
      const i = (y * w + x) << 2;
      if (erase) {
        buf[i + 3] = buf[i + 3] * (1 - sa);
        continue;
      }
      const da = buf[i + 3] / 255;
      const oa = sa + da * (1 - sa);
      if (oa <= 0.0001) continue;
      const k = da * (1 - sa);
      buf[i] = (r * sa + buf[i] * k) / oa;
      buf[i + 1] = (g * sa + buf[i + 1] * k) / oa;
      buf[i + 2] = (b * sa + buf[i + 2] * k) / oa;
      buf[i + 3] = oa * 255;
    }
  }
  return [x0, y0, x1, y1];
}

// Aplica un lote de puntos codificados (Uint8Array con DOT_BYTES por punto). Devuelve el rect sucio.
export function applyDots(buf, w, h, bytes, offset, count) {
  let rx0 = 1e9, ry0 = 1e9, rx1 = -1, ry1 = -1;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let n = 0; n < count; n++) {
    const o = offset + n * DOT_BYTES;
    if (o + DOT_BYTES > bytes.byteLength) break;
    const x = dv.getUint16(o, true) - DOT_OFF;
    const y = dv.getUint16(o + 2, true) - DOT_OFF;
    const rad = bytes[o + 4];
    const rc = stampDot(buf, w, h, x, y, rad, bytes[o + 5], bytes[o + 6], bytes[o + 7], bytes[o + 8], bytes[o + 9]);
    if (rc) {
      if (rc[0] < rx0) rx0 = rc[0];
      if (rc[1] < ry0) ry0 = rc[1];
      if (rc[2] > rx1) rx1 = rc[2];
      if (rc[3] > ry1) ry1 = rc[3];
    }
  }
  return rx1 < 0 ? null : [rx0, ry0, rx1, ry1];
}

export function encodeDot(dv, o, x, y, rad, r, g, b, a, flags) {
  dv.setUint16(o, Math.max(0, Math.min(65535, Math.round(x) + DOT_OFF)), true);
  dv.setUint16(o + 2, Math.max(0, Math.min(65535, Math.round(y) + DOT_OFF)), true);
  dv.setUint8(o + 4, Math.max(1, Math.min(255, Math.round(rad))));
  dv.setUint8(o + 5, r);
  dv.setUint8(o + 6, g);
  dv.setUint8(o + 7, b);
  dv.setUint8(o + 8, a);
  dv.setUint8(o + 9, flags);
}

// ------------------------------------------------------------------ Pasto
// Corta un rectángulo orientado: centro (x,z), ang = yaw de avance, hw = medio ancho, hl = medio largo.
// Devuelve cuántas celdas altas se cortaron (para las partículas de pasto).
export function cutRect(hgt, dir, x, z, ang, hw, hl, cutH) {
  const c = LAWN.cell;
  const sa = Math.sin(ang);
  const ca = Math.cos(ang);
  const ex = Math.abs(hw * ca) + Math.abs(hl * sa);
  const ez = Math.abs(hw * sa) + Math.abs(hl * ca);
  const i0 = Math.max(0, Math.floor((x - ex - LAWN.x0) / c));
  const i1 = Math.min(LAWN.w - 1, Math.ceil((x + ex - LAWN.x0) / c));
  const j0 = Math.max(0, Math.floor((z - ez - LAWN.z0) / c));
  const j1 = Math.min(LAWN.h - 1, Math.ceil((z + ez - LAWN.z0) / c));
  let a = Math.atan2(sa, ca);
  if (a < 0) a += Math.PI * 2;
  const dByte = Math.round((a / (Math.PI * 2)) * 255) & 255;
  let tall = 0;
  for (let j = j0; j <= j1; j++) {
    const pz = LAWN.z0 + (j + 0.5) * c - z;
    for (let i = i0; i <= i1; i++) {
      const px = LAWN.x0 + (i + 0.5) * c - x;
      const f = px * sa + pz * ca; // eje de avance
      const s = px * ca - pz * sa; // eje lateral
      if (f > hl || f < -hl || s > hw || s < -hw) continue;
      const k = j * LAWN.w + i;
      if (hgt[k] > cutH) {
        if (hgt[k] > cutH + 40) tall++;
        hgt[k] = cutH;
      }
      dir[k] = dByte;
    }
  }
  return tall;
}

export function growAll(hgt, amount, noGrow = null) {
  for (let k = 0; k < hgt.length; k++) {
    if (noGrow && noGrow[k]) continue;
    const v = hgt[k];
    if (v < 255) hgt[k] = v + amount > 255 ? 255 : v + amount;
  }
}

// Celdas del pasto que nunca crecen (la cancha): 1 = siempre corta
export function fieldMask(F, margin = 1.5) {
  const m = new Uint8Array(LAWN.w * LAWN.h);
  for (let j = 0; j < LAWN.h; j++) {
    const z = LAWN.z0 + (j + 0.5) * LAWN.cell;
    if (Math.abs(z - F.cz) > F.hz + margin) continue;
    for (let i = 0; i < LAWN.w; i++) {
      const x = LAWN.x0 + (i + 0.5) * LAWN.cell;
      if (Math.abs(x - F.cx) <= F.hx + F.goalDepth + margin) m[j * LAWN.w + i] = 1;
    }
  }
  return m;
}

// Corte inicial de la cancha con franjas de estadio (bandas de 4 m que alternan dirección)
export function mowField(hgt, dir, F, mask, cutH) {
  for (let j = 0; j < LAWN.h; j++) {
    for (let i = 0; i < LAWN.w; i++) {
      const k = j * LAWN.w + i;
      if (!mask[k]) continue;
      const x = LAWN.x0 + (i + 0.5) * LAWN.cell;
      hgt[k] = Math.min(hgt[k], cutH);
      dir[k] = Math.floor((x - F.cx + 100) / 4) % 2 ? 64 : 192;
    }
  }
}
