import * as THREE from "three";
import { Part, type Kit, cupHand, forearm, gripHand } from "./gunkit";
import type { Builder } from "./guns1";

/** Picatinny-style rail */
function rail(p: Part, k: Kit, z0: number, len: number, y: number, n?: number) {
  p.box(k.blued, 0.021, 0.007, len, 0, y, z0 - len / 2, 0.001);
  const c = n ?? Math.floor(len / 0.014);
  for (let i = 0; i < c; i++) p.box(k.rubber, 0.0222, 0.0036, 0.006, 0, y + 0.0014, z0 - 0.006 - i * (len / c), 0.0004);
}

/** Scope with lens glass, turrets, objective bell */
function scope(p: Part, k: Kit, y: number, z: number, len: number, r: number) {
  p.lathe(k.gunmetal, [[0.0, len / 2], [r * 0.7, len / 2], [r * 0.85, len / 2 - 0.02], [r * 0.7, len / 2 - 0.05], [r * 0.7, -len / 2 + 0.05], [r, -len / 2 + 0.02], [r * 1.35, -len / 2 + 0.0], [r * 1.38, -len / 2 - 0.012], [r * 1.3, -len / 2 - 0.02]], 0, y, z, 28);
  p.lathe(k.lens, [[0.0, 0], [r * 1.25, 0.0]], 0, y, z - len / 2 - 0.018, 24);
  p.lathe(k.lens, [[0.0, 0], [r * 0.62, 0.0]], 0, y, z + len / 2 + 0.002, 20);
  p.torus(k.rubber, r * 0.72, 0.005, 0, y, z + len / 2 - 0.012, [0, 0, 0], 20); // eyepiece rubber
  p.cylX(k.gunmetal, r * 0.5, r * 2.9, 0, y + r + 0.001, z, 12); // saddle
  p.cylY(k.gunmetal, r * 0.42, r * 0.8, 0, y + r + 0.012, z - 0.01, 12); // elevation turret
  p.cylX(k.gunmetal, r * 0.42, r * 0.8, r + 0.012, y, z - 0.01, 12); // windage turret
  p.torus(k.chrome, r * 0.72, 0.0022, 0, y, z - 0.03, [0, 0, 0], 20);
  p.cyl(k.gunmetal, r * 0.9, 0.012, 0, y, z + 0.05, 20);
  // rings mounts
  for (const zz of [z + len * 0.28, z - len * 0.2]) {
    p.torus(k.gunmetal, r * 0.74, 0.006, 0, y, zz, [0, 0, 0], 22);
    p.box(k.gunmetal, 0.032, y - 0.012, 0.016, 0, (y - 0.01) / 2 + 0.008, zz, 0.003);
  }
}

export const smg: Builder = (k) => {
  const p = new Part();
  // upper receiver w/ ribs & ejection port, shrouded barrel
  p.prism(k.gunmetal, [[0.2, 0.06], [-0.14, 0.06], [-0.18, 0.05], [-0.18, -0.03], [-0.1, -0.04], [0.2, -0.04]], 0.044, 0, 0.007);
  p.box(k.rubber, 0.046, 0.015, 0.07, 0, 0.044, -0.01, 0.003);
  rail(p, k, 0.14, 0.34, 0.066);
  for (let i = 0; i < 10; i++) p.box(k.blued, 0.0455, 0.003, 0.01, 0, 0.0, -0.17 + i * 0.0 - 0.012 * i + 0.1, 0.0004); // shroud vent ribs
  p.lathe(k.blued, [[0.0, 0], [0.019, 0], [0.019, -0.15], [0.014, -0.155], [0.014, -0.27], [0.0, -0.27]], 0, 0.016, -0.18, 20);
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) p.box(k.rubber, 0.002, 0.012, 0.012, s * 0.0192, 0.016, -0.2 - i * 0.022, 0.0005);
  // suppressor
  p.lathe(k.gunmetal, [[0.0, 0], [0.024, 0], [0.024, -0.16], [0.02, -0.165], [0.0, -0.165]], 0, 0.016, -0.45, 24);
  for (let i = 0; i < 5; i++) p.torus(k.blued, 0.0245, 0.0018, 0, 0.016, -0.48 - i * 0.025, [0, 0, 0], 22);
  // lower w/ grip + trigger group
  p.prism(k.poly, [[0.18, -0.03], [-0.02, -0.03], [-0.02, -0.06], [0.04, -0.07], [0.08, -0.06], [0.13, -0.065], [0.145, -0.17], [0.19, -0.17], [0.2, -0.05]], 0.04, 0, 0.007);
  for (let i = 0; i < 7; i++) p.box(k.rubber, 0.0415, 0.0018, 0.035, 0, -0.085 - i * 0.012, 0.15 + i * 0.002, 0.0005);
  p.torus(k.blued, 0.024, 0.0025, 0, -0.065, 0.045, [0, Math.PI / 2, 0], 18);
  p.box(k.chrome, 0.006, 0.022, 0.006, 0, -0.055, 0.05, 0.002, [-0.3, 0, 0]);
  p.box(k.chrome, 0.004, 0.008, 0.016, 0.0225, -0.02, 0.07, 0.001); // selector
  // front vertical grip
  p.prism(k.poly, [[-0.14, -0.04], [-0.1, -0.04], [-0.095, -0.15], [-0.14, -0.155]], 0.032, 0, 0.007);
  for (let i = 0; i < 5; i++) p.box(k.rubber, 0.033, 0.0016, 0.04, 0, -0.07 - i * 0.015, -0.12, 0.0004);
  // folding stock (wire)
  p.cap(k.blued, [0.022, 0.03, 0.2], [0.022, 0.02, 0.4], 0.0045);
  p.cap(k.blued, [-0.022, 0.03, 0.2], [-0.022, 0.02, 0.4], 0.0045);
  p.cap(k.blued, [0.022, 0.02, 0.4], [-0.022, 0.02, 0.4], 0.0045);
  p.cap(k.blued, [0.022, 0.02, 0.4], [0.022, -0.04, 0.38], 0.0045);
  p.cap(k.blued, [-0.022, 0.02, 0.4], [-0.022, -0.04, 0.38], 0.0045);
  p.box(k.rubber, 0.05, 0.075, 0.012, 0, -0.01, 0.405, 0.004);
  // red dot sight
  p.box(k.blued, 0.03, 0.026, 0.05, 0, 0.0865, 0.04, 0.006);
  p.box(k.glass, 0.024, 0.024, 0.003, 0, 0.1, 0.017, 0.0008, [-0.1, 0, 0]);
  p.sphere(k.dotRed, 0.0015, 0, 0.1, 0.014, 1, 1, 1, 6);
  p.box(k.blued, 0.006, 0.02, 0.01, 0, 0.083, -0.14, 0.002); // BUIS
  // charging handle (animated)
  const bolt = new Part();
  bolt.box(k.chrome, 0.012, 0.012, 0.03, 0.03, 0.04, 0.04, 0.004);
  bolt.box(k.blued, 0.004, 0.012, 0.03, 0.0225, 0.04, 0.04, 0.001);
  const bg = bolt.build();
  // mag (curved) - animated for reload
  const m = new Part();
  m.prism(k.blued, [[-0.02, 0.0], [0.035, 0.0], [0.03, -0.1], [0.012, -0.2], [-0.04, -0.2], [-0.04, -0.1]], 0.03, 0, 0.004);
  for (let i = 0; i < 5; i++) m.box(k.rubber, 0.0305, 0.0018, 0.05, 0, -0.04 - i * 0.03, -0.0 - i * 0.004, 0.0004);
  m.box(k.poly, 0.032, 0.012, 0.062, 0, -0.205, -0.014, 0.003);
  const mg = m.build();
  mg.position.set(0, -0.04, 0.095);
  const h = new Part();
  gripHand(h, k, [0, -0.115, 0.168], 0.017, 0.022, 0.06, 0.15, 1, 4);
  cupHand(h, k, [0, -0.095, -0.12], 0.016, 0.0, 0.1, -1, true);
  forearm(h, k, [0.04, -0.125, 0.19], [0.3, -0.3, 0.9], 0.5, 1);
  forearm(h, k, [-0.04, -0.1, -0.1], [-0.4, -0.25, 0.9], 0.7, -1);
  const g = new THREE.Group();
  g.add(p.build(), mg, bg, h.build());
  return { g, muzzle: [0.016, -0.62], hip: [0.2, -0.19, -0.32], ads: [0, -0.1, -0.28], slide: bg, slideTravel: 0.06, mag: mg, flashSize: 0.55, eject: [0.024, 0.04, -0.01], shell: "pistol" };
};

