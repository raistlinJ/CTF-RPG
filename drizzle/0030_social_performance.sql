CREATE INDEX IF NOT EXISTS idx_team_messages_created_id ON team_messages(created_at,id);
CREATE INDEX IF NOT EXISTS idx_instructor_messages_created_id ON instructor_messages(created_at,id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_expires ON sessions(user,expires);
CREATE INDEX IF NOT EXISTS idx_solved_challenge ON solved(challenge);
CREATE INDEX IF NOT EXISTS idx_notifications_created_id ON notifications(created_at,id);
