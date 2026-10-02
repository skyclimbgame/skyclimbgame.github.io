// Sky Climb Race relay — a Cloudflare Worker.
// Every game PIN gets its own "room" (a Durable Object). The host and the players all
// connect to the room with a normal secure WebSocket, and the room passes messages along:
//   player -> host:  { sys: 'msg', from: playerId, data }
//   host -> players: host sends { to: playerId | undefined (everyone), data }
// The room never looks inside `data`; the game on the host's device runs the race.

const ALLOWED_ORIGINS = new Set([
  'https://skyclimbgame.github.io',
  'http://localhost:5173',
  'null', // the desktop version opens the game from a local file
]);
const MAX_PLAYERS = 60;
const MAX_MESSAGE = 16 * 1024;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/room\/(\d{6})$/);
    if (!match) return new Response('Sky Climb race relay is running.', { status: 200 });
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    const origin = request.headers.get('Origin') || 'null';
    if (!ALLOWED_ORIGINS.has(origin)) return new Response('Not allowed', { status: 403 });
    const room = env.ROOMS.get(env.ROOMS.idFromName(match[1]));
    return room.fetch(request);
  },
};

export class Room {
  constructor(state) {
    this.state = state;
  }

  open(tag) {
    return this.state.getWebSockets(tag).filter((ws) => ws.readyState === 1);
  }

  async fetch(request) {
    const role = new URL(request.url).searchParams.get('role');
    const [client, server] = Object.values(new WebSocketPair());

    if (role === 'host') {
      if (this.open('host').length) {
        // Someone is already hosting this PIN: tell the new host to pick another
        this.state.acceptWebSocket(server, ['rejected']);
        server.close(4001, 'PIN taken');
      } else {
        this.state.acceptWebSocket(server, ['host']);
        server.send(JSON.stringify({ sys: 'hosted' }));
      }
    } else {
      const host = this.open('host')[0];
      if (!host) {
        this.state.acceptWebSocket(server, ['rejected']);
        server.close(4004, 'No game');
      } else if (this.open('p').length >= MAX_PLAYERS) {
        this.state.acceptWebSocket(server, ['rejected']);
        server.close(4005, 'Full');
      } else {
        const id = crypto.randomUUID().slice(0, 8);
        this.state.acceptWebSocket(server, ['p', 'p:' + id]);
        server.serializeAttachment({ id });
        server.send(JSON.stringify({ sys: 'id', id }));
        host.send(JSON.stringify({ sys: 'join', id }));
      }
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > MAX_MESSAGE) return;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const tags = this.state.getTags(ws);

    if (tags.includes('host')) {
      if (typeof msg.kick === 'string') {
        for (const p of this.open('p:' + msg.kick)) p.close(4003, 'Removed by host');
        return;
      }
      const out = JSON.stringify(msg.data);
      const targets = typeof msg.to === 'string' ? this.open('p:' + msg.to) : this.open('p');
      for (const p of targets) {
        try { p.send(out); } catch { /* player just left */ }
      }
    } else if (tags.includes('p')) {
      const host = this.open('host')[0];
      const { id } = ws.deserializeAttachment() || {};
      if (host && id) host.send(JSON.stringify({ sys: 'msg', from: id, data: msg }));
    }
  }

  webSocketClose(ws, code) {
    const tags = this.state.getTags(ws);
    if (tags.includes('host')) {
      for (const p of this.open('p')) {
        try { p.close(4000, 'Host left'); } catch { /* already gone */ }
      }
    } else if (tags.includes('p')) {
      const host = this.open('host')[0];
      const { id } = ws.deserializeAttachment() || {};
      if (host && id) host.send(JSON.stringify({ sys: 'leave', id }));
    }
    try { ws.close(code === 1005 ? 1000 : code, 'Bye'); } catch { /* already closed */ }
  }

  webSocketError(ws) {
    this.webSocketClose(ws, 1011);
  }
}
