import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { settlements } from "@/db/schema";

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const db = await getDb();
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  await db.delete(settlements).where(eq(settlements.id, id));
  return NextResponse.json({ ok: true });
}
