import * as THREE from "three";
import { Part, type Kit, type V3, cupHand, forearm, fistOnShaft, gripHand } from "./gunkit";

export interface GunSpec {
  g: THREE.Group;
  muzzle: [number, number]; // y, z
  hip: V3;
  ads: V3;
  slide?: THREE.Object3D;
  slideTravel?: number;
  slideAxis?: "z" | "x";
  spin?: THREE.Object3D;
  mag?: THREE.Object3D;
  melee?: boolean;
  hideOnAds?: boolean;
  flashSize?: number;
  eject?: V3; // shell eject port (gun space)
  shell?: "pistol" | "rifle" | "shotgun" | "none";
  idle?: (t: number, g: THREE.Group) => void; // per-frame idle (chainsaw shake, glow pulse)
  glow?: THREE.Material;
}

export type Builder = (k: Kit) => GunSpec;

const ring = (p: Part, m: THREE.Material, r: number, z: number, t = 0.004, x = 0, y = 0) => p.cyl(m, r, t, x, y, z, 24);

/** Serrations: n thin vertical grooves on a slide */
function serrate(p: Part, m: THREE.Material, z0: number, n: number, step: number, y: number, h: number, w: number) {
  for (const s of [-1, 1]) for (let i = 0; i < n; i++) p.box(m, 0.0016, h, 0.0022, s * (w / 2 + 0.0002), y, z0 + i * step, 0);
}

/* ============================ MELEE ============================ */

export const knife: Builder = (k) => {
  const p = new Part();
  // blade: clip point profile
  p.prism(k.blade, [[-0.04, 0.026], [-0.2, 0.026], [-0.27, 0.012], [-0.292, -0.004], [-0.25, -0.012], [-0.04, -0.016]], 0.006, 0, 0.0012);
  // fuller & edge bevel
  p.box(k.steel, 0.0072, 0.003, 0.17, 0, 0.012, -0.12, 0.001);
  p.box(k.chrome, 0.0074, 0.0022, 0.2, 0, -0.012, -0.14, 0.0008);
  p.prism(k.blade, [[-0.2, 0.026], [-0.27, 0.012], [-0.25, 0.026]], 0.0062, 0, 0.0004); // swedge
  for (let i = 0; i < 9; i++) p.box(k.blued, 0.0072, 0.003, 0.009, 0, 0.0285, -0.07 - i * 0.012, 0.0006); // saw-back teeth
  // guard
  p.box(k.gunmetal, 0.016, 0.07, 0.014, 0, 0.002, -0.034, 0.004);
  p.cylX(k.gunmetal, 0.006, 0.02, 0, 0.04, -0.034, 12);
  // grip: tapered ergonomic with finger grooves
  p.lathe(k.rubber, [[0.0, 0.12], [0.014, 0.12], [0.017, 0.11], [0.016, 0.07], [0.018, 0.04], [0.016, 0.0], [0.0, -0.002]], 0, 0.0, 0, 18, [0, 0, 0]);
  for (let i = 0; i < 4; i++) p.torus(k.poly, 0.0172, 0.0034, 0, 0, 0.012 + i * 0.026, [0, 0, 0], 18);
  p.sphere(k.gunmetal, 0.019, 0, 0, 0.122, 1, 1, 0.7);
  p.torus(k.steel, 0.008, 0.002, 0, 0, 0.13, [Math.PI / 2, 0, 0], 12); // lanyard hole
  const g = p.build();
  g.rotation.set(0.12, 0.0, 0.08);
  const h = new Part();
  fistOnShaft(h, k, [0, 0, 0.05], 0.017);
  forearm(h, k, [0.012, -0.012, 0.1], [0.12, -0.38, 0.9], 0.62, 1);
  const hh = h.build();
  hh.position.set(0, 0, 0);
  const root = new THREE.Group();
  root.add(g, hh);
  root.rotation.x = 0.35;
  return { g: root, muzzle: [0, -0.3], hip: [0.2, -0.17, -0.36], ads: [0.2, -0.17, -0.36], melee: true };
};

