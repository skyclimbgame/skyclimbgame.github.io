import * as THREE from '../vendor/three.module.js';
import { LEVELS, buildLevel } from './levels.js';
import { Sound } from './audio.js';
import { IMPORTED_SAVE } from './save-import.js';

// ---------- Tuning ----------
// Snappy, Roblox-like jump: same height as before but much less hang time.
// Falling is heavier than rising so jumps don't feel floaty.
const GRAVITY_UP = 55;
const GRAVITY_DOWN = 85;
const JUMP_VEL = 16.4; // apex ~2.45 units, ~0.3s to the top
const PAD_VEL = 28.1; // apex ~7.2 units
const MAX_FALL = 60;
const MOVE_SPEED = 10;
const PLAYER_H = 2.1;
const PLAYER_R = 0.4;
const STEP = 1 / 120;
const LAVA_Y = -14;
const COYOTE = 0.1;
const JUMP_BUFFER = 0.13;
const VANISH_DELAY = 0.55;
const VANISH_GONE = 2.5;
const SPINNER_SPEED = 0.6; // multiplier on every spinning bar's speed (1 = original)

// ---------- Save data ----------
const SAVE_KEY = 'skyclimb-save-v1';
const DEFAULT_AVATAR = { skin: 0xf2c29b, hair: 0x5a3825, shirt: 0xe8453c, pants: 0x2b4c7e, shoes: 0x2a2a2a, hairStyle: 'short' };
const LEADERBOARD_SIZE = 10;
const save = loadSave();

function loadSave() {
  const def = {
    unlocked: 1, best: {}, runs: {}, avatar: { ...DEFAULT_AVATAR },
    settings: { music: 50, sfx: 70, sens: 100, shadows: true },
  };
  let save = def;
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s) {
      save = {
        ...def, ...s,
        runs: s.runs || {},
        avatar: { ...def.avatar, ...(s.avatar || {}) },
        settings: { ...def.settings, ...(s.settings || {}) },
      };
    }
  } catch (e) { /* ignore */ }
  save = mergeImported(save);
  // Seed leaderboards from best times recorded before leaderboards existed
  for (const [lvl, t] of Object.entries(save.best)) {
    if (!save.runs[lvl] || !save.runs[lvl].length) save.runs[lvl] = [{ t, d: null, date: null }];
  }
  return save;
}

// Fold in progress from the old desktop version (most levels unlocked, fastest times win)
function mergeImported(save) {
  if (save.imported) return save;
  save.unlocked = Math.max(save.unlocked, IMPORTED_SAVE.unlocked);
  for (const [lvl, t] of Object.entries(IMPORTED_SAVE.best)) {
    if (save.best[lvl] === undefined || t < save.best[lvl]) save.best[lvl] = t;
  }
  save.imported = true;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
  return save;
}
function writeSave() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
}

// ---------- Renderer / scene ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
// Phones: slightly lower resolution keeps the frame rate smooth
const IS_TOUCH_DEVICE = window.matchMedia('(pointer: coarse)').matches;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_TOUCH_DEVICE ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = save.settings.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const SKY_HORIZON = new THREE.Color(0xcdeeff);
scene.fog = new THREE.Fog(SKY_HORIZON, 60, 260);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const hemi = new THREE.HemisphereLight(0xdff3ff, 0x7aa07a, 1.3);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -35;
sun.shadow.camera.right = 35;
sun.shadow.camera.top = 35;
sun.shadow.camera.bottom = -35;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 120;
sun.shadow.bias = -0.0005;
scene.add(sun);
scene.add(sun.target);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Sky dome with a vertical gradient
{
  const geo = new THREE.SphereGeometry(600, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x3d8bff) },
      bottom: { value: SKY_HORIZON },
    },
    vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying vec3 vPos;
      void main(){ float h = clamp(normalize(vPos).y * 1.6 + 0.1, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, h), 1.0); }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  scene.add(sky);
  scene.userData.sky = sky;
}

// Per-world sky / light colors
const THEMES = {
  1: { top: 0x3d8bff, bottom: 0xcdeeff, hemi: 0xdff3ff, sun: 0xffffff },
  2: { top: 0x6a4fd8, bottom: 0xffc9a0, hemi: 0xfff2ea, sun: 0xffe9d6 }, // Sunset Peaks
};
function applyTheme(worldNum) {
  const t = THEMES[worldNum] || THEMES[1];
  const u = scene.userData.sky.material.uniforms;
  u.top.value.set(t.top);
  u.bottom.value.set(t.bottom);
  scene.fog.color.set(t.bottom);
  hemi.color.set(t.hemi);
  sun.color.set(t.sun);
}

// ---------- Textures ----------
function makeBlockTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) {
    const v = 235 + Math.random() * 20;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  g.strokeStyle = 'rgba(0,0,0,0.13)';
  g.lineWidth = 4;
  g.strokeRect(2, 2, 124, 124);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function makeLavaTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ff3d00';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * 256, y = Math.random() * 256, r = 10 + Math.random() * 40;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const hot = Math.random() < 0.5;
    grd.addColorStop(0, hot ? 'rgba(255,230,80,0.9)' : 'rgba(150,20,0,0.7)');
    grd.addColorStop(1, 'rgba(255,60,0,0)');
    g.fillStyle = grd;
    // draw wrapped so the texture tiles seamlessly
    for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) {
      g.save(); g.translate(ox, oy); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.restore();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const blockTex = makeBlockTexture();
const lavaTex = makeLavaTexture();
const lavaSeaTex = lavaTex.clone();
lavaSeaTex.needsUpdate = true;
lavaSeaTex.repeat.set(80, 80);

const matCache = new Map();
function blockMat(color) {
  if (!matCache.has(color)) {
    matCache.set(color, new THREE.MeshStandardMaterial({ color, map: blockTex, roughness: 0.75, metalness: 0.0 }));
  }
  return matCache.get(color);
}
// Kill bricks: solid red blocks (the lava texture is only used for the sea)
const lavaMat = new THREE.MeshStandardMaterial({
  color: 0xff1e1e, map: blockTex, emissive: 0x550000, roughness: 0.45,
});
const goldMat = new THREE.MeshStandardMaterial({ color: 0xffc93c, metalness: 0.6, roughness: 0.3, emissive: 0x442200 });

// Ice: glossy, slightly see-through
const iceMat = new THREE.MeshStandardMaterial({
  color: 0xcff4ff, map: blockTex, roughness: 0.05, metalness: 0.15, transparent: true, opacity: 0.85, emissive: 0x1a3a4a,
});

// Conveyor belt: yellow chevrons pointing toward +v, scrolled to show the push direction
function makeArrowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#2b2f38';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#ffd23f';
  g.lineWidth = 14;
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(28, 84); g.lineTo(64, 44); g.lineTo(100, 84);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const arrowTex = makeArrowTexture();

// Falling platform: wood-like block with cracks
function makeCrackTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(60,30,10,0.55)';
  g.lineWidth = 3;
  for (let i = 0; i < 5; i++) {
    let x = Math.random() * 128, y = Math.random() * 128;
    g.beginPath();
    g.moveTo(x, y);
    for (let j = 0; j < 4; j++) {
      x += (Math.random() - 0.5) * 50; y += (Math.random() - 0.5) * 50;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  g.strokeStyle = 'rgba(0,0,0,0.2)';
  g.lineWidth = 4;
  g.strokeRect(2, 2, 124, 124);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const fallMat = new THREE.MeshStandardMaterial({ color: 0xc98a4b, map: makeCrackTexture(), roughness: 0.85 });

const FALL_DELAY = 0.45; // shake time before a falling platform drops
const FALL_RESPAWN = 3; // seconds until it comes back

// Box geometry whose UVs tile the texture every `tile` units
function boxGeo(sx, sy, sz, tile = 2) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  const uv = g.attributes.uv;
  const dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile);
    }
  }
  return g;
}

