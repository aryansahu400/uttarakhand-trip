-- Rename "Krishna" to "Krishnam" in every place a person's name is stored. No-op on a fresh database.
UPDATE "people" SET "name" = 'Krishnam' WHERE "name" = 'Krishna';
--> statement-breakpoint
UPDATE "expenses" SET "paid_by" = 'Krishnam' WHERE "paid_by" = 'Krishna';
--> statement-breakpoint
UPDATE "expenses" SET "owed_to" = 'Krishnam' WHERE "owed_to" = 'Krishna';
--> statement-breakpoint
UPDATE "expenses"
SET "split_among" = (
  SELECT jsonb_agg(CASE WHEN v = 'Krishna' THEN 'Krishnam' ELSE v END)
  FROM jsonb_array_elements_text("split_among") AS v
)
WHERE "split_among" ? 'Krishna';
--> statement-breakpoint
UPDATE "settlements" SET "from_person" = 'Krishnam' WHERE "from_person" = 'Krishna';
--> statement-breakpoint
UPDATE "settlements" SET "to_person" = 'Krishnam' WHERE "to_person" = 'Krishna';
