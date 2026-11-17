import * as THREE from "three";
import { canvasTex } from "./assets";
import { getKit } from "./gunkit";
import * as G1 from "./guns1";
import * as G2 from "./guns2";
import type { Builder, GunSpec } from "./guns1";

export const REG: Record<string, Builder> = {
  knife: G1.knife, axe: G1.axe, katana: G1.katana, chainsaw: G1.chainsaw,
  pistol: G1.pistol, magnum: G1.magnum,
  shotgun: G1.shotgun, sawedoff: G1.sawedoff, aa12: G1.aa12,
  smg: G2.smg, rifle: G2.rifle, dmr: G2.dmr, sniper: G2.sniper, crossbow: G2.crossbow,
  flame: G2.flame, rocket: G2.rocket, glauncher: G2.glauncher, arc: G2.arc, railgun: G2.railgun, minigun: G2.minigun,
};

interface Model {
  spec: GunSpec;
  g: THREE.Group;
  muzzle: THREE.Object3D;
  hip: THREE.Vector3;
  ads: THREE.Vector3;
  slideBase: THREE.Vector3;
  magBase?: THREE.Vector3;
}

function flashTexture(kind: 0 | 1) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.translate(128, 128);
  if (kind === 0) {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 124);
    gr.addColorStop(0, "rgba(255,255,240,1)");
    gr.addColorStop(0.2, "rgba(255,220,130,0.95)");
    gr.addColorStop(0.6, "rgba(255,130,30,0.45)");
    gr.addColorStop(1, "rgba(255,80,0,0)");
    g.fillStyle = gr;
    g.beginPath();
    const n = 12;
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2;
      const r = i % 2 === 0 ? 120 * (0.6 + Math.random() * 0.4) : 26 + Math.random() * 12;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  } else {
    const gr = g.createLinearGradient(-120, 0, 120, 0);
    gr.addColorStop(0, "rgba(255,120,20,0)");
    gr.addColorStop(0.5, "rgba(255,230,160,0.95)");
    gr.addColorStop(1, "rgba(255,110,10,0)");
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(-120, 0);
    g.quadraticCurveTo(0, -46, 120, 0);
    g.quadraticCurveTo(0, 46, -120, 0);
    g.fill();
  }
  return canvasTex(c);
}

interface Casing {
  m: THREE.Mesh;
  v: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
}

export class ViewModel {
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
  root = new THREE.Group();
  models: Record<string, Model> = {};
  cur = "knife";
  flash = new THREE.Group();
  flashMats: THREE.MeshBasicMaterial[] = [];
  flashLight: THREE.PointLight;
  flashT = 0;
  kick = 0;
  kickV = 0;
  cycleT = 1; // slide / pump cycle phase 0..1
  switchT = 1;
  reloadT = -1;
  reloadDur = 1;
  swingT = -1;
  swingDur = 0.3;
  swingAlt = 0;
  bobT = 0;
  swayX = 0;
  swayY = 0;
  spinSpeed = 0;
  spinAngle = 0;
  cylAngle = 0;
  cylTarget = 0;
  adsT = 0;
  hidden = false;
  empty = false;
  active = false; // trigger held (for chainsaw etc.)
  time = 0;
  curKick = 0.05;
  casings: Casing[] = [];
  casingIdx = 0;
  breath = 0;
  kickRoll = 0;
  private casingGeo: Record<string, THREE.BufferGeometry> = {};
  private casingMat: Record<string, THREE.Material> = {};
  private _pumped = false;

