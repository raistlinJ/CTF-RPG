CREATE TABLE IF NOT EXISTS personal_chat_settings (
  user TEXT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  mute_all INTEGER NOT NULL DEFAULT 0 CHECK(mute_all IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS personal_chat_mutes (
  user TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  target TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  muted INTEGER NOT NULL CHECK(muted IN (0,1)),
  PRIMARY KEY(user,target),
  CHECK(user<>target)
);
