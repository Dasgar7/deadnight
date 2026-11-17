import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export type VKind = "muscle" | "jeep" | "tank" | "heli";

export interface VDef {
  kind: VKind;
  name: string;
  blurb: string;
  hp: number;
  radius: number;
  price: number;
  maxSpeed: number;
  seat: THREE.Vector3; // driver position (local)
  camDist: number;
  camHeight: number;
  weapon: string;
}

export const VDEFS: Record<VKind, VDef> = {
  muscle: { kind: "muscle", name: "Interceptor GT", blurb: "Fast. Run them over.", hp: 420, radius: 1.0, price: 0, maxSpeed: 31, seat: new THREE.Vector3(0.38, 1.0, -0.15), camDist: 7.2, camHeight: 2.9, weapon: "Ram" },
  jeep: { kind: "jeep", name: "Scout Jeep", blurb: "Roof-mounted machine gun.", hp: 520, radius: 1.1, price: 600, maxSpeed: 23, seat: new THREE.Vector3(0.4, 1.1, -0.2), camDist: 7.8, camHeight: 3.2, weapon: "M2 Machine Gun" },
  tank: { kind: "tank", name: "M-9 Bulwark Tank", blurb: "120mm cannon + coaxial MG. Crushes everything.", hp: 1800, radius: 1.9, price: 2500, maxSpeed: 9.5, seat: new THREE.Vector3(0, 2.0, 0), camDist: 11, camHeight: 4.6, weapon: "120mm Cannon" },
  heli: { kind: "heli", name: "AH-7 Reaper Helicopter", blurb: "Rockets + chin gun. Owns the sky.", hp: 900, radius: 1.8, price: 3500, maxSpeed: 26, seat: new THREE.Vector3(0, 1.0, -1.4), camDist: 14, camHeight: 4.5, weapon: "Rockets / Chin Gun" },
};

/* ------------------------------------------------------------------ *
 *  Procedural paint / track textures
 * ------------------------------------------------------------------ */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const texCache = new Map<string, THREE.CanvasTexture>();
