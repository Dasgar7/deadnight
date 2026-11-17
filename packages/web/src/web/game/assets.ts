import * as THREE from "three";

const BASE = "/game/img/";
const loader = new THREE.TextureLoader();
const cache = new Map<string, THREE.Texture>();
let maxAniso = 4;

export function setMaxAniso(n: number) {
  maxAniso = n;
}

export const IMAGE_FILES = [
  "asphalt", "dirt", "brick", "concrete", "wood", "rustmetal", "gunmetal", "facade", "zskin", "zshirt", "zpants",
  "zface1", "zface2", "zface3", "sky", "splat",
  "w_knife", "w_axe", "w_pistol", "w_magnum", "w_shotgun", "w_smg", "w_rifle", "w_sniper", "w_rocket", "w_flame", "w_minigun", "w_katana", "w_chainsaw", "w_sawedoff", "w_aa12", "w_dmr", "w_crossbow", "w_glauncher", "w_arc", "w_railgun",
];

const images = new Map<string, HTMLImageElement>();

/** Preload every image; resolves with progress callbacks. */
export function preloadImages(onProgress: (p: number) => void): Promise<void> {
  let done = 0;
  return Promise.all(
    IMAGE_FILES.map(
      (name) =>
        new Promise<void>((res) => {
          const img = new Image();
          img.onload = img.onerror = () => {
            done++;
            onProgress(done / IMAGE_FILES.length);
            res();
          };
          img.src = BASE + name + (name === "splat" ? ".png" : ".jpg");
          images.set(name, img);
        }),
    ),
  ).then(() => undefined);
}

export function getImage(name: string): HTMLImageElement | undefined {
  return images.get(name);
}

export function tex(name: string, rx = 1, ry = 1, srgb = true): THREE.Texture {
  const key = `${name}|${rx}|${ry}`;
  let t = cache.get(key);
  if (t) return t;
  const img = images.get(name);
  t = img && img.complete && img.naturalWidth ? new THREE.Texture(img) : loader.load(BASE + name + (name === "splat" ? ".png" : ".jpg"));
  if (img && img.complete && img.naturalWidth) t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = maxAniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

export function canvasTex(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return t;
}

export function softDot(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(0.4, "rgba(255,255,255,0.55)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return c;
}

/** Draw a shop sign (weapon icon + name + price) to a canvas texture */
export function makeSign(title: string, sub: string, color: string, icon?: string, w = 512, h = 320): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0b0b0d";
  g.fillRect(0, 0, w, h);
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "rgba(255,255,255,0.08)");
  grad.addColorStop(1, "rgba(0,0,0,0.0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = color;
  g.lineWidth = 8;
  g.strokeRect(8, 8, w - 16, h - 16);
  const img = icon ? images.get(icon) : undefined;
  if (img && img.naturalWidth) {
    g.globalCompositeOperation = "lighter";
    g.drawImage(img, 56, 20, w - 112, (w - 112) * 0.75 * 0.62);
    g.globalCompositeOperation = "source-over";
  }
  g.textAlign = "center";
  g.fillStyle = "#f2efe8";
  g.font = "700 46px Oswald, Impact, sans-serif";
  g.fillText(title.toUpperCase(), w / 2, h - 82);
  g.fillStyle = color;
  g.font = "600 40px 'Barlow Condensed', Oswald, sans-serif";
  g.fillText(sub, w / 2, h - 34);
  return canvasTex(c);
}
