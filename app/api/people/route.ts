import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { people } from "@/db/schema";
import { requireMember } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Names only — emails are visible to the admin via /api/members. */
export async function GET() {
  const { error } = await requireMember();
  if (error) return error;
  const db = await getDb();
  const rows = await db.select({ id: people.id, name: people.name }).from(people).orderBy(people.id);
  return NextResponse.json(rows);
}
