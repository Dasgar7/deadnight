export type WeaponKind = "melee" | "hitscan" | "launcher" | "flame";

export interface WeaponDef {
  id: string;
  name: string;
  kind: WeaponKind;
  price: number; // 0 = owned at start
  mag: number;
  reserve: number; // max reserve
  dmg: number;
  pellets: number;
  spread: number; // radians
  rpm: number;
  auto: boolean;
  reload: number; // seconds
  shell?: boolean; // shell-by-shell reload
  range: number;
  headMult: number;
  pierce: number;
  recoil: number; // camera kick, radians
  kick: number; // viewmodel kick
  zoom?: number; // ADS fov
  sound: "pistol" | "rifle" | "shotgun" | "none";
  /** sample id from the sound pack (gun_<sfx>) */
  sfx?: string;
  /** special behaviour */
  fx?: "arc" | "bolt" | "grenade" | "rail" | "saw";
  pitch: number;
  icon: string;
  splash?: number;
  spinUp?: number;
  desc: string;
}

export const WEAPONS: WeaponDef[] = [
  { id: "knife", name: "Combat Knife", kind: "melee", price: 0, mag: 0, reserve: 0, dmg: 60, pellets: 1, spread: 0, rpm: 150, auto: true, reload: 0, range: 2.3, headMult: 2, pierce: 1, recoil: 0, kick: 0, sound: "none", pitch: 1, icon: "w_knife", desc: "Fast. Silent. Free." },
  { id: "pistol", name: "M1911", kind: "hitscan", price: 0, mag: 12, reserve: 120, dmg: 36, pellets: 1, spread: 0.012, rpm: 380, auto: false, reload: 1.35, range: 90, headMult: 2.5, pierce: 1, recoil: 0.018, kick: 0.05, zoom: 62, sound: "pistol", sfx: "pistol", pitch: 1.0, icon: "w_pistol", desc: "Reliable sidearm." },
  { id: "axe", name: "Fire Axe", kind: "melee", price: 650, mag: 0, reserve: 0, dmg: 175, pellets: 1, spread: 0, rpm: 66, auto: true, reload: 0, range: 2.8, headMult: 1.6, pierce: 3, recoil: 0, kick: 0, sound: "none", pitch: 1, icon: "w_axe", desc: "Cleaves through crowds." },
  { id: "magnum", name: "Magnum .44", kind: "hitscan", price: 800, mag: 6, reserve: 60, dmg: 125, pellets: 1, spread: 0.006, rpm: 160, auto: false, reload: 2.3, range: 110, headMult: 2.5, pierce: 2, recoil: 0.05, kick: 0.12, zoom: 58, sound: "pistol", sfx: "magnum", pitch: 1, icon: "w_magnum", desc: "Hand cannon. Pierces." },
  { id: "shotgun", name: "Pump Shotgun", kind: "hitscan", price: 1000, mag: 8, reserve: 72, dmg: 15, pellets: 12, spread: 0.055, rpm: 80, auto: false, reload: 0.5, shell: true, range: 40, headMult: 1.8, pierce: 1, recoil: 0.06, kick: 0.16, zoom: 62, sound: "shotgun", sfx: "shotgun", pitch: 1, icon: "w_shotgun", desc: "Devastating up close." },
  { id: "smg", name: "KR-9 SMG", kind: "hitscan", price: 1200, mag: 32, reserve: 256, dmg: 22, pellets: 1, spread: 0.02, rpm: 800, auto: true, reload: 1.7, range: 80, headMult: 2, pierce: 1, recoil: 0.01, kick: 0.04, zoom: 60, sound: "pistol", sfx: "smg", pitch: 1, icon: "w_smg", desc: "Spray and pray." },
  { id: "rifle", name: "AK-74 Rifle", kind: "hitscan", price: 1800, mag: 30, reserve: 210, dmg: 40, pellets: 1, spread: 0.01, rpm: 600, auto: true, reload: 2.1, range: 130, headMult: 2.4, pierce: 1, recoil: 0.016, kick: 0.07, zoom: 56, sound: "rifle", sfx: "rifle", pitch: 1.0, icon: "w_rifle", desc: "Workhorse assault rifle." },
  { id: "sniper", name: "Bolt Sniper", kind: "hitscan", price: 2400, mag: 5, reserve: 45, dmg: 300, pellets: 1, spread: 0.0, rpm: 55, auto: false, reload: 2.8, range: 300, headMult: 3, pierce: 4, recoil: 0.07, kick: 0.2, zoom: 16, sound: "rifle", sfx: "sniper", pitch: 1, icon: "w_sniper", desc: "One shot. Pierces rows." },
  { id: "flame", name: "Hellfire Thrower", kind: "flame", price: 3000, mag: 160, reserve: 480, dmg: 9, pellets: 1, spread: 0.1, rpm: 1200, auto: true, reload: 2.8, range: 10, headMult: 1, pierce: 99, recoil: 0.002, kick: 0.01, sound: "none", pitch: 1, icon: "w_flame", desc: "Burn them all." },
  { id: "rocket", name: "RPG-7", kind: "launcher", price: 3600, mag: 1, reserve: 14, dmg: 450, pellets: 1, spread: 0, rpm: 60, auto: false, reload: 2.6, range: 200, headMult: 1, pierce: 1, recoil: 0.08, kick: 0.25, zoom: 55, sound: "none", pitch: 1, icon: "w_rocket", splash: 7, desc: "Big boom. Area damage." },
  { id: "minigun", name: "M134 Minigun", kind: "hitscan", price: 5000, mag: 300, reserve: 900, dmg: 24, pellets: 1, spread: 0.03, rpm: 1500, auto: true, reload: 4.2, range: 120, headMult: 1.8, pierce: 1, recoil: 0.006, kick: 0.03, sound: "rifle", sfx: "rifle", pitch: 1.25, icon: "w_minigun", spinUp: 0.55, desc: "Endless lead rain." },
  { id: "sawedoff", name: "Sawed-Off", kind: "hitscan", price: 600, mag: 2, reserve: 40, dmg: 24, pellets: 14, spread: 0.095, rpm: 130, auto: false, reload: 1.7, range: 26, headMult: 1.6, pierce: 1, recoil: 0.1, kick: 0.22, zoom: 68, sound: "shotgun", sfx: "sawedoff", pitch: 1, icon: "w_sawedoff", desc: "Two barrels. Zero subtlety." },
  { id: "katana", name: "Katana", kind: "melee", price: 900, mag: 0, reserve: 0, dmg: 130, pellets: 1, spread: 0, rpm: 100, auto: true, reload: 0, range: 2.7, headMult: 2, pierce: 2, recoil: 0, kick: 0, sound: "none", pitch: 1, icon: "w_katana", desc: "Clean, wide, deadly." },
  { id: "dmr", name: "SVD Marksman", kind: "hitscan", price: 2000, mag: 10, reserve: 90, dmg: 90, pellets: 1, spread: 0.003, rpm: 210, auto: false, reload: 2.3, range: 220, headMult: 2.8, pierce: 2, recoil: 0.03, kick: 0.11, zoom: 26, sound: "rifle", sfx: "rifle", pitch: 0.8, icon: "w_dmr", desc: "Semi-auto precision." },
  { id: "crossbow", name: "Hunter Crossbow", kind: "hitscan", price: 1400, mag: 1, reserve: 30, dmg: 240, pellets: 1, spread: 0.001, rpm: 75, auto: false, reload: 1.7, range: 140, headMult: 3, pierce: 3, recoil: 0.02, kick: 0.08, zoom: 36, sound: "none", sfx: "crossbow", fx: "bolt", pitch: 1, icon: "w_crossbow", desc: "Silent. Bolts pass through." },
  { id: "chainsaw", name: "Chainsaw", kind: "melee", price: 2200, mag: 0, reserve: 0, dmg: 26, pellets: 1, spread: 0, rpm: 420, auto: true, reload: 0, range: 2.3, headMult: 1, pierce: 3, recoil: 0, kick: 0, sound: "none", pitch: 1, icon: "w_chainsaw", fx: "saw", desc: "Hold to shred." },
  { id: "glauncher", name: "M79 Thumper", kind: "launcher", price: 3200, mag: 1, reserve: 24, dmg: 330, pellets: 1, spread: 0, rpm: 70, auto: false, reload: 2.0, range: 200, headMult: 1, pierce: 1, recoil: 0.06, kick: 0.2, zoom: 58, sound: "none", sfx: "glauncher", fx: "grenade", pitch: 1, icon: "w_glauncher", splash: 5, desc: "Lobbed 40mm grenades." },
  { id: "aa12", name: "AA-12 Auto Shotgun", kind: "hitscan", price: 4200, mag: 20, reserve: 160, dmg: 14, pellets: 9, spread: 0.06, rpm: 300, auto: true, reload: 3.0, range: 40, headMult: 1.7, pierce: 1, recoil: 0.028, kick: 0.1, zoom: 64, sound: "shotgun", sfx: "shotgun", pitch: 1.12, icon: "w_aa12", desc: "Full-auto buckshot." },
  { id: "arc", name: "Tesla Arc", kind: "hitscan", price: 4600, mag: 50, reserve: 300, dmg: 46, pellets: 1, spread: 0.0, rpm: 420, auto: true, reload: 2.4, range: 28, headMult: 1, pierce: 1, recoil: 0.004, kick: 0.02, sound: "none", sfx: "arc", fx: "arc", pitch: 1, icon: "w_arc", desc: "Chain lightning jumps between targets." },
  { id: "railgun", name: "Rail Cannon", kind: "hitscan", price: 6500, mag: 4, reserve: 28, dmg: 750, pellets: 1, spread: 0, rpm: 52, auto: false, reload: 3.2, range: 400, headMult: 2, pierce: 99, recoil: 0.09, kick: 0.26, zoom: 30, sound: "none", sfx: "railgun", fx: "rail", pitch: 1, icon: "w_railgun", desc: "Pierces everything in line." },
];
WEAPONS.sort((a, b) => a.price - b.price || (a.kind === "melee" ? -1 : 1));
export const W = Object.fromEntries(WEAPONS.map((w) => [w.id, w])) as Record<string, WeaponDef>;

