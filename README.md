# DeadNight

A browser 3D zombie survival game — Three.js, no engine. First/third/front-facing camera, 20+ guns and melee weapons, vehicles (car, jeep, tank, helicopter), ragdoll physics, wave-based zombies, and 2–4 player online co-op.

## Play
Open the deployed site and hit **Play** (desktop: WASD + mouse, mobile: touch controls). Co-op: menu → Co-op → share the room link.

## Develop
```
bun install
bun run dev        # http://localhost:4200
bun run build:web  # -> packages/web/dist
```

- Game code: `packages/web/src/web/game/`
- UI: `packages/web/src/web/ui/`, `packages/web/src/web/pages/`
- Co-op API (oRPC over Hono): `packages/web/src/api/routes/rooms.ts`
- Assets (audio / textures): `packages/web/public/game/`
- Vercel: `vercel.json` + `api/[...path].ts` (edge function)

Co-op rooms are held in memory on the API instance, so they are best-effort on serverless hosting.
