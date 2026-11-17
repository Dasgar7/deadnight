import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { canvasTex } from "./assets";

/* ------------------------------------------------------------------ *
 *  Procedural PBR texture + material kit for first-person weapons.
 * ------------------------------------------------------------------ */

function mk(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, g: c.getContext("2d")!, w, h };
}
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const lin = (c: HTMLCanvasElement, rep = 1) => {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep, rep);
  t.anisotropy = 8;
  return t; // data textures stay linear
};

/** brushed steel: returns [albedo, roughness, bump] */
function steelTextures() {
  const R = rng(11);
  const a = mk(512, 512);
  const r = mk(512, 512);
  const b = mk(512, 512);
  a.g.fillStyle = "#9a9a9e";
  a.g.fillRect(0, 0, 512, 512);
  r.g.fillStyle = "#6a6a6a";
  r.g.fillRect(0, 0, 512, 512);
  b.g.fillStyle = "#808080";
  b.g.fillRect(0, 0, 512, 512);
  // long brush strokes along U (the barrel direction on most faces)
  for (let i = 0; i < 2600; i++) {
    const y = R() * 512;
    const x = R() * 512;
    const l = 40 + R() * 260;
    const v = Math.floor(100 + R() * 120);
    a.g.strokeStyle = `rgba(${v},${v},${v + 4},${0.05 + R() * 0.12})`;
    a.g.lineWidth = 0.6 + R() * 1.2;
    a.g.beginPath();
    a.g.moveTo(x, y);
    a.g.lineTo(x + l, y + (R() - 0.5) * 2);
    a.g.stroke();
    const rv = Math.floor(70 + R() * 90);
    r.g.strokeStyle = `rgba(${rv},${rv},${rv},0.18)`;
    r.g.lineWidth = 1;
    r.g.beginPath();
    r.g.moveTo(x, y);
    r.g.lineTo(x + l, y);
    r.g.stroke();
    const bv = Math.floor(R() * 255);
    b.g.strokeStyle = `rgba(${bv},${bv},${bv},0.2)`;
    b.g.lineWidth = 0.8;
    b.g.beginPath();
    b.g.moveTo(x, y);
    b.g.lineTo(x + l, y);
    b.g.stroke();
  }
  // wear scratches and speckles
  for (let i = 0; i < 90; i++) {
    const x = R() * 512;
    const y = R() * 512;
    a.g.strokeStyle = "rgba(210,210,214,0.35)";
    a.g.lineWidth = 0.7;
    a.g.beginPath();
    a.g.moveTo(x, y);
    a.g.lineTo(x + (R() - 0.5) * 60, y + (R() - 0.5) * 30);
    a.g.stroke();
  }
  for (let i = 0; i < 1500; i++) {
    const x = R() * 512;
    const y = R() * 512;
    a.g.fillStyle = `rgba(30,30,34,${R() * 0.25})`;
    a.g.fillRect(x, y, 1 + R() * 2, 1 + R() * 2);
  }
  const at = canvasTex(a.c);
  at.wrapS = at.wrapT = THREE.RepeatWrapping;
  return [at, lin(r.c), lin(b.c)] as const;
}

/** polymer / rubber grain */
function grainTextures(seed: number, base: number, fine = 1) {
  const R = rng(seed);
  const a = mk(256, 256);
  const b = mk(256, 256);
  a.g.fillStyle = `rgb(${base},${base},${base})`;
  a.g.fillRect(0, 0, 256, 256);
  b.g.fillStyle = "#808080";
  b.g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000 * fine; i++) {
    const x = R() * 256;
    const y = R() * 256;
    const v = Math.floor(R() * 255);
    a.g.fillStyle = `rgba(${v},${v},${v},0.09)`;
    a.g.fillRect(x, y, 1.5, 1.5);
    b.g.fillStyle = `rgba(${v},${v},${v},0.5)`;
    b.g.fillRect(x, y, 1.5, 1.5);
  }
  const at = canvasTex(a.c);
  at.wrapS = at.wrapT = THREE.RepeatWrapping;
  return [at, lin(b.c)] as const;
}

