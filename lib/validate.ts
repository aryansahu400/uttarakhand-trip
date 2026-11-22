import { z } from "zod";
import { PEOPLE } from "./people";
import { CATEGORY_VALUES } from "./categories";

const person = z.enum(PEOPLE);

export const expenseSchema = z
  .object({
    description: z.string().trim().min(1).max(200),
    amount: z.coerce.number().positive().max(10_000_000),
    dateTime: z.coerce.date(),
    paidBy: person,
    type: z.enum(["trip", "personal"]),
    splitAmong: z.array(person).default([]),
    owedTo: person.nullish(),
    naveenPayment: z.enum(["direct", "indirect"]).nullish(),
    category: z.enum(CATEGORY_VALUES).default("other"),
  })
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
  .object({
    fromPerson: person,
    toPerson: person,
    amount: z.coerce.number().positive().max(10_000_000),
    note: z.string().trim().max(200).nullish(),
  })
  .refine((v) => v.fromPerson !== v.toPerson, { message: "From and To must differ", path: ["toPerson"] });
