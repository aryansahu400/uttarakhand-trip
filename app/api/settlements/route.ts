import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { settlements } from "@/db/schema";
import { settlementSchema } from "@/lib/validate";
import { requireMember } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await requireMember();
  if (error) return error;
  const db = await getDb();
  const rows = await db.select().from(settlements).orderBy(desc(settlements.createdAt));
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const { member, error } = await requireMember();
  if (error) return error;
  const db = await getDb();
  const parsed = settlementSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const v = parsed.data;
  const [row] = await db
    .insert(settlements)
    .values({ fromPerson: v.fromPerson, toPerson: v.toPerson, amount: v.amount.toFixed(2), note: v.note || null, createdBy: member.person })
    .returning();
  return NextResponse.json(row, { status: 201 });
}
