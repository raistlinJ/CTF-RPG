CREATE TABLE `sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`user`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `solved` (
	`user` text NOT NULL,
	`challenge` text NOT NULL,
	`points` integer NOT NULL,
	PRIMARY KEY(`user`, `challenge`),
	FOREIGN KEY (`user`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `students` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`hash` text NOT NULL,
	`salt` text NOT NULL,
	`hero` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `students_username_unique` ON `students` (`username`);