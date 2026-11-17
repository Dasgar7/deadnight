import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { base } from "../__core/app";

/**
 * Co-op rooms. Host-authoritative: the host's browser runs the zombie sim and posts snapshots; guests post their own
 * state + hit events. Everything is polled over oRPC (the dev server has no WebSocket upgrade), state lives in memory.
 */

interface PlayerState {
  id: string;
  name: string;
  me: Record<string, unknown>;
  lastSeen: number;
  joined: number;
  color: number;
  events: unknown[];
}
interface Room {
  code: string;
  hostId: string;
  players: Map<string, PlayerState>;
  zs: unknown[];
  world: Record<string, unknown> | null;
  hostQueue: unknown[]; // hit events from guests, drained by the host
  seq: number;
  created: number;
  over: boolean;
}

const g = globalThis as unknown as { __dnRooms?: Map<string, Room> };
const rooms = (g.__dnRooms ??= new Map<string, Room>());

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TIMEOUT = 9000;
const MAX_PLAYERS = 4;

function makeCode() {
  for (let n = 0; n < 50; n++) {
    let c = "";
    for (let i = 0; i < 4; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    if (!rooms.has(c)) return c;
  }
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}
const uid = () => Math.random().toString(36).slice(2, 10);
const cleanName = (s: string) => s.replace(/[^\w \-.]/g, "").trim().slice(0, 14) || "Survivor";

function sweep() {
  const now = Date.now();
  for (const [code, r] of rooms) {
    for (const [id, p] of r.players) if (now - p.lastSeen > TIMEOUT) r.players.delete(id);
    const host = r.players.get(r.hostId);
    if (!host || r.players.size === 0) {
      // host gone: keep the room visible for a moment so guests can see "closed", then drop
      if (now - r.created > 60000 || r.players.size === 0) rooms.delete(code);
    }
  }
}

function playersOut(r: Room) {
  return [...r.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, me: p.me }));
}

export const roomsApi = {
  create: base.input(z.object({ name: z.string().max(40) })).handler(({ input }) => {
    sweep();
    const code = makeCode();
    const id = uid();
    const now = Date.now();
    const r: Room = { code, hostId: id, players: new Map(), zs: [], world: null, hostQueue: [], seq: 0, created: now, over: false };
    r.players.set(id, { id, name: cleanName(input.name), me: {}, lastSeen: now, joined: now, color: 0, events: [] });
    rooms.set(code, r);
    return { code, id, hostId: id };
  }),

  join: base.input(z.object({ code: z.string().max(10), name: z.string().max(40) })).handler(({ input }) => {
    sweep();
    const r = rooms.get(input.code.trim().toUpperCase());
    if (!r || !r.players.has(r.hostId)) throw new ORPCError("NOT_FOUND", { message: "No room with that code" });
    if (r.players.size >= MAX_PLAYERS) throw new ORPCError("BAD_REQUEST", { message: "Room is full (4 players)" });
    const id = uid();
    const now = Date.now();
    const used = new Set([...r.players.values()].map((p) => p.color));
    let color = 0;
    while (used.has(color)) color++;
    let name = cleanName(input.name);
    const names = new Set([...r.players.values()].map((p) => p.name));
    if (names.has(name)) name = `${name.slice(0, 11)}-${color + 1}`;
    r.players.set(id, { id, name, me: {}, lastSeen: now, joined: now, color, events: [] });
    return { code: r.code, id, hostId: r.hostId, name };
  }),

  sync: base
    .input(
      z.object({
        code: z.string().max(10),
        id: z.string().max(20),
        me: z.any().optional(),
        zs: z.array(z.any()).max(200).optional(),
        world: z.any().optional(),
        hits: z.array(z.any()).max(120).optional(),
        ev: z.array(z.any()).max(80).optional(),
        over: z.boolean().optional(),
      }),
    )
    .handler(({ input }) => {
      const r = rooms.get(input.code);
      const p = r?.players.get(input.id);
      if (!r || !p) return { closed: true as const };
      const now = Date.now();
      p.lastSeen = now;
      if (input.me) p.me = input.me as Record<string, unknown>;
      const isHost = input.id === r.hostId;
      if (isHost) {
        if (input.zs) r.zs = input.zs;
        if (input.world) r.world = input.world as Record<string, unknown>;
        if (input.over) r.over = true;
        r.seq++;
        for (const e of input.ev ?? []) {
          const ev = e as { to?: string };
          if (ev.to) r.players.get(ev.to)?.events.push(e);
          else for (const q of r.players.values()) if (q.id !== r.hostId) q.events.push(e);
        }
      } else {
        if (input.hits?.length) {
          for (const h of input.hits) r.hostQueue.push({ ...(h as object), by: input.id });
          if (r.hostQueue.length > 600) r.hostQueue.splice(0, r.hostQueue.length - 600);
        }
        for (const e of input.ev ?? []) (r.players.get(r.hostId)?.events ?? []).push({ ...(e as object), by: input.id });
      }
      sweep();
      if (!r.players.has(r.hostId)) return { closed: true as const };
      const events = p.events.splice(0, p.events.length);
      const out: {
        closed: false;
        hostId: string;
        seq: number;
        t: number;
        over: boolean;
        players: ReturnType<typeof playersOut>;
        events: unknown[];
        zs?: unknown[];
        world?: Record<string, unknown> | null;
        hits?: unknown[];
      } = { closed: false, hostId: r.hostId, seq: r.seq, t: now, over: r.over, players: playersOut(r).filter((q) => q.id !== input.id), events };
      if (isHost) out.hits = r.hostQueue.splice(0, r.hostQueue.length);
      else {
        out.zs = r.zs;
        out.world = r.world;
      }
      return out;
    }),

  leave: base.input(z.object({ code: z.string().max(10), id: z.string().max(20) })).handler(({ input }) => {
    const r = rooms.get(input.code);
    if (!r) return { ok: true };
    r.players.delete(input.id);
    if (input.id === r.hostId || r.players.size === 0) rooms.delete(input.code);
    return { ok: true };
  }),
};