export const axe: Builder = (k) => {
  const p = new Part();
  // hickory handle with gentle curve and swell
  p.lathe(k.wood, [[0.0, 0.34], [0.015, 0.34], [0.022, 0.33], [0.017, 0.28], [0.014, 0.1], [0.013, -0.2], [0.014, -0.45], [0.016, -0.62], [0.0, -0.62]], 0, 0, 0, 14);
  p.box(k.wood, 0.03, 0.06, 0.05, 0, 0, 0.35, 0.012); // knob end
  p.sphere(k.wood, 0.024, 0, 0, 0.35, 1, 1, 0.9);
  // head: beard profile (side view), thick poll
  p.prism(k.red, [[-0.54, 0.08], [-0.62, 0.0], [-0.54, -0.12], [-0.5, -0.1], [-0.48, 0.04], [-0.5, 0.08]], 0.012, 0, 0.002);
  p.prism(k.red, [[-0.5, 0.055], [-0.5, -0.04], [-0.43, -0.04], [-0.43, 0.055]], 0.04, 0, 0.004); // eye block
  p.prism(k.blade, [[-0.55, 0.075], [-0.64, 0.0], [-0.55, -0.115], [-0.575, -0.0]], 0.0042, 0, 0.0008); // honed edge
  p.box(k.red, 0.04, 0.05, 0.04, 0, 0.05, -0.43, 0.01); // poll top
  // wedge & rivet
  p.box(k.blued, 0.008, 0.02, 0.01, 0, 0.0, -0.405, 0.002);
  for (const s of [-1, 1]) p.sphere(k.steel, 0.006, s * 0.021, 0.0, -0.455, 1, 1, 0.5);
  // grip wrap strips
  for (let i = 0; i < 6; i++) p.torus(k.leather, 0.0145, 0.003, 0, 0, 0.0 + i * 0.03, [0, 0, 0], 14);
  const g = p.build();
  const h = new Part();
  fistOnShaft(h, k, [0, 0, 0.1], 0.015);
  fistOnShaft(h, k, [0, 0, -0.14], 0.015, 1);
  forearm(h, k, [0.014, -0.012, 0.16], [0.2, -0.3, 0.9], 0.5, 1);
  forearm(h, k, [0.0, -0.014, -0.08], [-0.2, -0.28, 0.9], 0.5, -1);
  const root = new THREE.Group();
  root.add(g, h.build());
  root.rotation.set(0.75, 0, 0.12);
  return { g: root, muzzle: [0, -0.6], hip: [0.22, -0.28, -0.38], ads: [0.22, -0.28, -0.38], melee: true };
};

export const katana: Builder = (k) => {
  const p = new Part();
  // blade with slight curve built from segments
  const segs = 10;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs;
    const t1 = (i + 1) / segs;
    const z0 = -0.12 - t0 * 0.68;
    const z1 = -0.12 - t1 * 0.68;
    const y0 = 0.02 * t0 * t0 * 4 * 0.5;
    const y1 = 0.02 * t1 * t1 * 4 * 0.5;
    const h0 = 0.014 * (1 - t0 * 0.35);
    const h1 = 0.014 * (1 - t1 * 0.35);
    p.prism(k.blade, [[z0, y0 + h0], [z1, y1 + h1], [z1, y1 - h1 * 0.7], [z0, y0 - h0 * 0.7]], 0.0055, 0, 0.0008);
    p.prism(k.chrome, [[z0, y0 - h0 * 0.1], [z1, y1 - h1 * 0.1], [z1, y1 - h1 * 0.7], [z0, y0 - h0 * 0.7]], 0.0058, 0, 0.0004); // hamon edge
  }
  p.prism(k.blade, [[-0.8, 0.0188], [-0.84, 0.0065], [-0.8, 0.0188 - 0.02]], 0.0055, 0, 0.0006); // kissaki tip
  p.box(k.steel, 0.0062, 0.0016, 0.55, 0, 0.0, -0.4, 0.0005); // blood groove
  // tsuba (round guard) with cut-outs
  p.cyl(k.brass, 0.037, 0.006, 0, 0.0, -0.1, 28);
  p.cyl(k.gunmetal, 0.032, 0.0066, 0, 0.0, -0.1, 28);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.78;
    p.cyl(k.brass, 0.008, 0.0072, Math.cos(a) * 0.022, Math.sin(a) * 0.022, -0.1, 12);
  }
  p.cyl(k.brass, 0.014, 0.014, 0, 0, -0.112, 14); // habaki collar
  // tsuka: ray-skin wrap with diamond ito
  p.lathe(k.leather, [[0, 0.23], [0.014, 0.23], [0.016, 0.2], [0.015, 0.1], [0.0155, 0.0], [0.0, -0.09]], 0, 0, 0, 16);
  for (let i = 0; i < 9; i++) {
    const z = 0.0 + i * 0.022;
    p.box(k.poly, 0.036, 0.0025, 0.007, 0, 0.0, z, 0.001, [0, 0, 0.8]);
    p.box(k.poly, 0.036, 0.0025, 0.007, 0, 0.0, z + 0.011, 0.001, [0, 0, -0.8]);
  }
  p.sphere(k.brass, 0.0155, 0, 0, 0.235, 1, 1, 0.7); // kashira
  p.cap(k.red, [0.012, 0, 0.24], [0.04, -0.03, 0.34], 0.0035); // tassel
  const g = p.build();
  const h = new Part();
  fistOnShaft(h, k, [0, 0, 0.02], 0.016);
  fistOnShaft(h, k, [0, 0, 0.17], 0.016);
  forearm(h, k, [0.014, -0.012, 0.22], [0.2, -0.3, 0.9], 0.45, 1);
  forearm(h, k, [0.0, -0.014, 0.2], [-0.25, -0.3, 0.9], 0.45, -1);
  const root = new THREE.Group();
  root.add(g, h.build());
  root.rotation.set(0.55, 0.1, -0.1);
  return { g: root, muzzle: [0, -0.8], hip: [0.2, -0.24, -0.34], ads: [0.2, -0.24, -0.34], melee: true };
};

