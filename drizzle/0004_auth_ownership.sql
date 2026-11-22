-- Idempotent (IF NOT EXISTS / duplicate guard) so an interrupted or concurrent non-transactional
-- neon-http migration can simply be re-run. drizzle's migrator decides what to apply by the journal
-- timestamp only (the stored hash is never compared), so editing this already-applied file does not
-- re-run it on existing databases.
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "created_by" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "email" text;--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN IF NOT EXISTS "created_by" text;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "people" ADD CONSTRAINT "people_email_unique" UNIQUE("email");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