// Box with rounded edges and corners, radius r
function roundedBoxGeo(w, h, d, r, seg = 6) {
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  const pos = g.attributes.position;
  const nrm = g.attributes.normal;
  const half = new THREE.Vector3(w / 2 - r, h / 2 - r, d / 2 - r);
  const v = new THREE.Vector3(), inner = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    inner.set(
      THREE.MathUtils.clamp(v.x, -half.x, half.x),
      THREE.MathUtils.clamp(v.y, -half.y, half.y),
      THREE.MathUtils.clamp(v.z, -half.z, half.z),
    );
    v.sub(inner);
    if (v.lengthSq() > 1e-12) {
      v.normalize();
      nrm.setXYZ(i, v.x, v.y, v.z);
      v.multiplyScalar(r);
    }
    v.add(inner);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

// Lava sea
const lavaSea = new THREE.Mesh(
  new THREE.PlaneGeometry(2000, 2000),
  new THREE.MeshStandardMaterial({ color: 0xff5a00, map: lavaSeaTex, emissive: 0xff2a00, emissiveMap: lavaSeaTex, emissiveIntensity: 1 }),
);
lavaSea.rotation.x = -Math.PI / 2;
lavaSea.position.y = LAVA_Y;
scene.add(lavaSea);

// ---------- Clouds ----------
const cloudGroup = new THREE.Group();
scene.add(cloudGroup);
const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x8a9aaa, roughness: 1, transparent: true, opacity: 0.95 });
function buildClouds(bounds, parts) {
  cloudGroup.clear();
  const puff = new THREE.BoxGeometry(1, 1, 1);
  const cx = (bounds.min.x + bounds.max.x) / 2, cz = (bounds.min.z + bounds.max.z) / 2;
  // Keep clouds away from the course so they never block the camera
  const nearCourse = (x, z) => parts.some((p) => Math.hypot(p.center.x - x, p.center.z - z) < 35);
  for (let i = 0, tries = 0; i < 45 && tries < 500; tries++) {
    const ang = Math.random() * Math.PI * 2;
    const dist = 50 + Math.random() * 150;
    const x = cx + Math.cos(ang) * dist, z = cz + Math.sin(ang) * dist;
    if (nearCourse(x, z)) continue;
    const c = new THREE.Group();
    const n = 3 + Math.floor(Math.random() * 4);
    for (let j = 0; j < n; j++) {
      const m = new THREE.Mesh(puff, cloudMat);
      const s = 3 + Math.random() * 5;
      m.scale.set(s * 1.6, s * 0.7, s);
      m.position.set(j * 3.5 - n * 1.7, Math.random() * 1.5, (Math.random() - 0.5) * 4);
      c.add(m);
    }
    c.position.set(x, bounds.min.y - 4 + Math.random() * (bounds.max.y - bounds.min.y + 45), z);
    cloudGroup.add(c);
    i++;
  }
}

// ---------- Particles (confetti, debris) ----------
const particles = [];
const confettiGeo = new THREE.BoxGeometry(0.25, 0.25, 0.05);
const CONFETTI_COLORS = [0xff5d5d, 0xffd23f, 0x3ddc84, 0x4f8cff, 0xb06cff, 0xff7eb6];
function burst(pos, count, opts = {}) {
  for (let i = 0; i < count; i++) {
    const color = opts.color || CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    const m = new THREE.Mesh(confettiGeo, blockMat(color));
    m.position.copy(pos);
    const a = Math.random() * Math.PI * 2;
    const sp = (opts.speed || 8) * (0.4 + Math.random() * 0.6);
    const v = new THREE.Vector3(Math.cos(a) * sp, (opts.up || 10) * (0.5 + Math.random()), Math.sin(a) * sp);
    scene.add(m);
    particles.push({ mesh: m, vel: v, life: opts.life || 2.5, spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10), drag: opts.drag ?? 1.5 });
  }
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    p.vel.y -= 20 * dt;
    p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
    p.mesh.position.addScaledVector(p.vel, dt);
    p.mesh.rotation.x += p.spin.x * dt;
    p.mesh.rotation.y += p.spin.y * dt;
    p.mesh.rotation.z += p.spin.z * dt;
    if (p.life <= 0) {
      scene.remove(p.mesh);
      particles.splice(i, 1);
    }
  }
}

// ---------- World ----------
class World {
  constructor(levelIndex) {
    this.index = levelIndex;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.parts = [];
    this.spinners = [];
    this.checkpoints = [];
    this.t = 0;
    this.bounds = new THREE.Box3();

    for (const def of buildLevel(levelIndex)) this._create(def);

    this.spawnPart = this.parts.find((p) => p.type === 'spawn');
    buildClouds(this.bounds, this.parts);
  }

  _create(def) {
    if (def.type === 'spinner') return this._createSpinner(def);

    const size = new THREE.Vector3(...def.size);
    const base = new THREE.Vector3(...def.pos);
    let mat;
    if (def.type === 'lava') mat = lavaMat;
    else if (def.type === 'ice') mat = iceMat;
    else if (def.type === 'fall') mat = fallMat;
    else if (def.type === 'vanish') {
      mat = blockMat(def.color).clone();
      mat.transparent = true;
      mat.opacity = 0.85;
    } else mat = blockMat(def.color);

    const mesh = new THREE.Mesh(boxGeo(size.x, size.y, size.z), mat);
    mesh.position.copy(base);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);

    const part = {
      type: def.type, def, mesh, size, base, center: base.clone(),
      box: new THREE.Box3().setFromCenterAndSize(base, size),
      delta: new THREE.Vector3(), move: def.move || null,
      solid: def.type !== 'lava', kill: def.type === 'lava',
      state: 'solid', timer: 0, dir: def.dir,
      push: def.push ? new THREE.Vector3(...def.push) : null,
      fall: def.type === 'fall' ? { state: 'idle', timer: 0, y: 0, v: 0 } : null,
    };
    if (part.move) part.move.v = new THREE.Vector3(...part.move.vec);

    if (def.type === 'check') this._decorateCheckpoint(part);
    if (def.type === 'finish') this._decorateFinish(part);
    if (def.type === 'pad') this._decoratePad(part);
    if (def.type === 'conveyor') this._decorateConveyor(part);

