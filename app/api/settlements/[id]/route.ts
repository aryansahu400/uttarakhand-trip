import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { settlements } from "@/db/schema";
import { canDelete } from "@/lib/people";
import { parseId } from "@/lib/validate";
import { apiError, methodNotAllowed, requireMember, withErrors } from "@/lib/session";
import { deleteWithTombstone } from "@/lib/tombstones";

export const DELETE = withErrors("delete the settlement", async (_: Request, { params }: { params: { id: string } }) => {
  const { member, error } = await requireMember();
  if (error) return error;
  // Only plain positive int4 ids; anything else (0, -1, 1e3, 0x10, > 2147483647) is a 400, never a DB error.
  const id = parseId(params.id);
  if (id === null) return apiError("Invalid id", 400, "bad_id");
  const db = await getDb();
  const [row] = await db.select({ createdBy: settlements.createdBy }).from(settlements).where(eq(settlements.id, id)).limit(1);
  if (!row) return apiError("Not found — it may already have been deleted", 404, "not_found");
  if (!canDelete(member, row.createdBy)) return apiError("You can only delete settlements you added", 403, "not_yours");
  // Delete and remember its client id in one statement, so a late retry of the original save can't re-add it.
  await deleteWithTombstone(db, "settlement", id, member.person);
  return NextResponse.json({ ok: true });
});

export const GET = methodNotAllowed(["DELETE"]);
export const POST = GET;
export const PUT = GET;
export const PATCH = GET;
