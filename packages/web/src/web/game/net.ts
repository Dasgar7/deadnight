import * as THREE from "three";
import { client } from "../lib/api";
import { W, ZDEFS, type ZType } from "./config";
import { Human } from "./human";
import { animateRig, buildRig, type Zombie } from "./zombie";
import type { Game } from "./game";

/**
 * Co-op networking. One browser is the HOST and runs the whole zombie simulation; guests send their own
 * state + damage events and render the host's snapshots. Transport is oRPC polling (~12 Hz) because the
 * hosting layer has no WebSocket upgrade — so expect ~100-200 ms of latency.
 */

const TYPES: ZType[] = ["walker", "runner", "brute", "spitter", "bloater", "boss"];
const COLORS = [0xd9a441, 0x4aa3df, 0x7bd05a, 0xd05a9a];
const SYNC_MS = 80;

interface MeState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  hp: number;
  gun: string;
  dead: boolean;
  sw: number;
  sh: number;
  sp: number;
  veh: { i: number; x: number; y: number; z: number; yaw: number; ay: number; ap: number; rs: number } | null;
}

export interface Remote {
  id: string;
  name: string;
  color: number;
  human: Human;
  me: Partial<MeState>;
  hp: number;
  dead: boolean;
  sw: number;
  sh: number;
  swing: number;
  speed: number;
  moveYaw: number;
  ready: boolean;
  veh: number; // vehicle index or -1
}

interface ZTarget {
  x: number;
  z: number;
  y: number;
  yaw: number;
  atk: boolean;
}

type Ev = { t: string; to?: string; by?: string; [k: string]: unknown };
interface SyncRes {
  closed: boolean;
  hostId?: string;
  over?: boolean;
  players?: { id: string; name: string; color: number; me: Partial<MeState> }[];
  events?: Ev[];
  hits?: number[][] & { by?: string }[];
  zs?: number[][];
  world?: { w: number; a: number; im: number; ts: number; bh: number } | null;
}

