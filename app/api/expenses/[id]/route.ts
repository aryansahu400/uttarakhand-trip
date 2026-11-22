import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { expenses } from "@/db/schema";
import { canDelete } from "@/lib/people";
import { parseId } from "@/lib/validate";
import { apiError, methodNotAllowed, requireMember, withErrors } from "@/lib/session";

export const DELETE = withErrors("delete the expense", async (_: Request, { params }: { params: { id: string } }) => {
  const { member, error } = await requireMember();
  if (error) return error;
  // Only plain positive int4 ids; anything else (0, -1, 1e3, 0x10, > 2147483647) is a 400, never a DB error.
  const id = parseId(params.id);
  if (id === null) return apiError("Invalid id", 400);
  const db = await getDb();
  const [row] = await db.select({ createdBy: expenses.createdBy }).from(expenses).where(eq(expenses.id, id)).limit(1);
  if (!row) return apiError("Not found — it may already have been deleted", 404);
  if (!canDelete(member, row.createdBy)) return apiError("You can only delete expenses you added", 403);
  await db.delete(expenses).where(eq(expenses.id, id));
  return NextResponse.json({ ok: true });
});

export const GET = methodNotAllowed(["DELETE"]);
export const POST = GET;
export const PUT = GET;
export const PATCH = GET;
