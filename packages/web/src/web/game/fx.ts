import * as THREE from "three";
import { tex } from "./assets";
import { ParticleSystem } from "./particles";

const r = (a: number, b: number) => a + Math.random() * (b - a);

export class Fx {
  solid: ParticleSystem;
  add: ParticleSystem;
  decals: THREE.Mesh[] = [];
  decalIdx = 0;
  tracers: { mesh: THREE.Mesh; life: number }[] = [];
  tracerIdx = 0;
  beams: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number; max: number; w: number }[] = [];
  beamIdx = 0;
  boomLight: THREE.PointLight;
  boomT = 0;
  group = new THREE.Group();

  constructor(scene: THREE.Scene, mobile: boolean) {
    this.solid = new ParticleSystem(mobile ? 500 : 900, false);
    this.add = new ParticleSystem(mobile ? 700 : 1400, true);
    this.group.add(this.solid.points, this.add.points);
    const dm = new THREE.MeshBasicMaterial({ map: tex("splat", 1, 1), transparent: true, depthWrite: false, color: 0x5a0a0a, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const dg = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(dg, dm);
      m.rotation.x = -Math.PI / 2;
      m.position.y = -10;
      this.group.add(m);
      this.decals.push(m);
    }
    const tm = new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    const tg = new THREE.BoxGeometry(0.025, 0.025, 1);
    for (let i = 0; i < 30; i++) {
      const m = new THREE.Mesh(tg, tm);
      m.visible = false;
      this.group.add(m);
      this.tracers.push({ mesh: m, life: 0 });
    }
    const bg = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 24; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x80e0ff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      const m = new THREE.Mesh(bg, mat);
      m.visible = false;
      m.frustumCulled = false;
      this.group.add(m);
      this.beams.push({ mesh: m, mat, life: 0, max: 0.1, w: 0.05 });
    }
    this.boomLight = new THREE.PointLight(0xff9040, 0, 30, 1.5);
    this.group.add(this.boomLight);
    scene.add(this.group);
  }

  blood(x: number, y: number, z: number, dx: number, dz: number, n: number, power = 1) {
    for (let i = 0; i < n; i++) {
      const c = r(0.35, 0.65);
      this.solid.emit(x, y, z, dx * r(1, 4) * power + r(-1.5, 1.5), r(0.5, 3.5), dz * r(1, 4) * power + r(-1.5, 1.5), r(0.5, 1.1), r(0.05, 0.11), 0.03, c, 0.02, 0.02, 0.95, 12, 0.5);
    }
  }
  splat(x: number, z: number, size = 1.2) {
    const m = this.decals[this.decalIdx];
    this.decalIdx = (this.decalIdx + 1) % this.decals.length;
    m.position.set(x + r(-0.3, 0.3), 0.045, z + r(-0.3, 0.3));
    m.rotation.z = r(0, 6.28);
    const s = size * r(0.7, 1.3);
    m.scale.set(s, s, 1);
  }
  sparks(x: number, y: number, z: number, nx: number, ny: number, nz: number, n = 6) {
    for (let i = 0; i < n; i++) this.add.emit(x, y, z, nx * r(1, 4) + r(-2, 2), ny * r(1, 4) + r(0, 2), nz * r(1, 4) + r(-2, 2), r(0.15, 0.4), 0.05, 0.01, 1, r(0.6, 0.9), 0.3, 1, 9, 0);
    for (let i = 0; i < Math.ceil(n / 2); i++) this.solid.emit(x, y, z, nx * r(0.3, 1.5) + r(-0.5, 0.5), ny * 1 + r(0, 1), nz * r(0.3, 1.5) + r(-0.5, 0.5), r(0.4, 0.8), 0.12, 0.35, 0.45, 0.42, 0.4, 0.5, -0.5, 1);
  }
  fire(x: number, y: number, z: number, vx: number, vy: number, vz: number, life = 0.5, size = 0.5) {
    this.add.emit(x, y, z, vx + r(-0.6, 0.6), vy + r(-0.4, 0.8), vz + r(-0.6, 0.6), life * r(0.7, 1.2), size * 0.3, size * 1.5, 1, r(0.4, 0.7), 0.1, 0.7, -2, 1.5);
  }
  smoke(x: number, y: number, z: number, size = 0.5, life = 1.5) {
    this.solid.emit(x + r(-0.2, 0.2), y, z + r(-0.2, 0.2), r(-0.3, 0.3), r(0.6, 1.4), r(-0.3, 0.3), life, size * 0.5, size * 2, 0.25, 0.24, 0.23, 0.5, -0.1, 0.5);
  }
  gas(x: number, y: number, z: number, n: number) {
    for (let i = 0; i < n; i++) this.solid.emit(x, y, z, r(-2.5, 2.5), r(0.5, 3), r(-2.5, 2.5), r(0.8, 1.6), 0.6, 1.8, 0.45, 0.62, 0.15, 0.5, -0.2, 2);
  }
  explosion(x: number, y: number, z: number, radius: number) {
    const n = Math.round(radius * 14);
    for (let i = 0; i < n; i++) {
      const a = r(0, 6.28);
      const e = r(-0.2, 1);
      const sp = r(2, radius * 2.2);
      this.add.emit(x, y, z, Math.cos(a) * sp * (1 - Math.abs(e) * 0.4), e * sp, Math.sin(a) * sp * (1 - Math.abs(e) * 0.4), r(0.35, 0.9), radius * 0.2, radius * 0.5, 1, r(0.45, 0.8), 0.15, 0.9, 0, 3);
    }
    for (let i = 0; i < n * 0.6; i++) {
      const a = r(0, 6.28);
      const sp = r(1, radius * 1.2);
      this.solid.emit(x, y, z, Math.cos(a) * sp, r(1, 6), Math.sin(a) * sp, r(1, 2.2), radius * 0.3, radius * 1.1, 0.2, 0.18, 0.17, 0.7, -0.5, 1.2);
    }
    for (let i = 0; i < 20; i++) this.add.emit(x, y, z, r(-9, 9), r(2, 12), r(-9, 9), r(0.5, 1.1), 0.12, 0.02, 1, 0.7, 0.2, 1, 12, 0);
    this.boomLight.position.set(x, y + 1, z);
    this.boomLight.intensity = 120;
    this.boomT = 0.5;
  }
  tracer(ox: number, oy: number, oz: number, tx: number, ty: number, tz: number) {
    const t = this.tracers[this.tracerIdx];
    this.tracerIdx = (this.tracerIdx + 1) % this.tracers.length;
    const dx = tx - ox;
    const dy = ty - oy;
    const dz = tz - oz;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1) return;
    t.mesh.position.set(ox + dx / 2, oy + dy / 2, oz + dz / 2);
    t.mesh.lookAt(tx, ty, tz);
    t.mesh.scale.set(1, 1, len);
    t.mesh.visible = true;
    t.life = 0.06;
  }
  /** glowing beam segment (lightning, rail, bolt trail) */
  beam(ox: number, oy: number, oz: number, tx: number, ty: number, tz: number, color: number, w = 0.05, life = 0.12) {
    const b = this.beams[this.beamIdx];
    this.beamIdx = (this.beamIdx + 1) % this.beams.length;
    const dx = tx - ox;
    const dy = ty - oy;
    const dz = tz - oz;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.05) return;
    b.mesh.position.set(ox + dx / 2, oy + dy / 2, oz + dz / 2);
    b.mesh.lookAt(tx, ty, tz);
    b.mesh.scale.set(w, w, len);
    b.mat.color.setHex(color);
    b.mesh.visible = true;
    b.life = life;
    b.max = life;
    b.w = w;
  }
  /** jagged lightning between two points */
  lightning(ox: number, oy: number, oz: number, tx: number, ty: number, tz: number, color = 0x7fdcff, w = 0.035) {
    const n = Math.max(2, Math.min(6, Math.round(Math.hypot(tx - ox, ty - oy, tz - oz) / 1.6)));
    let px = ox;
    let py = oy;
    let pz = oz;
    for (let i = 1; i <= n; i++) {
      const k = i / n;
      const j = i === n ? 0 : 0.35;
      const nx = ox + (tx - ox) * k + r(-j, j);
      const ny = oy + (ty - oy) * k + r(-j, j);
      const nz = oz + (tz - oz) * k + r(-j, j);
      this.beam(px, py, pz, nx, ny, nz, color, w, 0.09);
      px = nx;
      py = ny;
      pz = nz;
    }
  }
  update(dt: number, scale: number) {
    for (const b of this.beams) {
      if (b.life > 0) {
        b.life -= dt;
        const k = Math.max(0, b.life / b.max);
        b.mat.opacity = k;
        b.mesh.scale.x = b.mesh.scale.y = b.w * (0.4 + k * 0.6);
        if (b.life <= 0) b.mesh.visible = false;
      }
    }
    this.solid.update(dt, scale);
    this.add.update(dt, scale);
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        if (t.life <= 0) t.mesh.visible = false;
      }
    }
    if (this.boomT > 0) {
      this.boomT -= dt;
      this.boomLight.intensity = Math.max(0, (this.boomT / 0.5) * 120);
    }
  }
  clear() {
    for (const p of [this.solid, this.add]) {
      p.life.fill(0);
    }
    for (const d of this.decals) d.position.y = -10;
    for (const t of this.tracers) t.mesh.visible = false;
    for (const b of this.beams) b.mesh.visible = false;
  }
}
