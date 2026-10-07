import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
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
      sqlite.prepare("SELECT COUNT(*) AS n FROM teams").get().n)
  )
    throw Error(
      "Restore requires an empty database. Use --replace only when you intend to replace its accounts and progress.",
    );
  sqlite.exec("BEGIN IMMEDIATE");
  try {
    for (const table of [
      "instructor_messages",
      "scoreboard_settings",
      "team_messages",
      "team_social_settings",
      "player_presence",
      "presence_settings",
      "sessions",
      "written_responses",
      "discovered_challenges",
      "solved",
      "purchased_hints",
      "team_members",
      "teams",
      "team_settings",
      "students",
      "challenge_catalog",
      "theme_catalog",
    ])
      sqlite.prepare(`DELETE FROM ${table}`).run();
    const insert = sqlite.prepare(
      "INSERT INTO students(id,username,hash,salt,hero,role,disabled,managed,provisioned,revision,spawn,muted) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
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
        a.managed,
        a.provisioned,
        a.revision,
        a.spawn ? JSON.stringify(a.spawn) : null,
        a.muted,
      );
    for (const t of snapshot.teams)
      sqlite
        .prepare(
          "INSERT INTO teams(id,name,name_key,hash,salt) VALUES(?,?,?,?,?)",
        )
        .run(t.id, t.name, t.name_key, t.hash, t.salt);
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
    for (const r of snapshot.writtenResponses)
      sqlite
        .prepare(
          "INSERT INTO written_responses(user,challenge,answer,question,object,max_points,hint_cost,submitted_at,revision,grade,feedback,reviewer,graded_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          r.user,
          r.challenge,
          r.answer,
          r.question,
          r.object,
          r.maxPoints,
          r.hintCost,
          r.submittedAt,
          r.revision,
          r.grade,
          r.feedback,
          r.reviewer,
          r.gradedAt,
        );
    const hints = sqlite.prepare(
      "INSERT INTO purchased_hints(user,challenge,hint,cost) VALUES(?,?,?,?)",
    );
    for (const r of snapshot.purchasedHints)
      hints.run(r.user, r.challenge, r.hint, r.cost);
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
  writeFileSync(resolve(root, "content/game.yaml"), stringify(snapshot.config));
  writeFileSync(
    resolve(root, "content/challenges.yaml"),
    stringify({ challenges: snapshot.challenges }),
  );
  console.log(
    `Restored ${snapshot.accounts.length} accounts, ${snapshot.challenges.length} challenges, ${snapshot.solved.length} completions, and ${snapshot.purchasedHints.length} hint purchases. All users must sign in again.`,
  );
  if (!snapshot.accounts.some((a) => a.role === "admin" && !a.disabled))
    console.log(
      "No local admin account is present. Add a role: admin account in content/game.yaml before starting the standalone server.",
    );
} finally {
  sqlite.close();
}
