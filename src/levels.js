// Level builder: each platform is placed relative to the previous one,
// `gap` units away (edge to edge) in the current direction, `dy` higher.

const PALETTE = [0x4f8cff, 0x3ddc84, 0xffd23f, 0xb06cff, 0xff7eb6, 0x2ec4b6, 0xff9f43];

export class Builder {
  constructor() {
    this.parts = [];
    this.dir = [0, -1]; // start heading "forward" (-z)
    this.colorIndex = 0;
    this.last = null;
  }

  _add(part) {
    this.parts.push(part);
    return part;
  }

  _right() {
    return [-this.dir[1], this.dir[0]];
  }

  start(size = 8) {
    this.last = this._add({
      type: 'spawn', pos: [0, -0.5, 0], size: [size, 1, size], top: 0,
      color: 0xf2f5fa, dir: [...this.dir],
    });
    return this;
  }

  // Place the next platform.
  // len = size along travel direction, wid = size across it.
  p(gap, dy, len = 4, wid = len, opts = {}) {
    const L = this.last;
    const [dx, dz] = this.dir;
    const [rx, rz] = this._right();
    const prevHalf = dx !== 0 ? L.size[0] / 2 : L.size[2] / 2;
    const along = prevHalf + gap + len / 2;
    const side = opts.side || 0;
    const type = opts.type || 'normal';
    const thick = opts.thick || 1;
    const top = L.top + dy;
    const cx = L.pos[0] + dx * along + rx * side;
    const cz = L.pos[2] + dz * along + rz * side;
    const size = dx !== 0 ? [len, thick, wid] : [wid, thick, len];

    let color = opts.color;
    if (color === undefined) {
      if (type === 'check') color = 0xf2f5fa;
      else if (type === 'finish') color = 0xffc93c;
      else if (type === 'pad') color = 0x7dff3a;
      else if (type === 'vanish') color = 0x9ee7ff;
      else if (type === 'conveyor') color = 0x3a3f4b;
      else if (type === 'ice') color = 0xcff4ff;
      else if (type === 'fall') color = 0xc98a4b;
      else color = PALETTE[this.colorIndex++ % PALETTE.length];
    }

    const part = { type, pos: [cx, top - thick / 2, cz], size, top, color, dir: [...this.dir] };
    if (opts.move) part.move = this._move(opts.move);
    // Conveyor: push = { axis: 'along' | 'side', speed } (negative speed pushes the other way)
    if (opts.push) {
      const v = this._move({ axis: opts.push.axis, dist: 0, speed: 0 }).vec;
      part.push = v.map((c) => c * opts.push.speed);
    }
    this.last = this._add(part);
    return this;
  }

  _move(m) {
    const [dx, dz] = this.dir;
    const [rx, rz] = this._right();
    let vec;
    if (m.axis === 'side') vec = [rx, 0, rz];
    else if (m.axis === 'along') vec = [dx, 0, dz];
    else vec = [0, 1, 0];
    return { vec, dist: m.dist, speed: m.speed, phase: m.phase || 0 };
  }

  turn(which) {
    this.dir = which === 'right' ? this._right() : [this.dir[1], -this.dir[0]];
    return this;
  }

  check(gap, dy, size = 6) {
    return this.p(gap, dy, size, size, { type: 'check' });
  }

  finish(gap, dy) {
    return this.p(gap, dy, 6, 6, { type: 'finish' });
  }

  // Rotating lava bar(s) on the current platform
  spin(speed, opts = {}) {
    const L = this.last;
    const [dx, dz] = this.dir;
    const off = opts.offset || 0;
    const len = opts.len || Math.max(L.size[0], L.size[2]) * 1.15;
    const cx = L.pos[0] + dx * off;
    const cz = L.pos[2] + dz * off;
    this._add({ type: 'normal', pos: [cx, L.top + 0.35, cz], size: [0.6, 0.7, 0.6], top: L.top + 0.7, color: 0x8a94a6, deco: true });
    this._add({ type: 'spinner', pos: [cx, L.top + 0.9, cz], len, speed, arms: opts.arms || 1 });
    return this;
  }

  // Static lava strip lying across the current platform
  lavaStrip(offset = 0, thickness = 1) {
    const L = this.last;
    const [dx, dz] = this.dir;
    const wid = (dx !== 0 ? L.size[2] : L.size[0]) + 0.2;
    const size = dx !== 0 ? [thickness, 0.4, wid] : [wid, 0.4, thickness];
    this._add({
      type: 'lava', pos: [L.pos[0] + dx * offset, L.top + 0.2, L.pos[2] + dz * offset], size,
    });
    return this;
  }

