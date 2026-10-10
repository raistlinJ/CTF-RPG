import { validateProgressionDependencies } from "../lib/challenge-dependencies.mjs";
import { pointAwardSchema } from "./team-points.mjs";
import { rewardsSchema } from "../lib/inventory.mjs";
import { challengeSettings } from "./challenge-visibility.mjs";
// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import { scoreboardSettings } from "./social-controls.mjs";
import { teamFeatures } from "./team-social.mjs";
import { presenceSettings } from "./presence.mjs";
import { spawnSchema } from "../lib/spawn.mjs";
import { activeTheme, readAsset, contentPaths } from "./packs.mjs";
import { parseTheme, defaultTheme, themeAssetPaths } from "../lib/theme-schema.mjs";
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
    spawn: spawnSchema.nullable().default(null),
    role: z.enum(["student", "admin"]),
    muted: z.number().int().min(0).max(1).default(0),
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
    rewardCost: rewardsSchema.default({keys:[],incantations:[]}),
  })
  .strict();
export function validateSnapshot(input) {
  const snapshot = z
    .object({
      format: z.literal("north-pole-quest"),
      version: z.literal(1),
      createdAt: z.string().datetime(),
      config: z.unknown(),
      theme: z.unknown().optional(),
      challenges: z.array(z.unknown()).max(100),
      accounts: z.array(account).max(10000),
      deletedAccounts: z.array(z.object({username:z.string().regex(/^[a-z0-9_-]{3,24}$/), deleted_at:z.number().int().min(0)}).strict()).max(100000).default([]),
      teams: z
        .array(
          z
            .object({
              id: z.string().min(1),
              name: z.string().min(1).max(48),
              name_key: z.string().min(1),
              hash: z.string().regex(/^[a-f0-9]{64}$/),
              salt: z.string().min(1),
            })
            .strict(),
        )
        .max(10000)
        .default([]),
      teamPointAwards: z.array(pointAwardSchema).max(100000).default([]),
      teamMembers: z
        .array(z.object({ user: z.string(), team: z.string() }).strict())
        .max(10000)
        .default([]),
      teamFeatures: z
        .object({
          names: z.boolean(),
          scores: z.boolean(),
          messaging: z.boolean(),
          everyone: z
            .object({
              names: z.boolean(),
              scores: z.boolean(),
              messaging: z.boolean(),
            })
            .strict()
            .optional(),
        })
        .strict()
        .optional(),
      teamMessages: z
        .array(
          z
            .object({
              id: z.string().min(1).max(128),
              sender_user: z.string().nullable(),
              sender_team: z.string().nullable(),
              recipient_team: z.string(),
              sender: z.string().min(1).max(80),
              text: z.string().min(1).max(1000),
              created_at: z.number().int().min(0),
            })
            .strict(),
        )
        .max(100000)
        .default([]),
      instructorMessages: z
        .array(
          z
            .object({
              id: z.string().min(1).max(128),
              sender_user: z.string(),
              team: z.string(),
              sender: z.string().min(1).max(80),
              text: z.string().min(1).max(1000),
              created_at: z.number().int().min(0),
            })
            .strict(),
        )
        .max(100000)
        .default([]),
      challengeSettings: z.object({visibility:z.enum(["admins","all"]),revision:z.number().int().min(0)}).strict().optional(),
      scoreboardSettings: z
        .object({
          visibility: z.enum(["admins", "all"]),
          mode: z.enum(["team", "individual"]),
          revision: z.number().int().min(0),
        })
        .strict()
        .optional(),
      playerVisibility: z.enum(["off", "team", "all"]).optional(),
      teamMaxMembers: z.number().int().min(1).max(100).optional(),
      discoveries: z
        .array(z.object({ user: z.string(), challenge: z.string() }).strict())
        .max(1000000)
        .default([]),
      solved: z.array(completion).max(1000000),
      cutscenes: z.array(z.object({user:z.string(),challenge:z.string(),phase:z.enum(["discovery","solve"])}).strict()).max(2000000).default([]),
      earnedRewards: z.array(z.object({user:z.string(),challenge:z.string(),rewards:rewardsSchema}).strict()).max(1000000).default([]),
      unlockedTransports: z.array(z.object({user:z.string(),transport:z.string(),signature:z.string().max(1000)}).strict()).max(1000000).default([]),
      purchasedHints: z.array(purchase).max(1000000),
      notifications: z.array(z.object({id:z.string(),title:z.string().min(1).max(120),body:z.string().min(1).max(5000),author:z.string(),scope:z.enum(["all","users","teams"]),targets:z.string(),created_at:z.number().int().min(0)}).strict()).max(100000).default([]),
      notificationRecipients: z.array(z.object({notification:z.string(),username:z.string()}).strict()).max(1000000).default([]),
      notificationReads: z.array(z.object({notification:z.string(),user:z.string(),read_at:z.number().int().min(0)}).strict()).max(1000000).default([]),
      ctfdImports: z.array(z.object({id:z.string(),digest:z.string().regex(/^[a-f0-9]{64}$/),created_at:z.number().int().min(0),report:z.string().max(4000000)}).strict()).max(10000).default([]),
      answerAttempts: z.array(z.object({id:z.string().min(1).max(128),user:z.string(),challenge:z.string(),answer:z.string().max(500),question:z.string().min(1).max(20000),object:z.string(),correct:z.number().int().min(0).max(1),submitted_team:z.string().max(128),submitted_at:z.number().int().min(0)}).strict()).max(1000000).default([]),
      writtenResponses: z
        .array(
          z
            .object({
              user: z.string(),
              challenge: z.string(),
              answer: z.string().min(1).max(20000),
              question: z.string().min(1).max(20000),
              object: z.string(),
              maxPoints: z.number().int().min(0).max(10000),
              rewards: rewardsSchema.default({keys:[],incantations:[]}),
              hintCost: z.number().int().min(0).max(10000),
              submittedTeam: z.string().max(128).nullable().default(null),
              submittedAt: z.number().int().min(0),
              revision: z.number().int().min(1),
              grade: z.number().int().min(0).max(10000).nullable(),
              feedback: z.string().max(5000),
              reviewer: z.string().nullable(),
              gradedAt: z.number().int().min(0).nullable(),
            })
            .strict(),
        )
        .max(1000000)
        .default([]),
    })
    .extend({ entityActivations: z.array(z.object({ user: z.string(), entity: z.string().min(1).max(80) }).strict()).max(1000000).default([]) })
    .strict()
    .parse(input);
  snapshot.config = parseGame(stringify(snapshot.config));
  if (snapshot.theme) snapshot.theme = parseTheme(snapshot.theme);
  snapshot.challenges = parseChallenges(
    stringify({ challenges: snapshot.challenges }),
    snapshot.theme?.world.maps.map((m) => m.id),
  );
  validateProgressionDependencies(snapshot.challenges, (snapshot.theme || defaultTheme(snapshot.config)).world.entities || []);
  if (new Set(snapshot.entityActivations.map(a => `${a.user}\0${a.entity}`)).size !== snapshot.entityActivations.length) throw Error("Duplicate entity activations in backup.");
  if (new Set(snapshot.answerAttempts.map(a=>a.id)).size!==snapshot.answerAttempts.length) throw Error("Backup contains duplicate answer attempts.");
  const ids = new Set(snapshot.accounts.map((a) => a.id));
  const completionIds = new Set(snapshot.solved.map(r => `${r.user}\0${r.challenge}`));
  const noticeIds=new Set(snapshot.notifications.map(n=>n.id));
  if(noticeIds.size!==snapshot.notifications.length||snapshot.notificationRecipients.some(r=>!noticeIds.has(r.notification))||snapshot.notificationReads.some(r=>!noticeIds.has(r.notification)||!ids.has(r.user))||new Set(snapshot.notificationRecipients.map(r=>r.notification+'\0'+r.username)).size!==snapshot.notificationRecipients.length||new Set(snapshot.notificationReads.map(r=>r.notification+'\0'+r.user)).size!==snapshot.notificationReads.length)throw Error('Invalid notification history in backup.');
  for(const n of snapshot.notifications)if(!Array.isArray(JSON.parse(n.targets)))throw Error('Invalid notification recipients.');
  if(new Set(snapshot.ctfdImports.map(r=>r.digest)).size!==snapshot.ctfdImports.length||new Set(snapshot.ctfdImports.map(r=>r.id)).size!==snapshot.ctfdImports.length)throw Error('Duplicate CTFd import history.');
  for(const r of snapshot.ctfdImports)JSON.parse(r.report);
  if (
    ids.size !== snapshot.accounts.length ||
    new Set(snapshot.accounts.map((a) => a.username)).size !==
      snapshot.accounts.length
  )
    throw Error("Duplicate accounts in backup.");
  for (const a of snapshot.accounts)
    if (!snapshot.config.characters.some((c) => c.id === a.hero))
      throw Error("Backup contains an unknown hero.");
  for (const records of [
    snapshot.solved,
    snapshot.purchasedHints,
    snapshot.writtenResponses,
    snapshot.answerAttempts,
    snapshot.cutscenes,
    snapshot.entityActivations,
    snapshot.earnedRewards,
    snapshot.unlockedTransports,
  ])
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
  if (
    snapshot.discoveries.some((r) => !ids.has(r.user)) ||
    new Set(snapshot.discoveries.map((r) => `${r.user}\0${r.challenge}`))
      .size !== snapshot.discoveries.length
  )
    throw Error("Invalid discoveries in backup.");
  if (new Set(snapshot.cutscenes.map(r => `${r.user}\0${r.challenge}\0${r.phase}`)).size !== snapshot.cutscenes.length) throw Error("Duplicate cutscene progress in backup.");
  if (new Set(snapshot.earnedRewards.map(r => `${r.user}\0${r.challenge}`)).size !== snapshot.earnedRewards.length || new Set(snapshot.unlockedTransports.map(r => `${r.user}\0${r.transport}`)).size !== snapshot.unlockedTransports.length) throw Error("Duplicate inventory or unlock progress in backup.");
  if (snapshot.earnedRewards.some(r => !completionIds.has(`${r.user}\0${r.challenge}`))) throw Error("Inventory rewards must belong to completed challenges.");
  const teamIds = new Set(snapshot.teams.map((t) => t.id));
  if (new Set(snapshot.teamPointAwards.map((a) => a.id)).size !== snapshot.teamPointAwards.length || snapshot.teamPointAwards.some((a) => !teamIds.has(a.team)))
    throw Error("Invalid team point gifts in backup.");
  if (
    teamIds.size !== snapshot.teams.length ||
    new Set(snapshot.teams.map((t) => t.name_key)).size !==
      snapshot.teams.length ||
    new Set(snapshot.teamMembers.map((m) => m.user)).size !==
      snapshot.teamMembers.length
  )
    throw Error("Duplicate teams or membership in backup.");
  if (
    snapshot.teamMembers.some((m) => !ids.has(m.user) || !teamIds.has(m.team))
  )
    throw Error("Unknown team or account in backup membership.");
  if (
    new Set(snapshot.teamMessages.map((m) => m.id)).size !==
      snapshot.teamMessages.length ||
    snapshot.teamMessages.some(
      (m) =>
        (m.sender_user !== null && !ids.has(m.sender_user)) ||
        (m.sender_team !== null && !teamIds.has(m.sender_team)) ||
        !teamIds.has(m.recipient_team),
    )
  )
    throw Error("Invalid team messages in backup.");
  if (
    new Set(snapshot.instructorMessages.map((m) => m.id)).size !==
      snapshot.instructorMessages.length ||
    snapshot.instructorMessages.some(
      (m) => !ids.has(m.sender_user) || !teamIds.has(m.team),
    ) ||
    snapshot.instructorMessages.some((m) =>
      snapshot.teamMessages.some((t) => t.id === m.id),
    )
  )
    throw Error("Invalid instructor messages in backup.");
  if (
    new Set(snapshot.writtenResponses.map((r) => `${r.user}\0${r.challenge}`))
      .size !== snapshot.writtenResponses.length
  )
    throw Error("Duplicate written responses in backup.");
  for (const r of snapshot.writtenResponses) {
    const award = snapshot.solved.find(
      (a) => a.user === r.user && a.challenge === r.challenge,
    );
    if (
      (r.grade !== null &&
        (r.grade > r.maxPoints ||
          r.gradedAt === null ||
          !award ||
          award.points !== Math.max(0, r.grade - r.hintCost))) ||
      (r.grade === null && (r.gradedAt !== null || award))
    )
      throw Error("Invalid response grade in backup.");
  }
  return snapshot;
}
export async function createSnapshot({ db, config, challenges, theme }) {
  theme ??= (await activeTheme(db, config)).theme;
  const [
    users,
    catalog,
    solved,
    hints,
    teams,
    members,
    teamSettings,
    responses,
    deletedAccounts,
    pointAwards,
  ] = await db.batch([
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
        "SELECT user,challenge,hint,cost,reward_cost FROM purchased_hints ORDER BY user,challenge,hint",
      )
      .bind(),
    db
      .prepare("SELECT id,name,name_key,hash,salt FROM teams ORDER BY name")
      .bind(),
    db.prepare("SELECT user,team FROM team_members ORDER BY user").bind(),
    db
      .prepare("SELECT max_members FROM team_settings WHERE id='active'")
      .bind(),
    db
      .prepare(
        "SELECT user,challenge,answer,question,object,max_points AS maxPoints,rewards_payload,hint_cost AS hintCost,submitted_at AS submittedAt,submitted_team AS submittedTeam,revision,grade,feedback,reviewer,graded_at AS gradedAt FROM written_responses ORDER BY user,challenge",
      )
      .bind(),
    db.prepare("SELECT username,deleted_at FROM deleted_accounts ORDER BY username").bind(),
    db.prepare("SELECT id,team,points,comment,awarded_by,created_at FROM team_point_awards ORDER BY created_at,id").bind(),
  ]);
  const deleted = new Set(deletedAccounts.results.map(a => a.username));
  const records = [];
  for (const row of users.results) {
    const cfg = deleted.has(row.username) ? undefined : config.accounts.users.find((a) => a.username === row.username),
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
      spawn: effective.spawn,
      role: effective.role,
      disabled: row.disabled || 0,
      muted: row.muted || 0,
      managed: row.managed || 0,
      provisioned: row.provisioned || 0,
      revision: row.revision || 0,
    });
  }
  for (const cfg of config.accounts.users)
    if (!deleted.has(cfg.username) && !records.some((a) => a.username === cfg.username)) {
      const credentials = await configuredCredentials(cfg, null);
      records.push({
        id: crypto.randomUUID(),
        username: cfg.username,
        hash: credentials.hash,
        salt: credentials.salt,
        hero: cfg.hero || config.characters[0].id,
        spawn: cfg.spawn || null,
        role: cfg.role || "student",
        disabled: 0,
        managed: 0,
        provisioned: 0,
        revision: 0,
      });
    }
  const exportConfig = JSON.parse(JSON.stringify(config));
  exportConfig.accounts.users = config.accounts.users.filter(cfg => !deleted.has(cfg.username)).map((cfg) => {
    const a = records.find((a) => a.username === cfg.username);
    return {
      username: a.username,
      passwordHash: a.hash,
      salt: a.salt,
      hero: a.hero,
      spawn: a.spawn,
      role: a.role,
    };
  });
  return validateSnapshot({
    format: "north-pole-quest",
    version: 1,
    createdAt: new Date().toISOString(),
    config: exportConfig,
    theme,
    challenges: catalog.results[0]
      ? JSON.parse(catalog.results[0].payload)
      : challenges,
    accounts: records,
    deletedAccounts: deletedAccounts.results,
    discoveries: (
      await db
        .prepare(
          "SELECT user,challenge FROM discovered_challenges ORDER BY user,challenge",
        )
        .bind()
        .all()
    ).results,
    solved: solved.results,
    entityActivations: (await db.prepare("SELECT user,entity FROM entity_activations ORDER BY user,entity").bind().all()).results,
    cutscenes: (await db.prepare("SELECT user,challenge,phase FROM challenge_cutscenes ORDER BY user,challenge,phase").bind().all()).results,
    purchasedHints: hints.results.map(({reward_cost,...r}) => ({...r,rewardCost:JSON.parse(reward_cost)})),
    writtenResponses: responses.results.map(({rewards_payload,...r}) => ({...r,rewards:JSON.parse(rewards_payload)})),
    earnedRewards: (await db.prepare("SELECT user,challenge,payload FROM earned_rewards ORDER BY user,challenge").bind().all()).results.map(({payload,...r}) => ({...r,rewards:JSON.parse(payload)})),
    unlockedTransports: (await db.prepare("SELECT user,transport,signature FROM unlocked_transports ORDER BY user,transport").bind().all()).results,
    notifications: (await db.prepare("SELECT * FROM notifications ORDER BY created_at,id").bind().all()).results,
    notificationRecipients: (await db.prepare("SELECT * FROM notification_recipients ORDER BY notification,username").bind().all()).results,
    notificationReads: (await db.prepare("SELECT * FROM notification_reads ORDER BY notification,user").bind().all()).results,
    ctfdImports: (await db.prepare("SELECT * FROM ctfd_imports ORDER BY created_at,id").bind().all()).results,
    answerAttempts: (await db.prepare("SELECT * FROM answer_attempts ORDER BY submitted_at,id").bind().all()).results,
    teams: teams.results,
    teamMembers: members.results,
    teamPointAwards: pointAwards.results,
    teamFeatures: (({ revision, ...flags }) => flags)(
      await teamFeatures(db, config),
    ),
    teamMessages: (
      await db
        .prepare(
          "SELECT id,sender_user,sender_team,recipient_team,sender,text,created_at FROM team_messages ORDER BY created_at,id",
        )
        .bind()
        .all()
    ).results,
    instructorMessages: (
      await db
        .prepare(
          "SELECT id,sender_user,team,sender,text,created_at FROM instructor_messages ORDER BY created_at,id",
        )
        .bind()
        .all()
    ).results,
    challengeSettings: await challengeSettings(db),
    scoreboardSettings: await scoreboardSettings(db),
    playerVisibility: (await presenceSettings(db, config)).visibility,
    teamMaxMembers:
      teamSettings.results[0]?.max_members ?? config.teams?.maxMembers ?? 4,
  });
}
export async function exportFullBackup(state, assets = {}) {
  const snapshot = await createSnapshot(state),
    bytes = Uint8Array.from(atob(kitBase64), (c) => c.charCodeAt(0));
  const entries = unzipSync(bytes);
  Object.assign(entries, assets);
  const paths = [
    ...new Set([
      ...themeAssetPaths(snapshot.theme),
      ...contentPaths(snapshot.challenges),
    ]),
  ];
  for (const path of paths) {
    const bytes = await readAsset(path, state.assetStore, state.readBaseAsset);
    if (!bytes) throw Error(`Backup is missing asset ${path}`);
    if (path.startsWith("/api/assets/"))
      entries["data/pack-assets/" + path.slice(12)] = bytes;
    else entries["public" + path] = bytes;
  }

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
    JSON.stringify({ d1: "DB", r2: "QUEST_FILES" }, null, 2),
  );
  entries["RESTORE.md"] = strToU8(
    `CTF-RPG complete backup\n\n1. Extract this ZIP into a new directory.\n2. Install Node.js 24 and run npm ci.\n3. Run npm run restore -- backup.json.\n4. Run npm run start:selfhost and open http://localhost:3000.\n\nThe ready-built frontend is included. You can also modify the included source and run npm run build:selfhost.\nAccounts retain their passwords through salted hashes. Active sessions are excluded.\nIf the original site used only platform-owner administration, promote a restored player with npm run restore -- backup.json --admin USERNAME on the initial restore, or add a new role: admin account to content/game.yaml before starting.\nLocal assets are included; external file URLs continue to depend on their external hosts.\nKeep this ZIP private: it contains password hashes, flags, and student progress.\nSee BACKUPS.md and ADMIN_GUIDE.md for details.\n`,
  );
  const size = Object.values(entries).reduce((s, b) => s + b.length, 0);
  if (size > 32 * 1024 * 1024)
    throw Error("The backup exceeds the 32 MB packaging limit.");
  const archive = zipSync(entries, { level: 6 });
  return new Response(archive, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="ctf-rpg-backup-${snapshot.createdAt.slice(0, 10)}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
