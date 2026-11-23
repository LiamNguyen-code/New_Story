CREATE TABLE `news` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`body` text NOT NULL,
	`cover` text NOT NULL,
	`cover_alt` text,
	`category` text,
	`publish_date` text NOT NULL,
	`updated_date` text,
	`draft` integer DEFAULT false NOT NULL,
	`seo_title` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `news_slug_unique` ON `news` (`slug`);--> statement-breakpoint
CREATE INDEX `news_publish_idx` ON `news` (`draft`,`publish_date`);