    this.parts.push(part);
    this.bounds.expandByPoint(base);
  }

  _createSpinner(def) {
    const group = new THREE.Group();
    group.position.set(...def.pos);
    for (let k = 0; k < def.arms; k++) {
      const bar = new THREE.Mesh(boxGeo(def.len, 0.4, 0.4, 1), lavaMat);
      bar.rotation.y = (k * Math.PI) / def.arms;
      group.add(bar);
    }
    this.group.add(group);
    this.spinners.push({ group, len: def.len, speed: def.speed * SPINNER_SPEED, arms: def.arms, y: def.pos[1] });
  }

  _decorateCheckpoint(part) {
    const h = part.size.y / 2;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.2), blockMat(0xdddddd));
    const ox = part.size.x / 2 - 0.6, oz = part.size.z / 2 - 0.6;
    pole.position.set(ox, h + 1.6, oz);
    pole.castShadow = true;
    const flagMat = new THREE.MeshStandardMaterial({ color: 0xff4d4d, side: THREE.DoubleSide });
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.8), flagMat);
    flag.position.set(ox - 0.65, h + 2.75, oz);
    flag.castShadow = true;
    part.mesh.add(pole, flag);
    // glowing ring on top
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.5, 32), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = h + 0.02;
    part.mesh.add(ring);
    part.flag = flag;
    part.flagMat = flagMat;
    part.ring = ring;
    part.activated = false;
    this.checkpoints.push(part);
  }

  _decorateFinish(part) {
    const h = part.size.y / 2;
    const pillarGeo = boxGeo(0.6, 5, 0.6);
    const across = part.dir[0] !== 0 ? 'z' : 'x';
    for (const s of [-1, 1]) {
      const pil = new THREE.Mesh(pillarGeo, goldMat);
      pil.position.y = h + 2.5;
      pil.position[across] = s * (part.size[across] / 2 - 0.4);
      pil.castShadow = true;
      part.mesh.add(pil);
    }
    const beamSize = across === 'x' ? [part.size.x, 0.8, 0.6] : [0.6, 0.8, part.size.z];
    const beam = new THREE.Mesh(boxGeo(...beamSize), goldMat);
    beam.position.y = h + 5.2;
    beam.castShadow = true;
    part.mesh.add(beam);
    // spinning trophy
    const trophy = new THREE.Group();
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.3, 0.9, 16), goldMat);
    cup.position.y = 0.9;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.5), goldMat);
    stem.position.y = 0.25;
    const baseM = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.7), goldMat);
    trophy.add(cup, stem, baseM);
    trophy.position.y = h + 1.2;
    trophy.traverse((o) => { o.castShadow = true; });
    part.mesh.add(trophy);
    part.trophy = trophy;
  }

  _decoratePad(part) {
    const h = part.size.y / 2;
    const r = Math.min(part.size.x, part.size.z) * 0.35;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.2, 24),
      new THREE.MeshStandardMaterial({ color: 0xeaff5a, emissive: 0x335500 }));
    top.position.y = h + 0.1;
    part.mesh.add(top);
    part.padTop = top;
  }

  // Scrolling arrow belt on top of a conveyor, pointing in the push direction
  _decorateConveyor(part) {
    const along = Math.abs(part.push.x) > 0 ? part.size.x : part.size.z;
    const across = Math.abs(part.push.x) > 0 ? part.size.z : part.size.x;
    const tex = arrowTex.clone();
    tex.repeat.set(across / 2, along / 2);
    const belt = new THREE.Mesh(new THREE.PlaneGeometry(across, along), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
    belt.rotation.x = -Math.PI / 2;
    belt.receiveShadow = true;
    const holder = new THREE.Group();
    holder.rotation.y = Math.atan2(-part.push.x, -part.push.z);
    holder.position.y = part.size.y / 2 + 0.01;
    holder.add(belt);
    part.mesh.add(holder);
    part.beltTex = tex;
    part.beltRate = part.push.length() / 2; // texture repeats every 2 units
  }

  update(dt) {
    this.t += dt;
    for (const p of this.parts) {
      if (p.fall) this._updateFall(p, dt);
      if (p.move || p.fall) {
        const next = p.base.clone();
        if (p.move) {
          const m = p.move;
          next.addScaledVector(m.v, Math.sin(this.t * m.speed + m.phase) * m.dist);
        }
        if (p.fall) next.y -= p.fall.y;
        p.delta.subVectors(next, p.center);
        p.center.copy(next);
        p.mesh.position.copy(next);
        // shake before falling (visual only)
        if (p.fall && p.fall.state === 'shaking') {
          p.mesh.position.x += Math.sin(this.t * 70) * 0.07;
          p.mesh.position.z += Math.cos(this.t * 55) * 0.07;
        }
        p.box.setFromCenterAndSize(next, p.size);
      }
      if (p.type === 'vanish') this._updateVanish(p, dt);
    }
    for (const s of this.spinners) s.group.rotation.y = this.t * s.speed;
  }

  _updateFall(p, dt) {
    const f = p.fall;
    if (f.state === 'shaking') {
      f.timer -= dt;
      if (f.timer <= 0) { f.state = 'falling'; f.v = 0; }
    } else if (f.state === 'falling') {
      f.v = Math.min(f.v + 35 * dt, 40);
      f.y += f.v * dt;
      if (f.y > 40) {
        f.state = 'gone';
        f.timer = FALL_RESPAWN;
        p.solid = false;
        p.mesh.visible = false;
      }
    } else if (f.state === 'gone') {
      f.timer -= dt;
      if (f.timer <= 0) this._resetFall(p);
    }
  }

  _resetFall(p) {
    Object.assign(p.fall, { state: 'idle', timer: 0, y: 0, v: 0 });
    p.solid = true;
    p.mesh.visible = true;
    // snap back without "carrying" anything
    p.center.y = p.base.y;
    p.delta.set(0, 0, 0);
  }

  triggerFall(p) {
    if (p.fall.state !== 'idle') return;
    p.fall.state = 'shaking';
    p.fall.timer = FALL_DELAY;
    sound.crumble();
  }

  _updateVanish(p, dt) {
    if (p.state === 'fading') {
      p.timer -= dt;
      p.mesh.material.opacity = 0.35 + 0.5 * Math.abs(Math.sin(p.timer * 30));
      if (p.timer <= 0) {
        p.state = 'gone';
        p.timer = VANISH_GONE;
        p.solid = false;
        p.mesh.visible = false;
      }
    } else if (p.state === 'gone') {
      p.timer -= dt;
      if (p.timer <= 0) this._resetVanish(p);
    }
  }

  _resetVanish(p) {
    p.state = 'solid';
    p.solid = true;
    p.mesh.visible = true;
    p.mesh.material.opacity = 0.85;
  }

  triggerVanish(p) {
    if (p.state !== 'solid') return;
    p.state = 'fading';
    p.timer = VANISH_DELAY;
    sound.crumble();
  }

  // On respawn: bring back vanished blocks and fallen platforms
  resetHazards() {
    for (const p of this.parts) {
      if (p.type === 'vanish') this._resetVanish(p);
      if (p.fall) this._resetFall(p);
    }
  }

  animate(dt, time) {
    for (const c of this.checkpoints) {
      c.flag.rotation.y = Math.sin(time * 4) * 0.25;
      c.ring.material.opacity = 0.35 + Math.sin(time * 3) * 0.2;
    }
    for (const p of this.parts) {
      if (p.trophy) p.trophy.rotation.y = time * 1.5;
      if (p.padTop) p.padTop.scale.y += (1 - p.padTop.scale.y) * Math.min(1, dt * 10);
      if (p.beltTex) p.beltTex.offset.y -= p.beltRate * dt;
    }
  }

  dispose() {
    scene.remove(this.group);
    const shared = new Set([...matCache.values(), lavaMat, goldMat, iceMat, fallMat]);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && !shared.has(o.material)) o.material.dispose();
    });
    for (const p of this.parts) if (p.beltTex) p.beltTex.dispose();
  }
}

// ---------- Player ----------
class Player {
  constructor() {
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.onGround = false;
    this.ground = null;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.facing = Math.PI;
    this.walk = 0;
    this.dead = false;
    this.deadTimer = 0;
    this.padBoost = false;
    this.mesh = this._buildModel();
    this.applyAvatar(save.avatar);
    scene.add(this.mesh);
    this.box = new THREE.Box3();
  }

