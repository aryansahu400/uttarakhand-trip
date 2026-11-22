import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { people } from "@/db/schema";
import { methodNotAllowed, requireMember, withErrors } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Names and profile photos — emails are visible to the admin only, via /api/members. */
export const GET = withErrors("load the members", async () => {
  const { error } = await requireMember();
  if (error) return error;
  const db = await getDb();
  const rows = await db.select({ id: people.id, name: people.name, image: people.image }).from(people).orderBy(people.id);
  return NextResponse.json(rows);
});

export const POST = methodNotAllowed(["GET"]);
export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
