import { NextResponse } from "next/server";
import { desc, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { expenses } from "@/db/schema";
import { expenseSchema } from "@/lib/validate";
import { NAVEEN_PER_PERSON, naveenOverCap } from "@/lib/naveen";
import { PEOPLE } from "@/lib/people";
import { formatINR } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await getDb();
  const rows = await db.select().from(expenses).orderBy(desc(expenses.dateTime));
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const db = await getDb();
  const parsed = expenseSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const v = parsed.data;

  if (v.naveenPayment) {
    const existing = await db.select().from(expenses).where(isNotNull(expenses.naveenPayment));
    const over = naveenOverCap(PEOPLE, existing, { ...v, naveenPayment: v.naveenPayment });
    if (over.length) {
      const who = over.map((o) => `${o.person} (+${formatINR(o.over)})`).join(", ");
      return NextResponse.json(
        { error: `Naveen's payments would exceed ${formatINR(NAVEEN_PER_PERSON)} per person for: ${who}` },
        { status: 400 }
      );
    }
  }

  const [row] = await db
    .insert(expenses)
    .values({
      description: v.description,
      amount: v.amount.toFixed(2),
      dateTime: v.dateTime,
      paidBy: v.paidBy,
      type: v.type,
      splitAmong: v.type === "trip" ? v.splitAmong : [],
      owedTo: v.type === "personal" ? v.owedTo! : null,
      naveenPayment: v.type === "trip" ? v.naveenPayment ?? null : null,
      category: v.category,
    })
    .returning();
  return NextResponse.json(row, { status: 201 });
}