  // Moving lava block that sweeps across (or along) the current platform
  sweeper(opts = {}) {
    const L = this.last;
    const [dx, dz] = this.dir;
    const off = opts.offset || 0;
    const axis = opts.axis || 'side';
    const wid = dx !== 0 ? L.size[2] : L.size[0];
    const dist = opts.dist || Math.max(0.5, wid / 2 - 0.6);
    const s = opts.size || 1.2;
    this._add({
      type: 'lava',
      pos: [L.pos[0] + dx * off, L.top + 0.7, L.pos[2] + dz * off],
      size: [s, 1.4, s],
      move: this._move({ axis, dist, speed: opts.speed || 2, phase: opts.phase || 0 }),
    });
    return this;
  }
}

const PI = Math.PI;

export const LEVELS = [
  {
    name: 'First Steps', diff: 'Easy',
    build(b) {
      b.start();
      b.p(2, 0).p(2, 0.5).p(2, 0.5).p(2.5, 0.5);
      b.check(2, 1);
      b.p(2, 0).p(2, 1, 3).p(2, 1, 3);
      b.turn('right');
      b.p(2.5, 0).p(2, 0, 8, 5).lavaStrip(0, 1.2);
      b.check(2, 1);
      b.p(2.5, 0, 3).p(2.5, 1, 3);
      b.turn('left');
      b.p(2.5, 1, 3).p(3, 0).p(2, 1, 3);
      b.finish(2.5, 1);
    },
  },
  {
    name: 'Lava Hop', diff: 'Easy',
    build(b) {
      b.start();
      b.p(2, 0, 10, 4).lavaStrip(-2, 1.2).lavaStrip(2, 1.2);
      b.p(2.5, 1, 3).p(3, 0, 3).p(3, 0, 3);
      b.check(2, 0);
      b.p(1.5, 0, 10, 1.5); // narrow beam
      b.p(2, 1);
      b.turn('left');
      b.p(2, 0, 12, 4).lavaStrip(-3.5, 1).lavaStrip(0, 1.5).lavaStrip(3.5, 1);
      b.check(2, 1);
      b.p(3, 0, 2.5).p(3, 0.5, 2.5, 2.5, { side: 1.5 }).p(3, 0.5, 2.5, 2.5, { side: -1.5 }).p(3, 0.5, 2.5, 2.5, { side: 1.5 });
      b.p(2, 0, 8, 1.2).p(2, 1);
      b.finish(3, 1);
    },
  },
  {
    name: 'On the Move', diff: 'Medium',
    build(b) {
      b.start();
      b.p(2, 0).p(2.5, 0, 4, 4, { move: { axis: 'side', dist: 3, speed: 1 } }).p(2.5, 0);
      b.p(2.5, 0, 3, 3, { move: { axis: 'side', dist: 4, speed: 1.2 } });
      b.p(2.5, 0.5, 3, 3, { move: { axis: 'side', dist: 4, speed: 1.2, phase: PI } });
      b.check(2.5, 0);
      b.p(2.5, 0, 4, 4, { move: { axis: 'y', dist: 2, speed: 1 } }).p(2.5, 2);
      b.p(2.5, 0, 3, 3, { move: { axis: 'along', dist: 2, speed: 1 } });
      b.turn('right');
      b.p(3, 0, 3, 3, { move: { axis: 'side', dist: 4, speed: 1.5 } });
      b.p(3, 0, 3, 3, { move: { axis: 'y', dist: 1.5, speed: 1.5 } });
      b.check(3, 1);
      b.p(2.5, 0, 3, 3, { move: { axis: 'side', dist: 5, speed: 1.8 } });
      b.p(2.5, 0, 3, 3, { move: { axis: 'side', dist: 5, speed: 1.8, phase: PI } });
      b.p(2.5, 1);
      b.finish(3, 0);
    },
  },
  {
    name: 'Spin Cycle', diff: 'Medium',
    build(b) {
      b.start();
      b.p(2, 0, 8).spin(1.2);
      b.p(2.5, 1).p(2.5, 0, 8).spin(1.6);
      b.check(2.5, 1);
      b.p(2.5, 0, 3).p(3, 0, 8).spin(1.6, { arms: 2 });
      b.turn('left');
      b.p(2.5, 1, 3).p(3, 0, 3);
      b.p(2.5, 0, 11, 4).spin(2, { len: 4.6, offset: -2.8 }).spin(-2.2, { len: 4.6, offset: 2.8 });
      b.check(2.5, 1);
      b.p(3, 0, 3, 3, { move: { axis: 'side', dist: 3, speed: 1.3 } });
      b.p(3, 0, 8).spin(2.2, { arms: 2 });
      b.p(3, 1, 3);
      b.finish(3, 1);
    },
  },
  {
    name: 'Bounce House', diff: 'Medium',
    build(b) {
      b.start();
      b.p(2, 0).p(2, 0, 3, 3, { type: 'pad' }).p(2.5, 5);
      b.p(2.5, 0, 3, 3, { type: 'pad' });
      b.check(2.5, 5);
      b.p(2.5, 0, 3).p(3, 0, 3, 3, { type: 'pad' }).p(6, 1);
      b.turn('right');
      b.p(2.5, 0, 3, 3, { type: 'pad', move: { axis: 'side', dist: 2, speed: 1 } }).p(2.5, 5);
      b.check(2.5, 0);
      b.p(2.5, 0, 3, 3, { type: 'pad' }).p(2.5, 5, 3, 3, { type: 'pad' }).p(2.5, 5, 3, 3, { type: 'pad' }).p(2.5, 5);
      b.p(3, 0, 8, 4).lavaStrip(0, 1.5);
      b.finish(3, 1);
    },
  },
  {
    name: 'Now You See Me', diff: 'Hard',
    build(b) {
      b.start();
      b.p(2, 0);
      b.p(2.5, 0, 3, 3, { type: 'vanish' }).p(2.5, 0, 3, 3, { type: 'vanish' }).p(2.5, 0, 3, 3, { type: 'vanish' });
      b.p(2.5, 1);
      b.check(2.5, 0);
      b.p(2.5, 0, 2.5, 2.5, { type: 'vanish' });
      b.p(2.5, 0.5, 2.5, 2.5, { type: 'vanish', side: 2 });
      b.p(2.5, 0.5, 2.5, 2.5, { type: 'vanish', side: -2 });
      b.p(2.5, 0.5, 2.5, 2.5, { type: 'vanish', side: -2 });
      b.p(2.5, 0);
      b.turn('left');
      b.p(2.5, 0, 2, 2, { type: 'vanish' }).p(3, 0, 2, 2, { type: 'vanish' }).p(3, 0.5, 2, 2, { type: 'vanish' });
      b.check(2.5, 1);
      b.p(3, 0, 3, 3, { type: 'vanish', move: { axis: 'side', dist: 3, speed: 1.2 } });
      b.p(3, 0, 3, 3, { type: 'vanish' });
      b.p(3, 0, 8).spin(1.8);
      b.p(3, 0.5, 2.5, 2.5, { type: 'vanish' }).p(3, 0.5, 2.5, 2.5, { type: 'vanish' });
      b.finish(3, 0.5);
    },
  },
  {
    name: 'Lava Sweepers', diff: 'Hard',
    build(b) {
      b.start();
      b.p(2, 0, 10, 5).sweeper({ offset: -2, speed: 2 }).sweeper({ offset: 2, speed: 2.5, phase: 1.5 });
      b.p(3, 1, 3).p(3.5, 0, 1.5).p(3.5, 0.5, 1.5);
      b.check(2.5, 0);
      b.p(2, 0, 12, 1.2).sweeper({ axis: 'along', dist: 4.5, speed: 1.5 });
      b.p(3, 1, 3);
      b.turn('right');
      b.p(4, 0, 3, 3, { move: { axis: 'side', dist: 3, speed: 1.8 } }).p(4, 0, 3);
      b.check(2.5, 1);
      b.p(2, 0, 10, 6).sweeper({ offset: -3, speed: 2.5 }).sweeper({ offset: 0, speed: 3, phase: 2 }).sweeper({ offset: 3, speed: 3.5, phase: 4 });
      b.p(3.5, 1, 2).p(4, 0, 2, 2, { type: 'vanish' }).p(4, 0.5, 2);
      b.finish(3.5, 0.5);
    },
  },
  {
    name: 'Sky Tower', diff: 'Very Hard',
    build(b) {
      b.start();
      b.p(2.5, 1, 3).p(3, 1.5, 3);
      b.turn('right');
      b.p(3, 1.5, 3).p(3, 1.5, 3);
      b.turn('right');
      b.p(3, 1.5, 3, 3, { move: { axis: 'y', dist: 1.5, speed: 1.2 } }).p(3, 1.5, 3);
      b.turn('right');
      b.check(2.5, 1);
      b.p(3, 0, 3, 3, { type: 'pad' }).p(3, 5, 3);
      b.turn('right');
      b.p(3.5, 1, 2).p(3.5, 1, 2);
      b.turn('right');
      b.p(3, 0, 6).spin(2, { arms: 2 });
      b.p(3, 1, 3, 3, { move: { axis: 'y', dist: 1.2, speed: 1.6 } });
      b.turn('right');
      b.check(3, 1);
      b.p(3, 0, 2.5, 2.5, { type: 'vanish' }).p(3, 1, 2.5, 2.5, { type: 'vanish' });
      b.turn('right');
      b.p(3, 0, 3, 3, { type: 'pad' }).p(3, 5, 3, 3, { move: { axis: 'y', dist: 1, speed: 2 } });
      b.p(3.5, 1, 2);
      b.turn('right');
      b.p(3.5, 1, 2);
      b.finish(3, 1);
    },
  },
  {
    name: 'Chaos Run', diff: 'Very Hard',
    build(b) {
      b.start();
      b.p(3, 0, 2).p(4, 0.5, 2).p(4, 0.5, 2, 2, { move: { axis: 'side', dist: 3, speed: 2 } });
      b.p(4, 0, 6).spin(2.6, { arms: 2 });
      b.p(3, 1, 2, 2, { type: 'vanish' }).p(4, 0, 2, 2, { type: 'vanish' });
      b.check(3.5, 1, 5);
      b.p(2, 0, 12, 1).sweeper({ axis: 'along', dist: 5, speed: 2 });
      b.p(3, 0, 2, 2, { type: 'pad' }).p(4, 5, 2);
      b.turn('left');
      b.p(4.5, 0, 1.5).p(4.5, 0, 1.5, 1.5, { move: { axis: 'y', dist: 1.5, speed: 2 } });
      b.check(4, 0.5, 5);
      b.p(2, 0, 10, 5).sweeper({ offset: -2.5, speed: 3 }).sweeper({ offset: 2.5, speed: 3.5, phase: 1 });
      b.p(3.5, 1, 2, 2, { move: { axis: 'side', dist: 3.5, speed: 2.2 } });
      b.p(3.5, 0, 2, 2, { move: { axis: 'side', dist: 3.5, speed: 2.2, phase: PI } });
      b.p(4, 0.5, 6).spin(3, { arms: 2 });
      b.p(3.5, 1, 1.5, 1.5, { type: 'vanish' });
      b.finish(4, 0.5);
    },
  },
  {
    name: 'The Summit', diff: 'Extreme',
    build(b) {
      b.start();
      b.p(4, 0, 1.5).p(4.5, 0, 1.5).p(5, 0, 1.5).p(4, 1, 1.2);
      b.p(4, 1, 1.2, 1.2, { move: { axis: 'side', dist: 4, speed: 2.5 } });
      b.p(4, 0, 6).spin(3.2, { arms: 2 });
      b.check(3, 1, 4);
      b.p(2, 0, 14, 0.8).sweeper({ axis: 'along', dist: 6, speed: 2.5 });
      b.p(4, 1, 1.5, 1.5, { type: 'vanish' });
      b.p(4.5, 0, 1.5, 1.5, { type: 'vanish', side: 2 });
      b.p(4.5, 0, 1.5, 1.5, { type: 'vanish', side: -2 });
      b.p(3, 0, 2, 2, { type: 'pad', move: { axis: 'side', dist: 3, speed: 2 } }).p(4, 5, 1.5);
      b.turn('right');
      b.p(5, 0, 1.5);
      b.check(4, 1, 4);
      b.p(3, 0, 1.5, 1.5, { move: { axis: 'y', dist: 2, speed: 2.5 } });
      b.p(4, 2, 1.5, 1.5, { move: { axis: 'side', dist: 4, speed: 3 } });
      b.p(4, 0, 10, 5).sweeper({ offset: -3, speed: 4 }).sweeper({ offset: 0, speed: 4.5, phase: 1 }).sweeper({ offset: 3, speed: 5, phase: 2 });
      b.p(4, 1, 6).spin(3.5, { arms: 2 });
      b.p(4.5, 0, 1.2, 1.2, { type: 'vanish' }).p(5, 0, 1.2, 1.2, { type: 'vanish' }).p(5, 0, 1.2);
      b.finish(4.5, 1);
    },
  },

  // ===================== World 2: Sunset Peaks =====================
  // New obstacles: conveyor belts, slippery ice, falling platforms
  {
    name: 'Sunset Stroll', diff: 'Medium', world: 2,
    build(b) {
      b.start();
      b.p(2, 0).p(2.5, 0.5);
      b.p(2, 0, 10, 4, { type: 'conveyor', push: { axis: 'along', speed: 4 } });
      b.p(2.5, 0.5, 3).p(2.5, 0.5, 3);
      b.check(2.5, 0);
      b.p(2, 0, 10, 4, { type: 'ice' }).p(2.5, 0.5, 3);
      b.turn('left');
      b.p(2.5, 0, 10, 5, { type: 'conveyor', push: { axis: 'side', speed: 3 } });
      b.p(2.5, 1, 3);
      b.check(2.5, 0);
      b.p(2.5, 0, 3, 3, { type: 'fall' }).p(2.5, 0, 3, 3, { type: 'fall' }).p(2.5, 0.5, 3);
      b.finish(2.5, 0.5);
    },
  },
  {
    name: "Slip 'n' Slide", diff: 'Medium', world: 2,
    build(b) {
      b.start();
      b.p(2, 0, 12, 4, { type: 'ice' }).p(2.5, 0.5, 3, 3, { type: 'ice' }).p(3, 0.5, 3, 3, { type: 'ice' });
      b.check(2.5, 0);
      b.p(2, 0, 14, 2.5, { type: 'ice' }).lavaStrip(-3, 1).lavaStrip(3, 1);
      b.turn('right');
      b.p(2.5, 1, 3, 3, { type: 'ice' });
      b.p(3, 0, 3, 3, { type: 'ice', move: { axis: 'side', dist: 2.5, speed: 1.2 } });
      b.check(3, 0.5);
      b.p(2, 0, 10, 6, { type: 'ice' }).spin(1.5);
      b.p(3, 1, 3);
      b.finish(3, 0.5);
    },
  },
  {
    name: 'Crumble Canyon', diff: 'Hard', world: 2,
    build(b) {
      b.start();
      b.p(2.5, 0, 3, 3, { type: 'fall' }).p(3, 0, 3, 3, { type: 'fall' }).p(3, 0.5, 3, 3, { type: 'fall' }).p(3, 0.5, 3, 3, { type: 'fall' });
      b.check(2.5, 0);
      b.p(3, 0, 2.5, 2.5, { type: 'fall', side: 2 }).p(3, 0.5, 2.5, 2.5, { type: 'fall', side: -2 });
      b.p(3, 0.5, 2.5, 2.5, { type: 'fall', side: -2 }).p(3, 0, 2.5, 2.5, { type: 'fall', side: 2 });
      b.turn('left');
      b.p(3, 0, 3);
      b.check(2.5, 0.5);
      b.p(3, 0, 3, 3, { type: 'fall', move: { axis: 'side', dist: 2.5, speed: 1.3 } }).p(3, 0, 3, 3, { type: 'fall' });
      b.p(2.5, 0, 3, 3, { type: 'pad' }).p(2.5, 5, 3, 3, { type: 'fall' }).p(3, 0.5, 3, 3, { type: 'fall' });
      b.finish(3, 0.5);
    },
  },
  {
    name: 'Factory Floor', diff: 'Hard', world: 2,
    build(b) {
      b.start();
      b.p(2, 0, 12, 5, { type: 'conveyor', push: { axis: 'along', speed: -4 } });
      b.p(2.5, 0.5, 3);
      b.p(2, 0, 10, 5, { type: 'conveyor', push: { axis: 'side', speed: 4 } }).sweeper({ offset: -2, speed: 2.5 }).sweeper({ offset: 2, speed: 3, phase: 1.5 });
      b.check(2.5, 0.5);
      b.p(2.5, 0, 3, 3, { type: 'conveyor', push: { axis: 'side', speed: -3 } });
      b.p(3, 0.5, 3, 3, { type: 'conveyor', push: { axis: 'side', speed: 3 } }).p(3, 0.5, 3);
      b.turn('right');
      b.p(2, 0, 8, 8, { type: 'conveyor', push: { axis: 'along', speed: -3 } }).spin(1.8, { arms: 2 });
      b.check(2.5, 0.5);
      b.p(2, 0, 12, 1.5, { type: 'conveyor', push: { axis: 'along', speed: -5 } }).p(2.5, 1, 3);
      b.finish(3, 0.5);
    },
  },
  {
    name: 'Frostbite', diff: 'Very Hard', world: 2,
    build(b) {
      b.start();
      b.p(3, 0, 2, 2, { type: 'ice' }).p(3.5, 0.5, 2, 2, { type: 'ice' });
      b.p(3.5, 0.5, 2, 2, { type: 'ice', move: { axis: 'side', dist: 3, speed: 1.5 } });
      b.p(3.5, 0, 10, 3, { type: 'ice' }).sweeper({ axis: 'along', dist: 3.5, speed: 2 });
      b.check(3, 0.5, 5);
      b.p(3, 0, 2, 2, { type: 'ice' }).p(3.5, 1, 2, 2, { type: 'ice' });
      b.turn('left');
      b.p(3.5, 0, 2, 2, { type: 'fall' }).p(3.5, 0, 2, 2, { type: 'fall' });
      b.p(3, 0.5, 7, 7, { type: 'ice' }).spin(2.2, { arms: 2 });
      b.check(3, 0.5, 5);
      b.p(3, 0, 1.5, 1.5, { type: 'ice' }).p(3.5, 0.5, 1.5, 1.5, { type: 'ice', move: { axis: 'y', dist: 1.2, speed: 1.5 } });
      b.p(3.5, 0.5, 1.5, 1.5, { type: 'ice' });
      b.finish(3.5, 0.5);
    },
  },
  {
    name: 'Assembly Line', diff: 'Very Hard', world: 2,
    build(b) {
      b.start();
      b.p(2, 0, 10, 3, { type: 'conveyor', push: { axis: 'side', speed: 5 } });
      b.p(3, 0.5, 2.5, 2.5, { type: 'fall' }).p(3, 0.5, 2.5, 2.5, { type: 'fall' });
      b.p(3, 0, 10, 3, { type: 'conveyor', push: { axis: 'side', speed: -5 } }).lavaStrip(0, 1.2);
      b.check(3, 0.5, 5);
      b.p(3, 0, 2.5, 2.5, { type: 'conveyor', push: { axis: 'along', speed: -4 } });
      b.p(3.5, 0.5, 2.5, 2.5, { type: 'conveyor', push: { axis: 'along', speed: -4 } });
      b.turn('right');
      b.p(3, 0, 2.5, 2.5, { type: 'pad' }).p(3, 5, 2.5, 2.5, { type: 'fall' }).p(3.5, 0, 2.5, 2.5, { type: 'fall' });
      b.check(3, 0.5, 5);
      b.p(2, 0, 12, 4, { type: 'conveyor', push: { axis: 'along', speed: -6 } }).sweeper({ offset: -2.5, speed: 3 }).sweeper({ offset: 2.5, speed: 3.5, phase: 2 });
      b.p(3, 1, 2);
      b.finish(3.5, 0.5);
    },
  },
  {
    name: 'Glacier Gauntlet', diff: 'Extreme', world: 2,
    build(b) {
      b.start();
      b.p(4, 0, 1.5, 1.5, { type: 'ice' }).p(4.5, 0, 1.5, 1.5, { type: 'ice' });
      b.p(4.5, 0.5, 1.5, 1.5, { type: 'ice', move: { axis: 'side', dist: 3.5, speed: 2.2 } });
      b.p(4, 0, 8, 8, { type: 'ice' }).spin(2.4, { arms: 2 });
      b.check(3.5, 1, 4);
      b.p(2, 0, 14, 1.2, { type: 'ice' }).sweeper({ axis: 'along', dist: 6, speed: 2.2 });
      b.p(4, 1, 1.5, 1.5, { type: 'fall' }).p(4.5, 0, 1.5, 1.5, { type: 'fall', side: 2 }).p(4.5, 0, 1.5, 1.5, { type: 'fall', side: -2 });
      b.turn('left');
      b.check(4, 0.5, 4);
      b.p(4, 0, 1.5, 1.5, { type: 'ice', move: { axis: 'y', dist: 2, speed: 2 } }).p(4.5, 1, 1.5, 1.5, { type: 'ice' });
      b.p(4.5, 0, 7, 7, { type: 'ice' }).spin(3, { arms: 2 });
      b.p(4.5, 1, 1.2, 1.2, { type: 'ice' });
      b.finish(4.5, 0.5);
    },
  },
  {
    name: 'Meltdown', diff: 'Extreme', world: 2,
    build(b) {
      b.start();
      b.p(2, 0, 12, 4, { type: 'conveyor', push: { axis: 'side', speed: 6 } }).lavaStrip(-3, 1).lavaStrip(3, 1);
      b.p(4, 0.5, 1.5, 1.5, { type: 'fall' }).p(4.5, 0.5, 1.5, 1.5, { type: 'fall' });
      b.p(4.5, 0, 1.5, 1.5, { type: 'fall', move: { axis: 'side', dist: 3, speed: 2 } });
      b.check(4, 0.5, 4);
      b.p(2, 0, 12, 3, { type: 'conveyor', push: { axis: 'along', speed: -6 } })
        .sweeper({ offset: -3, speed: 3.5 }).sweeper({ offset: 1, speed: 4, phase: 1 }).sweeper({ offset: 4, speed: 4.5, phase: 2 });
      b.turn('right');
      b.p(4, 1, 1.5, 1.5, { type: 'ice' }).p(4.5, 0, 1.5, 1.5, { type: 'ice' });
      b.check(4, 0.5, 4);
      b.p(3.5, 0, 2, 2, { type: 'pad' }).p(4, 5, 1.5, 1.5, { type: 'fall' });
      b.p(4.5, 0, 6, 6, { type: 'conveyor', push: { axis: 'side', speed: -5 } }).spin(3.2, { arms: 2 });
      b.p(4.5, 1, 1.2, 1.2, { type: 'fall' });
      b.finish(4.5, 0.5);
    },
  },
  {
    name: 'The Gauntlet', diff: 'Insane', world: 2,
    build(b) {
      b.start();
      b.p(4.5, 0, 1.2, 1.2).p(5, 0, 1.2, 1.2, { type: 'fall' }).p(5, 0.5, 1.2, 1.2, { type: 'ice' });
      b.p(4.5, 0.5, 1.2, 1.2, { type: 'ice', move: { axis: 'side', dist: 4, speed: 2.8 } });
      b.p(4.5, 0, 7, 7, { type: 'conveyor', push: { axis: 'side', speed: 5 } }).spin(3.4, { arms: 2 });
      b.check(4, 1, 4);
      b.p(2, 0, 16, 1, { type: 'conveyor', push: { axis: 'along', speed: -5 } }).sweeper({ axis: 'along', dist: 7, speed: 2.8 });
      b.p(4.5, 1, 1.2, 1.2, { type: 'vanish' }).p(5, 0, 1.2, 1.2, { type: 'fall', side: 2 }).p(5, 0, 1.2, 1.2, { type: 'vanish', side: -2 });
      b.turn('right');
      b.p(4, 0, 2, 2, { type: 'pad', move: { axis: 'side', dist: 3, speed: 2.5 } }).p(4, 5, 1.2, 1.2, { type: 'ice' });
      b.check(4.5, 0, 4);
      b.p(4.5, 0, 1.2, 1.2, { type: 'ice', move: { axis: 'y', dist: 2, speed: 3 } });
      b.p(4.5, 1, 1.2, 1.2, { type: 'fall', move: { axis: 'side', dist: 4, speed: 3 } });
      b.p(4.5, 0, 10, 5, { type: 'ice' })
        .sweeper({ offset: -3, speed: 4.5 }).sweeper({ offset: 0, speed: 5, phase: 1 }).sweeper({ offset: 3, speed: 5.5, phase: 2 });
      b.p(4.5, 1, 1.2, 1.2, { type: 'fall' });
      b.finish(5, 0.5);
    },
  },
  {
    name: "Sky's Limit", diff: 'Insane', world: 2,
    build(b) {
      b.start();
      b.p(5, 0, 1.2, 1.2, { type: 'ice' }).p(5, 0, 1.2, 1.2, { type: 'fall' }).p(5.2, 0, 1.2, 1.2, { type: 'vanish' });
      b.p(4.5, 1, 1, 1, { type: 'ice', move: { axis: 'side', dist: 4, speed: 3 } });
      b.p(4.5, 0, 7, 7, { type: 'ice' }).spin(3.6, { arms: 2 });
      b.check(4, 1, 4);
      b.p(2, 0, 16, 0.8, { type: 'ice' }).sweeper({ axis: 'along', dist: 7, speed: 3 });
      b.p(4.5, 1, 1.2, 1.2, { type: 'fall' }).p(5, 0, 1.2, 1.2, { type: 'fall', side: 2.5 }).p(5, 0, 1.2, 1.2, { type: 'fall', side: -2.5 });
      b.turn('left');
      b.p(4, 0, 2, 2, { type: 'pad' }).p(4, 5, 1, 1, { type: 'vanish' });
      b.check(5, 0, 4);
      b.p(2, 0, 12, 5, { type: 'conveyor', push: { axis: 'side', speed: -7 } })
        .sweeper({ offset: -3.5, speed: 5 }).sweeper({ offset: 0, speed: 5.5, phase: 1.2 }).sweeper({ offset: 3.5, speed: 6, phase: 2.4 });
      b.p(4.5, 1, 1, 1, { type: 'ice', move: { axis: 'y', dist: 2, speed: 3 } });
      b.p(5, 1, 1, 1, { type: 'fall', move: { axis: 'side', dist: 4, speed: 3.2 } });
      b.p(4.5, 0, 7, 7, { type: 'conveyor', push: { axis: 'along', speed: -5 } }).spin(4, { arms: 2 });
      b.p(5, 1, 1, 1, { type: 'vanish' }).p(5.2, 0, 1, 1, { type: 'ice' });
      b.finish(5, 1);
    },
  },
];

