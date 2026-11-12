-- Transient reactions follow presence visibility and are removed when a player leaves.
CREATE TABLE IF NOT EXISTS player_emotes (
  user TEXT PRIMARY KEY REFERENCES player_presence(user) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
