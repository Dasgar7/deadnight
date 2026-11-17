import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ZDEFS, type ZDef, type ZType } from "./config";

export interface ZombieRig {
  root: THREE.Group;
  body: THREE.Group; // pivot at hips
  spine: THREE.Group;
  neck: THREE.Group;
  head: THREE.Object3D;
  jaw: THREE.Group;
  armL: THREE.Group; // shoulder joints
  armR: THREE.Group;
  elL: THREE.Group;
  elR: THREE.Group;
  legL: THREE.Group; // hip joints
  legR: THREE.Group;
  knL: THREE.Group;
  knR: THREE.Group;
  torso: THREE.Object3D;
  rags: THREE.Group;
  pulse: THREE.Object3D | null;
  extra: { sh: THREE.Group; el: THREE.Group }[];
  gait: number; // 0 shamble, 1 limp, 2 hunched lurch
  style: number; // death style
  armBig: number; // 1 = normal; brute's oversized arm
}

export interface Zombie {
  id: number;
  type: ZType;
  def: ZDef;
  rig: ZombieRig;
  x: number;
  z: number;
  y: number;
  vx: number;
  vz: number;
  yaw: number;
  hp: number;
  maxHp: number;
  speed: number;
  dmg: number;
  dead: boolean;
  deadT: number;
  attackT: number; // windup timer
  cooldown: number;
  phase: number;
  groanT: number;
  burn: number;
  burnTick: number;
  stagger: number;
  side: number;
  stuckT: number;
  avoid: number;
  special: number; // boss/spitter timer
  charging: number;
  hitFlash: number;
  fallDir: number;
}

// ───────────────────────── geometry baking ─────────────────────────
// Every bone is ONE merged, vertex-coloured mesh sharing ONE material, so a zombie is ~16 draw calls
// and the parts are cached per (type, variant) — spawning a horde costs almost nothing.

type V3 = [number, number, number];
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

function add(list: THREE.BufferGeometry[], g: THREE.BufferGeometry, col: number | THREE.Color | [number, number, number], p: V3 = [0, 0, 0], r: V3 = [0, 0, 0], s: V3 = [1, 1, 1], mottle = 0.14) {
  _m.compose(_p.set(...p), _q.setFromEuler(_e.set(r[0], r[1], r[2])), _s.set(...s));
  g.applyMatrix4(_m);
  if (Array.isArray(col)) _c.setRGB(col[0], col[1], col[2]);
  else _c.set(col as number);
  const pos = g.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = Math.sin(x * 37.1 + y * 19.7 + z * 27.3) * Math.sin(x * 11.3 - y * 31.9 + z * 17.1);
    const k = 1 + n * mottle - Math.max(0, -y) * 0.05;
    colors[i * 3] = _c.r * k;
    colors[i * 3 + 1] = _c.g * k;
    colors[i * 3 + 2] = _c.b * k;
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  list.push(g);
}
const merge = (l: THREE.BufferGeometry[]) => (l.length ? mergeGeometries(l, false)! : new THREE.BufferGeometry());
const sph = (r: number, w = 9, h = 7) => new THREE.SphereGeometry(r, w, h);
const cyl = (rt: number, rb: number, len: number, seg = 8) => new THREE.CylinderGeometry(rt, rb, len, seg, 1);
const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);
const cone = (r: number, h: number, seg = 6) => new THREE.ConeGeometry(r, h, seg);
const cap = (r: number, l: number) => new THREE.CapsuleGeometry(r, l, 3, 8);

