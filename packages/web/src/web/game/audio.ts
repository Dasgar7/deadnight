/** Sound pack: real sampled sfx (public/game/snd2) + a few synthesized UI blips. */
const FILES = [
  "gun_pistol", "gun_magnum", "gun_rifle", "gun_shotgun", "gun_smg", "gun_sniper", "gun_sawedoff", "gun_crossbow", "gun_glauncher", "gun_rocket", "gun_arc", "gun_railgun",
  "chainsaw_loop", "chainsaw_idle", "flame_loop", "minigun_fire_loop",
  "car_engine_loop", "car_start", "car_horn", "car_crash", "car_skid", "car_door", "door_creak",
  "tank_engine_loop", "tank_cannon", "heli_loop", "heli_missile",
  "reload_mag", "reload_shell", "pump", "bolt",
  "groan_a", "groan_b", "growl", "shriek", "zdeath", "bossroar", "flesh", "boom", "night_loop", "steps",
];
const MUSIC = ["music_dark", "music_drive"];
const ALIAS: Record<string, string> = {
  explosion: "boom",
  roar: "bossroar",
  death: "zdeath",
  groan1: "groan_a",
  groan2: "groan_b",
  reload: "reload_mag",
  shot_pistol: "gun_pistol",
  shot_rifle: "gun_rifle",
  shot_shotgun: "gun_shotgun",
};

interface LoopH {
  src: AudioBufferSourceNode;
  gain: GainNode;
  pan?: StereoPannerNode;
}

export class AudioSys {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfx!: GainNode;
  music!: GainNode;
  reverb!: ConvolverNode;
  wetBus!: GainNode;
  buffers = new Map<string, AudioBuffer>();
  noise!: AudioBuffer;
  volume = 0.8;
  loading: Promise<void> | null = null;
  musicLoading = false;
  musicNodes = new Map<string, LoopH>();
  musicWant = "music_dark";
  musicOn = false;
  // listener
  lx = 0;
  lz = 0;
  lyaw = 0;
  loops = new Map<string, LoopH>();
  stepFlip = 0;