export const chainsaw: Builder = (k) => {
  const p = new Part();
  // engine housing: lathe-ish rounded body + shroud
  p.prism(k.orange, [[0.12, 0.08], [0.0, 0.1], [-0.12, 0.09], [-0.2, 0.04], [-0.2, -0.05], [-0.1, -0.08], [0.1, -0.07], [0.15, 0.0]], 0.09, 0, 0.012);
  p.box(k.poly, 0.092, 0.02, 0.15, 0, 0.104, -0.03, 0.008); // top cover
  p.cyl(k.chrome, 0.02, 0.02, 0.0, 0.085, 0.05, 16); // fuel cap
  p.box(k.poly, 0.05, 0.05, 0.02, 0.0, 0.0, -0.205, 0.008); // bar mount
  for (let i = 0; i < 6; i++) p.box(k.blued, 0.092, 0.003, 0.09, 0, 0.0 + (i - 2.5) * 0.012, 0.06, 0.001); // vent slots
  // exhaust
  p.cyl(k.gunmetal, 0.018, 0.05, 0.06, -0.01, 0.1, 12);
  // rear handle (loop)
  p.torus(k.poly, 0.065, 0.016, 0, 0.0, 0.2, [0, Math.PI / 2, 0], 24);
  p.box(k.poly, 0.032, 0.05, 0.06, 0, -0.05, 0.24, 0.015);
  p.box(k.red, 0.02, 0.03, 0.03, 0, -0.04, 0.14, 0.008); // throttle trigger
  // top handlebar
  p.cylX(k.rubber, 0.018, 0.14, 0, 0.145, -0.06, 14);
  p.box(k.poly, 0.03, 0.06, 0.04, 0.06, 0.11, -0.06, 0.01);
  p.box(k.poly, 0.03, 0.06, 0.04, -0.06, 0.11, -0.06, 0.01);
  // guide bar
  p.prism(k.steel, [[-0.2, 0.04], [-0.78, 0.04], [-0.8, 0.0], [-0.78, -0.04], [-0.2, -0.04]], 0.008, 0, 0.002);
  p.cylX(k.steel, 0.04, 0.008, 0, 0, -0.78, 20);
  p.cylX(k.blued, 0.014, 0.012, 0, 0, -0.68, 14);
  p.cylX(k.blued, 0.014, 0.012, 0, 0, -0.34, 14);
  // sprocket cover
  p.cylX(k.gunmetal, 0.05, 0.1, 0, 0, -0.21, 22);
  p.cylX(k.chrome, 0.015, 0.104, 0, 0, -0.21, 12);
  // chain: teeth along top & bottom edges + loop at nose
  const chain = new THREE.Group();
  const cp = new Part();
  for (let i = 0; i < 44; i++) {
    const z = -0.21 - i * 0.0135;
    if (z < -0.78) break;
    for (const sy of [1, -1]) {
      cp.box(k.blued, 0.012, 0.01, 0.009, 0, sy * 0.046, z, 0.001);
      cp.box(k.chrome, 0.0035, 0.016, 0.005, i % 2 ? 0.009 : -0.009, sy * 0.052, z, 0.001, [0, 0, i % 2 ? 0.3 : -0.3]);
    }
  }
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (i / 8) - Math.PI / 2;
    cp.box(k.blued, 0.012, 0.01, 0.009, 0, Math.cos(a) * 0.046, -0.78 - Math.sin(a) * 0.046, 0.001, [-a, 0, 0]);
  }
  chain.add(cp.build());
  p.attach(chain);
  // pull-start & brand plate
  p.box(k.red, 0.094, 0.04, 0.003, 0, 0.0, 0.0, 0.001);
  const g = p.build();
  const h = new Part();
  cupHand(h, k, [0, 0.145, -0.06], 0.017, 0.017, 0.12, -1, true);
  gripHand(h, k, [0, -0.04, 0.24], 0.016, 0.03, 0.05, 0.1, 1, 4);
  forearm(h, k, [0.03, 0.14, -0.06], [-0.45, -0.45, 0.78], 0.5, -1);
  forearm(h, k, [0.03, -0.04, 0.26], [0.3, -0.5, 0.8], 0.45, 1);
  const root = new THREE.Group();
  root.add(g, h.build());
  return {
    g: root,
    muzzle: [0, -0.8],
    hip: [0.12, -0.2, -0.62],
    ads: [0.12, -0.2, -0.62],
    melee: true,
    idle: (t, gr) => {
      gr.position.x = Math.sin(t * 90) * 0.0012;
      gr.position.y = Math.cos(t * 77) * 0.0012;
      chain.position.z = ((t * 1.2) % 0.0135) * -1;
    },
  };
};

/* ============================ HANDGUNS ============================ */

