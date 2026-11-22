CREATE TABLE `page_views` (
	`day` text NOT NULL,
	`story_id` integer NOT NULL,
	`chapter` integer NOT NULL,
	`owner_id` integer DEFAULT 0 NOT NULL,
	`views` integer DEFAULT 0 NOT NULL,
	`uniques` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`day`, `story_id`, `chapter`, `owner_id`),
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `page_views_day_idx` ON `page_views` (`day`);--> statement-breakpoint
ALTER TABLE `stories` ADD `owner_id` integer REFERENCES users(id);--> statement-breakpoint
-- Truyện cũ: gán cho tài khoản admin đầu tiên
UPDATE `stories` SET `owner_id` = (SELECT `id` FROM `users` WHERE `role` = 'admin' ORDER BY `id` LIMIT 1) WHERE `owner_id` IS NULL;
