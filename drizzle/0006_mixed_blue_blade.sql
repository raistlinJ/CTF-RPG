CREATE TABLE `written_responses` (
	`user` text NOT NULL,
	`challenge` text NOT NULL,
	`answer` text NOT NULL,
	`question` text NOT NULL,
	`object` text NOT NULL,
	`max_points` integer NOT NULL,
	`hint_cost` integer NOT NULL,
	`submitted_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`grade` integer,
	`feedback` text DEFAULT '' NOT NULL,
	`reviewer` text,
	`graded_at` integer,
	PRIMARY KEY(`user`, `challenge`),
	FOREIGN KEY (`user`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