export const pistol: Builder = (k) => {
  const p = new Part();
  // frame (dust cover + trigger guard + grip tang)
  p.prism(k.gunmetal, [[0.07, 0.015], [-0.06, 0.015], [-0.1, -0.005], [-0.1, -0.022], [-0.04, -0.022], [-0.032, -0.036], [0.0, -0.034], [0.01, -0.02], [0.05, -0.008]], 0.032, 0, 0.0025);
  // trigger guard loop
  p.torus(k.gunmetal, 0.017, 0.0032, 0, -0.03, -0.014, [0, Math.PI / 2, 0], 18);
  p.box(k.chrome, 0.008, 0.026, 0.006, 0, -0.012, -0.004, 0.002, [-0.25, 0, 0]); // trigger
  // grip with wood panels
  const gr = new Part();
  gr.prism(k.gunmetal, [[0.07, 0.0], [0.045, -0.014], [0.062, -0.135], [0.098, -0.14], [0.103, -0.125], [0.085, 0.0]], 0.03, 0, 0.003);
  for (const s of [-1, 1]) {
    gr.prism(k.woodDark, [[0.07, -0.004], [0.052, -0.016], [0.066, -0.127], [0.094, -0.13], [0.097, -0.12], [0.082, -0.004]], 0.0046, s * 0.0175, 0.0015);
    for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) gr.sphere(k.brass, 0.0022, s * 0.0205, -0.025 - i * 0.02, 0.07 + j * 0.0 + i * 0.0035 - (i > 2 ? 0.0 : 0) - j * 0.012 + 0.0, 0.5, 0.5, 0.5, 6);
    gr.cylX(k.chrome, 0.0042, 0.0012, s * 0.0215, -0.055, 0.075, 10); // grip screw
  }
  gr.box(k.gunmetal, 0.032, 0.012, 0.045, 0, -0.14, 0.082, 0.004); // mag floor plate
  gr.box(k.gunmetal, 0.012, 0.02, 0.008, 0, -0.005, 0.098, 0.003); // grip safety
  gr.box(k.blued, 0.014, 0.012, 0.02, 0, 0.02, 0.092, 0.004); // hammer
  const grip = gr.build();
  grip.rotation.x = 0;
  // controls
  p.box(k.chrome, 0.008, 0.012, 0.03, 0.018, 0.012, 0.02, 0.003); // thumb safety
  p.box(k.chrome, 0.004, 0.01, 0.012, 0.0175, 0.0, -0.03, 0.002); // slide release
  p.cyl(k.steel, 0.004, 0.04, 0, 0.0, -0.075, 10); // guide rod end under barrel
  // slide (animated)
  const s = new Part();
  s.prism(k.blued, [[0.09, 0.054], [-0.115, 0.054], [-0.128, 0.046], [-0.128, 0.018], [0.09, 0.018]], 0.0315, 0, 0.003);
  s.prism(k.blued, [[0.09, 0.054], [0.09, 0.062], [0.06, 0.062], [0.045, 0.054]], 0.0165, 0, 0.002); // rear step
  s.box(k.gunmetal, 0.0165, 0.003, 0.2, 0, 0.06, -0.015, 0.001); // top flat rib
  serrate(s, k.gunmetal, 0.04, 7, 0.0082, 0.037, 0.026, 0.0315);
  serrate(s, k.gunmetal, -0.115, 3, 0.0082, 0.037, 0.026, 0.0315);
  // ejection port (dark pocket)
  s.box(k.rubber, 0.0325, 0.016, 0.05, 0, 0.044, -0.005, 0.002);
  s.box(k.chrome, 0.024, 0.01, 0.044, 0, 0.041, -0.006, 0.002); // exposed barrel hood
  // sights: front blade + rear notch w/ tritium dots
  s.box(k.blued, 0.004, 0.012, 0.01, 0, 0.066, -0.114, 0.001);
  s.cylX(k.trit, 0.0016, 0.005, 0, 0.066, -0.119, 8);
  for (const sx of [-1, 1]) s.box(k.blued, 0.007, 0.011, 0.01, sx * 0.0072, 0.066, 0.082, 0.001);
  s.box(k.blued, 0.01, 0.011, 0.008, 0, 0.0645, 0.088, 0.001);
  for (const sx of [-1, 1]) s.cylX(k.trit, 0.0015, 0.004, sx * 0.0072, 0.0665, 0.0845, 8);
  // muzzle: barrel bushing + crown
  s.lathe(k.steel, [[0.0, 0.0], [0.011, 0.0], [0.0115, -0.002], [0.0115, -0.018], [0.009, -0.02], [0.0, -0.02]], 0, 0.03, -0.126, 20);
  s.lathe(k.chrome, [[0.0035, 0], [0.0062, 0], [0.0062, -0.004], [0.0035, -0.004]], 0, 0.03, -0.145, 14);
  s.cylX(k.rubber, 0.0025, 0.004, 0, 0.03, -0.146, 6);
  // engraving strip
  s.box(k.chrome, 0.0004, 0.006, 0.07, 0.01592, 0.045, -0.06, 0);
  const slide = s.build();
  // magazine (visible base)
  const m = new Part();
  m.prism(k.steel, [[0.065, 0.0], [0.05, -0.012], [0.07, -0.13], [0.096, -0.132], [0.098, -0.1], [0.082, 0.0]], 0.026, 0, 0.002);
  m.box(k.rubber, 0.03, 0.01, 0.045, 0, -0.142, 0.082, 0.003);
  const mag = m.build();
  mag.position.set(0, 0, 0);
  const h = new Part();
  gripHand(h, k, [0, -0.07, 0.078], 0.017, 0.022, 0.055, 0.05, 1, 4);
  gripHand(h, k, [0.003, -0.06, 0.066], 0.016, 0.02, 0.05, 0.05, -1, 3);
  forearm(h, k, [0.04, -0.07, 0.108], [0.22, -0.22, 0.95], 0.5, 1);
  forearm(h, k, [-0.04, -0.055, 0.1], [-0.28, -0.22, 0.95], 0.5, -1);
  const g = new THREE.Group();
  g.add(p.build(), grip, slide, h.build());
  g.add(mag);
  return {
    g,
    muzzle: [0.03, -0.15],
    hip: [0.1, -0.13, -0.46],
    ads: [0, -0.073, -0.28],
    slide,
    slideTravel: 0.045,
    mag,
    flashSize: 0.8,
    eject: [0.016, 0.045, -0.02],
    shell: "pistol",
  };
};

