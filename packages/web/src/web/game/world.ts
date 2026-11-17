import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { makeSign, tex } from "./assets";
import { MAP_HALF, PERKS, W } from "./config";

export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  top: number;
  y0?: number;
}

export type InteractKind = "weapon" | "ammo" | "medkit" | "armor" | "perk";
export interface Interactable {
  kind: InteractKind;
  ref: string;
  x: number;
  z: number;
  price: number;
  name: string;
}

export interface Pad {
  kind: "muscle" | "jeep" | "tank" | "heli";
  x: number;
  z: number;
  yaw: number;
}

export interface World {
  pads: Pad[];
  group: THREE.Group;
  boxes: Box[];
  interactables: Interactable[];
  spawns: { x: number; z: number }[];
  fires: { light: THREE.PointLight; base: number; phase: number; x: number; z: number }[];
  update(t: number): void;
}

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildWorld(shadows: boolean, mobile: boolean): World {
  const group = new THREE.Group();
  const boxes: Box[] = [];
  const interactables: Interactable[] = [];
  const fires: World["fires"] = [];
  const rand = rng(1337);
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0.05, ...o });

  // ---------- ground ----------
  const dirtMat = std({ map: tex("dirt", 60, 60), color: 0x9a8f88 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), dirtMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = shadows;
  group.add(ground);
  const roadMat = (rx: number, ry: number) => std({ map: tex("asphalt", rx, ry), color: 0xb0aaa5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const roadH = new THREE.Mesh(new THREE.PlaneGeometry(2 * MAP_HALF, 12), roadMat(MAP_HALF / 3, 2));
  roadH.rotation.x = -Math.PI / 2;
  roadH.position.y = 0.02;
  roadH.receiveShadow = shadows;
  group.add(roadH);
  const roadV = new THREE.Mesh(new THREE.PlaneGeometry(12, 2 * MAP_HALF), roadMat(2, MAP_HALF / 3));
  roadV.rotation.x = -Math.PI / 2;
  roadV.position.y = 0.025;
  roadV.receiveShadow = shadows;
  group.add(roadV);
  // plaza
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), std({ map: tex("concrete", 5, 5), color: 0x8c8a88, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.03;
  plaza.receiveShadow = shadows;
  group.add(plaza);

  const addBox = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material | THREE.Material[], collide = true, cast = true, parent: THREE.Object3D = group) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = cast && shadows;
    m.receiveShadow = shadows;
    parent.add(m);
    if (collide) boxes.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, top: y + h / 2 });
    return m;
  };

  // ---------- perimeter ----------
  const wallMat = std({ map: tex("concrete", 40, 1), color: 0x9a9a98 });
  const wallMatV = std({ map: tex("concrete", 1, 1), color: 0x9a9a98 });
  const H = MAP_HALF;
  const wallH = 5;
  addBox(2 * H + 4, wallH, 2, 0, wallH / 2, -H - 1, wallMat);
  addBox(2 * H + 4, wallH, 2, 0, wallH / 2, H + 1, wallMat);
  addBox(2, wallH, 2 * H + 4, -H - 1, wallH / 2, 0, wallMatV);
  addBox(2, wallH, 2 * H + 4, H + 1, wallH / 2, 0, wallMatV);

  // ---------- buildings ----------
  const texCache = new Map<string, THREE.Material>();
  const facadeMat = (rx: number, ry: number, tint: number) => {
    const k = `${rx.toFixed(2)}|${ry.toFixed(2)}|${tint}`;
    let m = texCache.get(k);
    if (!m) {
      m = std({ map: tex("facade", rx, ry), color: tint });
      texCache.set(k, m);
    }
    return m;
  };
  const roofMat = std({ map: tex("concrete", 4, 4), color: 0x4a4a4a });
  const brickMat = (rx: number, ry: number) => std({ map: tex("brick", rx, ry), color: 0xb0a098 });
  const windowGlow = new THREE.MeshBasicMaterial({ color: 0xff9a3c });
  const building = (minX: number, maxX: number, minZ: number, maxZ: number, h: number, kind: "facade" | "brick", tint = 0xbbbbbb) => {
    const w = maxX - minX;
    const d = maxZ - minZ;
    const mk = (a: number, b: number) => (kind === "facade" ? facadeMat(a / 7, b / 7, tint) : brickMat(a / 6, b / 6));
    const mats = [mk(d, h), mk(d, h), roofMat, roofMat, mk(w, h), mk(w, h)];
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    addBox(w, h, d, cx, h / 2, cz, mats);
    // parapet
    addBox(w + 0.4, 0.5, d + 0.4, cx, h + 0.25, cz, roofMat, false);
    // lit windows
    for (let i = 0; i < 5; i++) {
      const onZ = rand() > 0.5;
      const ww = 1.2;
      const wh = 1.4;
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), windowGlow);
      const y = 2.5 + rand() * (h - 4);
      if (onZ) {
        const side = rand() > 0.5 ? 1 : -1;
        pl.position.set(minX + 2 + rand() * (w - 4), y, cz + side * (d / 2 + 0.03));
        pl.rotation.y = side > 0 ? 0 : Math.PI;
      } else {
        const side = rand() > 0.5 ? 1 : -1;
        pl.position.set(cx + side * (w / 2 + 0.03), y, minZ + 2 + rand() * (d - 4));
        pl.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      group.add(pl);
    }
  };
  building(-48, -22, -44, -18, 13, "facade");
  building(20, 46, -46, -20, 15, "brick");
  building(-46, -20, 18, 42, 12, "brick");
  building(22, 48, 16, 44, 16, "facade", 0xaaaaaa);
  building(-14, 14, -64, -48, 9, "facade", 0x999999);
  building(-14, 14, 48, 64, 9, "brick");
  building(-66, -54, -12, 12, 8, "facade", 0xaa9999);
  building(54, 66, -12, 12, 8, "brick");

  // distant skyline
  const skyMat = std({ map: tex("facade", 2, 6), color: 0x30303a, fog: true });
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2 + rand() * 0.1;
    const r = 105 + rand() * 50;
    const h = 22 + rand() * 50;
    const w = 12 + rand() * 18;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), skyMat);
    m.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    m.rotation.y = rand() * 3;
    group.add(m);
  }

  // ---------- stalls & machines ----------
  const woodMat = std({ map: tex("wood", 1, 1), color: 0xa08868 });
  const metalMat = std({ map: tex("gunmetal", 1, 1), color: 0x888888, metalness: 0.6, roughness: 0.5 });
  const stall = (x: number, z: number, rotY: number, weaponId: string) => {
    const wp = W[weaponId];
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    // back panel
    addBox(3.2, 2.9, 0.2, 0, 1.45, 0.15, woodMat, false, true, g);
    // table
    addBox(3.0, 0.15, 0.9, 0, 1.0, 1.0, woodMat, false, true, g);
    addBox(0.15, 1.0, 0.7, -1.3, 0.5, 1.0, woodMat, false, true, g);
    addBox(0.15, 1.0, 0.7, 1.3, 0.5, 1.0, woodMat, false, true, g);
    // sign
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5), new THREE.MeshBasicMaterial({ map: makeSign(wp.name, `$${wp.price}`, "#e8c24a", wp.icon), toneMapped: false }));
    sign.position.set(0, 1.95, 0.27);
    g.add(sign);
    // sign lamp
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.12), new THREE.MeshBasicMaterial({ color: 0xfff1b0 }));
    lamp.position.set(0, 2.85, 0.3);
    g.add(lamp);
    // display gun silhouette on the table (little box set)
    const disp = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.25), metalMat);
    disp.position.set(0, 1.14, 1.0);
    g.add(disp);
    group.add(g);
    boxes.push(...worldBoxFor(g, 3.2, 1.0, 0, 1.0 + 0.3, 1.0 + 0, 0.9 + 0.5));
    const fx = x + Math.sin(rotY) * 2.1;
    const fz = z + Math.cos(rotY) * 2.1;
    interactables.push({ kind: "weapon", ref: weaponId, x: fx, z: fz, price: wp.price, name: wp.name });
  };

  function worldBoxFor(g: THREE.Group, w: number, top: number, lx: number, _y: number, lz: number, d: number): Box[] {
    // axis-aligned approximation of rotated stall footprint
    const rot = Math.round((g.rotation.y / (Math.PI / 2)) % 4 + 4) % 4;
    const vertical = rot % 2 === 1;
    const cx = g.position.x + Math.sin(g.rotation.y) * (lz + 0.1);
    const cz = g.position.z + Math.cos(g.rotation.y) * (lz + 0.1);
    const hw = (vertical ? d : w) / 2;
    const hd = (vertical ? w : d) / 2;
    void lx;
    return [{ minX: cx - hw, maxX: cx + hw, minZ: cz - hd, maxZ: cz + hd, top }];
  }

  const simpleStation = (x: number, z: number, rotY: number, title: string, sub: string, color: number, kind: InteractKind, ref: string, price: number, icon?: string) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    const hex = "#" + color.toString(16).padStart(6, "0");
    const bodyMat = std({ map: tex("rustmetal", 1, 2), color });
    const body = addBox(1.7, 2.3, 1.0, 0, 1.15, 0.7, bodyMat, false, true, g);
    body.name = "machine";
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.95), new THREE.MeshBasicMaterial({ map: makeSign(title, sub, hex, icon, 512, 320), toneMapped: false }));
    sign.position.set(0, 1.55, 1.21);
    g.add(sign);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.5), new THREE.MeshBasicMaterial({ color }));
    glow.position.set(0, 0.55, 1.21);
    g.add(glow);
    group.add(g);
    const rot = Math.round((rotY / (Math.PI / 2)) % 4 + 4) % 4;
    const vertical = rot % 2 === 1;
    const cx = x + Math.sin(rotY) * 0.7;
    const cz = z + Math.cos(rotY) * 0.7;
    const hw = (vertical ? 1.0 : 1.7) / 2;
    const hd = (vertical ? 1.7 : 1.0) / 2;
    boxes.push({ minX: cx - hw, maxX: cx + hw, minZ: cz - hd, maxZ: cz + hd, top: 2.3 });
    interactables.push({ kind, ref, x: x + Math.sin(rotY) * 2.0, z: z + Math.cos(rotY) * 2.0, price, name: title });
  };

  // weapon stalls
  stall(-46, -18.2, 0, "katana");
  stall(-22, 18.2, Math.PI, "sawedoff");
  stall(22, -20.2, 0, "dmr");
  stall(-12, -48.2, 0, "chainsaw");
  stall(12, -48.2, 0, "aa12");
  stall(-10.5, 48.2, Math.PI, "crossbow");
  stall(10.5, 48.2, Math.PI, "glauncher");
  stall(-54.2, -6, Math.PI / 2, "arc");
  stall(-54.2, 6, Math.PI / 2, "railgun");
  stall(-40, -18.2, 0, "axe");
  stall(-34, -18.2, 0, "magnum");
  stall(-28, -18.2, 0, "shotgun");
  stall(28, -20.2, 0, "smg");
  stall(34, -20.2, 0, "rifle");
  stall(40, -20.2, 0, "sniper");
  stall(-40, 18.2, Math.PI, "flame");
  stall(-34, 18.2, Math.PI, "rocket");
  stall(-28, 18.2, Math.PI, "minigun");
  // perks
  PERKS.forEach((p, i) => simpleStation(27 + i * 5, 16.2, Math.PI, p.name, `$${p.price}`, p.color, "perk", p.id, p.price));
  // utility
  simpleStation(-6, -48.2, 0, "Medkit", "$150", 0x1e9e5a, "medkit", "medkit", 150);
  simpleStation(6, -48.2, 0, "Body Armor", "$500", 0x4a6cc0, "armor", "armor", 500);
  simpleStation(0, 48.2, Math.PI, "Ammo Crate", "$500", 0xb08a2a, "ammo", "ammo", 500);
  simpleStation(-5, -4, 0.0, "Ammo Crate", "$500", 0xb08a2a, "ammo", "ammo", 500);

  // ---------- props ----------
  const carColors = [0x7a2020, 0x2a3a52, 0x3a4a30, 0x555555, 0x7a6a30, 0x202020];
  const tireMat = std({ color: 0x151515 });
  const glassMat = std({ color: 0x101820, roughness: 0.2, metalness: 0.6 });
  const rustTint = (c: number) => std({ map: tex("rustmetal", 2, 1), color: c });
  const car = (x: number, z: number, rot: number, ci: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    const bm = rustTint(carColors[ci % carColors.length]);
    const body = new THREE.Mesh(new RoundedBoxGeometry(4.4, 0.85, 1.9, 3, 0.15), bm);
    body.position.y = 0.75;
    body.castShadow = shadows;
    g.add(body);
    const cab = new THREE.Mesh(new RoundedBoxGeometry(2.3, 0.7, 1.7, 3, 0.2), glassMat);
    cab.position.set(-0.2, 1.4, 0);
    cab.castShadow = shadows;
    g.add(cab);
    const roof = new THREE.Mesh(new RoundedBoxGeometry(2.1, 0.12, 1.6, 2, 0.05), bm);
    roof.position.set(-0.2, 1.78, 0);
    g.add(roof);
    for (const sx of [-1.4, 1.4])
      for (const sz of [-0.95, 0.95]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.28, 12), tireMat);
        w.rotation.x = Math.PI / 2;
        w.position.set(sx, 0.38, sz);
        g.add(w);
      }
    group.add(g);
    const vertical = Math.abs(Math.sin(rot)) > 0.5;
    const hw = (vertical ? 1.9 : 4.4) / 2;
    const hd = (vertical ? 4.4 : 1.9) / 2;
    boxes.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd, top: 1.5 });
  };
  const cars: [number, number, number][] = [
    [-32, 3.5, 0], [-14, -3.5, 0.0], [18, 3.5, 0], [36, -3.2, 0], [-54, -3, 0], [52, 4, 0],
    [-3.5, -30, Math.PI / 2], [3.2, -14, Math.PI / 2], [-3.5, 26, Math.PI / 2], [3.5, 38, Math.PI / 2], [-3, 58, Math.PI / 2],
    [-14, 12, 0], [15, -12, Math.PI / 2], [-30, -2, 0],
  ];
  cars.forEach((c, i) => car(c[0], c[1], c[2], i));

  // ---- vehicle pads ----
  const pads: Pad[] = [
    { kind: "muscle", x: 12, z: 23, yaw: Math.PI / 2 },
    { kind: "jeep", x: -12, z: 23, yaw: Math.PI / 2 },
    { kind: "tank", x: 30, z: 9, yaw: 0 },
    { kind: "heli", x: -38, z: 8, yaw: 0 },
  ];
  const padTex = (label: string, hazard: boolean) => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    g.fillStyle = "#3b3b3e";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1800; i++) {
      g.fillStyle = `rgba(${rand() > 0.5 ? 255 : 0},${rand() > 0.5 ? 255 : 0},${rand() > 0.5 ? 255 : 0},0.035)`;
      g.fillRect(rand() * 256, rand() * 256, 2 + rand() * 3, 2 + rand() * 3);
    }
    g.strokeStyle = hazard ? "#d9a21b" : "#cfcfcf";
    g.lineWidth = 10;
    g.setLineDash(hazard ? [26, 18] : []);
    g.strokeRect(14, 14, 228, 228);
    g.setLineDash([]);
    g.fillStyle = "#e8e8e8";
    g.font = "bold 150px Oswald, Impact, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.globalAlpha = 0.85;
    g.fillText(label, 128, 132);
    // oil stains
    g.globalAlpha = 0.25;
    g.fillStyle = "#000";
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.ellipse(rand() * 256, rand() * 256, 10 + rand() * 24, 6 + rand() * 16, rand() * 3, 0, 7);
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  const padLabels = { muscle: "GT", jeep: "4x4", tank: "M9", heli: "H" } as const;
  for (const p of pads) {
    const size = p.kind === "heli" ? 15 : p.kind === "tank" ? 12 : 8;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), std({ map: padTex(padLabels[p.kind], p.kind === "tank" || p.kind === "heli"), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = p.yaw + (p.kind === "muscle" || p.kind === "jeep" ? 0 : 0);
    m.position.set(p.x, 0.025, p.z);
    m.receiveShadow = true;
    group.add(m);
  }

  const crateMat = std({ map: tex("wood", 1, 1), color: 0xb09a7a });
  const barrelMat = std({ map: tex("rustmetal", 1, 1), color: 0x5a6a70, metalness: 0.4 });
  const barrierMat = std({ map: tex("concrete", 1, 1), color: 0xaaaaaa });
  const bagMat = std({ map: tex("dirt", 1, 1), color: 0x8a7a55 });
  const free = (x: number, z: number, r: number) => {
    if (Math.abs(x) > MAP_HALF - 4 || Math.abs(z) > MAP_HALF - 4) return false;
    if (Math.hypot(x, z - 8) < 7) return false;
    for (const p of pads) if (Math.hypot(x - p.x, z - p.z) < 9.5) return false;
    for (const b of boxes) if (x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r) return false;
    for (const it of interactables) if (Math.hypot(x - it.x, z - it.z) < 3.8) return false;
    return true;
  };
  let placed = 0;
  let tries = 0;
  while (placed < 70 && tries < 800) {
    tries++;
    const x = (rand() * 2 - 1) * (MAP_HALF - 6);
    const z = (rand() * 2 - 1) * (MAP_HALF - 6);
    const t = rand();
    // keep the roads a bit clearer
    const onRoad = Math.abs(x) < 6.5 || Math.abs(z) < 6.5;
    if (onRoad && rand() < 0.65) continue;
    if (t < 0.34) {
      if (!free(x, z, 1.4)) continue;
      const s = 0.9 + rand() * 0.5;
      const rot = rand() * Math.PI;
      const m = new THREE.Mesh(new RoundedBoxGeometry(s, s, s, 2, 0.04), crateMat);
      m.position.set(x, s / 2, z);
      m.rotation.y = rot;
      m.castShadow = shadows;
      group.add(m);
      const r = (s / 2) * (Math.abs(Math.cos(rot)) + Math.abs(Math.sin(rot)));
      boxes.push({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r, top: s });
      if (rand() < 0.4) {
        const m2 = new THREE.Mesh(new RoundedBoxGeometry(s * 0.8, s * 0.8, s * 0.8, 2, 0.04), crateMat);
        m2.position.set(x + 0.1, s + s * 0.4, z);
        m2.rotation.y = rot + 0.5;
        group.add(m2);
        boxes[boxes.length - 1].top = s * 1.8;
      }
      placed++;
    } else if (t < 0.55) {
      if (!free(x, z, 1.2)) continue;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 1.05, 14), barrelMat);
      m.position.set(x, 0.525, z);
      m.castShadow = shadows;
      group.add(m);
      boxes.push({ minX: x - 0.38, maxX: x + 0.38, minZ: z - 0.38, maxZ: z + 0.38, top: 1.05 });
      placed++;
    } else if (t < 0.75) {
      if (!free(x, z, 2.2)) continue;
      const vert = rand() > 0.5;
      const m = new THREE.Mesh(new RoundedBoxGeometry(vert ? 0.7 : 3.2, 1.1, vert ? 3.2 : 0.7, 2, 0.08), barrierMat);
      m.position.set(x, 0.55, z);
      m.castShadow = shadows;
      group.add(m);
      boxes.push({ minX: x - (vert ? 0.35 : 1.6), maxX: x + (vert ? 0.35 : 1.6), minZ: z - (vert ? 1.6 : 0.35), maxZ: z + (vert ? 1.6 : 0.35), top: 1.1 });
      placed++;
    } else if (t < 0.88) {
      if (!free(x, z, 2)) continue;
      const vert = rand() > 0.5;
      for (let k = -2; k <= 2; k++) {
        const m = new THREE.Mesh(new RoundedBoxGeometry(vert ? 0.7 : 0.8, 0.45, vert ? 0.8 : 0.7, 2, 0.15), bagMat);
        m.position.set(x + (vert ? 0 : k * 0.72), 0.23, z + (vert ? k * 0.72 : 0));
        group.add(m);
        const m2 = new THREE.Mesh(new RoundedBoxGeometry(vert ? 0.7 : 0.8, 0.45, vert ? 0.8 : 0.7, 2, 0.15), bagMat);
        if (Math.abs(k) < 2) {
          m2.position.set(x + (vert ? 0 : k * 0.72 + 0.35), 0.68, z + (vert ? k * 0.72 + 0.35 : 0));
          group.add(m2);
        }
      }
      boxes.push({ minX: x - (vert ? 0.45 : 1.8), maxX: x + (vert ? 0.45 : 1.8), minZ: z - (vert ? 1.8 : 0.45), maxZ: z + (vert ? 1.8 : 0.45), top: 0.9 });
      placed++;
    } else {
      if (!free(x, z, 1.2) || onRoad) continue;
      // dead tree
      const bark = std({ color: 0x1e1814 });
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.28, 5, 7), bark);
      trunk.position.set(x, 2.5, z);
      trunk.castShadow = shadows;
      group.add(trunk);
      for (let b = 0; b < 5; b++) {
        const len = 1.6 + rand() * 1.6;
        const br = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.09, len, 5), bark);
        const a = rand() * Math.PI * 2;
        br.position.set(x + Math.cos(a) * len * 0.3, 3.2 + rand() * 1.6, z + Math.sin(a) * len * 0.3);
        br.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
        group.add(br);
      }
      boxes.push({ minX: x - 0.28, maxX: x + 0.28, minZ: z - 0.28, maxZ: z + 0.28, top: 5 });
      placed++;
    }
  }

  // lamp posts
  const poleMat = std({ color: 0x2a2a2a, metalness: 0.5 });
  const lampHead = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  for (const [lx, lz] of [[-8, -24], [8, 24], [-8, 40], [8, -40], [-24, 8], [24, -8], [-44, -8], [44, 8]] as const) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 6, 6), poleMat);
    p.position.set(lx, 3, lz);
    group.add(p);
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.3), lampHead);
    h.position.set(lx, 6, lz);
    group.add(h);
    boxes.push({ minX: lx - 0.12, maxX: lx + 0.12, minZ: lz - 0.12, maxZ: lz + 0.12, top: 6 });
  }

  // fire barrels
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8a20 });
  const fireSpots: [number, number][] = [[-10, -12], [12, 14], [-16, 28], [14, -26], [30, 4], [-34, -4]];
  fireSpots.forEach(([fx, fz], i) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.34, 1.0, 12), barrelMat);
    m.position.set(fx, 0.5, fz);
    group.add(m);
    boxes.push({ minX: fx - 0.4, maxX: fx + 0.4, minZ: fz - 0.4, maxZ: fz + 0.4, top: 1.0 });
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 6), flameMat);
    fl.position.set(fx, 1.3, fz);
    fl.name = "flame";
    group.add(fl);
    // only two barrels carry a real light (perf); the rest rely on the emissive flame + glow
    if (i < 2) {
      const light = new THREE.PointLight(0xff7a2a, mobile ? 0 : 14, 22, 1.6);
      light.position.set(fx, 1.8, fz);
      group.add(light);
      fires.push({ light, base: 14, phase: rand() * 10, x: fx, z: fz });
    }
    const glow = new THREE.Mesh(new THREE.CircleGeometry(2.4, 20), new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(fx, 0.04, fz);
    group.add(glow);
  });

  // spawn gates
  const spawns: { x: number; z: number }[] = [];
  const gateMat = new THREE.MeshBasicMaterial({ color: 0xb01010 });
  const addGate = (x: number, z: number, rotY: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    addBox(0.4, 4, 0.4, -2, 2, 0, metalMat, false, false, g);
    addBox(0.4, 4, 0.4, 2, 2, 0, metalMat, false, false, g);
    addBox(4.4, 0.4, 0.4, 0, 4, 0, metalMat, false, false, g);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.3), gateMat);
    lamp.position.set(0, 4.4, 0);
    g.add(lamp);
    group.add(g);
  };
  for (const x of [-50, -25, 0, 25, 50]) {
    spawns.push({ x, z: -H + 3 }, { x, z: H - 3 });
    if (Math.abs(x) !== 0) { addGate(x, -H + 1.3, 0); addGate(x, H - 1.3, 0); }
  }
  for (const z of [-40, -20, 20, 40]) {
    spawns.push({ x: -H + 3, z }, { x: H - 3, z });
    addGate(-H + 1.3, z, Math.PI / 2);
    addGate(H - 1.3, z, Math.PI / 2);
  }

  const flames = group.children.filter((c) => c.name === "flame");
  return {
    group,
    pads,
    boxes,
    interactables,
    spawns,
    fires,
    update(t: number) {
      for (const f of fires) {
        const k = 0.75 + 0.25 * Math.sin(t * 13 + f.phase) * Math.sin(t * 7.3 + f.phase * 2) + (Math.random() - 0.5) * 0.15;
        f.light.intensity = f.base * k * (f.light.intensity === 0 ? 0 : 1) || 0;
      }
      flames.forEach((fl, i) => {
        fl.scale.set(1 + Math.sin(t * 15 + i) * 0.15, 1 + Math.sin(t * 11 + i * 2) * 0.25, 1);
      });
    },
  };
}