function akBody(p: Part, k: Kit, wood: boolean) {
  const W = wood ? k.wood : k.poly;
  // stamped receiver w/ dust cover
  p.prism(k.blued, [[0.16, 0.05], [-0.15, 0.05], [-0.17, 0.035], [-0.17, -0.04], [0.16, -0.04]], 0.038, 0, 0.004);
  p.prism(k.blued, [[0.16, 0.058], [0.05, 0.062], [-0.12, 0.058], [-0.15, 0.05], [0.16, 0.05]], 0.034, 0, 0.004); // dust cover
  p.box(k.chrome, 0.039, 0.006, 0.07, 0, 0.0, -0.01, 0.002); // lever markings
  // gas block, tube, front sight post, barrel
  p.lathe(k.blued, [[0.0, 0], [0.0125, 0], [0.0125, -0.45], [0.0155, -0.452], [0.0155, -0.5], [0.0, -0.5]], 0, 0.025, -0.15, 20);
  p.lathe(k.gunmetal, [[0.0, 0], [0.012, 0], [0.012, -0.31], [0.0, -0.31]], 0, 0.056, -0.27, 16); // gas tube
  p.box(k.blued, 0.03, 0.044, 0.04, 0, 0.044, -0.58, 0.006); // gas block
  p.prism(k.blued, [[-0.64, 0.025], [-0.62, 0.025], [-0.615, 0.095], [-0.635, 0.095]], 0.004, 0, 0.001); // front post
  p.torus(k.blued, 0.012, 0.0022, 0, 0.082, -0.628, [0, 0, 0], 12);
  p.lathe(k.chrome, [[0.0, 0], [0.011, 0], [0.0135, -0.01], [0.0135, -0.04], [0.0, -0.04]], 0, 0.025, -0.7, 16); // muzzle device
  for (let i = 0; i < 3; i++) p.box(k.rubber, 0.0275, 0.003, 0.006, 0, 0.025, -0.712 - i * 0.012, 0.0004);
  p.cyl(k.blued, 0.0045, 0.12, 0, 0.0, -0.36, 8); // cleaning rod
  // wood furniture or poly
  p.prism(W, [[-0.18, 0.04], [-0.32, 0.05], [-0.5, 0.047], [-0.5, -0.01], [-0.32, -0.025], [-0.18, -0.03]], 0.04, 0, 0.01);
  p.prism(W, [[-0.34, 0.095], [-0.55, 0.075], [-0.55, 0.055], [-0.34, 0.058]], 0.036, 0, 0.007); // upper handguard
  for (let i = 0; i < 7; i++) p.box(k.rubber, 0.0375, 0.0016, 0.03, 0, 0.082 - i * 0.0005, -0.36 - i * 0.026, 0.0003);
  // pistol grip + trigger group
  p.prism(W, [[0.1, -0.035], [0.075, -0.06], [0.09, -0.165], [0.135, -0.16], [0.14, -0.045]], 0.036, 0, 0.008);
  p.torus(k.blued, 0.027, 0.0025, 0, -0.058, 0.04, [0, Math.PI / 2, 0], 20);
  p.box(k.chrome, 0.006, 0.024, 0.006, 0, -0.04, 0.036, 0.002, [-0.3, 0, 0]);
  // selector lever, rear sight tangent
  p.prism(k.blued, [[0.0, 0.036], [0.0, 0.03], [0.14, -0.012], [0.14, -0.008]], 0.004, 0.0205, 0.0006);
  p.prism(k.blued, [[-0.22, 0.062], [-0.3, 0.066], [-0.31, 0.078], [-0.22, 0.078]], 0.02, 0, 0.002);
  p.box(k.blued, 0.012, 0.008, 0.02, 0, 0.082, -0.26, 0.002);
  // stock
  p.prism(W, [[0.16, 0.04], [0.3, 0.033], [0.54, 0.018], [0.56, -0.1], [0.5, -0.115], [0.3, -0.05], [0.16, -0.04]], 0.036, 0, 0.008);
  p.prism(k.rubber, [[0.545, 0.02], [0.565, 0.015], [0.57, -0.1], [0.55, -0.12]], 0.038, 0, 0.003);
  p.cylX(k.chrome, 0.004, 0.04, 0, -0.012, 0.28, 8);
}

