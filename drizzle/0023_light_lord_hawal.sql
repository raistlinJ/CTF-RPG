CREATE TABLE `integration_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integration_tokens_token_hash_unique` ON `integration_tokens` (`token_hash`);