# DeadNight — Design

A first-person 3D zombie survival shooter for the browser (desktop keyboard/mouse + mobile touch). Dark horror, ruined city at dusk, blood-red and amber accents. Core job: instant, immersive wave survival with a points economy, 11 weapons, perks, 6 zombie types and a boss.

## Brand & Colors
Dark-only. CSS variables in `packages/web/src/web/styles.css`.

| Token | Value | Use |
|-------|-------|-----|
| background | #0b0709 | Page |
| card | #150d10 | Panels |
| primary | #c8202a | Blood red, CTAs, health |
| accent | #f2a21e | Amber: points, ammo, highlights |
| foreground | #f1e8e4 | Text |
| muted | #8d7f7c | Secondary text |
| good | #3ad06a | Medkit / afford |

## Typography
Display: **Oswald** 500/700 (uppercase, tracked). Body/HUD: **Barlow Condensed** 400/600. Self-hosted in `public/fonts/`.

## Pages & Screens
- `/` single page: loading → main menu (title art, Play, controls) → HUD → pause (settings) → death (stats, high score).
- HUD: health/armor bars, ammo + weapon icon, weapon slots, points, wave, radar, crosshair, hit markers, damage indicators, prompts, boss bar. Mobile: virtual joystick, look-drag, action buttons.

## DeadNight update
- Co-op (up to 4): host-authoritative, oRPC polling (`api/routes/rooms.ts`, `game/net.ts`). Invite link `?room=CODE`.
- Vehicles: muscle car, jeep (MG), tank, attack heli. Camera cycle on C: first, third (over-shoulder), second (front-facing).
- Zombies: merged vertex-coloured rigs per type, 3 death styles, type-specific vocalisations.
