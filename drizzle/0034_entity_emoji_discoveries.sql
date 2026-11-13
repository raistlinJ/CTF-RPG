CREATE TABLE IF NOT EXISTS entity_emoji_discoveries (
  user TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  entity TEXT NOT NULL,
  emoji TEXT NOT NULL,
  discovered_at INTEGER NOT NULL,
  PRIMARY KEY(user,entity,emoji)
);
