import { pgTable, serial, text, numeric, timestamp, jsonb, integer, index } from "drizzle-orm/pg-core";

export const people = pgTable("people", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  // Google account allowed to sign in as this person (set by the admin on the Members page)
  email: text("email").unique(),
});

export const expenses = pgTable(
  "expenses",
  {
    id: serial("id").primaryKey(),
    description: text("description").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    dateTime: timestamp("date_time", { withTimezone: true }).notNull(),
    paidBy: text("paid_by").notNull(),
    type: text("type", { enum: ["trip", "personal"] }).notNull().default("trip"),
    splitAmong: jsonb("split_among").$type<string[]>().notNull().default([]),
    owedTo: text("owed_to"),
    // Travel agency (Naveen) payment: null = not his payment,
    // "direct" = paid to him, "indirect" = we paid hotel/petrol etc. on his behalf (adjusted against his dues)
    naveenPayment: text("naveen_payment", { enum: ["direct", "indirect"] }),
    category: text("category").notNull().default("other"),
    // Trip member who added this entry (only they, or the admin, can delete it)
    createdBy: text("created_by"),
  },
  (t) => ({ dateIdx: index("expenses_date_idx").on(t.dateTime) })
);

export const settlements = pgTable("settlements", {
  id: serial("id").primaryKey(),
  fromPerson: text("from_person").notNull(),
  toPerson: text("to_person").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: text("created_by"),
});

export type Expense = typeof expenses.$inferSelect;
export type Settlement = typeof settlements.$inferSelect;
