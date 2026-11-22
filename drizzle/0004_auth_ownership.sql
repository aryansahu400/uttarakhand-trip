ALTER TABLE "expenses" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_email_unique" UNIQUE("email");