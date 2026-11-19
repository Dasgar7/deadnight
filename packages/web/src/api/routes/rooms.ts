import { ORPCError } from "@orpc/server";
import { createClient, type InStatement } from "@libsql/client/web";
import { z } from "zod";
import { base } from "../__core/app";

/**
 * Co-op rooms. Host-authoritative: the host's browser runs the zombie sim and posts snapshots; guests post their own
 * state + hit events. Everything is polled over oRPC (no WebSocket upgrade on serverless). State lives in the libSQL
 * database (DATABASE_URL) so every serverless instance sees the same rooms.
 */

const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
const db = createClient({ url: env.DATABASE_URL!, authToken: env.DATABASE_AUTH_TOKEN });

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TIMEOUT = 9000;
const MAX_PLAYERS = 4;
const HITS = "#hits";

let ready: Promise<unknown> | null = null;
function init() {
  return (ready ??= db
    .batch(
      [
        "CREATE TABLE IF NOT EXISTS dn_rooms (code TEXT PRIMARY KEY, host_id TEXT NOT NULL, zs TEXT NOT NULL DEFAULT '[]', world TEXT, seq INTEGER NOT NULL DEFAULT 0, over INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL)",
        "CREATE TABLE IF NOT EXISTS dn_players (room TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, color INTEGER NOT NULL, me TEXT NOT NULL DEFAULT '{}', last_seen INTEGER NOT NULL, joined INTEGER NOT NULL, PRIMARY KEY (room, id))",
        "CREATE TABLE IF NOT EXISTS dn_events (n INTEGER PRIMARY KEY AUTOINCREMENT, room TEXT NOT NULL, target TEXT NOT NULL, body TEXT NOT NULL)",
        "CREATE INDEX IF NOT EXISTS dn_events_rt ON dn_events (room, target)",
      ],
      "write",
    )
    .catch((e) => {
      ready = null;
      throw e;
    }));
}

const uid = () => Math.random().toString(36).slice(2, 10);
const cleanName = (s: string) => s.replace(/[^\w \-.]/g, "").trim().slice(0, 14) || "Survivor";
const parse = (s: unknown): unknown => {
  try {
    return JSON.parse(String(s));
  } catch {
    return null;
  }
};

/** Drop timed-out players, rooms whose host is gone, and their queued events. */
function sweepStmts(now: number): InStatement[] {
  return [
    { sql: "DELETE FROM dn_players WHERE last_seen < ?", args: [now - TIMEOUT] },
    { sql: "DELETE FROM dn_rooms WHERE NOT EXISTS (SELECT 1 FROM dn_players p WHERE p.room = dn_rooms.code AND p.id = dn_rooms.host_id)", args: [] },
    { sql: "DELETE FROM dn_players WHERE NOT EXISTS (SELECT 1 FROM dn_rooms r WHERE r.code = dn_players.room)", args: [] },
    { sql: "DELETE FROM dn_events WHERE NOT EXISTS (SELECT 1 FROM dn_rooms r WHERE r.code = dn_events.room)", args: [] },
  ];
}

const IS_HOST = "EXISTS (SELECT 1 FROM dn_rooms WHERE code = ? AND host_id = ?)";