  // Roblox-style avatar. Feet at y=0, facing +z.
  _buildModel() {
    const g = new THREE.Group();
    const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
    const skin = mat(0xf2c29b);
    const shirt = mat(0xe8453c);
    const jeans = mat(0x2b4c7e);
    const shoe = mat(0x2a2a2a);
    const sole = mat(0xf4f4f4);
    const belt = mat(0x3b2a1e);
    const hair = mat(0x5a3825);
    const black = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });

    // Body piece with rounded edges; `piece` ones fly apart when you die
    const part = (w, h, d, r, m, parent, x, y, z) => {
      const mesh = new THREE.Mesh(roundedBoxGeo(w, h, d, r), m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.userData.piece = true;
      parent.add(mesh);
      return mesh;
    };

    // Legs: jeans + shoes (pivot at hip)
    this.legs = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.21, 0.84, 0);
      part(0.4, 0.64, 0.42, 0.08, jeans, pivot, 0, -0.3, 0);
      part(0.42, 0.2, 0.54, 0.07, shoe, pivot, 0, -0.72, 0.05);
      part(0.43, 0.06, 0.55, 0.02, sole, pivot, 0, -0.81, 0.05);
      g.add(pivot);
      this.legs.push(pivot);
    }
    part(0.84, 0.16, 0.44, 0.06, jeans, g, 0, 0.86, 0); // hips
    part(0.87, 0.08, 0.46, 0.03, belt, g, 0, 0.95, 0);

    // Torso (t-shirt) + neck
    part(0.86, 0.66, 0.46, 0.1, shirt, g, 0, 1.29, 0);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.12, 16), skin);
    neck.position.y = 1.66;
    g.add(neck);

    // Arms: sleeve + forearm + hand (pivot at shoulder)
    this.arms = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.6, 1.52, 0);
      part(0.3, 0.34, 0.38, 0.08, shirt, pivot, 0, -0.1, 0);
      part(0.24, 0.4, 0.3, 0.08, skin, pivot, 0, -0.44, 0);
      part(0.26, 0.17, 0.3, 0.08, skin, pivot, 0, -0.71, 0);
      g.add(pivot);
      this.arms.push(pivot);
    }

    // Head
    const head = new THREE.Group();
    head.position.y = 1.93;
    g.add(head);
    part(0.56, 0.52, 0.52, 0.12, skin, head, 0, 0, 0);

    // Hair (rebuilt when the style changes)
    this.hairGroup = new THREE.Group();
    head.add(this.hairGroup);
    this._part = part;
    this.mats = { skin, shirt, pants: jeans, shoes: shoe, hair };

    // Face (on the front of the head, z = 0.262)
    const fz = 0.262;
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.CircleGeometry(0.05, 20), black);
      eye.scale.y = 1.4;
      eye.position.set(s * 0.1, 0.02, fz);
      const shine = new THREE.Mesh(new THREE.CircleGeometry(0.017, 12), white);
      shine.position.set(s * 0.1 + 0.015, 0.05, fz + 0.001);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.01), hair);
      brow.position.set(s * 0.1, 0.12, fz);
      brow.rotation.z = -s * 0.12;
      head.add(eye, shine, brow);
    }
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.013, 6, 20, Math.PI), black);
    smile.rotation.z = Math.PI;
    smile.position.set(0, -0.07, fz);
    head.add(smile);

    return g;
  }

  // Build one of the hair styles into this.hairGroup (head-local coordinates)
  _buildHair(style) {
    const hg = this.hairGroup;
    for (const c of [...hg.children]) { hg.remove(c); c.geometry.dispose(); }
    const h = this.mats.hair;
    const part = (w, ht, d, r, x, y, z) => this._part(w, ht, d, r, h, hg, x, y, z);
    if (style === 'short' || style === 'long') {
      part(0.6, 0.18, 0.56, 0.08, 0, 0.22, -0.01);
      part(0.6, 0.36, 0.14, 0.06, 0, 0.06, -0.22);
      const fringe = part(0.42, 0.1, 0.1, 0.04, -0.05, 0.16, 0.24);
      fringe.rotation.z = 0.15;
      if (style === 'short') {
        for (const s of [-1, 1]) part(0.1, 0.26, 0.4, 0.04, s * 0.28, 0.1, -0.06);
      } else {
        part(0.64, 0.7, 0.16, 0.06, 0, -0.1, -0.24); // hangs down the back
        for (const s of [-1, 1]) part(0.1, 0.62, 0.42, 0.04, s * 0.3, -0.05, -0.05);
      }
    } else if (style === 'spiky') {
      part(0.6, 0.16, 0.56, 0.07, 0, 0.21, -0.01);
      part(0.6, 0.3, 0.12, 0.05, 0, 0.08, -0.22);
      const coneGeo = new THREE.ConeGeometry(0.1, 0.3, 6);
      for (const [x, z, tilt] of [[-0.18, 0.1, 0.35], [0, 0.12, 0], [0.18, 0.1, -0.35], [-0.12, -0.12, 0.25], [0.12, -0.12, -0.25]]) {
        const cone = new THREE.Mesh(coneGeo.clone(), h);
        cone.position.set(x, 0.38, z);
        cone.rotation.z = tilt;
        cone.rotation.x = -z * 1.5;
        cone.castShadow = true;
        cone.userData.piece = true;
        hg.add(cone);
      }
      coneGeo.dispose();
    } else if (style === 'buzz') {
      part(0.58, 0.08, 0.54, 0.04, 0, 0.25, 0);
      part(0.58, 0.28, 0.06, 0.03, 0, 0.1, -0.26);
    } else if (style === 'cap') {
      part(0.6, 0.22, 0.56, 0.1, 0, 0.23, -0.01); // crown
      part(0.52, 0.05, 0.3, 0.02, 0, 0.15, 0.34); // brim
      part(0.6, 0.2, 0.1, 0.04, 0, 0.04, -0.23); // hair poking out the back
    }
    // 'bald' = nothing
  }

  applyAvatar(av) {
    this.mats.skin.color.set(av.skin);
    this.mats.hair.color.set(av.hair);
    this.mats.shirt.color.set(av.shirt);
    this.mats.pants.color.set(av.pants);
    this.mats.shoes.color.set(av.shoes);
    if (this.hairStyle !== av.hairStyle) {
      this.hairStyle = av.hairStyle;
      this._buildHair(av.hairStyle);
    }
  }

  spawnAt(p, facing) {
    this.pos.copy(p);
    this.vel.set(0, 0, 0);
    this.onGround = false;
    this.ground = null;
    this.dead = false;
    this.mesh.visible = true;
    if (facing !== undefined) this.facing = facing;
  }

  updateBox() {
    this.box.min.set(this.pos.x - PLAYER_R, this.pos.y, this.pos.z - PLAYER_R);
    this.box.max.set(this.pos.x + PLAYER_R, this.pos.y + PLAYER_H, this.pos.z + PLAYER_R);
  }

  step(dt, world, input) {
    // Ride moving / falling platforms, and get pushed by conveyors
    const gp = this.ground;
    if (gp && gp.solid && (gp.move || gp.fall)) this.pos.add(gp.delta);
    if (gp && gp.push) this.pos.addScaledVector(gp.push, dt);

    // Horizontal control, relative to the camera (ice = very little grip)
    const tx = input.x * MOVE_SPEED, tz = input.z * MOVE_SPEED;
    const onIce = this.onGround && gp && gp.type === 'ice';
    const k = onIce ? 1.8 : this.onGround ? 20 : 8;
    const a = Math.min(1, k * dt);
    this.vel.x += (tx - this.vel.x) * a;
    this.vel.z += (tz - this.vel.z) * a;

    // Jumping (with coyote time + input buffering)
    this.coyote = this.onGround ? COYOTE : this.coyote - dt;
    if (input.jumpPressed) this.jumpBuffer = JUMP_BUFFER;
    else this.jumpBuffer -= dt;
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.vel.y = JUMP_VEL;
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.onGround = false;
      this.padBoost = false;
      sound.jump();
    }

    // Gravity (short hop when jump is released early)
    let g = this.vel.y > 0 ? GRAVITY_UP : GRAVITY_DOWN;
    if (this.vel.y > 0 && !input.jumpHeld && !this.padBoost) g *= 2;
    this.vel.y = Math.max(this.vel.y - g * dt, -MAX_FALL);

    const solids = world.parts.filter((p) => p.solid);
    const wasGround = this.onGround;

    // --- Y axis ---
    const prevY = this.pos.y;
    this.pos.y += this.vel.y * dt;
    this.onGround = false;
    let newGround = null;
    this.updateBox();
    for (const p of solids) {
      if (!overlaps(this.box, p.box)) continue;
      if (prevY >= p.box.max.y - 0.35 && this.vel.y <= 0.001 + (p.move ? Math.max(0, p.delta.y / dt) : 0)) {
        this.pos.y = p.box.max.y;
        if (this.vel.y < 0) this.vel.y = 0;
        this.onGround = true;
        newGround = p;
        this.updateBox();
      } else if (prevY + PLAYER_H <= p.box.min.y + 0.35 && this.vel.y > 0) {
        this.pos.y = p.box.min.y - PLAYER_H;
        this.vel.y = 0;
        this.updateBox();
      }
    }
    this.ground = newGround;

    // --- X axis ---
    this.pos.x += this.vel.x * dt;
    this.updateBox();
    for (const p of solids) {
      if (!overlaps(this.box, p.box)) continue;
      const left = this.box.max.x - p.box.min.x;
      const right = p.box.max.x - this.box.min.x;
      if (left < right) this.pos.x -= left + 0.001;
      else this.pos.x += right + 0.001;
      this.vel.x = 0;
      this.updateBox();
    }

    // --- Z axis ---
    this.pos.z += this.vel.z * dt;
    this.updateBox();
    for (const p of solids) {
      if (!overlaps(this.box, p.box)) continue;
      const back = this.box.max.z - p.box.min.z;
      const front = p.box.max.z - this.box.min.z;
      if (back < front) this.pos.z -= back + 0.001;
      else this.pos.z += front + 0.001;
      this.vel.z = 0;
      this.updateBox();
    }

    // Landing effects
    if (this.onGround && !wasGround && this.ground.type !== 'pad') sound.land();
    if (this.onGround && this.ground.type === 'pad') {
      this.vel.y = PAD_VEL;
      this.onGround = false;
      this.padBoost = true;
      this.coyote = 0;
      this.ground.padTop.scale.y = 0.2;
      sound.bounce();
    }
    if (this.vel.y <= 0) this.padBoost = false;
  }

  animate(dt, time, input) {
    this.mesh.position.copy(this.pos);
    const moving = Math.hypot(this.vel.x, this.vel.z);
    // faceYaw set = shoulder-cam mode: always face where the camera aims
    if (this.faceYaw != null || moving > 0.5) {
      const target = this.faceYaw != null ? this.faceYaw : Math.atan2(this.vel.x, this.vel.z);
      let diff = target - this.facing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.facing += diff * Math.min(1, dt * (this.faceYaw != null ? 25 : 14));
    }
    this.mesh.rotation.y = this.facing;

    if (this.onGround) {
      this.walk += dt * moving * 1.3;
      const amt = Math.min(1, moving / MOVE_SPEED) * 0.9;
      const s = Math.sin(this.walk) * amt;
      this.legs[0].rotation.x = s;
      this.legs[1].rotation.x = -s;
      this.arms[0].rotation.x = -s;
      this.arms[1].rotation.x = s;
      this.arms[0].rotation.z = this.arms[1].rotation.z = 0;
    } else {
      // arms up while airborne
      const up = this.vel.y > 0 ? -2.6 : -2.2;
      for (const a of this.arms) a.rotation.x += (up - a.rotation.x) * Math.min(1, dt * 10);
      this.arms[0].rotation.z = -0.2;
      this.arms[1].rotation.z = 0.2;
      this.legs[0].rotation.x += (0.4 - this.legs[0].rotation.x) * Math.min(1, dt * 10);
      this.legs[1].rotation.x += (-0.3 - this.legs[1].rotation.x) * Math.min(1, dt * 10);
    }
  }

  explode() {
    this.dead = true;
    this.mesh.visible = false;
    this.mesh.updateMatrixWorld(true);
    const pieces = [];
    this.mesh.traverse((o) => { if (o.userData.piece) pieces.push(o); });
    for (const piece of pieces) {
      const m = new THREE.Mesh(piece.geometry, piece.material);
      piece.getWorldPosition(m.position);
      piece.getWorldQuaternion(m.quaternion);
      m.castShadow = true;
      scene.add(m);
      const v = new THREE.Vector3((Math.random() - 0.5) * 12, 6 + Math.random() * 8, (Math.random() - 0.5) * 12);
      particles.push({ mesh: m, vel: v, life: 1.3, spin: new THREE.Vector3(Math.random() * 12, Math.random() * 12, Math.random() * 12), drag: 0.5 });
    }
  }
}

