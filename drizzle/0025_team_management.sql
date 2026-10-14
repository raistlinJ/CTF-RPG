ALTER TABLE `teams` ADD `muted` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `teams` ADD `disabled` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `teams` ADD `revision` integer DEFAULT 0 NOT NULL;