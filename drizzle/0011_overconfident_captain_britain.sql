CREATE TABLE `instructor_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`sender_user` text NOT NULL,
	`team` text NOT NULL,
	`sender` text NOT NULL,
	`text` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`sender_user`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_instructor_messages_team_created` ON `instructor_messages` (`team`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_instructor_messages_sender_created` ON `instructor_messages` (`sender_user`,`created_at`);--> statement-breakpoint
CREATE TABLE `scoreboard_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`visibility` text NOT NULL,
	`mode` text NOT NULL,
	`revision` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `students` ADD `muted` integer DEFAULT 0 NOT NULL;