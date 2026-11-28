import { pgTable, serial, text, numeric, timestamp, jsonb, integer, index, uuid } from "drizzle-orm/pg-core";

export const people = pgTable("people", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  // Google account allowed to sign in as this person (set by the admin on the Members page)
  email: text("email").unique(),
  // Google profile photo URL, refreshed each time the member signs in
  image: text("image"),
  // When this member's app last loaded the trip, and how many expenses it was still holding unsent
  // (reported by the app; shown to the admin before the final settle-up)
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  waitingCount: integer("waiting_count"),
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
    // Made on the phone when the entry is created and sent with every retry, so a retried save never adds
    // a second row (null for rows saved before offline support).
    clientId: uuid("client_id").unique(),
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
  // Same as expenses.clientId: a retried save never records a second settlement.
  clientId: uuid("client_id").unique(),
});

/**
 * Client ids of entries deleted after they were saved. A phone that never got the answer to its save may send
 * it again later; this table makes the server answer "deleted" (410) instead of adding it back.
 */
export const deletedClientIds = pgTable("deleted_client_ids", {
  clientId: uuid("client_id").primaryKey(),
  kind: text("kind", { enum: ["expense", "settlement"] }).notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }).notNull().defaultNow(),
  deletedBy: text("deleted_by"),
});

export type Expense = typeof expenses.$inferSelect;
export type Settlement = typeof settlements.$inferSelect;