let sharedMat: THREE.MeshStandardMaterial | null = null;
let glowMat: THREE.MeshBasicMaterial | null = null;
function grimeTex() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#e6e6e6";
  g.fillRect(0, 0, 128, 128);
  let s = 77;
  const R = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 90; i++) {
    const x = R() * 128, y = R() * 128, r = 3 + R() * 16;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = R() < 0.7;
    gr.addColorStop(0, dark ? "rgba(40,30,25,0.30)" : "rgba(255,255,255,0.22)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 700; i++) {
    g.fillStyle = `rgba(${R() < 0.5 ? 0 : 255},${R() < 0.5 ? 0 : 255},${R() < 0.5 ? 0 : 255},0.05)`;
    g.fillRect(R() * 128, R() * 128, 1 + R() * 2, 1 + R() * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function getMats() {
  if (!sharedMat) {
    sharedMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: grimeTex(), roughness: 0.86, metalness: 0.02 });
    glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  }
  return { mat: sharedMat, glow: glowMat! };
}

const SKIN: V3[] = [[0.6, 0.66, 0.55], [0.72, 0.58, 0.5], [0.5, 0.56, 0.62]];
const SHIRT: V3[] = [[0.42, 0.16, 0.13], [0.34, 0.36, 0.4], [0.17, 0.28, 0.4]];
const PANTS: V3[] = [[0.17, 0.22, 0.32], [0.3, 0.26, 0.19], [0.1, 0.1, 0.11]];
const HAIR: V3[] = [[0.12, 0.09, 0.07], [0.5, 0.4, 0.2], [0.3, 0.3, 0.3]];
const EYE: V3[] = [[1.0, 0.92, 0.45], [1.0, 0.18, 0.1], [0.75, 0.95, 1.0]];
const BLOOD: V3 = [0.3, 0.035, 0.03];
const mul = (a: V3, b: V3 | number[], k = 1): V3 => [Math.min(1.6, a[0] * b[0] * k), Math.min(1.6, a[1] * b[1] * k), Math.min(1.6, a[2] * b[2] * k)];

interface Parts {
  torso: THREE.BufferGeometry;
  torsoGlow: THREE.BufferGeometry;
  head: THREE.BufferGeometry;
  headGlow: THREE.BufferGeometry;
  jaw: THREE.BufferGeometry;
  upper: THREE.BufferGeometry[];
  fore: THREE.BufferGeometry[];
  thigh: THREE.BufferGeometry[];
  shin: THREE.BufferGeometry[];
  rags: THREE.BufferGeometry;
  belly: THREE.BufferGeometry | null;
  bellyGlow: THREE.BufferGeometry | null;
  sac: THREE.BufferGeometry | null;
  extraArm: THREE.BufferGeometry | null;
  extraFore: THREE.BufferGeometry | null;
}
const partCache = new Map<string, Parts>();

function buildParts(type: ZType, variant: number): Parts {
  const key = `${type}-${variant}`;
  const hit = partCache.get(key);
  if (hit) return hit;
  const def = ZDEFS[type];
  const v = variant % 3;
  const isRun = type === "runner";
  const isBrute = type === "brute";
  const isBloat = type === "bloater";
  const isBoss = type === "boss";
  const isSpit = type === "spitter";
  const W = isRun ? 0.82 : isBloat ? 1.15 : isBrute ? 1.25 : isBoss ? 1.2 : 1; // body width
  const L = isRun ? 0.82 : isBrute ? 1.2 : isBoss ? 1.1 : 1; // limb thickness

  const skin = mul(SKIN[v], def.tint, 0.72);
  const skinDark = mul(skin, [0.7, 0.62, 0.62]);
  const shirt = mul(SHIRT[v], def.shirt, 0.85);
  const pants = mul(PANTS[v], [1, 1, 1]);
  const hair = HAIR[v];
  const eye = isBoss ? ([1, 0.25, 0.05] as V3) : isSpit ? ([0.5, 1, 0.3] as V3) : EYE[(v + (isRun ? 1 : 0)) % 3];
  const sleeveless = isRun || v === 1 || isBloat || isBoss || isBrute;
  const rnd = (() => {
    let s = (v + 1) * 7919 + type.length * 131;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  })();

  // ── torso (spine-local; spine pivot sits at the hips) ──
  const T: THREE.BufferGeometry[] = [];
  const TG: THREE.BufferGeometry[] = [];
  add(T, sph(0.15, 10, 7), pants, [0, 0.02, 0], [0, 0, 0], [1.2 * W, 0.75, 0.85]);
  add(T, cyl(0.2 * W, 0.15 * W, 0.34, 10), shirt, [0, 0.2, 0], [0, 0, 0], [1, 1, 0.72]);
  add(T, cyl(0.235 * W, 0.2 * W, 0.3, 10), shirt, [0, 0.46, 0], [0, 0, 0], [1, 1, 0.74]);
  add(T, sph(0.235 * W, 10, 7), shirt, [0, 0.6, 0], [0, 0, 0], [1.05, 0.45, 0.72]);
  add(T, cyl(0.052, 0.06, 0.16, 7), skin, [0, 0.72, 0]); // neck
  // torn shirt: belly skin shows through, ragged hem
  if (!isBloat && !isBoss) {
    add(T, sph(0.11 * W, 8, 6), skin, [0.04 * W, 0.16, 0.1 * W], [0, 0, 0], [1.1, 1.1, 0.45]);
    add(T, sph(0.06, 6, 5), BLOOD, [0.05, 0.17, 0.14 * W], [0, 0, 0], [1, 1.2, 0.3]);
  }
  // blood stains / wounds
  const nb = 2 + Math.floor(rnd() * 3);
  for (let i = 0; i < nb; i++) {
    const a = rnd() * Math.PI * 2;
    const y = 0.15 + rnd() * 0.5;
    const rr = 0.17 * W;
    add(T, sph(0.03 + rnd() * 0.05, 6, 5), BLOOD, [Math.sin(a) * rr, y, Math.cos(a) * rr * 0.72], [0, 0, 0], [1, 1, 0.3]);
  }
  // collar bones / torn collar
  add(T, new THREE.TorusGeometry(0.075, 0.018, 5, 10), shirt, [0, 0.7, 0.01], [Math.PI / 2, 0, 0]);
  if (sleeveless) {
    // exposed shoulders + visible ribs on the thin ones
    for (const sx of [-1, 1]) add(T, sph(0.075 * L, 7, 6), skin, [sx * 0.25 * W, 0.6, 0]);
  }
  if (isRun) {
    for (let i = 0; i < 5; i++) add(T, sph(0.018, 5, 4), skinDark, [0, 0.12 + i * 0.1, -0.15], [0, 0, 0], [1.2, 0.9, 0.9]); // spine bumps
    for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) add(T, cap(0.012, 0.12), skinDark, [sx * 0.09, 0.32 + i * 0.07, 0.13], [0, 0, sx * 1.2]);
  }
  if (isBrute) {
    // scrap-metal armour strapped on
    const metal: V3 = [0.32, 0.3, 0.28];
    const rust: V3 = [0.42, 0.24, 0.12];
    add(T, sph(0.19, 9, 6, ), metal, [-0.3 * W, 0.66, 0], [0, 0, 0], [1.2, 0.7, 1.1]);
    add(T, box(0.34, 0.3, 0.06), rust, [0.02, 0.42, 0.13], [0, 0, 0.06]);
    add(T, box(0.2, 0.06, 0.05), metal, [0.02, 0.22, 0.14], [0, 0, -0.1]);
    for (let i = 0; i < 3; i++) add(T, cone(0.025, 0.14, 5), [0.55, 0.52, 0.45], [-0.34 + i * 0.1, 0.8, -0.04], [0, 0, 0.3 - i * 0.3]);
    add(T, cyl(0.015, 0.015, 0.5, 4), [0.6, 0.5, 0.3], [0.05, 0.4, 0.15], [0, 0, 0.9]); // strap
  }
  if (isBoss) {
    const bone: V3 = [0.75, 0.7, 0.58];
    for (let i = 0; i < 7; i++) add(T, cone(0.04 + (6 - i) * 0.004, 0.22 + (3 - Math.abs(3 - i)) * 0.06, 5), bone, [0, 0.12 + i * 0.09, -0.19 - (3 - Math.abs(3 - i)) * 0.01], [-1.0, 0, 0]);
    for (const sx of [-1, 1]) {
      add(T, cone(0.05, 0.4, 6), bone, [sx * 0.34, 0.78, -0.02], [0.2, 0, -sx * 0.9]);
      add(T, cone(0.035, 0.26, 6), bone, [sx * 0.38, 0.62, 0.02], [0.3, 0, -sx * 1.3]);
    }
    // ribcage showing through torn flesh
    for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) add(T, cap(0.014, 0.17), [0.8, 0.75, 0.62], [sx * 0.1, 0.28 + i * 0.08, 0.17], [0, 0, sx * 1.15]);
    add(T, sph(0.12, 7, 6), BLOOD, [0, 0.38, 0.16], [0, 0, 0], [1.3, 1.6, 0.4]);
    for (let i = 0; i < 5; i++) {
      const a = (i - 2) * 0.5;
      add(TG, box(0.012, 0.1 + rnd() * 0.12, 0.012), [1, 0.45, 0.08], [Math.sin(a) * 0.22, 0.32 + rnd() * 0.25, 0.18], [0, 0, rnd() * 1.2 - 0.6]);
    }
  }
  if (isSpit) {
    for (let i = 0; i < 4; i++) add(TG, sph(0.02, 5, 4), [0.5, 1, 0.2], [(rnd() - 0.5) * 0.3, 0.3 + rnd() * 0.3, 0.13 * W]);
    add(T, sph(0.05, 6, 5), [0.35, 0.5, 0.2], [0.12, 0.45, 0.14], [0, 0, 0], [1, 1, 0.5]);
  }

  // ── head (neck-local; neck pivot at y=0.78 in the spine) ──
  const H: THREE.BufferGeometry[] = [];
  const HG: THREE.BufferGeometry[] = [];
  const hs = isBloat ? 0.88 : isBoss ? 1.05 : 1;
  add(H, sph(0.122 * hs, 14, 11), skin, [0, 0.07, 0], [0, 0, 0], [0.9, 1.13, 1.0]);
  add(H, sph(0.04, 7, 6), skin, [0.075, 0.03, -0.075], [0, 0, 0], [1, 1.1, 0.8]); // cheekbones
  add(H, sph(0.04, 7, 6), skin, [-0.075, 0.03, -0.075], [0, 0, 0], [1, 1.1, 0.8]);
  add(H, sph(0.034, 7, 6), [0.06, 0.02, 0.02], [0.046, 0.09, -0.098], [0, 0, 0], [1.15, 1, 0.8]); // sunken sockets
  add(H, sph(0.034, 7, 6), [0.06, 0.02, 0.02], [-0.046, 0.09, -0.098], [0, 0, 0], [1.15, 1, 0.8]);
  add(H, sph(0.02, 6, 5), [0.2, 0.04, 0.04], [0, 0.04, -0.118], [0, 0, 0], [1, 1.3, 0.8]); // nose, mostly gone
  for (const sx of [-1, 1]) add(H, sph(0.028, 6, 5), skinDark, [sx * 0.112 * hs, 0.06, 0.01], [0, 0, 0], [0.4, 1, 0.8]); // ears
  // upper teeth
  for (let i = -3; i <= 3; i++) add(H, box(0.014, 0.02 + (i % 2 ? 0.006 : 0), 0.01), [0.82, 0.78, 0.6], [i * 0.0145, -0.03, -0.1 + Math.abs(i) * 0.0022], [0, 0, 0], [1, 1, 1], 0.05);
  add(H, sph(0.022, 6, 5), BLOOD, [0.05, 0.14, -0.08], [0, 0, 0], [1.6, 1.1, 0.5]); // head wound
  // hair variants
  if (!isBrute && !isBloat) {
    if (v === 0) {
      add(H, sph(0.125 * hs, 10, 7, ), hair, [0, 0.09, 0.03], [0, 0, 0], [0.93, 1.0, 0.95], 0.3); // thinning clump
      H[H.length - 1] = H[H.length - 1]; // keep order
    } else if (v === 1) {
      for (let i = 0; i < 8; i++) add(H, cap(0.014, 0.17 + rnd() * 0.08), hair, [Math.sin(i * 0.8 - 1.6) * 0.1, 0.07 - rnd() * 0.05, 0.08 + rnd() * 0.03], [0.1, 0, Math.sin(i * 0.8 - 1.6) * 0.3], [1, 1, 1], 0.4); // stringy long hair
      add(H, sph(0.12 * hs, 9, 6, ), hair, [0, 0.12, 0.035], [0, 0, 0], [0.92, 0.7, 0.9], 0.3);
    } else {
      for (let i = 0; i < 3; i++) add(H, sph(0.045, 6, 5), hair, [(i - 1) * 0.07, 0.17, 0.02], [0, 0, 0], [1, 0.6, 1], 0.3);
    }
  }
  if (isBrute) {
    for (let i = 0; i < 3; i++) add(H, cone(0.015, 0.07, 5), [0.75, 0.7, 0.58], [(i - 1) * 0.05, 0.19, 0], [0, 0, (i - 1) * 0.35]); // bone spurs
    add(H, box(0.22, 0.01, 0.01), [0.35, 0.05, 0.05], [0, 0.14, -0.12], [0, 0, 0.1]); // scar
  }
  if (isBoss) {
    for (const sx of [-1, 1]) {
      add(H, cone(0.03, 0.34, 6), [0.78, 0.72, 0.6], [sx * 0.1, 0.22, 0.0], [-0.3, 0, -sx * 0.7]);
      add(H, cone(0.02, 0.18, 6), [0.78, 0.72, 0.6], [sx * 0.13, 0.1, -0.02], [0.2, 0, -sx * 1.2]);
    }
  }
  const eyeR = isBoss ? 0.022 : 0.016;
  for (const sx of [-1, 1]) add(HG, sph(eyeR, 7, 6), eye, [sx * 0.046, 0.09, -0.105], [0, 0, 0], [1.1, 0.9, 0.7], 0);

  // ── jaw (pivot near the ears) ──
  const J: THREE.BufferGeometry[] = [];
  add(J, sph(0.085 * hs, 10, 7), skinDark, [0, -0.045, -0.06], [0, 0, 0], [1.0, 0.6, 1.0]);
  add(J, box(0.07, 0.012, 0.04), [0.55, 0.12, 0.12], [0, -0.025, -0.075], [0, 0, 0], [1, 1, 1], 0.1); // tongue
  for (let i = -2; i <= 2; i++) add(J, box(0.013, 0.016, 0.01), [0.78, 0.74, 0.58], [i * 0.016, -0.015, -0.108 + Math.abs(i) * 0.003], [0, 0, 0], [1, 1, 1], 0.05);
  add(J, sph(0.02, 6, 5), BLOOD, [0.03, -0.075, -0.1], [0, 0, 0], [1.6, 1, 0.6]);
  if (isBoss) for (const sx of [-1, 1]) add(J, cone(0.012, 0.08, 5), [0.85, 0.82, 0.7], [sx * 0.05, -0.04, -0.11], [Math.PI, 0, 0]);
  if (isSpit) add(J, cyl(0.008, 0.008, 0.1, 4), [0.4, 1, 0.3], [0, -0.1, -0.1]); // drool

  // ── limbs ──
  const arms = (side: number) => {
    const sl = sleeveless ? skin : shirt;
    const U: THREE.BufferGeometry[] = [];
    add(U, sph(0.07 * L, 8, 6), sl, [0, 0, 0]);
    add(U, cyl(0.058 * L, 0.048 * L, 0.31, 8), sl, [0, -0.155, 0]);
    add(U, sph(0.05 * L, 7, 6), sleeveless ? skin : skinDark, [0, -0.31, 0]);
    if (!sleeveless) add(U, new THREE.TorusGeometry(0.052, 0.012, 4, 8), BLOOD, [0, -0.27, 0], [Math.PI / 2, 0, 0]);
    if (rnd() < 0.5) add(U, sph(0.025, 5, 4), BLOOD, [0.035 * side, -0.12, 0.04], [0, 0, 0], [1, 1.4, 0.4]);
    const F: THREE.BufferGeometry[] = [];
    add(F, cyl(0.046 * L, 0.034 * L, 0.29, 8), skin, [0, -0.15, 0]);
    add(F, sph(0.04, 6, 5), skin, [0, -0.3, 0], [0, 0, 0], [1.2, 0.8, 0.8]); // wrist
    add(F, box(0.07 * L, 0.08, 0.026), skin, [0, -0.34, 0]); // palm
    for (let i = 0; i < 4; i++) {
      const fx = (i - 1.5) * 0.019 * L;
      add(F, cap(0.0075, 0.06 - (i === 3 ? 0.012 : 0)), i % 2 ? skinDark : skin, [fx, -0.41, -0.012], [0.5 + (i % 2) * 0.2, 0, (i - 1.5) * 0.12]);
      add(F, sph(0.0085, 4, 4), [0.35, 0.05, 0.04], [fx, -0.45, -0.032], [0, 0, 0], [1, 1, 1], 0.05); // bloody tips
    }
    add(F, cap(0.009, 0.045), skin, [0.04 * side * L, -0.36, -0.01], [0.3, 0, side * 0.9]); // thumb
    if (isBrute && side > 0) {
      for (let i = 0; i < 3; i++) add(F, cone(0.012, 0.07, 5), [0.8, 0.75, 0.62], [(i - 1) * 0.03, -0.41, -0.035], [-1.4, 0, 0]); // knuckle spikes
      add(F, sph(0.07, 8, 6), skinDark, [0, -0.34, 0], [0, 0, 0], [1.1, 0.9, 1]); // huge fist
    }
    if (isBoss) for (let i = 0; i < 4; i++) add(F, cone(0.008, 0.09, 4), [0.8, 0.75, 0.62], [(i - 1.5) * 0.02, -0.47, -0.01], [Math.PI, 0, 0]); // talons
    if (isSpit) add(F, sph(0.03, 5, 4), [0.3, 0.45, 0.15], [0, -0.28, 0], [0, 0, 0], [1.3, 1.5, 1]);
    return { U, F };
  };
  const aL = arms(-1);
  const aR = arms(1);

  const legs = (side: number) => {
    const TH: THREE.BufferGeometry[] = [];
    const torn = v === 2 && side < 0;
    add(TH, cyl(0.092 * L, 0.066 * L, 0.47, 9), pants, [0, -0.235, 0], [0, 0, 0], [1, 1, 1.05]);
    add(TH, sph(0.09 * L, 8, 6), pants, [0, 0, 0]);
    if (torn) add(TH, cyl(0.07, 0.066, 0.12, 8), skin, [0, -0.4, 0]);
    if (rnd() < 0.7) add(TH, sph(0.035, 5, 4), BLOOD, [0.07 * side, -0.18, 0.05], [0, 0, 0], [0.5, 1.4, 1]);
    const SH: THREE.BufferGeometry[] = [];
    add(SH, sph(0.066 * L, 7, 6), pants, [0, 0, 0]);
    add(SH, cyl(0.064 * L, 0.046 * L, 0.42, 8), v === 1 && side > 0 ? skin : pants, [0, -0.23, 0]);
    const barefoot = isRun || v === 2 || isBloat;
    add(SH, cap(0.052, 0.12), barefoot ? skin : [0.14, 0.11, 0.09], [0, -0.46, -0.06], [Math.PI / 2, 0, 0], [1, 1, 0.8]);
    if (!barefoot) add(SH, cyl(0.056, 0.058, 0.1, 8), [0.14, 0.11, 0.09], [0, -0.4, 0]);
    else for (let i = 0; i < 3; i++) add(SH, sph(0.012, 4, 4), [0.3, 0.25, 0.2], [(i - 1) * 0.022, -0.475, -0.16]);
    return { TH, SH };
  };
  const lL = legs(-1);
  const lR = legs(1);

  // ── hanging rags (animated swing) ──
  const RG: THREE.BufferGeometry[] = [];
  if (!isBoss) {
    const rc: V3 = isBrute ? [0.3, 0.26, 0.2] : shirt;
    for (let i = 0; i < 3; i++) add(RG, box(0.07 + rnd() * 0.03, 0.18 + rnd() * 0.12, 0.008), rc, [(i - 1) * 0.1 * W, -0.1, 0.12 * W * (i === 1 ? 0.8 : 1)], [0, (i - 1) * 0.3, 0], [1, 1, 1], 0.2);
    for (let i = 0; i < 2; i++) add(RG, box(0.09, 0.2 + rnd() * 0.1, 0.008), rc, [(i - 0.5) * 0.16 * W, -0.1, -0.12 * W], [0, (i - 0.5) * 0.4, 0], [1, 1, 1], 0.2);
  }

  // ── type extras ──
  let belly: THREE.BufferGeometry | null = null;
  let bellyGlow: THREE.BufferGeometry | null = null;
  if (isBloat) {
    const B: THREE.BufferGeometry[] = [];
    const BG: THREE.BufferGeometry[] = [];
    add(B, sph(0.3, 14, 10), mul(skin, [1.1, 1.05, 0.8]), [0, 0.08, 0.06], [0, 0, 0], [1.05, 1.0, 1.0], 0.22);
    add(B, sph(0.2, 10, 8), shirt, [0, 0.32, 0.08], [0, 0, 0], [1.1, 0.7, 0.85]);
    for (let i = 0; i < 11; i++) {
      const a = rnd() * Math.PI * 2 * 0.7 - 0.9;
      const y = rnd() * 0.5 - 0.2;
      const rr = 0.3 * Math.sqrt(Math.max(0.1, 1 - (y / 0.34) ** 2));
      const px = Math.sin(a) * rr * 1.05;
      const pz = 0.06 + Math.cos(a) * rr;
      add(B, sph(0.034 + rnd() * 0.03, 6, 5), [0.55, 0.5, 0.2], [px, 0.08 + y, pz], [0, 0, 0], [1, 1, 0.7]);
      add(BG, sph(0.016 + rnd() * 0.016, 5, 4), [0.9, 1.0, 0.25], [px, 0.08 + y, pz + 0.02], [0, 0, 0], [1, 1, 0.7], 0);
    }
    belly = merge(B);
    bellyGlow = merge(BG);
  }
  let sac: THREE.BufferGeometry | null = null;
  if (isSpit) {
    const S: THREE.BufferGeometry[] = [];
    add(S, sph(0.075, 10, 8), [0.35, 0.9, 0.2], [0, 0.04, 0.05], [0, 0, 0], [1.1, 1.0, 0.9], 0.1);
    add(S, sph(0.04, 6, 5), [0.7, 1.0, 0.4], [0.03, 0.06, 0.1], [0, 0, 0], [1, 1, 1], 0);
    sac = merge(S);
  }
  let extraArm: THREE.BufferGeometry | null = null;
  let extraFore: THREE.BufferGeometry | null = null;
  if (isBoss) {
    const EA: THREE.BufferGeometry[] = [];
    add(EA, sph(0.055, 7, 6), skinDark, [0, 0, 0]);
    add(EA, cyl(0.045, 0.035, 0.3, 7), skinDark, [0, -0.15, 0]);
    const EF: THREE.BufferGeometry[] = [];
    add(EF, cyl(0.035, 0.022, 0.32, 7), skinDark, [0, -0.16, 0]);
    for (let i = 0; i < 3; i++) add(EF, cone(0.01, 0.12, 4), [0.8, 0.75, 0.62], [(i - 1) * 0.02, -0.36, 0], [Math.PI, 0, (i - 1) * 0.2]);
    extraArm = merge(EA);
    extraFore = merge(EF);
  }

  const parts: Parts = {
    torso: merge(T),
    torsoGlow: merge(TG),
    head: merge(H),
    headGlow: merge(HG),
    jaw: merge(J),
    upper: [merge(aL.U), merge(aR.U)],
    fore: [merge(aL.F), merge(aR.F)],
    thigh: [merge(lL.TH), merge(lR.TH)],
    shin: [merge(lL.SH), merge(lR.SH)],
    rags: merge(RG),
    belly,
    bellyGlow,
    sac,
    extraArm,
    extraFore,
  };
  partCache.set(key, parts);
  return parts;
}

