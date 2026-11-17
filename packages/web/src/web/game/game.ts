import * as THREE from "three";
import { MAX_GRENADES, PERKS, W, WEAPONS, ZDEFS, type WeaponDef, type ZType } from "./config";
import { input, resetInput, setKeyboardEnabled } from "./input";
import { PR, EYE, GameBase, DROP_INFO, type Callbacks, type DropKind, type HudState, type Settings } from "./gamebase";
import { pointInBoxes, rayCylinder, raySphere, rayWorld, resolveCircle } from "./physics";
import { animateRig, buildRig, type Zombie } from "./zombie";
import { VehicleSys } from "./vehicleSys";
import { Net } from "./net";

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

interface Hit {
  z: Zombie;
  t: number;
  head: boolean;
}

export class Game extends GameBase {
  // wave state
  wave = 0;
  waveActive = false;
  intermission = 3;
  toSpawn = 0;
  spawnT = 0;
  rafId = 0;
  last = 0;
  running = false;
  bossRef: Zombie | null = null;
  heartT = 0;
  groanClock = 0;
  lastHitZ: Zombie | null = null;
  sawT = 0;
  sawMode = 0;
  scratch = new THREE.Vector3();
  // co-op
  net: Net | null = null;
  creditTo: string | null = null;
  shotCount = 0;
  swingCount = 0;
  uiPaused = false;

  constructor(canvas: HTMLCanvasElement, cb: Callbacks, mobile: boolean, settings: Settings) {
    super(canvas, cb, mobile, settings);
    this.veh = new VehicleSys(this);
    this.veh.init();
    this.resetState();
    window.addEventListener("resize", this.resize);
    document.addEventListener("pointerlockchange", this.onLockChange);
    (window as unknown as { __game: Game; __input: typeof input }).__game = this;
    (window as unknown as { __input: typeof input }).__input = input;
  }

  // ================= lifecycle =================
  startCoop(role: "host" | "guest", code: string, id: string, hostId: string, name: string) {
    this.start();
    this.net = new Net(this, role, code, id, hostId, name);
    this.net.start();
  }
  stopNet() {
    if (this.net) {
      const n = this.net;
      this.net = null;
      n.stop();
    }
    this.uiPaused = false;
  }
  netClosed(msg: string) {
    this.cb.toast(msg);
    this.cb.banner(msg.toUpperCase(), "Returning to menu");
    this.stats.wave = this.wave;
    this.stopNet();
    setTimeout(() => this.cb.dead({ ...this.stats }), 1200);
  }
  finishCoop() {
    this.stats.wave = this.wave;
    this.stopNet();
    this.cb.dead({ ...this.stats });
  }
  revive() {
    if (this.phase !== "dead") return;
    this.phase = "playing";
    this.hp = this.maxHp * 0.6;
    this.vm.hidden = false;
    setKeyboardEnabled(true);
    this.requestLock();
    this.cb.toast("You're back on your feet");
    this.pushHud();
  }
  start() {
    this.stopNet();
    this.audio.init();
    this.audio.setVolume(this.settings.volume);
    this.audio.startMusic();
    this.resetState();
    this.phase = "playing";
    setKeyboardEnabled(true);
    this.last = performance.now();
    this.requestLock();
    if (!this.running) {
      this.running = true;
      this.loop(this.last);
    }
  }
  /** keeps rendering the scene behind menus */
  idle() {
    if (!this.running) {
      this.running = true;
      this.last = performance.now();
      this.loop(this.last);
    }
  }
  requestLock() {
    if (!input.touch) {
      try {
        const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
        p?.catch?.(() => undefined);
      } catch {
        /* ignore */
      }
    }
  }
  onLockChange = () => {
    if (!document.pointerLockElement && this.phase === "playing" && !this.uiPaused && !input.touch) this.pause();
  };
  pause() {
    if (this.net) {
      // co-op never freezes the world
      if (this.phase !== "playing" || this.uiPaused) return;
      this.uiPaused = true;
      setKeyboardEnabled(false);
      if (document.pointerLockElement) document.exitPointerLock();
      this.cb.paused();
      this.pushHud();
      return;
    }
    if (this.phase !== "playing") return;
    this.phase = "paused";
    setKeyboardEnabled(false);
    this.audio.stopLoops();
    this.audio.duckMusic(0.15);
    if (document.pointerLockElement) document.exitPointerLock();
    this.cb.paused();
    this.pushHud();
  }
  resume() {
    if (this.net && this.uiPaused) {
      this.uiPaused = false;
      if (this.phase === "playing") {
        setKeyboardEnabled(true);
        this.requestLock();
      }
      this.pushHud();
      return;
    }
    if (this.phase !== "paused") return;
    this.phase = "playing";
    setKeyboardEnabled(true);
    this.audio.init();
    this.audio.duckMusic(0.35);
    this.last = performance.now();
    this.requestLock();
    this.pushHud();
  }
  toMenu() {
    this.stopNet();
    this.phase = "menu";
    setKeyboardEnabled(false);
    this.audio.stopLoops();
    this.audio.duckMusic(0.35);
    if (document.pointerLockElement) document.exitPointerLock();
    this.pushHud();
  }
  dispose() {
    this.stopNet();
    cancelAnimationFrame(this.rafId);
    this.running = false;
    window.removeEventListener("resize", this.resize);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    this.audio.stopMusic();
    this.audio.stopLoops();
    this.renderer.dispose();
  }
  setSettings(s: Partial<Settings>) {
    Object.assign(this.settings, s);
    if (s.volume !== undefined) this.audio.setVolume(s.volume);
    if (s.quality) this.applyQuality(s.quality);
  }

  resetState() {
    this.stopNet();
    for (const z of this.zombies) this.scene.remove(z.rig.root);
    this.zombies = [];
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    this.projectiles = [];
    for (const d of this.drops) this.scene.remove(d.mesh);
    this.drops = [];
    this.fx.clear();
    this.veh?.exit(true);
    this.veh?.reset();
    this.camMode = 0;
    this.px = 0;
    this.pz = 12;
    this.py = 0;
    this.vx = this.vz = this.vy = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.maxHp = 100;
    this.hp = 100;
    this.armor = 0;
    this.points = 500;
    this.perks.clear();
    this.inv = { knife: { mag: 0, reserve: 0 }, pistol: { mag: W.pistol.mag, reserve: 72 } };
    this.curId = "pistol";
    this.vm.setWeapon("pistol", true);
    this.vm.curKick = W.pistol.kick;
    this.grenades = 2;
    this.reloading = false;
    this.fireCd = 0;
    this.switchLock = 0;
    this.instakill = this.doublePoints = 0;
    this.wave = 0;
    this.waveActive = false;
    this.intermission = 4;
    this.toSpawn = 0;
    this.bossRef = null;
    this.stats = { wave: 0, kills: 0, headshots: 0, points: 0, time: 0, shots: 0, hits: 0 };
    this.deathT = 0;
    this.lastHurt = -99;
    this.adsT = 0;
    this.meleePending = -1;
    this.heat = 0;
    this.spinT = 0;
    resetInput();
    this.audio.stopLoops();
  }

