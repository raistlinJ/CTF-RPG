CREATE TABLE `discovered_challenges` (
	`user` text NOT NULL,
	`challenge` text NOT NULL,
	PRIMARY KEY(`user`, `challenge`),
	FOREIGN KEY (`user`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
