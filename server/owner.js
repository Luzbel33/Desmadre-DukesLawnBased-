// Privileges require the server's configured key. An unconfigured server still accepts
// guests, but never grants owner access or releases the reserved name.
import crypto from 'node:crypto';

const OWNER_NAME = 'smokepyro';
const tries = new Map(); // ip -> { n, t }

export function isOwnerName(name) {
  return String(name || '').trim().toLowerCase() === OWNER_NAME;
}

export function checkOwnerKey(key) {
  const configured = process.env.OWNER_KEY;
  if (!configured || typeof key !== 'string' || !key || key.length > 128) return false;
  const a = crypto.createHash('sha256').update(key).digest();
  const b = crypto.createHash('sha256').update(configured).digest();
  return crypto.timingSafeEqual(a, b);
}

// Intentos por IP: 10 cada 10 minutos (contra el que prueba claves a lo loco)
export function allowTry(ip) {
  const now = Date.now();
  let t = tries.get(ip);
  if (!t || now - t.t > 600000) {
    t = { n: 0, t: now };
    tries.set(ip, t);
  }
  t.n++;
  if (tries.size > 5000) tries.clear();
  return t.n <= 10;
}