function overlaps(a, b) {
  const e = 0.0005;
  return a.min.x < b.max.x - e && a.max.x > b.min.x + e &&
    a.min.y < b.max.y - e && a.max.y > b.min.y + e &&
    a.min.z < b.max.z - e && a.max.z > b.min.z + e;
}

// ---------- Input ----------
const keys = new Set();
let jumpQueued = false;
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    if (!keys.has('Space')) jumpQueued = true;
    e.preventDefault();
  }
  keys.add(e.code);
  onKey(e);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

// Third-person camera, directly behind the character
const CAM_PITCH = 0.25;
const SHOULDER = 0; // how far right of the head the camera sits (0 = centered)
const HEAD_H = 2.6; // aim point slightly above the head so the crosshair isn't on the character
const cam = { yaw: 0, pitch: CAM_PITCH, dist: 6, curDist: 6, target: new THREE.Vector3() };
// Mouse look — no clicking needed. Moving the mouse always turns the camera while playing.
// If the mouse isn't captured, holding the cursor near the left/right edge keeps turning.
const EDGE_ZONE = 0.12; // outer 12% of the screen on each side
const EDGE_TURN_SPEED = 2.6; // radians per second at the very edge
const mouse = { x: 0.5, inside: false };
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('mousemove', (e) => {
  // Phones send fake mouse events after a tap — ignore those
  if (performance.now() - touch.last < 1000) { mouse.inside = false; return; }
  mouse.x = e.clientX / window.innerWidth;
  mouse.inside = true;
  if (state !== 'playing') return;
  const sens = 0.0025 * (save.settings.sens / 100);
  cam.yaw -= e.movementX * sens;
  cam.pitch = THREE.MathUtils.clamp(cam.pitch + e.movementY * sens, -1.0, 1.35);
});
document.documentElement.addEventListener('mouseleave', () => { mouse.inside = false; });

function edgeTurn(dt) {
  if (state !== 'playing' || document.pointerLockElement === canvas || !mouse.inside) return;
  let push = 0;
  if (mouse.x < EDGE_ZONE) push = (EDGE_ZONE - mouse.x) / EDGE_ZONE;
  else if (mouse.x > 1 - EDGE_ZONE) push = -(mouse.x - (1 - EDGE_ZONE)) / EDGE_ZONE;
  cam.yaw += push * EDGE_TURN_SPEED * (save.settings.sens / 100) * dt;
}
window.addEventListener('wheel', (e) => {
  if (state !== 'playing') return;
  cam.dist = THREE.MathUtils.clamp(cam.dist + Math.sign(e.deltaY) * 0.8, 3, 14);
});

const camRay = new THREE.Raycaster();
const camBack = new THREE.Vector3();
const camRight = new THREE.Vector3();
const camPivot = new THREE.Vector3();
const camFocus = new THREE.Vector3();
const camAim = new THREE.Vector3();

function updateShoulderCamera(dt) {
  const focus = player.dead ? spawnPoint : player.pos;
  // tight follow so the view feels locked to the character
  cam.target.lerp(camFocus.set(focus.x, focus.y + HEAD_H, focus.z), Math.min(1, dt * 25));

  const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
  const sp = Math.sin(cam.pitch), cp = Math.cos(cam.pitch);
  camBack.set(sy * cp, sp, cy * cp); // from the character toward the camera
  camRight.set(cy, 0, -sy);
  camPivot.copy(cam.target).addScaledVector(camRight, SHOULDER);

  // Don't let the camera go through platforms: pull it in when something is behind us
  let dist = cam.dist;
  camRay.set(camPivot, camBack);
  camRay.far = cam.dist;
  const hit = camRay.intersectObjects(world.group.children, true)[0];
  if (hit) dist = Math.max(0.8, hit.distance - 0.3);
  cam.curDist = dist < cam.curDist ? dist : cam.curDist + (dist - cam.curDist) * Math.min(1, dt * 6);

  camera.position.copy(camPivot).addScaledVector(camBack, cam.curDist);
  // aim far ahead so the crosshair points where the character faces
  camera.lookAt(camAim.copy(camPivot).addScaledVector(camBack, -30));
}
canvas.addEventListener('mousedown', () => {
  if (state === 'playing' && document.pointerLockElement !== canvas) lockPointer();
});

// Capture (hide) the mouse for Rivals-style look. Browsers only allow this right after a
// click or key press, so we also try on every key press while playing.
let lockPending = false;
function lockPointer() {
  if (lockPending || document.pointerLockElement === canvas) return;
  lockPending = true;
  try {
    const r = canvas.requestPointerLock();
    if (r && r.catch) r.catch(() => { lockPending = false; });
  } catch (e) { lockPending = false; }
}
document.addEventListener('pointerlockchange', () => { lockPending = false; });
document.addEventListener('pointerlockerror', () => { lockPending = false; });
window.addEventListener('keydown', (e) => {
  if (state === 'playing' && e.code !== 'Escape' && e.code !== 'F11') lockPointer();
});

// ---------- Touch controls (phones / tablets) ----------
// Left side: floating joystick to move. Right side: drag to look. Buttons: jump + pause.
const touch = { joyId: null, joyX: 0, joyY: 0, ox: 0, oy: 0, lookId: null, lx: 0, ly: 0, jumpHeld: false, last: 0 };
const TOUCH_LOOK_SENS = 0.006;
const touchUI = document.getElementById('touch-ui');
const joyBase = document.getElementById('joy-base');
const joyKnob = document.getElementById('joy-knob');
const jumpBtn = document.getElementById('btn-jump');

function enableTouchMode() {
  document.body.classList.add('touch');
}
if (window.matchMedia('(pointer: coarse)').matches) enableTouchMode();
window.addEventListener('touchstart', () => { touch.last = performance.now(); enableTouchMode(); }, { capture: true, passive: true });

// Joystick size matches the CSS: min(510px, 62vh, 42vw). The knob can travel a bit under half of it.
const joySize = () => Math.min(510, window.innerHeight * 0.62, window.innerWidth * 0.42);
const joyRadius = () => joySize() * 0.47;

function placeJoystick(x, y) {
  joyBase.style.left = x + 'px';
  joyBase.style.top = y + 'px';
}
function restJoystick() {
  const r = joySize() / 2;
  placeJoystick(r + 24, window.innerHeight - r - 24);
  joyKnob.style.transform = '';
  joyBase.classList.remove('active');
  touch.joyX = touch.joyY = 0;
}
restJoystick();
window.addEventListener('resize', () => { if (touch.joyId === null) restJoystick(); });

