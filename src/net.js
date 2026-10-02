// Multiplayer connections for Race mode.
// Everyone (host and players) connects to our relay server with a normal secure
// WebSocket — the same kind of connection websites use — so school and home networks
// don't block it. The relay (relay/ folder, a Cloudflare Worker) passes messages
// between the host and the players; the host's game runs the race.

const DEFAULT_RELAY = 'wss://skyclimb-relay.skyclimb-relay.workers.dev';
// For testing: ?relay=ws://localhost:8787 in the page address uses a local relay
const RELAY_URL = new URLSearchParams(location.search).get('relay') || DEFAULT_RELAY;

const JOIN_TIMEOUT_MS = 15000;
export const CODE_LENGTH = 6;

// A fresh random 6-digit game PIN (like Kahoot) every time someone hosts
export function makeGameCode() {
  return String(100000 + Math.floor(Math.random() * 900000));
}

export function cleanGameCode(text) {
  return String(text || '').replace(/[^0-9]/g, '').slice(0, CODE_LENGTH);
}

const UNREACHABLE = "Couldn't reach the multiplayer server. Check your internet connection (school networks sometimes block game sites).";

function openSocket(code, role) {
  return new WebSocket(`${RELAY_URL}/room/${code}?role=${role}`);
}

// The host: owns the game. Messages are plain objects.
export class RaceHost {
  constructor({ onReady, onJoin, onLeave, onMessage, onError }) {
    this.handlers = { onReady, onJoin, onLeave, onMessage, onError };
    this.players = new Set();
    this.closed = false;
  }

  start(tries = 0) {
    this.code = makeGameCode();
    let ready = false;
    const ws = (this.ws = openSocket(this.code, 'host'));
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.sys === 'hosted') { ready = true; this.handlers.onReady(this.code); }
      else if (m.sys === 'join') { this.players.add(m.id); this.handlers.onJoin(m.id); }
      else if (m.sys === 'leave') this._drop(m.id);
      else if (m.sys === 'msg') this.handlers.onMessage(m.from, m.data);
    };
    ws.onclose = (e) => {
      if (this.closed || ws !== this.ws) return;
      if (e.code === 4001 && tries < 5) return this.start(tries + 1); // PIN taken: pick another
      this.handlers.onError(ready ? 'Lost connection to the multiplayer server.' : UNREACHABLE);
    };
  }

  _drop(id) {
    if (!this.players.delete(id)) return;
    this.handlers.onLeave(id);
  }

  _send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  send(id, msg) { this._send({ to: id, data: msg }); }
  broadcast(msg) { this._send({ data: msg }); }

  kick(id) {
    this.send(id, { t: 'kicked' });
    setTimeout(() => this._send({ kick: id }), 200);
    this._drop(id);
  }

  close() {
    this.closed = true;
    this.broadcast({ t: 'closed' });
    const ws = this.ws;
    setTimeout(() => { try { ws.close(1000); } catch { /* ignore */ } }, 300);
  }
}

// A player joining someone else's game
export class RaceClient {
  constructor({ onOpen, onMessage, onClose, onError }) {
    this.handlers = { onOpen, onMessage, onClose, onError };
    this.left = false;
  }

  join(code) {
    let joined = false;
    const fail = (text) => {
      if (this.left) return;
      this.left = true;
      clearTimeout(timer);
      this.handlers.onError(text);
      try { this.ws.close(); } catch { /* ignore */ }
    };
    const timer = setTimeout(() => { if (!joined) fail(UNREACHABLE); }, JOIN_TIMEOUT_MS);

    const ws = (this.ws = openSocket(code, 'player'));
    ws.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m && m.sys === 'id') {
        joined = true;
        clearTimeout(timer);
        this.id = m.id;
        this.handlers.onOpen(m.id);
      } else if (joined) {
        this.handlers.onMessage(m);
      }
    };
    ws.onclose = (e) => {
      clearTimeout(timer);
      if (this.left) return;
      if (!joined) {
        if (e.code === 4004) return fail('No game found with that PIN. Check the PIN and try again.');
        if (e.code === 4005) return fail('That game is full.');
        return fail(UNREACHABLE);
      }
      this.left = true;
      this.handlers.onClose();
    };
  }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  destroy() {
    this.left = true;
    try { this.ws && this.ws.close(1000); } catch { /* ignore */ }
  }
}