function paintTex(key: string, base: [number, number, number], seed: number, camo: [number, number, number][] | null, rust = 0.5): THREE.CanvasTexture {
  const hit = texCache.get(key);
  if (hit) return hit;
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  const R = rng(seed);
  g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
  g.fillRect(0, 0, S, S);
  if (camo) {
    for (let i = 0; i < 46; i++) {
      const col = camo[(R() * camo.length) | 0];
      g.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
      g.beginPath();
      const cx = R() * S;
      const cy = R() * S;
      const n = 7;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const rr = 14 + R() * 34;
        const x = cx + Math.cos(a) * rr * 1.6;
        const y = cy + Math.sin(a) * rr * 0.9;
        k ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.closePath();
      g.fill();
    }
  }
  // fine grain
  for (let i = 0; i < 2600; i++) {
    const v = (R() - 0.5) * 44;
    g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 200})`;
    g.fillRect(R() * S, R() * S, 1 + R() * 2, 1 + R() * 2);
  }
  // rust blooms + chips
  for (let i = 0; i < 24 * rust; i++) {
    const x = R() * S;
    const y = R() * S;
    const r = 4 + R() * 16;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, "rgba(110,52,22,0.55)");
    gr.addColorStop(0.6, "rgba(90,45,24,0.25)");
    gr.addColorStop(1, "rgba(90,45,24,0)");
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // scratches
  g.lineWidth = 0.7;
  for (let i = 0; i < 46; i++) {
    g.strokeStyle = `rgba(${R() > 0.5 ? "220,215,205" : "20,20,20"},${0.1 + R() * 0.25})`;
    g.beginPath();
    const x = R() * S;
    const y = R() * S;
    g.moveTo(x, y);
    g.lineTo(x + (R() - 0.5) * 60, y + (R() - 0.5) * 12);
    g.stroke();
  }
  // dirt streaks running down
  for (let i = 0; i < 30; i++) {
    const x = R() * S;
    const gr = g.createLinearGradient(0, 0, 0, S);
    gr.addColorStop(0, "rgba(30,24,18,0)");
    gr.addColorStop(1, "rgba(30,24,18,0.28)");
    g.fillStyle = gr;
    g.fillRect(x, 0, 1 + R() * 2, S);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

function trackTex(): THREE.CanvasTexture {
  const hit = texCache.get("track");
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#2a2724";
  g.fillRect(0, 0, 64, 128);
  const R = rng(4);
  for (let i = 0; i < 8; i++) {
    const y = i * 16;
    g.fillStyle = "#3a3632";
    g.fillRect(2, y + 1, 60, 12);
    g.fillStyle = "#16130f";
    g.fillRect(2, y + 13, 60, 3);
    g.fillStyle = "#4a443d";
    g.fillRect(6, y + 3, 52, 2);
    g.fillStyle = "#5a4a3a";
    g.fillRect(10 + R() * 30, y + 5, 8 + R() * 20, 3);
  }
  for (let i = 0; i < 300; i++) {
    g.fillStyle = `rgba(${90 + R() * 60},${70 + R() * 40},${50},${R() * 0.2})`;
    g.fillRect(R() * 64, R() * 128, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  texCache.set("track", t);
  return t;
}

const M = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
const shared = {
  rubber: M({ color: 0x131313, roughness: 0.9 }),
  chrome: M({ color: 0xdadde2, roughness: 0.15, metalness: 1 }),
  steel: M({ color: 0x5b5f64, roughness: 0.45, metalness: 0.85 }),
  dark: M({ color: 0x1b1c1e, roughness: 0.6, metalness: 0.5 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0x0c1a24, roughness: 0.06, metalness: 0.2, transparent: true, opacity: 0.74, clearcoat: 1 }),
  head: new THREE.MeshBasicMaterial({ color: 0xfff1c8 }),
  tail: new THREE.MeshBasicMaterial({ color: 0xff2a1a }),
  seat: M({ color: 0x2b2118, roughness: 0.9 }),
  gold: M({ color: 0xc2a04a, roughness: 0.3, metalness: 1 }),
};

/** Extrude a side profile (s = forward, h = up) across `width`, forward maps to -Z */
function profile(pts: [number, number][], width: number, bevel = 0.07): THREE.BufferGeometry {
  const sh = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  const depth = Math.max(0.02, width - bevel * 2);
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  g.rotateY(Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

/** Extrude a top-view outline (x = lateral, y = forward) upward by `height` */
function topExtrude(pts: [number, number][], height: number, bevel = 0.05): THREE.BufferGeometry {
  const sh = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  const depth = Math.max(0.02, height - bevel * 2);
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 8 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, bevel, 0);
  g.computeVertexNormals();
  return g;
}

function add<T extends THREE.Object3D>(parent: THREE.Object3D, o: T, x = 0, y = 0, z = 0): T {
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}
function M3(g: THREE.BufferGeometry, m: THREE.Material, shadow = true) {
  const o = new THREE.Mesh(g, m);
  o.castShadow = shadow;
  return o;
}

const wheelGeo = (() => {
  let tire: THREE.BufferGeometry | null = null;
  let rim: THREE.BufferGeometry | null = null;
  return (r: number, w: number) => {
    const pts = [
      new THREE.Vector2(r * 0.55, -w / 2),
      new THREE.Vector2(r * 0.92, -w / 2),
      new THREE.Vector2(r, -w * 0.38),
      new THREE.Vector2(r, w * 0.38),
      new THREE.Vector2(r * 0.92, w / 2),
      new THREE.Vector2(r * 0.55, w / 2),
    ];
    tire = new THREE.LatheGeometry(pts, 20);
    tire.rotateZ(Math.PI / 2);
    rim = new THREE.CylinderGeometry(r * 0.58, r * 0.58, w * 0.9, 16);
    rim.rotateZ(Math.PI / 2);
    return { tire, rim };
  };
})();

function wheel(r: number, w: number, hubMat: THREE.Material = shared.chrome): THREE.Group {
  const g = new THREE.Group();
  const { tire, rim } = wheelGeo(r, w);
  g.add(M3(tire, shared.rubber));
  g.add(M3(rim, hubMat, false));
  for (let i = 0; i < 5; i++) {
    const sp = M3(new THREE.BoxGeometry(w * 0.5, r * 0.07, r * 0.5), shared.dark, false);
    sp.rotation.x = (i / 5) * Math.PI * 2;
    sp.position.set(w * 0.04, 0, 0);
    g.add(sp);
  }
  const cap = M3(new THREE.CylinderGeometry(r * 0.12, r * 0.12, w * 1.0, 10), shared.steel, false);
  cap.rotation.z = Math.PI / 2;
  g.add(cap);
  return g;
}

export interface VParts {
  wheels: { g: THREE.Object3D; front: boolean; steerPivot?: THREE.Object3D; spin: THREE.Object3D }[];
  turret?: THREE.Object3D; // rotates about Y
  gun?: THREE.Object3D; // pitch about X
  muzzle?: THREE.Object3D;
  muzzle2?: THREE.Object3D;
  rotor?: THREE.Object3D;
  rotorBlur?: THREE.Mesh;
  tailRotor?: THREE.Object3D;
  tracks: THREE.Texture[];
  lights: THREE.Object3D[];
  blink: THREE.Mesh[];
  minigun?: THREE.Object3D;
  body?: THREE.Object3D;
  smokeAt: THREE.Vector3;
}

export interface VModel {
  group: THREE.Group;
  parts: VParts;
}

/* ------------------------------------------------------------------ *
 *  MUSCLE CAR
 * ------------------------------------------------------------------ */
function buildMuscle(shadows: boolean, variant: number): VModel {
  const colors: [number, number, number][] = [[128, 26, 24], [26, 58, 96], [214, 150, 28], [32, 34, 36]];
  const base = colors[variant % colors.length];
  const paint = M({ map: paintTex(`muscle${variant % 4}`, base, 20 + variant, null, 0.7), roughness: 0.42, metalness: 0.55 });
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const parts: VParts = { wheels: [], tracks: [], lights: [], blink: [], body, smokeAt: new THREE.Vector3(0, 1.0, -2.0) };

  const lower = M3(
    profile([[-2.3, 0.4], [-2.36, 0.64], [-2.3, 0.94], [-1.5, 1.0], [-0.6, 1.0], [0.5, 0.99], [1.4, 0.93], [2.0, 0.84], [2.32, 0.7], [2.36, 0.52], [2.2, 0.4], [1.7, 0.3], [-1.7, 0.3]], 1.86, 0.1),
    paint,
    shadows,
  );
  body.add(lower);
  // hood bulge and scoop
  const hood = M3(profile([[0.55, 0.98], [1.1, 1.08], [1.7, 1.0], [1.75, 0.96]], 0.7, 0.04), paint, false);
  body.add(hood);
  const scoop = M3(profile([[0.8, 1.04], [1.05, 1.17], [1.35, 1.12], [1.4, 1.04]], 0.5, 0.03), shared.dark, false);
  body.add(scoop);
  // greenhouse
  const glassMesh = M3(profile([[-1.28, 0.98], [-0.98, 1.5], [-0.05, 1.56], [0.55, 1.52], [1.0, 0.98]], 1.62, 0.05), shared.glass, false);
  body.add(glassMesh);
  const roof = M3(profile([[-1.0, 1.5], [-0.9, 1.58], [0.3, 1.6], [0.52, 1.56], [0.56, 1.5]], 1.68, 0.04), paint, shadows);
  body.add(roof);
  // pillars
  for (const sx of [-1, 1]) {
    const p1 = M3(new THREE.CapsuleGeometry(0.035, 0.7, 3, 8), paint, false);
    p1.position.set(sx * 0.8, 1.24, -0.88);
    p1.rotation.x = 0.6;
    body.add(p1);
    const p2 = M3(new THREE.CapsuleGeometry(0.04, 0.55, 3, 8), paint, false);
    p2.position.set(sx * 0.8, 1.26, 0.62);
    p2.rotation.x = -0.55;
    body.add(p2);
    const bp = M3(new THREE.CapsuleGeometry(0.03, 0.5, 3, 8), paint, false);
    bp.position.set(sx * 0.82, 1.27, -0.15);
    body.add(bp);
    // wing mirror
    add(body, M3(new THREE.SphereGeometry(0.1, 10, 8), paint, false), sx * 1.0, 1.08, -0.78).scale.set(0.6, 0.8, 1.1);
    // door seam + handle
    add(body, M3(new THREE.CapsuleGeometry(0.015, 0.14, 2, 6), shared.chrome, false), sx * 0.94, 0.9, 0.02).rotation.x = Math.PI / 2;
    add(body, M3(new THREE.BoxGeometry(0.006, 0.6, 0.01), shared.dark, false), sx * 0.935, 0.68, -0.72);
    add(body, M3(new THREE.BoxGeometry(0.006, 0.6, 0.01), shared.dark, false), sx * 0.935, 0.68, 0.78);
    // side exhaust pipes
    const ex = M3(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 10), shared.chrome, false);
    ex.rotation.x = Math.PI / 2;
    add(body, ex, sx * 0.96, 0.34, 0.2);
  }
  // bumpers
  const bumpF = M3(new THREE.CapsuleGeometry(0.07, 1.6, 4, 10), shared.chrome, false);
  bumpF.rotation.z = Math.PI / 2;
  add(body, bumpF, 0, 0.48, -2.38);
  const bumpR = bumpF.clone();
  add(body, bumpR, 0, 0.5, 2.33);
  // grille
  const grille = M3(new THREE.BoxGeometry(1.0, 0.2, 0.05), shared.dark, false);
  add(body, grille, 0, 0.64, -2.35);
  for (let i = 0; i < 4; i++) add(body, M3(new THREE.BoxGeometry(1.0, 0.012, 0.06), shared.chrome, false), 0, 0.57 + i * 0.05, -2.36);
  // headlights & taillights
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), shared.head);
    hl.scale.set(1, 0.8, 0.5);
    add(body, hl, sx * 0.7, 0.8, -2.3);
    add(body, M3(new THREE.TorusGeometry(0.15, 0.02, 6, 16), shared.chrome, false), sx * 0.7, 0.8, -2.31).scale.set(1, 0.8, 1);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.05), shared.tail);
    add(body, tl, sx * 0.62, 0.86, 2.32);
    parts.lights.push(hl);
  }
  // plates
  add(body, M3(new THREE.BoxGeometry(0.4, 0.14, 0.01), M({ color: 0xe8e0c0, roughness: 0.6 }), false), 0, 0.65, 2.34);
  // spoiler
  const sp = M3(profile([[-0.15, 0], [-0.12, 0.05], [0.25, 0.04], [0.28, 0]], 1.5, 0.015), paint, false);
  add(body, sp, 0, 1.02, 2.15).rotation.y = 0;
  for (const sx of [-1, 1]) add(body, M3(new THREE.BoxGeometry(0.04, 0.12, 0.08), shared.dark, false), sx * 0.55, 0.96, 2.12);
  // seats + wheel + dash silhouettes
  for (const sx of [-1, 1]) {
    const seat = M3(new THREE.CapsuleGeometry(0.22, 0.28, 4, 8), shared.seat, false);
    seat.scale.set(1, 1, 0.5);
    add(body, seat, sx * 0.4, 1.12, 0.45).rotation.x = -0.15;
    add(body, M3(new THREE.CapsuleGeometry(0.2, 0.2, 4, 8), shared.seat, false), sx * 0.4, 0.88, 0.1).rotation.x = Math.PI / 2;
  }
  add(body, M3(new THREE.TorusGeometry(0.18, 0.02, 6, 16), shared.dark, false), 0.4, 1.2, -0.45).rotation.x = 1.0;
  // wheels
  for (const sx of [-1, 1])
    for (const sz of [-1.5, 1.5]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.9, 0.38, sz);
      const w = wheel(0.38, sz < 0 ? 0.26 : 0.3);
      pivot.add(w);
      g.add(pivot);
      parts.wheels.push({ g: pivot, front: sz < 0, steerPivot: pivot, spin: w });
    }
  void shadows;
  return { group: g, parts };
}

/* ------------------------------------------------------------------ *
 *  SCOUT JEEP (with pintle machine gun)
 * ------------------------------------------------------------------ */
function buildJeep(shadows: boolean, variant: number): VModel {
  const paint = M({ map: paintTex(`jeep${variant % 2}`, variant % 2 ? [92, 90, 62] : [70, 84, 58], 61 + variant, [[84, 98, 66], [58, 66, 46], [96, 88, 62]], 0.9), roughness: 0.7, metalness: 0.3 });
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const parts: VParts = { wheels: [], tracks: [], lights: [], blink: [], body, smokeAt: new THREE.Vector3(0, 1.0, -1.9) };
  // tub
  body.add(M3(profile([[-2.0, 0.55], [-2.02, 1.0], [-1.0, 1.08], [-0.6, 1.1], [0.2, 1.05], [0.3, 0.98], [1.0, 0.98], [1.5, 1.02], [1.85, 0.9], [1.95, 0.66], [1.8, 0.5], [1.2, 0.42], [-1.6, 0.42]], 1.82, 0.12), paint, shadows));
  // hood shape
  body.add(M3(profile([[0.4, 1.0], [0.55, 1.12], [1.7, 1.08], [1.78, 1.0]], 1.5, 0.07), paint, shadows));
  // fenders as rounded caps over wheels
  for (const sx of [-1, 1])
    for (const sz of [-1.2, 1.25]) {
      const f = M3(new THREE.TorusGeometry(0.5, 0.07, 8, 18, Math.PI), paint, false);
      f.position.set(sx * 0.92, 0.5, sz);
      f.rotation.y = Math.PI / 2;
      body.add(f);
      const fp = M3(new THREE.CapsuleGeometry(0.07, 0.75, 3, 8), paint, false);
      fp.rotation.x = Math.PI / 2;
      fp.position.set(sx * 0.93, 1.0, sz);
      body.add(fp);
    }
  // windscreen frame (folded flat look: open)
  const wf = new THREE.Group();
  wf.position.set(0, 1.06, -0.15);
  wf.rotation.x = -0.25;
  for (const sx of [-1, 1]) {
    const post = M3(new THREE.CapsuleGeometry(0.035, 0.56, 3, 8), paint, false);
    post.position.set(sx * 0.8, 0.28, 0);
    wf.add(post);
  }
  const top = M3(new THREE.CapsuleGeometry(0.035, 1.6, 3, 8), paint, false);
  top.rotation.z = Math.PI / 2;
  top.position.set(0, 0.58, 0);
  wf.add(top);
  const wg = M3(new THREE.PlaneGeometry(1.55, 0.52), shared.glass, false);
  wg.position.set(0, 0.3, 0);
  wf.add(wg);
  body.add(wf);
  // seats
  for (const sx of [-1, 1]) {
    const seat = M3(new THREE.CapsuleGeometry(0.22, 0.3, 4, 8), shared.seat, false);
    seat.scale.set(1, 1, 0.55);
    add(body, seat, sx * 0.42, 1.22, 0.5).rotation.x = -0.15;
    add(body, M3(new THREE.CapsuleGeometry(0.2, 0.22, 4, 8), shared.seat, false), sx * 0.42, 0.98, 0.15).rotation.x = Math.PI / 2;
  }
  // roll bar
  const rb = new THREE.Group();
  for (const sx of [-1, 1]) {
    const leg = M3(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 8), shared.steel, false);
    add(rb, leg, sx * 0.8, 0.55, 0);
  }
  const bar = M3(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 8), shared.steel, false);
  bar.rotation.z = Math.PI / 2;
  add(rb, bar, 0, 1.1, 0);
  const diag = M3(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 8), shared.steel, false);
  diag.rotation.z = 1.1;
  add(rb, diag, 0, 0.62, 0);
  rb.position.set(0, 1.0, 0.75);
  body.add(rb);
  // grille, bumper, lights
  add(body, M3(new THREE.BoxGeometry(1.2, 0.5, 0.06), shared.dark, false), 0, 0.82, -1.96);
  for (let i = 0; i < 7; i++) add(body, M3(new THREE.CapsuleGeometry(0.012, 0.44, 2, 6), shared.steel, false), -0.48 + i * 0.16, 0.82, -1.99);
  const bump = M3(new THREE.CapsuleGeometry(0.09, 1.7, 4, 8), shared.steel, false);
  bump.rotation.z = Math.PI / 2;
  add(body, bump, 0, 0.45, -2.02);
  // winch
  add(body, M3(new THREE.CylinderGeometry(0.1, 0.1, 0.4, 12), shared.dark, false), 0, 0.43, -2.1).rotation.z = Math.PI / 2;
  for (const sx of [-1, 1]) {
    const hl = M3(new THREE.CylinderGeometry(0.14, 0.14, 0.1, 14), shared.head, false);
    hl.rotation.x = Math.PI / 2;
    add(body, hl, sx * 0.66, 0.96, -1.95);
    add(body, M3(new THREE.TorusGeometry(0.15, 0.025, 6, 16), shared.steel, false), sx * 0.66, 0.96, -1.97);
    parts.lights.push(hl);
    add(body, new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.04), shared.tail), sx * 0.68, 0.9, 2.0);
  }
  // jerry cans + spare tyre on the back
  const can = M3(new RoundedBoxGeometry(0.3, 0.45, 0.14, 2, 0.04), M({ color: 0x70542a, roughness: 0.7, metalness: 0.3 }), false);
  add(body, can, -0.6, 1.0, 1.1);
  add(body, can.clone(), -0.9, 1.0, 1.1);
  const spare = wheel(0.4, 0.28, paint);
  spare.rotation.z = Math.PI / 2;
  spare.rotation.y = Math.PI / 2;
  spare.rotation.set(Math.PI / 2, 0, 0);
  add(body, spare, 0.4, 1.0, 2.15).rotation.set(Math.PI / 2, 0, Math.PI / 2);
  // antenna
  const ant = M3(new THREE.CylinderGeometry(0.008, 0.015, 2.2, 6), shared.dark, false);
  add(body, ant, -0.85, 2.0, 1.9).rotation.x = 0.1;
  // pintle MG turret (rotates with aim)
  const turret = new THREE.Group();
  turret.position.set(0, 1.1, 0.78);
  const ring = M3(new THREE.TorusGeometry(0.34, 0.035, 8, 20), shared.steel, false);
  ring.rotation.x = Math.PI / 2;
  turret.add(ring);
  const post = M3(new THREE.CylinderGeometry(0.05, 0.07, 0.6, 10), shared.steel, false);
  add(turret, post, 0, 0.3, 0);
  const gun = new THREE.Group();
  gun.position.set(0, 0.7, 0);
  const rec = M3(new RoundedBoxGeometry(0.18, 0.2, 0.7, 3, 0.05), shared.dark, false);
  add(gun, rec, 0, 0, -0.1);
  const bar2 = M3(new THREE.CylinderGeometry(0.035, 0.04, 1.1, 10), shared.steel, false);
  bar2.rotation.x = Math.PI / 2;
  add(gun, bar2, 0, 0.02, -0.8);
  const jacket = M3(new THREE.CylinderGeometry(0.07, 0.07, 0.6, 12), shared.dark, false);
  jacket.rotation.x = Math.PI / 2;
  add(gun, jacket, 0, 0.02, -0.55);
  const brake = M3(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 10), shared.steel, false);
  brake.rotation.x = Math.PI / 2;
  add(gun, brake, 0, 0.02, -1.4);
  const ammoBox = M3(new RoundedBoxGeometry(0.22, 0.28, 0.34, 2, 0.03), M({ color: 0x4e5a3a, roughness: 0.7 }), false);
  add(gun, ammoBox, 0.26, -0.12, -0.05);
  const shield = M3(new THREE.CylinderGeometry(0.4, 0.4, 0.5, 14, 1, true, -1.2, 2.4), paint, false);
  shield.position.set(0, 0.5, -0.45);
  shield.rotation.y = Math.PI;
  turret.add(shield);
  turret.add(gun);
  body.add(turret);
  parts.turret = turret;
  parts.gun = gun;
  const mz = new THREE.Object3D();
  mz.position.set(0, 0.02, -1.5);
  gun.add(mz);
  parts.muzzle = mz;
  // wheels
  for (const sx of [-1, 1])
    for (const sz of [-1.2, 1.25]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.98, 0.46, sz);
      const w = wheel(0.46, 0.34, paint);
      pivot.add(w);
      g.add(pivot);
      parts.wheels.push({ g: pivot, front: sz < 0, steerPivot: pivot, spin: w });
    }
  return { group: g, parts };
}

/* ------------------------------------------------------------------ *
 *  TANK
 * ------------------------------------------------------------------ */
function buildTank(shadows: boolean): VModel {
  const paint = M({ map: paintTex("tank", [74, 80, 56], 77, [[88, 92, 64], [52, 58, 42], [102, 90, 66], [40, 42, 34]], 1), roughness: 0.78, metalness: 0.3 });
  const g = new THREE.Group();
  const parts: VParts = { wheels: [], tracks: [], lights: [], blink: [], smokeAt: new THREE.Vector3(0, 2.4, 3.2) };
  // hull
  g.add(M3(profile([[-3.3, 0.7], [-3.3, 1.55], [-2.6, 1.8], [1.5, 1.82], [3.1, 1.28], [3.3, 1.0], [3.0, 0.7]], 2.3, 0.1), paint, shadows));
  // glacis plate detail + driver hatch
  add(g, M3(new THREE.CylinderGeometry(0.34, 0.36, 0.14, 16), paint, false), 0.0, 1.92, -1.9);
  add(g, M3(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 12), shared.dark, false), 0.0, 2.0, -1.9);
  // headlights on mudguards
  for (const sx of [-1, 1]) {
    const hl = M3(new THREE.CylinderGeometry(0.14, 0.14, 0.1, 12), shared.head, false);
    hl.rotation.x = Math.PI / 2;
    add(g, hl, sx * 0.85, 1.55, -3.1);
    parts.lights.push(hl);
  }
  // tracks
  const tt = trackTex();
  for (const sx of [-1, 1]) {
    const tex = tt.clone();
    tex.needsUpdate = true;
    tex.repeat.set(1, 12);
    parts.tracks.push(tex);
    const tm = M({ map: tex, roughness: 0.95, metalness: 0.3 });
    const trk = new THREE.Group();
    trk.position.set(sx * 1.45, 0, 0);
    // belt: stadium shape extruded across
    const stad = profile([[-3.0, 0.62], [-2.5, 1.12], [2.5, 1.12], [3.15, 0.84], [3.15, 0.5], [2.6, 0.04], [-2.6, 0.04], [-3.15, 0.5]], 0.8, 0.05);
    trk.add(M3(stad, tm, shadows));
    // road wheels
    for (let i = 0; i < 6; i++) {
      const z = -2.4 + i * 0.96;
      const rw = new THREE.Group();
      rw.position.set(sx * 0.42, 0.52, z);
      const hub = M3(new THREE.CylinderGeometry(0.4, 0.4, 0.14, 18), shared.steel, false);
      hub.rotation.z = Math.PI / 2;
      rw.add(hub);
      const tire = M3(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 18), shared.rubber, false);
      tire.rotation.z = Math.PI / 2;
      tire.position.x = sx * 0.08;
      rw.add(tire);
      const cap = M3(new THREE.CylinderGeometry(0.11, 0.11, 0.18, 8), paint, false);
      cap.rotation.z = Math.PI / 2;
      rw.add(cap);
      trk.add(rw);
      parts.wheels.push({ g: rw, front: false, spin: rw });
    }
    // sprocket + idler
    for (const z of [-2.95, 3.0]) {
      const sp = M3(new THREE.CylinderGeometry(0.46, 0.46, 0.16, 14), shared.steel, false);
      sp.rotation.z = Math.PI / 2;
      add(trk, sp, sx * 0.42, 0.66, z);
      parts.wheels.push({ g: sp, front: false, spin: sp });
    }
    // side skirt + mud guard
    const sk = M3(new RoundedBoxGeometry(0.07, 0.56, 5.8, 2, 0.02), paint, false);
    add(trk, sk, sx * 0.45, 1.24, 0.2);
    const fl = M3(new RoundedBoxGeometry(0.88, 0.07, 1.2, 2, 0.02), paint, false);
    add(trk, fl, 0, 1.52, -2.85);
    add(trk, fl.clone(), 0, 1.52, 2.85);
    // stowage: spare track links + jerry can
    const crate = M3(new RoundedBoxGeometry(0.42, 0.34, 0.9, 2, 0.04), M({ color: 0x4a4e36, roughness: 0.8 }), false);
    add(trk, crate, sx * 0.1, 1.75, 1.8);
    g.add(trk);
  }
  // rear deck: engine grille
  for (let i = 0; i < 6; i++) add(g, M3(new THREE.BoxGeometry(1.6, 0.03, 0.08), shared.dark, false), 0, 1.85, 1.9 + i * 0.22);
  const exhaust = M3(new THREE.CylinderGeometry(0.1, 0.12, 0.5, 10), shared.dark, false);
  exhaust.rotation.z = Math.PI / 2;
  add(g, exhaust, 0.95, 1.5, 3.4);
  // tow cables
  for (const sx of [-1, 1]) {
    const cab = M3(new THREE.TorusGeometry(0.14, 0.02, 6, 14), shared.steel, false);
    add(g, cab, sx * 0.5, 1.2, -3.32);
  }
  // turret
  const turret = new THREE.Group();
  turret.position.set(0, 1.8, 0.3);
  g.add(turret);
  const tShape: [number, number][] = [[-0.55, -1.55], [0.55, -1.55], [1.1, -0.9], [1.35, 0.2], [1.1, 1.05], [0.55, 1.5], [-0.55, 1.5], [-1.1, 1.05], [-1.35, 0.2], [-1.1, -0.9]];
  // forward = -z; topExtrude's y maps to -z, so mirror y
  const tm = topExtrude(tShape.map(([x, y]) => [x, -y] as [number, number]), 0.82, 0.12);
  turret.add(M3(tm, paint, shadows));
  // turret roof detail
  const cup = new THREE.Group();
  cup.position.set(-0.55, 0.88, 0.45);
  cup.add(M3(new THREE.CylinderGeometry(0.32, 0.35, 0.22, 16), paint, false));
  const hatch = M3(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 14), paint, false);
  hatch.position.set(0, 0.18, 0);
  cup.add(hatch);
  for (let i = 0; i < 8; i++) {
    const vp = M3(new THREE.BoxGeometry(0.1, 0.07, 0.04), shared.glass, false);
    const a = (i / 8) * Math.PI * 2;
    vp.position.set(Math.sin(a) * 0.33, 0.08, Math.cos(a) * 0.33);
    vp.rotation.y = a;
    cup.add(vp);
  }
  turret.add(cup);
  // loader hatch + sight box
  add(turret, M3(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 14), paint, false), 0.55, 0.86, 0.7);
  add(turret, M3(new RoundedBoxGeometry(0.4, 0.34, 0.5, 3, 0.07), paint, false), 0.5, 0.95, -0.7);
  add(turret, M3(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 10), shared.glass, false), 0.5, 1.0, -0.96).rotation.x = Math.PI / 2;
  // smoke dischargers
  for (const sx of [-1, 1])
    for (let i = 0; i < 3; i++) {
      const sd = M3(new THREE.CylinderGeometry(0.045, 0.045, 0.22, 8), shared.dark, false);
      sd.rotation.set(0.6, 0, -sx * 0.4);
      add(turret, sd, sx * 1.25, 0.55, -0.6 + i * 0.16);
    }
  // bustle rack
  add(turret, M3(new RoundedBoxGeometry(1.9, 0.5, 0.5, 3, 0.08), paint, false), 0, 0.42, 1.65);
  // mantlet + gun
  const mant = M3(new THREE.SphereGeometry(0.46, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), paint, shadows);
  mant.rotation.x = -Math.PI / 2;
  mant.scale.set(1.2, 1, 0.8);
  add(turret, mant, 0, 0.45, -1.5);
  const gun = new THREE.Group();
  gun.position.set(0, 0.45, -1.7);
  turret.add(gun);
  const barrel = M3(new THREE.CylinderGeometry(0.1, 0.12, 4.6, 16), shared.steel, shadows);
  barrel.rotation.x = Math.PI / 2;
  add(gun, barrel, 0, 0, -2.2);
  const extractor = M3(new THREE.CylinderGeometry(0.17, 0.17, 0.7, 14), shared.steel, false);
  extractor.rotation.x = Math.PI / 2;
  add(gun, extractor, 0, 0, -3.0);
  const thermal = M3(new THREE.CylinderGeometry(0.13, 0.13, 1.5, 12), paint, false);
  thermal.rotation.x = Math.PI / 2;
  add(gun, thermal, 0, 0, -1.0);
  const brake = M3(new THREE.CylinderGeometry(0.16, 0.16, 0.42, 14), shared.dark, false);
  brake.rotation.x = Math.PI / 2;
  add(gun, brake, 0, 0, -4.45);
  for (let i = 0; i < 3; i++) add(gun, M3(new THREE.CylinderGeometry(0.175, 0.175, 0.04, 14), shared.steel, false), 0, 0, -4.32 - i * 0.11).rotation.x = Math.PI / 2;
  // coax MG
  const coax = M3(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8), shared.dark, false);
  coax.rotation.x = Math.PI / 2;
  add(gun, coax, 0.28, -0.05, -0.9);
  const mz = new THREE.Object3D();
  mz.position.set(0, 0, -4.7);
  gun.add(mz);
  // commander MG on cupola
  const cmg = M3(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8), shared.dark, false);
  cmg.rotation.x = Math.PI / 2;
  add(cup, cmg, 0.1, 0.4, -0.3);
  add(cup, M3(new RoundedBoxGeometry(0.1, 0.12, 0.3, 2, 0.03), shared.dark, false), 0.1, 0.4, 0.05);
  // antenna
  const ant = M3(new THREE.CylinderGeometry(0.01, 0.02, 2.6, 6), shared.dark, false);
  add(turret, ant, 0.95, 1.9, 1.5);
  parts.turret = turret;
  parts.gun = gun;
  parts.muzzle = mz;
  const mz2 = new THREE.Object3D();
  mz2.position.set(0.28, -0.05, -1.4);
  gun.add(mz2);
  parts.muzzle2 = mz2;
  return { group: g, parts };
}

/* ------------------------------------------------------------------ *
 *  HELICOPTER
 * ------------------------------------------------------------------ */
function buildHeli(shadows: boolean): VModel {
  const paint = M({ map: paintTex("heli", [58, 66, 56], 91, [[70, 78, 62], [46, 54, 46], [88, 90, 74]], 0.5), roughness: 0.5, metalness: 0.5 });
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const parts: VParts = { wheels: [], tracks: [], lights: [], blink: [], body, smokeAt: new THREE.Vector3(0, 0.8, 2.0) };
  // fuselage (lathe around Z)
  const prof: THREE.Vector2[] = [];
  const pts: [number, number][] = [[0, -2.9], [0.3, -2.8], [0.6, -2.5], [0.85, -2.0], [1.0, -1.2], [1.08, -0.2], [1.02, 0.8], [0.85, 1.7], [0.6, 2.4], [0.38, 3.0], [0.3, 3.4]];
  pts.forEach(([r, z]) => prof.push(new THREE.Vector2(r, z)));
  const fus = new THREE.LatheGeometry(prof, 28);
  fus.rotateX(Math.PI / 2);
  fus.scale(0.88, 1.05, 1);
  fus.computeVertexNormals();
  const fusM = M3(fus, paint, shadows);
  body.add(fusM);
  // glass canopy (front-top)
  const can = new THREE.SphereGeometry(0.98, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const canopy = M3(can, shared.glass, false);
  canopy.scale.set(0.88, 0.8, 1.45);
  canopy.position.set(0, 0.28, -1.5);
  body.add(canopy);
  // canopy frames
  for (const a of [-0.65, 0, 0.65]) {
    const fr = M3(new THREE.TorusGeometry(0.9, 0.025, 6, 20, Math.PI), paint, false);
    fr.position.set(0, 0.28, -1.5 + a * 1.1);
    fr.scale.set(0.95, 0.85, 1);
    body.add(fr);
  }
  // pilot seats silhouettes
  for (const z of [-1.9, -0.8]) {
    const seat = M3(new THREE.CapsuleGeometry(0.2, 0.3, 4, 8), shared.seat, false);
    seat.scale.set(1, 1, 0.5);
    add(body, seat, 0, 0.12, z + 0.3);
  }
  // nose sensor ball
  add(body, M3(new THREE.SphereGeometry(0.22, 14, 12), shared.dark, false), 0, -0.55, -2.45);
  add(body, M3(new THREE.SphereGeometry(0.1, 10, 8), shared.glass, false), 0, -0.55, -2.62);
  // engine hump + intakes
  const hump = M3(new THREE.CapsuleGeometry(0.42, 1.4, 6, 14), paint, shadows);
  hump.rotation.x = Math.PI / 2;
  hump.scale.set(1, 1, 0.8);
  add(body, hump, 0, 1.1, 0.95);
  for (const sx of [-1, 1]) {
    add(body, M3(new THREE.CylinderGeometry(0.2, 0.26, 0.5, 14), shared.dark, false), sx * 0.5, 1.0, 0.0).rotation.x = Math.PI / 2 - 0.2;
    const ex = M3(new THREE.CylinderGeometry(0.17, 0.2, 0.55, 12), shared.dark, false);
    ex.rotation.x = Math.PI / 2;
    add(body, ex, sx * 0.3, 1.15, 1.9);
  }
  // tail boom
  const boom = M3(new THREE.CylinderGeometry(0.13, 0.28, 3.4, 14), paint, shadows);
  boom.rotation.x = Math.PI / 2;
  add(body, boom, 0, 0.25, 4.5);
  // tail fin + stabilizers
  const fin = M3(profile([[-0.1, 0], [0.7, 0], [0.45, 1.5], [0.2, 1.6], [0.0, 1.3]], 0.1, 0.02), paint, false);
  fin.rotation.y = Math.PI / 2;
  add(body, fin, 0, 0.28, 6.0).rotation.y = 0;
  const stab = M3(new RoundedBoxGeometry(1.8, 0.05, 0.5, 2, 0.02), paint, false);
  add(body, stab, 0, 0.35, 5.9);
  // tail rotor
  const tr = new THREE.Group();
  tr.position.set(0.18, 1.1, 6.15);
  for (let i = 0; i < 2; i++) {
    const bl = M3(new THREE.CapsuleGeometry(0.03, 0.9, 3, 6), shared.dark, false);
    bl.rotation.z = i * (Math.PI / 2);
    tr.add(bl);
  }
  add(tr, M3(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 8), shared.steel, false), 0, 0, 0).rotation.z = Math.PI / 2;
  body.add(tr);
  parts.tailRotor = tr;
  // mast + main rotor
  add(body, M3(new THREE.CylinderGeometry(0.1, 0.14, 0.7, 12), shared.steel, false), 0, 1.65, 0.6);
  const rotor = new THREE.Group();
  rotor.position.set(0, 2.05, 0.6);
  add(rotor, M3(new THREE.CylinderGeometry(0.2, 0.25, 0.18, 14), shared.dark, false), 0, 0, 0);
  for (let i = 0; i < 4; i++) {
    const blade = M3(profile([[0.1, 0], [0.2, 0.02], [5.4, 0.015], [5.55, 0], [5.4, -0.015], [0.2, -0.02]], 0.32, 0.005), shared.dark, false);
    const arm = new THREE.Group();
    arm.add(blade);
    arm.rotation.y = (i / 4) * Math.PI * 2;
    // profile's forward (s) maps to -Z; fine, rotate in the group
    blade.rotation.set(0, 0, 0);
    rotor.add(arm);
    // tip stripe
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.4), M({ color: 0xe0c030, roughness: 0.6 }));
    tip.position.set(0, 0.0, -5.2);
    arm.add(tip);
  }
  body.add(rotor);
  parts.rotor = rotor;
  const blurMat = new THREE.MeshBasicMaterial({ color: 0x8a8f90, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const blur = new THREE.Mesh(new THREE.CircleGeometry(5.5, 40), blurMat);
  blur.rotation.x = -Math.PI / 2;
  blur.position.set(0, 2.06, 0.6);
  body.add(blur);
  parts.rotorBlur = blur;
  // stub wings + rocket pods
  for (const sx of [-1, 1]) {
    const wing = M3(new RoundedBoxGeometry(1.8, 0.1, 0.6, 2, 0.03), paint, shadows);
    add(body, wing, sx * 1.5, 0.1, 0.3);
    const pod = new THREE.Group();
    pod.position.set(sx * 1.95, -0.1, 0.2);
    const shell = M3(new THREE.CylinderGeometry(0.26, 0.26, 1.5, 14), paint, shadows);
    shell.rotation.x = Math.PI / 2;
    pod.add(shell);
    const nose = M3(new THREE.SphereGeometry(0.26, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), paint, false);
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = -0.75;
    pod.add(nose);
    for (let i = 0; i < 7; i++) {
      const a = i === 0 ? 0 : ((i - 1) / 6) * Math.PI * 2;
      const rr = i === 0 ? 0 : 0.14;
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.05, 10), M({ color: 0x050505 }));
      hole.position.set(Math.cos(a) * rr, Math.sin(a) * rr, -0.8);
      hole.rotation.y = Math.PI;
      pod.add(hole);
    }
    body.add(pod);
    // tip light
    const nav = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: sx < 0 ? 0xff2020 : 0x20ff40 }));
    add(body, nav, sx * 2.45, 0.1, 0.3);
    parts.blink.push(nav);
    // skid
    const skid = M3(new THREE.CapsuleGeometry(0.05, 3.4, 4, 10), shared.dark, false);
    skid.rotation.x = Math.PI / 2;
    add(body, skid, sx * 1.05, -1.1, -0.1);
    const front = M3(new THREE.TorusGeometry(0.35, 0.05, 8, 14, Math.PI / 2), shared.dark, false);
    front.rotation.set(0, Math.PI / 2, Math.PI);
    front.position.set(sx * 1.05, -0.75, -1.9);
    body.add(front);
    for (const z of [-0.9, 0.9]) {
      const strut = M3(new THREE.CapsuleGeometry(0.04, 0.8, 3, 8), shared.dark, false);
      strut.rotation.z = sx * 0.28;
      add(body, strut, sx * 0.95, -0.65, z);
    }
    // door line
    add(body, M3(new THREE.BoxGeometry(0.01, 0.55, 1.1), shared.dark, false), sx * 0.98, 0.0, -0.4);
  }
  // chin minigun
  const mg = new THREE.Group();
  mg.position.set(0, -0.9, -2.0);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const b = M3(new THREE.CylinderGeometry(0.018, 0.018, 0.8, 6), shared.steel, false);
    b.rotation.x = Math.PI / 2;
    add(mg, b, Math.cos(a) * 0.06, Math.sin(a) * 0.06, -0.4);
  }
  const mgb = M3(new THREE.CylinderGeometry(0.11, 0.13, 0.35, 12), shared.dark, false);
  mgb.rotation.x = Math.PI / 2;
  mg.add(mgb);
  body.add(mg);
  parts.minigun = mg;
  const mz = new THREE.Object3D();
  mz.position.set(0, 0, -0.85);
  mg.add(mz);
  parts.muzzle = mz;
  const mzL = new THREE.Object3D();
  mzL.position.set(-1.95, -0.1, -0.9);
  body.add(mzL);
  const mzR = new THREE.Object3D();
  mzR.position.set(1.95, -0.1, -0.9);
  body.add(mzR);
  parts.muzzle2 = mzL;
  (parts as unknown as { muzzleR: THREE.Object3D }).muzzleR = mzR;
  // landing lamp
  const lamp = M3(new THREE.SphereGeometry(0.12, 10, 8), shared.head, false);
  add(body, lamp, 0, -0.75, -2.2);
  parts.lights.push(lamp);
  return { group: g, parts };
}

export function buildVehicleModel(kind: VKind, shadows: boolean, variant = 0): VModel {
  const m = kind === "muscle" ? buildMuscle(shadows, variant) : kind === "jeep" ? buildJeep(shadows, variant) : kind === "tank" ? buildTank(shadows) : buildHeli(shadows);
  m.group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).receiveShadow = false;
  });
  return m;
}

/* ------------------------------------------------------------------ *
 *  Runtime state
 * ------------------------------------------------------------------ */
export interface Vehicle {
  id: number;
  kind: VKind;
  def: VDef;
  model: VModel;
  group: THREE.Group;
  x: number;
  y: number;
  z: number;
  yaw: number;
  vx: number;
  vy: number;
  vz: number;
  hp: number;
  alive: boolean;
  respawn: number;
  unlocked: boolean;
  home: { x: number; z: number; yaw: number };
  driver: boolean;
  steer: number;
  spin: number; // wheel spin accumulated
  rotorSpeed: number;
  aimYaw: number; // turret world yaw
  aimPitch: number;
  fireCd: number;
  altCd: number;
  ammo: number;
  tilt: number; // heli pitch visual
  bank: number;
  fireHeld: number;
  smokeT: number;
  remote: boolean;
  variant: number;
}

let vid = 1;
export function makeVehicle(kind: VKind, x: number, z: number, yaw: number, shadows: boolean, variant = 0): Vehicle {
  const model = buildVehicleModel(kind, shadows, variant);
  const def = VDEFS[kind];
  const v: Vehicle = {
    id: vid++,
    kind,
    def,
    model,
    group: model.group,
    x,
    y: 0,
    z,
    yaw,
    vx: 0,
    vy: 0,
    vz: 0,
    hp: def.hp,
    alive: true,
    respawn: 0,
    unlocked: def.price === 0,
    home: { x, z, yaw },
    driver: false,
    steer: 0,
    spin: 0,
    rotorSpeed: 0,
    aimYaw: yaw,
    aimPitch: 0,
    fireCd: 0,
    altCd: 0,
    ammo: 0,
    tilt: 0,
    bank: 0,
    fireHeld: 0,
    smokeT: 0,
    remote: false,
    variant,
  };
  model.group.position.set(x, 0, z);
  model.group.rotation.y = yaw;
  return v;
}

export function fwd(yaw: number, out = { x: 0, z: 0 }) {
  out.x = -Math.sin(yaw);
  out.z = -Math.cos(yaw);
  return out;
}
