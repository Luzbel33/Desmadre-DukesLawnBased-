// DESMADRE — servidor (archivos estáticos + WebSocket + salas). Sin dependencias.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { handleUpgrade } from './ws.js';
import { Room } from './room.js';
import { isOwnerName, checkOwnerKey, allowTry } from './owner.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt']);
const cache = new Map(); // ruta -> { mtime, raw, gz }

function serveStatic(req, res) {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.normalize(path.join(PUBLIC, urlPath));
  if (!file.startsWith(PUBLIC + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No existe: ' + urlPath);
      return;
    }
    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const isVendor = urlPath.startsWith('/vendor/');
    const headers = {
      'Content-Type': type,
      'Cache-Control': isVendor ? 'public, max-age=86400' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    };
    let entry = cache.get(file);
    if (!entry || entry.mtime !== st.mtimeMs) {
      const raw = fs.readFileSync(file);
      entry = { mtime: st.mtimeMs, raw, gz: null };
      if (COMPRESSIBLE.has(ext) && raw.length > 1024) entry.gz = zlib.gzipSync(raw, { level: 6 });
      cache.set(file, entry);
    }
    const etag = '"' + st.size.toString(16) + '-' + Math.floor(st.mtimeMs).toString(16) + '"';
    headers.ETag = etag;
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers).end();
      return;
    }
    const acceptsGz = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    if (entry.gz && acceptsGz) {
      headers['Content-Encoding'] = 'gzip';
      headers['Vary'] = 'Accept-Encoding';
      headers['Content-Length'] = entry.gz.length;
      res.writeHead(200, headers);
      res.end(req.method === 'HEAD' ? undefined : entry.gz);
    } else {
      headers['Content-Length'] = entry.raw.length;
      res.writeHead(200, headers);
      res.end(req.method === 'HEAD' ? undefined : entry.raw);
    }
  });
}

// ------------------------------------------------------------------ salas
const rooms = new Map();
function getRoom(name) {
  let r = rooms.get(name);
  if (!r) {
    r = new Room(name, DATA);
    rooms.set(name, r);
    console.log('[sala] creada:', name);
  }
  return r;
}
function roomName(req) {
  try {
    const u = new URL(req.url, 'http://x');
    const s = (u.searchParams.get('sala') || 'principal').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24);
    return s || 'principal';
  } catch {
    return 'principal';
  }
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: [...rooms.values()].map((r) => ({ name: r.name, players: r.count })) }));
    return;
  }
  // ¿Es el dueño? (el menú lo pregunta para mostrar el personaje del Diablo; al entrar se vuelve a verificar)
  if (req.url === '/api/owner' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 2048) req.destroy(); });
    req.on('end', () => {
      const ip = req.socket.remoteAddress || '';
      if (!allowTry(ip)) {
        res.writeHead(429, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: false, err: 'Demasiados intentos: esperá unos minutos.' }));
        return;
      }
      let ok = false;
      try { const m = JSON.parse(body); ok = isOwnerName(m.name) && checkOwnerKey(m.key); } catch { /* */ }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify({ ok }));
    });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  serveStatic(req, res);
});

server.on('upgrade', (req, socket, head) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname !== '/ws') {
    socket.destroy();
    return;
  }
  handleUpgrade(req, socket, head, (ws) => {
    ws.ip = req.socket.remoteAddress || '';
    getRoom(roomName(req)).accept(ws);
  });
});

setInterval(() => {
  for (const r of rooms.values()) r.tick();
}, 50);

// keepalive
setInterval(() => {
  for (const r of rooms.values()) {
    for (const p of r.players.values()) {
      if (Date.now() - p.ws.lastSeen > 45000) p.ws.close(1001);
      else p.ws.ping();
    }
  }
}, 15000);

function shutdown() {
  console.log('\nGuardando salas...');
  for (const r of rooms.values()) r.save(true);
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, HOST, () => {
  console.log('\n  DESMADRE — servidor andando');
  console.log('  Local:  http://localhost:' + PORT);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) console.log('  Red:    http://' + a.address + ':' + PORT);
    }
  }
  console.log('  Salas privadas: agregá ?sala=nombre a la URL\n');
});