export function buildRig(type: ZType, variant: number, shadows: boolean): ZombieRig {
  const def = ZDEFS[type];
  const P = buildParts(type, variant);
  const { mat, glow } = getMats();
  const v = ((variant % 3) + 3) % 3;
  const isBrute = type === "brute";
  const isBoss = type === "boss";
  const isBloat = type === "bloater";
  const W = type === "runner" ? 0.82 : isBloat ? 1.15 : isBrute ? 1.25 : isBoss ? 1.2 : 1;

  const root = new THREE.Group();
  root.rotation.order = "YXZ";
  const body = new THREE.Group();
  body.position.y = 0.95;
  root.add(body);
  const spine = new THREE.Group();
  body.add(spine);

  const M = (g: THREE.BufferGeometry, cast = false, m: THREE.Material = mat) => {
    const o = new THREE.Mesh(g, m);
    o.castShadow = cast && shadows;
    o.frustumCulled = true;
    return o;
  };
  const torso = M(P.torso, true);
  spine.add(torso);
  if (P.torsoGlow.attributes.position) spine.add(M(P.torsoGlow, false, glow));

  let pulse: THREE.Object3D | null = null;
  if (P.belly) {
    const bg = new THREE.Group();
    bg.position.set(0, 0.2, 0.06);
    const b = M(P.belly, true);
    bg.add(b);
    if (P.bellyGlow) bg.add(M(P.bellyGlow, false, glow));
    spine.add(bg);
    pulse = bg;
  }

  const neck = new THREE.Group();
  neck.position.set(0, isBoss ? 0.74 : 0.74, isBoss ? -0.04 : 0);
  spine.add(neck);
  const headMesh = M(P.head, true);
  headMesh.position.y = 0.0;
  neck.add(headMesh);
  neck.add(M(P.headGlow, false, glow));
  const jaw = new THREE.Group();
  jaw.position.set(0, 0.02, 0);
  jaw.add(M(P.jaw));
  neck.add(jaw);
  if (P.sac) {
    const sacM = M(P.sac);
    sacM.position.set(0, -0.06, -0.01);
    neck.add(sacM);
    pulse = sacM;
  }
  if (isBoss) neck.scale.setScalar(1.1);

  const mkArm = (i: number, sx: number) => {
    const sh = new THREE.Group();
    sh.position.set(sx * (0.25 * W + 0.03), 0.6, 0);
    sh.add(M(P.upper[i], true));
    const el = new THREE.Group();
    el.position.y = -0.31;
    el.add(M(P.fore[i]));
    sh.add(el);
    spine.add(sh);
    return { sh, el };
  };
  const aL = mkArm(0, -1);
  const aR = mkArm(1, 1);
  if (isBrute) aR.sh.scale.setScalar(1.35);

  const mkLeg = (i: number, sx: number) => {
    const hp = new THREE.Group();
    hp.position.set(sx * 0.105 * W, -0.02, 0);
    hp.add(M(P.thigh[i], true));
    const kn = new THREE.Group();
    kn.position.y = -0.47;
    kn.add(M(P.shin[i]));
    hp.add(kn);
    body.add(hp);
    return { hp, kn };
  };
  const lL = mkLeg(0, -1);
  const lR = mkLeg(1, 1);

  const rags = new THREE.Group();
  rags.position.set(0, 0.1, 0);
  if (P.rags.attributes.position) rags.add(M(P.rags));
  spine.add(rags);

  const extra: { sh: THREE.Group; el: THREE.Group }[] = [];
  if (isBoss && P.extraArm && P.extraFore) {
    for (const sx of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(sx * 0.2, 0.38, 0.07);
      sh.add(M(P.extraArm));
      const el = new THREE.Group();
      el.position.y = -0.3;
      el.add(M(P.extraFore));
      sh.add(el);
      spine.add(sh);
      extra.push({ sh, el });
    }
  }

  root.scale.setScalar(def.scale);
  return {
    root, body, spine, neck, head: headMesh, jaw,
    armL: aL.sh, armR: aR.sh, elL: aL.el, elR: aR.el,
    legL: lL.hp, legR: lR.hp, knL: lL.kn, knR: lR.kn,
    torso, rags, pulse, extra,
    gait: v, style: 0, armBig: isBrute ? 1.35 : 1,
  };
}

