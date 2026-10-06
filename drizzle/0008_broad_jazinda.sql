CREATE TABLE `player_presence` (
	`user` text PRIMARY KEY NOT NULL,
	`map` text NOT NULL,
	`x` integer NOT NULL,
	`y` integer NOT NULL,
	`theme_revision` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_player_presence_map_revision_updated` ON `player_presence` (`map`,`theme_revision`,`updated_at`);--> statement-breakpoint
CREATE TABLE `presence_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`visibility` text NOT NULL,
	`revision` integer NOT NULL
);