touchUI.addEventListener('touchstart', (e) => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.target === jumpBtn) {
      jumpQueued = true;
      touch.jumpHeld = true;
      jumpBtn.classList.add('down');
      touch.jumpId = t.identifier;
    } else if (t.target.id === 'btn-pause') {
      pause();
    } else if (t.clientX < window.innerWidth * 0.45 && touch.joyId === null) {
      touch.joyId = t.identifier;
      touch.ox = t.clientX;
      touch.oy = t.clientY;
      placeJoystick(t.clientX, t.clientY);
      joyBase.classList.add('active');
    } else if (touch.lookId === null) {
      touch.lookId = t.identifier;
      touch.lx = t.clientX;
      touch.ly = t.clientY;
    }
  }
}, { passive: false });

touchUI.addEventListener('touchmove', (e) => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === touch.joyId) {
      let dx = t.clientX - touch.ox, dy = t.clientY - touch.oy;
      const len = Math.hypot(dx, dy);
      const R = joyRadius();
      if (len > R) { dx *= R / len; dy *= R / len; }
      joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      touch.joyX = dx / R;
      touch.joyY = dy / R;
    } else if (t.identifier === touch.lookId) {
      const sens = TOUCH_LOOK_SENS * (save.settings.sens / 100);
      cam.yaw -= (t.clientX - touch.lx) * sens;
      cam.pitch = THREE.MathUtils.clamp(cam.pitch + (t.clientY - touch.ly) * sens, -1.0, 1.35);
      touch.lx = t.clientX;
      touch.ly = t.clientY;
    }
  }
}, { passive: false });

function endTouches(e) {
  for (const t of e.changedTouches) {
    if (t.identifier === touch.joyId) { touch.joyId = null; restJoystick(); }
    if (t.identifier === touch.lookId) touch.lookId = null;
    if (t.identifier === touch.jumpId) { touch.jumpId = null; touch.jumpHeld = false; jumpBtn.classList.remove('down'); }
  }
}
touchUI.addEventListener('touchend', endTouches);
touchUI.addEventListener('touchcancel', endTouches);

function resetTouchControls() {
  touch.joyId = touch.lookId = touch.jumpId = null;
  touch.jumpHeld = false;
  jumpBtn.classList.remove('down');
  restJoystick();
}

function readInput() {
  let fx = 0, fz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) fz += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) fz -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) fx += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) fx -= 1;
  // Q/E rotate the camera for players without a mouse
  if (keys.has('KeyQ')) cam.yaw += 0.03;
  if (keys.has('KeyE')) cam.yaw -= 0.03;
  // Touch joystick (analog: push further = move faster; small dead zone)
  const joyLen = Math.hypot(touch.joyX, touch.joyY);
  if (joyLen > 0.15) { fx += touch.joyX; fz -= touch.joyY; }
  const len = Math.hypot(fx, fz);
  if (len > 1) { fx /= len; fz /= len; }
  const sin = Math.sin(cam.yaw), cos = Math.cos(cam.yaw);
  // forward = (-sin, -cos), right = (cos, -sin)
  const x = fx * cos - fz * sin;
  const z = -fx * sin - fz * cos;
  const input = { x, z, jumpPressed: jumpQueued, jumpHeld: keys.has('Space') || touch.jumpHeld };
  return input;
}

// ---------- Game state ----------
const sound = new Sound();
sound.setVolumes(save.settings.music / 100, save.settings.sfx / 100);

let state = 'menu'; // menu | playing | paused | won
let world = null;
let player = new Player();
let levelIndex = 0;
let runTime = 0;
let deaths = 0;
let spawnPoint = new THREE.Vector3();
let spawnFacing = Math.PI;
let spawnYaw = 0;
let checkpointsHit = 0;
let pausedAt = 0;
let settingsReturn = 'title';
let boardReturn = 'title';
let boardLevel = 0;
let lastRunDate = null;
let levelsTab = 1;
let menuAngle = 0;

const $ = (id) => document.getElementById(id);
const screens = ['title', 'levels', 'settings', 'pause', 'win', 'avatar', 'board'];
function show(name) {
  for (const s of screens) $('screen-' + s).classList.toggle('hidden', s !== name);
}

function yawForDir(dir) {
  // camera sits behind the player, looking along dir
  return Math.atan2(-dir[0], -dir[1]);
}

function loadLevel(i, forMenu = false) {
  if (world) world.dispose();
  levelIndex = i;
  applyTheme(LEVELS[i].world);
  world = new World(i);
  const sp = world.spawnPart;
  spawnPoint.set(sp.center.x, sp.box.max.y, sp.center.z);
  const dir = sp.dir || [0, -1];
  spawnYaw = yawForDir(dir);
  spawnFacing = Math.atan2(dir[0], dir[1]);
  player.spawnAt(spawnPoint, spawnFacing);
  cam.yaw = spawnYaw;
  cam.pitch = CAM_PITCH;
  cam.curDist = cam.dist;
  cam.target.copy(spawnPoint);
  runTime = 0;
  deaths = 0;
  checkpointsHit = 0;
  if (!forMenu) {
    $('hud-level').textContent = `Level ${i + 1}: ${LEVELS[i].name}`;
    updateHud();
  }
}

function startLevel(i) {
  sound.init();
  sound.startMusic();
  loadLevel(i);
  state = 'playing';
  show(null);
  $('hud').classList.remove('hidden');
  $('hud-hint').style.opacity = 1;
  setTimeout(() => { $('hud-hint').style.opacity = 0.35; }, 6000);
  jumpQueued = false;
  resetTouchControls();
  if (document.body.classList.contains('touch')) {
    // Phones: go fullscreen to hide the browser bars (not supported on iPhone — that's fine)
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    lockPointer();
  }
}

function die() {
  if (player.dead) return;
  deaths++;
  player.explode();
  player.deadTimer = 1.0;
  sound.die();
  const f = $('flash');
  f.style.transition = 'none';
  f.style.opacity = 0.45;
  requestAnimationFrame(() => { f.style.transition = 'opacity 0.5s'; f.style.opacity = 0; });
  updateHud();
}

function respawn() {
  world.resetHazards();
  player.spawnAt(spawnPoint);
  sound.respawn();
}

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.remove('hidden');
  t.style.animation = 'none';
  void t.offsetHeight;
  t.style.animation = '';
}

function updateHud() {
  $('hud-deaths').textContent = `💀 ${deaths}`;
  $('hud-check').textContent = `Checkpoint ${checkpointsHit}/${world.checkpoints.length}`;
}

function fmtTime(t) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

function checkTriggers() {
  const p = player;
  p.updateBox();

  // lava sea / falling too far
  if (p.pos.y < LAVA_Y + 0.3 || p.pos.y < spawnPoint.y - 30) return die();

  // lava blocks (slightly forgiving hitbox)
  const shrink = 0.12;
  for (const part of world.parts) {
    if (!part.kill) continue;
    const b = part.box;
    if (p.box.min.x < b.max.x - shrink && p.box.max.x > b.min.x + shrink &&
        p.box.min.y < b.max.y - shrink && p.box.max.y > b.min.y + shrink &&
        p.box.min.z < b.max.z - shrink && p.box.max.z > b.min.z + shrink) return die();
  }

  // spinners
  for (const s of world.spinners) {
    if (p.pos.y > s.y + 0.15 || p.pos.y + PLAYER_H < s.y - 0.2) continue;
    const cx = s.group.position.x, cz = s.group.position.z;
    for (let k = 0; k < s.arms; k++) {
      const ang = s.group.rotation.y + (k * Math.PI) / s.arms;
      const dx = Math.cos(ang), dz = -Math.sin(ang);
      const rx = p.pos.x - cx, rz = p.pos.z - cz;
      const t = THREE.MathUtils.clamp(rx * dx + rz * dz, -s.len / 2, s.len / 2);
      const dist = Math.hypot(rx - dx * t, rz - dz * t);
      if (dist < PLAYER_R + 0.12) return die();
    }
  }

  const g = p.ground;
  if (!g) return;
  if (g.type === 'vanish') world.triggerVanish(g);
  if (g.fall) world.triggerFall(g);
  if (g.type === 'check' && !g.activated) {
    g.activated = true;
    g.flagMat.color.set(0x3ddc84);
    g.ring.material.color.set(0x3ddc84);
    checkpointsHit = world.checkpoints.filter((c) => c.activated).length;
    spawnPoint.set(g.center.x, g.box.max.y, g.center.z);
    sound.checkpoint();
    toast('Checkpoint!');
    burst(new THREE.Vector3(g.center.x, g.box.max.y + 1, g.center.z), 30, { speed: 6, up: 8 });
    updateHud();
  }
  if (g.type === 'finish') winLevel(g);
}