  /** Must be called from a user gesture */
  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 5;
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = 0.32;
    this.music.connect(this.master);
    // procedural impulse response for a cold, open-air tail
    const sr = ctx.sampleRate;
    const irLen = Math.floor(sr * 1.7);
    const ir = ctx.createBuffer(2, irLen, sr);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < irLen; i++) {
        const t = i / irLen;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2) * (i < sr * 0.012 ? i / (sr * 0.012) : 1);
      }
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = ir;
    this.wetBus = ctx.createGain();
    this.wetBus.gain.value = 0.5;
    this.reverb.connect(this.wetBus);
    this.wetBus.connect(this.master);
    // noise buffer
    const len = sr * 2;
    this.noise = ctx.createBuffer(1, len, sr);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.loading = this.load();
  }

  private async fetchBuf(f: string) {
    const ctx = this.ctx!;
    try {
      const r = await fetch(`/game/snd2/${f}.mp3`);
      const ab = await r.arrayBuffer();
      const buf = await new Promise<AudioBuffer>((res, rej) => ctx.decodeAudioData(ab, res, rej));
      this.buffers.set(f, buf);
    } catch {
      /* ignore */
    }
  }
  private async load() {
    await Promise.all(FILES.map((f) => this.fetchBuf(f)));
  }
  private loadMusic() {
    if (this.musicLoading) return;
    this.musicLoading = true;
    for (const m of MUSIC) void this.fetchBuf(m).then(() => this.musicOn && this.syncMusic());
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  // ---------------- music ----------------
  startMusic() {
    if (!this.ctx) return;
    this.musicOn = true;
    this.loadMusic();
    void (this.loading ?? Promise.resolve()).then(() => {
      if (this.musicOn) this.startLoop("night", "night_loop", 0.5, 1, 1.5);
    });
    this.syncMusic();
  }
  /** pick which music bed is audible: "music_dark" on foot, "music_drive" while driving */
  setMusicMode(m: "music_dark" | "music_drive") {
    if (this.musicWant === m) return;
    this.musicWant = m;
    this.syncMusic();
  }
  private syncMusic() {
    const ctx = this.ctx;
    if (!ctx || !this.musicOn) return;
    for (const m of MUSIC) {
      const b = this.buffers.get(m);
      if (!b) continue;
      let h = this.musicNodes.get(m);
      if (!h) {
        const src = ctx.createBufferSource();
        src.buffer = b;
        src.loop = true;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        src.connect(gain);
        gain.connect(this.music);
        src.start(0, Math.random() * 20);
        h = { src, gain };
        this.musicNodes.set(m, h);
      }
      h.gain.gain.setTargetAtTime(m === this.musicWant ? 1 : 0, ctx.currentTime, 1.2);
    }
  }
  stopMusic() {
    this.musicOn = false;
    for (const h of this.musicNodes.values()) {
      try {
        h.src.stop();
      } catch {
        /* noop */
      }
    }
    this.musicNodes.clear();
    this.stopLoop("night");
  }
  duckMusic(v: number) {
    if (this.ctx) this.music.gain.setTargetAtTime(v * 0.9, this.ctx.currentTime, 0.3);
  }

  setListener(x: number, z: number, yaw: number) {
    this.lx = x;
    this.lz = z;
    this.lyaw = yaw;
  }

  private panFor(x: number, z: number, d: number) {
    const rx = Math.cos(this.lyaw);
    const rz = -Math.sin(this.lyaw);
    return d < 0.5 ? 0 : Math.max(-1, Math.min(1, ((x - this.lx) * rx + (z - this.lz) * rz) / d));
  }

  /** Play a sample, optionally positional. wet = reverb send (0..1). */
  play(name: string, o: { vol?: number; rate?: number; x?: number; z?: number; maxDist?: number; offset?: number; dur?: number; wet?: number } = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const b = this.buffers.get(ALIAS[name] ?? name);
    if (!b) return;
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = o.rate ?? 1;
    let vol = o.vol ?? 1;
    let node: AudioNode = src;
    let lp: BiquadFilterNode | null = null;
    if (o.x !== undefined && o.z !== undefined) {
      const dx = o.x - this.lx;
      const dz = o.z - this.lz;
      const d = Math.hypot(dx, dz);
      const md = o.maxDist ?? 55;
      if (d > md) return;
      vol *= Math.pow(1 - d / md, 1.4);
      const pan = ctx.createStereoPanner();
      pan.pan.value = this.panFor(o.x, o.z, d);
      // distance dulls the sound
      lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = Math.max(1200, 16000 * Math.pow(1 - Math.min(0.95, d / md), 1.6));
      src.connect(lp);
      lp.connect(pan);
      node = pan;
    }
    const g = ctx.createGain();
    g.gain.value = vol;
    node.connect(g);
    g.connect(this.sfx);
    if (o.wet) {
      const w = ctx.createGain();
      w.gain.value = o.wet;
      g.connect(w);
      w.connect(this.reverb);
    }
    src.start(0, o.offset ?? 0, o.dur);
  }

  /** Gun report with a little reverb tail, mild per-shot variation. */
  gun(sfx: string, o: { vol?: number; rate?: number; wet?: number; x?: number; z?: number } = {}) {
    this.play(`gun_${sfx}`, { vol: o.vol ?? 0.9, rate: (o.rate ?? 1) * (0.96 + Math.random() * 0.08), wet: o.wet ?? 0.35, x: o.x, z: o.z, maxDist: 120 });
  }

  // ---------------- loops ----------------
  startLoop(key: string, name: string, vol: number, rate = 1, fade = 0.08, at?: { x: number; z: number }) {
    const ctx = this.ctx;
    if (!ctx) return;
    const h0 = this.loops.get(key);
    if (h0) {
      h0.src.playbackRate.setTargetAtTime(rate, ctx.currentTime, 0.05);
      h0.gain.gain.setTargetAtTime(vol, ctx.currentTime, fade / 2);
      if (at && h0.pan) h0.pan.pan.value = this.panFor(at.x, at.z, Math.hypot(at.x - this.lx, at.z - this.lz));
      return;
    }
    const b = this.buffers.get(name);
    if (!b) return;
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.loop = true;
    src.playbackRate.value = rate;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(vol, ctx.currentTime, fade / 2);
    src.connect(gain);
    const h: LoopH = { src, gain };
    if (at) {
      const p = ctx.createStereoPanner();
      gain.connect(p);
      p.connect(this.sfx);
      h.pan = p;
    } else gain.connect(this.sfx);
    src.start(0, Math.random() * Math.max(0.1, b.duration * 0.5));
    this.loops.set(key, h);
  }
  stopLoop(key: string, fade = 0.12) {
    const ctx = this.ctx;
    const h = this.loops.get(key);
    if (!ctx || !h) return;
    h.gain.gain.setTargetAtTime(0, ctx.currentTime, fade / 2);
    this.loops.delete(key);
    setTimeout(() => {
      try {
        h.src.stop();
      } catch {
        /* noop */
      }
    }, fade * 1000 + 300);
  }

  // ---------------- synthesized blips ----------------
  private noiseBurst(dur: number, freq: number, q: number, vol: number, type: BiquadFilterType = "bandpass", attack = 0.002) {
    const ctx = this.ctx;
    if (!ctx) return;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.sfx);
    s.start(t, Math.random(), dur + 0.05);
  }

  private tone(freq: number, dur: number, vol: number, type: OscillatorType = "sine", slideTo?: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const o = ctx.createOscillator();
    o.type = type;
    const t = ctx.currentTime;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g);
    g.connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  swish() {
    this.noiseBurst(0.2, 1500, 0.7, 0.28, "bandpass", 0.06);
  }
  stab() {
    this.play("flesh", { vol: 0.8, rate: 0.95 + Math.random() * 0.2 });
  }
  click() {
    this.noiseBurst(0.04, 3000, 2, 0.3);
  }
  step(sprint: boolean) {
    // steps.mp3 holds two footfalls: alternate halves
    const b = this.buffers.get("steps");
    if (!b) {
      this.noiseBurst(0.1, sprint ? 260 : 200, 0.9, sprint ? 0.22 : 0.14, "lowpass", 0.01);
      return;
    }
    this.stepFlip ^= 1;
    const half = b.duration / 2;
    this.play("steps", { vol: sprint ? 0.55 : 0.32, rate: (sprint ? 1.15 : 0.95) * (0.92 + Math.random() * 0.16), offset: this.stepFlip * half + 0.02, dur: Math.min(0.5, half - 0.05) });
  }
  jumpLand() {
    this.noiseBurst(0.18, 160, 0.8, 0.3, "lowpass", 0.01);
  }
  hit(head: boolean) {
    this.tone(head ? 1400 : 700, 0.05, 0.08, "square", head ? 900 : 400);
  }
  fleshHit(x: number, z: number) {
    this.play("flesh", { x, z, vol: 0.55, rate: 0.85 + Math.random() * 0.4, maxDist: 40 });
  }
  hurt() {
    this.noiseBurst(0.25, 200, 1, 0.5, "lowpass", 0.005);
    this.tone(90, 0.3, 0.4, "sawtooth", 50);
  }
  pickup() {
    this.tone(660, 0.1, 0.18, "sine");
    setTimeout(() => this.tone(990, 0.16, 0.18, "sine"), 70);
  }
  buy() {
    this.tone(880, 0.08, 0.2, "triangle");
    setTimeout(() => this.tone(1320, 0.12, 0.2, "triangle"), 80);
    setTimeout(() => this.tone(1760, 0.2, 0.18, "triangle"), 160);
  }
  deny() {
    this.tone(150, 0.2, 0.3, "square", 100);
  }
  waveStart() {
    this.tone(110, 1.4, 0.35, "sawtooth", 82);
    this.tone(165, 1.4, 0.2, "sawtooth", 110);
    this.noiseBurst(1.2, 120, 0.7, 0.3, "lowpass", 0.3);
    this.play("growl", { vol: 0.5, rate: 0.6, wet: 0.6 });
  }
  waveEnd() {
    this.tone(392, 0.4, 0.18, "triangle");
    setTimeout(() => this.tone(523, 0.4, 0.18, "triangle"), 200);
    setTimeout(() => this.tone(659, 0.7, 0.18, "triangle"), 400);
  }
  powerup() {
    this.tone(300, 0.5, 0.25, "sawtooth", 900);
  }
  heartbeat() {
    this.tone(60, 0.18, 0.5, "sine", 40);
    setTimeout(() => this.tone(55, 0.18, 0.4, "sine", 35), 170);
  }
  whoosh() {
    this.noiseBurst(0.3, 600, 0.5, 0.2, "bandpass", 0.1);
  }
  rocketLaunch() {
    this.play("gun_rocket", { vol: 0.95, wet: 0.4 });
  }
  spit() {
    this.noiseBurst(0.2, 1200, 1.5, 0.15, "bandpass", 0.02);
  }

  setFlame(on: boolean) {
    if (on) this.startLoop("flame", "flame_loop", 0.7, 1, 0.1);
    else this.stopLoop("flame", 0.2);
  }
  /** minigun barrel spin-up 0..1 */
  setSpin(v: number) {
    if (v > 0.02) this.startLoop("spin", "minigun_fire_loop", 0.25 + v * 0.45, 0.55 + v * 0.55, 0.1);
    else this.stopLoop("spin", 0.2);
  }
  setChainsaw(mode: 0 | 1 | 2) {
    // 0 off, 1 idle, 2 cutting
    if (mode === 0) {
      this.stopLoop("saw_idle");
      this.stopLoop("saw_cut");
      return;
    }
    this.startLoop("saw_idle", "chainsaw_idle", mode === 1 ? 0.55 : 0.0, 1, 0.08);
    if (mode === 2) this.startLoop("saw_cut", "chainsaw_loop", 0.8, 1, 0.08);
    else this.stopLoop("saw_cut", 0.15);
  }

  /** vehicle engine bed; v is 0..1 speed/throttle */
  setEngine(kind: "muscle" | "jeep" | "tank" | "heli" | null, v = 0, at?: { x: number; z: number }) {
    if (!kind) {
      this.stopLoop("veh_engine", 0.3);
      this.stopLoop("veh_skid", 0.1);
      return;
    }
    const name = kind === "tank" ? "tank_engine_loop" : kind === "heli" ? "heli_loop" : "car_engine_loop";
    const rate = kind === "tank" ? 0.85 + v * 0.4 : kind === "heli" ? 0.8 + v * 0.35 : 0.65 + v * 1.1;
    const vol = kind === "heli" ? 0.55 : 0.4 + v * 0.25;
    this.startLoop("veh_engine", name, vol, rate, 0.2, at);
  }
  setSkid(on: boolean, vol = 0.5) {
    if (on) this.startLoop("veh_skid", "car_skid", vol, 1, 0.1);
    else this.stopLoop("veh_skid", 0.15);
  }

  stopLoops() {
    this.setFlame(false);
    this.setSpin(0);
    this.setChainsaw(0);
    this.stopLoop("veh_engine");
    this.stopLoop("veh_skid");
  }
}
