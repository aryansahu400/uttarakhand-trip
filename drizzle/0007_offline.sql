-- Offline mode: safe retries. Every statement is idempotent (IF NOT EXISTS / duplicate guard) because the
-- neon-http migrator runs without a transaction and a build can fail after this ran. Purely additive, so
-- pages still open from the previous release keep working. Never edit this file once any build has run it
-- (drizzle applies migrations by journal timestamp only); add 0008 instead.
CREATE TABLE IF NOT EXISTS "deleted_client_ids" (
	"client_id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_by" text
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "client_id" uuid;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "waiting_count" integer;--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN IF NOT EXISTS "client_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "expenses" ADD CONSTRAINT "expenses_client_id_unique" UNIQUE("client_id");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "settlements" ADD CONSTRAINT "settlements_client_id_unique" UNIQUE("client_id");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
