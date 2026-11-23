ALTER TABLE `news` ADD `owner_id` integer REFERENCES users(id);--> statement-breakpoint
-- Tin cũ: gán cho tài khoản admin đầu tiên
UPDATE `news` SET `owner_id` = (SELECT `id` FROM `users` WHERE `role` = 'admin' ORDER BY `id` LIMIT 1) WHERE `owner_id` IS NULL;
