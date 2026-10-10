CREATE TABLE `earned_rewards` (
	`user` text NOT NULL,
	`challenge` text NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`user`, `challenge`),
	FOREIGN KEY (`user`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `unlocked_transports` (
	`user` text NOT NULL,
	`transport` text NOT NULL,
	`signature` text NOT NULL,
	PRIMARY KEY(`user`, `transport`),
	FOREIGN KEY (`user`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `written_responses` ADD `rewards_payload` text DEFAULT '{"keys":[],"incantations":[]}' NOT NULL;
--> statement-breakpoint
INSERT OR IGNORE INTO earned_rewards(user,challenge,payload) SELECT user,challenge,'{"keys":[],"incantations":[]}' FROM solved;
