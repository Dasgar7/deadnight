import * as THREE from "three";
import { setMaxAniso, tex } from "./assets";
import { AudioSys } from "./audio";
import { MAX_GRENADES, PERKS, WEAPONS, W, type WeaponDef, type ZType } from "./config";
import { Fx } from "./fx";
import { input } from "./input";
import { groundAt, rayWorld, resolveCircle } from "./physics";
import { Human } from "./human";
import type { VehicleSys, VehicleHud } from "./vehicleSys";
import { ViewModel } from "./viewmodel";
import { buildEnv } from "./gunkit";
import { buildWorld, type Interactable, type World } from "./world";
import type { Zombie } from "./zombie";

export type Quality = "low" | "med" | "high";
export interface Settings {
  sens: number;
  volume: number;
  quality: Quality;
  invertY: boolean;
  fov: number;
}
export interface Stats {
  wave: number;
  kills: number;
  headshots: number;
  points: number;
  time: number;
  shots: number;
  hits: number;
}
export interface HudState {
  phase: "menu" | "playing" | "paused" | "dead";
  hp: number;
  maxHp: number;
  armor: number;
  points: number;
  wave: number;
  waveText: string;
  remaining: number;
  kills: number;
  headshots: number;
  weapon: { id: string; name: string; mag: number; reserve: number; reloading: boolean; melee: boolean; icon: string };
  slots: { id: string; name: string; icon: string; mag: number; reserve: number; melee: boolean; cur: boolean }[];
  grenades: number;
  prompt: { text: string; afford: boolean } | null;
  perks: string[];
  instakill: number;
  doublePoints: number;
  bossHp: number;
  bossName: string;
  spread: number;
  scoped: boolean;
  flashlight: boolean;
  lowHp: boolean;
  fps: number;
  camMode: 0 | 1 | 2;
  vehicle: VehicleHud | null;
  room: { code: string; players: { id: string; name: string; hp: number; you: boolean }[] } | null;
}
export interface Callbacks {
  hud(s: HudState): void;
  hit(kind: "hit" | "head" | "kill"): void;
  damage(angle: number, amount: number): void;
  banner(title: string, sub?: string): void;
  toast(text: string): void;
  dead(stats: Stats): void;
  flash(color: string): void;
  paused(): void;
  quality(q: Quality): void;
}

export interface Projectile {
  type: "rocket" | "grenade" | "acid";
  mesh: THREE.Object3D;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  fuse: number;
  life: number;
  dmg?: number;
  splash?: number;
  grav?: number;
  light?: boolean;
  owner?: string;
}
export type DropKind = "ammo" | "medkit" | "nuke" | "instakill" | "double";
export interface Drop {
  mesh: THREE.Group;
  kind: DropKind;
  x: number;
  z: number;
  t: number;
}

export const DROP_INFO: Record<DropKind, { name: string; color: number; hex: string }> = {
  ammo: { name: "MAX AMMO", color: 0x3aa0ff, hex: "#3aa0ff" },
  medkit: { name: "MEDKIT", color: 0x3ad06a, hex: "#3ad06a" },
  nuke: { name: "KABOOM", color: 0xffa020, hex: "#ffa020" },
  instakill: { name: "INSTA-KILL", color: 0xff3030, hex: "#ff3030" },
  double: { name: "DOUBLE POINTS", color: 0xf0d020, hex: "#f0d020" },
};

export const PR = 0.4; // player radius
export const EYE = 1.65;

export class GameBase {
  canvas: HTMLCanvasElement;
  cb: Callbacks;
  mobile: boolean;
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  world: World;
  vm: ViewModel;
  fx: Fx;
  audio = new AudioSys();
  moon: THREE.DirectionalLight;
  flashlight: THREE.SpotLight;
  sky: THREE.Mesh;
  settings: Settings;
  radar: HTMLCanvasElement | null = null;
  veh!: VehicleSys;
  camMode: 0 | 1 | 2 = 0; // 0 first person, 1 third person, 2 second person (front-facing)
  human: Human;
  humanGun = "";
  swingT = -1;
  lookT = 99;
  rayO = new THREE.Vector3();
  aimE = new THREE.Euler(0, 0, 0, "YXZ");
  camBack = 0;