export const roomsApi = {
  create: base.input(z.object({ name: z.string().max(40) })).handler(async ({ input }) => {
    await init();
    const now = Date.now();
    await db.batch(sweepStmts(now), "write");
    let code = "";
    for (let n = 0; n < 50 && !code; n++) {
      let c = "";
      for (let i = 0; i < 4; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
      const r = await db.execute({ sql: "SELECT 1 FROM dn_rooms WHERE code = ?", args: [c] });
      if (!r.rows.length) code = c;
    }
    if (!code) code = Math.random().toString(36).slice(2, 7).toUpperCase();
    const id = uid();
    await db.batch(
      [
        { sql: "INSERT INTO dn_rooms (code, host_id, created) VALUES (?, ?, ?)", args: [code, id, now] },
        { sql: "INSERT INTO dn_players (room, id, name, color, last_seen, joined) VALUES (?, ?, ?, 0, ?, ?)", args: [code, id, cleanName(input.name), now, now] },
      ],
      "write",
    );
    return { code, id, hostId: id };
  }),

  join: base.input(z.object({ code: z.string().max(10), name: z.string().max(40) })).handler(async ({ input }) => {
    await init();
    const now = Date.now();
    const code = input.code.trim().toUpperCase();
    await db.batch(sweepStmts(now), "write");
    const [room, players] = await db.batch(
      [
        { sql: "SELECT host_id FROM dn_rooms WHERE code = ?", args: [code] },
        { sql: "SELECT name, color FROM dn_players WHERE room = ?", args: [code] },
      ],
      "read",
    );
    if (!room!.rows.length) throw new ORPCError("NOT_FOUND", { message: "No room with that code" });
    if (players!.rows.length >= MAX_PLAYERS) throw new ORPCError("BAD_REQUEST", { message: "Room is full (4 players)" });
    const used = new Set(players!.rows.map((r) => Number(r.color)));
    let color = 0;
    while (used.has(color)) color++;
    let name = cleanName(input.name);
    if (players!.rows.some((r) => r.name === name)) name = `${name.slice(0, 11)}-${color + 1}`;
    const id = uid();
    await db.execute({
      sql: "INSERT INTO dn_players (room, id, name, color, last_seen, joined) VALUES (?, ?, ?, ?, ?, ?)",
      args: [code, id, name, color, now, now],
    });
    return { code, id, hostId: String(room!.rows[0]!.host_id), name };
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
    .handler(async ({ input }) => {
      await init();
      const now = Date.now();
      const { code, id } = input;
      const s: InStatement[] = [];
      // 0: heartbeat (+ own state) — also tells us whether this player still exists
      s.push({ sql: "UPDATE dn_players SET last_seen = ?, me = COALESCE(?, me) WHERE room = ? AND id = ?", args: [now, input.me ? JSON.stringify(input.me) : null, code, id] });
      // 1: host-only world write, guarded by host_id
      s.push({
        sql: "UPDATE dn_rooms SET zs = COALESCE(?, zs), world = COALESCE(?, world), over = over | ?, seq = seq + 1 WHERE code = ? AND host_id = ?",
        args: [input.zs ? JSON.stringify(input.zs) : null, input.world ? JSON.stringify(input.world) : null, input.over ? 1 : 0, code, id],
      });
      for (const e of input.ev ?? []) {
        const body = JSON.stringify(e);
        const to = (e as { to?: string }).to;
        // host → one player, or everyone else
        if (to) s.push({ sql: `INSERT INTO dn_events (room, target, body) SELECT ?, id, ? FROM dn_players WHERE room = ? AND id = ? AND ${IS_HOST}`, args: [code, body, code, to, code, id] });
        else s.push({ sql: `INSERT INTO dn_events (room, target, body) SELECT ?, id, ? FROM dn_players WHERE room = ? AND id <> ? AND ${IS_HOST}`, args: [code, body, code, id, code, id] });
        // guest → host
        s.push({ sql: "INSERT INTO dn_events (room, target, body) SELECT ?, host_id, ? FROM dn_rooms WHERE code = ? AND host_id <> ?", args: [code, JSON.stringify({ ...(e as object), by: id }), code, id] });
      }
      for (const h of input.hits ?? []) {
        s.push({ sql: "INSERT INTO dn_events (room, target, body) SELECT ?, ?, ? FROM dn_rooms WHERE code = ? AND host_id <> ?", args: [code, HITS, JSON.stringify({ ...(h as object), by: id }), code, id] });
      }
      s.push(...sweepStmts(now));
      const iPlayers = s.length;
      s.push({ sql: "SELECT id, name, color, me FROM dn_players WHERE room = ? ORDER BY joined", args: [code] });
      const iRoom = s.length;
      s.push({ sql: "SELECT host_id, seq, over, zs, world FROM dn_rooms WHERE code = ?", args: [code] });
      const iEv = s.length;
      s.push({ sql: "DELETE FROM dn_events WHERE room = ? AND target = ? RETURNING body", args: [code, id] });
      s.push({ sql: `DELETE FROM dn_events WHERE room = ? AND target = ? AND ${IS_HOST} RETURNING body`, args: [code, HITS, code, id] });

      const res = await db.batch(s, "write");
      const players = res[iPlayers]!.rows;
      const room = res[iRoom]!.rows[0];
      if (!room || !players.some((p) => p.id === id)) return { closed: true as const };
      const hostId = String(room.host_id);
      const isHost = id === hostId;
      const events = res[iEv]!.rows.map((r) => parse(r.body));
      const out: {
        closed: false;
        hostId: string;
        seq: number;
        t: number;
        over: boolean;
        players: { id: string; name: string; color: number; me: unknown }[];
        events: unknown[];
        zs?: unknown;
        world?: unknown;
        hits?: unknown[];
      } = {
        closed: false,
        hostId,
        seq: Number(room.seq),
        t: now,
        over: Number(room.over) > 0,
        players: players.filter((p) => p.id !== id).map((p) => ({ id: String(p.id), name: String(p.name), color: Number(p.color), me: parse(p.me) ?? {} })),
        events,
      };
      if (isHost) out.hits = res[iEv + 1]!.rows.map((r) => parse(r.body));
      else {
        out.zs = parse(room.zs) ?? [];
        out.world = room.world ? parse(room.world) : null;
      }
      return out;
    }),

  leave: base.input(z.object({ code: z.string().max(10), id: z.string().max(20) })).handler(async ({ input }) => {
    await init();
    await db.batch([{ sql: "DELETE FROM dn_players WHERE room = ? AND id = ?", args: [input.code, input.id] }, ...sweepStmts(Date.now())], "write");
    return { ok: true };
  }),
};
