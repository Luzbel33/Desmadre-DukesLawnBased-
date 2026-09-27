// Servidor WebSocket mínimo (RFC 6455) sin dependencias.
// Soporta texto/binario, fragmentación, ping/pong y cierre. Sin permessage-deflate.
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const EMPTY = Buffer.alloc(0);

export class WSConnection extends EventEmitter {
  constructor(socket, req, opts = {}) {
    super();
    this.socket = socket;
    this.req = req;
    this.maxPayload = opts.maxPayload ?? 24 * 1024 * 1024;
    this.buf = EMPTY;
    this.frags = null;
    this.fragOpcode = 0;
    this.fragLen = 0;
    this.closed = false;
    this.lastSeen = Date.now();
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 30000);
    socket.on('data', (d) => this._onData(d));
    socket.on('close', () => this._finish());
    socket.on('error', () => this._finish());
    socket.on('end', () => this._finish());
  }

  get bufferedAmount() {
    return this.socket.writableLength || 0;
  }

  _onData(chunk) {
    if (this.closed) return;
    this.lastSeen = Date.now();
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    for (;;) {
      const buf = this.buf;
      if (buf.length < 2) return;
      const b0 = buf[0];
      const b1 = buf[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let off = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        const hi = buf.readUInt32BE(2);
        const lo = buf.readUInt32BE(6);
        if (hi !== 0) return this._fail(1009);
        len = lo;
        off = 10;
      }
      if (!masked) return this._fail(1002);
      if (len > this.maxPayload) return this._fail(1009);
      if (buf.length < off + 4 + len) return;
      const m0 = buf[off], m1 = buf[off + 1], m2 = buf[off + 2], m3 = buf[off + 3];
      off += 4;
      const payload = Buffer.allocUnsafe(len);
      for (let i = 0; i < len; i++) {
        const m = (i & 3) === 0 ? m0 : (i & 3) === 1 ? m1 : (i & 3) === 2 ? m2 : m3;
        payload[i] = buf[off + i] ^ m;
      }
      this.buf = buf.length === off + len ? EMPTY : buf.subarray(off + len);
      this._onFrame(fin, opcode, payload);
      if (this.closed) return;
    }
  }

  _onFrame(fin, opcode, payload) {
    switch (opcode) {
      case 0x0: { // continuación
        if (!this.frags) return this._fail(1002);
        this.frags.push(payload);
        this.fragLen += payload.length;
        if (this.fragLen > this.maxPayload) return this._fail(1009);
        if (fin) {
          const data = Buffer.concat(this.frags, this.fragLen);
          const op = this.fragOpcode;
          this.frags = null;
          this.fragLen = 0;
          this._emitMessage(op, data);
        }
        return;
      }
      case 0x1:
      case 0x2:
        if (this.frags) return this._fail(1002);
        if (!fin) {
          this.frags = [payload];
          this.fragLen = payload.length;
          this.fragOpcode = opcode;
          return;
        }
        this._emitMessage(opcode, payload);
        return;
      case 0x8: { // close
        let code = 1000;
        if (payload.length >= 2) code = payload.readUInt16BE(0);
        this._sendFrame(0x8, payload.subarray(0, 2));
        this.socket.end();
        this._finish(code);
        return;
      }
      case 0x9: // ping
        this._sendFrame(0xA, payload);
        return;
      case 0xA: // pong
        return;
      default:
        this._fail(1002);
    }
  }

  _emitMessage(opcode, data) {
    if (opcode === 0x1) this.emit('message', data.toString('utf8'), false);
    else this.emit('message', data, true);
  }

  send(data) {
    if (this.closed) return;
    if (typeof data === 'string') this._sendFrame(0x1, Buffer.from(data, 'utf8'));
    else this._sendFrame(0x2, Buffer.isBuffer(data) ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength));
  }

  ping() {
    this._sendFrame(0x9, EMPTY);
  }

  _sendFrame(opcode, payload) {
    if (this.socket.destroyed) return;
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.allocUnsafe(2);
      header[1] = len;
    } else if (len < 65536) {
      header = Buffer.allocUnsafe(4);
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.allocUnsafe(10);
      header[1] = 127;
      header.writeUInt32BE(Math.floor(len / 4294967296), 2);
      header.writeUInt32BE(len >>> 0, 6);
    }
    header[0] = 0x80 | opcode;
    this.socket.cork();
    this.socket.write(header);
    if (len) this.socket.write(payload);
    this.socket.uncork();
  }

  close(code = 1000) {
    if (this.closed) return;
    const b = Buffer.allocUnsafe(2);
    b.writeUInt16BE(code, 0);
    this._sendFrame(0x8, b);
    this.socket.end();
    setTimeout(() => this.socket.destroy(), 2000).unref();
    this._finish(code);
  }

  _fail(code) {
    this.close(code);
  }

  _finish(code = 1006) {
    if (this.closed) return;
    this.closed = true;
    this.emit('close', code);
  }
}

// Maneja el evento 'upgrade' del servidor http.
export function handleUpgrade(req, socket, head, onConnection) {
  const key = req.headers['sec-websocket-key'];
  const upgrade = (req.headers.upgrade || '').toLowerCase();
  if (!key || upgrade !== 'websocket') {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    return;
  }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
  );
  const ws = new WSConnection(socket, req);
  onConnection(ws, req);
  if (head && head.length) ws._onData(head);
}
