CREATE TABLE `answer_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`user` text NOT NULL,
	`challenge` text NOT NULL,
	`answer` text NOT NULL,
	`question` text NOT NULL,
	`object` text NOT NULL,
	`correct` integer NOT NULL,
	`submitted_team` text NOT NULL,
	`submitted_at` integer NOT NULL,
	FOREIGN KEY (`user`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_answer_attempts_submitted` ON `answer_attempts` (`submitted_at`);--> statement-breakpoint
CREATE INDEX `idx_answer_attempts_correct_submitted` ON `answer_attempts` (`correct`,`submitted_at`);--> statement-breakpoint
ALTER TABLE `written_responses` ADD `submitted_team` text;