export const magnum: Builder = (k) => {
  const p = new Part();
  // frame
  p.prism(k.chrome, [[0.1, 0.045], [0.02, 0.05], [-0.05, 0.045], [-0.07, 0.01], [-0.07, -0.025], [-0.02, -0.03], [0.01, -0.02], [0.03, -0.05], [0.07, -0.05], [0.11, 0.02]], 0.034, 0, 0.004);
  // top strap/rib barrel with underlug
  p.cyl(k.chrome, 0.013, 0.28, 0, 0.032, -0.2, 22);
  p.box(k.chrome, 0.016, 0.014, 0.27, 0, 0.049, -0.2, 0.003); // vent rib
  for (let i = 0; i < 12; i++) p.box(k.rubber, 0.012, 0.002, 0.005, 0, 0.0565, -0.1 - i * 0.02, 0.0004);
  p.cyl(k.chrome, 0.0155, 0.2, 0, 0.0, -0.16, 18); // lug
  p.cyl(k.steel, 0.004, 0.14, 0, 0.0, -0.25, 8); // ejector rod
  p.lathe(k.chrome, [[0.0, 0], [0.011, 0], [0.0165, -0.01], [0.0165, -0.03], [0.012, -0.034], [0, -0.034]], 0, 0.032, -0.325, 22); // muzzle crown
  // sights
  p.prism(k.blued, [[-0.31, 0.056], [-0.296, 0.056], [-0.292, 0.074], [-0.312, 0.074]], 0.004, 0, 0.0008);
  p.box(k.orange, 0.003, 0.009, 0.0035, 0, 0.0715, -0.3125, 0.0005);
  p.box(k.blued, 0.03, 0.014, 0.014, 0, 0.068, 0.0, 0.003);
  p.box(k.rubber, 0.01, 0.008, 0.016, 0, 0.0725, 0.0, 0.001);
  // cylinder with flutes + chambers
  const cyl = new Part();
  cyl.cyl(k.chrome, 0.0305, 0.075, 0, 0, 0, 36);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    cyl.box(k.rubber, 0.012, 0.012, 0.0762, Math.cos(a) * 0.0235, Math.sin(a) * 0.0235, 0, 0.003, [0, 0, a]);
    cyl.cyl(k.rubber, 0.0072, 0.0765, Math.cos(a + 0.52) * 0.0225, Math.sin(a + 0.52) * 0.0225, 0, 12);
    cyl.cyl(k.brass, 0.0066, 0.005, Math.cos(a + 0.52) * 0.0225, Math.sin(a + 0.52) * 0.0225, 0.037, 10);
  }
  cyl.cyl(k.chrome, 0.012, 0.08, 0, 0, 0, 14);
  const cg = cyl.build();
  cg.position.set(0, 0.01, 0.0);
  // hammer
  p.prism(k.blued, [[0.1, 0.04], [0.125, 0.07], [0.135, 0.075], [0.125, 0.045], [0.108, 0.02]], 0.009, 0, 0.001);
  p.cyl(k.rubber, 0.0, 0.0, 0, 0, 0, 3);
  // trigger & guard
  p.torus(k.chrome, 0.026, 0.0034, 0, -0.04, 0.04, [0, Math.PI / 2, 0], 20);
  p.box(k.blued, 0.007, 0.028, 0.008, 0, -0.018, 0.045, 0.002, [-0.3, 0, 0]);
  // grip (checkered wood w/ rubber backstrap)
  const gr = new Part();
  gr.prism(k.leather, [[0.1, 0.01], [0.075, -0.02], [0.11, -0.16], [0.16, -0.14], [0.16, -0.06], [0.125, 0.012]], 0.036, 0, 0.007);
  gr.prism(k.rubber, [[0.14, -0.02], [0.17, -0.1], [0.162, -0.15], [0.12, -0.16]], 0.036, 0, 0.004);
  for (let i = 0; i < 8; i++) gr.box(k.rubber, 0.037, 0.002, 0.04, 0, -0.04 - i * 0.014, 0.09 + i * 0.006, 0.0006);
  for (const s of [-1, 1]) gr.cylX(k.chrome, 0.006, 0.003, s * 0.0185, -0.03, 0.13, 10);
  const grip = gr.build();
  const h = new Part();
  gripHand(h, k, [0, -0.08, 0.126], 0.019, 0.026, 0.06, 0.2, 1, 4);
  gripHand(h, k, [0.003, -0.08, 0.108], 0.018, 0.024, 0.055, 0.2, -1, 3);
  forearm(h, k, [0.045, -0.1, 0.17], [0.25, -0.2, 0.95], 0.5, 1);
  forearm(h, k, [-0.045, -0.085, 0.16], [-0.3, -0.2, 0.95], 0.5, -1);
  const g = new THREE.Group();
  g.add(p.build(), cg, grip, h.build());
  g.position.set(0, 0, -0.08);
  return {
    g,
    muzzle: [0.032, -0.36],
    hip: [0.17, -0.19, -0.35],
    ads: [0, -0.09, -0.32],
    spin: cg,
    flashSize: 1.35,
    shell: "none",
  };
};

