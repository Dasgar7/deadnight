// Vercel serverless entry: serves the Hono/oRPC app (co-op rooms etc.) at /api/*.
import { handle } from "hono/vercel";
import app from "../packages/web/src/api/index";

export const config = { runtime: "edge" };

export default handle(app);
