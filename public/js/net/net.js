// Cliente de red: WebSocket + sincronización de reloj con el servidor.
import { PROTOCOL } from '../shared/mapdata.js';

export class Net {
  constructor() {
    this.ws = null;
    this.handlers = new Map();
    this.binHandlers = new Map();
    this.offset = 0; // serverTime - Date.now()
    this.rtt = 100;
    this.samples = [];
    this.connected = false;
    this.id = 0;
    this.bytesIn = 0;
    this.bytesOut = 0;
    this._pingTimer = null;
  }

  on(type, fn) { this.handlers.set(type, fn); }
  onBin(type, fn) { this.binHandlers.set(type, fn); }

  connect(room, name, look) {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = proto + '//' + location.host + '/ws?sala=' + encodeURIComponent(room || 'principal');
      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      let settled = false;
      ws.onopen = () => {
        this.connected = true;
        this.send({ t: 'join', v: PROTOCOL, name, look });
        this._pingTimer = setInterval(() => this.send({ t: 'ping', c: performance.now() }), 2000);
        this.send({ t: 'ping', c: performance.now() });
      };
      ws.onmessage = (e) => {
        if (typeof e.data === 'string') {
          this.bytesIn += e.data.length;
          let m;
          try { m = JSON.parse(e.data); } catch { return; }
          if (m.t === 'welcome') {
            this.id = m.id;
            this._syncFromServer(m.now, 0);
          } else if (m.t === 'pong') {
            this._pong(m);
            return;
          } else if (m.t === 'ready' && !settled) {
            settled = true;
            resolve();
          } else if (m.t === 'err' && !settled) {
            settled = true;
            reject(new Error(m.m));
          }
          const h = this.handlers.get(m.t);
          if (h) {
            try { h(m); } catch (err) { console.error('handler', m.t, err); }
          }
        } else {
          const u8 = new Uint8Array(e.data);
          this.bytesIn += u8.length;
          const h = this.binHandlers.get(u8[0]);
          if (h) {
            try { h(u8); } catch (err) { console.error('bin handler', u8[0], err); }
          }
        }
      };
      ws.onclose = (e) => {
        this.connected = false;
        clearInterval(this._pingTimer);
        if (!settled) {
          settled = true;
          reject(new Error('No se pudo conectar al servidor (' + e.code + ').'));
        }
        const h = this.handlers.get('close');
        h && h(e);
      };
      ws.onerror = () => {};
    });
  }

  send(obj) {
    if (!this.ws || this.ws.readyState !== 1) return;
    const s = JSON.stringify(obj);
    this.bytesOut += s.length;
    this.ws.send(s);
  }
  sendBin(u8) {
    if (!this.ws || this.ws.readyState !== 1) return;
    this.bytesOut += u8.byteLength;
    this.ws.send(u8);
  }

  _syncFromServer(serverNow) {
    this.offset = serverNow - Date.now();
  }
  _pong(m) {
    const now = performance.now();
    const rtt = now - m.c;
    if (rtt < 0 || rtt > 10000) return;
    const off = m.s + rtt / 2 - (Date.now());
    this.samples.push({ rtt, off });
    if (this.samples.length > 12) this.samples.shift();
    // usar las muestras con menor rtt
    const best = [...this.samples].sort((a, b) => a.rtt - b.rtt).slice(0, 4);
    const avg = best.reduce((s, x) => s + x.off, 0) / best.length;
    this.offset = this.samples.length < 3 ? avg : this.offset * 0.7 + avg * 0.3;
    this.rtt = this.rtt * 0.7 + rtt * 0.3;
  }

  // Hora del servidor en ms
  now() {
    return Date.now() + this.offset;
  }

  close() {
    if (this.ws) this.ws.close();
  }
}
