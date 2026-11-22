import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { settlements } from "@/db/schema";
import { firstError, settlementSchema } from "@/lib/validate";
import { paiseToDecimal, toPaise } from "@/lib/balances";
import { apiError, methodNotAllowed, readJson, requireMember, withErrors } from "@/lib/session";

export const dynamic = "force-dynamic";

export const GET = withErrors("load the settlements", async () => {
  const { error } = await requireMember();
  if (error) return error;
  const db = await getDb();
  const rows = await db.select().from(settlements).orderBy(desc(settlements.createdAt));
  return NextResponse.json(rows);
});

export const POST = withErrors("record the settlement", async (req: Request) => {
  const { member, error } = await requireMember();
  if (error) return error;
  const json = await readJson(req);
  if (json.error) return json.error;
  const parsed = settlementSchema.safeParse(json.body);
  if (!parsed.success) return apiError(firstError(parsed.error), 400);
  const v = parsed.data;
  const db = await getDb();
  const [row] = await db
    .insert(settlements)
    .values({
      fromPerson: v.fromPerson,
      toPerson: v.toPerson,
      amount: paiseToDecimal(toPaise(v.amount)),
      note: v.note || null,
      createdBy: member.person,
    })
    .returning();
  return NextResponse.json(row, { status: 201 });
});

export const PUT = methodNotAllowed(["GET", "POST"]);
export const PATCH = PUT;
export const DELETE = PUT;
