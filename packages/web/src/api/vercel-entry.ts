// Entry bundled into /api/index.js for Vercel (see `bun run build:api`).
import app from "./index";

export default { fetch: (req: Request) => app.fetch(req) };