// ───────────────────────── animation ─────────────────────────
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (x: number) => x * x * (3 - 2 * x);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function animDead(z: Zombie, dt: number) {
  const r = z.rig;
  z.deadT += dt;
  const T = z.deadT;
  const sc = z.def.scale;
  const style = Math.floor((z.phase / 2.1) % 3);
  r.style = style;
  const dir = z.fallDir || 1;
  const buckle = ease(clamp01(T / 0.3));
  const fall = clamp01((T - 0.12) / 0.55);
  const f = fall * fall; // gravity
  const bounce = fall >= 1 ? Math.exp(-(T - 0.67) * 7) * Math.sin((T - 0.67) * 20) * 0.06 : 0;
  r.root.rotation.z = 0;
  // reset to neutral
  r.spine.rotation.set(0, 0, 0);
  r.rags.rotation.set(0, 0, 0);
  r.body.rotation.set(0, 0, 0);
  r.body.position.y = 0.95;
  r.armL.scale.setScalar(1);
  if (r.pulse && z.type === "spitter") r.pulse.scale.setScalar(0.6);
  const flop = Math.sin(T * 30) * Math.exp(-T * 6) * 0.15;

  if (style === 0) {
    // knees give, topples straight back
    r.root.rotation.x = -dir * (f * (Math.PI / 2) - bounce);
    r.legL.rotation.x = buckle * -0.45 + (fall > 0.5 ? 0.3 * (fall - 0.5) : 0);
    r.legR.rotation.x = buckle * -0.2;
    r.knL.rotation.x = buckle * 1.1 * (1 - f * 0.6);
    r.knR.rotation.x = buckle * 0.7 * (1 - f * 0.5);
    r.armL.rotation.set(-0.5 - buckle * 0.8 + f * 1.1, 0, 0.5 + f * 0.9 + flop);
    r.armR.rotation.set(-0.9 - buckle * 0.4 + f * 1.4, 0, -0.4 - f * 1.0 - flop);
    r.elL.rotation.x = -0.6 * (1 - f);
    r.elR.rotation.x = -0.9 * (1 - f);
    r.neck.rotation.set(-0.5 * buckle - f * 0.4, 0, 0.3 * buckle);
    r.jaw.rotation.x = 0.7;
  } else if (style === 1) {
    // pitches forward onto its face, arms trailing
    r.root.rotation.x = dir * (f * (Math.PI / 2) - bounce);
    r.legL.rotation.x = buckle * -0.8;
    r.legR.rotation.x = buckle * -0.5;
    r.knL.rotation.x = buckle * 1.5 * (1 - f * 0.7);
    r.knR.rotation.x = buckle * 1.1 * (1 - f * 0.7);
    r.body.rotation.x = buckle * 0.5 * (1 - f);
    r.armL.rotation.set(-1.4 * (1 - f) - f * 0.2, 0, 0.4 + f * 0.9);
    r.armR.rotation.set(-1.0 * (1 - f) - f * 0.5, 0, -0.3 - f * 1.0);
    r.elL.rotation.x = -0.7 * (1 - f);
    r.elR.rotation.x = -0.4;
    r.neck.rotation.set(0.5 * (1 - f) - 0.4 * f, 0, -0.25 * f);
    r.jaw.rotation.x = 0.5;
  } else {
    // collapses to its knees, then slumps sideways
    const k = ease(clamp01(T / 0.35));
    const s2 = clamp01((T - 0.3) / 0.5);
    r.root.rotation.x = 0;
    r.root.rotation.z = dir * (s2 * s2 * (Math.PI / 2) - bounce);
    r.legL.rotation.x = -1.2 * k;
    r.legR.rotation.x = -1.35 * k;
    r.knL.rotation.x = 2.2 * k;
    r.knR.rotation.x = 2.4 * k;
    r.body.position.y = lerp(0.95, 0.5, k);
    r.body.rotation.x = 0.35 * k * (1 - s2);
    r.armL.rotation.set(-0.3, 0, 0.3 + s2 * 0.8);
    r.armR.rotation.set(-0.2, 0, -0.3 - s2 * 0.8);
    r.elL.rotation.x = -0.5;
    r.elR.rotation.x = -0.3;
    r.neck.rotation.set(0.8 * k, 0, 0.4 * k);
    r.jaw.rotation.x = 0.6;
  }
  // lift so the lying body rests on the ground, not in it
  const lying = style === 2 ? f * 0 + clamp01((T - 0.3) / 0.5) : f;
  r.root.position.y = z.y + lying * 0.17 * sc - (T > 6 ? (T - 6) * 0.45 : 0);
  for (let i = 0; i < r.extra.length; i++) {
    r.extra[i].sh.rotation.set(-0.4 + f, 0, (i ? -1 : 1) * (0.5 + f));
    r.extra[i].el.rotation.x = -0.4;
  }
}

