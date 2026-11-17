import * as THREE from "three";
import { W } from "./config";
import type { Game } from "./game";
import { input } from "./input";
import { rayWorld, resolveCircle, groundAt } from "./physics";
import { fwd, makeVehicle, VDEFS, type Vehicle, type VKind } from "./vehicles";
import type { Zombie } from "./zombie";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const HELI_OFF = 1.15;
const WHEEL_R: Record<VKind, number> = { muscle: 0.38, jeep: 0.4, tank: 0.5, heli: 0.4 };
const HALF: Record<VKind, [number, number]> = { muscle: [2.4, 1.05], jeep: [2.2, 1.15], tank: [3.3, 1.95], heli: [2.2, 1.0] };
const MG_DEF = { ...W.rifle, dmg: 34, pellets: 1, pierce: 1, range: 130, headMult: 1.6, spread: 0 };
const COAX_DEF = { ...W.rifle, dmg: 26, pellets: 1, pierce: 1, range: 110, headMult: 1.4, spread: 0 };
const CHIN_DEF = { ...W.rifle, dmg: 30, pellets: 1, pierce: 2, range: 150, headMult: 1.3, spread: 0 };

export interface VehicleHud {
  kind: VKind;
  name: string;
  hp: number;
  maxHp: number;
  speed: number;
  alt: number;
  weapon: string;
  reload: number; // 0..1 cooldown of the primary
  ammo: string;
  weapon2: string;
  canExit: boolean;
}

interface Extra {
  gunBaseZ: number;
  recoil: number;
  trackV: number;
  steerVis: number;
  throttle: number;
  rocketRegen: number;
  rocketSide: number;
  hitCd: Map<Zombie, number>;
  wrecked: boolean;
  fireT: number;
  mgSpin: number;
  burnT: number;
}

export class VehicleSys {
  list: Vehicle[] = [];
  cur: Vehicle | null = null;
  /** vehicles currently driven by a remote co-op player (kinematic, driven by Net) */
  remote = new Set<Vehicle>();
  near: Vehicle | null = null;
  private ex = new Map<Vehicle, Extra>();
  private tmpV = new THREE.Vector3();
  private tmpD = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();
  private o = { x: 0, z: 0, hit: false };

  constructor(private g: Game) {}

  init() {
    for (const p of this.g.world.pads) {
      const v = makeVehicle(p.kind, p.x, p.z, p.yaw, true, p.kind === "muscle" ? 0 : 0);
      v.ammo = p.kind === "heli" ? 14 : 0;
      if (p.kind === "heli") v.group.rotation.order = "YXZ";
      this.g.scene.add(v.group);
      this.list.push(v);
      this.ex.set(v, {
        gunBaseZ: v.model.parts.gun?.position.z ?? 0,
        recoil: 0, trackV: 0, steerVis: 0, throttle: 0, rocketRegen: 0, rocketSide: 0, hitCd: new Map(), wrecked: false, fireT: 0, mgSpin: 0, burnT: 0,
      });
      this.place(v);
    }
  }

  reset() {
    this.cur = null;
    this.remote.clear();
    for (const v of this.list) {
      this.respawn(v);
      v.unlocked = v.def.price === 0;
    }
  }

  private place(v: Vehicle) {
    const g = v.group;
    g.position.set(v.x, v.y + (v.kind === "heli" ? HELI_OFF : 0), v.z);
    g.rotation.y = v.yaw;
  }

