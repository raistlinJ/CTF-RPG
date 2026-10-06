CREATE TABLE `team_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`sender_user` text,
	`sender_team` text,
	`recipient_team` text NOT NULL,
	`sender` text NOT NULL,
	`text` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`sender_user`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sender_team`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipient_team`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_team_messages_recipient_created` ON `team_messages` (`recipient_team`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_team_messages_sender_team_created` ON `team_messages` (`sender_team`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_team_messages_sender_user_created` ON `team_messages` (`sender_user`,`created_at`);--> statement-breakpoint
CREATE TABLE `team_social_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`names` integer NOT NULL,
	`scores` integer NOT NULL,
	`messaging` integer NOT NULL,
	`revision` integer NOT NULL
);