export type ZType = "walker" | "runner" | "brute" | "spitter" | "bloater" | "boss";

export interface ZDef {
  id: ZType;
  name: string;
  hp: number;
  speed: number;
  dmg: number;
  scale: number;
  radius: number;
  score: number;
  minWave: number;
  weight: number;
  reach: number;
  face: number;
  tint: [number, number, number];
  shirt: [number, number, number];
  lean: number;
}

export const ZDEFS: Record<ZType, ZDef> = {
  walker: { id: "walker", name: "Walker", hp: 100, speed: 1.9, dmg: 14, scale: 1, radius: 0.42, score: 60, minWave: 1, weight: 10, reach: 1.55, face: 0, tint: [1, 1, 1], shirt: [1, 1, 1], lean: 0.1 },
  runner: { id: "runner", name: "Runner", hp: 70, speed: 4.6, dmg: 11, scale: 0.95, radius: 0.4, score: 80, minWave: 3, weight: 6, reach: 1.5, face: 1, tint: [1.15, 0.95, 0.95], shirt: [1.3, 0.8, 0.7], lean: 0.45 },
  spitter: { id: "spitter", name: "Spitter", hp: 85, speed: 2.4, dmg: 12, scale: 1, radius: 0.42, score: 110, minWave: 4, weight: 3, reach: 1.5, face: 0, tint: [0.75, 1.3, 0.6], shirt: [0.6, 1.1, 0.5], lean: 0.05 },
  brute: { id: "brute", name: "Brute", hp: 650, speed: 2.0, dmg: 38, scale: 1.55, radius: 0.7, score: 250, minWave: 5, weight: 2.5, reach: 2.1, face: 2, tint: [0.8, 0.7, 0.7], shirt: [0.5, 0.5, 0.6], lean: 0.08 },
  bloater: { id: "bloater", name: "Bloater", hp: 220, speed: 1.5, dmg: 16, scale: 1.3, radius: 0.62, score: 140, minWave: 6, weight: 2.5, reach: 1.9, face: 1, tint: [1.1, 1.05, 0.55], shirt: [0.9, 0.85, 0.4], lean: 0 },
  boss: { id: "boss", name: "Abomination", hp: 4200, speed: 2.6, dmg: 55, scale: 2.5, radius: 1.1, score: 2000, minWave: 5, weight: 0, reach: 3.2, face: 2, tint: [0.7, 0.55, 0.55], shirt: [0.35, 0.2, 0.2], lean: 0.12 },
};

export interface PerkDef {
  id: string;
  name: string;
  price: number;
  color: number;
  desc: string;
}
export const PERKS: PerkDef[] = [
  { id: "heart", name: "Iron Heart", price: 2000, color: 0xd02828, desc: "+50 max health" },
  { id: "hands", name: "Quick Hands", price: 1500, color: 0x2a8de0, desc: "Reload 40% faster" },
  { id: "boots", name: "Fleet Foot", price: 1500, color: 0x30c060, desc: "Move 18% faster" },
  { id: "dmg", name: "Hollow Point", price: 2500, color: 0xe8a020, desc: "+35% bullet damage" },
];

export const MAP_HALF = 70;
export const MAX_GRENADES = 4;