  constructor() {
    this.scene.add(new THREE.HemisphereLight(0xb8c4e0, 0x403028, 0.55));
    const d = new THREE.DirectionalLight(0xfff0e0, 2.4);
    d.position.set(-1, 2, 1.5);
    this.scene.add(d);
    const rim = new THREE.DirectionalLight(0x88aaff, 1.2);
    rim.position.set(2, 0.5, -1);
    this.scene.add(rim);
    this.flashLight = new THREE.PointLight(0xffa850, 0, 3, 1.5);
    this.scene.add(this.flashLight);
    this.scene.add(this.root);
    this.root.rotation.order = "YXZ";
    // layered muzzle flash: star + two crossed jets
    const sm = (t: THREE.Texture) => {
      const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
      this.flashMats.push(m);
      return m;
    };
    const star = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), sm(flashTexture(0)));
    const star2 = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), sm(flashTexture(0)));
    star2.rotation.z = 0.5;
    star2.position.z = -0.01;
    const jetT = flashTexture(1);
    const jet1 = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.18), sm(jetT));
    jet1.rotation.set(0, Math.PI / 2, 0);
    jet1.position.z = -0.2;
    const jet2 = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.18), sm(jetT));
    jet2.rotation.set(Math.PI / 2, Math.PI / 2, 0);
    jet2.position.z = -0.2;
    this.flash.add(star, star2, jet1, jet2);
    this.flash.visible = false;
    // casings
    this.casingGeo.pistol = new THREE.CylinderGeometry(0.0045, 0.0048, 0.02, 8);
    this.casingGeo.rifle = new THREE.CylinderGeometry(0.0042, 0.0058, 0.036, 8);
    this.casingGeo.shotgun = new THREE.CylinderGeometry(0.01, 0.01, 0.05, 10);
    const k = getKit();
    this.casingMat.pistol = k.brass;
    this.casingMat.rifle = k.brass;
    this.casingMat.shotgun = k.red;
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(this.casingGeo.pistol, k.brass);
      m.visible = false;
      this.scene.add(m);
      this.casings.push({ m, v: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0 });
    }
  }

  setEnv(t: THREE.Texture) {
    this.scene.environment = t;
    this.scene.environmentIntensity = 1;
  }

  private ensure(id: string): Model | undefined {
    let m = this.models[id];
    if (m) return m;
    const b = REG[id];
    if (!b) return undefined;
    const spec = b(getKit());
    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, spec.muzzle[0], spec.muzzle[1]);
    const g = new THREE.Group();
    g.add(spec.g, muzzle);
    g.visible = false;
    this.root.add(g);
    m = { spec, g, muzzle, hip: new THREE.Vector3(...spec.hip), ads: new THREE.Vector3(...spec.ads), slideBase: spec.slide ? spec.slide.position.clone() : new THREE.Vector3(), magBase: spec.mag ? spec.mag.position.clone() : undefined };
    this.models[id] = m;
    return m;
  }

  /** build models up-front so the first switch doesn't hitch */
  warm(ids: string[]) {
    for (const id of ids) this.ensure(id);
  }

  setWeapon(id: string, instant = false) {
    const m = this.ensure(id);
    for (const k in this.models) this.models[k].g.visible = k === id;
    this.cur = id;
    if (m) {
      m.muzzle.add(this.flash);
      m.muzzle.add(this.flashLight);
      this.flashLight.position.set(0, 0, -0.05);
      this.flash.visible = false;
    }
    if (!instant) this.switchT = 0;
    this.reloadT = -1;
    this.swingT = -1;
    this.cycleT = 1;
    this.cylTarget = this.cylAngle;
  }

  fire() {
    const m = this.models[this.cur];
    const kd = this.curKick;
    this.kickV += kd * 2.5;
    this.kick = Math.min(0.2, this.kick + kd);
    this.kickRoll = (Math.random() - 0.5) * kd * 2;
    this.cycleT = 0;
    if (m && m.spec.flashSize && m.spec.flashSize > 0.05) {
      this.flashT = 0.055;
      this.flash.visible = true;
      this.flash.rotation.z = Math.random() * 6;
      const s = m.spec.flashSize * (0.75 + Math.random() * 0.5);
      this.flash.scale.set(s, s, s * (0.8 + Math.random() * 0.6));
      this.flashLight.intensity = 6 * Math.min(1.4, m.spec.flashSize);
      this.ejectShell(m);
      if (this.cur === "magnum") this.cylTarget += Math.PI / 3;
    }
  }

  private ejectShell(m: Model) {
    const kind = m.spec.shell;
    if (!kind || kind === "none" || !m.spec.eject) return;
    if (this.cur === "shotgun") return; // ejected on pump
    this.spawnCasing(m, kind);
  }
  private spawnCasing(m: Model, kind: string) {
    const c = this.casings[this.casingIdx];
    this.casingIdx = (this.casingIdx + 1) % this.casings.length;
    this.root.updateMatrixWorld(true);
    const e = m.spec.eject!;
    const p = new THREE.Vector3(e[0], e[1], e[2]);
    m.spec.g.localToWorld(p);
    c.m.geometry = this.casingGeo[kind] ?? this.casingGeo.pistol;
    c.m.material = this.casingMat[kind] ?? this.casingMat.pistol;
    c.m.position.copy(p);
    c.m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    c.v.set(0.9 + Math.random() * 0.8, 1.1 + Math.random() * 0.9, 0.3 + Math.random() * 0.6);
    c.spin.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30);
    c.life = 0.9;
    c.m.visible = true;
  }

  startReload(dur: number) {
    this.reloadT = 0;
    this.reloadDur = dur;
  }
  cancelReload() {
    this.reloadT = -1;
  }
  startSwing(dur: number) {
    this.swingT = 0;
    this.swingDur = dur;
    this.swingAlt ^= 1;
  }

  update(dt: number, moveSpeed: number, sprinting: boolean, onGround: boolean, lookDX: number, lookDY: number, ads: number, fov: number, aspect: number) {
    this.cam.fov = fov;
    this.cam.aspect = aspect;
    this.cam.updateProjectionMatrix();
    const m = this.models[this.cur];
    if (!m) return;
    this.time += dt;
    const sp = m.spec;
    this.adsT = ads;
    this.bobT += dt * (moveSpeed > 0.5 ? (sprinting ? 12 : 8.5) : 1.5) * (onGround ? 1 : 0.2);
    const bobAmt = onGround ? Math.min(1, moveSpeed / 5) : 0;
    const adsK = 1 - ads * 0.9;
    const bx = Math.cos(this.bobT) * 0.012 * bobAmt * adsK;
    const by = Math.abs(Math.sin(this.bobT)) * 0.014 * bobAmt * adsK + Math.sin(this.bobT * 0.35) * 0.002;
    this.breath += dt * 1.6;
    const bry = Math.sin(this.breath) * 0.0016 * (1 - ads * 0.6);
    const brx = Math.sin(this.breath * 0.5) * 0.0012 * (1 - ads * 0.6);
    this.swayX += (-lookDX * 0.0004 - this.swayX) * Math.min(1, dt * 10);
    this.swayY += (lookDY * 0.0004 - this.swayY) * Math.min(1, dt * 10);
    this.kickV += (-this.kick * 220 - this.kickV * 18) * dt;
    this.kick += this.kickV * dt;
    if (this.kick < 0) this.kick = 0;
    this.kickRoll *= Math.max(0, 1 - dt * 8);
    this.flashT -= dt;
    if (this.flashT <= 0) {
      this.flash.visible = false;
      this.flashLight.intensity = 0;
    }
    if (this.flash.visible) this.flash.rotation.z += dt * 40;

    // slide / pump / bolt cycle
    const slow = this.cur === "shotgun" || this.cur === "sniper" || this.cur === "dmr";
    this.cycleT = Math.min(1, this.cycleT + dt * (slow ? 2.4 : this.cur === "aa12" ? 9 : 11));
    if (sp.slide) {
      let b: number;
      const t = this.cycleT;
      if (this.cur === "shotgun" || this.cur === "sniper") {
        const u = Math.min(1, Math.max(0, (t - 0.25) / 0.75));
        b = Math.sin(u * Math.PI);
        if (this.cur === "shotgun") {
          if (u > 0.05 && u < 0.5 && !this._pumped) {
            this._pumped = true;
            this.spawnCasing(m, "shotgun");
          }
          if (t < 0.2) this._pumped = false;
        }
      } else {
        b = t < 0.15 ? t / 0.15 : Math.max(0, 1 - (t - 0.15) / 0.85);
        b = Math.sin(Math.min(1, b) * Math.PI * 0.5);
      }
      if (this.empty && this.cur === "pistol") b = 1;
      const trav = sp.slideTravel ?? 0;
      sp.slide.position.set(m.slideBase.x, m.slideBase.y, m.slideBase.z + b * trav);
    }
    if (this.cur === "magnum" && sp.spin) {
      this.cylAngle += (this.cylTarget - this.cylAngle) * Math.min(1, dt * 18);
      sp.spin.rotation.z = this.cylAngle;
    } else if (sp.spin) {
      this.spinAngle += this.spinSpeed * dt * 30;
      sp.spin.rotation.z = this.spinAngle;
    }
    sp.idle?.(this.time, sp.g);
    if (this.cur === "chainsaw") sp.g.position.x += this.active ? Math.sin(this.time * 120) * 0.0035 : 0;
    if (this.switchT < 1) this.switchT = Math.min(1, this.switchT + dt * 3.6);

    const pos = m.hip.clone().lerp(m.ads, ads);
    let rx = brx;
    let ry = bry;
    let rz = 0;
    let py = 0;
    if (this.switchT < 1) {
      const k = 1 - this.switchT;
      py -= k * k * 0.55;
      rx -= k * 0.9;
      ry += k * 0.45;
      rz -= k * 0.35;
      pos.x += k * 0.12;
    }
    if (sprinting && onGround && moveSpeed > 1) {
      rx += 0.2;
      ry += 0.55;
      rz -= 0.12;
      py -= 0.06;
      pos.x -= 0.06;
    }
    // reload
    if (this.reloadT >= 0) {
      this.reloadT += dt / this.reloadDur;
      const k = Math.min(1, this.reloadT);
      const dip = k < 0.15 ? k / 0.15 : k > 0.85 ? (1 - k) / 0.15 : 1;
      const wob = Math.sin(k * Math.PI * 4) * 0.05;
      py -= dip * 0.17;
      rx -= dip * (0.55 + wob);
      rz += dip * 0.55;
      ry += dip * 0.25;
      pos.x -= dip * 0.06;
      if (sp.mag && m.magBase) {
        let o = 0;
        if (k > 0.2 && k < 0.42) o = (k - 0.2) / 0.22;
        else if (k >= 0.42 && k < 0.55) o = 1;
        else if (k >= 0.55 && k < 0.75) o = 1 - (k - 0.55) / 0.2;
        sp.mag.position.set(m.magBase.x - o * 0.02, m.magBase.y - o * 0.22, m.magBase.z + o * 0.03);
        sp.mag.rotation.x = o * 0.4;
        sp.mag.visible = !(k > 0.3 && k < 0.5);
      }
      if (this.cur === "magnum") sp.spin!.position.x = -dip * 0.05;
      if (k >= 1) {
        this.reloadT = -1;
        if (sp.mag && m.magBase) {
          sp.mag.position.copy(m.magBase);
          sp.mag.rotation.x = 0;
          sp.mag.visible = true;
        }
        if (this.cur === "magnum") sp.spin!.position.x = 0;
      }
    } else if (sp.mag && m.magBase && !sp.mag.visible) {
      sp.mag.visible = true;
      sp.mag.position.copy(m.magBase);
      sp.mag.rotation.x = 0;
    }
    // melee swing
    if (this.swingT >= 0) {
      this.swingT += dt / this.swingDur;
      const k = Math.min(1, this.swingT);
      const s = Math.sin(k * Math.PI);
      const e = k < 0.4 ? k / 0.4 : 1 - (k - 0.4) / 0.6;
      const dir = this.swingAlt ? 1 : -1;
      const big = this.cur === "katana" ? 1.5 : this.cur === "axe" ? 1.2 : this.cur === "chainsaw" ? 0.3 : 1;
      rx += -e * 1.3 * big;
      ry += dir * e * 0.6 * big;
      rz += dir * e * 0.5 * big;
      pos.z -= s * 0.15;
      pos.x += -dir * s * 0.12 * big;
      pos.y -= s * 0.08;
      if (this.swingT >= 1) this.swingT = -1;
    }
    this.root.position.set(pos.x + bx + this.swayX, pos.y + by + py + this.swayY, pos.z + this.kick * 1.8);
    this.root.rotation.set(rx + this.kick * 2.2, ry + this.kickRoll, rz + this.swayX * 1.5);
    m.g.visible = !(sp.hideOnAds && ads > 0.85) && !this.hidden;

    for (const c of this.casings) {
      if (c.life <= 0) continue;
      c.life -= dt;
      c.v.y -= 9 * dt;
      c.m.position.addScaledVector(c.v, dt);
      c.m.rotation.x += c.spin.x * dt;
      c.m.rotation.y += c.spin.y * dt;
      c.m.rotation.z += c.spin.z * dt;
      if (c.life <= 0 || c.m.position.y < -1) c.m.visible = false;
    }
  }
}