function woodTextures(seed: number, dark: boolean) {
  const R = rng(seed);
  const a = mk(512, 256);
  const b = mk(512, 256);
  const base = dark ? [74, 44, 24] : [150, 98, 52];
  a.g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
  a.g.fillRect(0, 0, 512, 256);
  b.g.fillStyle = "#808080";
  b.g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 220; i++) {
    const y0 = R() * 256;
    const amp = 2 + R() * 8;
    const ph = R() * 6;
    const f = 0.004 + R() * 0.012;
    const v = (R() - 0.5) * (dark ? 40 : 70);
    a.g.strokeStyle = `rgba(${base[0] + v},${base[1] + v * 0.7},${base[2] + v * 0.4},${0.25 + R() * 0.4})`;
    a.g.lineWidth = 0.6 + R() * 2.2;
    a.g.beginPath();
    for (let x = 0; x <= 512; x += 8) {
      const y = y0 + Math.sin(x * f + ph) * amp;
      x === 0 ? a.g.moveTo(x, y) : a.g.lineTo(x, y);
    }
    a.g.stroke();
    b.g.strokeStyle = `rgba(${v > 0 ? 220 : 40},${v > 0 ? 220 : 40},${v > 0 ? 220 : 40},0.25)`;
    b.g.lineWidth = 1;
    b.g.beginPath();
    for (let x = 0; x <= 512; x += 8) {
      const y = y0 + Math.sin(x * f + ph) * amp;
      x === 0 ? b.g.moveTo(x, y) : b.g.lineTo(x, y);
    }
    b.g.stroke();
  }
  const at = canvasTex(a.c);
  at.wrapS = at.wrapT = THREE.RepeatWrapping;
  return [at, lin(b.c)] as const;
}

