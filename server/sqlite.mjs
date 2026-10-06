export function createSQLiteAdapter(sqlite) {
  return {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return {
        bind(...args) {
          return {
            async first() {
              return statement.get(...args) || null;
            },
            async all() {
              return { results: statement.all(...args) };
            },
            async run() {
              const r = statement.run(...args);
              return {
                meta: { changes: Number(r.changes) },
                changes: Number(r.changes),
              };
            },
            _execute() {
              if (statement.columns().length)
                return {
                  results: statement.all(...args),
                  meta: { changes: 0 },
                };
              const r = statement.run(...args);
              return {
                results: [],
                meta: { changes: Number(r.changes) },
                changes: Number(r.changes),
              };
            },
          };
        },
      };
    },
    async batch(statements) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map((s) => s._execute());
        sqlite.exec("COMMIT");
        return results;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
export function initializeSchema(sqlite) {
  sqlite.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS students(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,hash TEXT NOT NULL,salt TEXT NOT NULL,hero TEXT NOT NULL,spawn TEXT,role TEXT NOT NULL DEFAULT 'student',disabled INTEGER NOT NULL DEFAULT 0,managed INTEGER NOT NULL DEFAULT 0,provisioned INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS teams(id TEXT PRIMARY KEY,name TEXT NOT NULL,name_key TEXT NOT NULL UNIQUE,hash TEXT NOT NULL,salt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS team_members(user TEXT PRIMARY KEY REFERENCES students(id),team TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team);
CREATE TABLE IF NOT EXISTS team_settings(id TEXT PRIMARY KEY,max_members INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS presence_settings(id TEXT PRIMARY KEY,visibility TEXT NOT NULL,revision INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS player_presence(user TEXT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,map TEXT NOT NULL,x INTEGER NOT NULL,y INTEGER NOT NULL,theme_revision INTEGER NOT NULL,updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_player_presence_map_revision_updated ON player_presence(map,theme_revision,updated_at);
CREATE TABLE IF NOT EXISTS team_social_settings(id TEXT PRIMARY KEY,names INTEGER NOT NULL,scores INTEGER NOT NULL,messaging INTEGER NOT NULL,revision INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS team_messages(id TEXT PRIMARY KEY,sender_user TEXT REFERENCES students(id),sender_team TEXT REFERENCES teams(id) ON DELETE CASCADE,recipient_team TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,sender TEXT NOT NULL,text TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_team_messages_recipient_created ON team_messages(recipient_team,created_at);
CREATE INDEX IF NOT EXISTS idx_team_messages_sender_team_created ON team_messages(sender_team,created_at);
CREATE INDEX IF NOT EXISTS idx_team_messages_sender_user_created ON team_messages(sender_user,created_at);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user TEXT NOT NULL REFERENCES students(id),expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS solved(user TEXT NOT NULL REFERENCES students(id),challenge TEXT NOT NULL,points INTEGER NOT NULL,PRIMARY KEY(user,challenge));
CREATE TABLE IF NOT EXISTS purchased_hints(user TEXT NOT NULL REFERENCES students(id),challenge TEXT NOT NULL,hint TEXT NOT NULL,cost INTEGER NOT NULL,PRIMARY KEY(user,challenge,hint));
CREATE TABLE IF NOT EXISTS written_responses(user TEXT NOT NULL REFERENCES students(id),challenge TEXT NOT NULL,answer TEXT NOT NULL,question TEXT NOT NULL,object TEXT NOT NULL,max_points INTEGER NOT NULL,hint_cost INTEGER NOT NULL,submitted_at INTEGER NOT NULL,revision INTEGER NOT NULL DEFAULT 1,grade INTEGER,feedback TEXT NOT NULL DEFAULT '',reviewer TEXT,graded_at INTEGER,PRIMARY KEY(user,challenge));
CREATE TABLE IF NOT EXISTS theme_catalog(id TEXT PRIMARY KEY,payload TEXT NOT NULL,revision INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS challenge_catalog(id TEXT PRIMARY KEY,payload TEXT NOT NULL,revision INTEGER NOT NULL);`);
  const columns = sqlite
    .prepare("PRAGMA table_info(students)")
    .all()
    .map((c) => c.name);
  if (!columns.includes("spawn"))
    sqlite.exec("ALTER TABLE students ADD COLUMN spawn TEXT");
  for (const [name, type, defaultValue] of [
    ["role", "TEXT", "'student'"],
    ["disabled", "INTEGER", "0"],
    ["managed", "INTEGER", "0"],
    ["provisioned", "INTEGER", "0"],
    ["revision", "INTEGER", "0"],
  ])
    if (!columns.includes(name))
      sqlite.exec(
        `ALTER TABLE students ADD COLUMN ${name} ${type} NOT NULL DEFAULT ${defaultValue}`,
      );
}