const angLerp = (a: number, b: number, k: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

export class Net {
  remotes = new Map<string, Remote>();
  closed = false;
  over = false;
  private busy = false;
  private stopped = false;
  private hitsOut: number[][] = [];
  private evOut: Ev[] = [];
  private zt = new Map<number, ZTarget>();
  private zmap = new Map<number, Zombie>();
  private groanT = 1;

  constructor(
    private g: Game,
    public role: "host" | "guest",
    public code: string,
    public id: string,
    public hostId: string,
    public name: string,
  ) {}

  get isHost() {
    return this.role === "host";
  }

  start() {
    const tick = async () => {
      if (this.stopped) return;
      if (!this.busy) {
        this.busy = true;
        try {
          await this.sync();
        } catch {
          /* transient — keep polling */
        }
        this.busy = false;
      }
      if (!this.stopped) setTimeout(tick, SYNC_MS);
    };
    void tick();
  }

  stop() {
    this.stopped = true;
    for (const r of this.remotes.values()) this.dropRemote(r);
    this.remotes.clear();
    this.g.allyBlips = [];
    for (const z of this.zmap.values()) {
      this.g.scene.remove(z.rig.root);
    }
    if (!this.isHost) this.g.zombies = this.g.zombies.filter((z) => !this.zmap.has(z.id));
    this.zmap.clear();
    for (const v of this.g.veh.remote) v.driver = false;
    this.g.veh.remote.clear();
    void client.rooms.leave({ code: this.code, id: this.id }).catch(() => undefined);
  }

  // ───────────── queries used by the sim ─────────────
  hasLiving() {
    for (const r of this.remotes.values()) if (!r.dead && r.ready) return true;
    return false;
  }
  count() {
    return 1 + this.remotes.size;
  }
  /** nearest living target for a zombie (host + remote players) */
  targetFor(zx: number, zz: number): { x: number; z: number; y: number; rid: string | null } | null {
    const g = this.g;
    let best: { x: number; z: number; y: number; rid: string | null } | null = null;
    let bd = 1e9;
    if (g.phase === "playing") {
      bd = Math.hypot(g.px - zx, g.pz - zz);
      best = { x: g.px, z: g.pz, y: g.py, rid: null };
    }
    for (const r of this.remotes.values()) {
      if (r.dead || !r.ready) continue;
      const x = r.human.root.position.x;
      const z = r.human.root.position.z;
      const d = Math.hypot(x - zx, z - zz);
      if (d < bd) {
        bd = d;
        best = { x, z, y: r.human.root.position.y, rid: r.id };
      }
    }
    return best;
  }
  allDown() {
    return this.g.phase === "dead" && !this.hasLiving();
  }

  // ───────────── host-side outgoing ─────────────
  hurtRemote(id: string, dmg: number, fx: number, fz: number) {
    this.evOut.push({ t: "hurt", to: id, d: Math.round(dmg), x: Math.round(fx * 10) / 10, z: Math.round(fz * 10) / 10 });
  }
  credit(by: string, pts: number, head: boolean, kill: boolean) {
    this.evOut.push({ t: "pts", to: by, n: pts, head: head ? 1 : 0, kill: kill ? 1 : 0 });
  }
  sendTo(id: string, ev: Ev) {
    this.evOut.push({ ...ev, to: id });
  }
  broadcast(ev: Ev) {
    this.evOut.push(ev);
  }
  /** guest → host damage report */
  queueHit(id: number, dmg: number, head: boolean, px: number, py: number, pz: number) {
    if (this.hitsOut.length > 100) return;
    this.hitsOut.push([id, Math.round(dmg), head ? 1 : 0, Math.round(px * 10) / 10, Math.round(py * 10) / 10, Math.round(pz * 10) / 10]);
  }

  // ───────────── sync ─────────────
  private meState(): MeState {
    const g = this.g;
    const c = g.veh.cur;
    return {
      x: g.px,
      y: g.py,
      z: g.pz,
      yaw: g.yaw,
      pitch: g.pitch,
      hp: Math.ceil(g.hp),
      gun: g.curId,
      dead: g.phase === "dead",
      sw: g.swingCount,
      sh: g.shotCount,
      sp: g.speedNow,
      veh: c ? { i: g.veh.list.indexOf(c), x: c.x, y: c.y, z: c.z, yaw: c.yaw, ay: c.aimYaw, ap: c.aimPitch, rs: c.rotorSpeed } : null,
    };
  }

  private async sync() {
    const g = this.g;
    const body: Record<string, unknown> = { code: this.code, id: this.id, me: this.meState() };
    if (this.isHost) {
      const rows: number[][] = [];
      for (const z of g.zombies) {
        if (z.dead && z.deadT > 7) continue;
        rows.push([
          z.id,
          TYPES.indexOf(z.type),
          Math.round(z.x * 100) / 100,
          Math.round(z.z * 100) / 100,
          Math.round(z.y * 100) / 100,
          Math.round(z.yaw * 100) / 100,
          Math.round((z.hp / z.maxHp) * 1000) / 1000,
          (z.dead ? 1 : 0) | (z.attackT > 0 ? 2 : 0) | (z.burn > 0 ? 4 : 0) | (z.charging > 0 ? 8 : 0),
        ]);
        if (rows.length >= 190) break;
      }
      body.zs = rows;
      const boss = g.bossRef && !g.bossRef.dead ? g.bossRef : null;
      body.world = { w: g.wave, a: g.waveActive ? 1 : 0, im: Math.round(g.intermission * 10) / 10, ts: g.toSpawn, bh: boss ? boss.hp / boss.maxHp : 0 };
      if (this.allDown()) {
        body.over = true;
        if (!this.over) this.evOut.push({ t: "over" });
      }
    } else if (this.hitsOut.length) {
      body.hits = this.hitsOut;
    }
    if (this.evOut.length) body.ev = this.evOut.slice(0, 80);
    const sentHits = this.hitsOut;
    const sentEv = this.evOut.length;
    if (!this.isHost) this.hitsOut = [];
    const res = (await client.rooms.sync(body as never)) as unknown as SyncRes;
    this.evOut.splice(0, sentEv);
    void sentHits;
    this.onResult(res);
  }

  private onResult(res: SyncRes) {
    const g = this.g;
    if (this.stopped) return;
    if (res.closed) {
      if (!this.closed) {
        this.closed = true;
        g.netClosed(this.isHost ? "Connection lost" : "The host left the game");
      }
      return;
    }
    // players
    const seen = new Set<string>();
    for (const p of res.players ?? []) {
      seen.add(p.id);
      let r = this.remotes.get(p.id);
      if (!r) {
        const human = new Human(COLORS[p.color % COLORS.length], p.name);
        human.root.visible = false;
        g.scene.add(human.root);
        r = { id: p.id, name: p.name, color: p.color, human, me: {}, hp: 100, dead: false, sw: 0, sh: 0, swing: -1, speed: 0, moveYaw: 0, ready: false, veh: -1 };
        this.remotes.set(p.id, r);
        g.cb.toast(`${p.name} joined`);
      }
      const m = p.me;
      if (typeof m.x === "number") {
        if (!r.ready) {
          r.ready = true;
          r.human.root.position.set(m.x, m.y ?? 0, m.z ?? 0);
          r.sw = m.sw ?? 0;
          r.sh = m.sh ?? 0;
        }
        r.me = m;
        r.hp = m.hp ?? 100;
        r.dead = !!m.dead;
        if ((m.sw ?? 0) > r.sw) r.swing = 0;
        r.sw = m.sw ?? r.sw;
        if ((m.sh ?? 0) > r.sh) this.remoteShot(r);
        r.sh = m.sh ?? r.sh;
      }
    }
    for (const [id, r] of this.remotes) {
      if (!seen.has(id)) {
        g.cb.toast(`${r.name} left`);
        this.dropRemote(r);
        this.remotes.delete(id);
      }
    }
    // host: damage from guests
    if (this.isHost) {
      for (const h of (res.hits ?? []) as unknown as (number[] & { by: string })[]) {
        const by = (h as unknown as { by: string }).by;
        const arr = h as unknown as number[];
        const z = g.zombies.find((q) => q.id === arr[0]);
        if (!z || z.dead) continue;
        g.creditTo = by;
        g.damageZombie(z, arr[1], !!arr[2], arr[3], arr[4], arr[5], 0, 0);
        g.creditTo = null;
      }
    } else {
      if (res.zs) this.applyZombies(res.zs);
      if (res.world) this.applyWorld(res.world);
    }
    for (const e of res.events ?? []) this.onEvent(e);
    if (res.over && !this.over) this.finish();
  }

  private onEvent(e: Ev) {
    const g = this.g;
    switch (e.t) {
      case "hurt":
        if (g.phase === "playing") g.hurtPlayer(e.d as number, e.x as number, e.z as number);
        break;
      case "pts":
        g.addPoints(e.n as number);
        if (e.kill) {
          g.stats.kills++;
          if (e.head) g.stats.headshots++;
          g.cb.hit("kill");
        }
        break;
      case "bonus":
        g.addPoints(e.n as number);
        break;
      case "revive":
        g.revive();
        break;
      case "over":
        this.finish();
        break;
      case "msg":
        g.cb.toast(String(e.s));
        break;
    }
  }

  private finish() {
    if (this.over) return;
    this.over = true;
    this.g.finishCoop();
  }

  private dropRemote(r: Remote) {
    this.g.scene.remove(r.human.root);
    r.human.dispose();
    if (r.veh >= 0) {
      const v = this.g.veh.list[r.veh];
      if (v) {
        this.g.veh.remote.delete(v);
        v.driver = false;
      }
    }
  }

  private remoteShot(r: Remote) {
    const g = this.g;
    const d = W[r.me.gun ?? "pistol"];
    if (!d) return;
    r.human.kick();
    const x = r.human.root.position.x;
    const z = r.human.root.position.z;
    if (d.kind === "melee") return;
    if (d.kind === "launcher") {
      g.audio.gun("glauncher", { vol: 0.9, x, z });
      return;
    }
    const sfx = d.sfx ?? (d.sound === "none" ? "pistol" : d.sound);
    g.audio.gun(sfx, { vol: 0.8, rate: d.pitch, x, z });
  }

  // ───────────── guest: zombie mirror ─────────────
  private applyWorld(w: NonNullable<SyncRes["world"]>) {
    const g = this.g;
    if (w.w !== g.wave) {
      g.wave = w.w;
      g.stats.wave = w.w;
      if (w.w > 0) {
        g.audio.waveStart();
        g.cb.banner(`WAVE ${w.w}`, w.w % 5 === 0 ? "THE ABOMINATION APPROACHES" : "SURVIVE");
      }
    } else if (g.waveActive && !w.a) {
      g.audio.waveEnd();
      g.cb.banner("WAVE CLEARED", "Fallen teammates are back on their feet");
    }
    g.waveActive = !!w.a;
    g.intermission = w.im;
    g.toSpawn = w.ts;
    this.bossHp = w.bh;
  }
  bossHp = 0;

  private applyZombies(rows: number[][]) {
    const g = this.g;
    const seen = new Set<number>();
    for (const r of rows) {
      const [id, ti, x, zz, y, yaw, hp, fl] = r;
      seen.add(id);
      let z = this.zmap.get(id);
      if (!z) {
        const type = TYPES[ti] ?? "walker";
        const def = ZDEFS[type];
        const rig = buildRig(type, id % 3, g.settings.quality !== "low");
        rig.root.position.set(x, y, zz);
        g.scene.add(rig.root);
        z = {
          id, type, def, rig, x, z: zz, y, vx: 0, vz: 0, yaw, hp, maxHp: 1, speed: def.speed, dmg: 0, dead: false, deadT: 0, attackT: 0, cooldown: 0,
          phase: (id * 2.399) % 6.28, groanT: 0, burn: 0, burnTick: 0, stagger: 0, side: 1, stuckT: 0, avoid: 0, special: 0, charging: 0, hitFlash: 0, fallDir: id % 2 ? 1 : -1,
        };
        this.zmap.set(id, z);
        g.zombies.push(z);
        this.zt.set(id, { x, z: zz, y, yaw, atk: false });
        if (type === "boss") g.audio.play("roar", { vol: 1, rate: 0.6 });
      }
      const t = this.zt.get(id)!;
      t.x = x;
      t.z = zz;
      t.y = y;
      t.yaw = yaw;
      z.hp = Math.max(hp * z.maxHp, 0.001);
      z.burn = fl & 4 ? 1 : 0;
      z.charging = fl & 8 ? 1 : 0;
      if (fl & 2) {
        if (!t.atk && z.attackT <= 0) z.attackT = z.type === "spitter" ? 0.7 : 0.55;
        t.atk = true;
      } else t.atk = false;
      if (fl & 1 && !z.dead) {
        z.dead = true;
        z.deadT = 0;
        z.x = x;
        z.z = zz;
        g.fx.splat(z.x, z.z, 1.2 * z.def.scale);
        g.fx.blood(z.x, z.y + 1.2 * z.def.scale, z.z, 0, 0, 10, 1.2);
        g.audio.play("death", { x: z.x, z: z.z, vol: 0.9, rate: 0.9 + Math.random() * 0.25 });
        if (z.type === "bloater") {
          g.fx.gas(z.x, 1, z.z, 22);
          g.fx.explosion(z.x, 1, z.z, 3);
          g.audio.play("explosion", { x: z.x, z: z.z, vol: 0.8 });
        }
      }
    }
    for (const [id, z] of this.zmap) {
      if (!seen.has(id)) {
        g.scene.remove(z.rig.root);
        const i = g.zombies.indexOf(z);
        if (i >= 0) g.zombies.splice(i, 1);
        this.zmap.delete(id);
        this.zt.delete(id);
        if (g.bossRef === z) g.bossRef = null;
      }
    }
    const boss = [...this.zmap.values()].find((z) => z.type === "boss" && !z.dead) ?? null;
    g.bossRef = boss;
    if (boss) boss.maxHp = 1;
  }

  // ───────────── per-frame ─────────────
  update(dt: number) {
    const g = this.g;
    const k = 1 - Math.exp(-dt * 13);
    // remote players
    const blips: { x: number; z: number }[] = [];
    for (const r of this.remotes.values()) {
      const m = r.me;
      const h = r.human;
      if (!r.ready || typeof m.x !== "number") continue;
      h.root.visible = true;
      const px = h.root.position.x;
      const pz = h.root.position.z;
      let tx = m.x;
      let ty = m.y ?? 0;
      let tz = m.z ?? 0;
      if (m.veh) {
        const v = g.veh.list[m.veh.i];
        if (v) {
          if (!g.veh.remote.has(v)) g.veh.remote.add(v);
          r.veh = m.veh.i;
          const vk = 1 - Math.exp(-dt * 16);
          const ox = v.x;
          const oz = v.z;
          v.x += (m.veh.x - v.x) * vk;
          v.y += (m.veh.y - v.y) * vk;
          v.z += (m.veh.z - v.z) * vk;
          v.yaw = angLerp(v.yaw, m.veh.yaw, vk);
          v.aimYaw = angLerp(v.aimYaw, m.veh.ay, vk);
          v.aimPitch += (m.veh.ap - v.aimPitch) * vk;
          v.rotorSpeed = m.veh.rs;
          v.vx = (v.x - ox) / Math.max(dt, 1e-3);
          v.vz = (v.z - oz) / Math.max(dt, 1e-3);
          v.alive = true;
          tx = v.x;
          tz = v.z;
          ty = v.y;
          h.root.visible = false;
        }
      } else if (r.veh >= 0) {
        const v = g.veh.list[r.veh];
        if (v) {
          g.veh.remote.delete(v);
          v.driver = false;
          v.vx = v.vz = 0;
        }
        r.veh = -1;
      }
      const nx = px + (tx - px) * k;
      const nz = pz + (tz - pz) * k;
      const ny = h.root.position.y + (ty - h.root.position.y) * k;
      const sp = Math.hypot(nx - px, nz - pz) / Math.max(dt, 1e-3);
      r.speed += (Math.min(7, sp) - r.speed) * Math.min(1, dt * 8);
      if (sp > 0.3) r.moveYaw = Math.atan2(-(nx - px), -(nz - pz));
      h.root.position.set(nx, ny, nz);
      h.setGun(m.gun ?? "pistol");
      const melee = (W[m.gun ?? "pistol"]?.kind ?? "") === "melee";
      let sw = -1;
      if (r.swing >= 0) {
        r.swing += dt / 0.35;
        sw = r.swing;
        if (r.swing >= 1) r.swing = -1;
      }
      const yaw = angLerp(h.root.rotation.y, m.yaw ?? 0, k);
      h.update(
        dt,
        { speed: r.speed, moveYaw: r.moveYaw, pitch: m.pitch ?? 0, aiming: false, melee, swing: sw, dead: r.dead, onGround: Math.abs(ty - ny) < 0.3, sprint: r.speed > 5 },
        yaw,
        0,
      );
      if (!r.dead) blips.push({ x: nx, z: nz });
    }
    g.allyBlips = blips;

    if (!this.isHost) {
      const kz = 1 - Math.exp(-dt * 11);
      for (const z of this.zmap.values()) {
        const t = this.zt.get(z.id);
        if (!t || z.dead) {
          if (z.dead) {
            z.rig.root.position.x = z.x;
            z.rig.root.position.z = z.z;
            animateRig(z, g.time, dt, 0);
          }
          continue;
        }
        const ox = z.x;
        const oz = z.z;
        z.x += (t.x - z.x) * kz;
        z.z += (t.z - z.z) * kz;
        z.y += (t.y - z.y) * kz;
        z.yaw = angLerp(z.yaw, t.yaw, kz);
        const mv = Math.hypot(z.x - ox, z.z - oz) / Math.max(dt, 1e-3);
        if (z.attackT > 0) z.attackT -= dt;
        z.rig.root.position.set(z.x, z.y, z.z);
        z.rig.root.rotation.y = z.yaw;
        animateRig(z, g.time, dt, Math.max(0, Math.min(1.3, mv / (z.speed + 0.01))));
        if (z.burn > 0 && Math.random() < dt * 8) g.fx.fire(z.x, z.y + 1 * z.def.scale, z.z, 0, 1.5, 0, 0.4, 0.5);
      }
      this.groanT -= dt;
      if (this.groanT <= 0 && this.zmap.size) {
        this.groanT = 1.2 + Math.random() * 2;
        const list = [...this.zmap.values()].filter((z) => !z.dead);
        const z = list[Math.floor(Math.random() * list.length)];
        if (z && Math.hypot(z.x - g.px, z.z - g.pz) < 45) {
          g.audio.play(Math.random() < 0.5 ? "groan1" : "groan2", { x: z.x, z: z.z, vol: 0.55, rate: (0.7 + Math.random() * 0.45) / Math.sqrt(z.def.scale), maxDist: 50 });
        }
      }
    }
  }

  roomHud() {
    const g = this.g;
    return {
      code: this.code,
      players: [
        { id: this.id, name: this.name, hp: Math.ceil(g.hp), you: true },
        ...[...this.remotes.values()].map((r) => ({ id: r.id, name: r.name, hp: r.dead ? 0 : r.hp, you: false })),
      ],
    };
  }
}

export const _t = THREE; // keep three tree-shake neutral for the human rigs
