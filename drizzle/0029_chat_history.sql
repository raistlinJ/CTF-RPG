CREATE TABLE IF NOT EXISTS chat_history_settings(user TEXT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,cleared_through INTEGER NOT NULL DEFAULT 0 CHECK(cleared_through>=0));
