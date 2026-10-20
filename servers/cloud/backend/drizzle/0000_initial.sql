CREATE TYPE "public"."attachment_kind" AS ENUM('image', 'audio');--> statement-breakpoint
CREATE TYPE "public"."chat_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."storage_ledger_status" AS ENUM('pending', 'confirmed', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."stored_object_kind" AS ENUM('image', 'audio');--> statement-breakpoint
CREATE TABLE "attachment_turn_reservations" (
	"attachment_upload_id" text NOT NULL,
	"claim_token" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "attachment_turn_reservations_attachment_upload_id_claim_token_pk" PRIMARY KEY("attachment_upload_id","claim_token")
);
--> statement-breakpoint
CREATE TABLE "attachment_uploads" (
	"attachment_upload_id" text PRIMARY KEY NOT NULL,
	"kind" "attachment_kind" NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text,
	"size_bytes" bigint NOT NULL,
	"signed_url" text,
	"signed_url_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audio_transcription_jobs" (
	"audio_upload_id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"YT_source_url" text,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"error" text,
	"claim_token" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"transcription_model_id" text
);
--> statement-breakpoint
CREATE TABLE "chat_message_attachments" (
	"message_id" uuid NOT NULL,
	"attachment_upload_id" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "chat_message_attachments_message_id_attachment_upload_id_pk" PRIMARY KEY("message_id","attachment_upload_id")
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" "chat_role" NOT NULL,
	"content" text NOT NULL,
	"chosen_model_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text DEFAULT 'New conversation' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_id" uuid,
	"context_window_message_count" integer DEFAULT 0 NOT NULL,
	"active_turn_claim_token" uuid,
	"active_turn_claimed_at" timestamp with time zone,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storage_ledger" (
	"upload_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" "stored_object_kind" NOT NULL,
	"status" "storage_ledger_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcript_contents" (
	"audio_upload_id" text PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"char_count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachment_turn_reservations" ADD CONSTRAINT "attachment_turn_reservations_attachment_upload_id_attachment_uploads_attachment_upload_id_fk" FOREIGN KEY ("attachment_upload_id") REFERENCES "public"."attachment_uploads"("attachment_upload_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment_uploads" ADD CONSTRAINT "attachment_uploads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_transcription_jobs" ADD CONSTRAINT "audio_transcription_jobs_audio_upload_id_attachment_uploads_attachment_upload_id_fk" FOREIGN KEY ("audio_upload_id") REFERENCES "public"."attachment_uploads"("attachment_upload_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_attachments" ADD CONSTRAINT "chat_message_attachments_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_attachments" ADD CONSTRAINT "chat_message_attachments_attachment_upload_id_attachment_uploads_attachment_upload_id_fk" FOREIGN KEY ("attachment_upload_id") REFERENCES "public"."attachment_uploads"("attachment_upload_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_contents" ADD CONSTRAINT "transcript_contents_audio_upload_id_audio_transcription_jobs_audio_upload_id_fk" FOREIGN KEY ("audio_upload_id") REFERENCES "public"."audio_transcription_jobs"("audio_upload_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachment_turn_reservations_claim_idx" ON "attachment_turn_reservations" USING btree ("claim_token");--> statement-breakpoint
CREATE INDEX "attachment_uploads_user_kind_created_idx" ON "attachment_uploads" USING btree ("user_id","kind","created_at","attachment_upload_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_message_attachments_message_position_idx" ON "chat_message_attachments" USING btree ("message_id","position");--> statement-breakpoint
CREATE INDEX "chat_message_attachments_upload_idx" ON "chat_message_attachments" USING btree ("attachment_upload_id");--> statement-breakpoint
CREATE INDEX "chat_messages_conversation_created_idx" ON "chat_messages" USING btree ("conversation_id","created_at","role","id");--> statement-breakpoint
CREATE INDEX "conversations_user_updated_idx" ON "conversations" USING btree ("user_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "storage_ledger_status_created_idx" ON "storage_ledger" USING btree ("status","created_at");