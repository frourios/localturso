CREATE TABLE `databases` (
	`name` text PRIMARY KEY NOT NULL,
	`id` text NOT NULL,
	`group_name` text NOT NULL,
	`token_version` integer DEFAULT 0 NOT NULL,
	`block_reads` integer DEFAULT false NOT NULL,
	`block_writes` integer DEFAULT false NOT NULL,
	`delete_protection` integer DEFAULT false NOT NULL,
	`parent_id` text,
	`parent_name` text,
	`branched_at` text,
	FOREIGN KEY (`group_name`) REFERENCES `groups`(`name`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `databases_id_unique` ON `databases` (`id`);--> statement-breakpoint
CREATE TABLE `groups` (
	`name` text PRIMARY KEY NOT NULL,
	`id` text NOT NULL,
	`location` text NOT NULL,
	`token_version` integer DEFAULT 0 NOT NULL,
	`delete_protection` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `groups_id_unique` ON `groups` (`id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
