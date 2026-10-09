CREATE TABLE `admin_user_action_guard` (
	`id` text PRIMARY KEY NOT NULL,
	`valid` integer NOT NULL,
	CONSTRAINT "admin_user_action_valid" CHECK("admin_user_action_guard"."valid" = 1)
);
--> statement-breakpoint
CREATE TABLE `deleted_accounts` (
	`username` text PRIMARY KEY NOT NULL,
	`deleted_at` integer NOT NULL
);
