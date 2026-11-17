import * as THREE from "three";
import { canvasTex, softDot } from "./assets";

const VS = /* glsl */ `
attribute float aSize;
attribute vec4 aColor;
varying vec4 vColor;
uniform float uScale;
void main(){
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
}`;
const FS = /* glsl */ `
uniform sampler2D uMap;
varying vec4 vColor;
void main(){
  vec4 t = texture2D(uMap, gl_PointCoord);
  gl_FragColor = vec4(vColor.rgb, vColor.a * t.a);
  if (gl_FragColor.a < 0.01) discard;
}`;

export class ParticleSystem {
  points: THREE.Points;
  n: number;
  pos: Float32Array;
  col: Float32Array;
  size: Float32Array;
  vel: Float32Array;
  life: Float32Array;
  maxLife: Float32Array;
  grav: Float32Array;
  drag: Float32Array;
  size0: Float32Array;
  size1: Float32Array;
  rgb: Float32Array;
  alpha: Float32Array;
  cursor = 0;
  mat: THREE.ShaderMaterial;
  geo: THREE.BufferGeometry;

  constructor(n: number, additive: boolean) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 4);
    this.size = new Float32Array(n);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n).fill(1);
    this.grav = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.size0 = new Float32Array(n);
    this.size1 = new Float32Array(n);
    this.rgb = new Float32Array(n * 3);
    this.alpha = new Float32Array(n);
    this.pos.fill(0, 0);
    for (let i = 0; i < n; i++) this.pos[i * 3 + 1] = -1000;
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("aColor", new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: canvasTex(softDot()) }, uScale: { value: 600 } },
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, r: number, g: number, b: number, a: number, grav = 0, drag = 0) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.n;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size0[i] = s0;
    this.size1[i] = s1;
    this.rgb[i * 3] = r;
    this.rgb[i * 3 + 1] = g;
    this.rgb[i * 3 + 2] = b;
    this.alpha[i] = a;
    this.grav[i] = grav;
    this.drag[i] = drag;
  }

  update(dt: number, scale: number) {
    this.mat.uniforms.uScale.value = scale;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) {
        if (this.size[i] !== 0) {
          this.size[i] = 0;
          this.pos[i * 3 + 1] = -1000;
        }
        continue;
      }
      this.life[i] -= dt;
      const k = 1 - this.life[i] / this.maxLife[i];
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= dr;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= dr;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.03 && this.grav[i] > 0) {
        this.pos[i * 3 + 1] = 0.03;
        this.vel[i * 3 + 1] = 0;
        this.vel[i * 3] *= 0.3;
        this.vel[i * 3 + 2] *= 0.3;
      }
      this.size[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * k;
      this.col[i * 4] = this.rgb[i * 3];
      this.col[i * 4 + 1] = this.rgb[i * 3 + 1];
      this.col[i * 4 + 2] = this.rgb[i * 3 + 2];
      this.col[i * 4 + 3] = this.alpha[i] * (1 - k * k);
    }
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
  }
}
