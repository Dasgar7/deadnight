import * as THREE from "three";
import { REG } from "./viewmodel";
import { getKit } from "./gunkit";

/**
 * Survivor character rig used for the third/second person camera and for remote
 * co-op players. Built from capsules + lathe forms (no hard cubes), all limbs on real
 * joints (shoulder/elbow/hip/knee) so poses are driven by a handful of angles.
 */

function noiseTex(seed: number, base: [number, number, number], weave = 0): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
  g.fillRect(0, 0, 64, 64);
  let s = seed;
  const R = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 900; i++) {
    const v = (R() - 0.5) * 60;
    g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 220})`;
    g.fillRect((R() * 64) | 0, (R() * 64) | 0, 1 + ((R() * 2) | 0), 1 + ((R() * 2) | 0));
  }
  if (weave) {
    g.strokeStyle = "rgba(0,0,0,0.08)";
    for (let i = 0; i < 64; i += weave) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 64);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  return t;
}

interface HMats {
  skin: THREE.MeshStandardMaterial;
  jacket: THREE.MeshStandardMaterial;
  pants: THREE.MeshStandardMaterial;
  boot: THREE.MeshStandardMaterial;
  vest: THREE.MeshStandardMaterial;
  hair: THREE.MeshStandardMaterial;
  glove: THREE.MeshStandardMaterial;
  eye: THREE.MeshBasicMaterial;
  accent: THREE.MeshStandardMaterial;
}
const matCache = new Map<number, HMats>();
function mats(accent: number): HMats {
  let m = matCache.get(accent);
  if (m) return m;
  m = {
    skin: new THREE.MeshStandardMaterial({ color: 0xc89a7c, roughness: 0.62, metalness: 0 }),
    jacket: new THREE.MeshStandardMaterial({ map: noiseTex(5, [66, 74, 62], 4), roughness: 0.9 }),
    pants: new THREE.MeshStandardMaterial({ map: noiseTex(8, [58, 56, 54], 3), roughness: 0.92 }),
    boot: new THREE.MeshStandardMaterial({ color: 0x1d1a18, roughness: 0.55, metalness: 0.1 }),
    vest: new THREE.MeshStandardMaterial({ map: noiseTex(11, [38, 40, 42], 2), roughness: 0.8 }),
    hair: new THREE.MeshStandardMaterial({ color: 0x2a1c14, roughness: 0.8 }),
    glove: new THREE.MeshStandardMaterial({ color: 0x1f1f20, roughness: 0.7 }),
    eye: new THREE.MeshBasicMaterial({ color: 0x120c0a }),
    accent: new THREE.MeshStandardMaterial({ color: accent, roughness: 0.6 }),
  };
  matCache.set(accent, m);
  return m;
}

const geo = {
  cap: (r: number, l: number) => new THREE.CapsuleGeometry(r, l, 4, 10),
};

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, cast = false) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = cast;
  return o;
}

const gunCache = new Map<string, THREE.Group>();
/** world-model of a weapon: viewmodel geometry with the first-person hands/sleeves stripped */
export function worldGun(id: string): THREE.Group | null {
  const hit = gunCache.get(id);
  if (hit) return hit.clone(true);
  const b = REG[id];
  if (!b) return null;
  const k = getKit();
  const spec = b(k);
  const drop = new Set<THREE.Material>([k.glove, k.gloveHard, k.sleeve, k.skin]);
  const kill: THREE.Object3D[] = [];
  spec.g.traverse((o) => {
    const mm = o as THREE.Mesh;
    if (mm.isMesh && drop.has(mm.material as THREE.Material)) kill.push(mm);
    if (mm.isMesh) mm.castShadow = false;
  });
  kill.forEach((o) => o.parent?.remove(o));
  const wrap = new THREE.Group();
  wrap.add(spec.g);
  gunCache.set(id, wrap);
  return wrap.clone(true);
}

export interface HumanPose {
  speed: number; // horizontal speed m/s
  moveYaw: number; // world direction of motion
  pitch: number;
  aiming: boolean;
  melee: boolean;
  swing: number; // 0..1 melee swing progress (-1 none)
  dead: boolean;
  onGround: boolean;
  sprint: boolean;
}

export class Human {
  root = new THREE.Group();
  private hips = new THREE.Group();
  private spine = new THREE.Group();
  private neck = new THREE.Group();
  private shL = new THREE.Group();
  private shR = new THREE.Group();
  private elL = new THREE.Group();
  private elR = new THREE.Group();
  private hipL = new THREE.Group();
  private hipR = new THREE.Group();
  private knL = new THREE.Group();
  private knR = new THREE.Group();
  private handR = new THREE.Group();
  private gun: THREE.Group | null = null;
  private gunId = "";
  private phase = Math.random() * 6;
  private deadK = 0;
  private flash: THREE.Mesh;
  private flashT = 0;
  tag: THREE.Sprite | null = null;
  muzzle = new THREE.Object3D();

  constructor(accent = 0xd9a441, name?: string) {
    const m = mats(accent);
    const r = this.root;
    r.rotation.order = "YXZ";
    r.add(this.hips);
    this.hips.position.y = 0.96;
    // pelvis
    const pelvis = mesh(geo.cap(0.17, 0.12), m.pants, 0, 0.0, 0, true);
    pelvis.rotation.z = Math.PI / 2;
    this.hips.add(pelvis);
    // belt + holster
    const belt = mesh(new THREE.TorusGeometry(0.175, 0.025, 8, 20), m.vest, 0, 0.1, 0);
    belt.rotation.x = Math.PI / 2;
    belt.scale.set(1, 0.8, 1);
    this.hips.add(belt);
    this.hips.add(mesh(geo.cap(0.04, 0.12), m.vest, 0.2, -0.08, 0.02));

    // legs
    const leg = (side: number, hip: THREE.Group, knee: THREE.Group) => {
      hip.position.set(side * 0.1, -0.02, 0);
      const thigh = mesh(geo.cap(0.085, 0.3), m.pants, 0, -0.24, 0, true);
      thigh.scale.set(1, 1, 1.05);
      hip.add(thigh);
      knee.position.y = -0.47;
      hip.add(knee);
      const shin = mesh(geo.cap(0.068, 0.32), m.pants, 0, -0.24, 0, true);
      knee.add(shin);
      const pad = mesh(new THREE.SphereGeometry(0.06, 8, 6), m.vest, 0, 0, -0.05);
      pad.scale.set(1, 1, 0.6);
      knee.add(pad);
      const boot = mesh(geo.cap(0.072, 0.12), m.boot, 0, -0.49, -0.03, true);
      boot.rotation.x = Math.PI / 2 - 0.1;
      boot.scale.set(1, 1.15, 1);
      knee.add(boot);
      knee.add(mesh(new THREE.CylinderGeometry(0.076, 0.08, 0.14, 10), m.boot, 0, -0.38, 0));
      this.hips.add(hip);
    };
    leg(-1, this.hipL, this.knL);
    leg(1, this.hipR, this.knR);

    // spine / torso
    this.hips.add(this.spine);
    this.spine.position.y = 0.08;
    const torso = mesh(geo.cap(0.16, 0.28), m.jacket, 0, 0.27, 0, true);
    torso.scale.set(1.18, 1, 0.82);
    this.spine.add(torso);
    const chest = mesh(geo.cap(0.165, 0.12), m.jacket, 0, 0.44, 0, true);
    chest.rotation.z = Math.PI / 2;
    chest.scale.set(1, 1, 0.85);
    this.spine.add(chest);
    // plate-carrier vest with pouches and shoulder straps
    const vest = mesh(geo.cap(0.172, 0.22), m.vest, 0, 0.33, 0.01, true);
    vest.scale.set(1.13, 1, 0.9);
    this.spine.add(vest);
    for (const sx of [-1, 1]) {
      this.spine.add(mesh(geo.cap(0.032, 0.09), m.vest, sx * 0.1, 0.26, -0.16));
      this.spine.add(mesh(geo.cap(0.03, 0.06), m.vest, sx * 0.04, 0.26, -0.16));
      const strap = mesh(geo.cap(0.03, 0.22), m.vest, sx * 0.12, 0.5, 0.0);
      strap.rotation.z = sx * 0.1;
      this.spine.add(strap);
    }
    // backpack
    const pack = mesh(geo.cap(0.13, 0.18), m.vest, 0, 0.36, 0.2, true);
    pack.scale.set(1, 1, 0.7);
    this.spine.add(pack);
    const roll = mesh(geo.cap(0.05, 0.28), m.accent, 0, 0.18, 0.24);
    roll.rotation.z = Math.PI / 2;
    this.spine.add(roll);

    // neck + head
    this.spine.add(this.neck);
    this.neck.position.y = 0.6;
    this.neck.add(mesh(geo.cap(0.055, 0.06), m.skin, 0, 0.02, 0));
    const head = new THREE.Group();
    head.position.y = 0.16;
    const skull = mesh(new THREE.SphereGeometry(0.115, 18, 14), m.skin, 0, 0.03, 0, true);
    skull.scale.set(0.94, 1.12, 1.02);
    head.add(skull);
    const jaw = mesh(new THREE.SphereGeometry(0.08, 12, 10), m.skin, 0, -0.07, -0.03);
    jaw.scale.set(1.05, 0.8, 1);
    head.add(jaw);
    const nose = mesh(new THREE.ConeGeometry(0.018, 0.04, 8), m.skin, 0, -0.01, -0.12);
    nose.rotation.x = -Math.PI / 2;
    head.add(nose);
    for (const sx of [-1, 1]) {
      head.add(mesh(new THREE.SphereGeometry(0.014, 8, 6), m.eye, sx * 0.04, 0.03, -0.105));
      head.add(mesh(geo.cap(0.011, 0.03), m.hair, sx * 0.045, 0.058, -0.105)).rotation.z = Math.PI / 2;
    }
    // cap
    const cap = mesh(new THREE.SphereGeometry(0.125, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), m.accent, 0, 0.05, 0.005, true);
    cap.scale.set(0.97, 1.0, 1.06);
    head.add(cap);
    const brim = mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.012, 14, 1, false, -Math.PI * 0.6, Math.PI * 1.2), m.accent, 0, 0.065, -0.115);
    brim.scale.set(1, 1, 0.9);
    head.add(brim);
    // hair tuft under cap
    head.add(mesh(new THREE.SphereGeometry(0.07, 8, 6), m.hair, 0, 0.0, 0.085));
    // bandana over lower face
    const band = mesh(new THREE.TorusGeometry(0.095, 0.022, 8, 18, Math.PI * 1.35), m.accent, 0, -0.045, -0.01);
    band.rotation.set(Math.PI / 2, 0, Math.PI * 0.18);
    head.add(band);
    this.neck.add(head);

    // arms
    const arm = (side: number, sh: THREE.Group, el: THREE.Group) => {
      sh.position.set(side * 0.235, 0.52, 0);
      this.spine.add(sh);
      const ball = mesh(new THREE.SphereGeometry(0.068, 10, 8), m.jacket, 0, 0, 0, true);
      sh.add(ball);
      const up = mesh(geo.cap(0.056, 0.17), m.jacket, 0, -0.17, 0, true);
      sh.add(up);
      el.position.y = -0.33;
      sh.add(el);
      const fore = mesh(geo.cap(0.05, 0.16), m.jacket, 0, -0.16, 0, true);
      el.add(fore);
      el.add(mesh(new THREE.SphereGeometry(0.052, 8, 6), m.vest, 0, 0.0, 0.01));
      const hand = mesh(new THREE.SphereGeometry(0.05, 10, 8), m.glove, 0, -0.36, 0);
      hand.scale.set(0.9, 1.15, 1);
      el.add(hand);
    };
    arm(-1, this.shL, this.elL);
    arm(1, this.shR, this.elR);
    this.handR.position.set(0, -0.37, 0);
    this.elR.add(this.handR);

    // muzzle flash for third-person firing
    const fm = new THREE.MeshBasicMaterial({ color: 0xffc060, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
    this.flash = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.35, 8), fm);
    this.flash.rotation.x = -Math.PI / 2;
    this.flash.visible = false;
    this.muzzle.add(this.flash);

    if (name) this.setName(name);
  }

  setName(name: string) {
    if (this.tag) {
      this.root.remove(this.tag);
      (this.tag.material as THREE.SpriteMaterial).map?.dispose();
    }
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 64;
    const g = c.getContext("2d")!;
    g.font = "700 34px Oswald, Impact, sans-serif";
    g.textAlign = "center";
    g.lineWidth = 6;
    g.strokeStyle = "rgba(0,0,0,0.85)";
    g.strokeText(name.toUpperCase(), 128, 44);
    g.fillStyle = "#f4e9cf";
    g.fillText(name.toUpperCase(), 128, 44);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, fog: false }));
    s.scale.set(1.5, 0.375, 1);
    s.position.y = 2.15;
    s.renderOrder = 20;
    this.tag = s;
    this.root.add(s);
  }

  setGun(id: string | null) {
    if (id === this.gunId) return;
    this.gunId = id ?? "";
    if (this.gun) this.handR.remove(this.gun);
    this.gun = null;
    if (!id) return;
    const g = worldGun(id);
    if (!g) return;
    g.rotation.x = -Math.PI / 2;
    g.position.set(0, -0.02, -0.02);
    this.handR.add(g);
    this.gun = g;
    // find muzzle approx: far end of gun along its forward axis
    const bb = new THREE.Box3().setFromObject(g);
    const len = bb.getSize(new THREE.Vector3()).length();
    this.muzzle.position.set(0, 0, -Math.min(0.9, len * 0.45));
    g.add(this.muzzle);
  }

  kick() {
    this.flashT = 0.06;
  }

  get hasGun() {
    return !!this.gun;
  }

  update(dt: number, p: HumanPose, yaw: number, rel: number) {
    const sp = p.speed;
    this.phase += dt * (2 + sp * 1.25);
    const w = Math.min(1, sp / 4);
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);
    const amp = (p.sprint ? 1.0 : 0.75) * w;
    // body yaw: lean into the move direction relative to aim
    this.root.rotation.y = yaw;
    // move direction relative to facing, for strafing legs
    const rx = Math.sin(p.moveYaw - yaw);
    const fz = Math.cos(p.moveYaw - yaw);
    void rel;
    const back = fz < -0.2 ? -1 : 1;
    this.hipL.rotation.set(s * amp * back, 0, rx * 0.15 * w);
    this.hipR.rotation.set(-s * amp * back, 0, rx * 0.15 * w);
    this.knL.rotation.x = Math.max(0, -c) * 0.9 * w + (p.onGround ? 0 : 0.6);
    this.knR.rotation.x = Math.max(0, c) * 0.9 * w + (p.onGround ? 0 : 0.6);
    this.hips.position.y = 0.96 - (p.onGround ? Math.abs(s) * 0.035 * w : -0.04);
    this.spine.rotation.x = 0.05 + (p.sprint ? 0.22 : 0) * w;
    this.spine.rotation.y = p.aiming && this.hasGun ? -0.25 : 0;
    this.neck.rotation.set(Math.max(-0.7, Math.min(0.7, p.pitch * 0.7)), p.aiming && this.hasGun ? 0.2 : 0, 0);
    // arms
    if (this.hasGun && !p.melee) {
      const el = 1.45 + p.pitch * 0.85;
      this.shR.rotation.set(el, 0.12, -0.05);
      this.elR.rotation.set(-0.12, 0, 0);
      this.shL.rotation.set(el + 0.05, -0.15, 0.52);
      this.elL.rotation.set(-0.5, 0, 0);
    } else if (p.melee) {
      const k = p.swing;
      if (k >= 0) {
        const e = Math.sin(k * Math.PI);
        this.shR.rotation.set(-0.3 + e * 2.2, -0.2, -0.3 + e * 0.3);
      } else this.shR.rotation.set(0.9, 0, -0.1);
      this.elR.rotation.set(-0.9, 0, 0);
      this.shL.rotation.set(s * 0.5 * amp, 0, 0.05);
      this.elL.rotation.set(-0.2, 0, 0);
    } else {
      this.shR.rotation.set(-s * 0.7 * amp, 0, -0.06);
      this.shL.rotation.set(s * 0.7 * amp, 0, 0.06);
      this.elR.rotation.set(-0.2 - Math.max(0, c) * 0.4 * w, 0, 0);
      this.elL.rotation.set(-0.2 - Math.max(0, -c) * 0.4 * w, 0, 0);
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.flash.visible = this.flashT > 0;
      this.flash.rotation.z += 1;
    }
    // death: topple backwards
    const tk = p.dead ? 1 : 0;
    this.deadK += (tk - this.deadK) * Math.min(1, dt * 6);
    this.root.rotation.x = -this.deadK * 1.45;
    this.root.position.y += 0;
  }

  dispose() {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
  }
}