for (const lvl of LEVELS) lvl.world = lvl.world || 1;

export function buildLevel(index) {
  const b = new Builder();
  LEVELS[index].build(b);
  return b.parts;
}

// ===================== Race mode: endless course =====================

// Small seeded random number generator, so every player gets the same course from the same seed
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Builds a never-ending course straight ahead (-z), a few "segments" at a time.
// Obstacles get harder the farther you go. Distance = how far along -z you are.
export class RaceCourse {
  constructor(seed) {
    this.rand = seededRandom(seed);
    this.b = new Builder();
    this.b.start(10);
    this.handed = 0; // how many parts have already been given to the game
    this.segments = 0;
  }

  // Generate until the course reaches past `z` (a negative number), return the new parts
  extend(z) {
    while (this.b.last.pos[2] > z) this._segment();
    const fresh = this.b.parts.slice(this.handed);
    this.handed = this.b.parts.length;
    return fresh;
  }

  _r(a, b) { return a + this.rand() * (b - a); }
  _pick(list) { return list[Math.floor(this.rand() * list.length)]; }

  // Steer sideways offsets back toward the middle so the course doesn't wander off
  _side(amount = 1.2) {
    const x = this.b.last.pos[0];
    return clampNum(this._r(-amount, amount) - x * 0.25, -2.5, 2.5);
  }

