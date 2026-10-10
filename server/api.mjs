import { playerMilestones } from "./progression.mjs";
import { entityReference, entityUnlocked, validateProgressionDependencies } from "../lib/challenge-dependencies.mjs";
import { handleChallengeDependencies } from "./challenge-dependencies.mjs";
import { bulkUserAction } from "./user-actions.mjs";
import {handleCtfdImport} from "./ctfd-import.mjs";
import {handleNotifications} from "./notifications.mjs";
import { handleSubmissions } from "./submissions.mjs";
import { handleThemeAudio } from "./theme-audio.mjs";
import { handleChallengeVideoUpload } from "./challenge-videos.mjs";
import { byteRange } from "./byte-range.mjs";
import { inventoryState, accessibleMaps, unlockTransport } from "./inventory.mjs";
import { publicTheme, emptyInventory, rewardsAfterHints, normalizeIncantation } from "../lib/inventory.mjs";
import { hintAdjustedRewardsSQL, hintAdjustedRewardsBindings, hintRewardAvailabilitySQL, normalizedHintRewardCost } from "./hint-rewards.mjs";
import { challengeSettings, visibleChallenges, handleChallengeSettings } from "./challenge-visibility.mjs";
// CTF-RPG — Copyright (c) 2026 Jaime C Acosta
import {
  scoreboardSettings,
  handleSocialControls,
} from "./social-controls.mjs";
import {
  teamScores,
  teamFeatures,
  teamLabel,
  teamPolicy,
} from "./team-social.mjs";
import { handleTeamSocial } from "./team-social.mjs";
import { handlePresence } from "./presence.mjs";
import { spawnSchema, canSpawn, resolveSpawn } from "../lib/spawn.mjs";
import { updateMap } from "./maps.mjs";
import { handleReview, gradingCompatible } from "./review.mjs";
import { themePresets, presetCatalog } from "../lib/theme-presets.mjs";
import {
  activeTheme,
  exportPack,
  importPacks,
  readAsset,
  assetKeyPattern,
  assetTypes,
} from "./packs.mjs";
import { createWorld } from "../lib/world-data.mjs";
import { challengeLocationAvailable, findChallengeLocation } from "../lib/challenge-placement.mjs";
import { publicEntity, resolveEntityDialogue } from "../lib/non-player-entities.mjs";
import { handleTeams } from "./teams.mjs";
import {
  passwordHash,
  equal,
  configuredCredentials,
  effectiveAccount,
} from "./passwords.mjs";
export { passwordHash } from "./passwords.mjs";
import { stringify } from "yaml";
import {
  normalize,
  publicConfig,
  parseChallenges,
} from "../lib/config-schema.mjs";
const usernamePattern = /^[a-zA-Z0-9_-]{3,24}$/;
const json = (data, status = 200, headers = {}) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
function createRequestApi({
  db,
  config,
  challenges,
  secureCookies = false,
  platformAdmin = false,
  exportBackup,
  theme,
  themeRevision = 0,
  assetStore,
  readBaseAsset,
}) {
  const tokenOf = (req) =>
    /quest_session=([^;]+)/.exec(req.headers.get("cookie") || "")?.[1];
  const sessionCookie = (token, maxAge = 604800) =>
    `quest_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureCookies ? "; Secure" : ""}`;
  async function configuredAccount(name) {
    const deleted = await db.prepare("SELECT username FROM deleted_accounts WHERE username=?").bind(name).first();
    return deleted ? undefined : config.accounts.users.find(a => a.username === name);
  }
  async function user(req) {
    const token = tokenOf(req);
    if (!token) return null;
    const row = await db
      .prepare(
        "SELECT students.* FROM sessions JOIN students ON students.id=sessions.user WHERE token=? AND expires>?",
      )
      .bind(token, Date.now())
      .first();
    if (!row || row.disabled) return null;
    const cfg = await configuredAccount(row.username);
    if (!config.accounts.allowRegistration && !cfg && !row.provisioned)
      return null;
    const account = effectiveAccount(row, cfg, config);
    if (!config.characters.some((c) => c.id === account.hero)) return null;
    return {
      id: account.id,
      username: account.username,
      hero: account.hero,
      role: account.role,
      spawn: resolveSpawn(account.spawn, theme.world),
    };
  }
  async function accountList() {
    const rows = (
      await db
        .prepare(
          `SELECT students.*,teams.id AS team_id,teams.name AS team_name,COALESCE(stats.score,0) AS score,COALESCE(stats.completed,0) AS completed FROM students LEFT JOIN team_members ON team_members.user=students.id LEFT JOIN teams ON teams.id=team_members.team LEFT JOIN (SELECT user,SUM(points) AS score,COUNT(*) AS completed FROM solved GROUP BY user) stats ON students.id=stats.user ORDER BY username`,
        )
        .bind()
        .all()
    ).results;
    const deleted = new Set((await db.prepare("SELECT username FROM deleted_accounts").bind().all()).results.map(a => a.username));
    const all = rows.map((row) => ({
      ...effectiveAccount(
        row,
        deleted.has(row.username) ? undefined : config.accounts.users.find((c) => c.username === row.username),
        config,
      ),
      team: row.team_id ? {id:row.team_id, name:row.team_name} : null,
      score: row.score,
      completed: row.completed,
    }));
    for (const cfg of config.accounts.users)
      if (!deleted.has(cfg.username) && !rows.some((r) => r.username === cfg.username))
        all.push({
          ...effectiveAccount(null, cfg, config),
          team: null,
          score: 0,
          completed: 0,
        });
    return all.sort((a, b) => a.username.localeCompare(b.username));
  }
  async function catalog() {
    const saved = await db
      .prepare(
        "SELECT payload,revision FROM challenge_catalog WHERE id='active'",
      )
      .bind()
      .first();
    return saved
      ? { challenges: JSON.parse(saved.payload), revision: saved.revision }
      : { challenges, revision: 0 };
  }
  async function gameState(userId, admin = false, startMap = theme.world.startMap) {
    const current = await catalog();
    const settings = await challengeSettings(db);
    const completions = await db
      .prepare("SELECT challenge,points FROM solved WHERE user=?")
      .bind(userId)
      .all();
    const { rewardsByChallenge, ...items } = await inventoryState(db, userId, theme);
    const maps = accessibleMaps(theme, items.unlockedTransports, startMap);
    const solvedIds = new Set(completions.results.map(r => r.challenge));
    const milestones = await playerMilestones(db, userId, [...solvedIds]);
    const expedition = admin ? current.challenges : settings.visibility === "admins" ? [] : current.challenges.filter(c => c.visibility !== "hidden");
    const challenges = visibleChallenges(current.challenges, settings, admin, milestones).filter(c => admin || maps.has(c.map) || solvedIds.has(c.id));
    const solveCounts = (await db.prepare("SELECT challenge,COUNT(*) AS count FROM solved GROUP BY challenge").bind().all()).results;
    const purchases = await db
      .prepare("SELECT challenge,hint,cost,reward_cost FROM purchased_hints WHERE user=?")
      .bind(userId)
      .all();
    const responses = (
      await db
        .prepare("SELECT * FROM written_responses WHERE user=?")
        .bind(userId)
        .all()
    ).results;
    const cutscenes = (await db.prepare("SELECT challenge,phase FROM challenge_cutscenes WHERE user=?").bind(userId).all()).results;
    return {
      ...items,
      entities: (theme.world.entities || []).filter(e => admin || entityUnlocked(e, milestones) && maps.has(e.map)).map(publicEntity),
      activatedEntities: [...milestones].filter(id => id.startsWith("npe:")).map(id => id.slice(4)),
      expeditionComplete: expedition.length > 0 && expedition.every(c => solvedIds.has(c.id)),
      challenges: challenges.map((c) => {
        const bought = purchases.results.filter((p) => p.challenge === c.id);
        const hintCost = bought.reduce((sum, p) => sum + p.cost, 0);
        const award = completions.results.find((r) => r.challenge === c.id);
        const response = responses.find((r) => r.challenge === c.id);
        const rewards = rewardsByChallenge[c.id] || (response ? JSON.parse(response.rewards_payload) : rewardsAfterHints(c.rewards || emptyInventory(), bought.map(p => JSON.parse(p.reward_cost))));
        return {
          id: c.id,
          solveCount: solveCounts.find((r) => r.challenge === c.id)?.count || 0,
          grading: response ? "manual" : c.grading || "automatic",
          submission: response
            ? {
                answer: response.answer,
                revision: response.revision,
                status: response.grade === null ? "pending" : "graded",
                feedback: response.feedback,
                grade: response.grade,
                submittedAt: response.submitted_at,
                gradedAt: response.graded_at,
              }
            : null,
          map: c.map,
          object: c.object,
          location: c.location,
          region: c.region,
          text: response?.question || c.text,
          answerRules: c.flagRules?.length ? "Per-flag case rules" : null,
          caseSensitive: c.caseSensitive,
          points: response?.max_points ?? c.points,
          remainingPoints: Math.max(
            0,
            (response?.max_points ?? c.points) -
              (response?.hint_cost ?? hintCost),
          ),
          awardedPoints: award?.points ?? null,
          hintCost: response?.hint_cost ?? hintCost,
          hints: c.hints.map((h) => {
            const purchased = bought.find((p) => p.hint === h.id);
            const rewardCost = purchased ? JSON.parse(purchased.reward_cost) : h.rewardCost || emptyInventory();
            const available = rewardCost.keys.every(k => rewards.keys.includes(k)) && rewardCost.incantations.every(p => rewards.incantations.some(r => normalizeIncantation(r) === normalizeIncantation(p)));
            return {
              id: h.id,
              label: h.label,
              cost: purchased?.cost ?? h.cost,
              rewardCost: { keys: rewardCost.keys, incantationCount: rewardCost.incantations.length },
              available,
              unlocked: !!purchased,
              ...(purchased ? { text: h.text } : {}),
            };
          }),
          downloads: c.downloads,
          discoveryVideo: c.discoveryVideo || null,
          solveVideo: award ? c.solveVideo || null : null,
          discoveryCutsceneSeen: cutscenes.some(r => r.challenge === c.id && r.phase === "discovery"),
          solveCutsceneSeen: cutscenes.some(r => r.challenge === c.id && r.phase === "solve"),
          rewards: { keys: rewards.keys, incantationCount: rewards.incantations.length },
        };
      }),
      discovered: (
        await db
          .prepare("SELECT challenge FROM discovered_challenges WHERE user=?")
          .bind(userId)
          .all()
      ).results.map((r) => r.challenge),
      solved: completions.results.map((r) => r.challenge),
      score: completions.results.reduce((sum, r) => sum + r.points, 0),
    };
  }
  async function dispatch(req) {
    const path = new URL(req.url).pathname,
      method = req.method;
    if (
      !["GET", "HEAD"].includes(method) &&
      req.headers.get("origin") !== new URL(req.url).origin
    )
      return json({ error: "Invalid request origin." }, 403);
    if (path === "/api/admin/challenge-dependencies") return handleChallengeDependencies(req, {db, user, platformAdmin, catalog, theme, themeRevision});
    if (path === "/api/admin/challenge-visibility") return handleChallengeSettings(req, {db, user, platformAdmin});
    if (path === "/api/admin/challenge-videos") return handleChallengeVideoUpload(req, {user, platformAdmin, assetStore});
    if (["/api/admin/mute", "/api/admin/scoreboard"].includes(path))
      return handleSocialControls(req, { db, user, platformAdmin });
    if (["/api/presence", "/api/admin/presence"].includes(path))
      return handlePresence(req, {
        db,
        config,
        user,
        platformAdmin,
        theme,
        themeRevision,
        catalog,
      });
    if (["/api/team-social", "/api/admin/team-social"].includes(path))
      return handleTeamSocial(req, { db, config, user, platformAdmin });
    if (["/api/teams", "/api/admin/teams"].includes(path))
      return handleTeams(req, { db, config, user, platformAdmin });
    if (path.startsWith("/api/assets/") && method === "GET") {
      const key = path.slice(12);
      if (!assetKeyPattern.test(key)) return json({ error: "Not found." }, 404);
      const bytes = await readAsset(path, assetStore, readBaseAsset);
      if (!bytes) return json({ error: "Not found." }, 404);
      const isVideo = /\.(mp4|webm)$/.test(key);
      const range = isVideo ? byteRange(req.headers.get("range"), bytes.length) : null;
      return new Response(range?.status === 416 ? null : range ? bytes.slice(range.start, range.end + 1) : bytes, {
        status: range?.status || 200,
        headers: {
          ...range?.headers,
          "Content-Type": assetTypes[key.split(".").pop()],
          "X-Content-Type-Options": "nosniff",
          "Content-Disposition": key.endsWith(".bin") ? "attachment" : "inline",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }
    if (path === "/api/admin/review")
      return handleReview(req, { db, user, platformAdmin });
    if (path === "/api/admin/maps") {
      const u = await user(req);
      if (!platformAdmin && u?.role !== "admin")
        return json({ error: "Administrator access required." }, u ? 403 : 401);
      if (method !== "POST") return json({ error: "Method not allowed." }, 405);
      const current = await catalog();
      try {
        return json(
          await updateMap(req, {
            db,
            config,
            theme,
            themeRevision,
            challenges: current.challenges,
            contentRevision: current.revision,
            store: assetStore,
            readBaseAsset,
          }),
        );
      } catch (e) {
        return json(
          {
            error:
              e.issues?.map((i) => i.message).join("; ") ||
              e.message ||
              "Map could not be saved.",
          },
          400,
        );
      }
    }
    if (path === "/api/admin/ctfd-import") return handleCtfdImport(req,{db,config,user,platformAdmin,assetStore,readBaseAsset,theme,themeRevision,catalog});
    if (["/api/notifications","/api/admin/notifications"].includes(path)) return handleNotifications(req,{db,config,user,platformAdmin});
    if (path === "/api/admin/submissions") return handleSubmissions(req,{db,user,platformAdmin});
    if (path === "/api/admin/theme-audio") return handleThemeAudio(req,{db, user, platformAdmin, theme, themeRevision, assetStore, readBaseAsset});
    if (path === "/api/admin/packs") {
      const u = await user(req);
      if (!platformAdmin && u?.role !== "admin")
        return json({ error: "Administrator access required." }, u ? 403 : 401);
      const current = await catalog(),
        kind = new URL(req.url).searchParams.get("kind");
      if (method === "GET" && !kind)
        return json({
          theme,
          themeRevision,
          contentRevision: current.revision,
          challengeCount: current.challenges.length,
          presets: presetCatalog(),
        });
      if (!["theme", "content"].includes(kind))
        return json({ error: "Choose theme or content." }, 400);
      try {
        const presetId = new URL(req.url).searchParams.get("preset"),
          preset = presetId
            ? themePresets.find((p) => p.id === presetId)
            : null;
        if (presetId && (!preset || kind !== "theme" || method !== "GET"))
          return json({ error: "Unknown theme preset." }, 400);
        if (method === "GET")
          return await exportPack(
            kind,
            { theme: preset?.theme || theme, challenges: current.challenges },
            assetStore,
            readBaseAsset,
          );
        if (method === "POST")
          return json({
            ok: true,
            ...(await importPacks(
              req,
              {
                db,
                config,
                theme,
                themeRevision,
                challenges: current.challenges,
                contentRevision: current.revision,
                store: assetStore,
              },
              kind,
            )),
          });
      } catch (e) {
        return json({ error: e.message || "Invalid pack." }, 400);
      }
      return json({ error: "Method not allowed." }, 405);
    }
    if (path === "/api/config" && method === "GET")
      return json({
        ...publicConfig(config),
        theme: { ...publicTheme(theme), world: { ...publicTheme(theme).world, entities: (theme.world.entities || []).filter(e => !e.dependsOn?.length).map(publicEntity) } },
        themeRevision,
        scoreboard: await scoreboardSettings(db),
      });
    if (path === "/api/auth" && method === "GET") {
      const u = await user(req);
      return json({ user: u, admin: platformAdmin || u?.role === "admin" });
    }
    if (path === "/api/auth" && method === "DELETE") {
      const token = tokenOf(req);
      if (token)
        await db
          .prepare("DELETE FROM sessions WHERE token=?")
          .bind(token)
          .run();
      return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
    }
    if (path === "/api/auth" && method === "POST") {
      const { username, password, hero, mode } = await req.json();
      if (
        typeof username !== "string" ||
        !usernamePattern.test(username) ||
        typeof password !== "string" ||
        password.length < 8 ||
        password.length > 128 ||
        !["login", "register"].includes(mode)
      )
        return json(
          {
            error:
              "Use a 3–24 character username and a password of 8–128 characters.",
          },
          400,
        );
      const name = username.toLowerCase(),
        configured = await configuredAccount(name);
      let account = await db
        .prepare("SELECT * FROM students WHERE username=?")
        .bind(name)
        .first();
      if (mode === "register") {
        if (!config.accounts.allowRegistration)
          return json(
            { error: "Sign in with the account your teacher provided." },
            403,
          );
        if (configured || account)
          return json(
            { error: "That username is already taken. Sign in instead." },
            409,
          );
        if (!config.characters.some((c) => c.id === hero))
          return json({ error: "Choose a hero." }, 400);
        const salt = crypto.randomUUID(),
          id = crypto.randomUUID();
        await db
          .prepare(
            "INSERT INTO students(id,username,hash,salt,hero) VALUES(?,?,?,?,?)",
          )
          .bind(id, name, await passwordHash(password, salt), salt, hero)
          .run();
        account = { id, username: name, hero };
      } else {
        if (account?.disabled)
          return json(
            { error: "This account is disabled. Contact your teacher." },
            403,
          );
        if (
          !config.accounts.allowRegistration &&
          !configured &&
          !account?.provisioned
        )
          return json({ error: "Username or password is incorrect." }, 401);
        if (account?.managed || !configured) {
          if (
            !account ||
            !equal(await passwordHash(password, account.salt), account.hash)
          )
            return json({ error: "Username or password is incorrect." }, 401);
        } else {
          const credentials = await configuredCredentials(configured, account);
          if (
            !equal(
              credentials.hash,
              await passwordHash(password, credentials.salt),
            )
          )
            return json({ error: "Username or password is incorrect." }, 401);
          const selected = configured.hero || account?.hero || hero;
          if (!config.characters.some((c) => c.id === selected))
            return json(
              { error: "Choose an available hero for your first sign-in." },
              400,
            );
          if (!account) {
            const id = crypto.randomUUID();
            const result = await db
              .prepare(
                "INSERT INTO students(id,username,hash,salt,hero) SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM deleted_accounts WHERE username=?)",
              )
              .bind(id, name, credentials.hash, credentials.salt, selected, name)
              .run();
            if (!(result.meta?.changes ?? result.changes))
              return json({error:"This user was deleted. Contact your administrator."}, 401);
            account = { id, username: name, hero: selected };
          } else {
            const update = db
              .prepare("UPDATE students SET hash=?,salt=?,hero=? WHERE id=?")
              .bind(credentials.hash, credentials.salt, selected, account.id);
            if (account.hash !== credentials.hash)
              await db.batch([
                update,
                db
                  .prepare("DELETE FROM sessions WHERE user=?")
                  .bind(account.id),
              ]);
            else await update.run();
            account.hero = selected;
          }
        }
        if (!config.characters.some((c) => c.id === account.hero))
          return json(
            { error: "Your hero is unavailable. Contact your teacher." },
            409,
          );
      }
      const effective = effectiveAccount(account, configured, config);
      const accountRole = effective.role;
      const token = crypto.randomUUID() + crypto.randomUUID();
      await db
        .prepare("DELETE FROM sessions WHERE expires<?")
        .bind(Date.now())
        .run();
      await db
        .prepare("INSERT INTO sessions(token,user,expires) VALUES(?,?,?)")
        .bind(token, account.id, Date.now() + 604800000)
        .run();
      return json(
        {
          user: {
            id: account.id,
            username: name,
            hero: account.hero,
            role: accountRole,
            spawn: resolveSpawn(effective.spawn, theme.world),
          },
          admin: platformAdmin || accountRole === "admin",
        },
        200,
        { "Set-Cookie": sessionCookie(token) },
      );
    }
    if (path === "/api/scoreboard" && method === "GET") {
      const u = await user(req);
      if (!u && !platformAdmin)
        return json({ error: "Sign in to see the scoreboard." }, 401);
      const settings = await scoreboardSettings(db);
      if (
        settings.visibility === "admins" &&
        !platformAdmin &&
        u?.role !== "admin"
      )
        return json(
          { error: "The scoreboard is available to administrators only." },
          403,
        );
      const admin = !!(platformAdmin || u?.role === "admin");
      const requestedMode = new URL(req.url).searchParams.get("mode");
      if (requestedMode && !["team", "individual"].includes(requestedMode))
        return json({ error: "Choose user or team scores." }, 400);
      const mode = admin ? requestedMode || settings.mode : "team";
      if (mode === "team") {
        const totals = await teamScores(db, config),
          features = await teamFeatures(db, config);
        const own = u
          ? await db
              .prepare("SELECT team FROM team_members WHERE user=?")
              .bind(u.id)
              .first()
          : null;
        const teams = (
          await db
            .prepare("SELECT id,name FROM teams ORDER BY name")
            .bind()
            .all()
        ).results
          .map((t) => ({
            id: t.id,
            username: teamLabel(
              t,
              teamPolicy(
                features,
                platformAdmin || u?.role === "admin" || own?.team === t.id,
              ),
            ),
            score: totals.get(t.id) || 0,
            isYou: own?.team === t.id,
          }))
          .sort(
            (a, b) => b.score - a.score || a.username.localeCompare(b.username),
          );
        let rank = 0,
          lastScore;
        return json({
          mode: "team",
          admin,
          players: teams.map((t, i) => {
            if (t.score !== lastScore) {
              rank = i + 1;
              lastScore = t.score;
            }
            return { ...t, rank };
          }),
        });
      }
      const players = (await accountList())
        .filter((a) => a.role === "student" && !a.disabled)
        .sort(
          (a, b) => b.score - a.score || a.username.localeCompare(b.username),
        );
      let rank = 0,
        lastScore;
      return json({
        mode: "individual",
        admin,
        players: players.map((a, i) => {
          if (a.score !== lastScore) {
            rank = i + 1;
            lastScore = a.score;
          }
          return {
            rank,
            username: a.username,
            hero: a.hero,
            score: a.score,
            completed: a.completed,
            isYou: u?.username === a.username,
          };
        }),
      });
    }
    if (path === "/api/admin/users") {
      const u = await user(req);
      if (!platformAdmin && u?.role !== "admin")
        return json(
          {
            error: u
              ? "Administrator access is required."
              : "Sign in as an administrator.",
          },
          u ? 403 : 401,
        );
      if (method === "GET")
        return json({
          users: await accountList(),
          characters: config.characters,
          viewer: u?.username || null,
          theme,
          themeRevision,
        });
      if (method === "POST") {
        const body = await req.json();
        if (!body || typeof body !== "object" || Array.isArray(body)) return json({error:"Provide user details or a bulk action."}, 400);
        if (body.action !== undefined) return bulkUserAction(body, {db, config, viewer:u, accountList});
        const name =
            typeof body.username === "string"
              ? body.username.toLowerCase()
              : "";
        if (
          !usernamePattern.test(name) ||
          !["student", "admin"].includes(body.role) ||
          typeof body.disabled !== "boolean" ||
          (body.muted !== undefined && typeof body.muted !== "boolean") ||
          !config.characters.some((c) => c.id === body.hero) ||
          !Number.isInteger(body.revision)
        )
          return json(
            {
              error:
                "Provide a valid username, role, hero, status, and revision.",
            },
            400,
          );
        const row = await db
            .prepare("SELECT * FROM students WHERE username=?")
            .bind(name)
            .first(),
          cfg = await configuredAccount(name),
          exists = !!(row || cfg);
        if (exists !== !!body.editing)
          return json(
            {
              error: exists
                ? "That username already exists. Select it to edit."
                : "This account no longer exists. Reload users.",
            },
            409,
          );
        if ((row?.revision || 0) !== body.revision)
          return json(
            {
              error:
                "Another administrator changed this account. Reload users before saving.",
            },
            409,
          );
        if (
          !platformAdmin &&
          u?.username === name &&
          (body.disabled || body.role !== "admin")
        )
          return json(
            { error: "You cannot disable or demote your own admin account." },
            400,
          );
        if (
          body.password !== undefined &&
          (typeof body.password !== "string" ||
            body.password.length < 8 ||
            body.password.length > 128)
        )
          return json(
            { error: "Passwords must contain 8–128 characters." },
            400,
          );
        if (!exists && !body.password)
          return json({ error: "A new account needs a password." }, 400);
        let spawn =
          row || cfg ? effectiveAccount(row, cfg, config).spawn : null;
        if (body.spawn !== undefined) {
          if (body.themeRevision !== themeRevision)
            return json(
              {
                error:
                  "The map changed. Reload users before assigning a starting position.",
              },
              409,
            );
          const parsed = spawnSchema.nullable().safeParse(body.spawn);
          if (
            !parsed.success ||
            (parsed.data &&
              !canSpawn(
                theme.world,
                parsed.data.map,
                parsed.data.location.x,
                parsed.data.location.y,
              ))
          )
            return json(
              {
                error:
                  "Choose a reachable starting tile, away from doors and transport tiles.",
              },
              400,
            );
          spawn = parsed.data;
        }
        const spawnJson = spawn ? JSON.stringify(spawn) : null;
        let credentials;
        if (body.password) {
          const salt = crypto.randomUUID();
          credentials = { salt, hash: await passwordHash(body.password, salt) };
        } else if (row?.managed || !cfg)
          credentials = { salt: row.salt, hash: row.hash };
        else credentials = await configuredCredentials(cfg, row);
        if (!row) {
          const id = crypto.randomUUID();
          const result = await db
            .prepare(
              "INSERT OR IGNORE INTO students(id,username,hash,salt,hero,role,disabled,spawn,muted,managed,provisioned,revision) SELECT ?,?,?,?,?,?,?,?,?,1,1,1 WHERE COALESCE((SELECT revision FROM theme_catalog WHERE id='active'),0)=? AND (?=0 OR NOT EXISTS(SELECT 1 FROM deleted_accounts WHERE username=?))",
            )
            .bind(
              id,
              name,
              credentials.hash,
              credentials.salt,
              body.hero,
              body.role,
              body.disabled ? 1 : 0,
              spawnJson,
              +(body.muted ?? false),
              themeRevision,
              +!!cfg,
              name,
            )
            .run();
          if (Number(result.meta?.changes ?? result.changes) !== 1)
            return json(
              {
                error:
                  "Another administrator created this username. Reload users.",
              },
              409,
            );
        } else {
          const update = db
            .prepare(
              "UPDATE students SET hash=?,salt=?,hero=?,role=?,disabled=?,spawn=?,muted=?,managed=1,provisioned=1,revision=revision+1 WHERE id=? AND revision=? AND COALESCE((SELECT revision FROM theme_catalog WHERE id='active'),0)=?",
            )
            .bind(
              credentials.hash,
              credentials.salt,
              body.hero,
              body.role,
              body.disabled ? 1 : 0,
              spawnJson,
              +(body.muted ?? !!row.muted),
              row.id,
              body.revision,
              themeRevision,
            );
          let result;
          if (body.password || body.disabled) {
            const results = await db.batch([
              update,
              db
                .prepare(
                  "DELETE FROM sessions WHERE user=? AND EXISTS(SELECT 1 FROM students WHERE id=? AND hash=? AND revision=?)",
                )
                .bind(row.id, row.id, credentials.hash, body.revision + 1),
            ]);
            result = results[0];
          } else result = await update.run();
          if (Number(result.meta?.changes ?? result.changes) !== 1)
            return json(
              { error: "Another administrator saved first. Reload users." },
              409,
            );
        }
        return json({
          users: await accountList(),
          characters: config.characters,
          viewer: u?.username || null,
          theme,
          themeRevision,
        });
      }
    }
    if (path === "/api/admin/backup" && method === "GET") {
      const u = await user(req);
      if (!platformAdmin && u?.role !== "admin")
        return json(
          {
            error: u
              ? "Administrator access is required."
              : "Sign in as an administrator.",
          },
          u ? 403 : 401,
        );
      if (!exportBackup)
        return json({ error: "Backup packaging is not available." }, 503);
      return exportBackup({
        db,
        config,
        challenges,
        theme,
        assetStore,
        readBaseAsset,
      });
    }
    if (path === "/api/admin/challenges") {
      const u = await user(req);
      if (!platformAdmin && u?.role !== "admin")
        return json(
          {
            error: u
              ? "Administrator access is required."
              : "Sign in as an administrator.",
          },
          u ? 403 : 401,
        );
      const current = await catalog();
      if (method === "GET") {
        if (new URL(req.url).searchParams.get("format") === "yaml")
          return new Response(stringify({ challenges: current.challenges }), {
            headers: {
              "Content-Type": "application/yaml; charset=utf-8",
              "Content-Disposition": 'attachment; filename="challenges.yaml"',
              "Cache-Control": "no-store",
            },
          });
        return json({ ...current, theme, themeRevision });
      }
      if (method === "POST") {
        const body = await req.json();
        const { revision } = body;
        let { challenge, editingId } = body;
        if (!Number.isInteger(revision) || revision !== current.revision)
          return json(
            {
              error:
                "Another administrator changed the challenges. Reload the saved version before saving again.",
            },
            409,
          );
        if (body.action !== undefined) {
          if (body.action !== "move") return json({ error: "Unknown challenge action." }, 400);
          if (body.themeRevision !== themeRevision)
            return json({ error: "The maps changed. Reload the saved version before moving the challenge." }, 409);
          const selected = current.challenges.find(c => c.id === body.id);
          if (!selected) return json({ error: "This challenge no longer exists. Reload the saved version." }, 409);
          const world = createWorld(theme.world);
          if (!world.mapInfo(body.map)) return json({ error: "Choose an available map." }, 400);
          const location = body.location === undefined
            ? findChallengeLocation(world, current.challenges, body.map, selected.location, selected.id)
            : body.location;
          if (!location || !challengeLocationAvailable(world, current.challenges, body.map, location.x, location.y, selected.id))
            return json({ error: "Choose an unoccupied, reachable tile away from doors, walls, water, and furniture." }, 400);
          editingId = selected.id;
          challenge = { ...selected, map: body.map, location: { x: location.x, y: location.y } };
        }
        let validated;
        try {
          validated = parseChallenges(
            stringify({ challenges: [challenge] }),
            theme.world.maps.map((m) => m.id),
            false,
            [...current.challenges.map((c) => c.id), challenge?.id, ...(theme.world.entities || []).map(e => entityReference(e.id))],
          )[0];
        } catch (e) {
          return json(
            { error: e.issues?.map((i) => i.message).join("; ") || e.message },
            400,
          );
        }
        if (
          !challengeLocationAvailable(createWorld(theme.world), [],
            validated.map,
            validated.location.x,
            validated.location.y,
            validated.id,
          )
        )
          return json(
            {
              error:
                "Choose reachable ground or floor, away from doors, walls, water, furniture, and non-player entities.",
            },
            400,
          );
        if (editingId !== undefined && editingId !== validated.id)
          return json(
            { error: "An existing challenge ID cannot be changed." },
            400,
          );
        const exists = current.challenges.some((c) => c.id === validated.id);
        if (editingId && !exists)
          return json(
            {
              error:
                "This challenge no longer exists. Reload the saved version.",
            },
            409,
          );
        if (!editingId && exists)
          return json(
            { error: "That challenge already exists. Select it to edit." },
            409,
          );
        const updated = exists
          ? current.challenges.map((c) =>
              c.id === validated.id ? validated : c,
            )
          : [...current.challenges, validated];
        try {
          parseChallenges(
            stringify({ challenges: updated }),
            theme.world.maps.map((m) => m.id),
          );
          validateProgressionDependencies(updated, theme.world.entities || []);
          await gradingCompatible(db, current.challenges, updated);
        } catch (e) {
          return json({ error: e.message }, 400);
        }
        const payload = JSON.stringify(updated);
        if (new TextEncoder().encode(payload).byteLength > 1500000)
          return json(
            {
              error:
                "The challenge set exceeds the 1.5 MB limit. Shorten challenge or hint text.",
            },
            400,
          );
        const result =
          current.revision === 0
            ? await db
                .prepare(
                  "INSERT OR IGNORE INTO challenge_catalog(id,payload,revision) SELECT 'active',?,1 WHERE COALESCE((SELECT revision FROM theme_catalog WHERE id='active'),0)=?",
                )
                .bind(payload, themeRevision)
                .run()
            : await db
                .prepare(
                  "UPDATE challenge_catalog SET payload=?,revision=revision+1 WHERE id='active' AND revision=? AND COALESCE((SELECT revision FROM theme_catalog WHERE id='active'),0)=?",
                )
                .bind(payload, revision, themeRevision)
                .run();
        if (Number(result.meta?.changes ?? result.changes) !== 1)
          return json(
            {
              error:
                "Another administrator saved first. Reload the saved version before saving again.",
            },
            409,
          );
        return json({ challenges: updated, revision: revision + 1 });
      }
    }
    if (path === "/api/game") {
      const u = await user(req);
      if (!u) return json({ error: "Sign in to play." }, 401);
      const admin = platformAdmin || u.role === "admin";
      if (method === "GET") return json(await gameState(u.id, admin, u.spawn.map));
      if (method === "POST") {
        const body = await req.json();
        const { id, answer, action, hintId, revision, phase, replay, phrase } = body;
        if (action === "entity-dialogue") {
          if (body.themeRevision !== themeRevision) return json({ error: "The characters changed. Close this conversation and refresh the game." }, 409);
          const entity = (theme.world.entities || []).find(e => e.id === id);
          if (!entity) return json({ error: "This character is unavailable." }, 404);
          const items = await inventoryState(db, u.id, theme);
          if (!admin && !accessibleMaps(theme, items.unlockedTransports, u.spawn.map).has(entity.map))
            return json({ error: "Unlock a route to this map before speaking with its characters." }, 403);
          if (body.map !== entity.map || !Number.isInteger(body.x) || !Number.isInteger(body.y) || body.x < 0 || body.x > 39 || body.y < 0 || body.y > 27 || Math.abs(body.x - entity.location.x) + Math.abs(body.y - entity.location.y) > 2)
            return json({ error: "Move near this character and Search nearby to speak." }, 400);
          const choices = body.choices ?? [];
          if (!Array.isArray(choices) || choices.length > 100 || choices.some(c => typeof c !== "string" || c.length > 80))
            return json({ error: "Restart this conversation to continue." }, 400);
          const current = await catalog();
          const solved = (await db.prepare("SELECT challenge FROM solved WHERE user=?").bind(u.id).all()).results;
          const milestones = await playerMilestones(db, u.id, solved.map(r => r.challenge));
          if (!admin && !entityUnlocked(entity, milestones)) return json({ error: "This character is unavailable." }, 404);
          let dialogue;
          try { dialogue = resolveEntityDialogue(entity, choices); }
          catch (e) { return json({ error: e.message }, 400); }
          const gate = "COALESCE((SELECT revision FROM challenge_catalog WHERE id='active'),0)=? AND COALESCE((SELECT revision FROM theme_catalog WHERE id='active'),0)=?";
          if (!admin) await db.prepare(`INSERT OR IGNORE INTO entity_activations(user,entity) SELECT ?,? WHERE ${gate}`).bind(u.id, entity.id, current.revision, themeRevision).run();
          if (!(await db.prepare(`SELECT ${gate} AS valid`).bind(current.revision, themeRevision).first())?.valid)
            return json({ error: "Dependencies changed. Refresh before continuing." }, 409);
          return json({ entity: publicEntity(entity), dialogue, themeRevision, game: await gameState(u.id, admin, u.spawn.map) });
        }
        if (action === "unlock-transport") {
          const result = await unlockTransport(db,u.id,theme,themeRevision,id,phrase);
          if (result.error) return json({error:result.error},result.status);
          return json(await gameState(u.id,admin,u.spawn.map));
        }
        const current = await catalog();
        const { challenges } = current;
        const settings = await challengeSettings(db);
        const completions = (await db.prepare("SELECT challenge FROM solved WHERE user=?").bind(u.id).all()).results;
        const c = visibleChallenges(challenges, settings, admin, await playerMilestones(db, u.id, completions.map((r) => r.challenge))).find((c) => c.id === id);
        if (!c) return json({ error: "Unknown challenge." }, 400);
        const items = await inventoryState(db,u.id,theme);
        if (!admin && !accessibleMaps(theme,items.unlockedTransports,u.spawn.map).has(c.map) && !completions.some(r => r.challenge === c.id)) return json({error:"Unlock a route to this map before opening its challenges."},403);
        // Catalog and visibility revisions guard writes against a graph changed mid-request.
        const gate = "COALESCE((SELECT revision FROM challenge_catalog WHERE id='active'),0)=? AND COALESCE((SELECT revision FROM challenge_settings WHERE id='active'),0)=? AND COALESCE((SELECT revision FROM theme_catalog WHERE id='active'),0)=?";
        const versions = [current.revision, settings.revision, themeRevision];
        const changed = () => json({ error: "Challenges changed. Refresh before continuing." }, 409);
        if (action === "cutscene") {
          if (!["discovery", "solve"].includes(phase) || (replay !== undefined && typeof replay !== "boolean")) return json({error:"Choose a discovery or solve cutscene."},400);
          const solved = completions.some(r => r.challenge === c.id);
          const discovered = await db.prepare("SELECT challenge FROM discovered_challenges WHERE user=? AND challenge=?").bind(u.id,c.id).first();
          if (phase === "solve" ? !solved : !discovered && !solved) return json({error:"This cutscene is not unlocked yet."},403);
          const url = phase === "discovery" ? c.discoveryVideo : c.solveVideo;
          if (!url) return json({play:false});
          if (replay) return json({play:true,url});
          const result = await db.prepare(`INSERT OR IGNORE INTO challenge_cutscenes(user,challenge,phase) SELECT ?,?,? WHERE ${gate}`).bind(u.id,c.id,phase,...versions).run();
          if (!(await db.prepare(`SELECT ${gate} AS valid`).bind(...versions).first())?.valid) return changed();
          return json({play:!!(result.meta?.changes ?? result.changes),url});
        }
        if (action === "discover") {
          const discovered = await db
            .prepare(`INSERT OR IGNORE INTO discovered_challenges(user,challenge) SELECT ?,? WHERE ${gate}`)
            .bind(u.id, c.id, ...versions)
            .run();
          if (!(discovered.meta?.changes ?? discovered.changes) && !(await db.prepare(`SELECT ${gate} AS valid`).bind(...versions).first())?.valid) return changed();
          return json(await gameState(u.id, admin, u.spawn.map));
        }
        if (action === "hint") {
          const hint = c.hints.find((h) => h.id === hintId);
          if (!hint) return json({ error: "Unknown hint." }, 400);
          const rewardCost = JSON.stringify(normalizedHintRewardCost(hint.rewardCost));
          // One atomic statement prevents duplicate charges, shared-reward double spending, and purchase/solve races.
          await db
            .prepare(
              `INSERT OR IGNORE INTO purchased_hints(user,challenge,hint,cost,reward_cost)
            SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM solved WHERE user=? AND challenge=?) AND NOT EXISTS(SELECT 1 FROM written_responses WHERE user=? AND challenge=?) AND ${hintRewardAvailabilitySQL} AND ${gate}`,
            )
            .bind(u.id, c.id, hint.id, hint.cost, rewardCost, u.id, c.id, u.id, c.id, u.id, c.id, rewardCost, u.id, c.id, rewardCost, ...versions)
            .run();
          if (!(await db.prepare(`SELECT ${gate} AS valid`).bind(...versions).first())?.valid) return changed();
          const purchase = await db
            .prepare(
              "SELECT cost FROM purchased_hints WHERE user=? AND challenge=? AND hint=?",
            )
            .bind(u.id, c.id, hint.id)
            .first();
          if (!purchase)
            return json(
              {
                error:
                  "This hint cannot be purchased: an answer is submitted or complete, or a required reward was used for another hint.",
              },
              409,
            );
          return json({ ...(await gameState(u.id, admin, u.spawn.map)), unlockedHint: hint.id });
        }
        if (action !== undefined && action !== "answer")
          return json({ error: "Unknown action." }, 400);
        if (c.grading === "manual") {
          if (
            typeof answer !== "string" ||
            !answer.trim() ||
            answer.length > 20000 ||
            !Number.isInteger(revision) ||
            revision < 0
          )
            return json(
              { error: "Write an answer of 1–20,000 characters." },
              400,
            );
          const r = await db
            .prepare(
              `INSERT INTO written_responses(user,challenge,answer,question,object,max_points,rewards_payload,hint_cost,submitted_at,submitted_team,revision)
            SELECT ?,?,?,?,?,?,${hintAdjustedRewardsSQL},COALESCE((SELECT SUM(cost) FROM purchased_hints WHERE user=? AND challenge=?),0),?,COALESCE((SELECT t.name FROM team_members m JOIN teams t ON t.id=m.team WHERE m.user=?),''),1 WHERE NOT EXISTS(SELECT 1 FROM solved WHERE user=? AND challenge=?) AND COALESCE((SELECT revision FROM written_responses WHERE user=? AND challenge=?),0)=? AND ${gate}
            ON CONFLICT(user,challenge) DO UPDATE SET answer=excluded.answer,submitted_at=excluded.submitted_at,submitted_team=excluded.submitted_team,revision=written_responses.revision+1 WHERE written_responses.grade IS NULL AND written_responses.revision=?`,
            )
            .bind(
              u.id,
              c.id,
              answer.trim(),
              c.text,
              c.object,
              c.points,
              ...hintAdjustedRewardsBindings(c.rewards, u.id, c.id),
              u.id,
              c.id,
              Date.now(),
              u.id,
              u.id,
              c.id,
              u.id,
              c.id,
              revision,
              ...versions,
              revision,
            )
            .run();
          if (!(r.meta?.changes ?? r.changes))
            return json(
              {
                error:
                  "Your answer changed or has already been graded. Refresh before submitting again.",
              },
              409,
            );
          return json({ submitted: true, ...(await gameState(u.id, admin, u.spawn.map)) });
        }
        if (typeof answer !== "string" || answer.length > 500)
          return json({ error: "Invalid answer." }, 400);
        const correct = c.flagRules?.length ? c.flagRules.some(rule=>rule.caseSensitive ? answer === rule.value : answer.toLowerCase() === rule.value.toLowerCase()) : c.flags.some(flag=>normalize(flag,c.caseSensitive)===normalize(answer,c.caseSensitive));
        const attempt = db.prepare(`INSERT INTO answer_attempts(id,user,challenge,answer,question,object,correct,submitted_team,submitted_at)
          SELECT ?,?,?,?,?,?,?,COALESCE((SELECT t.name FROM team_members m JOIN teams t ON t.id=m.team WHERE m.user=?),''),? WHERE ${gate}`)
          .bind(crypto.randomUUID(),u.id,c.id,answer,c.text,c.object,+correct,u.id,Date.now(),...versions);
        if (!correct) { const result = await attempt.run(); if (!(result.meta?.changes ?? result.changes)) return changed(); return json({correct:false}); }
        // Record the attempt and award points together; duplicate solves still award once.
        const results = await db.batch([attempt, db.prepare(`INSERT OR IGNORE INTO solved(user,challenge,points)
          SELECT ?,?,MAX(0,?-COALESCE((SELECT SUM(cost) FROM purchased_hints WHERE user=? AND challenge=?),0)) WHERE ${gate}`)
          .bind(u.id,c.id,c.points,u.id,c.id,...versions),
          db.prepare(`INSERT OR IGNORE INTO earned_rewards(user,challenge,payload) SELECT user,challenge,${hintAdjustedRewardsSQL} FROM solved WHERE user=? AND challenge=? AND ${gate}`).bind(...hintAdjustedRewardsBindings(c.rewards,u.id,c.id),u.id,c.id,...versions)]);
        if (!(results[0].meta?.changes ?? results[0].changes)) return changed();
        const award = await db
          .prepare("SELECT points FROM solved WHERE user=? AND challenge=?")
          .bind(u.id, c.id)
          .first();
        return json({
          correct: true,
          awardedPoints: award.points,
          ...(await gameState(u.id, admin, u.spawn.map)),
        });
      }
    }
    return json({ error: "Not found." }, 404);
  }
  return async (req) => {
    try {
      return await dispatch(req);
    } catch (e) {
      if (e instanceof SyntaxError)
        return json({ error: "Invalid JSON." }, 400);
      console.error("Game API request failed:", e.name);
      return json(
        { error: "The expedition is temporarily unavailable. Please retry." },
        503,
      );
    }
  };
}

export function createApi(options) {
  return async (req) => {
    try {
      const current = await activeTheme(options.db, options.config);
      return await createRequestApi({
        ...options,
        config: {
          ...options.config,
          characters: current.theme.characters,
          audio: current.theme.audio,
        },
        theme: current.theme,
        themeRevision: current.revision,
      })(req);
    } catch (e) {
      console.error("Theme configuration unavailable:", e.name);
      return json(
        { error: "The game is temporarily unavailable. Please retry." },
        503,
      );
    }
  };
}