export const rifle: Builder = (k) => {
  const p = new Part();
  akBody(p, k, true);
  // banana mag (animated)
  const m = new Part();
  m.prism(k.blued, [[-0.02, 0.0], [0.04, 0.0], [0.07, -0.1], [0.115, -0.17], [0.075, -0.205], [0.0, -0.13], [-0.03, -0.06]], 0.032, 0, 0.004);
  for (let i = 0; i < 6; i++) m.box(k.rubber, 0.0325, 0.0016, 0.024, 0, -0.03 - i * 0.026, 0.03 + i * 0.012, 0.0003, [0.4 + i * 0.1, 0, 0]);
  m.prism(k.steel, [[-0.012, -0.002], [0.034, -0.002], [0.04, -0.008], [-0.017, -0.008]], 0.034, 0, 0.001);
  const mg = m.build();
  mg.position.set(0, -0.04, -0.04);
  const b = new Part();
  b.box(k.chrome, 0.012, 0.016, 0.034, 0.028, 0.034, 0.0, 0.004);
  b.box(k.blued, 0.003, 0.014, 0.03, 0.021, 0.034, 0.0, 0.001);
  const bolt = b.build();
  bolt.position.z = 0.0;
  const h = new Part();
  gripHand(h, k, [0, -0.1, 0.108], 0.016, 0.022, 0.06, 0.24, 1, 4);
  cupHand(h, k, [0, 0.01, -0.36], 0.026, 0.035, 0.12, -1, true);
  forearm(h, k, [0.04, -0.13, 0.12], [0.3, -0.3, 0.9], 0.55, 1);
  forearm(h, k, [-0.05, -0.02, -0.34], [-0.4, -0.25, 0.9], 0.8, -1);
  const g = new THREE.Group();
  g.add(p.build(), mg, bolt, h.build());
  return { g, muzzle: [0.025, -0.76], hip: [0.2, -0.2, -0.3], ads: [0, -0.087, -0.26], slide: bolt, slideTravel: 0.07, mag: mg, flashSize: 1.2, eject: [0.022, 0.04, 0.0], shell: "rifle" };
};

export const dmr: Builder = (k) => {
  const p = new Part();
  // M14-style: walnut stock full length, long barrel, scope, box magazine, bipod
  p.prism(k.woodDark, [[0.18, 0.04], [0.32, 0.04], [0.55, 0.03], [0.58, -0.095], [0.5, -0.115], [0.32, -0.065], [0.15, -0.05], [-0.1, -0.05], [-0.3, -0.04], [-0.55, -0.03], [-0.55, 0.0], [-0.3, 0.02], [-0.12, 0.03]], 0.04, 0, 0.01);
  p.prism(k.woodDark, [[-0.2, 0.065], [-0.55, 0.05], [-0.55, 0.02], [-0.2, 0.03]], 0.036, 0, 0.007);
  p.prism(k.blued, [[0.18, 0.055], [-0.14, 0.055], [-0.16, 0.04], [-0.16, -0.03], [0.18, -0.03]], 0.036, 0, 0.004);
  p.lathe(k.blued, [[0.0, 0], [0.0125, 0], [0.0125, -0.58], [0.0145, -0.585], [0.0145, -0.62], [0.0, -0.62]], 0, 0.036, -0.14, 20);
  p.lathe(k.chrome, [[0.0, 0], [0.0125, 0], [0.0165, -0.012], [0.0165, -0.06], [0.0, -0.06]], 0, 0.036, -0.76, 20);
  for (let i = 0; i < 4; i++) p.box(k.rubber, 0.0345, 0.004, 0.006, 0, 0.036, -0.78 - i * 0.012, 0.0005);
  p.cap(k.chrome, [0.0, 0.03, -0.6], [0.0, 0.01, -0.5], 0.003);
  p.prism(k.blued, [[-0.66, 0.036], [-0.64, 0.036], [-0.635, 0.062], [-0.655, 0.062]], 0.004, 0, 0.001);
  // trigger group
  p.torus(k.blued, 0.027, 0.0025, 0, -0.056, 0.04, [0, Math.PI / 2, 0], 20);
  p.box(k.chrome, 0.006, 0.022, 0.006, 0, -0.04, 0.036, 0.002, [-0.3, 0, 0]);
  // scope
  scope(p, k, 0.092, -0.02, 0.2, 0.0225);
  p.box(k.blued, 0.03, 0.016, 0.1, 0, 0.066, -0.02, 0.004);
  // bipod folded under handguard
  p.cap(k.gunmetal, [0.012, -0.02, -0.44], [0.016, -0.04, -0.58], 0.004);
  p.cap(k.gunmetal, [-0.012, -0.02, -0.44], [-0.016, -0.04, -0.58], 0.004);
  p.box(k.gunmetal, 0.04, 0.012, 0.03, 0, -0.025, -0.44, 0.004);
  // magazine
  const m = new Part();
  m.prism(k.blued, [[-0.03, 0.0], [0.03, 0.0], [0.034, -0.1], [-0.034, -0.1]], 0.026, 0, 0.003);
  for (let i = 0; i < 3; i++) m.box(k.rubber, 0.027, 0.0016, 0.05, 0, -0.03 - i * 0.025, 0.0, 0.0004);
  m.box(k.gunmetal, 0.028, 0.008, 0.075, 0, -0.103, 0.0, 0.003);
  const mg = m.build();
  mg.position.set(0, -0.032, 0.02);
  const b = new Part();
  b.box(k.chrome, 0.012, 0.016, 0.034, 0.028, 0.03, 0.0, 0.004);
  const bolt = b.build();
  const h = new Part();
  gripHand(h, k, [0, -0.04, 0.2], 0.017, 0.026, 0.05, 0.3, 1, 4);
  cupHand(h, k, [0, 0.0, -0.38], 0.02, 0.025, 0.1, -1, true);
  forearm(h, k, [0.04, -0.07, 0.24], [0.3, -0.3, 0.9], 0.55, 1);
  forearm(h, k, [-0.05, -0.04, -0.36], [-0.4, -0.25, 0.9], 0.8, -1);
  const g = new THREE.Group();
  g.add(p.build(), mg, bolt, h.build());
  return { g, muzzle: [0.036, -0.82], hip: [0.2, -0.2, -0.3], ads: [0, -0.095, -0.24], slide: bolt, slideTravel: 0.05, mag: mg, flashSize: 1.3, eject: [0.022, 0.04, 0.0], shell: "rifle" };
};

