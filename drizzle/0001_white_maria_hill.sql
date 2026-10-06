CREATE TABLE `purchased_hints` (
	`user` text NOT NULL,
	`challenge` text NOT NULL,
	`hint` text NOT NULL,
	`cost` integer NOT NULL,
	PRIMARY KEY(`user`, `challenge`, `hint`),
	FOREIGN KEY (`user`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
