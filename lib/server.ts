import { exportFullBackup } from "../server/backup.mjs";
import { env } from "cloudflare:workers";
import { createApi } from "../server/api.mjs";
import { gameConfig } from "./game-config";
import { challenges } from "./challenges";
export function handle(req: Request) {
  return createApi({
    db: (env as unknown as { DB: D1Database }).DB,
    config: gameConfig,
    challenges,
    exportBackup: exportFullBackup,
    assetStore: {
      async get(key: string) {
        const object = await (
          env as unknown as { ASSETS: R2Bucket }
        ).ASSETS.get(key);
        return object ? new Uint8Array(await object.arrayBuffer()) : null;
      },
      async put(key: string, bytes: Uint8Array, type: string) {
        await (env as unknown as { ASSETS: R2Bucket }).ASSETS.put(key, bytes, {
          httpMetadata: { contentType: type },
        });
      },
    },
    platformAdmin: gameConfig.admin.platformEmails.includes(
      (req.headers.get("oai-authenticated-user-email") || "").toLowerCase(),
    ),
    secureCookies: new URL(req.url).protocol === "https:",
  })(req);
}