  private respawn(v: Vehicle) {
    const e = this.ex.get(v)!;
    v.hp = v.def.hp;
    v.alive = true;
    v.x = v.home.x;
    v.z = v.home.z;
    v.y = 0;
    v.yaw = v.home.yaw;
    v.vx = v.vz = v.vy = 0;
    v.driver = false;
    v.aimYaw = v.yaw;
    v.aimPitch = 0;
    v.ammo = v.kind === "heli" ? 14 : 0;
    v.rotorSpeed = 0;
    v.group.visible = true;
    v.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.userData.origCol) {
        const mat = m.material as THREE.MeshStandardMaterial;
        mat.color.copy(m.userData.origCol);
        delete m.userData.origCol;
      }
    });
    e.wrecked = false;
    e.hitCd.clear();
    this.place(v);
  }

  // ---------------- interaction ----------------
  findNear() {
    this.near = null;
    if (this.cur) return;
    let best = 1e9;
    for (const v of this.list) {
      if (!v.alive || this.remote.has(v)) continue;
      const d = Math.hypot(v.x - this.g.px, v.z - this.g.pz);
      const lim = v.def.radius + 2.6;
      if (d < lim && d < best && Math.abs(this.g.py - v.y) < 3) {
        best = d;
        this.near = v;
      }
    }
  }

  prompt(key: string): { text: string; afford: boolean } | null {
    const v = this.near;
    if (!v) return null;
    if (!v.unlocked) return { text: `[${key}] Requisition ${v.def.name} — $${v.def.price}`, afford: this.g.points >= v.def.price };
    return { text: `[${key}] Drive ${v.def.name} — ${v.def.blurb}`, afford: true };
  }

  tryEnter(): boolean {
    const v = this.near;
    const g = this.g;
    if (!v) return false;
    if (!v.unlocked) {
      if (g.points < v.def.price) {
        g.audio.deny();
        g.cb.toast("Not enough points");
        return true;
      }
      g.points -= v.def.price;
      v.unlocked = true;
      g.audio.buy();
      g.cb.toast(`${v.def.name} requisitioned`);
    }
    this.enter(v);
    return true;
  }

  enter(v: Vehicle) {
    const g = this.g;
    this.cur = v;
    v.driver = true;
    v.aimYaw = v.yaw;
    g.yaw = v.yaw;
    g.pitch = -0.15;
    g.audio.play("car_door", { vol: 0.8 });
    if (v.kind !== "tank" && v.kind !== "heli") g.audio.play("car_start", { vol: 0.7 });
    g.audio.setMusicMode("music_drive");
    g.reloading = false;
    g.audio.stopLoops();
    g.cb.banner(v.def.name.toUpperCase(), v.def.weapon);
    input.fire = input.ads = false;
  }

  exit(force = false) {
    const v = this.cur;
    const g = this.g;
    if (!v) return;
    const alt = v.y - this.groundY(v);
    if (!force && v.kind === "heli" && alt > 1.3) {
      g.cb.toast("Land before bailing out");
      g.audio.deny();
      return;
    }
    const [hl, hw] = HALF[v.kind];
    const f = fwd(v.yaw);
    const r = { x: Math.cos(v.yaw), z: -Math.sin(v.yaw) };
    const tries: [number, number][] = [[-1, 0], [1, 0], [-1, -0.8], [1, -0.8], [0, 1], [0, -1]];
    let placed = false;
    for (const [sx, sf] of tries) {
      const dist = hw + 1.4 + (v.kind === "heli" ? 2 : 0);
      const tx = v.x + r.x * sx * dist + f.x * sf * hl * 0.5 * (sx === 0 ? 1.8 : 1);
      const tz = v.z + r.z * sx * dist + f.z * sf * hl * 0.5 * (sx === 0 ? 1.8 : 1);
      this.o.x = tx;
      this.o.z = tz;
      this.o.hit = false;
      resolveCircle(this.o, 0.45, v.y, g.world.boxes);
      if (Math.hypot(this.o.x - tx, this.o.z - tz) < 0.05 && Math.abs(tx) < 67 && Math.abs(tz) < 67) {
        g.px = tx;
        g.pz = tz;
        placed = true;
        break;
      }
    }
    if (!placed) {
      g.px = v.x + r.x * (hw + 1.4);
      g.pz = v.z + r.z * (hw + 1.4);
    }
    g.py = groundAt(g.px, g.pz, 0.4, v.y + 0.5, g.world.boxes);
    g.vx = g.vz = g.vy = 0;
    g.yaw = v.yaw;
    v.driver = false;
    this.cur = null;
    g.audio.setEngine(null);
    g.audio.setMusicMode("music_dark");
    g.audio.play("car_door", { vol: 0.8 });
    input.fire = input.ads = false;
  }

  groundY(v: Vehicle) {
    if (v.kind !== "heli") return 0;
    return Math.max(0, groundAt(v.x, v.z, 1.2, v.y + 1, this.g.world.boxes, 1.0));
  }

  /** damage routed from zombies / explosions while the player is aboard (or to parked ones) */
  damage(v: Vehicle, dmg: number) {
    if (!v.alive) return;
    v.hp -= dmg;
    if (v.hp <= 0) this.destroy(v);
  }

  private destroy(v: Vehicle) {
    const g = this.g;
    v.hp = 0;
    v.alive = false;
    v.respawn = 45;
    const e = this.ex.get(v)!;
    e.wrecked = true;
    const rad = v.kind === "tank" ? 9 : 7;
    g.explode(v.x, v.y + 1.2, v.z, rad, v.kind === "tank" ? 360 : 260, false, 70);
    g.fx.explosion(v.x, v.y + 2, v.z, rad * 0.7);
    g.shake = Math.max(g.shake, 0.12);
    if (this.cur === v) {
      g.cb.banner("VEHICLE DESTROYED", "You bailed out");
      this.exit(true);
      g.px += rnd(-1, 1);
    }
    // charred wreck stays visible until respawn
    v.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !(m.material instanceof Array)) {
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat.color && !m.userData.origCol) {
          m.userData.origCol = mat.color.clone();
          mat.color.multiplyScalar(0.12);
        }
      }
    });
    if (v.kind === "heli") v.y = this.groundY(v);
    v.vx = v.vz = 0;
    v.rotorSpeed = 0;
    if (v.model.parts.rotorBlur) (v.model.parts.rotorBlur.material as THREE.Material).opacity = 0;
  }

  // ---------------- per-frame ----------------
  update(dt: number) {
    const g = this.g;
    this.findNear();
    for (const v of this.list) {
      const e = this.ex.get(v)!;
      if (!v.alive) {
        v.respawn -= dt;
        if (e.wrecked && Math.random() < dt * 14) g.fx.smoke(v.x + rnd(-1, 1), v.y + 1.4, v.z + rnd(-1, 1), 1.2, 2.4);
        if (e.wrecked && Math.random() < dt * 5) g.fx.fire(v.x + rnd(-0.8, 0.8), v.y + 1, v.z + rnd(-0.8, 0.8), 0, 1.5, 0, 0.5, 0.7);
        if (v.respawn <= 0) this.respawn(v);
        continue;
      }
      if (this.remote.has(v)) {
        v.driver = true;
        v.spin += (v.vx * Math.sin(v.yaw) + v.vz * Math.cos(v.yaw)) * dt * 2.9;
      } else if (v === this.cur) this.drive(v, e, dt);
      else this.park(v, e, dt);
      this.animate(v, e, dt);
      // damaged: smoke
      if (v.hp < v.def.hp * 0.4) {
        v.smokeT -= dt;
        if (v.smokeT <= 0) {
          v.smokeT = v.hp < v.def.hp * 0.2 ? 0.05 : 0.14;
          const sp = v.model.parts.smokeAt.clone().applyEuler(v.group.rotation).add(v.group.position);
          g.fx.smoke(sp.x, sp.y, sp.z, 0.9, 2);
          if (v.hp < v.def.hp * 0.2) g.fx.fire(sp.x, sp.y, sp.z, 0, 1.2, 0, 0.4, 0.5);
        }
        if (v.hp < v.def.hp * 0.2) {
          e.burnT += dt;
          if (e.burnT > 1) {
            e.burnT = 0;
            this.damage(v, v.def.hp * 0.035);
          }
        }
      }
    }
    const c = this.cur;
    if (c) {
      g.px = c.x;
      g.pz = c.z;
      g.py = c.y;
      g.vx = g.vz = 0;
      if (input.use) {
        input.use = false;
        this.exit();
      }
    } else this.pushPlayer();
  }

  /** parked vehicles are solid for the player */
  private pushPlayer() {
    const g = this.g;
    for (const v of this.list) {
      if (!v.alive) continue;
      const [hl, hw] = HALF[v.kind];
      // oriented box in local space
      const dx = g.px - v.x;
      const dz = g.pz - v.z;
      const f = fwd(v.yaw);
      const lf = dx * f.x + dz * f.z;
      const lr = dx * Math.cos(v.yaw) + dz * -Math.sin(v.yaw);
      if (v.kind === "heli" && g.py > v.y + 1.2) continue;
      if (g.py > v.y + 2.2 && v.kind !== "heli") continue;
      const ax = hw + 0.4;
      const az = hl * (v.kind === "heli" ? 0.9 : 1) + 0.4;
      if (Math.abs(lr) < ax && Math.abs(lf) < az) {
        const pushR = ax - Math.abs(lr);
        const pushF = az - Math.abs(lf);
        if (pushR < pushF) {
          const s = Math.sign(lr) || 1;
          g.px += Math.cos(v.yaw) * s * pushR;
          g.pz += -Math.sin(v.yaw) * s * pushR;
        } else {
          const s = Math.sign(lf) || 1;
          g.px += f.x * s * pushF;
          g.pz += f.z * s * pushF;
        }
      }
    }
  }

  private park(v: Vehicle, e: Extra, dt: number) {
    // coast to a stop, heli settles, rotors spin down
    const k = Math.exp(-dt * 2.5);
    v.vx *= k;
    v.vz *= k;
    if (v.kind === "heli") {
      v.rotorSpeed = Math.max(0, v.rotorSpeed - dt * 0.35);
      const gy = this.groundY(v);
      v.vy -= 9 * dt;
      v.y = Math.max(gy, v.y + v.vy * dt);
      if (v.y <= gy) v.vy = 0;
      v.x += v.vx * dt;
      v.z += v.vz * dt;
    } else if (Math.hypot(v.vx, v.vz) > 0.1) {
      this.moveBody(v, dt, 0);
    }
    e.throttle = 0;
    v.driver = false;
  }

  private moveBody(v: Vehicle, dt: number, crashScale: number) {
    const g = this.g;
    const [hl] = HALF[v.kind];
    const f = fwd(v.yaw);
    let nx = v.x + v.vx * dt;
    let nz = v.z + v.vz * dt;
    const r = v.def.radius;
    let cx = 0;
    let cz = 0;
    const offs = v.kind === "tank" ? [-2.3, 0, 2.3] : [-(hl - r), 0, hl - r];
    for (const off of offs) {
      this.o.x = nx + f.x * off;
      this.o.z = nz + f.z * off;
      this.o.hit = false;
      const sx = this.o.x;
      const sz = this.o.z;
      resolveCircle(this.o, r, v.y + (v.kind === "tank" ? 0.3 : 0), g.world.boxes, v.kind === "heli" ? 0.9 : 0.3);
      cx += this.o.x - sx;
      cz += this.o.z - sz;
    }
    if (cx !== 0 || cz !== 0) {
      const m = Math.hypot(cx, cz);
      const nxn = cx / m;
      const nzn = cz / m;
      const vn = v.vx * nxn + v.vz * nzn;
      if (vn < 0) {
        v.vx -= 1.3 * vn * nxn;
        v.vz -= 1.3 * vn * nzn;
        const impact = -vn;
        if (impact > 5 && crashScale > 0) {
          this.damage(v, Math.min(v.def.hp * 0.4, (impact - 5) * (impact - 5) * crashScale * (v.kind === "tank" ? 0.2 : 0.8)));
          g.audio.play("car_crash", { vol: clamp(impact / 20, 0.3, 1), x: v.x, z: v.z, maxDist: 80 });
          g.shake = Math.max(g.shake, clamp(impact * 0.006, 0, 0.09));
          g.fx.sparks(nx, v.y + 0.8, nz, nxn, 0.5, nzn, 10);
        }
      }
      nx += cx;
      nz += cz;
    }
    v.x = clamp(nx, -68.2, 68.2);
    v.z = clamp(nz, -68.2, 68.2);
  }

  private drive(v: Vehicle, e: Extra, dt: number) {
    const g = this.g;
    const d = v.def;
    const f = fwd(v.yaw);
    const rx = Math.cos(v.yaw);
    const rz = -Math.sin(v.yaw);
    const th = input.moveY;
    const st = input.moveX;
    let vf = v.vx * f.x + v.vz * f.z;
    let vl = v.vx * rx + v.vz * rz;
    e.throttle = Math.abs(th);

    if (v.kind === "heli") return this.flyHeli(v, e, dt);

    const tank = v.kind === "tank";
    const maxF = d.maxSpeed;
    const accel = tank ? 6 : v.kind === "jeep" ? 15 : 19;
    if (th > 0.05) vf += th * accel * (1 - clamp(vf / maxF, 0, 1)) * dt * (vf < 0 ? 2.2 : 1);
    else if (th < -0.05) {
      if (vf > 0.6) vf -= 30 * dt * -th;
      else vf -= -th * accel * 0.6 * (1 - clamp(-vf / (maxF * 0.35), 0, 1)) * dt;
    } else vf -= Math.sign(vf) * Math.min(Math.abs(vf), (tank ? 7 : 3.2) * dt + Math.abs(vf) * 0.35 * dt);
    const hand = input.up && !tank;
    if (hand) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 12 * dt);
    // lateral grip
    const grip = tank ? 12 : hand ? 1.4 : v.kind === "jeep" ? 5.5 : 6.5;
    const slip = vl;
    vl *= Math.exp(-grip * dt);
    // steering
    const sp = Math.abs(vf);
    let rate: number;
    if (tank) rate = st * 1.0 * (th < -0.05 && vf < 0 ? -1 : 1) * (sp < 0.5 ? 1 : 0.9);
    else rate = st * 1.75 * clamp(sp / 5, 0, 1) * (1 / (1 + sp / 32)) * (vf >= 0 ? 1 : -1) * (hand ? 1.35 : 1);
    v.yaw -= rate * dt;
    e.steerVis += (st - e.steerVis) * Math.min(1, dt * 8);
    // rebuild velocity with new heading
    const nf = fwd(v.yaw);
    const nrx = Math.cos(v.yaw);
    const nrz = -Math.sin(v.yaw);
    v.vx = nf.x * vf + nrx * vl;
    v.vz = nf.z * vf + nrz * vl;
    const before = Math.hypot(v.vx, v.vz);
    this.moveBody(v, dt, tank ? 0.6 : v.kind === "jeep" ? 0.9 : 1);
    void before;
    // ground height (rolls over small curbs: none) — flat world
    v.y = 0;
    v.spin += vf * dt / WHEEL_R[v.kind];
    e.trackV = vf;
    // engine / skid audio
    const sv = clamp(Math.abs(vf) / maxF, 0, 1);
    g.audio.setEngine(v.kind, tank ? sv * 0.8 + Math.abs(rate) * 0.3 : clamp(sv + e.throttle * 0.25, 0, 1));
    const skidding = !tank && (Math.abs(slip) > 4.5 || (hand && sp > 8));
    g.audio.setSkid(skidding, clamp(Math.abs(slip) / 12, 0.2, 0.6));
    if (skidding && Math.random() < dt * 30) {
      for (const sx of [-0.9, 0.9]) g.fx.smoke(v.x + rx * sx - f.x * 1.4, 0.2, v.z + rz * sx - f.z * 1.4, 0.6, 1.0);
    }
    // run over zombies
    this.ram(v, e, Math.abs(vf), f, dt);
    // weapons
    if (tank) this.tankWeapons(v, e, dt);
    else if (v.kind === "jeep") this.jeepWeapons(v, e, dt);
    else if (input.fire && e.fireT <= 0) {
      e.fireT = 0.6;
      g.audio.play("car_horn", { vol: 0.7, x: v.x, z: v.z });
    }
    e.fireT -= dt;
    g.audio.setListener(v.x, v.z, g.yaw);
  }

  private ram(v: Vehicle, e: Extra, speed: number, f: { x: number; z: number }, dt: number) {
    const g = this.g;
    const [hl, hw] = HALF[v.kind];
    const tank = v.kind === "tank";
    const min = tank ? 1.2 : 4;
    for (const [z, t] of e.hitCd) {
      const nt = t - dt;
      if (nt <= 0) e.hitCd.delete(z);
      else e.hitCd.set(z, nt);
    }
    if (speed < min) return;
    for (const z of g.zombies) {
      if (z.dead || e.hitCd.has(z)) continue;
      const dx = z.x - v.x;
      const dz = z.z - v.z;
      const lf = dx * f.x + dz * f.z;
      const lr = dx * Math.cos(v.yaw) + dz * -Math.sin(v.yaw);
      if (Math.abs(lf) > hl + z.def.radius || Math.abs(lr) > hw + z.def.radius) continue;
      e.hitCd.set(z, 0.5);
      const dmg = (tank ? 300 : speed * (v.kind === "jeep" ? 11 : 14)) * (z.type === "boss" ? 0.35 : 1);
      const sgn = (v.vx * f.x + v.vz * f.z) >= 0 ? 1 : -1;
      z.vx += f.x * sgn * speed * 0.9 + Math.cos(v.yaw) * Math.sign(lr) * 3;
      z.vz += f.z * sgn * speed * 0.9 - Math.sin(v.yaw) * Math.sign(lr) * 3;
      z.stagger = 1.2;
      g.damageZombie(z, dmg, false, z.x, z.y + 1, z.z, f.x, f.z);
      g.audio.play("flesh", { x: z.x, z: z.z, vol: 0.9, rate: 0.7 });
      if (!tank) {
        const heavy = z.type === "brute" || z.type === "boss";
        const slow = heavy ? 0.78 : 0.96;
        v.vx *= slow;
        v.vz *= slow;
        this.damage(v, heavy ? 22 : 1.5);
      }
    }
  }

  /** world-space muzzle position + barrel direction */
  private muzzle(o: THREE.Object3D, pos: THREE.Vector3, dir: THREE.Vector3) {
    o.updateWorldMatrix(true, false);
    o.getWorldPosition(pos);
    o.getWorldQuaternion(this.tmpQ);
    dir.set(0, 0, -1).applyQuaternion(this.tmpQ);
  }

  /** point under the crosshair (camera ray) */
  private crosshairTarget(out: THREE.Vector3) {
    const g = this.g;
    const cam = g.camera;
    cam.getWorldDirection(this.tmpD);
    const t = Math.min(160, rayWorld(g.world.boxes, cam.position.x, cam.position.y, cam.position.z, this.tmpD.x, this.tmpD.y, this.tmpD.z, 160));
    out.copy(cam.position).addScaledVector(this.tmpD, t);
    if (out.y < 0) {
      const k = cam.position.y / (cam.position.y - out.y);
      out.copy(cam.position).addScaledVector(this.tmpD, t * k);
    }
    return out;
  }

  private aimTurret(v: Vehicle, dt: number, turnSpeed: number, pitchMin: number, pitchMax: number) {
    const g = this.g;
    let dy = g.yaw - v.aimYaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    v.aimYaw += clamp(dy, -turnSpeed * dt, turnSpeed * dt);
    const dp = clamp(g.pitch, pitchMin, pitchMax) - v.aimPitch;
    v.aimPitch += clamp(dp, -turnSpeed * 0.6 * dt, turnSpeed * 0.6 * dt);
    const p = v.model.parts;
    if (p.turret) p.turret.rotation.y = v.aimYaw - v.yaw;
    if (p.gun) p.gun.rotation.x = v.aimPitch;
  }

  private tankWeapons(v: Vehicle, e: Extra, dt: number) {
    const g = this.g;
    this.aimTurret(v, dt, 1.5, -0.12, 0.5);
    v.fireCd -= dt;
    v.altCd -= dt;
    const p = v.model.parts;
    if (p.gun) p.gun.position.z = e.gunBaseZ + e.recoil;
    e.recoil = Math.max(0, e.recoil - dt * 1.2);
    if (input.fire && v.fireCd <= 0 && p.muzzle) {
      v.fireCd = 2.2;
      const mp = this.tmpV;
      const md = this.tmpD;
      this.muzzle(p.muzzle, mp, md);
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 8), new THREE.MeshStandardMaterial({ color: 0xb08a30, metalness: 0.8, roughness: 0.3 }));
      mesh.rotation.x = Math.PI / 2;
      const holder = new THREE.Group();
      holder.add(mesh);
      g.scene.add(holder);
      const sp = 80;
      g.projectiles.push({ type: "rocket", mesh: holder, x: mp.x, y: mp.y, z: mp.z, vx: md.x * sp, vy: md.y * sp, vz: md.z * sp, fuse: 0, life: 4, dmg: 380, splash: 8, grav: 0.5, light: true, owner: "tank" });
      g.audio.play("tank_cannon", { vol: 1, wet: 0.5, x: v.x, z: v.z, maxDist: 150 });
      g.fx.explosion(mp.x + md.x * 2, mp.y + md.y * 2, mp.z + md.z * 2, 1.4);
      for (let i = 0; i < 10; i++) g.fx.smoke(mp.x + md.x * 1.5, mp.y + md.y * 1.5, mp.z + md.z * 1.5, 1.2, 1.8);
      e.recoil = 0.55;
      g.shake = Math.max(g.shake, 0.09);
      v.vx -= md.x * 1.6;
      v.vz -= md.z * 1.6;
    }
    // coax MG
    if (input.ads && v.altCd <= 0 && p.muzzle2) {
      v.altCd = 60 / 650;
      const mp = this.tmpV;
      const md = this.tmpD;
      this.muzzle(p.muzzle2, mp, md);
      this.hitscan(mp, md, COAX_DEF, 0.012);
      g.audio.gun("rifle", { vol: 0.5, rate: 0.85, wet: 0.2, x: v.x, z: v.z });
    }
  }

  private jeepWeapons(v: Vehicle, _e: Extra, dt: number) {
    const g = this.g;
    this.aimTurret(v, dt, 7, -0.25, 0.9);
    v.fireCd -= dt;
    const p = v.model.parts;
    if (input.fire && v.fireCd <= 0 && p.muzzle) {
      v.fireCd = 60 / 640;
      const mp = this.tmpV;
      const md = this.tmpD;
      this.muzzle(p.muzzle, mp, md);
      this.hitscan(mp, md, MG_DEF, 0.014);
      g.audio.gun("rifle", { vol: 0.6, rate: 0.78, wet: 0.25, x: v.x, z: v.z });
      g.shake = Math.max(g.shake, 0.012);
      if (p.gun) p.gun.position.z = 0.05;
    } else if (p.gun) p.gun.position.z *= 0.8;
  }

  /** hitscan shot from a muzzle toward the crosshair target */
  private hitscan(mp: THREE.Vector3, md: THREE.Vector3, def: typeof MG_DEF, spread: number, converge = true) {
    const g = this.g;
    const tgt = new THREE.Vector3();
    const dir = new THREE.Vector3().copy(md);
    if (converge) {
      this.crosshairTarget(tgt);
      dir.copy(tgt).sub(mp).normalize();
      if (dir.dot(md) < 0.9) dir.copy(md);
    }
    dir.x += rnd(-spread, spread);
    dir.y += rnd(-spread, spread);
    dir.z += rnd(-spread, spread);
    dir.normalize();
    g.lastHitZ = null;
    const r = g.castRay(mp.x, mp.y, mp.z, dir.x, dir.y, dir.z, def, g.instakill > 0 ? 9999 : 1);
    g.fx.tracer(mp.x, mp.y, mp.z, mp.x + dir.x * r.t, mp.y + dir.y * r.t, mp.z + dir.z * r.t);
    g.fx.sparks(mp.x + dir.x * 0.3, mp.y + dir.y * 0.3, mp.z + dir.z * 0.3, dir.x, 0.2, dir.z, 2);
  }

  private flyHeli(v: Vehicle, e: Extra, dt: number) {
    const g = this.g;
    const d = v.def;
    v.rotorSpeed = Math.min(1, v.rotorSpeed + dt * 0.33);
    const ready = v.rotorSpeed > 0.75;
    const lift = clamp((v.rotorSpeed - 0.6) / 0.4, 0, 1);
    // heading follows camera yaw
    let dy = g.yaw - v.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const turn = clamp(dy, -1.9 * dt, 1.9 * dt) * (ready ? 1 : 0.2);
    v.yaw += turn;
    e.steerVis += (clamp(turn / (dt * 1.9 + 1e-6), -1, 1) - e.steerVis) * Math.min(1, dt * 5);
    const f = fwd(v.yaw);
    const rx = Math.cos(v.yaw);
    const rz = -Math.sin(v.yaw);
    const tx = (f.x * input.moveY + rx * input.moveX * 0.75) * d.maxSpeed * (ready ? 1 : 0);
    const tz = (f.z * input.moveY + rz * input.moveX * 0.75) * d.maxSpeed * (ready ? 1 : 0);
    const k = Math.min(1, 1.5 * dt);
    v.vx += (tx - v.vx) * k;
    v.vz += (tz - v.vz) * k;
    const gy = this.groundY(v);
    const wantVy = (input.up ? 7 : 0) - (input.down ? 6 : 0);
    if (lift > 0.5) v.vy += ((wantVy - v.vy) * Math.min(1, 2.2 * dt));
    else v.vy -= 9 * dt;
    v.y += v.vy * dt;
    if (v.y > 48) {
      v.y = 48;
      v.vy = Math.min(0, v.vy);
    }
    if (v.y <= gy) {
      if (v.vy < -9) {
        this.damage(v, (-v.vy - 8) * 40);
        g.audio.play("car_crash", { vol: 0.9, x: v.x, z: v.z });
      }
      v.y = gy;
      v.vy = 0;
      v.vx *= Math.exp(-dt * 3);
      v.vz *= Math.exp(-dt * 3);
    }
    this.moveBody(v, dt, 1.2);
    // tilt
    const tgtTilt = -input.moveY * 0.2 * (ready ? 1 : 0);
    const tgtBank = -input.moveX * 0.26 - e.steerVis * 0.12;
    v.tilt += (tgtTilt - v.tilt) * Math.min(1, dt * 3);
    v.bank += (tgtBank - v.bank) * Math.min(1, dt * 3);
    g.audio.setEngine("heli", clamp(v.rotorSpeed * 0.7 + Math.abs(wantVy) * 0.04 + e.throttle * 0.2, 0, 1));
    g.audio.setListener(v.x, v.z, g.yaw);
    // weapons
    v.fireCd -= dt;
    v.altCd -= dt;
    e.rocketRegen += dt;
    if (e.rocketRegen > 3 && v.ammo < 14) {
      v.ammo++;
      e.rocketRegen = 0;
    }
    const p = v.model.parts;
    const isAir = v.y - gy > 0.5;
    if (input.fire && v.fireCd <= 0 && p.muzzle && ready) {
      v.fireCd = 60 / 900;
      const mp = this.tmpV;
      const md = this.tmpD;
      this.muzzle(p.muzzle, mp, md);
      this.hitscan(mp, md, CHIN_DEF, 0.01);
      g.audio.gun("rifle", { vol: 0.55, rate: 0.9, wet: 0.15, x: v.x, z: v.z });
      e.mgSpin = 1;
    }
    e.mgSpin = Math.max(0, e.mgSpin - dt * 3);
    if (p.minigun) p.minigun.rotation.z += e.mgSpin * dt * 40;
    if (input.ads && v.altCd <= 0 && v.ammo > 0 && ready) {
      v.altCd = 0.45;
      v.ammo--;
      e.rocketSide ^= 1;
      const m = e.rocketSide ? p.muzzle2 : (p as unknown as { muzzleR: THREE.Object3D }).muzzleR;
      if (m) {
        const mp = new THREE.Vector3();
        const md = new THREE.Vector3();
        this.muzzle(m, mp, md);
        const tgt = this.crosshairTarget(new THREE.Vector3());
        const dir = tgt.sub(mp).normalize();
        if (dir.dot(md) < 0.85) dir.copy(md);
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 10), new THREE.MeshStandardMaterial({ color: 0x556644, metalness: 0.5, roughness: 0.5 }));
        body.rotation.x = Math.PI / 2;
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 10), new THREE.MeshStandardMaterial({ color: 0xaa2222 }));
        tip.rotation.x = -Math.PI / 2;
        tip.position.z = -0.38;
        const mesh = new THREE.Group();
        mesh.add(body, tip);
        g.scene.add(mesh);
        const sp = 62;
        g.projectiles.push({ type: "rocket", mesh, x: mp.x, y: mp.y, z: mp.z, vx: dir.x * sp + v.vx * 0.5, vy: dir.y * sp, vz: dir.z * sp + v.vz * 0.5, fuse: 0, life: 4, dmg: 210, splash: 6, grav: 0, light: true, owner: "heli" });
        g.audio.play("heli_missile", { vol: 0.9, x: v.x, z: v.z, maxDist: 150 });
        for (let i = 0; i < 6; i++) g.fx.smoke(mp.x, mp.y, mp.z, 0.7, 1.3);
      }
    }
    // rotor wash
    if (isAir && v.y - gy < 7 && Math.random() < dt * 40) {
      const a = Math.random() * 6.28;
      g.fx.smoke(v.x + Math.cos(a) * rnd(1, 5), gy + 0.2, v.z + Math.sin(a) * rnd(1, 5), 0.8, 0.8);
    }
    // crush zombies underneath only when very low (skids)
  }

  private animate(v: Vehicle, e: Extra, dt: number) {
    const p = v.model.parts;
    const g = v.group;
    if (v.kind === "heli") {
      g.rotation.set(v.tilt, v.yaw, v.bank, "YXZ");
      g.position.set(v.x, v.y + HELI_OFF, v.z);
      const spin = v.rotorSpeed;
      if (p.rotor) p.rotor.rotation.y -= spin * dt * 34;
      if (p.tailRotor) p.tailRotor.rotation.z += spin * dt * 45;
      if (p.rotorBlur) (p.rotorBlur.material as THREE.MeshBasicMaterial).opacity = clamp((spin - 0.35) * 0.35, 0, 0.22);
            for (const b of p.blink) b.visible = Math.sin(performance.now() * 0.008) > 0;
      return;
    }
    g.position.set(v.x, 0, v.z);
    g.rotation.set(0, v.yaw, 0);
    for (const w of p.wheels) {
      w.spin.rotation.x = -v.spin;
      if (w.steerPivot && w.front && v.kind !== "tank") w.steerPivot.rotation.y = -e.steerVis * 0.45;
    }
    if (v.kind === "tank") {
      for (let i = 0; i < p.tracks.length; i++) {
        const turnBias = (i === 0 ? 1 : -1) * input.moveX * (v.driver ? 1 : 0) * 0.6;
        p.tracks[i].offset.y += (e.trackV * 0.5 + turnBias) * dt * 0.12 * -1;
      }
      for (const w of p.wheels) w.spin.rotation.x = -v.spin;
    }
    // body roll / pitch from accel for a bit of life
    if (p.body && v.driver && v.kind !== "tank") {
      const lat = -e.steerVis * clamp(Math.abs(v.vx * Math.cos(v.yaw) + v.vz * -Math.sin(v.yaw)) + Math.hypot(v.vx, v.vz) * 0.02, 0, 1) * 0.03;
      p.body.rotation.z += (lat - p.body.rotation.z) * Math.min(1, dt * 6);
    }
  }

  hud(): VehicleHud | null {
    const v = this.cur;
    if (!v) return null;
    const gy = this.groundY(v);
    const sp = Math.hypot(v.vx, v.vz);
    let reload = 0;
    let ammo = "";
    let weapon2 = "";
    if (v.kind === "tank") {
      reload = clamp(v.fireCd / 2.2, 0, 1);
      ammo = "120mm";
      weapon2 = "Coax MG [RMB]";
    } else if (v.kind === "jeep") {
      ammo = "M2 .50";
    } else if (v.kind === "heli") {
      reload = clamp(v.altCd / 0.45, 0, 1);
      ammo = `ROCKETS ${v.ammo}/14`;
      weapon2 = "Chin gun [LMB] · Rockets [RMB]";
    } else ammo = "HORN [LMB]";
    return {
      kind: v.kind,
      name: v.def.name,
      hp: Math.max(0, v.hp),
      maxHp: v.def.hp,
      speed: Math.round(sp * 3.6),
      alt: Math.max(0, Math.round(v.y - gy)),
      weapon: v.def.weapon,
      reload,
      ammo,
      weapon2,
      canExit: v.kind !== "heli" || v.y - gy < 1.3,
    };
  }

  // radar helper
  blips() {
    return this.list.filter((v) => v.alive).map((v) => ({ x: v.x, z: v.z, kind: v.kind, cur: v === this.cur }));
  }
}

export { VDEFS };