/* ============================ SHOTGUNS ============================ */

function shotgunReceiver(p: Part, k: Kit, longBarrel: number) {
  // machined receiver with ejection port & loading gate
  p.prism(k.gunmetal, [[0.15, 0.04], [0.0, 0.045], [-0.12, 0.04], [-0.14, 0.0], [-0.12, -0.04], [0.0, -0.045], [0.12, -0.05], [0.15, -0.03]], 0.04, 0, 0.005);
  p.box(k.rubber, 0.0405, 0.018, 0.06, 0, 0.026, -0.02, 0.003); // ejection port
  p.box(k.steel, 0.02, 0.02, 0.004, 0.019, -0.03, -0.06, 0.002); // loading gate
  p.cylX(k.chrome, 0.006, 0.043, 0, 0.01, 0.03, 10); // cross-bolt safety
  // trigger guard
  p.prism(k.gunmetal, [[0.0, -0.045], [0.0, -0.075], [0.04, -0.082], [0.075, -0.06], [0.07, -0.045]], 0.012, 0, 0.002);
  p.box(k.chrome, 0.006, 0.026, 0.006, 0, -0.058, 0.03, 0.002, [-0.25, 0, 0]);
  void longBarrel;
}

export const shotgun: Builder = (k) => {
  const p = new Part();
  shotgunReceiver(p, k, 0.7);
  // barrel & magazine tube
  p.lathe(k.blued, [[0.0, 0], [0.0165, 0], [0.0165, -0.62], [0.0185, -0.63], [0.0185, -0.68], [0.0, -0.68]], 0, 0.028, -0.12, 24);
  p.cyl(k.gunmetal, 0.0125, 0.56, 0, -0.012, -0.4, 18); // mag tube
  p.cyl(k.chrome, 0.0135, 0.012, 0, -0.012, -0.12, 18); // tube cap
  p.cyl(k.chrome, 0.0145, 0.01, 0, -0.012, -0.69, 18); // mag cap
  p.box(k.blued, 0.012, 0.012, 0.58, 0, 0.054, -0.4, 0.003); // vent rib
  for (let i = 0; i < 26; i++) p.box(k.rubber, 0.008, 0.0015, 0.004, 0, 0.0605, -0.14 - i * 0.02, 0.0003);
  p.sphere(k.brass, 0.0055, 0, 0.0625, -0.76, 1, 1, 1, 8); // bead sight
  p.cylY(k.blued, 0.003, 0.012, 0, 0.0575, -0.76, 8);
  // wood stock (shaped), comb and butt pad
  p.prism(k.wood, [[0.14, 0.04], [0.3, 0.035], [0.46, 0.032], [0.52, -0.01], [0.5, -0.105], [0.44, -0.11], [0.3, -0.07], [0.15, -0.05]], 0.038, 0, 0.007);
  p.prism(k.rubber, [[0.5, -0.1], [0.52, 0.0], [0.525, -0.012], [0.53, -0.06], [0.52, -0.108]], 0.04, 0, 0.003);
  p.box(k.wood, 0.039, 0.01, 0.1, 0, 0.0, 0.2, 0.004); // grip checkering band
  for (let i = 0; i < 6; i++) p.box(k.rubber, 0.0395, 0.0012, 0.07, 0, -0.012 + i * 0.006, 0.05 + 0, 0.0003);
  p.cyl(k.chrome, 0.004, 0.01, 0, -0.03, 0.4, 10);
  // pump (animated)
  const pump = new Part();
  pump.lathe(k.wood, [[0.0, 0.0], [0.03, 0.0], [0.034, -0.01], [0.034, -0.17], [0.03, -0.18], [0.0, -0.18]], 0, -0.006, -0.38, 26);
  for (let i = 0; i < 9; i++) pump.torus(k.rubber, 0.0345, 0.0016, 0, -0.006, -0.3 - i * 0.015 + 0.1, [0, 0, 0], 26);
  pump.cap(k.gunmetal, [-0.012, -0.012, -0.22], [-0.012, -0.01, -0.34], 0.006);
  const pg = pump.build();
  const h = new Part();
  gripHand(h, k, [0, -0.04, 0.34], 0.017, 0.026, 0.05, 0.25, 1, 4);
  forearm(h, k, [0.04, -0.06, 0.37], [0.25, -0.3, 0.9], 0.5, 1);
  const lh = new Part();
  cupHand(lh, k, [0, -0.006, -0.38], 0.033, 0.033, 0.12, -1, true);
  forearm(lh, k, [-0.04, -0.03, -0.3], [-0.45, -0.25, 0.85], 0.7, -1);
  pg.add(lh.build());
  const g = new THREE.Group();
  g.add(p.build(), pg, h.build());
  return {
    g,
    muzzle: [0.028, -0.82],
    hip: [0.2, -0.2, -0.36],
    ads: [0, -0.07, -0.3],
    slide: pg,
    slideTravel: 0.14,
    flashSize: 1.6,
    eject: [0.02, 0.03, -0.04],
    shell: "shotgun",
  };
};