function winLevel(g) {
  state = 'won';
  document.exitPointerLock?.();
  sound.win();
  burst(new THREE.Vector3(g.center.x, g.box.max.y + 3, g.center.z), 160, { speed: 12, up: 16, life: 4, drag: 1.2 });

  const key = String(levelIndex);
  const prev = save.best[key];
  const record = prev === undefined || runTime < prev;
  if (record) save.best[key] = runTime;
  save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, levelIndex + 2));

  // Leaderboard: keep the top runs for this level
  const run = { t: runTime, d: deaths, date: Date.now() };
  const runs = (save.runs[key] = save.runs[key] || []);
  runs.push(run);
  runs.sort((a, b) => a.t - b.t);
  runs.length = Math.min(runs.length, LEADERBOARD_SIZE);
  const rank = runs.indexOf(run) + 1; // 0 if it didn't make the board
  lastRunDate = run.date;
  writeSave();
  $('win-rank').textContent = rank ? `#${rank} on the leaderboard` : `Not in the top ${LEADERBOARD_SIZE} this time`;

  const last = levelIndex === LEVELS.length - 1;
  $('win-title').textContent = last ? '🏆 You beat Sky Climb! 🏆' : 'Level Complete!';
  $('win-time').textContent = fmtTime(runTime);
  $('win-best').textContent = fmtTime(save.best[key]);
  $('win-deaths').textContent = deaths;
  $('win-record').classList.toggle('hidden', !(record && prev !== undefined));
  $('btn-next').classList.toggle('hidden', last);
  setTimeout(() => { if (state === 'won') show('win'); }, 1200);
}

function pause() {
  if (state !== 'playing') return;
  resetTouchControls();
  state = 'paused';
  pausedAt = performance.now();
  show('pause');
}

function resume() {
  if (state !== 'paused') return;
  state = 'playing';
  show(null);
  jumpQueued = false;
  lockPointer();
}

function goToMenu() {
  state = 'menu';
  document.exitPointerLock?.();
  $('hud').classList.add('hidden');
  loadLevel(Math.min(save.unlocked, LEVELS.length) - 1, true);
  show('title');
}

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas && state === 'playing') pause();
});

function onKey(e) {
  if (e.code === 'F11') {
    e.preventDefault();
    toggleFullscreen();
    return;
  }
  if (e.code === 'Escape') {
    if (state === 'playing') pause();
    else if (state === 'paused' && performance.now() - pausedAt > 300 && !$('screen-pause').classList.contains('hidden')) resume();
    return;
  }
  if (state === 'playing' && e.code === 'KeyR' && !player.dead) respawn();
}

function toggleFullscreen() {
  if (window.desktop) window.desktop.toggleFullscreen();
  else if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
}

// ---------- Menus ----------
const WORLD_START = { 1: 0, 2: LEVELS.findIndex((l) => l.world === 2) };

function buildLevelGrid(tab) {
  if (tab) levelsTab = tab;
  // World tabs: World 2 unlocks after beating level 10
  for (const t of document.querySelectorAll('#world-tabs .tab')) {
    const w = +t.dataset.world;
    t.classList.toggle('active', w === levelsTab);
    t.disabled = save.unlocked <= WORLD_START[w];
    t.textContent = t.textContent.replace(/^🔒 /, '');
    if (t.disabled) t.textContent = '🔒 ' + t.textContent;
  }
  const grid = $('level-grid');
  grid.innerHTML = '';
  const diffColors = { Easy: '#3ddc84', Medium: '#4f8cff', Hard: '#ff9f43', 'Very Hard': '#ff5d5d', Extreme: '#8e3cff', Insane: '#d6246e' };
  LEVELS.forEach((lvl, i) => {
    if (lvl.world !== levelsTab) return;
    const btn = document.createElement('button');
    btn.className = 'level-card';
    btn.style.background = diffColors[lvl.diff];
    const locked = i + 1 > save.unlocked;
    btn.disabled = locked;
    const best = save.best[String(i)];
    btn.innerHTML = `<div class="num">${locked ? '🔒' : i + 1}</div>
      <div class="name">${lvl.name}</div>
      <div class="diff">${lvl.diff}</div>
      <div class="best">${best !== undefined ? '⏱ ' + fmtTime(best) : '&nbsp;'}</div>`;
    btn.addEventListener('click', () => { sound.click(); startLevel(i); });
    grid.appendChild(btn);
  });
}
for (const t of document.querySelectorAll('#world-tabs .tab')) {
  t.addEventListener('click', () => { sound.click(); buildLevelGrid(+t.dataset.world); });
}

// ---------- Avatar screen ----------
const AVATAR_OPTIONS = [
  { key: 'skin', label: 'Skin', colors: [0xffe0c4, 0xf2c29b, 0xd9a066, 0xb87a4b, 0x8d5a3b, 0x5c3a24, 0xffd23f] },
  { key: 'hair', label: 'Hair', colors: [0x1a1a1a, 0x5a3825, 0x8b5a2b, 0xe8c170, 0xd9531e, 0xf2f2f2, 0xff5fa2, 0x4f8cff, 0x3ddc84] },
  { key: 'shirt', label: 'Shirt', colors: [0xe8453c, 0x4f8cff, 0x3ddc84, 0xffd23f, 0xb06cff, 0xff7eb6, 0xff9f43, 0x2ec4b6, 0x222222, 0xffffff] },
  { key: 'pants', label: 'Pants', colors: [0x2b4c7e, 0x222222, 0x6b4f3a, 0x7a7a7a, 0xc8b38a, 0x1f7a4a, 0x8e3cff, 0xe8453c] },
  { key: 'shoes', label: 'Shoes', colors: [0x2a2a2a, 0xffffff, 0xe8453c, 0x4f8cff, 0x8b5a2b, 0xffd23f, 0x3ddc84] },
];
const HAIR_STYLES = [['short', 'Short'], ['spiky', 'Spiky'], ['long', 'Long'], ['buzz', 'Buzz'], ['cap', 'Cap'], ['bald', 'Bald']];
const hex = (c) => '#' + c.toString(16).padStart(6, '0');

function buildAvatarUI() {
  const box = $('avatar-options');
  box.innerHTML = '';
  const av = save.avatar;
  const styleRow = document.createElement('div');
  styleRow.className = 'av-row';
  styleRow.innerHTML = '<div class="av-label">Hair style</div>';
  const styles = document.createElement('div');
  styles.className = 'swatches';
  for (const [id, name] of HAIR_STYLES) {
    const b = document.createElement('button');
    b.className = 'style-btn' + (av.hairStyle === id ? ' selected' : '');
    b.textContent = name;
    b.addEventListener('click', () => setAvatar('hairStyle', id));
    styles.appendChild(b);
  }
  styleRow.appendChild(styles);
  box.appendChild(styleRow);

  for (const opt of AVATAR_OPTIONS) {
    const row = document.createElement('div');
    row.className = 'av-row';
    row.innerHTML = `<div class="av-label">${opt.label}</div>`;
    const sw = document.createElement('div');
    sw.className = 'swatches';
    for (const c of opt.colors) {
      const b = document.createElement('button');
      b.className = 'swatch' + (av[opt.key] === c ? ' selected' : '');
      b.style.background = hex(c);
      b.title = hex(c);
      b.addEventListener('click', () => setAvatar(opt.key, c));
      sw.appendChild(b);
    }
    row.appendChild(sw);
    box.appendChild(row);
  }
}

function setAvatar(key, value) {
  save.avatar[key] = value;
  player.applyAvatar(save.avatar);
  writeSave();
  sound.click();
  buildAvatarUI();
}

function openAvatar() {
  state = 'avatar';
  player.spawnAt(spawnPoint, 0); // face the camera
  buildAvatarUI();
  show('avatar');
}

