import type { Box } from "./world";

/** Ray vs AABB (box spans y 0..top). Returns t or Infinity */
export function rayBox(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: Box): number {
  let tmin = 0;
  let tmax = Infinity;
  const slab = (o: number, d: number, lo: number, hi: number) => {
    if (Math.abs(d) < 1e-8) return o >= lo && o <= hi;
    let t1 = (lo - o) / d;
    let t2 = (hi - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    return tmin <= tmax;
  };
  if (!slab(ox, dx, b.minX, b.maxX)) return Infinity;
  if (!slab(oy, dy, b.y0 ?? 0, b.top)) return Infinity;
  if (!slab(oz, dz, b.minZ, b.maxZ)) return Infinity;
  return tmin;
}

export function rayWorld(boxes: Box[], ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): number {
  let best = max;
  for (const b of boxes) {
    const t = rayBox(ox, oy, oz, dx, dy, dz, b);
    if (t < best) best = t;
  }
  if (dy < -1e-6) {
    const t = -oy / dy;
    if (t > 0 && t < best) best = t;
  }
  return best;
}

/** vertical cylinder (x,z,r, y0..y1) */
export function rayCylinder(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, cx: number, cz: number, r: number, y0: number, y1: number): number {
  const fx = ox - cx;
  const fz = oz - cz;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return Infinity;
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return Infinity;
  const s = Math.sqrt(disc);
  let t = (-b - s) / (2 * a);
  if (t < 0) t = (-b + s) / (2 * a);
  if (t < 0) return Infinity;
  const y = oy + dy * t;
  if (y < y0 || y > y1) return Infinity;
  return t;
}

export function raySphere(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, cx: number, cy: number, cz: number, r: number): number {
  const lx = cx - ox;
  const ly = cy - oy;
  const lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return Infinity;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return Infinity;
  return tca - Math.sqrt(r * r - d2);
}

/** Push a circle (x,z,r) out of every box that blocks at the given feet height. Mutates out. */
export function resolveCircle(out: { x: number; z: number; hit: boolean }, r: number, feetY: number, boxes: Box[], step = 0.35) {
  out.hit = false;
  for (let pass = 0; pass < 2; pass++) {
    for (const b of boxes) {
      if (feetY >= b.top - step) continue;
      if (b.y0 !== undefined && b.y0 >= feetY + 1.8) continue;
      if (out.x + r < b.minX || out.x - r > b.maxX || out.z + r < b.minZ || out.z - r > b.maxZ) continue;
      const cx = Math.max(b.minX, Math.min(out.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(out.z, b.maxZ));
      let dx = out.x - cx;
      let dz = out.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      out.hit = true;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        out.x += (dx / d) * (r - d);
        out.z += (dz / d) * (r - d);
      } else {
        // center inside box: push out along the shallowest axis
        const l = out.x - b.minX;
        const rr = b.maxX - out.x;
        const t = out.z - b.minZ;
        const bt = b.maxZ - out.z;
        const m = Math.min(l, rr, t, bt);
        dx = 0;
        dz = 0;
        if (m === l) out.x = b.minX - r;
        else if (m === rr) out.x = b.maxX + r;
        else if (m === t) out.z = b.minZ - r;
        else out.z = b.maxZ + r;
      }
    }
  }
}

/** Highest surface under a circle that the feet can stand on */
export function groundAt(x: number, z: number, r: number, feetY: number, boxes: Box[], step = 0.35): number {
  let g = 0;
  for (const b of boxes) {
    if (b.top > feetY + step || b.y0 !== undefined) continue;
    if (b.top <= g) continue;
    if (x + r * 0.7 < b.minX || x - r * 0.7 > b.maxX || z + r * 0.7 < b.minZ || z - r * 0.7 > b.maxZ) continue;
    g = b.top;
  }
  return g;
}

export function pointInBoxes(x: number, y: number, z: number, boxes: Box[]): Box | null {
  for (const b of boxes) if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ && y < b.top && y > (b.y0 ?? 0)) return b;
  return null;
}