export const sawedoff: Builder = (k) => {
  const p = new Part();
  // twin barrels sawn short, with brazed rib
  for (const s of [-1, 1]) {
    p.lathe(k.blued, [[0.0, 0], [0.0155, 0], [0.0155, -0.3], [0.0165, -0.305], [0.0165, -0.3], [0.0, -0.3]], s * 0.0155, 0.0, -0.06, 22);
    p.cyl(k.rubber, 0.0125, 0.003, s * 0.0155, 0.0, -0.362, 14);
  }
  p.box(k.blued, 0.012, 0.01, 0.3, 0, 0.0, -0.21, 0.003);
  p.box(k.steel, 0.01, 0.005, 0.3, 0, 0.0155, -0.21, 0.002);
  p.sphere(k.brass, 0.004, 0, 0.022, -0.34, 1, 1, 1, 8);
  // receiver / action w/ hammers
  p.prism(k.blued, [[0.07, 0.04], [-0.08, 0.04], [-0.1, 0.0], [-0.08, -0.04], [0.05, -0.045], [0.08, -0.01]], 0.06, 0, 0.005);
  p.cylX(k.steel, 0.012, 0.062, 0, -0.01, -0.08, 14); // hinge pin boss
  for (const s of [-1, 1]) {
    p.prism(k.blued, [[0.07, 0.04], [0.095, 0.075], [0.105, 0.07], [0.09, 0.035]], 0.009, s * 0.02, 0.0012); // exposed hammers
    p.box(k.steel, 0.012, 0.012, 0.03, s * 0.035, 0.035, 0.0, 0.003); // side plate screw
  }
  p.box(k.chrome, 0.01, 0.02, 0.006, 0, 0.045, -0.095, 0.002, [0.3, 0, 0]); // top lever
  // double triggers
  for (const s of [-1, 1]) p.box(k.blued, 0.004, 0.026, 0.006, s * 0.008, -0.055, 0.03, 0.0015, [-0.3, 0, 0]);
  p.torus(k.blued, 0.03, 0.003, 0, -0.07, 0.03, [0, Math.PI / 2, 0], 22);
  // pistol grip stock cut down
  p.prism(k.wood, [[0.06, 0.03], [0.14, 0.02], [0.2, -0.04], [0.23, -0.12], [0.18, -0.15], [0.12, -0.12], [0.08, -0.05]], 0.042, 0, 0.008);
  for (let i = 0; i < 8; i++) p.box(k.woodDark, 0.0435, 0.0016, 0.035, 0, -0.04 - i * 0.012, 0.15 + i * 0.012, 0.0004, [0.6, 0, 0]);
  p.cyl(k.brass, 0.006, 0.003, 0.0, 0.0, 0.19, 8);
  // wrapped forend (leather)
  p.box(k.leather, 0.06, 0.03, 0.14, 0, -0.045, -0.15, 0.012);
  for (let i = 0; i < 7; i++) p.box(k.poly, 0.062, 0.006, 0.01, 0, -0.045, -0.095 - i * 0.019, 0.002);
  // shells in loops on the side
  const h = new Part();
  gripHand(h, k, [0, -0.085, 0.148], 0.019, 0.024, 0.055, 0.5, 1, 4);
  cupHand(h, k, [0, -0.045, -0.15], 0.03, 0.017, 0.11, -1, true);
  forearm(h, k, [0.04, -0.1, 0.18], [0.25, -0.3, 0.9], 0.5, 1);
  forearm(h, k, [-0.04, -0.07, -0.1], [-0.4, -0.25, 0.9], 0.7, -1);
  const g = new THREE.Group();
  g.add(p.build(), h.build());
  g.position.set(0, 0, -0.04);
  return { g, muzzle: [0.0, -0.4], hip: [0.2, -0.2, -0.36], ads: [0, -0.05, -0.3], flashSize: 2.1, shell: "shotgun" };
};

