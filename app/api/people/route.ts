import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { people } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await getDb();
  const rows = await db.select().from(people).orderBy(people.id);
  return NextResponse.json(rows);
}