export const sniper: Builder = (k) => {
  const p = new Part();
  // heavy barrel w/ fluting + muzzle brake, chassis, big scope, bipod, cheek riser
  p.lathe(k.gunmetal, [[0.0, 0], [0.0175, 0], [0.0175, -0.8], [0.015, -0.81], [0.015, -0.95], [0.0, -0.95]], 0, 0.034, -0.16, 26);
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) p.box(k.rubber, 0.002, 0.006, 0.12, s * 0.0173, 0.034, -0.26 - i * 0.12, 0.0005);
  p.lathe(k.blued, [[0.0, 0], [0.015, 0], [0.025, -0.02], [0.025, -0.12], [0.0, -0.12]], 0, 0.034, -1.08, 22);
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) p.box(k.rubber, 0.003, 0.014, 0.012, s * 0.0252, 0.034, -1.11 - i * 0.02, 0.0006);
  // chassis
  p.prism(k.tan, [[0.2, 0.05], [-0.1, 0.055], [-0.6, 0.04], [-0.6, -0.02], [-0.3, -0.035], [-0.1, -0.045], [0.0, -0.1], [0.04, -0.17], [0.12, -0.16], [0.13, -0.06], [0.2, -0.04]], 0.044, 0, 0.008);
  p.prism(k.tan, [[0.19, 0.045], [0.35, 0.045], [0.6, 0.02], [0.62, -0.12], [0.5, -0.125], [0.35, -0.04], [0.2, -0.03]], 0.04, 0, 0.01);
  p.prism(k.rubber, [[0.6, 0.02], [0.63, 0.015], [0.635, -0.115], [0.62, -0.125]], 0.042, 0, 0.004);
  p.box(k.poly, 0.036, 0.04, 0.2, 0, 0.065, 0.45, 0.01); // adjustable cheek riser
  for (let i = 0; i < 6; i++) p.box(k.rubber, 0.0375, 0.0016, 0.035, 0, 0.066, 0.36 + i * 0.03, 0.0004);
  p.cylY(k.chrome, 0.004, 0.06, 0, 0.04, 0.4, 8);
  // handguard rail
  p.box(k.gunmetal, 0.048, 0.04, 0.34, 0, 0.0, -0.34, 0.014);
  rail(p, k, -0.1, 0.4, 0.074);
  scope(p, k, 0.11, -0.12, 0.34, 0.0265);
  // bolt (animated)
  const b = new Part();
  b.cap(k.chrome, [0.01, 0.04, 0.02], [0.065, 0.02, 0.02], 0.005);
  b.sphere(k.chrome, 0.012, 0.075, 0.017, 0.02, 1, 1, 1, 10);
  b.cyl(k.steel, 0.011, 0.07, 0.0, 0.04, 0.05, 14);
  const bolt = b.build();
  // trigger group & guard
  p.torus(k.blued, 0.03, 0.0028, 0, -0.07, 0.06, [0, Math.PI / 2, 0], 20);
  p.box(k.chrome, 0.006, 0.026, 0.006, 0, -0.05, 0.06, 0.002, [-0.3, 0, 0]);
  // box mag
  p.box(k.gunmetal, 0.032, 0.09, 0.08, 0, -0.07, -0.08, 0.008);
  // bipod folded
  p.cap(k.gunmetal, [0.016, -0.02, -0.45], [0.02, -0.05, -0.62], 0.0045);
  p.cap(k.gunmetal, [-0.016, -0.02, -0.45], [-0.02, -0.05, -0.62], 0.0045);
  const h = new Part();
  gripHand(h, k, [0, -0.1, 0.095], 0.017, 0.022, 0.06, 0.25, 1, 4);
  cupHand(h, k, [0, -0.04, -0.3], 0.024, 0.02, 0.12, -1, true);
  forearm(h, k, [0.04, -0.12, 0.12], [0.3, -0.3, 0.9], 0.55, 1);
  forearm(h, k, [-0.05, -0.06, -0.3], [-0.4, -0.25, 0.9], 0.8, -1);
  const g = new THREE.Group();
  g.add(p.build(), bolt, h.build());
  bolt.position.set(0, 0, 0);
  return { g, muzzle: [0.034, -1.2], hip: [0.2, -0.2, -0.3], ads: [0, -0.12, -0.22], slide: bolt, slideTravel: 0.07, hideOnAds: true, flashSize: 1.5, eject: [0.02, 0.04, 0.03], shell: "rifle" };
};

export const crossbow: Builder = (k) => {
  const p = new Part();
  // tactical crossbow: stock w/ rail, composite limbs with pulleys, taut string, loaded bolt
  p.prism(k.poly, [[0.3, 0.03], [0.0, 0.045], [-0.3, 0.045], [-0.5, 0.03], [-0.5, 0.0], [-0.2, -0.015], [-0.02, -0.04], [0.02, -0.12], [0.07, -0.13], [0.09, -0.05], [0.18, -0.03], [0.32, -0.045], [0.34, 0.0]], 0.042, 0, 0.009);
  p.box(k.olive, 0.043, 0.03, 0.6, 0, 0.0, -0.1, 0.01);
  rail(p, k, 0.1, 0.5, 0.06);
  p.box(k.alum, 0.014, 0.004, 0.3, 0, 0.056, -0.38, 0.001); // flight groove
  // limbs (bow) – curved composite built from segments
  const limb = new Part();
  for (const s of [-1, 1]) {
    let px = 0.02 * s,
      py = 0.03,
      pz = -0.5;
    for (let i = 1; i <= 8; i++) {
      const t = i / 8;
      const nx = s * (0.02 + t * 0.31);
      const nz = -0.5 + Math.sin(t * Math.PI * 0.5) * 0.045 + t * t * 0.14;
      limb.tube(k.rubber, [px, py, pz], [nx, py, nz], 0.012 - t * 0.005, 0.012 - (t + 0.125) * 0.005 + 0.0, 8);
      px = nx;
      pz = nz;
    }
    limb.cyl(k.alum, 0.027, 0.012, s * 0.335, py, pz + 0.01, 20); // cam wheel
    limb.cyl(k.red, 0.012, 0.016, s * 0.335, py, pz + 0.01, 14);
    limb.cyl(k.chrome, 0.004, 0.02, s * 0.335, py, pz + 0.01, 8);
    // string runs from cam to centre nock
    limb.cap(k.blade, [s * 0.335, py, pz + 0.03], [0, py, -0.3], 0.0012, 5);
  }
  p.box(k.alum, 0.06, 0.03, 0.05, 0, 0.03, -0.5, 0.01); // riser
  // bolt
  p.cyl(k.alum, 0.0042, 0.46, 0, 0.0485, -0.17, 10);
  p.cone(k.steel, 0.0058, 0.05, 0, 0.0485, -0.425, 12);
  p.box(k.red, 0.016, 0.0006, 0.04, 0, 0.0485, -0.0, 0.0002);
  p.box(k.red, 0.0006, 0.016, 0.04, 0, 0.0485, -0.0, 0.0002);
  // scope
  scope(p, k, 0.096, -0.06, 0.17, 0.0195);
  // trigger + guard + foregrip
  p.torus(k.blued, 0.024, 0.0025, 0, -0.065, 0.04, [0, Math.PI / 2, 0], 18);
  p.box(k.chrome, 0.006, 0.022, 0.006, 0, -0.04, 0.04, 0.002, [-0.3, 0, 0]);
  p.prism(k.poly, [[-0.18, -0.01], [-0.1, -0.01], [-0.09, -0.12], [-0.18, -0.12]], 0.036, 0, 0.01);
  const h = new Part();
  gripHand(h, k, [0, -0.085, 0.075], 0.018, 0.024, 0.055, 0.2, 1, 4);
  cupHand(h, k, [0, -0.07, -0.14], 0.018, 0.04, 0.1, -1, true);
  forearm(h, k, [0.04, -0.1, 0.1], [0.3, -0.3, 0.9], 0.55, 1);
  forearm(h, k, [-0.05, -0.1, -0.12], [-0.4, -0.25, 0.9], 0.8, -1);
  const lg = limb.build();
  const g = new THREE.Group();
  g.add(p.build(), lg, h.build());
  return { g, muzzle: [0.0485, -0.46], hip: [0.2, -0.2, -0.3], ads: [0, -0.108, -0.26], slide: lg, slideTravel: 0, flashSize: 0.01, shell: "none" };
};

