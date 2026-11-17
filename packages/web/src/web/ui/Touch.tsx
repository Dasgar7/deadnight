import { useEffect, useRef, useState } from "react";
import { input } from "../game/input";

const LOOK_MUL = 1.7;

/** Full-screen touch layer: left-half = floating joystick, right-half = look drag, plus action buttons. */
export function TouchControls({ canUse, onPause, grenades, reloading, vehicle }: { canUse: boolean; onPause: () => void; grenades: number; reloading: boolean; vehicle: string | null }) {
  const zone = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState<{ bx: number; by: number; kx: number; ky: number } | null>(null);

  useEffect(() => {
    const el = zone.current;
    if (!el) return;
    let moveId = -1;
    let lookId = -1;
    let ox = 0;
    let oy = 0;
    let lx = 0;
    let ly = 0;
    const R = 56;
    const down = (e: PointerEvent) => {
      e.preventDefault();
      const w = el.clientWidth;
      if (e.clientX < w * 0.45 && moveId < 0) {
        moveId = e.pointerId;
        ox = e.clientX;
        oy = e.clientY;
        setStick({ bx: ox, by: oy, kx: ox, ky: oy });
      } else if (lookId < 0 && e.clientX >= w * 0.3) {
        lookId = e.pointerId;
        lx = e.clientX;
        ly = e.clientY;
      }
      el.setPointerCapture?.(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId === moveId) {
        let dx = e.clientX - ox;
        let dy = e.clientY - oy;
        const l = Math.hypot(dx, dy);
        if (l > R) {
          dx = (dx / l) * R;
          dy = (dy / l) * R;
        }
        input.moveX = dx / R;
        input.moveY = -dy / R;
        setStick({ bx: ox, by: oy, kx: ox + dx, ky: oy + dy });
      } else if (e.pointerId === lookId) {
        input.lookDX += (e.clientX - lx) * LOOK_MUL;
        input.lookDY += (e.clientY - ly) * LOOK_MUL;
        lx = e.clientX;
        ly = e.clientY;
      }
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId === moveId) {
        moveId = -1;
        input.moveX = input.moveY = 0;
        setStick(null);
      } else if (e.pointerId === lookId) lookId = -1;
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      input.moveX = input.moveY = 0;
      input.fire = input.ads = false;
    };
  }, []);

  return (
    <div className="absolute inset-0" style={{ touchAction: "none" }}>
      <div ref={zone} className="absolute inset-0" style={{ touchAction: "none" }} />
      {stick && (
        <>
          <div className="pointer-events-none absolute rounded-full border-2 border-white/30 bg-white/5" style={{ width: 112, height: 112, left: stick.bx - 56, top: stick.by - 56 }} />
          <div className="pointer-events-none absolute rounded-full bg-white/40" style={{ width: 52, height: 52, left: stick.kx - 26, top: stick.ky - 26 }} />
        </>
      )}
      {/* right-side action cluster */}
      <Hold className="right-[max(18px,env(safe-area-inset-right))] bottom-[68px] h-[92px] w-[92px] bg-[#c8202a]/70 text-[22px]" onDown={() => (input.fire = true)} onUp={() => setTimeout(() => (input.fire = false), 70)} label="FIRE" />
      <Hold className="right-[124px] bottom-[80px] h-[64px] w-[64px] bg-white/15 text-[15px]" onDown={() => (input.ads = !input.ads)} label={vehicle ? "ALT FIRE" : "AIM"} toggle />
      {vehicle ? (
        <>
          <Hold className="right-[22px] bottom-[174px] h-[60px] w-[60px] bg-white/15 text-[13px]" onDown={() => (input.up = true)} onUp={() => (input.up = false)} label={vehicle === "heli" ? "UP" : "BRAKE"} />
          {vehicle === "heli" && <Hold className="right-[92px] bottom-[170px] h-[52px] w-[52px] bg-white/15 text-[13px]" onDown={() => (input.down = true)} onUp={() => (input.down = false)} label="DOWN" />}
        </>
      ) : (
        <>
          <Tap className="right-[22px] bottom-[174px] h-[60px] w-[60px] bg-white/15 text-[14px]" onTap={() => (input.jump = true)} label="JUMP" />
          <Tap className="right-[92px] bottom-[156px] h-[56px] w-[56px] bg-white/15 text-[13px]" onTap={() => (input.reload = true)} label={reloading ? "..." : "RELOAD"} />
          <Tap className="right-[160px] bottom-[156px] h-[56px] w-[56px] bg-amber-500/30 text-[13px]" onTap={() => (input.grenade = true)} label={`NADE ${grenades}`} />
          <Tap className="right-[22px] bottom-[242px] h-[52px] w-[52px] bg-white/15 text-[13px]" onTap={() => (input.melee = true)} label="MELEE" />
          <Tap className="right-[88px] bottom-[222px] h-[44px] w-[44px] bg-white/15 text-[18px]" onTap={() => (input.next = true)} label="›" />
          <Tap className="right-[140px] bottom-[222px] h-[44px] w-[44px] bg-white/15 text-[18px]" onTap={() => (input.prev = true)} label="‹" />
        </>
      )}
      <Tap className="left-[18px] bottom-[66px] h-[40px] w-[40px] bg-sky-500/25 text-[12px]" onTap={() => (input.cam = true)} label="CAM" />
      <Tap className="left-[18px] bottom-[18px] h-[40px] w-[40px] bg-white/10 text-[12px]" onTap={() => (input.flashlight = true)} label="LAMP" />
      {canUse && <Tap className="left-1/2 bottom-[22px] h-[64px] w-[110px] -translate-x-1/2 bg-green-600/70 text-[22px]" onTap={() => (input.use = true)} label="BUY / USE" rounded />}
      <button
        className="absolute top-[10px] right-[max(10px,env(safe-area-inset-right))] h-[38px] w-[38px] rounded-full bg-black/50 text-white"
        style={{ touchAction: "none" }}
        onPointerDown={(e) => {
          e.stopPropagation();
          onPause();
        }}
      >
        ❚❚
      </button>
    </div>
  );
}

function Hold({ className, onDown, onUp, label, toggle }: { className: string; onDown: () => void; onUp?: () => void; label: string; toggle?: boolean }) {
  const [on, setOn] = useState(false);
  return (
    <div
      className={`dh-disp absolute flex items-center justify-center rounded-full border border-white/25 text-white select-none ${className} ${on ? "brightness-150" : ""}`}
      style={{ touchAction: "none" }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        setOn(toggle ? !on : true);
        onDown();
      }}
      onPointerUp={() => {
        if (!toggle) setOn(false);
        onUp?.();
      }}
      onPointerCancel={() => {
        if (!toggle) setOn(false);
        onUp?.();
      }}
    >
      {label}
    </div>
  );
}

function Tap({ className, onTap, label, rounded }: { className: string; onTap: () => void; label: string; rounded?: boolean }) {
  return (
    <div
      className={`dh-disp absolute flex items-center justify-center border border-white/25 text-center leading-none text-white select-none active:brightness-150 ${rounded ? "rounded-xl" : "rounded-full"} ${className}`}
      style={{ touchAction: "none" }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onTap();
      }}
    >
      {label}
    </div>
  );
}
