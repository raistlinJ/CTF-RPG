// Mirrors drizzle/0031_notification_revisions.sql for the native runtime image.
export const notificationRevisionSchema = `-- Derived invalidation tokens; notification contents and audiences stay authoritative.
CREATE TABLE IF NOT EXISTS social_revisions(id TEXT PRIMARY KEY,revision INTEGER NOT NULL DEFAULT 0);
INSERT OR IGNORE INTO social_revisions VALUES('notifications',0);
CREATE TRIGGER IF NOT EXISTS notifications_revision_insert AFTER INSERT ON notifications BEGIN UPDATE social_revisions SET revision=revision+1 WHERE id='notifications'; END;
CREATE TRIGGER IF NOT EXISTS notifications_revision_update AFTER UPDATE ON notifications BEGIN UPDATE social_revisions SET revision=revision+1 WHERE id='notifications'; END;
CREATE TRIGGER IF NOT EXISTS notifications_revision_delete AFTER DELETE ON notifications BEGIN UPDATE social_revisions SET revision=revision+1 WHERE id='notifications'; END;
CREATE TRIGGER IF NOT EXISTS notification_audience_revision_insert AFTER INSERT ON notification_recipients BEGIN UPDATE social_revisions SET revision=revision+1 WHERE id='notifications'; END;
CREATE TRIGGER IF NOT EXISTS notification_audience_revision_update AFTER UPDATE ON notification_recipients BEGIN UPDATE social_revisions SET revision=revision+1 WHERE id='notifications'; END;
CREATE TRIGGER IF NOT EXISTS notification_audience_revision_delete AFTER DELETE ON notification_recipients BEGIN UPDATE social_revisions SET revision=revision+1 WHERE id='notifications'; END;
CREATE TRIGGER IF NOT EXISTS notification_reads_revision_insert AFTER INSERT ON notification_reads BEGIN INSERT INTO social_revisions VALUES('notification:reads:'||NEW.user,1) ON CONFLICT(id) DO UPDATE SET revision=revision+1; END;
CREATE TRIGGER IF NOT EXISTS notification_reads_revision_update AFTER UPDATE ON notification_reads BEGIN
 INSERT INTO social_revisions VALUES('notification:reads:'||OLD.user,1) ON CONFLICT(id) DO UPDATE SET revision=revision+1;
 INSERT INTO social_revisions VALUES('notification:reads:'||NEW.user,1) ON CONFLICT(id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER IF NOT EXISTS notification_reads_revision_delete AFTER DELETE ON notification_reads BEGIN INSERT INTO social_revisions VALUES('notification:reads:'||OLD.user,1) ON CONFLICT(id) DO UPDATE SET revision=revision+1; END;
CREATE TRIGGER IF NOT EXISTS notification_reads_revision_user_delete AFTER DELETE ON students BEGIN DELETE FROM social_revisions WHERE id='notification:reads:'||OLD.id; END;
`;
