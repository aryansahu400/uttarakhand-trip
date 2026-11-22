import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { settlements } from "@/db/schema";
import { canDelete } from "@/lib/people";
import { requireMember } from "@/lib/session";

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const { member, error } = await requireMember();
  if (error) return error;
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const db = await getDb();
  const [row] = await db.select({ createdBy: settlements.createdBy }).from(settlements).where(eq(settlements.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canDelete(member, row.createdBy))
    return NextResponse.json({ error: `You can only delete ${"settlements"} you added` }, { status: 403 });
  await db.delete(settlements).where(eq(settlements.id, id));
  return NextResponse.json({ ok: true });
}