export const flame: Builder = (k) => {
  const p = new Part();
  // pressure tank (side) + fuel tank (top) with gauges, hoses, nozzle, pilot light
  p.lathe(k.red, [[0.0, 0.19], [0.05, 0.19], [0.075, 0.17], [0.08, 0.1], [0.08, -0.1], [0.075, -0.17], [0.05, -0.19], [0.0, -0.19]], 0.1, 0.12, 0.12, 26);
  p.lathe(k.steel, [[0.0, 0.0], [0.032, 0.0], [0.036, -0.012], [0.0, -0.012]], 0.1, 0.12, -0.075, 20); // valve cap
  for (let i = 0; i < 3; i++) p.torus(k.blued, 0.081, 0.004, 0.1, 0.12, 0.12 - 0.12 + i * 0.12 - 0.12, [0, 0, 0], 26);
  p.cap(k.blued, [0.1, 0.12, 0.28], [0.1, 0.04, 0.0], 0.007);
  // body: receiver w/ pressure gauge
  p.prism(k.gunmetal, [[0.1, 0.05], [-0.1, 0.05], [-0.14, 0.02], [-0.14, -0.03], [0.1, -0.04]], 0.06, 0, 0.012);
  p.cylX(k.chrome, 0.026, 0.01, -0.035, 0.05, 0.0, 22);
  p.cylX(k.screen, 0.021, 0.004, -0.04, 0.05, 0.0, 22);
  p.box(k.red, 0.003, 0.002, 0.018, -0.0425, 0.052, 0.0, 0.0005, [0.4, 0.0, 0.0]);
  // heat-shielded barrel with spiral coil
  p.lathe(k.blued, [[0.0, 0], [0.03, 0], [0.03, -0.5], [0.0, -0.5]], 0, 0.02, -0.14, 24);
  for (let i = 0; i < 14; i++) p.torus(k.brass, 0.0305, 0.003, 0, 0.02, -0.18 - i * 0.03, [0, 0, 0], 22);
  p.lathe(k.gunmetal, [[0.0, 0], [0.034, 0], [0.04, -0.03], [0.03, -0.12], [0.0, -0.12]], 0, 0.02, -0.64, 24); // nozzle bell
  p.lathe(k.rubber, [[0.0, 0], [0.026, 0], [0.026, -0.002], [0.0, -0.002]], 0, 0.02, -0.76, 18);
  // pilot flame assembly
  p.cap(k.chrome, [0.0, 0.05, -0.5], [0.0, 0.07, -0.74], 0.004);
  p.sphere(k.cyan, 0.008, 0.0, 0.075, -0.745, 1, 1.6, 1, 8);
  // hoses
  p.tube(k.rubber, [0.1, 0.1, 0.28], [0.03, 0.03, 0.12], 0.011, 0.011);
  p.tube(k.rubber, [0.1, 0.1, 0.0], [0.03, 0.03, -0.1], 0.01, 0.01);
  // grips
  p.prism(k.poly, [[0.1, -0.04], [0.08, -0.06], [0.1, -0.16], [0.14, -0.16], [0.15, -0.05]], 0.038, 0, 0.008);
  p.prism(k.poly, [[-0.3, -0.02], [-0.25, -0.02], [-0.24, -0.12], [-0.3, -0.12]], 0.036, 0, 0.008);
  p.torus(k.blued, 0.024, 0.0025, 0, -0.06, 0.04, [0, Math.PI / 2, 0], 18);
  const h = new Part();
  gripHand(h, k, [0, -0.1, 0.118], 0.018, 0.024, 0.06, 0.15, 1, 4);
  cupHand(h, k, [0, -0.07, -0.27], 0.016, 0.0, 0.1, -1, true);
  forearm(h, k, [0.04, -0.12, 0.14], [0.3, -0.3, 0.9], 0.55, 1);
  forearm(h, k, [-0.04, -0.07, -0.25], [-0.4, -0.25, 0.9], 0.8, -1);
  const g = new THREE.Group();
  g.add(p.build(), h.build());
  return { g, muzzle: [0.02, -0.78], hip: [0.2, -0.22, -0.38], ads: [0.0, -0.15, -0.34], flashSize: 1.1, shell: "none" };
};