  // Keep the course between roughly 0 and 16 high
  _dy(max = 1) {
    const top = this.b.last.top;
    if (top > 14) return -this._r(0.5, max);
    if (top < 1) return this._r(0, max);
    return Math.round(this._r(-max, max) * 2) / 2;
  }

  _segment() {
    const b = this.b;
    const dist = -b.last.pos[2];
    const tier = Math.min(5, Math.floor(dist / 120)); // 0 = easy ... 5 = hardest
    const hop = (base) => Math.min(3.8, base + tier * 0.25); // gaps grow slowly
    const size = Math.max(1.8, 3.6 - tier * 0.35);

    const kinds = ['hops', 'hops', 'stairs', 'lavaStrip'];
    if (tier >= 1) kinds.push('mover', 'pad');
    if (tier >= 2) kinds.push('vanish', 'spinner', 'sweeper');
    if (tier >= 3) kinds.push('ice', 'conveyor', 'fall');
    if (tier >= 4) kinds.push('beam', 'spinner', 'mover');
    const kind = this._pick(kinds);

    switch (kind) {
      case 'hops': {
        const n = 3 + Math.floor(this._r(0, 3));
        for (let i = 0; i < n; i++) {
          const dy = this._dy(1);
          b.p(dy > 0.5 ? hop(2) : hop(2.6), dy, size, size, { side: this._side() });
        }
        break;
      }
      case 'stairs': {
        const up = b.last.top < 10;
        for (let i = 0; i < 4; i++) b.p(hop(1.8), up ? 1 : -1, size, size, { side: this._side(0.6) });
        break;
      }
      case 'lavaStrip': {
        b.p(hop(2), this._dy(0.5), 10, 4);
        b.lavaStrip(-2.2, 1.2).lavaStrip(2.2, 1.2);
        break;
      }
      case 'mover': {
        for (let i = 0; i < 2; i++) {
          b.p(hop(2.4), 0, 3, 3, { move: { axis: 'side', dist: this._r(2, 3.5), speed: this._r(1, 1.6) + tier * 0.15, phase: this._r(0, 6) } });
        }
        b.p(hop(2.4), 0, 4, 4);
        break;
      }
      case 'pad': {
        if (b.last.top > 10) { b.p(hop(2.4), -1, 4, 4); break; }
        b.p(2.2, 0, 3, 3, { type: 'pad' }).p(2.5, 4.5, 4, 4);
        break;
      }
      case 'vanish': {
        for (let i = 0; i < 3; i++) b.p(hop(2.3), this._dy(0.5), 2.5, 2.5, { type: 'vanish', side: this._side(1) });
        b.p(hop(2.3), 0, 4, 4);
        break;
      }
      case 'spinner': {
        b.p(hop(2.2), this._dy(0.5), 7, 7).spin(this._r(1.2, 1.8) + tier * 0.2, { arms: tier >= 4 ? 2 : 1 });
        break;
      }
      case 'sweeper': {
        b.p(hop(2), this._dy(0.5), 10, 5);
        b.sweeper({ offset: -2.5, speed: 2 + tier * 0.3 }).sweeper({ offset: 2.5, speed: 2.4 + tier * 0.3, phase: 1.5 });
        break;
      }
      case 'ice': {
        b.p(hop(2), 0, 10, 3, { type: 'ice' });
        for (let i = 0; i < 2; i++) b.p(hop(2.4), this._dy(0.5), 2.5, 2.5, { type: 'ice', side: this._side() });
        break;
      }
      case 'conveyor': {
        b.p(hop(2), 0, 10, 4, { type: 'conveyor', push: { axis: 'side', speed: (this.rand() < 0.5 ? -1 : 1) * (3 + tier * 0.4) } });
        break;
      }
      case 'fall': {
        for (let i = 0; i < 3; i++) b.p(hop(2.4), this._dy(0.5), 2.5, 2.5, { type: 'fall', side: this._side() });
        b.p(hop(2.4), 0, 4, 4);
        break;
      }
      case 'beam': {
        b.p(2, 0, 12, 1.4).sweeper({ axis: 'along', dist: 4.5, speed: 1.8 });
        b.p(2.5, 0.5, 3, 3);
        break;
      }
    }

    this.segments++;
    if (this.segments % 4 === 0) b.check(2.5, 0); // checkpoint every few segments
  }
}

function clampNum(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