function clothTextures(seed: number, rgb: [number, number, number]) {
  const R = rng(seed);
  const a = mk(128, 128);
  const b = mk(128, 128);
  a.g.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  a.g.fillRect(0, 0, 128, 128);
  b.g.fillStyle = "#808080";
  b.g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 1) {
    for (let x = 0; x < 128; x += 1) {
      const o = ((x + y) & 1) * 14;
      b.g.fillStyle = `rgb(${110 + o},${110 + o},${110 + o})`;
      b.g.fillRect(x, y, 1, 1);
      const v = (R() - 0.5) * 22;
      a.g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 120})`;
      a.g.fillRect(x, y, 1, 1);
    }
  }
  const at = canvasTex(a.c);
  at.wrapS = at.wrapT = THREE.RepeatWrapping;
  at.repeat.set(3, 3);
  const bt = lin(b.c);
  bt.repeat.set(2, 2);
  return [at, bt] as const;
}

export interface Kit {
  blued: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  chrome: THREE.MeshStandardMaterial;
  gunmetal: THREE.MeshStandardMaterial;
  alum: THREE.MeshStandardMaterial;
  tan: THREE.MeshStandardMaterial;
  poly: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  woodDark: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  olive: THREE.MeshStandardMaterial;
  red: THREE.MeshStandardMaterial;
  orange: THREE.MeshStandardMaterial;
  lens: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  dotRed: THREE.MeshBasicMaterial;
  trit: THREE.MeshBasicMaterial;
  cyan: THREE.MeshBasicMaterial;
  hot: THREE.MeshBasicMaterial;
  screen: THREE.MeshBasicMaterial;
  glove: THREE.MeshStandardMaterial;
  gloveHard: THREE.MeshStandardMaterial;
  sleeve: THREE.MeshStandardMaterial;
  skin: THREE.MeshStandardMaterial;
  blade: THREE.MeshStandardMaterial;
  leather: THREE.MeshStandardMaterial;
  all: THREE.Material[];
}

let kitCache: Kit | null = null;

export function getKit(): Kit {
  if (kitCache) return kitCache;
  const [sA, sR, sB] = steelTextures();
  const [pA, pB] = grainTextures(5, 60, 1);
  const [rA, rB] = grainTextures(8, 30, 0.6);
  const [wA, wB] = woodTextures(21, false);
  const [dA, dB] = woodTextures(33, true);
  const [gA, gB] = clothTextures(3, [48, 46, 44]);
  const [cA, cB] = clothTextures(9, [52, 58, 46]);
  const [lA, lB] = grainTextures(14, 90, 1.5);

  const blued = new THREE.MeshStandardMaterial({ map: sA, color: 0x4c4f58, roughnessMap: sR, roughness: 0.85, metalness: 1, bumpMap: sB, bumpScale: 0.7 });
  const steel = new THREE.MeshStandardMaterial({ map: sA, color: 0xd8dade, roughnessMap: sR, roughness: 0.55, metalness: 1, bumpMap: sB, bumpScale: 0.5 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xf2f4f8, roughness: 0.12, metalness: 1 });
  const gunmetal = new THREE.MeshStandardMaterial({ map: sA, color: 0x2c2e34, roughnessMap: sR, roughness: 0.95, metalness: 0.95, bumpMap: sB, bumpScale: 0.6 });
  const alum = new THREE.MeshStandardMaterial({ map: sA, color: 0x7e8088, roughnessMap: sR, roughness: 0.8, metalness: 0.9, bumpMap: sB, bumpScale: 0.4 });
  const tan = new THREE.MeshStandardMaterial({ map: pA, color: 0x9a8560, roughness: 0.62, metalness: 0.15, bumpMap: pB, bumpScale: 1.2 });
  const poly = new THREE.MeshStandardMaterial({ map: pA, color: 0x2a2b2e, roughness: 0.58, metalness: 0.08, bumpMap: pB, bumpScale: 1.6 });
  const rubber = new THREE.MeshStandardMaterial({ map: rA, color: 0x1a1a1b, roughness: 0.92, metalness: 0, bumpMap: rB, bumpScale: 2 });
  const wood = new THREE.MeshStandardMaterial({ map: wA, bumpMap: wB, bumpScale: 1.4, roughness: 0.48, metalness: 0 });
  const woodDark = new THREE.MeshStandardMaterial({ map: dA, bumpMap: dB, bumpScale: 1.4, roughness: 0.5, metalness: 0 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xd0a24a, roughness: 0.28, metalness: 1 });
  const olive = new THREE.MeshStandardMaterial({ map: lA, color: 0x5c6a44, roughness: 0.7, metalness: 0.35, bumpMap: lB, bumpScale: 1.2 });
  const red = new THREE.MeshStandardMaterial({ map: lA, color: 0xa3231a, roughness: 0.42, metalness: 0.3, bumpMap: lB, bumpScale: 0.8 });
  const orange = new THREE.MeshStandardMaterial({ map: lA, color: 0xd9741a, roughness: 0.45, metalness: 0.25, bumpMap: lB, bumpScale: 0.8 });
  const lens = new THREE.MeshStandardMaterial({ color: 0x0b2638, roughness: 0.05, metalness: 0.6, emissive: 0x0a3050, emissiveIntensity: 0.6, envMapIntensity: 2.2 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xaad8ff, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.28, clearcoat: 1, envMapIntensity: 2 });
  const dotRed = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  const trit = new THREE.MeshBasicMaterial({ color: 0x7dff90 });
  const cyan = new THREE.MeshBasicMaterial({ color: 0x66e8ff });
  const hot = new THREE.MeshBasicMaterial({ color: 0xff9a40 });
  const screen = new THREE.MeshBasicMaterial({ color: 0x9dffb0 });
  const glove = new THREE.MeshStandardMaterial({ map: gA, color: 0xffffff, roughness: 0.88, metalness: 0, bumpMap: gB, bumpScale: 1.4 });
  const gloveHard = new THREE.MeshStandardMaterial({ map: rA, color: 0x232325, roughness: 0.4, metalness: 0.1, bumpMap: rB, bumpScale: 1 });
  const sleeve = new THREE.MeshStandardMaterial({ map: cA, color: 0xffffff, roughness: 0.95, metalness: 0, bumpMap: cB, bumpScale: 0.6 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xb98a6c, roughness: 0.7, metalness: 0 });
  const blade = new THREE.MeshStandardMaterial({ map: sA, color: 0xeef0f4, roughnessMap: sR, roughness: 0.35, metalness: 1, bumpMap: sB, bumpScale: 0.3 });
  const leather = new THREE.MeshStandardMaterial({ map: lA, color: 0x5a3a24, roughness: 0.78, metalness: 0, bumpMap: lB, bumpScale: 1.5 });
  const all = [blued, steel, chrome, gunmetal, alum, tan, poly, rubber, wood, woodDark, brass, olive, red, orange, lens, glass, glove, gloveHard, sleeve, skin, blade, leather];
  kitCache = { blued, steel, chrome, gunmetal, alum, tan, poly, rubber, wood, woodDark, brass, olive, red, orange, lens, glass, dotRed, trit, cyan, hot, screen, glove, gloveHard, sleeve, skin, blade, leather, all };
  return kitCache;
}

/* ------------------------------------------------------------------ *
 *  Part: geometry collector that merges everything per material, so
 *  a detailed gun costs only a handful of draw calls.
 * ------------------------------------------------------------------ */

export type V3 = [number, number, number];

export class Part {
  g = new THREE.Group();
  private buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private built = false;

  private put(m: THREE.Material, geo: THREE.BufferGeometry, p: V3, rot?: V3, scl?: V3) {
    const mat = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot?.[0] ?? 0, rot?.[1] ?? 0, rot?.[2] ?? 0, "YXZ"));
    mat.compose(new THREE.Vector3(...p), q, new THREE.Vector3(...(scl ?? [1, 1, 1])));
    geo.applyMatrix4(mat);
    let g2 = geo.index ? geo.toNonIndexed() : geo;
    if (g2 !== geo) geo.dispose();
    // keep only common attributes
    for (const k of Object.keys(g2.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") g2.deleteAttribute(k);
    if (!g2.attributes.uv) g2.setAttribute("uv", new THREE.BufferAttribute(new Float32Array((g2.attributes.position.count) * 2), 2));
    const arr = this.buckets.get(m) ?? [];
    arr.push(g2);
    this.buckets.set(m, arr);
    return this;
  }

  /** rounded box centred at p */
  box(m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, r = 0.003, rot?: V3) {
    const rr = Math.min(r, w / 2.05, h / 2.05, d / 2.05);
    const geo = rr > 0.0004 ? new RoundedBoxGeometry(w, h, d, 2, rr) : new THREE.BoxGeometry(w, h, d);
    return this.put(m, geo, [x, y, z], rot);
  }
  /** cylinder / cone along Z (r1 at +z end, r2 at -z end) */
  cyl(m: THREE.Material, r: number, len: number, x: number, y: number, z: number, seg = 18, r2?: number, rot?: V3) {
    const geo = new THREE.CylinderGeometry(r, r2 ?? r, len, seg, 1, false);
    geo.rotateX(Math.PI / 2); // +y -> +z
    return this.put(m, geo, [x, y, z], rot);
  }
  /** cylinder along X */
  cylX(m: THREE.Material, r: number, len: number, x: number, y: number, z: number, seg = 16) {
    const geo = new THREE.CylinderGeometry(r, r, len, seg);
    geo.rotateZ(Math.PI / 2);
    return this.put(m, geo, [x, y, z]);
  }
  /** cylinder along Y */
  cylY(m: THREE.Material, r: number, len: number, x: number, y: number, z: number, seg = 16, r2?: number) {
    const geo = new THREE.CylinderGeometry(r, r2 ?? r, len, seg);
    return this.put(m, geo, [x, y, z]);
  }
  /** revolve profile [radius, z] around the Z axis */
  lathe(m: THREE.Material, prof: [number, number][], x: number, y: number, z: number, seg = 20, rot?: V3) {
    const geo = new THREE.LatheGeometry(prof.map(([r, zz]) => new THREE.Vector2(r, zz)), seg);
    geo.rotateX(Math.PI / 2);
    return this.put(m, geo, [x, y, z], rot);
  }
  sphere(m: THREE.Material, r: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, seg = 14) {
    return this.put(m, new THREE.SphereGeometry(r, seg, Math.max(6, seg >> 1)), [x, y, z], undefined, [sx, sy, sz]);
  }
  torus(m: THREE.Material, R: number, r: number, x: number, y: number, z: number, rot?: V3, seg = 20) {
    return this.put(m, new THREE.TorusGeometry(R, r, 8, seg), [x, y, z], rot);
  }
  cone(m: THREE.Material, r: number, len: number, x: number, y: number, z: number, seg = 14) {
    // tip toward -z
    const geo = new THREE.ConeGeometry(r, len, seg);
    geo.rotateX(-Math.PI / 2);
    return this.put(m, geo, [x, y, z]);
  }
  /** capsule between two points */
  cap(m: THREE.Material, a: V3, b: V3, r: number, seg = 8) {
    const A = new THREE.Vector3(...a);
    const B = new THREE.Vector3(...b);
    const len = A.distanceTo(B);
    const geo = new THREE.CapsuleGeometry(r, Math.max(0.0001, len), 4, seg);
    geo.rotateX(Math.PI / 2);
    const mid = A.clone().add(B).multiplyScalar(0.5);
    const m4 = new THREE.Matrix4().lookAt(B, A, new THREE.Vector3(0, 1, 0));
    const q = new THREE.Quaternion().setFromRotationMatrix(m4);
    const e = new THREE.Euler().setFromQuaternion(q, "YXZ");
    return this.put(m, geo, [mid.x, mid.y, mid.z], [e.x, e.y, e.z]);
  }
  /** tapered rounded limb between two points (r0 at a, r1 at b) */
  tube(m: THREE.Material, a: V3, b: V3, r0: number, r1: number, seg = 12) {
    const A = new THREE.Vector3(...a);
    const B = new THREE.Vector3(...b);
    const len = A.distanceTo(B);
    const geo = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
    geo.rotateX(Math.PI / 2);
    const mid = A.clone().add(B).multiplyScalar(0.5);
    const m4 = new THREE.Matrix4().lookAt(B, A, new THREE.Vector3(0, 1, 0));
    const q = new THREE.Quaternion().setFromRotationMatrix(m4);
    const e = new THREE.Euler().setFromQuaternion(q, "YXZ");
    return this.put(m, geo, [mid.x, mid.y, mid.z], [e.x, e.y, e.z]);
  }
  /** side-profile extrusion: pts are [z,y]; thickness along X, centred at x */
  prism(m: THREE.Material, pts: [number, number][], width: number, x = 0, bevel = 0.002) {
    const s = new THREE.Shape();
    pts.forEach(([zz, yy], i) => (i === 0 ? s.moveTo(zz, yy) : s.lineTo(zz, yy)));
    s.closePath();
    const b = Math.min(bevel, width * 0.4);
    const geo = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.0005, width - 2 * b), bevelEnabled: b > 0.0003, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 6 });
    geo.rotateY(-Math.PI / 2);
    geo.translate(width / 2 - b, 0, 0);
    // after rotation extrusion is along -x from 0.. ; recentre handled by translate
    return this.put(m, geo, [x, 0, 0]);
  }
  /** top-down extrusion: pts are [x,z]; height along Y, bottom at y0 */
  plan(m: THREE.Material, pts: [number, number][], height: number, y0 = 0, bevel = 0.002) {
    const s = new THREE.Shape();
    pts.forEach(([xx, zz], i) => (i === 0 ? s.moveTo(xx, -zz) : s.lineTo(xx, -zz)));
    s.closePath();
    const b = Math.min(bevel, height * 0.4);
    const geo = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.0005, height - 2 * b), bevelEnabled: b > 0.0003, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 6 });
    geo.rotateX(-Math.PI / 2); // shape y -> -z... extrusion -> +y
    geo.scale(1, 1, -1);
    geo.translate(0, y0 + b, 0);
    // scale(…,-1) flips winding: fix
    const idx = geo.index;
    if (idx) {
      const a = idx.array as Uint16Array | Uint32Array;
      for (let i = 0; i < a.length; i += 3) {
        const t = a[i];
        a[i] = a[i + 2];
        a[i + 2] = t;
      }
    } else {
      const p = geo.attributes.position.array as Float32Array;
      const n = geo.attributes.normal.array as Float32Array;
      const u = geo.attributes.uv.array as Float32Array;
      for (let i = 0; i < p.length; i += 9) {
        for (let k = 0; k < 3; k++) {
          const t = p[i + k];
          p[i + k] = p[i + 6 + k];
          p[i + 6 + k] = t;
          const t2 = n[i + k];
          n[i + k] = n[i + 6 + k];
          n[i + 6 + k] = t2;
        }
        for (let k = 0; k < 2; k++) {
          const t = u[(i / 3) * 2 + k];
          u[(i / 3) * 2 + k] = u[(i / 3) * 2 + 4 + k];
          u[(i / 3) * 2 + 4 + k] = t;
        }
      }
    }
    return this.put(m, geo, [0, 0, 0]);
  }
  /** attach a ready-made object (animated child, etc.) */
  attach(o: THREE.Object3D) {
    this.g.add(o);
    return this;
  }
  /** merge everything per material into meshes */
  build(): THREE.Group {
    if (this.built) return this.g;
    this.built = true;
    for (const [m, arr] of this.buckets) {
      const merged = mergeGeometries(arr, false);
      arr.forEach((a) => a.dispose());
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, m);
      mesh.frustumCulled = false;
      this.g.add(mesh);
    }
    this.buckets.clear();
    return this.g;
  }
}

/* ------------------------------------------------------------------ *
 *  Hands & arms
 * ------------------------------------------------------------------ */

const v = (x: number, y: number, z: number): V3 => [x, y, z];

/** forearm in a sleeve with a glove cuff, from wrist toward the camera/bottom */
export function forearm(p: Part, k: Kit, wrist: V3, dir: V3, len = 0.55, side = 1) {
  len = Math.min(len, 0.34);
  const w = new THREE.Vector3(...wrist);
  const d = new THREE.Vector3(...dir).normalize();
  const e = w.clone().addScaledVector(d, len);
  const A = w.clone().addScaledVector(d, 0.04).toArray() as V3;
  p.tube(k.glove, w.toArray() as V3, A, 0.036, 0.04);
  p.tube(k.sleeve, A, e.toArray() as V3, 0.04, 0.052, 14);
  // cuff
  const c = w.clone().addScaledVector(d, 0.06);
  const orient = new THREE.Vector3().copy(d);
  void orient;
  p.tube(k.gloveHard, w.clone().addScaledVector(d, 0.02).toArray() as V3, c.toArray() as V3, 0.039, 0.041, 12);
  // wristwatch on the left arm
  if (side < 0) {
    const wp = w.clone().addScaledVector(d, 0.1);
    p.tube(k.rubber, wp.toArray() as V3, w.clone().addScaledVector(d, 0.14).toArray() as V3, 0.047, 0.048, 12);
    p.box(k.blued, 0.04, 0.012, 0.04, wp.x, wp.y + 0.046, wp.z + 0.02, 0.004);
    p.box(k.screen, 0.026, 0.004, 0.026, wp.x, wp.y + 0.054, wp.z + 0.02, 0.001);
  }
}

/**
 * Right hand wrapped around a pistol grip.
 * `c` = centre of grip, `hw` half width (x), `hd` half depth (z), `h` finger span height.
 */
export function gripHand(p: Part, k: Kit, c: V3, hw: number, hd: number, h: number, tilt = 0, side = 1, fingers = 4) {
  const [cx, cy, cz] = c;
  const t = Math.tan(tilt);
  const mat = k.glove;
  // palm on the strong side & back strap
  p.box(mat, 0.034, h + 0.025, hd * 2 + 0.03, cx + side * (hw + 0.012), cy - 0.003, cz + 0.012, 0.014, [tilt, 0, 0]);
  p.box(mat, hw * 2 + 0.03, h + 0.018, 0.034, cx, cy, cz + hd + 0.014, 0.014, [tilt, 0, 0]);
  // back of hand / knuckle guard
  p.box(k.gloveHard, 0.02, 0.012, 0.045, cx + side * (hw + 0.026), cy + h * 0.5 + 0.012, cz - 0.01, 0.005, [tilt, 0, 0]);
  for (let i = 0; i < fingers; i++) {
    const f = fingers === 1 ? 0 : i / (fingers - 1) - 0.5;
    const y = cy - f * h * 0.95;
    const yy = (z: number) => y + (z - cz) * t * -1;
    const r = 0.0125;
    const a: V3 = v(cx + side * (hw + 0.022), yy(cz + hd), cz + hd);
    const b: V3 = v(cx + side * (hw + 0.01), yy(cz - hd - 0.008), cz - hd - 0.006);
    const m: V3 = v(cx + side * (hw * 0.2), yy(cz - hd - 0.016), cz - hd - 0.008);
    const e: V3 = v(cx - side * (hw + 0.006), yy(cz - hd - 0.002), cz - hd + 0.006);
    p.cap(mat, a, b, r);
    p.cap(mat, b, m, r * 0.96);
    p.cap(mat, m, e, r * 0.9);
  }
  // thumb along the weak side, pointing forward
  p.cap(mat, v(cx + side * (hw + 0.012), cy + h * 0.38, cz + hd + 0.01), v(cx - side * (hw + 0.016), cy + h * 0.45, cz + 0.0), 0.0145);
  p.cap(mat, v(cx - side * (hw + 0.016), cy + h * 0.45, cz + 0.0), v(cx - side * (hw + 0.018), cy + h * 0.5, cz - hd * 1.4 - 0.025), 0.0125);
}

/**
 * Hand cupping a horizontal forend (axis Z).
 * `c` = centre of the forend, `rx`,`ry` its radii; hand sits at its underside.
 */
export function cupHand(p: Part, k: Kit, c: V3, rx: number, ry: number, span = 0.09, side = -1, thumbOver = true) {
  const [cx, cy, cz] = c;
  const mat = k.glove;
  // palm under/behind
  p.box(mat, rx * 2 + 0.03, 0.04, span + 0.02, cx, cy - ry - 0.012, cz + 0.004, 0.015);
  p.box(mat, 0.04, ry * 2 + 0.02, span + 0.02, cx + side * (rx + 0.01), cy - 0.004, cz + 0.004, 0.015);
  p.box(k.gloveHard, 0.012, 0.012, 0.05, cx + side * (rx + 0.03), cy + ry * 0.35, cz, 0.004);
  for (let i = 0; i < 4; i++) {
    const zz = cz - span / 2 + (i / 3) * span;
    const r = 0.0125;
    const a: V3 = v(cx + side * (rx + 0.018), cy - ry * 0.35, zz);
    const b: V3 = v(cx + side * (rx * 0.35), cy - ry - 0.012, zz - 0.003);
    const m: V3 = v(cx - side * (rx * 0.85), cy - ry * 0.65, zz - 0.004);
    const e: V3 = v(cx - side * (rx + 0.01), cy + ry * 0.1, zz - 0.004);
    p.cap(mat, a, b, r);
    p.cap(mat, b, m, r);
    p.cap(mat, m, e, r * 0.92);
  }
  if (thumbOver) {
    p.cap(mat, v(cx + side * (rx + 0.016), cy + ry * 0.2, cz + span * 0.5 + 0.018), v(cx + side * (rx * 0.35), cy + ry + 0.012, cz + span * 0.12), 0.0145);
    p.cap(mat, v(cx + side * (rx * 0.35), cy + ry + 0.012, cz + span * 0.12), v(cx - side * (rx * 0.3), cy + ry + 0.01, cz - span * 0.3), 0.0125);
  }
}

/** hand clenched round a tube grip of given radius, oriented along X (e.g. axe/bat handle runs along Z) */
export function fistOnShaft(p: Part, k: Kit, c: V3, r: number, side = 1) {
  const [cx, cy, cz] = c;
  const mat = k.glove;
  p.box(mat, 2 * r + 0.034, 2 * r + 0.034, 0.05, cx, cy + 0.006, cz + 0.02, 0.02);
  for (let i = 0; i < 4; i++) {
    const zz = cz - 0.03 + i * 0.0 + (i - 1.5) * 0.0;
    void zz;
  }
  // four fingers wrapping across the shaft (stacked along z)
  for (let i = 0; i < 4; i++) {
    const z = cz - 0.025 + i * 0.019;
    const a: V3 = v(cx + side * (r + 0.015), cy + r * 0.8, z);
    const b: V3 = v(cx + side * r * 0.4, cy + r + 0.012, z);
    const m: V3 = v(cx - side * (r + 0.012), cy + r * 0.2, z);
    const e: V3 = v(cx - side * (r * 0.4), cy - r - 0.01, z + 0.002);
    p.cap(mat, a, b, 0.0115);
    p.cap(mat, b, m, 0.0115);
    p.cap(mat, m, e, 0.0105);
  }
  p.cap(mat, v(cx + side * (r + 0.01), cy - r * 0.2, cz + 0.045), v(cx - side * 0.0, cy - r - 0.008, cz - 0.03), 0.0135);
  p.cap(mat, v(cx + side * (r + 0.02), cy + r, cz + 0.04), v(cx + side * (r + 0.02), cy + r * 0.2, cz + 0.015), 0.012);
}

/** muzzle brake / flash hider style helper: ring cuts */
export function rings(p: Part, m: THREE.Material, r: number, z0: number, step: number, n: number, x = 0, y = 0, thick = 0.004) {
  for (let i = 0; i < n; i++) p.cyl(m, r, thick, x, y, z0 + i * step, 20);
}

export const finish = {
  // convenience to build an env map from a RoomEnvironment-ish scene
};

/* ------------------------------------------------------------------ *
 *  Environment map for the viewmodel scene (warm key + cool fill)
 * ------------------------------------------------------------------ */
export function buildEnv(renderer: THREE.WebGLRenderer): THREE.Texture {
  const s = new THREE.Scene();
  const bg = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {},
    vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
    fragmentShader: "varying vec3 vP; void main(){ float h = vP.y; vec3 top = vec3(0.30,0.34,0.42); vec3 mid = vec3(0.14,0.15,0.17); vec3 bot = vec3(0.07,0.06,0.055); vec3 c = h>0.0 ? mix(mid, top, pow(h,0.7)) : mix(mid, bot, pow(-h,0.6)); gl_FragColor = vec4(c,1.0);}",
  }));
  s.add(bg);
  const panel = (w: number, h: number, pos: V3, col: number, i: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(i), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    s.add(m);
  };
  panel(5, 3, [-4, 5, 3], 0xfff0dd, 9); // warm key
  panel(2, 6, [5, 2, -1], 0x9fc4ff, 5); // cool rim
  panel(6, 1.4, [0, 4, -5], 0xffffff, 4);
  panel(4, 1, [0, -2, 4], 0xff9050, 2.2); // ground bounce
  panel(1.2, 4, [-6, 1, -2], 0xffffff, 3);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0.02);
  pm.dispose();
  bg.geometry.dispose();
  return rt.texture;
}
