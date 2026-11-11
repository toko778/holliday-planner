CREATE TABLE `ai_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`trip_id` text NOT NULL,
	`revision` integer NOT NULL,
	`started_at` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `requests_owner_time` ON `ai_requests` (`owner_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `requests_time` ON `ai_requests` (`started_at`);--> statement-breakpoint
CREATE TABLE `trips` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`input_json` text NOT NULL,
	`result_json` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `trips_owner_updated` ON `trips` (`owner_id`,`updated_at`);