  phase: HudState["phase"] = "menu";
  time = 0;
  // player
  px = 0;
  py = 0;
  pz = 10;
  vx = 0;
  vz = 0;
  vy = 0;
  yaw = 0;
  pitch = 0;
  onGround = true;
  hp = 100;
  maxHp = 100;
  armor = 0;
  points = 500;
  lastHurt = -99;
  shake = 0;
  bobT = 0;
  stepDist = 0;
  roll = 0;
  sprinting = false;
  fovCur = 75;
  adsT = 0;
  deathT = 0;
  speedNow = 0;
  // weapons
  inv: Record<string, { mag: number; reserve: number }> = {};
  curId = "pistol";
  fireCd = 0;
  switchLock = 0;
  reloading = false;
  reloadT = 0;
  firePrev = false;
  bufferShot = 0;
  heat = 0;
  spinT = 0;
  flameTick = 0;
  meleePending = -1;
  grenades = 2;
  grenadeCd = 0;
  clickCd = 0;
  perks = new Set<string>();
  instakill = 0;
  doublePoints = 0;
  flashOn = true;
  // world state
  zombies: Zombie[] = [];
  allyBlips: { x: number; z: number }[] = [];
  projectiles: Projectile[] = [];
  drops: Drop[] = [];
  nextZid = 1;
  stats: Stats = { wave: 0, kills: 0, headshots: 0, points: 0, time: 0, shots: 0, hits: 0 };
  nearby: Interactable | null = null;
  fps = 60;
  fpsAcc = 0;
  fpsN = 0;
  lowFpsT = 0;
  hudT = 0;
  radarT = 0;
  tmp = { x: 0, z: 0, hit: false };

