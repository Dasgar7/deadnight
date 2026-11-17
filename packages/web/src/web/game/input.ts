/** Shared input state, written by keyboard/mouse/touch UI, read by the game each frame. */
export const input = {
  moveX: 0, // -1..1 (right +)
  moveY: 0, // -1..1 (forward +)
  lookDX: 0, // accumulated pixels
  lookDY: 0,
  fire: false,
  ads: false,
  sprint: false,
  // one-shot flags (consumed by game)
  jump: false,
  reload: false,
  use: false,
  next: false,
  prev: false,
  grenade: false,
  flashlight: false,
  melee: false,
  selectSlot: -1,
  touch: false,
  up: false, // held: heli ascend / car handbrake
  down: false, // held: heli descend
  cam: false, // one-shot: cycle camera
  chat: false,
};

const keys: Record<string, boolean> = {};
let keyboardEnabled = false;

export function isTouchDevice() {
  return typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches || "ontouchstart" in window) && !window.matchMedia?.("(pointer: fine)").matches;
}

function recompute() {
  if (input.touch) return;
  input.moveX = (keys["KeyD"] || keys["ArrowRight"] ? 1 : 0) - (keys["KeyA"] || keys["ArrowLeft"] ? 1 : 0);
  input.moveY = (keys["KeyW"] || keys["ArrowUp"] ? 1 : 0) - (keys["KeyS"] || keys["ArrowDown"] ? 1 : 0);
  input.sprint = !!(keys["ShiftLeft"] || keys["ShiftRight"]);
  input.up = !!keys["Space"];
  input.down = !!(keys["ShiftLeft"] || keys["ShiftRight"] || keys["ControlLeft"] || keys["KeyX"]);
}

const SLOT_KEYS: Record<string, number> = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5, Digit7: 6, Digit8: 7, Digit9: 8, Digit0: 9, Minus: 10, Equal: 11 };

function onKeyDown(e: KeyboardEvent) {
  if (!keyboardEnabled) return;
  if (e.repeat) return;
  keys[e.code] = true;
  switch (e.code) {
    case "Space":
      input.jump = true;
      e.preventDefault();
      break;
    case "KeyR":
      input.reload = true;
      break;
    case "KeyE":
      input.use = true;
      break;
    case "KeyG":
      input.grenade = true;
      break;
    case "KeyF":
      input.flashlight = true;
      break;
    case "KeyV":
      input.melee = true;
      break;
    case "KeyC":
      input.cam = true;
      break;
    case "KeyQ":
      input.prev = true;
      break;
    case "Tab":
      e.preventDefault();
      break;
  }
  if (e.code in SLOT_KEYS) input.selectSlot = SLOT_KEYS[e.code];
  recompute();
}
function onKeyUp(e: KeyboardEvent) {
  keys[e.code] = false;
  recompute();
}
function onMouseDown(e: MouseEvent) {
  if (!keyboardEnabled || !document.pointerLockElement) return;
  if (e.button === 0) input.fire = true;
  if (e.button === 2) input.ads = true;
}
function onMouseUp(e: MouseEvent) {
  if (e.button === 0) input.fire = false;
  if (e.button === 2) input.ads = false;
}
function onMouseMove(e: MouseEvent) {
  if (!keyboardEnabled || !document.pointerLockElement) return;
  input.lookDX += e.movementX;
  input.lookDY += e.movementY;
}
function onWheel(e: WheelEvent) {
  if (!keyboardEnabled || !document.pointerLockElement) return;
  if (e.deltaY > 0) input.next = true;
  else if (e.deltaY < 0) input.prev = true;
}
function onCtx(e: Event) {
  e.preventDefault();
}
function onBlur() {
  for (const k in keys) keys[k] = false;
  input.fire = false;
  input.ads = false;
  recompute();
}

export function bindInput() {
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mouseup", onMouseUp);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("wheel", onWheel, { passive: true });
  window.addEventListener("contextmenu", onCtx);
  window.addEventListener("blur", onBlur);
  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("mousedown", onMouseDown);
    window.removeEventListener("mouseup", onMouseUp);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("wheel", onWheel);
    window.removeEventListener("contextmenu", onCtx);
    window.removeEventListener("blur", onBlur);
  };
}

export function setKeyboardEnabled(v: boolean) {
  keyboardEnabled = v;
  if (!v) resetInput();
}

export function resetInput() {
  for (const k in keys) keys[k] = false;
  input.moveX = input.moveY = 0;
  input.fire = input.ads = input.sprint = false;
  input.up = input.down = input.cam = false;
  input.jump = input.reload = input.use = input.next = input.prev = input.grenade = input.flashlight = input.melee = false;
  input.selectSlot = -1;
  input.lookDX = input.lookDY = 0;
}
