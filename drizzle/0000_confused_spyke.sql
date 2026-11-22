CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"date_time" timestamp with time zone NOT NULL,
	"paid_by" text NOT NULL,
	"type" text DEFAULT 'trip' NOT NULL,
	"split_among" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"owed_to" text
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "people_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_person" text NOT NULL,
	"to_person" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "expenses_date_idx" ON "expenses" USING btree ("date_time");