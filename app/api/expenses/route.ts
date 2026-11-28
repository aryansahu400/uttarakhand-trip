import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { expenses } from "@/db/schema";
import { methodNotAllowed, readJson, requireMember, withErrors } from "@/lib/session";
import { saveExpense } from "./save";

export const dynamic = "force-dynamic";

export const GET = withErrors("load the expenses", async () => {
  const { error } = await requireMember();
  if (error) return error;
  const db = await getDb();
  const rows = await db.select().from(expenses).orderBy(desc(expenses.dateTime));
  return NextResponse.json(rows);
});

/** Saves an expense. Retries with the same clientId are stored once (see ./save.ts for the rules). */
export const POST = withErrors("save the expense", async (req: Request) => {
  const { member, error } = await requireMember();
  if (error) return error;
  const json = await readJson(req);
  if (json.error) return json.error;
  const { status, body } = await saveExpense(await getDb(), member, json.body);
  return NextResponse.json(body, { status });
});

export const PUT = methodNotAllowed(["GET", "POST"]);
export const PATCH = PUT;
export const DELETE = PUT;