  constructor(canvas: HTMLCanvasElement, cb: Callbacks, mobile: boolean, settings: Settings) {
    this.canvas = canvas;
    this.cb = cb;
    this.mobile = mobile;
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: "high-performance" });
    this.renderer.autoClear = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    setMaxAniso(Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));

    this.scene.background = new THREE.Color(0x1a0f12);
    this.scene.fog = new THREE.FogExp2(0x2a1b1e, 0.0125);
    this.camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, 500);
    this.camera.rotation.order = "YXZ";
    this.scene.add(this.camera);

    // lights
    this.scene.add(new THREE.HemisphereLight(0x8a96c4, 0x3a2824, 1.5));
    this.moon = new THREE.DirectionalLight(0xaebcff, 2.3);
    this.moon.position.set(-30, 60, -20);
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.set(2048, 2048);
    const sc = this.moon.shadow.camera;
    sc.left = -40;
    sc.right = 40;
    sc.top = 40;
    sc.bottom = -40;
    sc.near = 1;
    sc.far = 160;
    this.moon.shadow.bias = -0.0005;
    this.moon.shadow.normalBias = 0.04;
    this.scene.add(this.moon, this.moon.target);
    this.flashlight = new THREE.SpotLight(0xfff0d8, 90, 45, 0.5, 0.65, 1.3);
    this.flashlight.position.set(0.1, -0.1, 0);
    this.flashlight.target.position.set(0, 0, -5);
    this.camera.add(this.flashlight, this.flashlight.target);

    // sky dome
    const skyTex = tex("sky", 2, 1);
    skyTex.wrapS = THREE.MirroredRepeatWrapping;
    skyTex.wrapT = THREE.ClampToEdgeWrapping;
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(400, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false, color: 0xd0c8c8 }),
    );
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    this.sky = sky;
    this.scene.add(sky);

    this.world = buildWorld(true, mobile);
    this.scene.add(this.world.group);
    this.human = new Human(0xd9a441);
    this.human.root.visible = false;
    this.scene.add(this.human.root);
    this.vm = new ViewModel();
    this.vm.setEnv(buildEnv(this.renderer));
    this.fx = new Fx(this.scene, mobile);
    this.applyQuality(settings.quality);
    this.resize();
  }

  get def(): WeaponDef {
    return W[this.curId];
  }

  applyQuality(q: Quality) {
    this.settings.quality = q;
    const dpr = window.devicePixelRatio || 1;
    const pr = q === "low" ? Math.min(dpr, 1) * (this.mobile ? 0.85 : 1) : q === "med" ? Math.min(dpr, 1.5) : Math.min(dpr, 2);
    this.renderer.setPixelRatio(pr);
    const shadows = q === "high";
    const was = this.renderer.shadowMap.enabled;
    this.renderer.shadowMap.enabled = shadows;
    this.moon.castShadow = shadows;
    if (was !== shadows) this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true));
      else if (m) m.needsUpdate = true;
    });
    this.resize();
  }

  resize = () => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  // ---------- collision / movement ----------
  movePlayer(dt: number) {
    let mx = input.moveX;
    let my = input.moveY;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    const wishX = fx * my + rx * mx;
    const wishZ = fz * my + rz * mx;
    const firing = input.fire && this.def.kind !== "melee";
    this.sprinting = (input.sprint || (input.touch && len > 0.92)) && my > 0.1 && !firing && this.adsT < 0.3 && !this.reloading;
    let spd = this.sprinting ? 7.6 : 5.0;
    if (this.adsT > 0.3) spd = 2.8;
    if (this.perks.has("boots")) spd *= 1.18;
    if (this.curId === "minigun") spd *= 0.75;
    else if (this.curId === "rocket") spd *= 0.9;
    const acc = this.onGround ? 14 : 2.5;
    const k = Math.min(1, acc * dt);
    this.vx += (wishX * spd - this.vx) * k;
    this.vz += (wishZ * spd - this.vz) * k;

    // jump
    if (input.jump) {
      if (this.onGround) {
        this.vy = 7.4;
        this.onGround = false;
      }
      input.jump = false;
    }
    // horizontal move + collisions
    this.tmp.x = this.px + this.vx * dt;
    this.tmp.z = this.pz + this.vz * dt;
    resolveCircle(this.tmp, PR, this.py, this.world.boxes);
    const lim = 68.6;
    this.px = Math.max(-lim, Math.min(lim, this.tmp.x));
    this.pz = Math.max(-lim, Math.min(lim, this.tmp.z));
    // vertical
    const ground = groundAt(this.px, this.pz, PR, this.py, this.world.boxes);
    this.vy -= 22 * dt;
    this.py += this.vy * dt;
    if (this.py <= ground) {
      if (!this.onGround && this.vy < -6) {
        this.audio.jumpLand();
        this.shake = Math.max(this.shake, 0.02);
      }
      this.py = ground;
      this.vy = 0;
      this.onGround = true;
    } else if (this.onGround && this.py - ground > 0.05 && this.vy <= 0) {
      this.onGround = this.py - ground < 0.06;
    }
    if (this.onGround && ground < this.py - 0.01) this.onGround = false;
    this.speedNow = Math.hypot(this.vx, this.vz);
    // footsteps
    if (this.onGround && this.speedNow > 1) {
      this.stepDist += this.speedNow * dt;
      this.bobT += this.speedNow * dt * 1.9;
      const stride = this.sprinting ? 3.0 : 2.3;
      if (this.stepDist > stride) {
        this.stepDist = 0;
        this.audio.step(this.sprinting);
      }
    }
    // roll on strafe
    this.roll += (-mx * 0.025 - this.roll) * Math.min(1, dt * 8);
  }

  /** pushes a camera back along -dir until it hits level geometry */
  private boomLength(tx: number, ty: number, tz: number, dx: number, dy: number, dz: number, want: number) {
    const t = rayWorld(this.world.boxes, tx, ty, tz, dx, dy, dz, want + 0.4);
    return Math.max(0.6, Math.min(want, t - 0.35));
  }

  updateCamera(dt: number) {
    const dead = this.phase === "dead";
    const veh = this.veh?.cur ?? null;
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const dX = -Math.sin(this.yaw) * cp;
    const dY = sp;
    const dZ = -Math.cos(this.yaw) * cp;
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;
    this.shake = Math.max(0, this.shake - dt * 0.12);
    const base = this.settings.fov;
    const showAvatar = !veh && this.camMode !== 0 && this.phase !== "menu";
    this.human.root.visible = showAvatar;
    if (veh) {
      const tgtY = veh.y + (veh.kind === "heli" ? 1.4 : veh.kind === "tank" ? 2.6 : 1.5);
      const dist0 = veh.def.camDist * (veh.kind === "tank" || veh.kind === "jeep" ? 1 : 1);
      const len = this.boomLength(veh.x, tgtY, veh.z, -dX, -dY, -dZ, dist0);
      this.camera.position.set(veh.x - dX * len, Math.max(0.5, tgtY - dY * len + 0.9), veh.z - dZ * len);
      this.camera.rotation.set(this.pitch + sy - 0.07, this.yaw + sx, 0);
      this.rayO.set(veh.x, tgtY, veh.z);
      this.camBack = len;
      const f = base + (veh.kind === "muscle" || veh.kind === "jeep" ? Math.min(14, Math.hypot(veh.vx, veh.vz) * 0.45) : 0);
      this.fovCur += (f - this.fovCur) * Math.min(1, dt * 4);
    } else if (this.camMode === 0 || this.phase === "menu") {
      const bob = this.onGround ? Math.sin(this.bobT * 2) * 0.035 * Math.min(1, this.speedNow / 5) : 0;
      this.camera.position.set(this.px, this.py + EYE + bob - (dead ? Math.min(1.2, this.deathT * 1.5) : 0), this.pz);
      this.camera.rotation.set(this.pitch + sy, this.yaw + sx, this.roll + (dead ? Math.min(1.1, this.deathT * 1.6) : 0));
      this.rayO.copy(this.camera.position);
      this.camBack = 0;
      const target = this.def.zoom ?? base;
      const adsFov = this.def.zoom ? Math.min(base, target) : base;
      const f = base + (adsFov - base) * this.adsT + (this.sprinting ? 5 : 0);
      this.fovCur += (f - this.fovCur) * Math.min(1, dt * 12);
    } else {
      const hy = this.py + 1.55 - (dead ? Math.min(1.1, this.deathT * 1.5) : 0);
      if (this.camMode === 1) {
        const want = 3.5 - this.adsT * 1.5;
        const rX = Math.cos(this.yaw);
        const rZ = -Math.sin(this.yaw);
        const side = 0.62 * (1 - this.adsT * 0.3);
        // boom first (back), shoulder offset applied after
        const len = this.boomLength(this.px, hy, this.pz, -dX, -dY, -dZ, want);
        this.camera.position.set(this.px - dX * len + rX * side, Math.max(0.3, hy - dY * len + 0.15), this.pz - dZ * len + rZ * side);
        this.camera.rotation.set(this.pitch + sy, this.yaw + sx, this.roll * 0.5);
        this.camBack = len;
        this.rayO.set(this.camera.position.x + dX * len, this.camera.position.y + dY * len, this.camera.position.z + dZ * len);
      } else {
        const want = 3.2;
        const len = this.boomLength(this.px, hy, this.pz, dX, dY * 0.6, dZ, want);
        this.camera.position.set(this.px + dX * len, Math.max(0.3, hy + dY * 0.6 * len + 0.1), this.pz + dZ * len);
        this.camera.rotation.set(-this.pitch * 0.6 + sy, this.yaw + Math.PI + sx, 0);
        this.rayO.set(this.px, hy, this.pz);
        this.camBack = 0;
      }
      this.fovCur += (base - this.fovCur) * Math.min(1, dt * 8);
    }
    this.aimE.set(this.pitch, this.yaw, 0, "YXZ");
    this.camera.fov = this.fovCur;
    this.camera.updateProjectionMatrix();
    this.sky.position.copy(this.camera.position);
    this.sky.position.y = 0;
    this.moon.position.set(this.px - 30, 60, this.pz - 20);
    this.moon.target.position.set(this.px, 0, this.pz);
    this.flashlight.intensity = this.flashOn && this.phase !== "dead" && !veh ? 90 : 0;
    this.vm.hidden = !!veh || this.camMode !== 0 || dead;
    this.audio.setListener(this.camera.position.x, this.camera.position.z, this.camMode === 2 && !veh ? this.yaw : this.yaw);
    if (showAvatar) this.updateAvatar(dt);
  }

  updateAvatar(dt: number) {
    const h = this.human;
    if (this.humanGun !== this.curId) {
      this.humanGun = this.curId;
      h.setGun(this.curId);
    }
    h.root.position.set(this.px, this.py, this.pz);
    const sw = this.swingT > 0 ? 1 - this.swingT / 0.35 : -1;
    if (this.swingT > 0) this.swingT -= dt;
    h.update(
      dt,
      {
        speed: this.speedNow,
        moveYaw: Math.atan2(-this.vx, -this.vz),
        pitch: this.pitch,
        aiming: this.adsT > 0.5,
        melee: this.def.kind === "melee",
        swing: sw,
        dead: this.phase === "dead",
        onGround: this.onGround,
        sprint: this.sprinting,
      },
      this.yaw,
      0,
    );
  }

  render() {
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.vm.scene, this.vm.cam);
  }

  pointScale() {
    const h = this.renderer.domElement.height;
    return h / (2 * Math.tan(((this.camera.fov * Math.PI) / 180) / 2));
  }

  slots(): string[] {
    return WEAPONS.filter((w) => this.inv[w.id]).map((w) => w.id);
  }

  drawRadar() {
    const c = this.radar;
    if (!c) return;
    const g = c.getContext("2d");
    if (!g) return;
    const s = c.width;
    const R = 46;
    const k = s / 2 / R;
    g.clearRect(0, 0, s, s);
    g.save();
    g.beginPath();
    g.arc(s / 2, s / 2, s / 2 - 1, 0, Math.PI * 2);
    g.fillStyle = "rgba(8,10,12,0.62)";
    g.fill();
    g.clip();
    g.strokeStyle = "rgba(255,255,255,0.12)";
    g.lineWidth = 1;
    for (const rr of [0.33, 0.66]) {
      g.beginPath();
      g.arc(s / 2, s / 2, (s / 2) * rr, 0, Math.PI * 2);
      g.stroke();
    }
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    const to = (x: number, z: number) => {
      const dx = x - this.px;
      const dz = z - this.pz;
      // rotate so forward is up: right = (cos, -sin), forward = (-sin, -cos)
      const rx = dx * cy - dz * sy;
      const fw = -dx * sy - dz * cy;
      return [s / 2 + rx * k, s / 2 - fw * k] as const;
    };
    for (const it of this.world.interactables) {
      const [x, y] = to(it.x, it.z);
      g.fillStyle = "#e8c24a";
      g.fillRect(x - 2, y - 2, 4, 4);
    }
    if (this.veh) {
      for (const b of this.veh.blips()) {
        if (b.cur) continue;
        const [x, y] = to(b.x, b.z);
        g.fillStyle = "#5ad0ff";
        g.fillRect(x - 3.5, y - 2.5, 7, 5);
        g.strokeStyle = "#0a2a3a";
        g.strokeRect(x - 3.5, y - 2.5, 7, 5);
      }
    }
    for (const a of this.allyBlips) {
      const [x, y] = to(a.x, a.z);
      g.fillStyle = "#6dff8a";
      g.beginPath();
      g.arc(x, y, 4, 0, 7);
      g.fill();
      g.strokeStyle = "#052";
      g.stroke();
    }
    for (const d of this.drops) {
      const [x, y] = to(d.x, d.z);
      g.fillStyle = DROP_INFO[d.kind].hex;
      g.beginPath();
      g.arc(x, y, 3.5, 0, 7);
      g.fill();
    }
    for (const z of this.zombies) {
      if (z.dead) continue;
      const [x, y] = to(z.x, z.z);
      g.fillStyle = z.type === "boss" ? "#ff2020" : z.type === "brute" ? "#ff7040" : z.type === "spitter" ? "#8aff40" : "#ff4a4a";
      g.beginPath();
      g.arc(x, y, z.type === "boss" ? 6 : z.type === "brute" ? 4 : 2.6, 0, 7);
      g.fill();
    }
    g.restore();
    // player
    g.fillStyle = "#fff";
    g.beginPath();
    g.moveTo(s / 2, s / 2 - 7);
    g.lineTo(s / 2 - 5, s / 2 + 5);
    g.lineTo(s / 2 + 5, s / 2 + 5);
    g.closePath();
    g.fill();
  }

  protected perkList() {
    return PERKS.filter((p) => this.perks.has(p.id)).map((p) => p.id);
  }
  protected maxGren = MAX_GRENADES;
  protected zType?: ZType;
}