export function animateRig(z: Zombie, t: number, dt: number, moving: number) {
  if (z.dead) {
    animDead(z, dt);
    return;
  }
  const r = z.rig;
  const d = z.def;
  const m = Math.max(0, Math.min(1.3, moving));
  const run = d.id === "runner" || z.charging > 0;
  const heavy = d.id === "brute" || d.id === "boss" || d.id === "bloater";
  const cyc = t * (3.0 + z.speed * 1.55) + z.phase;
  const s = Math.sin(cyc);
  const c = Math.cos(cyc);
  const gait = r.gait;
  r.root.rotation.z = 0;
  r.root.position.y = z.y;

  // attack envelope
  const atkDur = d.id === "spitter" ? 0.7 : 0.55;
  const p = z.attackT > 0 ? 1 - z.attackT / atkDur : -1;
  let raise = 0;
  let slam = 0;
  if (p >= 0) {
    if (p < 0.45) raise = ease(p / 0.45);
    else slam = ease((p - 0.45) / 0.55), (raise = 1 - slam * 0.6);
  }

  // ── legs ──
  const amp = (run ? 0.95 : heavy ? 0.5 : 0.58) * m;
  const kn = (run ? 1.5 : 0.95) * m;
  let hL = s * amp;
  let hR = -s * amp;
  let kL = Math.max(0, -c) * kn;
  let kR = Math.max(0, c) * kn;
  if (gait === 1 && !run && d.id === "walker") {
    // limp: right leg drags
    hR = -s * amp * 0.4 - 0.1 * m;
    kR = 0.05;
    r.body.rotation.z = s * 0.14 * m;
  } else r.body.rotation.z = s * 0.07 * m * (heavy ? 1.6 : 1);
  if (m < 0.05) {
    hL = hR = 0.02;
    kL = kR = 0.03;
  }
  r.legL.rotation.x = hL;
  r.legR.rotation.x = hR;
  r.knL.rotation.x = kL;
  r.knR.rotation.x = kR;
  r.legL.rotation.z = -0.03;
  r.legR.rotation.z = 0.03;

  // ── torso ──
  const breathe = Math.sin(t * 1.7 + z.phase);
  let lean = d.lean + (gait === 2 && !run ? 0.18 : 0);
  if (p >= 0) lean += p < 0.45 ? -0.35 * raise : 0.7 * slam;
  if (z.charging > 0) lean = 0.55;
  if (z.stagger > 0) lean -= Math.min(1, z.stagger * 4) * 0.4;
  r.body.rotation.x = lean;
  r.body.rotation.y = 0;
  r.body.position.y = 0.95 + Math.abs(s) * (run ? 0.06 : 0.035) * m - (heavy ? 0.02 * Math.abs(c) * m : 0);
  r.spine.rotation.set(breathe * 0.02 + (m > 0.05 ? 0.06 : 0), s * (run ? 0.3 : 0.18) * m + (gait === 1 ? 0.12 : 0), 0);

  // ── arms ──
  const R = run ? -0.35 : gait === 2 ? -1.05 : -1.3 + Math.sin(cyc * 0.5 + 1) * 0.1;
  const flail = z.burn > 0 ? Math.sin(t * 14 + z.phase) * 0.7 : 0;
  let aL = run ? s * 1.0 - 0.1 : R + s * 0.1;
  let aR = run ? -s * 1.0 - 0.1 : R + 0.14 - s * 0.1;
  let eL = run ? -1.15 : -0.35 - Math.sin(cyc + 1) * 0.12;
  let eR = run ? -1.15 : -0.5 + Math.sin(cyc) * 0.12;
  let zL = 0.1;
  let zR = -0.1;
  if (gait === 1 && !run && d.id === "walker") {
    // one arm reaching high, the other dead weight
    aL = -1.65 + s * 0.08;
    aR = -0.25 + Math.sin(cyc * 0.7) * 0.12;
    eR = -0.2;
    zR = -0.18;
  }
  if (z.stagger > 0) {
    const k = Math.min(1, z.stagger * 4);
    aL = lerp(aL, -0.2, k);
    aR = lerp(aR, 0.1, k);
    zL += k * 0.7;
    zR -= k * 0.7;
  }
  if (p >= 0) {
    const tgt = -2.7;
    const a = p < 0.45 ? lerp(R, tgt, raise) : lerp(tgt, -0.55, slam);
    aL = a + 0.06;
    aR = a - 0.04;
    eL = p < 0.45 ? lerp(eL, -0.5, raise) : lerp(-0.5, -0.1, slam);
    eR = eL;
    zL = 0.15 + raise * 0.15;
    zR = -zL;
  }
  if (z.charging > 0) {
    aL = -0.2 + s * 0.6;
    aR = -0.2 - s * 0.6;
  }
  r.armL.rotation.set(aL + flail, 0, zL);
  r.armR.rotation.set(aR - flail, 0, zR);
  r.elL.rotation.x = eL;
  r.elR.rotation.x = eR;

  // ── head & jaw ──
  const jerk = Math.sin(t * 7.3 + z.phase * 3) > 0.93 ? 0.15 : 0;
  const groan = Math.pow(0.5 + 0.5 * Math.sin(t * 2.1 + z.phase * 3), 5);
  r.neck.rotation.set(
    0.12 + (gait === 2 ? 0.25 : 0) + Math.sin(t * 0.9 + z.phase) * 0.06 - (p >= 0 ? 0.3 * raise : 0) + jerk - (z.stagger > 0 ? 0.4 : 0) - lean * 0.5,
    Math.sin(t * 0.6 + z.phase) * 0.25,
    (gait === 0 ? 0.16 : gait === 1 ? -0.22 : 0.05) + Math.sin(t * 1.3 + z.phase) * 0.1 + (z.burn > 0 ? flail * 0.4 : 0),
  );
  r.jaw.rotation.x = 0.08 + groan * 0.45 + (p >= 0 ? 0.7 * raise : 0) + (run ? 0.25 : 0) + (z.stagger > 0 ? 0.5 : 0) + (d.id === "boss" ? 0.25 : 0);

  // ── cloth, glands, extra limbs ──
  r.rags.rotation.set(Math.sin(cyc * 0.5 + 0.5) * 0.18 * m + Math.sin(t * 2.2 + z.phase) * 0.05 + (run ? 0.35 : 0), 0, 0);
  if (r.pulse) {
    const k = d.id === "spitter" ? 1 + (p >= 0 ? raise * 0.8 : 0) + Math.sin(t * 5 + z.phase) * 0.08 : 1 + Math.sin(t * 2.4 + z.phase) * 0.035 + (z.hp < z.maxHp * 0.4 ? Math.sin(t * 9) * 0.02 : 0);
    r.pulse.scale.setScalar(k);
  }
  for (let i = 0; i < r.extra.length; i++) {
    const sg = i ? -1 : 1;
    r.extra[i].sh.rotation.set(-1.0 + Math.sin(t * 2.2 + i * 2 + z.phase) * 0.4 - (p >= 0 ? raise * 1.2 : 0), 0, sg * (0.4 + Math.sin(t * 1.7 + i) * 0.2));
    r.extra[i].el.rotation.x = -0.5 + Math.sin(t * 3 + i) * 0.3;
  }
}
