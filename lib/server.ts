import { exportFullBackup } from "../server/backup.mjs";
import { env } from "cloudflare:workers";
import { createApi } from "../server/api.mjs";
import { runtimeConfig } from "./runtime-config.mjs";
import { ensureStartupAdmin } from "../server/protected-admin.mjs";
import { challenges } from "./challenges";
type PerformanceDB = Pick<D1Database, "prepare" | "batch"> & {capabilities:{notificationRevisions:boolean;chatSearch:boolean}};
const databaseAdapters = new WeakMap<D1Database, Promise<PerformanceDB>>();
function performanceDatabase(db:D1Database) {
  let adapter=databaseAdapters.get(db);
  if(!adapter) {
    adapter=db.prepare("SELECT name FROM sqlite_master WHERE name='social_revisions'").first().then(row=>({
      prepare:db.prepare.bind(db),batch:db.batch.bind(db),
      capabilities:{notificationRevisions:!!row,chatSearch:false},
    }));
    databaseAdapters.set(db,adapter);
    adapter.catch(()=>databaseAdapters.delete(db));
  }
  return adapter;
}
const runtimeConfigs = new Map<string, ReturnType<typeof runtimeConfig>>();
const bootstraps = new WeakMap<object, Map<string, Promise<void>>>();
export async function handle(req: Request) {
  const environment = env as unknown as { DB: D1Database; ADMIN_USERNAME?: string; ADMIN_PASSWORD?: string };
  const configKey = environment.ADMIN_USERNAME || '';
  let config = runtimeConfigs.get(configKey);
  if (!config) {
    config = runtimeConfig(environment);
    if(runtimeConfigs.size>=16)runtimeConfigs.delete(runtimeConfigs.keys().next().value!);
    runtimeConfigs.set(configKey,config);
  }
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
    db: await performanceDatabase(environment.DB),
    config,
    challenges,
    exportBackup: exportFullBackup,
    assetStore: {
      async stat(key: string) {
        const object = await (env as unknown as { QUEST_FILES: R2Bucket }).QUEST_FILES.head(key);
        return object ? {size:object.size} : null;
      },
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