export const rocket: Builder = (k) => {
  const p = new Part();
  // RPG-7: tube, venturi, warhead w/ fins, optic, wooden heat-shield grips
  p.lathe(k.olive, [[0.0, 0.4], [0.032, 0.4], [0.042, 0.3], [0.042, -0.3], [0.0, -0.3]], 0, 0, 0.0, 28);
  p.lathe(k.gunmetal, [[0.0, 0.0], [0.034, 0.0], [0.07, -0.16], [0.075, -0.2], [0.0, -0.2]], 0, 0, 0.58, 30); // venturi flare
  p.lathe(k.rubber, [[0.0, 0.0], [0.072, 0.0], [0.072, -0.004], [0.0, -0.004]], 0, 0, 0.58, 24);
  for (let i = 0; i < 6; i++) p.torus(k.blued, 0.045, 0.003, 0, 0, 0.2 + i * 0.03, [0, 0, 0], 22);
  // heat shield wood wraps
  p.lathe(k.wood, [[0.0, 0.0], [0.049, 0.0], [0.05, -0.02], [0.05, -0.28], [0.0, -0.3]], 0, 0, 0.2, 26);
  // rocket warhead
  p.lathe(k.olive, [[0.0, 0.0], [0.03, 0.0], [0.034, -0.02], [0.03, -0.18], [0.075, -0.25], [0.08, -0.36], [0.065, -0.48], [0.03, -0.56], [0.0, -0.62]], 0, 0, -0.18, 30);
  p.torus(k.red, 0.0805, 0.004, 0, 0, -0.34, [0, 0, 0], 26);
  p.lathe(k.red, [[0.0, 0.0], [0.03, 0.0], [0.02, -0.04], [0.0, -0.06]], 0, 0, -0.8, 18);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    p.box(k.blued, 0.004, 0.06, 0.07, Math.cos(a) * 0.052, Math.sin(a) * 0.052, -0.17, 0.001, [0, 0, a - Math.PI / 2]);
  }
  // optic
  p.box(k.gunmetal, 0.04, 0.05, 0.14, 0.06, 0.07, -0.02, 0.01);
  p.cyl(k.gunmetal, 0.018, 0.12, 0.06, 0.1, -0.08, 20);
  p.lathe(k.lens, [[0.0, 0], [0.0165, 0]], 0.06, 0.1, -0.142, 18);
  p.cap(k.gunmetal, [0.03, 0.04, -0.02], [0.05, 0.065, -0.02], 0.007);
  // hammer housing / trigger group / foregrip
  p.box(k.gunmetal, 0.045, 0.06, 0.1, 0, -0.065, 0.08, 0.012);
  p.prism(k.wood, [[0.13, -0.08], [0.09, -0.08], [0.085, -0.19], [0.12, -0.2], [0.14, -0.15]], 0.036, 0, 0.01);
  p.prism(k.wood, [[-0.2, -0.04], [-0.14, -0.04], [-0.13, -0.15], [-0.2, -0.16]], 0.034, 0, 0.01);
  p.torus(k.blued, 0.025, 0.0025, 0, -0.095, 0.05, [0, Math.PI / 2, 0], 18);
  p.box(k.chrome, 0.006, 0.022, 0.006, 0, -0.078, 0.048, 0.002, [-0.3, 0, 0]);
  const h = new Part();
  gripHand(h, k, [0, -0.15, 0.11], 0.017, 0.022, 0.06, 0.12, 1, 4);
  cupHand(h, k, [0, -0.09, -0.17], 0.017, 0.0, 0.1, -1, true);
  forearm(h, k, [0.04, -0.17, 0.14], [0.3, -0.3, 0.9], 0.55, 1);
  forearm(h, k, [-0.04, -0.1, -0.14], [-0.4, -0.25, 0.9], 0.8, -1);
  const g = new THREE.Group();
  g.add(p.build(), h.build());
  return { g, muzzle: [0.0, -0.84], hip: [0.17, -0.2, -0.35], ads: [-0.06, -0.12, -0.3], flashSize: 2, shell: "none" };
};

export const glauncher: Builder = (k) => {
  const p = new Part();
  // M79-ish 40mm: broken-action break-open launcher with wood stock
  p.lathe(k.blued, [[0.0, 0], [0.026, 0], [0.026, -0.36], [0.029, -0.365], [0.029, -0.38], [0.0, -0.38]], 0, 0.02, -0.06, 28);
  p.lathe(k.rubber, [[0.0, 0], [0.022, 0], [0.022, -0.003], [0.0, -0.003]], 0, 0.02, -0.44, 22);
  p.box(k.gunmetal, 0.04, 0.06, 0.16, 0, 0.0, 0.0, 0.01);
  p.prism(k.gunmetal, [[0.1, 0.045], [0.0, 0.05], [-0.08, 0.04], [-0.1, -0.02], [0.0, -0.045], [0.1, -0.04]], 0.046, 0, 0.008);
  p.box(k.chrome, 0.012, 0.012, 0.05, 0, 0.05, 0.08, 0.004); // latch
  // wood stock
  p.prism(k.wood, [[0.1, 0.035], [0.3, 0.03], [0.5, 0.02], [0.52, -0.1], [0.46, -0.12], [0.28, -0.07], [0.12, -0.045]], 0.04, 0, 0.01);
  p.prism(k.rubber, [[0.5, 0.025], [0.525, 0.02], [0.53, -0.1], [0.51, -0.125]], 0.042, 0, 0.003);
  // forend
  p.prism(k.wood, [[-0.1, 0.0], [-0.34, 0.0], [-0.34, -0.055], [-0.1, -0.06]], 0.04, 0, 0.01);
  // leaf sight (flip-up)
  p.box(k.blued, 0.02, 0.006, 0.05, 0, 0.1, 0.0, 0.002);
  p.box(k.blued, 0.004, 0.056, 0.01, 0.014, 0.075, 0.0, 0.001);
  p.box(k.blued, 0.004, 0.056, 0.01, -0.014, 0.075, 0.0, 0.001);
  p.box(k.blued, 0.004, 0.02, 0.01, 0, 0.0525, -0.4, 0.001);
  // shell sling loops and 40mm round chambered
  p.lathe(k.brass, [[0.0, 0], [0.024, 0], [0.024, -0.05], [0.0, -0.05]], 0, 0.02, -0.436, 20);
  p.torus(k.blued, 0.025, 0.0025, 0, -0.06, 0.03, [0, Math.PI / 2, 0], 18);
  p.box(k.chrome, 0.006, 0.022, 0.006, 0, -0.045, 0.03, 0.002, [-0.3, 0, 0]);
  p.prism(k.wood, [[0.12, -0.04], [0.08, -0.04], [0.09, -0.12], [0.13, -0.12]], 0.036, 0, 0.01);
  const h = new Part();
  gripHand(h, k, [0, -0.07, 0.115], 0.017, 0.02, 0.055, 0.2, 1, 4);
  cupHand(h, k, [0, -0.03, -0.22], 0.021, 0.026, 0.1, -1, true);
  forearm(h, k, [0.04, -0.09, 0.14], [0.3, -0.3, 0.9], 0.55, 1);
  forearm(h, k, [-0.04, -0.04, -0.2], [-0.4, -0.25, 0.9], 0.8, -1);
  const g = new THREE.Group();
  g.add(p.build(), h.build());
  return { g, muzzle: [0.02, -0.46], hip: [0.2, -0.2, -0.34], ads: [0, -0.1, -0.3], flashSize: 1.6, shell: "none" };
};

