CREATE TABLE `team_members` (
	`user` text PRIMARY KEY NOT NULL,
	`team` text NOT NULL,
	FOREIGN KEY (`user`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_team_members_team` ON `team_members` (`team`);--> statement-breakpoint
CREATE TABLE `team_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`max_members` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`hash` text NOT NULL,
	`salt` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teams_name_key_unique` ON `teams` (`name_key`);