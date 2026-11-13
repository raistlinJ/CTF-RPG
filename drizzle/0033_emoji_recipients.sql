-- NULL retains team delivery; a user recipient is visible only to the sender,
-- recipient and the administrator moderation history.
ALTER TABLE team_messages ADD COLUMN recipient_user TEXT REFERENCES students(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_team_messages_recipient_user_created ON team_messages(recipient_user,created_at);