export const arc: Builder = (k) => {
  const p = new Part();
  // sci-fi tesla coil rifle: tapered body, coil rings with glowing cyan windings, electrodes
  p.lathe(k.alum, [[0.0, 0.3], [0.034, 0.3], [0.042, 0.2], [0.046, 0.0], [0.04, -0.15], [0.0, -0.15]], 0, 0.01, 0.0, 28);
  p.lathe(k.gunmetal, [[0.0, 0.0], [0.03, 0.0], [0.03, -0.55], [0.0, -0.55]], 0, 0.01, -0.15, 24); // core tube
  // coil windings
  for (let i = 0; i < 14; i++) p.torus(k.brass, 0.037, 0.006, 0, 0.01, -0.18 - i * 0.034, [0, 0, 0], 24);
  for (let i = 0; i < 7; i++) p.cyl(k.alum, 0.044, 0.01, 0, 0.01, -0.17 - i * 0.07, 26);
  // glowing core (emissive) – also animated in idle
  const glow = new THREE.MeshBasicMaterial({ color: 0x66e8ff });
  p.cyl(glow, 0.012, 0.5, 0, 0.01, -0.45, 12);
  for (let i = 0; i < 7; i++) p.cyl(glow, 0.04, 0.003, 0, 0.01, -0.2 - i * 0.07 - 0.01, 22);
  // prongs & emitter
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    p.cap(k.chrome, [Math.cos(a) * 0.03, 0.01 + Math.sin(a) * 0.03, -0.7], [Math.cos(a) * 0.012, 0.01 + Math.sin(a) * 0.012, -0.84], 0.0035);
    p.sphere(k.cyan, 0.006, Math.cos(a) * 0.012, 0.01 + Math.sin(a) * 0.012, -0.84, 1, 1, 1, 8);
  }
  p.lathe(k.alum, [[0.0, 0.0], [0.04, 0.0], [0.03, -0.04], [0.0, -0.04]], 0, 0.01, -0.7, 22);
  // power cell on top with display
  p.box(k.poly, 0.05, 0.05, 0.16, 0, 0.075, 0.12, 0.014);
  p.box(k.screen, 0.03, 0.002, 0.06, 0, 0.1, 0.12, 0.0006);
  for (let i = 0; i < 5; i++) p.box(i < 4 ? glow : k.hot, 0.004, 0.004, 0.008, -0.012 + i * 0.006, 0.101, 0.152, 0.0005);
  p.box(k.olive, 0.03, 0.03, 0.12, 0.05, 0.03, 0.18, 0.01);
  // grip + trigger guard + stock
  p.prism(k.poly, [[0.18, -0.02], [0.14, -0.04], [0.16, -0.16], [0.21, -0.16], [0.22, -0.04]], 0.04, 0, 0.01);
  p.torus(k.alum, 0.026, 0.003, 0, -0.045, 0.1, [0, Math.PI / 2, 0], 18);
  p.box(k.cyan, 0.006, 0.022, 0.006, 0, -0.03, 0.1, 0.002, [-0.3, 0, 0]);
  p.prism(k.poly, [[0.3, 0.03], [0.5, 0.03], [0.5, -0.09], [0.36, -0.06]], 0.04, 0, 0.012);
  const h = new Part();
  gripHand(h, k, [0, -0.1, 0.18], 0.018, 0.024, 0.06, 0.16, 1, 4);
  cupHand(h, k, [0, -0.01, -0.12], 0.036, 0.04, 0.1, -1, true);
  forearm(h, k, [0.04, -0.12, 0.2], [0.3, -0.3, 0.9], 0.55, 1);
  forearm(h, k, [-0.06, -0.03, -0.1], [-0.4, -0.25, 0.9], 0.8, -1);
  const g = new THREE.Group();
  g.add(p.build(), h.build());
  return {
    g,
    muzzle: [0.01, -0.86],
    hip: [0.2, -0.2, -0.34],
    ads: [0, -0.11, -0.3],
    flashSize: 1.2,
    shell: "none",
    glow,
    idle: (t) => {
      glow.color.setHSL(0.5 + Math.sin(t * 7) * 0.02, 1, 0.62 + Math.sin(t * 13) * 0.1);
    },
  };
};

export const railgun: Builder = (k) => {
  const p = new Part();
  // twin-rail accelerator with capacitor bank and glowing slot
  const glow = new THREE.MeshBasicMaterial({ color: 0xff5a2a });
  for (const s of [-1, 1]) {
    p.box(k.chrome, 0.018, 0.026, 0.8, s * 0.026, 0.02, -0.4, 0.005);
    p.box(k.brass, 0.004, 0.02, 0.8, s * 0.0165, 0.02, -0.4, 0.001);
    for (let i = 0; i < 9; i++) p.box(k.gunmetal, 0.014, 0.05, 0.016, s * 0.026, 0.02, -0.08 - i * 0.09, 0.004);
  }
  p.box(glow, 0.01, 0.006, 0.7, 0, 0.02, -0.42, 0.001);
  // spine
  p.prism(k.alum, [[0.2, 0.07], [0.0, 0.075], [-0.1, 0.05], [-0.1, -0.03], [0.0, -0.05], [0.2, -0.04]], 0.05, 0, 0.012);
  // capacitor cylinders
  for (let i = 0; i < 3; i++) {
    p.cyl(k.gunmetal, 0.026, 0.12, 0.05 * (i - 1) * 0 + (i - 1) * 0.0, 0.1 + 0.0, 0.18 - i * 0.0, 20);
  }
  p.lathe(k.gunmetal, [[0.0, 0.12], [0.028, 0.12], [0.03, 0.1], [0.03, -0.1], [0.028, -0.12], [0.0, -0.12]], 0, 0.1, 0.06, 24);
  for (let i = 0; i < 5; i++) p.torus(glow, 0.0305, 0.0022, 0, 0.1, 0.0 + i * 0.045 - 0.07, [0, 0, 0], 24);
  p.lathe(k.alum, [[0.0, 0.1], [0.035, 0.1], [0.035, -0.1], [0.0, -0.1]], 0.05, 0.075, 0.16, 20);
  // emitter nozzle
  p.lathe(k.gunmetal, [[0.0, 0.0], [0.05, 0.0], [0.04, -0.06], [0.0, -0.06]], 0, 0.02, -0.82, 22);
  // optics: holo sight
  p.box(k.poly, 0.04, 0.03, 0.07, 0, 0.115, -0.04, 0.008);
  p.box(k.glass, 0.03, 0.028, 0.003, 0, 0.14, -0.07, 0.001, [-0.1, 0, 0]);
  p.sphere(k.cyan, 0.0017, 0, 0.14, -0.074, 1, 1, 1, 6);
  // grip, stock
  p.prism(k.poly, [[0.19, -0.03], [0.15, -0.05], [0.17, -0.17], [0.22, -0.17], [0.23, -0.05]], 0.04, 0, 0.01);
  p.prism(k.poly, [[0.3, 0.06], [0.5, 0.06], [0.5, -0.1], [0.36, -0.06]], 0.04, 0, 0.012);
  p.torus(k.alum, 0.026, 0.003, 0, -0.065, 0.12, [0, Math.PI / 2, 0], 18);
  p.box(glow, 0.006, 0.022, 0.006, 0, -0.05, 0.12, 0.002, [-0.3, 0, 0]);
  p.prism(k.poly, [[-0.15, -0.03], [-0.1, -0.03], [-0.09, -0.12], [-0.16, -0.12]], 0.034, 0, 0.01);
  const h = new Part();
  gripHand(h, k, [0, -0.11, 0.19], 0.018, 0.024, 0.06, 0.16, 1, 4);
  cupHand(h, k, [0, -0.075, -0.125], 0.017, 0.0, 0.1, -1, true);
  forearm(h, k, [0.04, -0.13, 0.21], [0.3, -0.3, 0.9], 0.55, 1);
  forearm(h, k, [-0.04, -0.085, -0.1], [-0.4, -0.25, 0.9], 0.8, -1);
  const g = new THREE.Group();
  g.add(p.build(), h.build());
  return {
    g,
    muzzle: [0.02, -0.88],
    hip: [0.2, -0.2, -0.32],
    ads: [0, -0.14, -0.28],
    flashSize: 1.6,
    shell: "none",
    glow,
    idle: (t) => {
      glow.color.setHSL(0.04, 1, 0.5 + Math.sin(t * 5) * 0.12);
    },
  };
};

