ALTER TABLE `students` ADD `role` text DEFAULT 'student' NOT NULL;--> statement-breakpoint
ALTER TABLE `students` ADD `disabled` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `students` ADD `managed` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `students` ADD `provisioned` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `students` ADD `revision` integer DEFAULT 0 NOT NULL;