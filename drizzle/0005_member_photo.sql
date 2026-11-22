-- Idempotent: safe to re-run after an interrupted migration (see 0004 for why editing is safe).
ALTER TABLE "people" ADD COLUMN IF NOT EXISTS "image" text;
