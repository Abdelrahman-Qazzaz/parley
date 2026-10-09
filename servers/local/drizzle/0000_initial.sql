CREATE TABLE `attachment_turn_reservations` (
	`attachment_upload_id` text NOT NULL,
	`claim_token` text NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`attachment_upload_id`, `claim_token`),
	FOREIGN KEY (`attachment_upload_id`) REFERENCES `attachment_uploads`(`attachment_upload_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `attachment_turn_reservations_claim_idx` ON `attachment_turn_reservations` (`claim_token`);--> statement-breakpoint
CREATE TABLE `attachment_uploads` (
	`attachment_upload_id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text,
	`size_bytes` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT "attachment_uploads_kind" CHECK("attachment_uploads"."kind" in ('image', 'audio'))
);
--> statement-breakpoint
CREATE INDEX `attachment_uploads_kind_created_idx` ON `attachment_uploads` (`kind`,`created_at`,`attachment_upload_id`);--> statement-breakpoint
CREATE TABLE `audio_transcription_jobs` (
	`audio_upload_id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`YT_source_url` text,
	`YT_use_captions_if_available` integer,
	`status` text DEFAULT 'queued' NOT NULL,
	`error` text,
	`claim_token` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`transcription_model_id` text,
	FOREIGN KEY (`audio_upload_id`) REFERENCES `attachment_uploads`(`attachment_upload_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "audio_transcription_jobs_status" CHECK("audio_transcription_jobs"."status" in ('queued', 'processing', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE `chat_message_attachments` (
	`message_id` text NOT NULL,
	`attachment_upload_id` text NOT NULL,
	`position` integer NOT NULL,
	PRIMARY KEY(`message_id`, `attachment_upload_id`),
	FOREIGN KEY (`message_id`) REFERENCES `chat_messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attachment_upload_id`) REFERENCES `attachment_uploads`(`attachment_upload_id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_message_attachments_message_position_idx` ON `chat_message_attachments` (`message_id`,`position`);--> statement-breakpoint
CREATE INDEX `chat_message_attachments_upload_idx` ON `chat_message_attachments` (`attachment_upload_id`);--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`role_order` integer GENERATED ALWAYS AS (case role when 'user' then 0 else 1 end) VIRTUAL NOT NULL,
	`content` text NOT NULL,
	`chosen_model_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`conversation_id` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "chat_messages_role" CHECK("chat_messages"."role" in ('user', 'assistant'))
);
--> statement-breakpoint
CREATE INDEX `chat_messages_conversation_created_idx` ON `chat_messages` (`conversation_id`,`created_at`,`role_order`,`id`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text DEFAULT 'New conversation' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`last_message_id` text,
	`context_window_message_count` integer DEFAULT 0 NOT NULL,
	`active_turn_claim_token` text,
	`active_turn_claimed_at` integer
);
--> statement-breakpoint
CREATE INDEX `conversations_updated_idx` ON `conversations` (`updated_at`,`id`);--> statement-breakpoint
CREATE TABLE `transcript_contents` (
	`audio_upload_id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`char_count` integer NOT NULL,
	FOREIGN KEY (`audio_upload_id`) REFERENCES `audio_transcription_jobs`(`audio_upload_id`) ON UPDATE no action ON DELETE cascade
);
