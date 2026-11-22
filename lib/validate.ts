import { z } from "zod";
import { PEOPLE } from "./people";
import { CATEGORY_VALUES } from "./categories";
import { dayKeyIST } from "./format";

/** Dates must fall in this window (India-time years, inclusive); keeps typos and junk out of the charts. */
export const MIN_YEAR = 2025;
export const MAX_YEAR = 2030;
export const MAX_AMOUNT = 10_000_000;

const person = (label: string) => z.enum(PEOPLE, { error: `${label} must be one of the trip members` });

/**
 * Money in rupees: a real JSON number (no strings, booleans or arrays), at most 2 decimal places,
 * between ₹0.01 and ₹1,00,00,000. Output is rounded to exact paise so the value checked is the value stored.
 */
const money = (label: string) =>
  z
    .number({ error: `${label} must be a number` })
    .refine(Number.isFinite, { message: `${label} must be a number`, abort: true })
    // Range before decimals, so 1e308 says "at most", not "2 decimal places".
    .refine((n) => n <= MAX_AMOUNT, { message: `${label} must be at most ₹1,00,00,000`, abort: true })
    .refine((n) => n >= -MAX_AMOUNT, { message: `${label} must be at least ₹0.01`, abort: true })
    // 1e-6 tolerance absorbs binary float noise (e.g. 0.1 + 0.2), not real 3rd decimals.
    .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, { message: `${label} can have at most 2 decimal places`, abort: true })
    .transform((n) => Math.round(n * 100) / 100)
    .refine((n) => n >= 0.01, { message: `${label} must be at least ₹0.01` })
    .refine((n) => n <= MAX_AMOUNT, { message: `${label} must be at most ₹1,00,00,000` });

/**
 * Control characters (NUL, escape, …) are rejected with a readable 400 instead of reaching Postgres,
 * which refuses NUL in text columns. Single-line fields reject all of C0 + DEL; notes may keep
 * tab / newline / carriage return.
 */
const CONTROL_ANY = /[\u0000-\u001F\u007F]/;
const CONTROL_EXCEPT_WHITESPACE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
/** Text field: "<label> is required" when missing, "<label> must be text" for any other type. */
const textError = (label: string) => (iss: { input?: unknown }) =>
  iss.input === undefined || iss.input === null ? `${label} is required` : `${label} must be text`;

/** ISO 8601 date-time string with a timezone (Z or ±hh:mm), in a sensible year range. */
const dateTime = z
  .string({ error: "Date must be an ISO date-time string" })
  .pipe(z.iso.datetime({ offset: true, error: "Date must be an ISO date-time like 2026-12-19T10:30:00Z" }))
  .transform((s) => new Date(s))
  .refine((d) => !Number.isNaN(d.getTime()), { message: "Date is not a real date" })
  .refine(
    (d) => {
      if (Number.isNaN(d.getTime())) return false; // already reported above
      const year = Number(dayKeyIST(d).slice(0, 4));
      return year >= MIN_YEAR && year <= MAX_YEAR;
    },
    { message: `Date must be between ${MIN_YEAR} and ${MAX_YEAR}` }
  );

export const expenseSchema = z
  .object(
    {
      description: z
        .string({ error: textError("Description") })
        .trim()
        .min(1, "Description is required")
        .max(200, "Description must be at most 200 characters")
        .refine((s) => !CONTROL_ANY.test(s), { message: "Description contains invalid characters (control characters are not allowed)" }),
      amount: money("Amount"),
      dateTime,
      paidBy: person("Paid by"),
      type: z.enum(["trip", "personal"], { error: "Type must be trip or personal" }),
      splitAmong: z
        .array(person("Everyone in the split"), { error: "Split must be a list of people" })
        .refine((a) => new Set(a).size === a.length, { message: "Each person can only be in the split once" })
        .default([]),
      owedTo: person("Owed by").nullish(),
      naveenPayment: z.enum(["direct", "indirect"], { error: "Naveen payment must be direct or indirect" }).nullish(),
      category: z.enum(CATEGORY_VALUES, { error: "Pick a valid category" }).default("other"),
    },
    { error: "Request body must be a JSON object" }
  )
  .superRefine((v, ctx) => {
    if (v.naveenPayment && v.type !== "trip")
      ctx.addIssue({ code: "custom", path: ["naveenPayment"], message: "Naveen payments must be trip expenses" });
    if (v.type === "trip" && v.splitAmong.length === 0)
      ctx.addIssue({ code: "custom", path: ["splitAmong"], message: "Select at least one person" });
    if (v.type === "personal") {
      if (!v.owedTo) ctx.addIssue({ code: "custom", path: ["owedTo"], message: "Select who owes" });
      else if (v.owedTo === v.paidBy) ctx.addIssue({ code: "custom", path: ["owedTo"], message: "Cannot lend to yourself" });
    }
  });

export const settlementSchema = z
  .object(
    {
      fromPerson: person("From"),
      toPerson: person("To"),
      amount: money("Amount"),
      note: z
        .string({ error: "Note must be text" })
        .trim()
        .max(200, "Note must be at most 200 characters")
        .refine((s) => !CONTROL_EXCEPT_WHITESPACE.test(s), { message: "Note contains invalid characters (control characters are not allowed)" })
        .nullish(),
    },
    { error: "Request body must be a JSON object" }
  )
  .refine((v) => v.fromPerson !== v.toPerson, { message: "From and To must differ", path: ["toPerson"] });

/** Human-readable message for a failed parse: the first issue's message. */
export function firstError(err: z.ZodError): string {
  return err.issues[0]?.message || "Invalid request";
}

/** Route `[id]` params: a positive int4 (1..2147483647) written plainly in decimal, else null. */
export function parseId(raw: string): number | null {
  if (!/^[1-9]\d{0,9}$/.test(raw)) return null;
  const id = Number(raw);
  return id <= 2_147_483_647 ? id : null;
}
