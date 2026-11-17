import { PERKS } from "../game/config";
import type { HudState } from "../game/gamebase";
import { input } from "../game/input";

const img = (n: string) => `/game/img/${n}.jpg`;
const PERK_COLOR: Record<string, string> = Object.fromEntries(PERKS.map((p) => [p.id, "#" + p.color.toString(16).padStart(6, "0")]));
const PERK_NAME: Record<string, string> = Object.fromEntries(PERKS.map((p) => [p.id, p.name]));

export interface Fxs {
  hitKind: "hit" | "head" | "kill" | null;
  hitKey: number;
  dmg: { id: number; angle: number }[];
  banner: { id: number; title: string; sub?: string } | null;
  toasts: { id: number; text: string }[];
  flash: { id: number; color: string } | null;
  hurtKey: number;
}

export function Hud({ h, fx, radarRef, touch }: { h: HudState; fx: Fxs; radarRef: (c: HTMLCanvasElement | null) => void; touch: boolean }) {
  const hpPct = Math.max(0, (h.hp / h.maxHp) * 100);
  const spread = h.spread + 6;
  const w = h.weapon;
  const bossShow = h.bossHp > 0;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden dh-hud-text">
      {/* low hp vignette */}
      <div className="absolute inset-0" style={{ boxShadow: `inset 0 0 ${h.lowHp ? 200 : 0}px ${h.lowHp ? 60 : 0}px rgba(180,0,10,.65)`, animation: h.lowHp ? "dh-pulse 1s infinite" : undefined, transition: "box-shadow .4s" }} />
      <div key={fx.hurtKey} className="absolute inset-0" style={{ boxShadow: "inset 0 0 160px 30px rgba(200,0,10,.7)", opacity: 0, animation: fx.hurtKey ? "dh-toast .5s ease-out" : undefined }} />
      {fx.flash && <div key={fx.flash.id} className="absolute inset-0" style={{ background: fx.flash.color, opacity: 0, animation: "dh-toast .6s ease-out" }} />}

      {/* sniper scope */}
      {h.scoped && (
        <div className="absolute inset-0" style={{ background: "radial-gradient(circle at center, transparent 0, transparent 30vmin, #000 30.4vmin)" }}>
          <div className="absolute left-0 right-0 top-1/2 h-px bg-black/80" />
          <div className="absolute top-0 bottom-0 left-1/2 w-px bg-black/80" />
          <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-600" />
        </div>
      )}

      {/* crosshair */}
      {!h.scoped && !w.melee && !h.vehicle && h.camMode !== 2 && (
        <div className="absolute left-1/2 top-1/2">
          {[
            [0, -spread, 2, 9],
            [0, spread - 9, 2, 9],
            [-spread, 0, 9, 2],
            [spread - 9, 0, 9, 2],
          ].map(([x, y, ww, hh], i) => (
            <div key={i} className="absolute bg-white/90" style={{ left: x - (ww === 2 ? 1 : 0), top: y - (hh === 2 ? 1 : 0), width: ww, height: hh, boxShadow: "0 0 3px #000" }} />
          ))}
          <div className="absolute h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90" />
        </div>
      )}
      {h.vehicle && h.vehicle.kind !== "muscle" && (
        <div className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/80" style={{ boxShadow: "0 0 4px #000" }}>
          <div className="absolute left-1/2 top-1/2 h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
        </div>
      )}
      {!h.scoped && w.melee && !h.vehicle && h.camMode !== 2 && <div className="absolute left-1/2 top-1/2 h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80" />}

      {/* hit marker */}
      {fx.hitKind && (
        <div key={fx.hitKey} className="absolute left-1/2 top-1/2" style={{ animation: "dh-toast .28s ease-out forwards" }}>
          {[45, 135, 225, 315].map((r) => (
            <div key={r} className="absolute" style={{ width: 10, height: 2, background: fx.hitKind === "hit" ? "#fff" : fx.hitKind === "head" ? "#f2a21e" : "#ff3030", transform: `rotate(${r}deg) translateX(${10 + (fx.hitKind === "kill" ? 4 : 0)}px)`, left: -5, top: -1 }} />
          ))}
        </div>
      )}

      {/* damage indicators */}
      {fx.dmg.map((d) => (
        <div key={d.id} className="absolute left-1/2 top-1/2" style={{ transform: `rotate(${d.angle}rad)`, animation: "dh-toast 1.2s ease-out forwards" }}>
          <div style={{ position: "absolute", left: -90, top: -190, width: 180, height: 60, borderRadius: "50%", borderTop: "10px solid rgba(220,20,30,.85)", filter: "blur(2px)" }} />
        </div>
      ))}

      {/* top: wave / boss */}
      <div className="absolute left-1/2 top-3 -translate-x-1/2 text-center">
        <div className="dh-disp text-[13px] tracking-[.3em] text-white/60">WAVE</div>
        <div className="dh-disp -mt-1 text-[44px] font-bold leading-none text-[#c8202a]" style={{ textShadow: "0 0 18px rgba(200,32,42,.6)" }}>
          {h.wave || "—"}
        </div>
        <div className="text-[18px] font-semibold text-amber-200/90">{h.waveText}</div>
        {bossShow && (
          <div className="mx-auto mt-2 w-[min(70vw,460px)]">
            <div className="dh-disp text-[14px] tracking-[.2em] text-red-400">{h.bossName}</div>
            <div className="h-3 border border-red-900 bg-black/60">
              <div className="h-full bg-gradient-to-r from-red-900 to-red-500" style={{ width: `${h.bossHp * 100}%`, transition: "width .15s" }} />
            </div>
          </div>
        )}
      </div>

      {/* radar + status */}
      <div className="absolute left-3 top-3" style={{ paddingLeft: "env(safe-area-inset-left)" }}>
        <canvas ref={radarRef} width={150} height={150} className="rounded-full border border-white/20" style={{ width: touch ? 96 : 130, height: touch ? 96 : 130 }} />
        <div className="mt-2 flex flex-col gap-1">
          {h.instakill > 0 && <Timer label="INSTA-KILL" t={h.instakill} color="#ff3030" />}
          {h.doublePoints > 0 && <Timer label="2× POINTS" t={h.doublePoints} color="#f0d020" />}
        </div>
      </div>

      {/* points / kills */}
      <div className="absolute right-3 top-3 text-right" style={{ paddingRight: "env(safe-area-inset-right)", marginRight: touch ? 46 : 0 }}>
        <div className="dh-disp text-[34px] font-bold leading-none text-[#f2a21e]">$ {h.points.toLocaleString()}</div>
        <div className="text-[16px] font-semibold tracking-wider text-white/70">
          {h.kills} KILLS · {h.headshots} HEADSHOTS
        </div>
        <div className="text-[12px] text-white/30">{h.fps} FPS</div>
      </div>

      {/* bottom-left: vitals */}
      <div className="absolute bottom-4 left-4" style={{ marginBottom: touch ? 52 : 0, paddingLeft: "env(safe-area-inset-left)" }}>
        <div className="flex items-end gap-3">
          <div className="dh-disp text-[44px] font-bold leading-none" style={{ color: h.lowHp ? "#ff3030" : "#f1e8e4" }}>
            {h.hp}
          </div>
          <div>
            <div className="h-3 w-[180px] border border-white/25 bg-black/60">
              <div className="h-full" style={{ width: `${hpPct}%`, background: h.lowHp ? "#ff3030" : "linear-gradient(90deg,#8a1018,#d3252f)", transition: "width .2s" }} />
            </div>
            {h.armor > 0 && (
              <div className="mt-1 h-2 w-[180px] border border-white/25 bg-black/60">
                <div className="h-full bg-sky-400" style={{ width: `${Math.min(100, h.armor)}%` }} />
              </div>
            )}
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          {h.perks.map((p) => (
            <div key={p} title={PERK_NAME[p]} className="dh-disp flex h-7 items-center border px-2 text-[12px]" style={{ borderColor: PERK_COLOR[p], color: PERK_COLOR[p], background: "rgba(0,0,0,.5)" }}>
              {PERK_NAME[p]}
            </div>
          ))}
        </div>
        <div className="mt-1 flex items-center gap-1 text-[16px] font-semibold text-amber-200">
          <span className="text-[18px]">💣</span> × {h.grenades}
        </div>
      </div>

      {/* bottom-right: ammo */}
      {h.vehicle && <VehiclePanel v={h.vehicle} touch={touch} />}
      {!touch && !h.vehicle && (
        <div className="absolute bottom-[58px] right-4 text-right">
          <div className="flex items-end justify-end gap-3">
            <div>
              <div className="dh-disp text-[14px] tracking-[.15em] text-white/70">{w.name}</div>
              <div className="dh-disp text-[56px] font-bold leading-none text-white">
                {w.melee ? "∞" : w.reloading ? <span className="text-[26px] text-amber-300">RELOADING</span> : h.weapon.mag}
                {!w.melee && <span className="ml-2 text-[26px] text-white/50">/ {w.reserve}</span>}
              </div>
            </div>
            <img src={img(w.icon)} alt="" className="h-[60px] w-[80px] border border-white/20 bg-black object-cover opacity-90" />
          </div>
        </div>
      )}
      {touch && !h.vehicle && (
        <div className="absolute left-1/2 top-[110px] -translate-x-1/2 text-center">
          <span className="dh-disp text-[20px] font-bold text-white">{w.melee ? w.name : w.reloading ? "RELOADING" : `${w.mag} / ${w.reserve}`}</span>
        </div>
      )}

      {/* weapon slots */}
      {!h.vehicle && (
      <div className={`absolute left-1/2 flex -translate-x-1/2 gap-1 ${touch ? "top-[6px] max-w-[46vw] overflow-x-auto" : "bottom-3 max-w-[calc(100vw-760px)] min-w-[420px]"}`}>
        {h.slots.map((s, i) => (
          <div
            key={s.id}
            className={`relative overflow-hidden border ${s.cur ? "border-[#f2a21e]" : "border-white/20"} ${touch ? "pointer-events-auto" : ""}`}
            style={{ flex: `0 1 ${touch ? 38 : 56}px`, minWidth: touch ? 34 : 26, height: touch ? 28 : 40, opacity: s.cur ? 1 : 0.55, boxShadow: s.cur ? "0 0 10px rgba(242,162,30,.5)" : undefined }}
            onPointerDown={touch ? (e) => { e.stopPropagation(); input.selectSlot = i; } : undefined}
          >
            <img src={img(s.icon)} alt={s.name} className="h-full w-full object-cover" />
            <span className="dh-disp absolute left-[2px] top-0 text-[10px] text-white">{i < 9 ? i + 1 : i === 9 ? 0 : i === 10 ? "-" : i === 11 ? "=" : ""}</span>
          </div>
        ))}
      </div>
      )}

      {h.room && <RoomPanel room={h.room} />}

      {/* interact prompt */}
      {h.prompt && !touch && (
        <div className="absolute left-1/2 -translate-x-1/2 text-center" style={h.vehicle ? { bottom: 24 } : { top: "62%" }}>
          <div className="dh-disp border bg-black/60 px-4 py-2 text-[20px]" style={{ borderColor: h.prompt.afford ? "#3ad06a" : "#c8202a", color: h.prompt.afford ? "#9af0b4" : "#ff8a8a" }}>
            {h.prompt.text}
          </div>
        </div>
      )}
      {h.prompt && touch && (
        <div className="absolute left-1/2 top-[56%] -translate-x-1/2 text-center">
          <div className="dh-disp border bg-black/60 px-3 py-1 text-[16px]" style={{ borderColor: h.prompt.afford ? "#3ad06a" : "#c8202a", color: h.prompt.afford ? "#9af0b4" : "#ff8a8a" }}>
            {h.prompt.text}
          </div>
        </div>
      )}

      {/* banner */}
      {fx.banner && (
        <div key={fx.banner.id} className="absolute left-0 right-0 top-[22%] text-center" style={{ animation: "dh-banner 3s ease-out forwards" }}>
          <div className="dh-disp text-[clamp(36px,7vw,84px)] font-bold leading-none text-[#c8202a]" style={{ textShadow: "0 0 30px rgba(200,32,42,.7), 0 4px 0 #000" }}>
            {fx.banner.title}
          </div>
          {fx.banner.sub && <div className="dh-disp mt-2 text-[clamp(14px,2vw,22px)] tracking-[.25em] text-amber-200">{fx.banner.sub}</div>}
        </div>
      )}
      {/* toasts */}
      <div className="absolute left-1/2 top-[34%] flex -translate-x-1/2 flex-col items-center gap-1">
        {fx.toasts.map((t) => (
          <div key={t.id} className="dh-disp bg-black/60 px-3 py-1 text-[18px] text-amber-100" style={{ animation: "dh-toast 2.2s ease-out forwards" }}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function Timer({ label, t, color }: { label: string; t: number; color: string }) {
  return (
    <div className="dh-disp border bg-black/60 px-2 py-[2px] text-[13px]" style={{ borderColor: color, color }}>
      {label} {Math.ceil(t)}s
    </div>
  );
}

function VehiclePanel({ v, touch }: { v: NonNullable<HudState["vehicle"]>; touch: boolean }) {
  const pct = Math.max(0, (v.hp / v.maxHp) * 100);
  const low = pct < 30;
  return (
    <div className="absolute right-4 text-right" style={{ bottom: touch ? 200 : 20 }}>
      <div className="dh-disp text-[13px] tracking-[.2em] text-sky-300/90">{v.name.toUpperCase()}</div>
      <div className="flex items-end justify-end gap-3">
        {v.kind === "heli" && (
          <div className="dh-disp text-right">
            <div className="text-[34px] font-bold leading-none text-white">{v.alt}<span className="ml-1 text-[14px] text-white/50">m</span></div>
            <div className="text-[10px] tracking-widest text-white/40">ALT</div>
          </div>
        )}
        <div className="dh-disp text-right">
          <div className="text-[56px] font-bold leading-none text-white">{v.speed}<span className="ml-1 text-[16px] text-white/50">km/h</span></div>
        </div>
      </div>
      <div className="ml-auto mt-1 h-3 w-[240px] border border-white/25 bg-black/60">
        <div className="h-full" style={{ width: `${pct}%`, background: low ? "#ff3030" : "linear-gradient(90deg,#1b6f9a,#4cc4ff)", transition: "width .15s" }} />
      </div>
      <div className="dh-disp mt-1 text-[14px] text-amber-200">{v.weapon} · {v.ammo}</div>
      {v.reload > 0.02 && (
        <div className="ml-auto mt-1 h-[5px] w-[160px] bg-black/60">
          <div className="h-full bg-amber-400" style={{ width: `${(1 - v.reload) * 100}%` }} />
        </div>
      )}
      {v.weapon2 && <div className="text-[12px] text-white/50">{v.weapon2}</div>}
      {!touch && <div className="mt-1 text-[11px] tracking-wider text-white/35">{v.kind === "heli" ? "W/S speed · A/D turn · SPACE up · SHIFT down · E exit" : "W/S drive · A/D steer · SPACE brake · E exit"}</div>}
    </div>
  );
}

function RoomPanel({ room }: { room: NonNullable<HudState["room"]> }) {
  return (
    <div className="absolute left-3 top-[158px] w-[170px] text-[12px]" style={{ paddingLeft: "env(safe-area-inset-left)" }}>
      <div className="dh-disp mb-1 flex items-center justify-between border border-white/15 bg-black/50 px-2 py-[2px] text-[11px] tracking-[.2em] text-white/60">
        <span>ROOM</span>
        <span className="text-amber-300">{room.code}</span>
      </div>
      {room.players.map((p) => (
        <div key={p.id} className="mb-[2px] bg-black/45 px-2 py-[2px]">
          <div className="flex justify-between text-white/80">
            <span className="truncate">{p.name}{p.you ? " (you)" : ""}</span>
            <span className="text-white/40">{Math.max(0, Math.round(p.hp))}</span>
          </div>
          <div className="h-[3px] bg-white/10">
            <div className="h-full" style={{ width: `${Math.max(0, Math.min(100, p.hp))}%`, background: p.hp < 30 ? "#ff3030" : "#3ad06a" }} />
          </div>
        </div>
      ))}
    </div>
  );
}
