import { exportFullBackup } from "../server/backup.mjs";
import { env } from "cloudflare:workers";
import { createApi } from "../server/api.mjs";
import { runtimeConfig } from "./runtime-config.mjs";
import { ensureStartupAdmin } from "../server/protected-admin.mjs";
import { challenges } from "./challenges";
const bootstraps = new WeakMap<object, Map<string, Promise<void>>>();
export async function handle(req: Request) {
  const environment = env as unknown as { DB: D1Database; ADMIN_USERNAME?: string; ADMIN_PASSWORD?: string };
  const config = runtimeConfig(environment);
  let accounts = bootstraps.get(environment.DB);
  if (!accounts) { accounts = new Map(); bootstraps.set(environment.DB, accounts); }
  const name = config.admin.protectedUsername!; // runtimeConfig validates this name.
  let bootstrap = accounts.get(name);
  if (!bootstrap) {
    bootstrap = ensureStartupAdmin(environment.DB, config, environment.ADMIN_PASSWORD)
      .catch((error: unknown) => { accounts!.delete(name); throw error; });
    accounts.set(name, bootstrap);
  }
  await bootstrap;
  return createApi({
    db: (env as unknown as { DB: D1Database }).DB,
    config,
    challenges,
    exportBackup: exportFullBackup,
    assetStore: {
      async get(key: string) {
        const object = await (
          env as unknown as { QUEST_FILES: R2Bucket }
        ).QUEST_FILES.get(key);
        return object ? new Uint8Array(await object.arrayBuffer()) : null;
      },
      async put(key: string, bytes: Uint8Array, type: string) {
        await (env as unknown as { QUEST_FILES: R2Bucket }).QUEST_FILES.put(key, bytes, {
          httpMetadata: { contentType: type },
        });
      },
    },
    secureCookies: new URL(req.url).protocol === "https:",
  })(req);
}
