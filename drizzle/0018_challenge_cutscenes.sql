CREATE TABLE `challenge_cutscenes` (
	`user` text NOT NULL,
	`challenge` text NOT NULL,
	`phase` text NOT NULL,
	PRIMARY KEY(`user`, `challenge`, `phase`),
	FOREIGN KEY (`user`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "challenge_cutscenes_phase" CHECK("challenge_cutscenes"."phase" IN ('discovery', 'solve'))
);
