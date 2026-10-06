import { zipSync, unzipSync, strToU8 } from "fflate";
import { stringify } from "yaml";
import { z } from "zod";
import { parseGame, parseChallenges } from "../lib/config-schema.mjs";
import { configuredCredentials, effectiveAccount } from "./passwords.mjs";
import { kitBase64 } from "./recreation-kit.mjs";
const account = z
  .object({
    id: z.string().min(1).max(128),
    username: z.string().regex(/^[a-z0-9_-]{3,24}$/),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    salt: z.string().min(1).max(128),
    hero: z.string(),
    role: z.enum(["student", "admin"]),
    disabled: z.number().int().min(0).max(1),
    managed: z.number().int().min(0).max(1),
    provisioned: z.number().int().min(0).max(1),
    revision: z.number().int().min(0),
  })
  .strict();
const completion = z
  .object({
    user: z.string(),
    challenge: z.string(),
    points: z.number().int().min(0).max(10000),
  })
  .strict();
const purchase = z
  .object({
    user: z.string(),
    challenge: z.string(),
    hint: z.string(),
    cost: z.number().int().min(0).max(10000),
  })
  .strict();
export function validateSnapshot(input) {
  const snapshot = z
    .object({
      format: z.literal("north-pole-quest"),
      version: z.literal(1),
      createdAt: z.string().datetime(),
      config: z.unknown(),
      challenges: z.array(z.unknown()).max(100),
      accounts: z.array(account).max(10000),
      solved: z.array(completion).max(1000000),
      purchasedHints: z.array(purchase).max(1000000),
    })
    .strict()
    .parse(input);
  snapshot.config = parseGame(stringify(snapshot.config));
  snapshot.challenges = parseChallenges(
    stringify({ challenges: snapshot.challenges }),
  );
  const ids = new Set(snapshot.accounts.map((a) => a.id));
  if (
    ids.size !== snapshot.accounts.length ||
    new Set(snapshot.accounts.map((a) => a.username)).size !==
      snapshot.accounts.length
  )
    throw Error("Duplicate accounts in backup.");
  for (const a of snapshot.accounts)
    if (!snapshot.config.characters.some((c) => c.id === a.hero))
      throw Error("Backup contains an unknown hero.");
  for (const records of [snapshot.solved, snapshot.purchasedHints])
    for (const r of records)
      if (!ids.has(r.user))
        throw Error("Backup progress refers to an unknown account.");
  if (
    new Set(snapshot.solved.map((r) => `${r.user}\0${r.challenge}`)).size !==
      snapshot.solved.length ||
    new Set(
      snapshot.purchasedHints.map(
        (r) => `${r.user}\0${r.challenge}\0${r.hint}`,
      ),
    ).size !== snapshot.purchasedHints.length
  )
    throw Error("Duplicate progress in backup.");
  return snapshot;
}
export async function createSnapshot({ db, config, challenges }) {
  const [users, catalog, solved, hints] = await db.batch([
    db.prepare("SELECT * FROM students ORDER BY username").bind(),
    db
      .prepare(
        "SELECT payload,revision FROM challenge_catalog WHERE id='active'",
      )
      .bind(),
    db
      .prepare(
        "SELECT user,challenge,points FROM solved ORDER BY user,challenge",
      )
      .bind(),
    db
      .prepare(
        "SELECT user,challenge,hint,cost FROM purchased_hints ORDER BY user,challenge,hint",
      )
      .bind(),
  ]);
  const records = [];
  for (const row of users.results) {
    const cfg = config.accounts.users.find((a) => a.username === row.username),
      effective = effectiveAccount(row, cfg, config);
    const credentials =
      !row.managed && cfg
        ? await configuredCredentials(cfg, row)
        : { hash: row.hash, salt: row.salt };
    records.push({
      id: row.id,
      username: row.username,
      hash: credentials.hash,
      salt: credentials.salt,
      hero: effective.hero,
      role: effective.role,
      disabled: row.disabled || 0,
      managed: row.managed || 0,
      provisioned: row.provisioned || 0,
      revision: row.revision || 0,
    });
  }
  for (const cfg of config.accounts.users)
    if (!records.some((a) => a.username === cfg.username)) {
      const credentials = await configuredCredentials(cfg, null);
      records.push({
        id: crypto.randomUUID(),
        username: cfg.username,
        hash: credentials.hash,
        salt: credentials.salt,
        hero: cfg.hero || config.characters[0].id,
        role: cfg.role || "student",
        disabled: 0,
        managed: 0,
        provisioned: 0,
        revision: 0,
      });
    }
  const exportConfig = JSON.parse(JSON.stringify(config));
  exportConfig.accounts.users = config.accounts.users.map((cfg) => {
    const a = records.find((a) => a.username === cfg.username);
    return {
      username: a.username,
      passwordHash: a.hash,
      salt: a.salt,
      hero: a.hero,
      role: a.role,
    };
  });
  return validateSnapshot({
    format: "north-pole-quest",
    version: 1,
    createdAt: new Date().toISOString(),
    config: exportConfig,
    challenges: catalog.results[0]
      ? JSON.parse(catalog.results[0].payload)
      : challenges,
    accounts: records,
    solved: solved.results,
    purchasedHints: hints.results,
  });
}
export async function exportFullBackup(state, assets = {}) {
  const snapshot = await createSnapshot(state),
    bytes = Uint8Array.from(atob(kitBase64), (c) => c.charCodeAt(0));
  const entries = unzipSync(bytes);
  Object.assign(entries, assets);
  entries["backup.json"] = strToU8(JSON.stringify(snapshot, null, 2));
  entries["content/game.yaml"] = strToU8(stringify(snapshot.config));
  entries["content/challenges.yaml"] = strToU8(
    stringify({ challenges: snapshot.challenges }),
  );
  // Include the server-only seed kit, enabling backups after this application is recreated.
  entries["server/recreation-kit.mjs"] = strToU8(
    `export const kitBase64=${JSON.stringify(kitBase64)};\n`,
  );
  entries[".openai/hosting.json"] = strToU8(
    JSON.stringify({ d1: "DB", r2: null }, null, 2),
  );
  entries["RESTORE.md"] = strToU8(
    `North Pole Quest complete backup\n\n1. Extract this ZIP into a new directory.\n2. Install Node.js 24 and run npm ci.\n3. Run npm run restore -- backup.json.\n4. Run npm run start:selfhost and open http://localhost:3000.\n\nThe ready-built frontend is included. You can also modify the included source and run npm run build:selfhost.\nAccounts retain their passwords through salted hashes. Active sessions are excluded.\nIf the original site used only platform-owner administration, promote a restored player with npm run restore -- backup.json --admin USERNAME on the initial restore, or add a new role: admin account to content/game.yaml before starting.\nLocal assets are included; external file URLs continue to depend on their external hosts.\nKeep this ZIP private: it contains password hashes, flags, and student progress.\nSee BACKUPS.md and ADMIN_GUIDE.md for details.\n`,
  );
  const size = Object.values(entries).reduce((s, b) => s + b.length, 0);
  if (size > 32 * 1024 * 1024)
    throw Error("The backup exceeds the 32 MB packaging limit.");
  const archive = zipSync(entries, { level: 6 });
  return new Response(archive, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="north-pole-backup-${snapshot.createdAt.slice(0, 10)}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
