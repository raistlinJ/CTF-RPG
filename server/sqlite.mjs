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
CREATE TABLE IF NOT EXISTS students(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,hash TEXT NOT NULL,salt TEXT NOT NULL,hero TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'student',disabled INTEGER NOT NULL DEFAULT 0,managed INTEGER NOT NULL DEFAULT 0,provisioned INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user TEXT NOT NULL REFERENCES students(id),expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS solved(user TEXT NOT NULL REFERENCES students(id),challenge TEXT NOT NULL,points INTEGER NOT NULL,PRIMARY KEY(user,challenge));
CREATE TABLE IF NOT EXISTS purchased_hints(user TEXT NOT NULL REFERENCES students(id),challenge TEXT NOT NULL,hint TEXT NOT NULL,cost INTEGER NOT NULL,PRIMARY KEY(user,challenge,hint));
CREATE TABLE IF NOT EXISTS challenge_catalog(id TEXT PRIMARY KEY,payload TEXT NOT NULL,revision INTEGER NOT NULL);`);
  const columns = sqlite
    .prepare("PRAGMA table_info(students)")
    .all()
    .map((c) => c.name);
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