export const minigun: Builder = (k) => {
  const p = new Part();
  // 6-barrel rotating cluster (spin group), clamps, housing, ammo feed chute, carry handle
  const spin = new Part();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    spin.lathe(k.blued, [[0.0, 0.0], [0.0105, 0], [0.0105, -0.62], [0.0125, -0.624], [0.0125, -0.66], [0.0, -0.66]], Math.cos(a) * 0.036, Math.sin(a) * 0.036, -0.08, 14);
    spin.lathe(k.rubber, [[0.0, 0], [0.008, 0], [0.008, -0.002], [0.0, -0.002]], Math.cos(a) * 0.036, Math.sin(a) * 0.036, -0.74, 10);
  }
  spin.cyl(k.gunmetal, 0.03, 0.62, 0, 0, -0.4, 24);
  for (const z of [-0.2, -0.45, -0.7]) {
    spin.cyl(k.steel, 0.056, 0.03, 0, 0, z, 30);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      spin.cyl(k.blued, 0.0145, 0.032, Math.cos(a) * 0.036, Math.sin(a) * 0.036, z, 12);
    }
    spin.torus(k.blued, 0.057, 0.004, 0, 0, z + 0.015, [0, 0, 0], 28);
  }
  spin.cyl(k.gunmetal, 0.062, 0.05, 0, 0, -0.04, 30);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    spin.box(k.rubber, 0.006, 0.008, 0.04, Math.cos(a) * 0.062, Math.sin(a) * 0.062, -0.04, 0.001, [0, 0, a]);
  }
  const sg = spin.build();
  // housing & motor
  p.lathe(k.gunmetal, [[0.0, 0.0], [0.07, 0.0], [0.082, 0.04], [0.082, 0.22], [0.07, 0.26], [0.0, 0.26]], 0, 0, 0.0, 32);
  p.torus(k.chrome, 0.083, 0.004, 0, 0, 0.04, [0, 0, 0], 30);
  p.torus(k.chrome, 0.083, 0.004, 0, 0, 0.22, [0, 0, 0], 30);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    p.box(k.rubber, 0.012, 0.004, 0.09, Math.cos(a) * 0.083, Math.sin(a) * 0.083, 0.13, 0.001, [0, 0, a + Math.PI / 2]);
  }
  p.cyl(k.red, 0.02, 0.006, 0.0, 0.0, 0.265, 14);
  // carry handle & fire grips
  p.cap(k.blued, [0.0, 0.082, 0.04], [0.0, 0.15, 0.04], 0.008);
  p.cap(k.blued, [0.0, 0.082, 0.22], [0.0, 0.15, 0.22], 0.008);
  p.cap(k.blued, [0.0, 0.15, 0.04], [0.0, 0.15, 0.22], 0.012);
  p.prism(k.poly, [[0.24, -0.07], [0.19, -0.07], [0.19, -0.19], [0.24, -0.19]], 0.04, 0, 0.012);
  p.prism(k.poly, [[0.02, -0.07], [-0.04, -0.07], [-0.04, -0.19], [0.02, -0.19]], 0.04, 0, 0.012);
  p.cap(k.red, [0, -0.07, 0.2], [0, -0.05, 0.2], 0.01);
  // ammo feed chute + drum
  p.box(k.olive, 0.07, 0.04, 0.12, -0.1, 0.0, 0.16, 0.01);
  p.cap(k.brass, [-0.1, 0.0, 0.16], [-0.2, -0.08, 0.2], 0.008);
  p.lathe(k.olive, [[0.0, 0.0], [0.09, 0.0], [0.095, -0.02], [0.095, -0.14], [0.09, -0.16], [0.0, -0.16]], -0.24, -0.12, 0.2, 28, [0, Math.PI / 2, 0]);
  const h = new Part();
  gripHand(h, k, [0, -0.13, 0.215], 0.019, 0.024, 0.06, 0.0, 1, 4);
  gripHand(h, k, [-0.01, -0.13, -0.01], 0.019, 0.024, 0.06, 0.0, -1, 4);
  forearm(h, k, [0.04, -0.15, 0.25], [0.3, -0.3, 0.9], 0.55, 1);
  forearm(h, k, [-0.04, -0.15, 0.02], [-0.4, -0.25, 0.9], 0.8, -1);
  const g = new THREE.Group();
  g.add(p.build(), sg, h.build());
  return { g, muzzle: [0.0, -0.82], hip: [0.14, -0.23, -0.5], ads: [0.05, -0.17, -0.45], spin: sg, flashSize: 1.5, shell: "rifle", eject: [-0.12, -0.03, 0.2] };
};