export const aa12: Builder = (k) => {
  const p = new Part();
  // modern auto shotgun: boxy upper receiver, rail, drum-like mag, folding stock
  p.prism(k.gunmetal, [[0.25, 0.07], [-0.1, 0.07], [-0.12, 0.05], [-0.12, -0.04], [-0.05, -0.05], [0.25, -0.05]], 0.05, 0, 0.006);
  p.box(k.rubber, 0.052, 0.016, 0.1, 0, 0.044, 0.0, 0.003); // ejection port
  // top picatinny rail
  p.box(k.blued, 0.021, 0.008, 0.36, 0, 0.078, 0.07, 0.001);
  for (let i = 0; i < 20; i++) p.box(k.rubber, 0.0222, 0.0042, 0.007, 0, 0.0795, -0.1 + i * 0.0175, 0.0005);
  // barrel shroud with cooling slots
  p.lathe(k.blued, [[0.0, 0], [0.026, 0], [0.026, -0.4], [0.021, -0.405], [0.021, -0.5], [0.0, -0.5]], 0, 0.025, -0.12, 24);
  for (let i = 0; i < 8; i++) for (const s of [-1, 1]) p.box(k.rubber, 0.003, 0.016, 0.022, s * 0.026, 0.025, -0.18 - i * 0.04, 0.0008);
  p.lathe(k.chrome, [[0.0, 0], [0.013, 0], [0.019, -0.02], [0.019, -0.07], [0.0, -0.07]], 0, 0.025, -0.62, 20); // muzzle brake
  for (let i = 0; i < 4; i++) p.box(k.rubber, 0.022, 0.004, 0.006, 0, 0.025, -0.65 + i * 0.012, 0.0006); // ports
  // handguard rail underneath
  p.box(k.poly, 0.05, 0.034, 0.32, 0, -0.026, -0.33, 0.012);
  p.box(k.blued, 0.021, 0.008, 0.2, 0, -0.048, -0.33, 0.001);
  // vertical grip
  p.prism(k.poly, [[-0.2, -0.045], [-0.17, -0.045], [-0.165, -0.15], [-0.2, -0.155]], 0.032, 0, 0.008);
  // pistol grip + trigger
  p.prism(k.poly, [[0.14, -0.04], [0.11, -0.05], [0.13, -0.16], [0.17, -0.16], [0.18, -0.05]], 0.034, 0, 0.007);
  for (let i = 0; i < 6; i++) p.box(k.rubber, 0.035, 0.0018, 0.03, 0, -0.07 - i * 0.015, 0.13 + i * 0.006, 0.0005);
  p.torus(k.blued, 0.026, 0.0026, 0, -0.058, 0.08, [0, Math.PI / 2, 0], 18);
  p.box(k.chrome, 0.006, 0.024, 0.006, 0, -0.045, 0.085, 0.002, [-0.3, 0, 0]);
  // charging handle + stock
  p.box(k.chrome, 0.012, 0.018, 0.026, 0.03, 0.05, 0.2, 0.004);
  p.prism(k.poly, [[0.25, 0.05], [0.28, 0.06], [0.52, 0.06], [0.52, -0.1], [0.28, -0.07], [0.25, -0.05]], 0.04, 0, 0.01);
  p.prism(k.rubber, [[0.52, 0.06], [0.54, 0.05], [0.54, -0.09], [0.52, -0.1]], 0.042, 0, 0.004);
  p.cap(k.blued, [0.0, 0.03, 0.25], [0.0, 0.03, 0.4], 0.006);
  // sights: red dot reflex
  p.box(k.blued, 0.034, 0.03, 0.06, 0, 0.1, 0.05, 0.008);
  p.box(k.glass, 0.028, 0.028, 0.004, 0, 0.118, 0.026, 0.001, [-0.1, 0, 0]);
  p.sphere(k.dotRed, 0.0016, 0, 0.118, 0.022, 1, 1, 1, 6);
  // 20-round box mag
  const mag = new Part();
  mag.prism(k.blued, [[-0.02, 0.0], [0.04, 0.0], [0.045, -0.2], [-0.025, -0.2]], 0.042, 0, 0.005);
  for (let i = 0; i < 4; i++) mag.box(k.rubber, 0.0425, 0.0022, 0.06, 0, -0.05 - i * 0.04, 0.01, 0.0005);
  mag.box(k.poly, 0.044, 0.014, 0.075, 0, -0.205, 0.01, 0.004);
  const mg = mag.build();
  mg.position.set(0, -0.04, -0.03);
  const h = new Part();
  gripHand(h, k, [0, -0.1, 0.16], 0.018, 0.026, 0.065, 0.12, 1, 4);
  cupHand(h, k, [0, -0.026, -0.33], 0.023, 0.017, 0.14, -1, true);
  forearm(h, k, [0.04, -0.12, 0.2], [0.28, -0.3, 0.9], 0.5, 1);
  forearm(h, k, [-0.04, -0.05, -0.28], [-0.4, -0.28, 0.9], 0.7, -1);
  const slide = new Part();
  slide.box(k.chrome, 0.012, 0.016, 0.034, 0.032, 0.05, 0.2, 0.004);
  const sg = slide.build();
  const g = new THREE.Group();
  g.add(p.build(), mg, sg, h.build());
  g.position.set(0, 0, 0.0);
  return {
    g,
    muzzle: [0.025, -0.66],
    hip: [0.2, -0.2, -0.34],
    ads: [0, -0.115, -0.3],
    slide: sg,
    slideTravel: 0.05,
    mag: mg,
    flashSize: 1.7,
    eject: [0.027, 0.04, 0.0],
    shell: "shotgun",
  };
};

void ring;
