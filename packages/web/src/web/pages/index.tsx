import { useCallback, useEffect, useRef, useState } from "react";
import { preloadImages } from "../game/assets";
import { Game } from "../game/game";
import type { HudState, Quality, Settings, Stats } from "../game/gamebase";
import { bindInput, input, isTouchDevice, resetInput } from "../game/input";
import { Hud, type Fxs } from "../ui/Hud";
import { TouchControls } from "../ui/Touch";
import { client } from "../lib/api";

const SETTINGS_KEY = "deadnight.settings.v1";
const NAME_KEY = "deadnight.name.v1";
const HI_KEY = "deadnight.hi.v1";
const touchDevice = typeof window !== "undefined" && isTouchDevice();
input.touch = touchDevice;

function loadSettings(): Settings {
  const d: Settings = { sens: 1, volume: 0.7, quality: touchDevice ? "low" : "high", invertY: false, fov: 75 };
  try {
    return { ...d, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || localStorage.getItem("deadhour.settings.v1") || "{}") };
  } catch {
    return d;
  }
}
const loadHi = () => {
  try {
    return JSON.parse(localStorage.getItem(HI_KEY) || localStorage.getItem("deadhour.hi.v1") || "null") as { wave: number; kills: number } | null;
  } catch {
    return null;
  }
};

type Screen = "loading" | "menu" | "playing" | "paused" | "dead";
let uid = 1;

const EMPTY_FX: Fxs = { hitKind: null, hitKey: 0, dmg: [], banner: null, toasts: [], flash: null, hurtKey: 0 };