// ---------- Leaderboard screen ----------
function fmtDate(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function openBoard(level, returnTo) {
  boardLevel = level;
  boardReturn = returnTo;
  renderBoard();
  show('board');
}

function renderBoard() {
  // Only levels you've unlocked can be browsed
  const maxLevel = Math.min(save.unlocked, LEVELS.length) - 1;
  boardLevel = THREE.MathUtils.clamp(boardLevel, 0, maxLevel);
  const lvl = LEVELS[boardLevel];
  $('board-level').textContent = `Level ${boardLevel + 1}: ${lvl.name}`;
  const runs = save.runs[String(boardLevel)] || [];
  const body = $('board-table').querySelector('tbody');
  if (!runs.length) {
    body.innerHTML = `<tr><td colspan="4" class="empty">No runs yet — finish this level to get on the board!</td></tr>`;
  } else {
    body.innerHTML = runs.map((r, i) => {
      const cls = [['gold', 'silver', 'bronze'][i] || '', r.date && r.date === lastRunDate ? 'latest' : ''].join(' ');
      const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}`;
      return `<tr class="${cls}"><td>${medal}</td><td>${fmtTime(r.t)}</td><td>${r.d ?? '—'}</td><td>${fmtDate(r.date)}</td></tr>`;
    }).join('');
  }
  // Total of best times across every level you've finished
  const done = LEVELS.map((_, i) => save.best[String(i)]).filter((t) => t !== undefined);
  const total = done.reduce((a, b) => a + b, 0);
  $('board-total').textContent = done.length
    ? `Total speedrun time: ${fmtTime(total)} (${done.length}/${LEVELS.length} levels finished)`
    : 'Finish levels to build your total speedrun time';
}

function syncSettingsUI() {
  $('set-music').value = save.settings.music;
  $('set-sfx').value = save.settings.sfx;
  $('set-sens').value = save.settings.sens;
  $('set-shadows').checked = save.settings.shadows;
}
$('set-music').addEventListener('input', (e) => {
  save.settings.music = +e.target.value;
  sound.setVolumes(save.settings.music / 100, save.settings.sfx / 100);
  writeSave();
});
$('set-sfx').addEventListener('input', (e) => {
  save.settings.sfx = +e.target.value;
  sound.setVolumes(save.settings.music / 100, save.settings.sfx / 100);
  writeSave();
});
$('set-sfx').addEventListener('change', () => sound.jump());
$('set-sens').addEventListener('input', (e) => { save.settings.sens = +e.target.value; writeSave(); });
$('set-shadows').addEventListener('change', (e) => {
  save.settings.shadows = e.target.checked;
  renderer.shadowMap.enabled = e.target.checked;
  scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  writeSave();
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  sound.init();
  sound.startMusic();
  sound.click();
  switch (btn.dataset.action) {
    case 'play': startLevel(Math.min(save.unlocked, LEVELS.length) - 1); break;
    case 'levels': {
      // open on the world you're currently in (or the furthest one you've reached)
      const ref = state === 'menu' ? Math.min(save.unlocked, LEVELS.length) - 1 : levelIndex;
      buildLevelGrid(LEVELS[ref].world);
      show('levels');
      break;
    }
    case 'avatar': openAvatar(); break;
    case 'avatar-reset': save.avatar = { ...DEFAULT_AVATAR }; setAvatar('hairStyle', DEFAULT_AVATAR.hairStyle); break;
    case 'avatar-done': state = 'menu'; show('title'); break;
    case 'board': openBoard(Math.min(save.unlocked, LEVELS.length) - 1, 'title'); break;
    case 'board-win': openBoard(levelIndex, 'win'); break;
    case 'board-prev': boardLevel--; renderBoard(); break;
    case 'board-next': boardLevel++; renderBoard(); break;
    case 'board-back': show(boardReturn); break;
    case 'back-title':
      if (state === 'paused' || state === 'won') goToMenu(); else show('title');
      break;
    case 'settings': settingsReturn = 'title'; syncSettingsUI(); show('settings'); break;
    case 'settings-pause': settingsReturn = 'pause'; syncSettingsUI(); show('settings'); break;
    case 'back-settings': show(settingsReturn); break;
    case 'fullscreen': toggleFullscreen(); break;
    case 'reset':
      if (confirm('Reset all progress, best times and leaderboards?')) {
        save.unlocked = 1;
        save.best = {};
        save.runs = {};
        writeSave();
        goToMenu();
      }
      break;
    case 'quit': if (window.desktop) window.desktop.quit(); else window.close(); break;
    case 'resume': resume(); break;
    case 'restart': startLevel(levelIndex); break;
    case 'next': startLevel(Math.min(levelIndex + 1, LEVELS.length - 1)); break;
    case 'menu': goToMenu(); break;
  }
});

// ---------- Main loop ----------
let last = performance.now();
let acc = 0;
let elapsed = 0;

function frame(now) {
  requestAnimationFrame(frame);
  update(now);
}

function update(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  elapsed += dt;

  lavaSeaTex.offset.x = elapsed * 0.01;
  lavaSeaTex.offset.y = elapsed * 0.015;


  if (state === 'playing' || state === 'menu' || state === 'won' || state === 'avatar') {
    acc += dt;
    while (acc >= STEP) {
      world.update(STEP);
      if (state === 'menu' || state === 'avatar') {
        player.step(STEP, world, { x: 0, z: 0, jumpPressed: false, jumpHeld: false });
      } else if (state === 'playing') {
        if (!player.dead) {
          const input = readInput();
          jumpQueued = false;
          player.step(STEP, world, input);
          checkTriggers();
        } else {
          player.deadTimer -= STEP;
          if (player.deadTimer <= 0) respawn();
        }
      }
      acc -= STEP;
    }
    if (state === 'playing') {
      runTime += dt;
      $('hud-timer').textContent = fmtTime(runTime);
    }
  }

  updateParticles(dt);
  edgeTurn(dt);
  // No mouse cursor during gameplay — only the crosshair (menus bring it back)
  document.body.classList.toggle('playing', state === 'playing');
  world.animate(dt, elapsed);
  player.faceYaw = state === 'playing' ? cam.yaw + Math.PI : null;
  player.animate(dt, elapsed);

  // Camera
  if (state === 'avatar') {
    // Close-up: character on the right half of the screen, slowly turning
    player.facing += dt * 0.7;
    const p = player.pos;
    if (window.innerWidth < 700 && window.innerHeight > window.innerWidth) {
      // Phone held upright: options panel is along the bottom, so put the character up top
      camera.position.set(p.x, p.y + 1.2, p.z + 6.5);
      camera.lookAt(p.x, p.y - 0.6, p.z);
    } else {
      camera.position.set(p.x - 1.2, p.y + 1.9, p.z + 5.2);
      camera.lookAt(p.x - 1.6, p.y + 1.15, p.z);
    }
  } else if (state === 'menu') {
    menuAngle += dt * 0.08;
    const c = world.bounds.getCenter(new THREE.Vector3());
    const size = world.bounds.getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.z) * 0.45 + 22;
    camera.position.set(c.x + Math.sin(menuAngle) * r, c.y + 18, c.z + Math.cos(menuAngle) * r);
    camera.lookAt(c.x, c.y + 2, c.z);
  } else {
    updateShoulderCamera(dt);
  }

  // Keep the sun's shadow box centered on the action
  const focusPt = state === 'menu' ? spawnPoint : player.pos;
  sun.position.set(focusPt.x + 25, focusPt.y + 45, focusPt.z + 18);
  sun.target.position.copy(focusPt);
  scene.userData.sky.position.copy(camera.position);

  renderer.render(scene, camera);
}

// On a website, pages can't close their own tab, so hide Quit there
if (location.protocol.startsWith('http') && !location.hostname.match(/^(localhost|127\.0\.0\.1)$/)) {
  document.querySelector('[data-action=quit]').classList.add('hidden');
}

// Boot into the main menu
goToMenu();
requestAnimationFrame(frame);

// Test hook (only with ?debug in the URL): lets automated tests step the game
if (location.search.includes('debug')) {
  window.__sky = {
    tick(frames = 1) { for (let i = 0; i < frames; i++) update(last + 1000 / 60); },
    press(code) { keys.add(code); if (code === 'Space') jumpQueued = true; },
    release(code) { keys.delete(code); },
    startLevel,
    cam,
    player,
    teleport(x, y, z) { player.spawnAt(new THREE.Vector3(x, y, z)); },
    get info() {
      return { state, level: levelIndex, pos: player.pos.toArray().map((v) => +v.toFixed(2)), onGround: player.onGround,
        ground: player.ground?.type, dead: player.dead, deaths, checkpointsHit, time: +runTime.toFixed(2) };
    },
    get parts() { return world.parts.map((p) => ({ type: p.type, center: p.center.toArray(), top: p.box.max.y })); },
  };
}
