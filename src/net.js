// Multiplayer connections for Race mode, using PeerJS (vendor/peerjs.min.js, loaded as
// window.peerjs). Players connect directly to the host's device. A free public PeerJS
// server is only used to help devices find each other by game ID.

const PREFIX = 'skyclimb-race-';
const JOIN_TIMEOUT_MS = 15000;
export const CODE_LENGTH = 6;

// A fresh random 6-digit game PIN (like Kahoot) every time someone hosts
export function makeGameCode() {
  return String(100000 + Math.floor(Math.random() * 900000));
}

export function cleanGameCode(text) {
  return String(text || '').replace(/[^0-9]/g, '').slice(0, CODE_LENGTH);
}

function newPeer(id) {
  const Peer = window.peerjs && window.peerjs.Peer;
  if (!Peer) throw new Error('Multiplayer library failed to load');
  return id ? new Peer(id, { debug: 0 }) : new Peer({ debug: 0 });
}

function friendlyError(err) {
  switch (err && err.type) {
    case 'peer-unavailable': return 'No game found with that PIN. Check the PIN and try again.';
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed': return "Couldn't reach the multiplayer server. Check your internet connection.";
    case 'browser-incompatible': return "This browser doesn't support multiplayer.";
    default: return 'Connection problem: ' + ((err && err.message) || 'unknown error');
  }
}

// The host: owns the game, everyone connects to it. Messages are plain objects.
export class RaceHost {
  constructor({ onReady, onJoin, onLeave, onMessage, onError }) {
    this.handlers = { onReady, onJoin, onLeave, onMessage, onError };
    this.conns = new Map(); // player id -> connection
    this.closed = false;
  }

  start(tries = 0) {
    this.code = makeGameCode();
    this.peer = newPeer(PREFIX + this.code);
    this.peer.on('open', () => this.handlers.onReady(this.code));
    this.peer.on('connection', (conn) => {
      conn.on('open', () => {
        this.conns.set(conn.peer, conn);
        this.handlers.onJoin(conn.peer);
      });
      conn.on('data', (msg) => this.handlers.onMessage(conn.peer, msg));
      conn.on('close', () => this._drop(conn.peer));
      conn.on('error', () => this._drop(conn.peer));
    });
    this.peer.on('error', (err) => {
      if (err.type === 'unavailable-id' && tries < 5) { // that code is taken: pick another
        this.peer.destroy();
        this.start(tries + 1);
      } else if (err.type !== 'peer-unavailable') {
        this.handlers.onError(friendlyError(err));
      }
    });
  }

  _drop(id) {
    if (!this.conns.has(id)) return;
    this.conns.delete(id);
    this.handlers.onLeave(id);
  }

  send(id, msg) {
    const c = this.conns.get(id);
    if (c && c.open) c.send(msg);
  }

  broadcast(msg) {
    for (const c of this.conns.values()) if (c.open) c.send(msg);
  }

  kick(id) {
    const c = this.conns.get(id);
    if (!c) return;
    c.send({ t: 'kicked' });
    setTimeout(() => c.close(), 200);
    this._drop(id);
  }

  close() {
    this.closed = true;
    this.broadcast({ t: 'closed' });
    setTimeout(() => this.peer && this.peer.destroy(), 300);
  }
}

// A player joining someone else's game
export class RaceClient {
  constructor({ onOpen, onMessage, onClose, onError }) {
    this.handlers = { onOpen, onMessage, onClose, onError };
    this.left = false;
  }

  join(code) {
    let opened = false;
    const fail = (text) => { if (!this.left) { this.left = true; this.handlers.onError(text); this.destroy(); } };
    const timer = setTimeout(() => {
      if (!opened) fail("Couldn't connect to that game. If you're on school Wi-Fi, it may be blocking game connections.");
    }, JOIN_TIMEOUT_MS);

    try { this.peer = newPeer(); } catch (e) { clearTimeout(timer); fail(e.message); return; }
    this.peer.on('open', (myId) => {
      this.id = myId;
      this.conn = this.peer.connect(PREFIX + code, { reliable: true });
      this.conn.on('open', () => { opened = true; clearTimeout(timer); this.handlers.onOpen(myId); });
      this.conn.on('data', (msg) => this.handlers.onMessage(msg));
      this.conn.on('close', () => { clearTimeout(timer); if (!this.left) { this.left = true; this.handlers.onClose(); } });
    });
    this.peer.on('error', (err) => { clearTimeout(timer); fail(friendlyError(err)); });
  }

  send(msg) {
    if (this.conn && this.conn.open) this.conn.send(msg);
  }

  destroy() {
    this.left = true;
    try { this.peer && this.peer.destroy(); } catch (e) { /* ignore */ }
  }
}
