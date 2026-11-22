import { NextResponse } from "next/server";
import { desc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { expenses } from "@/db/schema";
import { expenseSchema, firstError } from "@/lib/validate";
import { NAVEEN_PER_PERSON, naveenOverCap } from "@/lib/naveen";
import { PEOPLE } from "@/lib/people";
import { formatINR } from "@/lib/format";
import { paiseToDecimal, toPaise } from "@/lib/balances";
import { apiError, methodNotAllowed, readJson, requireMember, withErrors } from "@/lib/session";
import { insertNaveenWithinCap, type DbLike } from "./naveen-insert";

export const dynamic = "force-dynamic";

export const GET = withErrors("load the expenses", async () => {
  const { error } = await requireMember();
  if (error) return error;
  const db = await getDb();
  const rows = await db.select().from(expenses).orderBy(desc(expenses.dateTime));
  return NextResponse.json(rows);
});

export const POST = withErrors("save the expense", async (req: Request) => {
  const { member, error } = await requireMember();
  if (error) return error;
  const json = await readJson(req);
  if (json.error) return json.error;
  const parsed = expenseSchema.safeParse(json.body);
  if (!parsed.success) return apiError(firstError(parsed.error), 400);
  const v = parsed.data;
  const db = await getDb();
  // The schema already rounded to exact paise; store exactly that value.
  const paise = toPaise(v.amount);
  const amount = paiseToDecimal(paise);

  if (v.type === "trip" && v.naveenPayment) {
    // Cap check + insert in one serialised statement, so concurrent requests can't both pass.
    const id = await insertNaveenWithinCap(
      db as unknown as DbLike,
      {
        description: v.description,
        amount,
        paise,
        dateTime: v.dateTime,
        paidBy: v.paidBy,
        splitAmong: v.splitAmong,
        naveenPayment: v.naveenPayment,
        category: v.category,
        createdBy: member.person,
      },
      PEOPLE
    );
    if (id === null) return apiError(await overCapMessage(v), 400);
    const [row] = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
    return NextResponse.json(row, { status: 201 });
  }

  const [row] = await db
    .insert(expenses)
    .values({
      description: v.description,
      amount,
      dateTime: v.dateTime,
      paidBy: v.paidBy,
      type: v.type,
      splitAmong: v.type === "trip" ? v.splitAmong : [],
      owedTo: v.type === "personal" ? v.owedTo! : null,
      naveenPayment: null,
      category: v.category,
      createdBy: member.person,
    })
    .returning();
  return NextResponse.json(row, { status: 201 });
});

export const PUT = methodNotAllowed(["GET", "POST"]);
export const PATCH = PUT;
export const DELETE = PUT;

/** Explains a rejected Naveen payment: who would go over and by how much (same maths as the SQL). */
async function overCapMessage(v: Parameters<typeof naveenOverCap>[2]) {
  const db = await getDb();
  const existing = await db.select().from(expenses).where(isNotNull(expenses.naveenPayment));
  const over = naveenOverCap(PEOPLE, existing, v);
  const who = over.length ? `: ${over.map((o) => `${o.person} (+${formatINR(o.over)})`).join(", ")}` : "";
  return `Naveen's payments would exceed ${formatINR(NAVEEN_PER_PERSON)} per person${who}`;
}
