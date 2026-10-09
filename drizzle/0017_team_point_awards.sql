CREATE TABLE `team_point_awards` (
	`id` text PRIMARY KEY NOT NULL,
	`team` text NOT NULL,
	`points` integer NOT NULL,
	`comment` text NOT NULL,
	`awarded_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`team`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "team_point_awards_points_check" CHECK("team_point_awards"."points" BETWEEN 1 AND 10000)
);
--> statement-breakpoint
CREATE INDEX `idx_team_point_awards_team_created` ON `team_point_awards` (`team`,`created_at`);