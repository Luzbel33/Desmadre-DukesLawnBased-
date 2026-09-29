// El dueño del juego (SmokePyro): el nombre queda reservado y solo entra con su clave. Con la clave verificada
// puede usar el personaje del Diablo y sus poderes (fuego por la boca, invisible, inmortal); el servidor es el que
// decide quién es el dueño, no el navegador.
// La clave NO está escrita en el código: se guarda su scrypt. En el hosting se puede reemplazar con la variable de
// entorno OWNER_KEY (recomendado si el repositorio es público: "Silencio" es una palabra fácil de adivinar).
import crypto from 'node:crypto';

const OWNER_NAME = 'smokepyro';
const SALT = 'desmadre:diablo:v1';
const HASH = Buffer.from('3e3d17bea889836c7987f4171d655e3f39c0a9a194a33d8c7db30fb177e9e4e8', 'hex');
const tries = new Map(); // ip -> { n, t }

export function isOwnerName(name) {
  return String(name || '').trim().toLowerCase() === OWNER_NAME;
}

export function checkOwnerKey(key) {
  const k = String(key ?? '').slice(0, 128);
  if (!k) return false;
  if (process.env.OWNER_KEY) {
    const a = crypto.createHash('sha256').update(k).digest();
    const b = crypto.createHash('sha256').update(String(process.env.OWNER_KEY)).digest();
    return crypto.timingSafeEqual(a, b);
  }
  const h = crypto.scryptSync(k, SALT, 32, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(h, HASH);
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