export default function Index() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const radarEl = useRef<HTMLCanvasElement | null>(null);
  const [screen, setScreen] = useState<Screen>("loading");
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);
  const [fx, setFx] = useState<Fxs>(EMPTY_FX);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [stats, setStats] = useState<Stats | null>(null);
  const [hi, setHi] = useState(loadHi);
  const [newHi, setNewHi] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const urlRoom = typeof window !== "undefined" ? (new URLSearchParams(window.location.search).get("room") ?? "").toUpperCase().slice(0, 6) : "";
  const [coopOpen, setCoopOpen] = useState(!!urlRoom);
  const [pname, setPname] = useState(() => (typeof window !== "undefined" ? localStorage.getItem(NAME_KEY) ?? "" : ""));
  const [joinCode, setJoinCode] = useState(urlRoom);
  const [coopErr, setCoopErr] = useState<string | null>(null);
  const [coopBusy, setCoopBusy] = useState(false);
  const [coopRoom, setCoopRoom] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const setRadar = useCallback((c: HTMLCanvasElement | null) => {
    radarEl.current = c;
    if (gameRef.current) gameRef.current.radar = c;
  }, []);

  useEffect(() => bindInput(), []);

  useEffect(() => {
    const f = () => setPortrait(touchDevice && window.innerHeight > window.innerWidth);
    f();
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);

  // boot
  useEffect(() => {
    let cancelled = false;
    let game: Game | null = null;
    (async () => {
      try {
        await Promise.race([
          Promise.all([
            document.fonts.load('700 20px "Oswald"'),
            document.fonts.load('500 20px "Oswald"'),
            document.fonts.load('600 20px "Barlow Condensed"'),
            document.fonts.load('400 20px "Barlow Condensed"'),
          ]),
          new Promise((r) => setTimeout(r, 4000)),
        ]);
        await preloadImages((p) => !cancelled && setProgress(p));
        if (cancelled || !canvasRef.current) return;
        await new Promise((r) => setTimeout(r, 30));
        game = new Game(
          canvasRef.current,
          {
            hud: (s) => setHud(s),
            hit: (kind) => setFx((f) => ({ ...f, hitKind: kind, hitKey: f.hitKey + 1 })),
            damage: (angle) => {
              const id = uid++;
              setFx((f) => ({ ...f, dmg: [...f.dmg.slice(-4), { id, angle }], hurtKey: f.hurtKey + 1 }));
              setTimeout(() => setFx((f) => ({ ...f, dmg: f.dmg.filter((d) => d.id !== id) })), 1200);
            },
            banner: (title, sub) => {
              const id = uid++;
              setFx((f) => ({ ...f, banner: { id, title, sub } }));
              setTimeout(() => setFx((f) => (f.banner?.id === id ? { ...f, banner: null } : f)), 3000);
            },
            toast: (text) => {
              const id = uid++;
              setFx((f) => ({ ...f, toasts: [...f.toasts.slice(-2), { id, text }] }));
              setTimeout(() => setFx((f) => ({ ...f, toasts: f.toasts.filter((t) => t.id !== id) })), 2200);
            },
            dead: (s) => {
              setStats(s);
              const prev = loadHi();
              if (s.wave > 0 && (!prev || s.wave > prev.wave || (s.wave === prev.wave && s.kills > prev.kills))) {
                localStorage.setItem(HI_KEY, JSON.stringify({ wave: s.wave, kills: s.kills }));
                setHi({ wave: s.wave, kills: s.kills });
                setNewHi(true);
              } else setNewHi(false);
              setScreen("dead");
              resetInput();
            },
            flash: (color) => {
              const id = uid++;
              setFx((f) => ({ ...f, flash: { id, color } }));
            },
            paused: () => {
              setScreen("paused");
              resetInput();
            },
            quality: (q: Quality) => {
              setSettings((s) => ({ ...s, quality: q }));
              const id = uid++;
              setFx((f) => ({ ...f, toasts: [...f.toasts.slice(-2), { id, text: `Low FPS — graphics set to ${q.toUpperCase()}` }] }));
              setTimeout(() => setFx((f) => ({ ...f, toasts: f.toasts.filter((t) => t.id !== id) })), 2200);
            },
          },
          touchDevice,
          { ...settingsRef.current },
        );
        game.radar = radarEl.current;
        gameRef.current = game;
        game.idle();
        setScreen("menu");
      } catch (e) {
        console.error(e);
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      if (game) {
        game.dispose();
        if (gameRef.current === game) gameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    gameRef.current?.setSettings(settings);
  }, [settings]);

  const goFullscreen = () => {
    if (!touchDevice) return;
    try {
      void document.documentElement.requestFullscreen?.().catch(() => undefined);
      void (screen as unknown as { orientation?: { lock?: (o: string) => Promise<void> } }).orientation?.lock?.("landscape")?.catch(() => undefined);
      void (window.screen.orientation as unknown as { lock?: (o: string) => Promise<void> })?.lock?.("landscape")?.catch(() => undefined);
    } catch {
      /* ignore */
    }
  };

  const play = () => {
    const g = gameRef.current;
    if (!g) return;
    goFullscreen();
    setShowSettings(false);
    setFx(EMPTY_FX);
    setScreen("playing");
    setCoopRoom(null);
    g.start();
  };
  const startCoop = async (mode: "host" | "join") => {
    const g = gameRef.current;
    if (!g || coopBusy) return;
    setCoopErr(null);
    setCoopBusy(true);
    const name = pname.trim() || "Survivor";
    localStorage.setItem(NAME_KEY, name);
    try {
      let code: string;
      let id: string;
      let hostId: string;
      if (mode === "host") {
        const r = await client.rooms.create({ name });
        ({ code, id, hostId } = r as { code: string; id: string; hostId: string });
      } else {
        const r = await client.rooms.join({ code: joinCode.trim().toUpperCase(), name });
        ({ code, id, hostId } = r as { code: string; id: string; hostId: string });
      }
      goFullscreen();
      setShowSettings(false);
      setFx(EMPTY_FX);
      setCoopRoom(code);
      setScreen("playing");
      g.startCoop(mode === "host" ? "host" : "guest", code, id, hostId, name);
      if (mode === "host") {
        const id2 = uid++;
        setFx((f) => ({ ...f, toasts: [...f.toasts.slice(-2), { id: id2, text: `Room ${code} — press Esc to copy the invite link` }] }));
        setTimeout(() => setFx((f) => ({ ...f, toasts: f.toasts.filter((t) => t.id !== id2) })), 5000);
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      setCoopErr(/not.?found|closed/i.test(m) ? "No room with that code." : /full/i.test(m) ? "That room is full." : m || "Couldn't connect. Try again.");
    }
    setCoopBusy(false);
  };
  const inviteLink = coopRoom ? `${window.location.origin}${window.location.pathname}?room=${coopRoom}` : "";
  const copyInvite = () => {
    void navigator.clipboard?.writeText(inviteLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  const resume = () => {
    setShowSettings(false);
    setScreen("playing");
    gameRef.current?.resume();
  };
  const pause = () => gameRef.current?.pause();
  const toMenu = () => {
    setCoopRoom(null);
    gameRef.current?.toMenu();
    gameRef.current?.resetState();
    setShowSettings(false);
    setScreen("menu");
  };

  const playing = screen === "playing";
  const inGame = playing || screen === "paused";
  const acc = stats && stats.shots > 0 ? Math.round((stats.hits / stats.shots) * 100) : 0;

  return (
    <div className="dh-root" onContextMenu={(e) => e.preventDefault()}>
      <canvas ref={canvasRef} className="dh-canvas" />

      {hud && (inGame || screen === "dead") && <Hud h={hud} fx={fx} radarRef={setRadar} touch={touchDevice} />}
      {!hud && <canvas ref={setRadar} className="hidden" width={150} height={150} />}

      {playing && touchDevice && hud && <TouchControls canUse={!!hud.prompt} onPause={pause} grenades={hud.grenades} reloading={hud.weapon.reloading} vehicle={hud.vehicle ? hud.vehicle.kind : null} />}

      {/* loading */}
      {screen === "loading" && (
        <Overlay>
          <div className="dh-disp text-[clamp(40px,8vw,90px)] font-bold leading-none text-[#c8202a]">DeadNight</div>
          {err ? (
            <div className="mt-6 max-w-md text-center text-red-300">Failed to start: {err}</div>
          ) : (
            <>
              <div className="mt-6 h-2 w-[min(70vw,360px)] border border-white/20 bg-black/60">
                <div className="h-full bg-[#c8202a]" style={{ width: `${Math.round(progress * 100)}%`, transition: "width .2s" }} />
              </div>
              <div className="dh-disp mt-3 text-sm tracking-widest text-white/50">LOADING ASSETS</div>
            </>
          )}
        </Overlay>
      )}

      {/* menu */}
      {screen === "menu" && (
        <Overlay bg>
          <div className="dh-fit relative z-10 flex max-h-full flex-col items-center overflow-y-auto px-4 py-6 text-center">
            <div className="dh-disp text-[14px] tracking-[.5em] text-amber-300/80">SURVIVE THE NIGHT</div>
            <h1 className="dh-disp text-[clamp(56px,12vw,150px)] font-bold leading-[.9] text-[#d3252f]" style={{ textShadow: "0 0 40px rgba(200,32,42,.55), 0 6px 0 #000" }}>
              DEADNIGHT
            </h1>
            <p className="mt-3 max-w-xl text-[clamp(15px,2.2vw,20px)] text-white/80">The city fell at dusk. Hold the plaza. Buy weapons, grab perks, burn every wave — and face what comes on wave 5.</p>
            {hi && <div className="dh-disp mt-3 text-[15px] tracking-widest text-amber-200">BEST: WAVE {hi.wave} · {hi.kills} KILLS</div>}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button className="dh-btn" onClick={play}>
                {touchDevice ? "Tap to Play" : "Play"}
              </button>
              <button className="dh-btn ghost" onClick={() => setCoopOpen((v) => !v)}>
                Co-op
              </button>
              <button className="dh-btn ghost" onClick={() => setShowSettings((v) => !v)}>
                Settings
              </button>
            </div>
            {coopOpen && (
              <div className="dh-panel mt-4 flex w-[min(92vw,440px)] flex-col gap-3 p-4 text-left">
                <div className="dh-disp text-amber-300 tracking-widest">CO-OP · UP TO 4 SURVIVORS</div>
                <input
                  value={pname}
                  maxLength={14}
                  onChange={(e) => setPname(e.target.value)}
                  placeholder="Your name"
                  className="border border-white/20 bg-black/60 px-3 py-2 text-[18px] text-white outline-none focus:border-amber-300"
                />
                <div className="flex gap-2">
                  <input
                    value={joinCode}
                    maxLength={6}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="CODE"
                    className="dh-disp w-28 border border-white/20 bg-black/60 px-3 py-2 text-center text-[22px] tracking-[.3em] text-amber-200 outline-none focus:border-amber-300"
                  />
                  <button className="dh-btn flex-1" disabled={coopBusy || joinCode.trim().length < 4} onClick={() => void startCoop("join")}>
                    Join
                  </button>
                </div>
                <button className="dh-btn ghost" disabled={coopBusy} onClick={() => void startCoop("host")}>
                  Host a new game
                </button>
                {coopErr && <div className="text-[15px] text-red-300">{coopErr}</div>}
                <div className="text-[14px] text-white/50">The host runs the zombies. Everyone shares waves; points are your own. Expect a little network lag.</div>
              </div>
            )}
            {showSettings && <SettingsPanel s={settings} set={setSettings} />}
            <Controls touch={touchDevice} />
          </div>
        </Overlay>
      )}

      {/* pause */}
      {screen === "paused" && (
        <Overlay>
          <div className="dh-fit dh-panel flex max-h-full w-[min(92vw,460px)] flex-col items-center gap-3 overflow-y-auto p-6">
            <div className="dh-disp text-[44px] font-bold text-[#d3252f]">Paused</div>
            {coopRoom && (
              <div className="w-full border border-amber-300/30 bg-black/50 p-3 text-center">
                <div className="text-[13px] tracking-widest text-white/50">ROOM CODE</div>
                <div className="dh-disp text-[40px] tracking-[.35em] text-amber-300">{coopRoom}</div>
                <button className="dh-btn ghost mt-1" onClick={copyInvite}>
                  {copied ? "Copied!" : "Copy invite link"}
                </button>
                <div className="mt-1 text-[13px] text-white/50">The game keeps running while you're in this menu.</div>
              </div>
            )}
            <button className="dh-btn" onClick={resume}>
              Resume
            </button>
            <button className="dh-btn ghost" onClick={() => setShowSettings((v) => !v)}>
              Settings
            </button>
            {showSettings && <SettingsPanel s={settings} set={setSettings} />}
            <button className="dh-btn ghost" onClick={toMenu}>
              Quit to menu
            </button>
          </div>
        </Overlay>
      )}

      {/* death */}
      {screen === "dead" && stats && (
        <Overlay tint>
          <div className="dh-fit dh-panel flex max-h-full w-[min(92vw,520px)] flex-col items-center gap-2 overflow-y-auto p-6">
            <div className="dh-disp text-[clamp(40px,8vw,72px)] font-bold leading-none text-[#d3252f]" style={{ textShadow: "0 0 30px rgba(200,32,42,.6)" }}>
              {coopRoom ? "SQUAD WIPED" : "YOU DIED"}
            </div>
            {newHi && <div className="dh-disp text-amber-300">★ NEW BEST ★</div>}
            <div className="mt-2 grid w-full grid-cols-2 gap-x-6 gap-y-1 text-[20px]">
              <Row k="Wave reached" v={String(stats.wave)} />
              <Row k="Kills" v={String(stats.kills)} />
              <Row k="Headshots" v={String(stats.headshots)} />
              <Row k="Accuracy" v={`${acc}%`} />
              <Row k="Points" v={stats.points.toLocaleString()} />
              <Row k="Time" v={`${Math.floor(stats.time / 60)}:${String(Math.floor(stats.time % 60)).padStart(2, "0")}`} />
            </div>
            <div className="mt-4 flex gap-3">
              {!coopRoom && (
                <button className="dh-btn" onClick={play}>
                  Try again
                </button>
              )}
              <button className="dh-btn ghost" onClick={toMenu}>
                Menu
              </button>
            </div>
          </div>
        </Overlay>
      )}

      {/* click-to-resume hint on desktop if lock lost */}
      {portrait && inGame && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 p-8 text-center">
          <div className="dh-disp text-2xl">Rotate your device to landscape</div>
        </div>
      )}
    </div>
  );
}

function Overlay({ children, bg, tint }: { children: React.ReactNode; bg?: boolean; tint?: boolean }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center" style={{ background: bg ? "#0b0709" : tint ? "rgba(60,0,5,.72)" : "rgba(5,3,4,.78)", touchAction: "auto" }}>
      {bg && (
        <>
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url(/game/img/title.jpg)", opacity: 0.75 }} />
          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, rgba(11,7,9,.35) 0%, rgba(11,7,9,.9) 85%)" }} />
        </>
      )}
      <div className="relative flex max-h-full max-w-full flex-col items-center justify-center">{children}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <div className="text-white/60">{k}</div>
      <div className="dh-disp text-right font-bold text-amber-200">{v}</div>
    </>
  );
}

function Controls({ touch }: { touch: boolean }) {
  const rows: [string, string][] = touch
    ? [
        ["Left thumb", "Move (push far to sprint)"],
        ["Right thumb", "Look around"],
        ["FIRE / AIM", "Shoot / toggle aim"],
        ["BUY / USE", "Appears near stalls & machines"],
        ["Top strip", "Tap a weapon to switch"],
      ]
    : [
        ["WASD / Shift / Space", "Move / sprint / jump"],
        ["Mouse · LMB / RMB", "Look · fire / aim"],
        ["R · V · G · F", "Reload · melee · grenade · flashlight"],
        ["E", "Buy / use at stalls & machines"],
        ["1-0 · Wheel · Q", "Switch weapons"],
        ["Esc", "Pause"],
      ];
  return (
    <div className="dh-panel mt-6 grid max-w-[640px] grid-cols-[auto_1fr] gap-x-5 gap-y-1 p-4 text-left text-[16px]">
      {rows.map(([a, b]) => (
        <div key={a} className="contents">
          <div className="dh-disp text-amber-300">{a}</div>
          <div className="text-white/75">{b}</div>
        </div>
      ))}
    </div>
  );
}

function SettingsPanel({ s, set }: { s: Settings; set: React.Dispatch<React.SetStateAction<Settings>> }) {
  const upd = (p: Partial<Settings>) => set((o) => ({ ...o, ...p }));
  return (
    <div className="dh-panel mt-4 flex w-[min(90vw,420px)] flex-col gap-3 p-4 text-left text-[17px]">
      <Slider label="Look sensitivity" v={s.sens} min={0.2} max={3} step={0.05} on={(v) => upd({ sens: v })} />
      <Slider label="Volume" v={s.volume} min={0} max={1} step={0.05} on={(v) => upd({ volume: v })} />
      <Slider label="Field of view" v={s.fov} min={60} max={100} step={1} on={(v) => upd({ fov: v })} />
      <div className="flex items-center justify-between">
        <span>Graphics</span>
        <div className="flex gap-1">
          {(["low", "med", "high"] as Quality[]).map((q) => (
            <button key={q} onClick={() => upd({ quality: q })} className={`dh-disp px-3 py-1 text-sm ${s.quality === q ? "bg-[#c8202a] text-white" : "bg-white/10 text-white/70"}`}>
              {q}
            </button>
          ))}
        </div>
      </div>
      <label className="flex items-center justify-between">
        <span>Invert Y</span>
        <input type="checkbox" checked={s.invertY} onChange={(e) => upd({ invertY: e.target.checked })} className="h-5 w-5 accent-[#c8202a]" />
      </label>
    </div>
  );
}

function Slider({ label, v, min, max, step, on }: { label: string; v: number; min: number; max: number; step: number; on: (v: number) => void }) {
  return (
    <label className="block">
      <div className="flex justify-between">
        <span>{label}</span>
        <span className="text-amber-200">{step < 1 ? v.toFixed(2) : v}</span>
      </div>
      <input type="range" className="dh-range" min={min} max={max} step={step} value={v} onChange={(e) => on(parseFloat(e.target.value))} />
    </label>
  );
}

