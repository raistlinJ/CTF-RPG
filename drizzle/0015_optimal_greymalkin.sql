CREATE TABLE `ctfd_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`digest` text NOT NULL,
	`created_at` integer NOT NULL,
	`report` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ctfd_imports_digest_unique` ON `ctfd_imports` (`digest`);--> statement-breakpoint
CREATE TABLE `notification_reads` (
	`notification` text NOT NULL,
	`user` text NOT NULL,
	`read_at` integer NOT NULL,
	PRIMARY KEY(`notification`, `user`),
	FOREIGN KEY (`notification`) REFERENCES `notifications`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `notification_recipients` (
	`notification` text NOT NULL,
	`username` text NOT NULL,
	PRIMARY KEY(`notification`, `username`),
	FOREIGN KEY (`notification`) REFERENCES `notifications`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_notification_recipient_username` ON `notification_recipients` (`username`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`author` text NOT NULL,
	`scope` text NOT NULL,
	`targets` text NOT NULL,
	`created_at` integer NOT NULL
);