  // ================= main loop =================
  loop = (now: number) => {
    this.rafId = requestAnimationFrame(this.loop);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.1) dt = 0.1;
    if (dt <= 0) return;
    this.time += dt;
    this.fpsAcc += dt;
    this.fpsN++;
    if (this.fpsAcc >= 1) {
      this.fps = this.fpsN / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsN = 0;
      if (this.phase === "playing" && this.fps < 24 && this.settings.quality !== "low") {
        this.lowFpsT++;
        if (this.lowFpsT >= 3) {
          this.lowFpsT = 0;
          const q = this.settings.quality === "high" ? "med" : "low";
          this.applyQuality(q);
          this.cb.quality(q);
        }
      } else this.lowFpsT = 0;
    }
    if (this.phase === "playing" || this.phase === "dead") this.simulate(dt);
    else this.idleAnim(dt);
    this.fx.update(this.phase === "paused" ? 0 : dt, this.pointScale());
    this.world.update(this.time);
    this.updateCamera(dt);
    this.render();
    this.hudT += dt;
    if (this.hudT > 0.1) {
      this.hudT = 0;
      this.pushHud();
    }
    this.radarT += dt;
    if (this.radarT > 0.05) {
      this.radarT = 0;
      this.drawRadar();
    }
  };

  idleAnim(dt: number) {
    // slow orbit behind menu
    if (this.phase === "menu") {
      this.yaw += dt * 0.05;
      this.pitch = -0.04;
    }
    this.vm.update(dt, 0, false, true, 0, 0, 0, 60, this.camera.aspect);
    for (const z of this.zombies) animateRig(z, this.time, dt, 0);
  }

  simulate(dt: number) {
    const alive = this.phase === "playing";
    this.stats.time += alive ? dt : 0;
    const lookDX = input.lookDX;
    const lookDY = input.lookDY;
    if (alive) {
      const zoomK = this.fovCur / this.settings.fov;
      const sens = this.settings.sens * 0.0022 * zoomK;
      this.yaw -= lookDX * sens;
      this.pitch -= lookDY * sens * (this.settings.invertY ? -1 : 1);
      this.pitch = clamp(this.pitch, -1.5, 1.5);
      input.lookDX = input.lookDY = 0;
      this.adsT += ((input.ads && this.canAds() ? 1 : 0) - this.adsT) * Math.min(1, dt * 10);
      if (input.cam) {
        input.cam = false;
        this.camMode = ((this.camMode + 1) % 3) as 0 | 1 | 2;
        this.cb.toast(["First person", "Third person", "Second person (front view)"][this.camMode]);
      }
      if (this.veh.cur) {
        input.jump = input.reload = input.grenade = input.melee = input.next = input.prev = false;
        input.selectSlot = -1;
        this.speedNow = 0;
        this.sprinting = false;
        this.adsT = 0;
        this.veh.update(dt);
      } else {
        this.movePlayer(dt);
        this.updateWeapon(dt);
        this.veh.update(dt);
        this.updateInteract();
      }
      if (!this.net || this.net.isHost) this.updateWaves(dt);
      // regen
      if (this.time - this.lastHurt > 7 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + 5 * dt);
      if (this.hp < 30 && this.hp > 0) {
        this.heartT -= dt;
        if (this.heartT <= 0) {
          this.heartT = 0.9 + this.hp / 60;
          this.audio.heartbeat();
        }
      }
      this.instakill = Math.max(0, this.instakill - dt);
      this.doublePoints = Math.max(0, this.doublePoints - dt);
      this.grenadeCd -= dt;
    } else {
      this.veh.update(dt);
      if (this.net?.isHost) this.updateWaves(dt);
      this.deathT += dt;
      input.lookDX = input.lookDY = 0;
      this.speedNow = 0;
    }
    this.vm.update(dt, this.speedNow, this.sprinting, this.onGround, lookDX, lookDY, this.adsT, 60, this.camera.aspect);
    this.net?.update(dt);
    this.updateZombies(dt);
    this.updateProjectiles(dt);
    this.updateDrops(dt);
  }

  canAds() {
    const d = this.def;
    return d.kind !== "melee" && d.kind !== "flame" && this.curId !== "minigun" && !this.sprinting;
  }

  // ================= weapons =================
  switchTo(id: string) {
    if (!this.inv[id] || id === this.curId) return;
    this.curId = id;
    this.reloading = false;
    this.vm.cancelReload();
    this.vm.setWeapon(id);
    this.vm.curKick = W[id].kick;
    this.switchLock = 0.3;
    this.meleePending = -1;
    this.audio.stopLoops();
    this.sawMode = 0;
    this.vm.active = false;
    this.spinT = 0;
    this.audio.click();
  }
  cycle(dir: number) {
    const s = this.slots();
    const i = s.indexOf(this.curId);
    this.switchTo(s[(i + dir + s.length) % s.length]);
  }

  updateWeapon(dt: number) {
    const d = this.def;
    const a = this.inv[this.curId];
    this.fireCd = Math.max(0, this.fireCd - dt);
    this.switchLock = Math.max(0, this.switchLock - dt);
    this.clickCd = Math.max(0, this.clickCd - dt);
    this.heat = Math.max(0, this.heat - dt * 1.4);
    if (input.selectSlot >= 0) {
      const s = this.slots();
      if (input.selectSlot < s.length) this.switchTo(s[input.selectSlot]);
      input.selectSlot = -1;
    }
    if (input.next) {
      this.cycle(1);
      input.next = false;
    }
    if (input.prev) {
      this.cycle(-1);
      input.prev = false;
    }
    if (input.flashlight) {
      this.flashOn = !this.flashOn;
      this.audio.click();
      input.flashlight = false;
    }
    if (input.grenade) {
      this.throwGrenade();
      input.grenade = false;
    }
    if (input.melee) {
      this.quickMelee();
      input.melee = false;
    }
    if (input.reload) {
      this.tryReload();
      input.reload = false;
    }

    // reload progress
    if (this.reloading) {
      this.reloadT -= dt;
      if (d.shell) {
        if (this.reloadT <= 0) {
          if (a.mag < d.mag && a.reserve > 0) {
            a.mag++;
            a.reserve--;
            this.audio.play("reload_shell", { vol: 0.55, rate: 1.0 });
            this.reloadT = this.reloadTime();
          }
          if (a.mag >= d.mag || a.reserve <= 0) {
            this.reloading = false;
            this.vm.cancelReload();
          }
        }
      } else if (this.reloadT <= 0) {
        const need = d.mag - a.mag;
        const take = Math.min(need, a.reserve);
        a.mag += take;
        a.reserve -= take;
        this.reloading = false;
      }
    }

    const fireDown = input.fire;
    const fresh = fireDown && !this.firePrev;
    this.firePrev = fireDown;
    if (fresh) this.bufferShot = 0.18;
    this.bufferShot -= dt;
    const ready = this.switchLock <= 0 && !this.sprintBlock();

    this.vm.empty = d.kind !== "melee" && a.mag <= 0;
    if (d.fx === "saw") {
      const on = fireDown && ready;
      const mode = on ? 2 : 1;
      if (mode !== this.sawMode) {
        this.sawMode = mode;
        this.audio.setChainsaw(mode);
      }
      this.vm.active = on;
      if (on) {
        this.sawT -= dt;
        this.shake = Math.max(this.shake, 0.006);
        while (this.sawT <= 0) {
          this.sawT += 60 / d.rpm;
          this.meleeHit(d);
        }
      } else this.sawT = 0;
      return;
    }
    if (d.kind === "melee") {
      if (fireDown && this.fireCd <= 0 && ready) this.meleeSwing(d);
      if (this.meleePending >= 0) {
        this.meleePending -= dt;
        if (this.meleePending < 0) this.meleeHit(d);
      }
      return;
    }
    // minigun spin
    if (d.spinUp) {
      if (fireDown && !this.reloading && a.mag > 0) this.spinT = Math.min(d.spinUp, this.spinT + dt);
      else this.spinT = Math.max(0, this.spinT - dt * 0.8);
      this.vm.spinSpeed = this.spinT / d.spinUp;
      this.audio.setSpin(this.spinT / d.spinUp);
    }
    if (d.kind === "flame") {
      const on = fireDown && ready && a.mag > 0 && !this.reloading;
      this.audio.setFlame(on);
      this.vm.spinSpeed = 0;
      if (on) {
        this.flameTick -= dt;
        while (this.flameTick <= 0) {
          this.flameTick += 60 / d.rpm;
          this.flameShot(d);
          if (a.mag <= 0) break;
        }
      } else this.flameTick = 0;
      if (fireDown && a.mag <= 0 && a.reserve > 0) this.tryReload();
      return;
    }
    const want = d.auto ? fireDown : this.bufferShot > 0;
    if (!want) return;
    if (this.reloading) {
      if (d.shell && a.mag > 0 && fresh) {
        this.reloading = false;
        this.vm.cancelReload();
      } else return;
    }
    if (!ready || this.fireCd > 0) return;
    if (d.spinUp && this.spinT < d.spinUp) return;
    if (a.mag <= 0) {
      if (a.reserve > 0) this.tryReload();
      else if (this.clickCd <= 0) {
        this.audio.click();
        this.clickCd = 0.3;
        this.bufferShot = 0;
      }
      return;
    }
    this.shoot(d, a);
    this.bufferShot = 0;
  }

  sprintBlock() {
    return false;
  }

  reloadTime() {
    return this.def.reload * (this.perks.has("hands") ? 0.6 : 1);
  }

  tryReload() {
    const d = this.def;
    const a = this.inv[this.curId];
    if (d.kind === "melee" || this.reloading || a.mag >= d.mag || a.reserve <= 0 || this.switchLock > 0) return;
    this.reloading = true;
    this.reloadT = this.reloadTime();
    if (d.shell) this.vm.startReload((d.mag - a.mag) * this.reloadTime() + 0.2);
    else {
      this.vm.startReload(this.reloadTime());
      this.audio.play("reload", { vol: 0.7, rate: clamp(2 / this.reloadTime() * 0.95, 0.9, 1.5) });
    }
  }

  spreadNow(d: WeaponDef) {
    let s = d.spread * (1 + this.heat * 1.6);
    if (this.adsT > 0.5) s *= 0.4;
    if (this.speedNow > 2) s *= 1.5;
    if (!this.onGround) s *= 2;
    return s;
  }

  aimDir(spread: number, out: THREE.Vector3) {
    const e = this.camMode === 0 ? this.camera.rotation : this.aimE;
    out.set(0, 0, -1).applyEuler(e);
    if (spread > 0) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * spread;
      const right = new THREE.Vector3(1, 0, 0).applyEuler(e);
      const up = new THREE.Vector3(0, 1, 0).applyEuler(e);
      out.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
    }
    return out;
  }

  muzzlePos(out: THREE.Vector3) {
    if (this.camMode !== 0) {
      out.set(0.25, -0.2, -0.9).applyEuler(this.aimE).add(this.rayO);
      return out;
    }
    const e = this.camera.rotation;
    const adsK = this.adsT;
    out.set(0.2 * (1 - adsK), -0.17 * (1 - adsK * 0.5), -0.75).applyEuler(e).add(this.camera.position);
    return out;
  }

  shoot(d: WeaponDef, a: { mag: number; reserve: number }) {
    a.mag--;
    this.shotCount++;
    this.fireCd = 60 / d.rpm;
    this.stats.shots++;
    this.heat = Math.min(1, this.heat + 0.22);
    const adsK = 1 - this.adsT * 0.45;
    this.pitch += d.recoil * rnd(0.75, 1.1) * adsK;
    this.yaw += rnd(-1, 1) * d.recoil * 0.35 * adsK;
    this.shake = Math.max(this.shake, d.recoil * 0.5);
    this.vm.fire();
    const o = this.rayO;
    const mz = this.muzzlePos(new THREE.Vector3());
    if (d.kind === "launcher") {
      const gren = d.fx === "grenade";
      if (gren) this.audio.gun("glauncher", { vol: 0.9 });
      else this.audio.rocketLaunch();
      const dir = this.aimDir(0, new THREE.Vector3());
      const mesh = new THREE.Group();
      if (gren) {
        const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.2, 10), new THREE.MeshStandardMaterial({ color: 0x6a6a4a, metalness: 0.7, roughness: 0.4 }));
        shell.rotation.x = Math.PI / 2;
        const nose = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshStandardMaterial({ color: 0xb08a30, metalness: 0.8, roughness: 0.3 }));
        nose.position.z = -0.1;
        mesh.add(shell, nose);
      } else {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 10), new THREE.MeshStandardMaterial({ color: 0x556644, metalness: 0.5, roughness: 0.5 }));
        body.rotation.x = Math.PI / 2;
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 10), new THREE.MeshStandardMaterial({ color: 0xaa2222 }));
        tip.rotation.x = -Math.PI / 2;
        tip.position.z = -0.38;
        mesh.add(body, tip);
      }
      this.scene.add(mesh);
      const sp = gren ? 34 : 42;
      this.projectiles.push({ type: "rocket", mesh, x: mz.x, y: mz.y, z: mz.z, vx: dir.x * sp, vy: dir.y * sp, vz: dir.z * sp, fuse: 0, life: 5, dmg: d.dmg, splash: d.splash, grav: gren ? 7 : 0, light: !gren });
      for (let i = 0; i < (gren ? 6 : 14); i++) this.fx.smoke(mz.x - dir.x, mz.y - dir.y, mz.z - dir.z, 0.7, 1.4);
      if (a.mag <= 0 && a.reserve > 0) setTimeout(() => this.phase === "playing" && this.tryReload(), 350);
      return;
    }
    const sfx = d.sfx ?? (d.sound === "none" ? "pistol" : d.sound);
    this.audio.gun(sfx, { vol: d.id === "smg" ? 0.6 : d.id === "minigun" ? 0.4 : d.fx === "arc" ? 0.55 : 0.95, rate: d.pitch, wet: d.id === "minigun" || d.id === "smg" ? 0.12 : 0.35 });
    if (d.id === "shotgun") setTimeout(() => this.phase === "playing" && this.audio.play("pump", { vol: 0.6 }), 280);
    if (d.id === "sniper") setTimeout(() => this.phase === "playing" && this.audio.play("bolt", { vol: 0.6 }), 450);
    const dmgMul = (this.perks.has("dmg") ? 1.35 : 1) * (this.instakill > 0 ? 9999 : 1);
    const dir = new THREE.Vector3();
    const spread = this.spreadNow(d);
    let anyHit = false;
    for (let p = 0; p < d.pellets; p++) {
      this.aimDir(spread, dir);
      this.lastHitZ = null;
      const r = this.castRay(o.x, o.y, o.z, dir.x, dir.y, dir.z, d, dmgMul);
      if (r.hitZ) anyHit = true;
      const ex = o.x + dir.x * r.t;
      const ey = o.y + dir.y * r.t;
      const ez = o.z + dir.z * r.t;
      if (d.fx === "arc") {
        this.fx.lightning(mz.x, mz.y, mz.z, ex, ey, ez);
        this.fx.lightning(mz.x, mz.y, mz.z, ex, ey, ez, 0xffffff, 0.015);
        this.chainArc(this.lastHitZ, d, dmgMul, ex, ey, ez);
      } else if (d.fx === "rail") {
        this.fx.beam(mz.x, mz.y, mz.z, ex, ey, ez, 0x9fd8ff, 0.12, 0.35);
        this.fx.beam(mz.x, mz.y, mz.z, ex, ey, ez, 0xffffff, 0.04, 0.2);
        this.fx.sparks(ex, ey, ez, -dir.x, 0.5, -dir.z, 14);
        this.shake = Math.max(this.shake, 0.05);
      } else if (d.fx === "bolt") {
        this.fx.beam(mz.x, mz.y, mz.z, ex, ey, ez, 0xd8c8a0, 0.018, 0.22);
      } else if (p < 3 || d.pellets === 1) this.fx.tracer(mz.x, mz.y, mz.z, ex, ey, ez);
    }
    if (anyHit) this.stats.hits++;
    // shell ejection / smoke
    if (d.fx !== "arc" && d.fx !== "bolt") this.fx.smoke(mz.x, mz.y, mz.z, 0.25, 0.8);
    if (a.mag <= 0 && a.reserve > 0 && d.id !== "sniper" && d.id !== "crossbow") setTimeout(() => this.phase === "playing" && this.tryReload(), 250);
  }

  castRay(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, d: WeaponDef, dmgMul: number) {
    const tw = rayWorld(this.world.boxes, ox, oy, oz, dx, dy, dz, d.range);
    const hits: Hit[] = [];
    for (const z of this.zombies) {
      if (z.dead) continue;
      const s = z.def.scale;
      const rel = (z.x - ox) * dx + (z.z - oz) * dz;
      if (rel < -2) continue;
      const lean = Math.sin(z.def.lean) * 0.86 * s;
      const hx = z.x + Math.sin(z.yaw) * lean;
      const hz = z.z + Math.cos(z.yaw) * lean;
      const hy = z.y + (0.95 + 0.86 * Math.cos(z.def.lean)) * s;
      const th = raySphere(ox, oy, oz, dx, dy, dz, hx, hy, hz, 0.25 * s);
      const tb = rayCylinder(ox, oy, oz, dx, dy, dz, z.x, z.z, Math.max(0.3, 0.36 * s), z.y, z.y + 1.55 * s);
      if (th === Infinity && tb === Infinity) continue;
      hits.push({ z, t: Math.min(th, tb), head: th <= tb + 0.05 });
    }
    hits.sort((p, q) => p.t - q.t);
    let end = tw;
    let hitZ = false;
    let n = 0;
    for (const h of hits) {
      if (h.t > tw) break;
      hitZ = true;
      let dmg = d.dmg * (h.head ? d.headMult : 1) * dmgMul;
      if (d.pellets > 1) dmg *= 1 - clamp((h.t - 8) / 30, 0, 0.75);
      const px = ox + dx * h.t;
      const py = oy + dy * h.t;
      const pz = oz + dz * h.t;
      this.damageZombie(h.z, dmg, h.head, px, py, pz, dx, dz);
      if (!this.lastHitZ) this.lastHitZ = h.z;
      n++;
      if (n >= d.pierce) {
        end = h.t;
        break;
      }
    }
    if (!hitZ || n < d.pierce) {
      if (tw < d.range) {
        const ix = ox + dx * tw;
        const iy = oy + dy * tw;
        const iz = oz + dz * tw;
        const ny = iy < 0.1 ? 1 : 0;
        this.fx.sparks(ix - dx * 0.05, iy - dy * 0.05, iz - dz * 0.05, -dx * (1 - ny) * 0.6, ny, -dz * (1 - ny) * 0.6, d.pellets > 1 ? 2 : 6);
      }
    }
    return { t: end, hitZ };
  }

  /** Tesla Arc: lightning jumps from the first target to nearby zombies */
  chainArc(first: Zombie | null, d: WeaponDef, dmgMul: number, ex: number, ey: number, ez: number) {
    if (!first) return;
    const seen = new Set<Zombie>([first]);
    let cx = first.x;
    let cy = first.y + 1.2 * first.def.scale;
    let cz = first.z;
    let dmg = d.dmg * 0.75 * dmgMul;
    for (let j = 0; j < 5; j++) {
      let best: Zombie | null = null;
      let bd = 7.5;
      for (const z of this.zombies) {
        if (z.dead || seen.has(z)) continue;
        const dd = Math.hypot(z.x - cx, z.z - cz);
        if (dd < bd) {
          bd = dd;
          best = z;
        }
      }
      if (!best) break;
      seen.add(best);
      const ty = best.y + 1.2 * best.def.scale;
      this.fx.lightning(cx, cy, cz, best.x, ty, best.z);
      best.stagger = 0.35;
      this.damageZombie(best, dmg, false, best.x, ty, best.z, 0, 0, true);
      this.fx.sparks(best.x, ty, best.z, 0, 1, 0, 5);
      cx = best.x;
      cy = ty;
      cz = best.z;
      dmg *= 0.8;
    }
    void ex; void ey; void ez;
  }

  flameShot(d: WeaponDef) {
    const a = this.inv[this.curId];
    a.mag--;
    this.vm.flashLight.intensity = 5 + Math.random() * 2;
    this.vm.flashT = 0.08;
    const mz = this.muzzlePos(new THREE.Vector3());
    const dir = this.aimDir(0.05, new THREE.Vector3());
    for (let i = 0; i < 2; i++) this.fx.fire(mz.x, mz.y, mz.z, dir.x * 11, dir.y * 11, dir.z * 11, 0.55, 0.7);
    // cone damage
    const o = this.rayO;
    const dmgMul = (this.instakill > 0 ? 9999 : 1);
    for (const z of this.zombies) {
      if (z.dead) continue;
      const rx = z.x - o.x;
      const rz = z.z - o.z;
      const ry = z.y + 1 - o.y;
      const t = rx * dir.x + ry * dir.y + rz * dir.z;
      if (t < 0 || t > d.range) continue;
      const lat = Math.hypot(rx - dir.x * t, ry - dir.y * t, rz - dir.z * t);
      if (lat > 0.8 * z.def.scale + t * 0.16) continue;
            z.burn = 3.5;
      this.damageZombie(z, d.dmg * dmgMul, false, z.x, z.y + 1, z.z, dir.x * 0.3, dir.z * 0.3, true);
    }
  }

  meleeSwing(d: WeaponDef) {
    this.swingCount++;
    this.fireCd = 60 / d.rpm;
    this.vm.startSwing(Math.min(0.4, 60 / d.rpm * 0.7));
    this.audio.swish();
    this.swingT = 0.35;
    this.meleePending = 0.12;
  }
  quickMelee() {
    if (this.def.kind === "melee" || this.fireCd > 0) return;
    // fast stab with knife without switching: use a short kick animation + damage
    this.fireCd = 0.5;
    this.swingCount++;
    this.swingT = 0.3;
    this.vm.fire();
    this.audio.swish();
    const d = W.knife;
    this.meleeHitWith(d, 0.1);
  }
  meleeHitWith(d: WeaponDef, delay: number) {
    setTimeout(() => {
      if (this.phase === "playing") this.meleeHit(d);
    }, delay * 1000);
  }
  meleeHit(d: WeaponDef) {
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const cone = d.id === "axe" ? 0.45 : d.id === "katana" ? 0.3 : d.id === "chainsaw" ? 0.5 : 0.62;
    const list: { z: Zombie; dist: number }[] = [];
    for (const z of this.zombies) {
      if (z.dead) continue;
      const dx = z.x - this.px;
      const dz = z.z - this.pz;
      const dist = Math.hypot(dx, dz) - z.def.radius;
      if (dist > d.range) continue;
      const dot = (dx * fx + dz * fz) / (Math.hypot(dx, dz) || 1);
      if (dot < cone) continue;
      if (Math.abs(this.py + 1.2 - (z.y + 1 * z.def.scale)) > 1.8 * z.def.scale) continue;
      list.push({ z, dist });
    }
    list.sort((a, b) => a.dist - b.dist);
    const mul = (this.instakill > 0 ? 9999 : 1) * (this.perks.has("dmg") ? 1.2 : 1);
    let n = 0;
    for (const { z } of list) {
      this.damageZombie(z, d.dmg * mul, false, z.x, z.y + 1.3 * z.def.scale, z.z, fx, fz);
      this.audio.stab();
      z.stagger = 0.4;
      z.vx += fx * 5;
      z.vz += fz * 5;
      if (++n >= d.pierce) break;
    }
    if (n === 0) this.shake = Math.max(this.shake, 0.004);
  }

  throwGrenade() {
    if (this.grenades <= 0 || this.grenadeCd > 0) return;
    this.grenades--;
    this.grenadeCd = 0.8;
    this.audio.whoosh();
    const dir = this.aimDir(0, new THREE.Vector3());
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3a4a2a, roughness: 0.5, metalness: 0.4 }));
    this.scene.add(mesh);
    const o = this.rayO;
    this.projectiles.push({ type: "grenade", mesh, x: o.x + dir.x * 0.5, y: o.y - 0.15 + dir.y * 0.5, z: o.z + dir.z * 0.5, vx: dir.x * 16 + this.vx * 0.5, vy: dir.y * 16 + 3.5, vz: dir.z * 16 + this.vz * 0.5, fuse: 2.3, life: 6 });
  }

  // ================= damage =================
  addPoints(n: number) {
    const v = Math.round(n * (this.doublePoints > 0 ? 2 : 1));
    this.points += v;
    this.stats.points += v;
  }

  damageZombie(z: Zombie, dmg: number, head: boolean, px: number, py: number, pz: number, dx: number, dz: number, fire = false) {
    if (z.dead) return;
    const net = this.net;
    if (net && !net.isHost) {
      // guest: predict only; the host owns real health and kills
      if (fire) return;
      z.hp = Math.max(z.hp - dmg / Math.max(1, z.def.hp), 0.02);
      this.addPoints(head ? 20 : 10);
      this.fx.blood(px, py, pz, dx * 0.5, dz * 0.5, head ? 9 : 5);
      this.audio.fleshHit(z.x, z.z);
      this.cb.hit(head ? "head" : "hit");
      this.audio.hit(head);
      net.queueHit(z.id, dmg, head, px, py, pz);
      return;
    }
    z.hp -= dmg;
    const by = this.creditTo;
    if (!fire && by) {
      this.fx.blood(px, py, pz, dx * 0.5, dz * 0.5, head ? 9 : 5);
      this.audio.fleshHit(z.x, z.z);
      if (dmg > 20) z.stagger = Math.max(z.stagger, z.type === "boss" ? 0 : z.type === "brute" ? 0.1 : 0.25);
      if (z.hp <= 0) this.killZombie(z, head, dx, dz);
      else net?.credit(by, head ? 20 : 10, head, false);
      return;
    }
    if (!fire) {
      this.addPoints(head ? 20 : 10);
      this.fx.blood(px, py, pz, dx * 0.5, dz * 0.5, head ? 9 : 5);
      this.audio.fleshHit(z.x, z.z);
      if (dmg > 20) z.stagger = Math.max(z.stagger, z.type === "boss" ? 0 : z.type === "brute" ? 0.1 : 0.25);
    } else if (Math.random() < 0.2) this.fx.blood(px, py, pz, 0, 0, 1);
    if (z.hp <= 0) this.killZombie(z, head, dx, dz);
    else if (!fire) {
      this.cb.hit(head ? "head" : "hit");
      this.audio.hit(head);
    }
  }

  killZombie(z: Zombie, head: boolean, dx = 0, dz = 0) {
    z.dead = true;
    z.deadT = 0;
    z.fallDir = Math.random() < 0.5 ? 1 : -1;
    if (this.creditTo && this.net) {
      this.net.credit(this.creditTo, z.def.score + (head ? 50 : 0), head, true);
    } else {
      this.stats.kills++;
      if (head) this.stats.headshots++;
      this.addPoints(z.def.score + (head ? 50 : 0));
      this.cb.hit("kill");
    }
    this.fx.splat(z.x, z.z, 1.2 * z.def.scale);
    this.fx.blood(z.x, z.y + 1.2 * z.def.scale, z.z, dx * 0.6, dz * 0.6, 14, 1.2);
    this.audio.play("death", { x: z.x, z: z.z, vol: 0.9, rate: rnd(0.9, 1.15) });
    if (z.type === "bloater") {
      this.fx.gas(z.x, 1, z.z, 22);
      this.explode(z.x, 1, z.z, 5, 120, false, 38);
    }
    if (z.type === "boss") {
      this.bossRef = null;
      this.cb.banner("ABOMINATION SLAIN", "+2000");
      this.dropAt(z.x, z.z, "nuke", true);
      this.dropAt(z.x + 1.5, z.z, "ammo", true);
    } else if (Math.random() < 0.07 + (z.type === "brute" ? 0.2 : 0)) {
      const kinds: DropKind[] = ["ammo", "medkit", "nuke", "instakill", "double", "ammo", "medkit"];
      this.dropAt(z.x, z.z, kinds[Math.floor(Math.random() * kinds.length)]);
    }
  }

  hurtPlayer(dmg: number, fx: number, fz: number) {
    if (this.phase !== "playing") return;
    const vc = this.veh.cur;
    if (vc && vc.alive) {
      this.veh.damage(vc, dmg * (vc.kind === "tank" ? 0.5 : 1.3));
      this.shake = Math.max(this.shake, 0.03);
      this.lastHurt = this.time;
      this.audio.play("car_crash", { vol: 0.25, rate: 1.6 });
      return;
    }
    if (this.armor > 0) {
      const ab = Math.min(this.armor, dmg * 0.6);
      this.armor -= ab;
      dmg -= ab;
    }
    this.hp -= dmg;
    this.lastHurt = this.time;
    this.shake = Math.max(this.shake, 0.04);
    this.audio.hurt();
    const dx = fx - this.px;
    const dz = fz - this.pz;
    const fwdx = -Math.sin(this.yaw);
    const fwdz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    this.cb.damage(Math.atan2(dx * rx + dz * rz, dx * fwdx + dz * fwdz), dmg);
    if (this.hp <= 0) this.die();
  }

  die() {
    this.veh.exit(true);
    this.hp = 0;
    this.phase = "dead";
    this.deathT = 0;
    setKeyboardEnabled(false);
    this.audio.stopLoops();
    this.audio.duckMusic(0.1);
    if (document.pointerLockElement) document.exitPointerLock();
    this.stats.wave = this.wave;
    this.vm.hidden = true;
    this.pushHud();
    if (this.net) {
      this.cb.toast("You're down! Teammates can still win the wave");
      if (this.net.isHost && this.net.allDown()) this.net.broadcast({ t: "over" }), this.finishCoopSoon();
      return;
    }
    setTimeout(() => this.cb.dead({ ...this.stats }), 1800);
  }
  finishCoopSoon() {
    setTimeout(() => this.net && this.finishCoop(), 1800);
  }

  explode(x: number, y: number, z: number, radius: number, dmg: number, fromPlayer: boolean, playerDmg = dmg * 0.35) {
    this.fx.explosion(x, y, z, radius);
    this.audio.play("explosion", { x, z, vol: 1, maxDist: 120, rate: rnd(0.9, 1.05) });
    const dp = Math.hypot(x - this.px, z - this.pz);
    this.shake = Math.max(this.shake, clamp(0.12 * (1 - dp / 40), 0, 0.12));
    if (!fromPlayer) {
      for (const v of this.veh.list) {
        if (!v.alive) continue;
        const dv = Math.hypot(v.x - x, v.z - z) - v.def.radius;
        if (dv < radius) this.veh.damage(v, dmg * 0.4 * (1 - clamp(dv / radius, 0, 1)));
      }
    }
    for (const zb of this.zombies) {
      if (zb.dead) continue;
      const d = Math.hypot(zb.x - x, (zb.y + zb.def.scale * 0.9) - y, zb.z - z) - zb.def.radius;
      if (d > radius) continue;
      const f = 1 - clamp(d / radius, 0, 1);
      const mul = this.instakill > 0 && fromPlayer ? 9999 : 1;
      const dd = zb.type === "boss" ? dmg * 0.6 : dmg;
      zb.stagger = 0.5;
      const nx = (zb.x - x) / (d + 1);
      const nz = (zb.z - z) / (d + 1);
      zb.vx += nx * 8 * f;
      zb.vz += nz * 8 * f;
      zb.burn = Math.max(zb.burn, fromPlayer ? 2 : 0);
      this.damageZombie(zb, dd * (0.35 + 0.65 * f) * mul, false, zb.x, zb.y + 1, zb.z, nx, nz, true);
      if (!zb.dead) this.cb.hit("hit");
    }
    if (dp < radius + 0.5 && this.phase === "playing" && !(this.veh.cur && fromPlayer)) {
      const f = 1 - clamp(dp / (radius + 0.5), 0, 1);
      if (fromPlayer) this.hurtPlayer(playerDmg * f, x, z);
      else this.hurtPlayer(playerDmg * f, x, z);
      this.vx += ((this.px - x) / (dp + 0.5)) * 6 * f;
      this.vz += ((this.pz - z) / (dp + 0.5)) * 6 * f;
    }
  }

  // ================= projectiles / drops =================
  updateProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      let boom = false;
      if (p.type === "rocket") {
        if (p.grav) p.vy -= p.grav * dt;
        const rdmg = p.dmg ?? W.rocket.dmg;
        const steps = Math.ceil((Math.hypot(p.vx, p.vy, p.vz) * dt) / 0.6);
        for (let s = 0; s < steps && !boom; s++) {
          p.x += (p.vx * dt) / steps;
          p.y += (p.vy * dt) / steps;
          p.z += (p.vz * dt) / steps;
          if (p.y < 0.1 || pointInBoxes(p.x, p.y, p.z, this.world.boxes)) boom = true;
          for (const z of this.zombies) {
            if (z.dead) continue;
            if (Math.hypot(z.x - p.x, z.z - p.z) < z.def.radius + 0.25 && p.y < z.y + 1.9 * z.def.scale && p.y > z.y) {
              boom = true;
              this.damageZombie(z, rdmg * (this.instakill > 0 ? 9999 : 1), false, p.x, p.y, p.z, 0, 0);
              break;
            }
          }
        }
        p.mesh.position.set(p.x, p.y, p.z);
        p.mesh.lookAt(p.x + p.vx, p.y + p.vy, p.z + p.vz);
        this.fx.smoke(p.x, p.y, p.z, 0.4, 0.9);
        if (p.light !== false) this.fx.fire(p.x, p.y, p.z, 0, 0, 0, 0.25, 0.5);
        if (p.life <= 0) boom = true;
        if (boom) this.explode(p.x, Math.max(0.3, p.y), p.z, p.splash ?? W.rocket.splash ?? 6, rdmg, true, 45);
      } else if (p.type === "grenade") {
        p.fuse -= dt;
        p.vy -= 18 * dt;
        let nx = p.x + p.vx * dt;
        let ny = p.y + p.vy * dt;
        let nz = p.z + p.vz * dt;
        const hitBox = pointInBoxes(nx, ny, nz, this.world.boxes);
        if (hitBox) {
          if (ny > hitBox.top - 0.4 && p.vy < 0) {
            ny = hitBox.top + 0.01;
            p.vy *= -0.35;
            p.vx *= 0.7;
            p.vz *= 0.7;
          } else {
            // reflect on the nearest side
            const px = p.x;
            if (px <= hitBox.minX || px >= hitBox.maxX) p.vx *= -0.4;
            else p.vz *= -0.4;
            nx = p.x;
            nz = p.z;
          }
        }
        if (ny < 0.1) {
          ny = 0.1;
          p.vy *= -0.4;
          p.vx *= 0.65;
          p.vz *= 0.65;
        }
        p.x = nx;
        p.y = ny;
        p.z = nz;
        p.mesh.position.set(p.x, p.y, p.z);
        if (p.fuse <= 0) {
          boom = true;
          this.explode(p.x, p.y + 0.2, p.z, 6.5, 330, true, 60);
        }
      } else {
        // acid
        p.vy -= 6 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.mesh.position.set(p.x, p.y, p.z);
        this.fx.gas(p.x, p.y, p.z, 0);
        this.fx.solid.emit(p.x, p.y, p.z, 0, 0, 0, 0.4, 0.3, 0.05, 0.4, 0.9, 0.1, 0.8, 0, 0);
        if (this.phase === "playing" && Math.hypot(p.x - this.px, p.z - this.pz) < 0.8 && p.y > this.py && p.y < this.py + 1.9) {
          this.hurtPlayer(14, p.x - p.vx, p.z - p.vz);
          boom = true;
        }
        if (p.y < 0.05 || pointInBoxes(p.x, p.y, p.z, this.world.boxes) || p.life <= 0) boom = true;
        if (boom) this.fx.gas(p.x, Math.max(0.1, p.y), p.z, 8);
      }
      if (boom) {
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }

  dropAt(x: number, z: number, kind: DropKind, force = false) {
    if (this.net) return;
    const info = DROP_INFO[kind];
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), new THREE.MeshStandardMaterial({ color: info.color, emissive: info.color, emissiveIntensity: 0.9, roughness: 0.3 }));
    g.add(m);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), new THREE.MeshBasicMaterial({ color: info.color, transparent: true, opacity: 0.18, depthWrite: false }));
    g.add(halo);
    g.position.set(x, 0.9, z);
    this.scene.add(g);
    this.drops.push({ mesh: g, kind, x, z, t: force ? 45 : 30 });
  }

  updateDrops(dt: number) {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.t -= dt;
      d.mesh.rotation.y += dt * 2;
      d.mesh.position.y = 0.9 + Math.sin(this.time * 3 + i) * 0.12;
      d.mesh.visible = d.t > 6 || Math.floor(d.t * 5) % 2 === 0;
      this.fx.add.emit(d.x + rnd(-0.2, 0.2), 0.6, d.z + rnd(-0.2, 0.2), 0, 1, 0, 0.7, 0.15, 0.02, ((DROP_INFO[d.kind].color >> 16) & 255) / 255, ((DROP_INFO[d.kind].color >> 8) & 255) / 255, (DROP_INFO[d.kind].color & 255) / 255, 0.8, 0, 0);
      let pick = false;
      if (this.phase === "playing" && Math.hypot(d.x - this.px, d.z - this.pz) < 1.5 && this.py < 2) pick = true;
      if (pick) {
        this.applyDrop(d.kind);
        this.scene.remove(d.mesh);
        this.drops.splice(i, 1);
      } else if (d.t <= 0) {
        this.scene.remove(d.mesh);
        this.drops.splice(i, 1);
      }
    }
  }

  applyDrop(kind: DropKind) {
    this.audio.powerup();
    this.cb.banner(DROP_INFO[kind].name, undefined);
    if (kind === "ammo") {
      for (const id in this.inv) {
        const w = W[id];
        if (w.kind !== "melee") this.inv[id].reserve = w.reserve;
      }
      this.grenades = MAX_GRENADES;
    } else if (kind === "medkit") {
      this.hp = Math.min(this.maxHp, this.hp + 60);
    } else if (kind === "nuke") {
      this.cb.flash("#ffffff");
      this.audio.play("explosion", { vol: 1 });
      for (const z of this.zombies) {
        if (z.dead) continue;
        this.fx.explosion(z.x, 1, z.z, 2.5);
        if (z.type === "boss") this.damageZombie(z, z.maxHp * 0.25, false, z.x, 1, z.z, 0, 0, true);
        else this.damageZombie(z, 99999, false, z.x, 1, z.z, 0, 0, true);
      }
      this.addPoints(400);
    } else if (kind === "instakill") this.instakill = 25;
    else if (kind === "double") this.doublePoints = 25;
  }

  // ================= interaction =================
  updateInteract() {
    let best = null as (typeof this.world.interactables)[number] | null;
    let bd = 2.8;
    for (const it of this.world.interactables) {
      const d = Math.hypot(it.x - this.px, it.z - this.pz);
      if (d < bd) {
        bd = d;
        best = it;
      }
    }
    this.nearby = best;
    if (input.use) {
      input.use = false;
      if (this.veh.near && (!best || Math.hypot(this.veh.near.x - this.px, this.veh.near.z - this.pz) - this.veh.near.def.radius < bd + 0.5)) this.veh.tryEnter();
      else if (best) this.buy(best);
    }
  }

  ammoCost(id: string) {
    return Math.max(150, Math.round(W[id].price / 2));
  }

  promptFor(): { text: string; afford: boolean } | null {
    const key = input.touch ? "USE" : "E";
    if (this.veh.cur) return this.veh.cur.kind === "heli" && !this.veh.hud()?.canExit ? null : { text: `[${key}] Exit vehicle`, afford: true };
    const vp = this.veh.prompt(key);
    if (vp && (!this.nearby || this.veh.near)) return vp;
    const it = this.nearby;
    if (!it) return null;
    if (it.kind === "weapon") {
      const w = W[it.ref];
      if (this.inv[w.id]) {
        const full = this.inv[w.id].reserve >= w.reserve && this.inv[w.id].mag >= w.mag;
        const c = this.ammoCost(w.id);
        return full ? { text: `${w.name} — ammo full`, afford: false } : { text: `[${key}] Refill ${w.name} ammo — $${c}`, afford: this.points >= c };
      }
      return { text: `[${key}] Buy ${w.name} — $${w.price}`, afford: this.points >= w.price };
    }
    if (it.kind === "perk") {
      const p = PERKS.find((x) => x.id === it.ref)!;
      if (this.perks.has(p.id)) return { text: `${p.name} — owned`, afford: false };
      return { text: `[${key}] ${p.name}: ${p.desc} — $${p.price}`, afford: this.points >= p.price };
    }
    if (it.kind === "ammo") return { text: `[${key}] Refill all ammo + grenades — $${it.price}`, afford: this.points >= it.price };
    if (it.kind === "medkit") return { text: this.hp >= this.maxHp ? "Health full" : `[${key}] Medkit — $${it.price}`, afford: this.hp < this.maxHp && this.points >= it.price };
    return { text: this.armor >= 100 ? "Armor full" : `[${key}] Body armor — $${it.price}`, afford: this.armor < 100 && this.points >= it.price };
  }

  buy(it: (typeof this.world.interactables)[number]) {
    const deny = (msg: string) => {
      this.audio.deny();
      this.cb.toast(msg);
    };
    const ok = (msg: string) => {
      this.audio.buy();
      this.cb.toast(msg);
    };
    if (it.kind === "weapon") {
      const w = W[it.ref];
      if (this.inv[w.id]) {
        const a = this.inv[w.id];
        if (a.reserve >= w.reserve && a.mag >= w.mag) return deny("Ammo already full");
        const c = this.ammoCost(w.id);
        if (this.points < c) return deny("Not enough points");
        this.points -= c;
        a.reserve = w.reserve;
        a.mag = w.mag;
        ok(`${w.name} ammo refilled`);
      } else {
        if (this.points < w.price) return deny("Not enough points");
        this.points -= w.price;
        this.inv[w.id] = { mag: w.mag, reserve: w.reserve };
        this.switchTo(w.id);
        ok(`Bought ${w.name}`);
      }
    } else if (it.kind === "perk") {
      const p = PERKS.find((x) => x.id === it.ref)!;
      if (this.perks.has(p.id)) return deny("Already owned");
      if (this.points < p.price) return deny("Not enough points");
      this.points -= p.price;
      this.perks.add(p.id);
      if (p.id === "heart") {
        this.maxHp = 150;
        this.hp = 150;
      }
      ok(`${p.name} acquired`);
    } else if (it.kind === "ammo") {
      if (this.points < it.price) return deny("Not enough points");
      this.points -= it.price;
      for (const id in this.inv) {
        const w = W[id];
        if (w.kind !== "melee") this.inv[id].reserve = w.reserve;
      }
      this.grenades = MAX_GRENADES;
      ok("Ammo and grenades restocked");
    } else if (it.kind === "medkit") {
      if (this.hp >= this.maxHp) return deny("Health already full");
      if (this.points < it.price) return deny("Not enough points");
      this.points -= it.price;
      this.hp = this.maxHp;
      ok("Fully healed");
    } else {
      if (this.armor >= 100) return deny("Armor already full");
      if (this.points < it.price) return deny("Not enough points");
      this.points -= it.price;
      this.armor = 100;
      ok("Armor equipped");
    }
  }

  // ================= zombies / waves =================
  updateWaves(dt: number) {
    const alive = this.zombies.filter((z) => !z.dead).length;
    if (!this.waveActive) {
      this.intermission -= dt;
      if (this.intermission <= 0) this.startWave(this.wave + 1);
    } else {
      this.spawnT -= dt;
      const cap = this.mobile ? 14 + Math.min(8, this.wave) : 20 + Math.min(14, this.wave * 2);
      if (this.toSpawn > 0 && this.spawnT <= 0 && alive < cap) {
        this.spawnZombie(this.pickType());
        this.toSpawn--;
        this.spawnT = Math.max(0.35, 1.5 - this.wave * 0.06);
      }
      if (this.toSpawn <= 0 && alive === 0) this.endWave();
    }
  }

  startWave(n: number) {
    this.wave = n;
    this.waveActive = true;
    this.stats.wave = n;
    const base = Math.round(6 + n * 3.2 + n * n * 0.18);
    this.toSpawn = Math.round((n % 5 === 0 ? Math.round(base * 0.6) : base) * (1 + 0.7 * ((this.net?.count() ?? 1) - 1)));
    this.spawnT = 1;
    this.audio.waveStart();
    const boss = n % 5 === 0;
    this.cb.banner(`WAVE ${n}`, boss ? "THE ABOMINATION APPROACHES" : "SURVIVE");
    if (boss) {
      this.spawnZombie("boss");
    }
  }

  endWave() {
    this.waveActive = false;
    this.intermission = 14;
    const bonus = this.wave * 100;
    this.addPoints(bonus);
    this.audio.waveEnd();
    this.hp = Math.min(this.maxHp, this.hp + 30);
    this.cb.banner("WAVE CLEARED", `+${bonus} bonus — next wave in ${this.intermission}s`);
    if (this.wave % 3 === 0 && this.grenades < MAX_GRENADES) this.grenades++;
    if (this.net?.isHost) {
      this.net.broadcast({ t: "bonus", n: bonus });
      for (const r of this.net.remotes.values()) if (r.dead) this.net.sendTo(r.id, { t: "revive" });
      if (this.phase === "dead") this.revive();
    }
  }

  pickType(): ZType {
    const types = (Object.keys(ZDEFS) as ZType[]).filter((t) => t !== "boss" && ZDEFS[t].minWave <= this.wave);
    let total = 0;
    for (const t of types) total += ZDEFS[t].weight;
    let r = Math.random() * total;
    for (const t of types) {
      r -= ZDEFS[t].weight;
      if (r <= 0) return t;
    }
    return "walker";
  }

  spawnZombie(type: ZType) {
    const def = ZDEFS[type];
    // choose a spawn gate away from the player
    const anchors: { x: number; z: number }[] = this.phase === "playing" || !this.net ? [{ x: this.px, z: this.pz }] : [];
    if (this.net) for (const r of this.net.remotes.values()) if (!r.dead && r.ready) anchors.push({ x: r.human.root.position.x, z: r.human.root.position.z });
    const an = anchors.length ? anchors[Math.floor(Math.random() * anchors.length)] : { x: this.px, z: this.pz };
    const pts = this.world.spawns.filter((s) => Math.hypot(s.x - an.x, s.z - an.z) > 32);
    const pool = pts.length ? pts : this.world.spawns;
    const sp = pool[Math.floor(Math.random() * pool.length)];
    let x = sp.x + rnd(-2, 2);
    let zz = sp.z + rnd(-1.5, 1.5);
    this.tmp.x = x;
    this.tmp.z = zz;
    resolveCircle(this.tmp, def.radius, 0, this.world.boxes);
    x = this.tmp.x;
    zz = this.tmp.z;
    const rig = buildRig(type, Math.floor(Math.random() * 3), true);
    rig.root.position.set(x, 0, zz);
    this.scene.add(rig.root);
    const w = this.wave;
    const hpMul = type === "boss" ? 1 + 0.4 * (w / 5 - 1) : 1 + 0.11 * (w - 1);
    const spMul = Math.min(1.35, 1 + 0.025 * (w - 1)) * rnd(0.9, 1.12);
    const hp = def.hp * hpMul * (1 + 0.35 * ((this.net?.count() ?? 1) - 1));
    const z: Zombie = {
      id: this.nextZid++, type, def, rig, x, z: zz, y: 0, vx: 0, vz: 0, yaw: 0, hp, maxHp: hp,
      speed: def.speed * spMul, dmg: def.dmg * (1 + 0.03 * (w - 1)), dead: false, deadT: 0, attackT: 0, cooldown: rnd(0, 0.6),
      phase: Math.random() * 6.28, groanT: rnd(1, 6), burn: 0, burnTick: 0, stagger: 0, side: Math.random() < 0.5 ? -1 : 1,
      stuckT: 0, avoid: 0, special: rnd(2, 5), charging: 0, hitFlash: 0, fallDir: 1,
    };
    if (type === "boss") {
      this.bossRef = z;
      this.audio.play("roar", { vol: 1, rate: 0.6 });
    }
    this.zombies.push(z);
  }

  /** pick a vocalisation by zombie type */
  zSound(z: Zombie, attack: boolean) {
    const r = Math.random();
    if (z.type === "runner") return attack || r < 0.5 ? "shriek" : "groan2";
    if (z.type === "brute" || z.type === "boss") return r < 0.6 ? "growl" : "groan1";
    if (z.type === "spitter") return r < 0.5 ? "growl" : "groan2";
    return r < 0.5 ? "groan1" : "groan2";
  }

  updateZombies(dt: number) {
    if (this.net && !this.net.isHost) return; // guests mirror the host (Net.update)
    const mp = this.net;
    const anyAlive = this.phase === "playing" || !!mp?.hasLiving();
    let groaned = 0;
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      if (z.dead) {
        animateRig(z, this.time, dt, 0);
        if (z.deadT > 6) z.rig.root.position.y -= dt * 0.5;
        if (z.deadT > 9) {
          this.scene.remove(z.rig.root);
          this.zombies.splice(i, 1);
        }
        continue;
      }
      const sc = z.def.scale;
      // burning
      if (z.burn > 0) {
        z.burn -= dt;
        z.burnTick -= dt;
        this.fx.fire(z.x + rnd(-0.2, 0.2), z.y + rnd(0.3, 1.6) * sc, z.z + rnd(-0.2, 0.2), 0, 1.5, 0, 0.4, 0.5);
        if (z.burnTick <= 0) {
          z.burnTick = 0.3;
          this.damageZombie(z, 8 + this.wave * 0.5, false, z.x, z.y + 1, z.z, 0, 0, true);
          if (z.dead) continue;
        }
      }
      const tg = mp ? mp.targetFor(z.x, z.z) : this.phase === "playing" ? { x: this.px, z: this.pz, y: this.py, rid: null as string | null } : null;
      const alive = anyAlive && !!tg;
      const tx = tg ? tg.x : this.px;
      const tz = tg ? tg.z : this.pz;
      const ty = tg ? tg.y : this.py;
      const rid = tg ? tg.rid : null;
      const hurtT = (d: number) => (rid ? mp!.hurtRemote(rid, d, z.x, z.z) : this.hurtPlayer(d, z.x, z.z));
      const dx = tx - z.x;
      const dz = tz - z.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      let ndx = dx / dist;
      let ndz = dz / dist;
      z.stagger = Math.max(0, z.stagger - dt);
      z.cooldown = Math.max(0, z.cooldown - dt);
      z.special -= dt;
      let speed = z.speed;
      if (z.stagger > 0) speed *= 0.15;
      if (z.burn > 0 && z.type !== "boss") speed *= 1.1;

      // special behaviours
      if (z.type === "spitter" && alive) {
        const canSee = dist < 22 && rayWorld(this.world.boxes, z.x, 1.4, z.z, ndx, 0, ndz, dist) >= dist - 0.1;
        if (canSee && dist > 7) {
          speed = 0.4;
          if (z.attackT <= 0 && z.cooldown <= 0 && z.special <= 0) {
            z.attackT = 0.7;
            z.special = rnd(2.5, 4);
            this.audio.spit();
          }
        }
        if (z.attackT > 0 && z.attackT - dt <= 0) {
          this.spit(z, dist);
        }
      }
      if (z.type === "boss" && alive) {
        if (z.charging > 0) {
          z.charging -= dt;
          speed = 13;
          if (dist < 3 && z.cooldown <= 0) z.charging = 0;
        } else if (z.special <= 0 && dist > 8 && dist < 35) {
          z.charging = 1.3;
          z.special = rnd(5, 8);
          this.audio.play("roar", { x: z.x, z: z.z, vol: 1, rate: 0.7, maxDist: 100 });
          z.vx = ndx * 3;
          z.vz = ndz * 3;
        } else if (z.special <= 0 && dist < 5) {
          // ground slam
          z.special = rnd(6, 9);
          this.shake = Math.max(this.shake, 0.08);
          this.fx.explosion(z.x + ndx * 2, 0.5, z.z + ndz * 2, 2.5);
          this.audio.play("explosion", { x: z.x, z: z.z, vol: 0.9, rate: 0.7 });
          if (dist < 6) hurtT(32);
          if (mp) for (const r of mp.remotes.values()) if (!r.dead && r.ready && r.human.root.position.distanceTo(new THREE.Vector3(z.x, r.human.root.position.y, z.z)) < 6 && r.id !== rid) mp.hurtRemote(r.id, 32, z.x, z.z);
        }
        if (z.hp < z.maxHp * 0.5) speed *= 1.35;
      }

      // avoidance when stuck against obstacles
      if (z.avoid > 0) {
        z.avoid -= dt;
        const a = z.side * 1.15;
        const c = Math.cos(a);
        const s = Math.sin(a);
        const rx = ndx * c - ndz * s;
        const rz = ndx * s + ndz * c;
        ndx = rx;
        ndz = rz;
      }

      // attack
      const reach = z.def.reach + PR * 0.5;
      const vertOk = ty < z.y + 1.1 * sc + 0.9;
      if (z.type !== "spitter" || dist < 3) {
        if (alive && z.attackT <= 0 && z.cooldown <= 0 && dist < reach && vertOk && z.charging <= 0) {
          z.attackT = 0.55;
          this.audio.play(this.zSound(z, true), { x: z.x, z: z.z, vol: 0.5, rate: rnd(0.8, 1.3) / Math.sqrt(sc) });
        }
      }
      if (z.attackT > 0) {
        speed *= 0.1;
        z.attackT -= dt;
        if (z.attackT <= 0) {
          if (z.type !== "spitter" || dist < 3) {
            const d2 = Math.hypot(tx - z.x, tz - z.z);
            if (alive && d2 < reach * 1.3 && vertOk) {
              hurtT(z.dmg);
              this.fx.blood(tx, ty + 1.2, tz, 0, 0, 3);
            }
          }
          z.cooldown = z.type === "boss" ? 1.3 : rnd(0.8, 1.2);
        }
      }
      if (!alive) speed = 0;

      // velocity & movement
      const k = Math.min(1, dt * (z.charging > 0 ? 3 : 8));
      z.vx += (ndx * speed - z.vx) * k;
      z.vz += (ndz * speed - z.vz) * k;
      const ox = z.x;
      const oz = z.z;
      this.tmp.x = z.x + z.vx * dt;
      this.tmp.z = z.z + z.vz * dt;
      resolveCircle(this.tmp, z.def.radius, 0, this.world.boxes, 0);
      // separation
      for (let j = i - 1; j >= 0; j--) {
        const o = this.zombies[j];
        if (o.dead) continue;
        const sx = this.tmp.x - o.x;
        const sz = this.tmp.z - o.z;
        const md = z.def.radius + o.def.radius;
        const d2 = sx * sx + sz * sz;
        if (d2 < md * md && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = (md - d) * 0.5;
          this.tmp.x += (sx / d) * push;
          this.tmp.z += (sz / d) * push;
          o.x -= (sx / d) * push * 0.6;
          o.z -= (sz / d) * push * 0.6;
        }
      }
      // keep out of player
      if (alive) {
        const px = this.tmp.x - tx;
        const pz = this.tmp.z - tz;
        const md = z.def.radius + PR * 0.8;
        const d2 = px * px + pz * pz;
        if (d2 < md * md && ty < 1.2 * sc && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          this.tmp.x += (px / d) * (md - d);
          this.tmp.z += (pz / d) * (md - d);
        }
      }
      if (this.tmp.hit && speed > 0.5) {
        const moved = Math.hypot(this.tmp.x - ox, this.tmp.z - oz);
        if (moved < speed * dt * 0.35) {
          z.stuckT += dt;
          if (z.stuckT > 0.35) {
            z.avoid = rnd(0.8, 1.5);
            z.stuckT = 0;
            if (Math.random() < 0.3) z.side *= -1;
          }
        } else z.stuckT = Math.max(0, z.stuckT - dt);
      } else z.stuckT = Math.max(0, z.stuckT - dt);
      z.x = this.tmp.x;
      z.z = this.tmp.z;
      const lim = 68.6;
      z.x = clamp(z.x, -lim, lim);
      z.z = clamp(z.z, -lim, lim);
      const mv = Math.hypot(z.x - ox, z.z - oz) / Math.max(dt, 1e-4);
      if (mv > 0.3) {
        const targetYaw = Math.atan2(z.vx, z.vz);
        const toP = Math.atan2(dx, dz);
        const want = dist < 6 || z.avoid <= 0 ? toP : targetYaw;
        let da = want - z.yaw;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        z.yaw += da * Math.min(1, dt * 9);
      } else {
        let da = Math.atan2(dx, dz) - z.yaw;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        z.yaw += da * Math.min(1, dt * 6);
      }
      z.rig.root.position.set(z.x, z.y, z.z);
      z.rig.root.rotation.y = z.yaw;
      animateRig(z, this.time, dt, clamp(mv / (z.speed + 0.01), 0, 1.3));

      // idle groans
      z.groanT -= dt;
      if (z.groanT <= 0 && alive) {
        z.groanT = rnd(4, 10);
        if (groaned < 2 && dist < 45) {
          groaned++;
          this.audio.play(this.zSound(z, false), { x: z.x, z: z.z, vol: 0.55, rate: rnd(0.7, 1.15) / Math.sqrt(sc), maxDist: 50 });
        }
      }
    }
  }

  spit(z: Zombie, dist: number) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), new THREE.MeshBasicMaterial({ color: 0x8aff30 }));
    this.scene.add(mesh);
    const t = dist / 15;
    const sx = z.x;
    const sy = 1.5;
    const sz = z.z;
    const tx = this.px + this.vx * t * 0.6;
    const tz = this.pz + this.vz * t * 0.6;
    const vx = (tx - sx) / t;
    const vz = (tz - sz) / t;
    const ty = this.py + 1.2;
    const vy = (ty - sy) / t + 3 * t;
    this.projectiles.push({ type: "acid", mesh, x: sx, y: sy, z: sz, vx, vy, vz, fuse: 0, life: 4 });
  }

  // ================= HUD =================
  pushHud() {
    const d = this.def;
    const a = this.inv[this.curId] ?? { mag: 0, reserve: 0 };
    const rem = this.toSpawn + this.zombies.filter((z) => !z.dead).length;
    let waveText = "";
    if (this.phase !== "menu") {
      if (!this.waveActive) waveText = this.wave === 0 ? `First wave in ${Math.ceil(this.intermission)}` : `Next wave in ${Math.max(0, Math.ceil(this.intermission))}`;
      else waveText = `${rem} left`;
    }
    const boss = this.bossRef && !this.bossRef.dead ? this.bossRef : null;
    const spreadPx = (this.spreadNow(d) * this.canvas.clientHeight) / (2 * Math.tan((this.fovCur * Math.PI) / 360));
    const s: HudState = {
      phase: this.phase,
      hp: Math.ceil(this.hp),
      maxHp: this.maxHp,
      armor: Math.ceil(this.armor),
      points: this.points,
      wave: this.wave,
      waveText,
      remaining: rem,
      kills: this.stats.kills,
      headshots: this.stats.headshots,
      weapon: { id: d.id, name: d.name, mag: a.mag, reserve: a.reserve, reloading: this.reloading, melee: d.kind === "melee", icon: d.icon },
      slots: this.slots().map((id) => ({ id, name: W[id].name, icon: W[id].icon, mag: this.inv[id].mag, reserve: this.inv[id].reserve, melee: W[id].kind === "melee", cur: id === this.curId })),
      grenades: this.grenades,
      prompt: this.phase === "playing" ? this.promptFor() : null,
      perks: this.perkList(),
      instakill: this.instakill,
      doublePoints: this.doublePoints,
      bossHp: this.net && !this.net.isHost ? this.net.bossHp : boss ? boss.hp / boss.maxHp : 0,
      bossName: boss ? boss.def.name : this.net && !this.net.isHost && this.net.bossHp > 0 ? "The Abomination" : "",
      spread: clamp(spreadPx, 0, 120),
      scoped: this.curId === "sniper" && this.adsT > 0.85,
      flashlight: this.flashOn,
      lowHp: this.hp < this.maxHp * 0.3,
      fps: Math.round(this.fps),
      camMode: this.camMode,
      vehicle: this.veh.hud(),
      room: this.net ? this.net.roomHud() : null,
    };
    this.cb.hud(s);
  }

  /** helper for tests */
  debugSkipToWave(n: number) {
    this.wave = n - 1;
    this.intermission = 0;
    this.waveActive = false;
  }
  get eye() {
    return EYE;
  }
  get weaponList() {
    return WEAPONS;
  }
}
