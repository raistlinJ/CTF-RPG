import { readFileSync, mkdirSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { stringify } from "yaml";
import { validateSnapshot } from "./backup.mjs";
import { initializeSchema } from "./sqlite.mjs";
const args = process.argv.slice(2),
  file = args.find((a) => !a.startsWith("--"));
if (!file)
  throw Error(
    "Usage: npm run restore -- backup.json [--replace] [--admin USERNAME]",
  );
const snapshot = validateSnapshot(
    JSON.parse(readFileSync(resolve(file), "utf8")),
  ),
  root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const adminIndex = args.indexOf("--admin");
if (adminIndex >= 0) {
  const name = args[adminIndex + 1]?.toLowerCase(),
    a = snapshot.accounts.find((a) => a.username === name);
  if (!a) throw Error("The --admin username is not in this backup.");
  a.role = "admin";
  a.managed = 1;
  a.provisioned = 1;
  a.disabled = 0;
  snapshot.config.admin.protectedUsername = name;
  snapshot.config.accounts.users = [...snapshot.config.accounts.users.filter(u => u.username !== name), {username:name, role:'admin', hero:a.hero, spawn:a.spawn, passwordHash:a.hash, salt:a.salt}];
}
const path = resolve(
  process.env.DATABASE_PATH || resolve(root, "data/quest.sqlite"),
);
mkdirSync(dirname(path), { recursive: true });
const sqlite = new DatabaseSync(path);
initializeSchema(sqlite);
try {
  if (
    !args.includes("--replace") &&
    (sqlite.prepare("SELECT COUNT(*) AS n FROM students").get().n ||
      sqlite.prepare("SELECT COUNT(*) AS n FROM challenge_catalog").get().n ||
      sqlite.prepare("SELECT COUNT(*) AS n FROM teams").get().n ||
      sqlite.prepare("SELECT COUNT(*) AS n FROM deleted_accounts").get().n)
  )
    throw Error(
      "Restore requires an empty database. Use --replace only when you intend to replace its accounts and progress.",
    );
  sqlite.exec("BEGIN IMMEDIATE");
  try {
    for (const table of [
      "admin_user_action_guard",
      "deleted_accounts",
      "notification_reads",
      "notification_recipients",
      "notifications",
      "ctfd_imports",
      "instructor_messages",
      "answer_attempts",
      "scoreboard_settings",
      "challenge_settings",
      "registration_settings",
      "team_messages",
      "team_social_settings",
      "player_presence",
      "presence_settings",
      "sessions",
      "written_responses",
      "discovered_challenges",
      "challenge_cutscenes",
      "entity_activations",
      "entity_dialogue_progress",
      "entity_dialogue_outputs",
      "earned_rewards",
      "unlocked_transports",
      "solved",
      "purchased_hints",
      "team_point_awards",
      "team_members",
      "teams",
      "team_settings",
      "students",
      "challenge_catalog",
      "theme_catalog",
    ])
      sqlite.prepare(`DELETE FROM ${table}`).run();
    const insert = sqlite.prepare(
      "INSERT INTO students(id,username,hash,salt,hero,role,disabled,managed,provisioned,revision,spawn,muted,hero_selected) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
    );
    for (const a of snapshot.accounts)
      insert.run(
        a.id,
        a.username,
        a.hash,
        a.salt,
        a.hero,
        a.role,
        a.disabled,
        1,
        1,
        a.revision,
        a.spawn ? JSON.stringify(a.spawn) : null,
        a.muted,
        a.heroSelected,
      );
    for (const a of snapshot.deletedAccounts) sqlite.prepare("INSERT INTO deleted_accounts(username,deleted_at) VALUES(?,?)").run(a.username,a.deleted_at);
    for (const t of snapshot.teams)
      sqlite
        .prepare(
          "INSERT INTO teams(id,name,name_key,hash,salt,muted,disabled,revision) VALUES(?,?,?,?,?,?,?,?)",
        )
        .run(t.id, t.name, t.name_key, t.hash, t.salt, t.muted, t.disabled, t.revision);
    const insertGift = sqlite.prepare("INSERT INTO team_point_awards(id,team,points,comment,awarded_by,created_at) VALUES(?,?,?,?,?,?)");
    for (const a of snapshot.teamPointAwards) insertGift.run(a.id,a.team,a.points,a.comment,a.awarded_by,a.created_at);
    for (const m of snapshot.teamMembers)
      sqlite
        .prepare("INSERT INTO team_members(user,team) VALUES(?,?)")
        .run(m.user, m.team);
    sqlite
      .prepare("INSERT INTO team_settings(id,max_members) VALUES('active',?)")
      .run(snapshot.teamMaxMembers ?? snapshot.config.teams.maxMembers);
    sqlite
      .prepare(
        "INSERT INTO presence_settings(id,visibility,revision) VALUES('active',?,1)",
      )
      .run(snapshot.playerVisibility || snapshot.config.presence.visibility);
    sqlite.prepare("INSERT INTO challenge_settings(id,visibility,revision) VALUES('active',?,1)").run(snapshot.challengeSettings?.visibility || "all");
    sqlite.prepare("INSERT INTO registration_settings(id,allow_registration,revision) VALUES('active',?,?)")
      .run(+(snapshot.registrationSettings?.allowRegistration ?? snapshot.config.accounts.allowRegistration), snapshot.registrationSettings?.revision || 1);
    const scoreSettings = snapshot.scoreboardSettings || {
      visibility: "all",
      mode: "individual",
    };
    sqlite
      .prepare(
        "INSERT INTO scoreboard_settings(id,visibility,mode,revision) VALUES('active',?,?,1)",
      )
      .run(scoreSettings.visibility, scoreSettings.mode);
    const instructorInsert = sqlite.prepare(
      "INSERT INTO instructor_messages(id,sender_user,team,sender,text,created_at) VALUES(?,?,?,?,?,?)",
    );
    for (const m of snapshot.instructorMessages)
      instructorInsert.run(
        m.id,
        m.sender_user,
        m.team,
        m.sender,
        m.text,
        m.created_at,
      );
    const discovered = sqlite.prepare(
      "INSERT INTO discovered_challenges(user,challenge) VALUES(?,?)",
    );
    for (const d of snapshot.discoveries) discovered.run(d.user, d.challenge);
    const activation = sqlite.prepare("INSERT INTO entity_activations(user,entity) VALUES(?,?)");
    for (const a of snapshot.entityActivations) activation.run(a.user, a.entity);
    const dialogueProgress = sqlite.prepare("INSERT INTO entity_dialogue_progress(user,entity,session,node,text,path,completed) VALUES(?,?,?,?,?,?,?)");
    for (const p of snapshot.entityDialogueProgress) dialogueProgress.run(p.user, p.entity, p.session, p.node, p.text, p.path, p.completed);
    const dialogueOutput = sqlite.prepare("INSERT INTO entity_dialogue_outputs(user,entity,node) VALUES(?,?,?)");
    for (const p of snapshot.entityDialogueOutputs) dialogueOutput.run(p.user, p.entity, p.node);
    const cutscene = sqlite.prepare("INSERT INTO challenge_cutscenes(user,challenge,phase) VALUES(?,?,?)");
    for (const c of snapshot.cutscenes) cutscene.run(c.user, c.challenge, c.phase);
    const features = snapshot.teamFeatures || snapshot.config.teams.features;
    const everyone = features.everyone || features;
    sqlite
      .prepare(
        "INSERT INTO team_social_settings(id,names,scores,messaging,everyone_names,everyone_scores,everyone_messaging,revision) VALUES('active',?,?,?,?,?,?,1)",
      )
      .run(
        +features.names,
        +features.scores,
        +features.messaging,
        +everyone.names,
        +everyone.scores,
        +everyone.messaging,
      );
    const insertMessage = sqlite.prepare(
      "INSERT INTO team_messages(id,sender_user,sender_team,recipient_team,sender,text,created_at) VALUES(?,?,?,?,?,?,?)",
    );
    for (const m of snapshot.teamMessages)
      insertMessage.run(
        m.id,
        m.sender_user,
        m.sender_team,
        m.recipient_team,
        m.sender,
        m.text,
        m.created_at,
      );
    const solved = sqlite.prepare(
      "INSERT INTO solved(user,challenge,points) VALUES(?,?,?)",
    );
    for (const r of snapshot.solved) solved.run(r.user, r.challenge, r.points);
    const rewards = sqlite.prepare("INSERT INTO earned_rewards(user,challenge,payload) VALUES(?,?,?)");
    for (const r of snapshot.earnedRewards) rewards.run(r.user,r.challenge,JSON.stringify(r.rewards));
    // Older backups retain their completed scores without awarding new inventory retroactively.
    sqlite.exec(`INSERT OR IGNORE INTO earned_rewards(user,challenge,payload) SELECT user,challenge,'{"keys":[],"incantations":[]}' FROM solved`);
    const unlocks = sqlite.prepare("INSERT INTO unlocked_transports(user,transport,signature) VALUES(?,?,?)");
    for (const r of snapshot.unlockedTransports) unlocks.run(r.user,r.transport,r.signature);
    for (const r of snapshot.writtenResponses)
      sqlite
        .prepare(
          "INSERT INTO written_responses(user,challenge,answer,question,object,max_points,rewards_payload,hint_cost,submitted_at,submitted_team,revision,grade,feedback,reviewer,graded_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          r.user,
          r.challenge,
          r.answer,
          r.question,
          r.object,
          r.maxPoints,
          JSON.stringify(r.rewards),
          r.hintCost,
          r.submittedAt,
          r.submittedTeam ?? null,
          r.revision,
          r.grade,
          r.feedback,
          r.reviewer,
          r.gradedAt,
        );
    for(const n of snapshot.notifications)sqlite.prepare("INSERT INTO notifications(id,title,body,author,scope,targets,created_at) VALUES(?,?,?,?,?,?,?)").run(n.id,n.title,n.body,n.author,n.scope,n.targets,n.created_at);
    for(const n of snapshot.notificationRecipients)sqlite.prepare("INSERT INTO notification_recipients(notification,username) VALUES(?,?)").run(n.notification,n.username);
    for(const n of snapshot.notificationReads)sqlite.prepare("INSERT INTO notification_reads(notification,user,read_at) VALUES(?,?,?)").run(n.notification,n.user,n.read_at);
    for(const n of snapshot.ctfdImports)sqlite.prepare("INSERT INTO ctfd_imports(id,digest,created_at,report) VALUES(?,?,?,?)").run(n.id,n.digest,n.created_at,n.report);
    const attempts = sqlite.prepare("INSERT INTO answer_attempts(id,user,challenge,answer,question,object,correct,submitted_team,submitted_at) VALUES(?,?,?,?,?,?,?,?,?)");
    for (const a of snapshot.answerAttempts) attempts.run(a.id,a.user,a.challenge,a.answer,a.question,a.object,a.correct,a.submitted_team,a.submitted_at);
    const hints = sqlite.prepare(
      "INSERT INTO purchased_hints(user,challenge,hint,cost,reward_cost) VALUES(?,?,?,?,?)",
    );
    for (const r of snapshot.purchasedHints)
      hints.run(r.user, r.challenge, r.hint, r.cost, JSON.stringify(r.rewardCost));
    sqlite
      .prepare(
        "INSERT INTO challenge_catalog(id,payload,revision) VALUES('active',?,1)",
      )
      .run(JSON.stringify(snapshot.challenges));
    if (snapshot.theme)
      sqlite
        .prepare(
          "INSERT INTO theme_catalog(id,payload,revision) VALUES('active',?,1)",
        )
        .run(JSON.stringify(snapshot.theme));
    sqlite.exec("COMMIT");
  } catch (e) {
    sqlite.exec("ROLLBACK");
    throw e;
  }
  mkdirSync(resolve(root, "content"), { recursive: true });
  // Credentials remain in the restored database. Only the protected name belongs
  // in deployment configuration; never export an original .env or plaintext pass.
  const envPath = resolve(root, ".env");
  const sourceEnv = existsSync(envPath) ? readFileSync(envPath, "utf8")
    : existsSync(resolve(root, ".env.sample")) ? readFileSync(resolve(root, ".env.sample"), "utf8") : "ADMIN_USERNAME=\nADMIN_PASSWORD=\n";
  const name = snapshot.config.admin.protectedUsername || "";
  const restoredEnv = /^ADMIN_USERNAME=.*$/m.test(sourceEnv)
    ? sourceEnv.replace(/^ADMIN_USERNAME=.*$/m, `ADMIN_USERNAME=${name}`)
    : sourceEnv + `\nADMIN_USERNAME=${name}\n`;
  writeFileSync(envPath, restoredEnv, { mode: 0o600 });
  chmodSync(envPath, 0o600);
  writeFileSync(
    resolve(root, "content/challenges.yaml"),
    stringify({ challenges: snapshot.challenges }),
  );
  console.log(
    `Restored ${snapshot.accounts.length} accounts, ${snapshot.challenges.length} challenges, ${snapshot.solved.length} completions, and ${snapshot.purchasedHints.length} hint purchases. All users must sign in again.`,
  );
  if (!snapshot.config.admin.protectedUsername)
    console.log(
      "Set ADMIN_USERNAME in the root .env to an admin in this backup, or restore with --admin USERNAME. Existing passwords are restored from the database; ADMIN_PASSWORD is needed only to create a new administrator.",
    );
} finally {
  sqlite.close();
}
