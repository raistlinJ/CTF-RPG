import { env } from "cloudflare:workers";
import { createApi } from "../server/api.mjs";
import { gameConfig } from "./game-config";
import { challenges } from "./challenges";
export function handle(req: Request) {
  return createApi({
    db: (env as unknown as { DB: D1Database }).DB,
    config: gameConfig,
    challenges,
    secureCookies: new URL(req.url).protocol === "https:",
  })(req);
}
