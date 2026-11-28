import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { settlements } from "@/db/schema";
import { methodNotAllowed, readJson, requireMember, withErrors } from "@/lib/session";
import { saveSettlement } from "./save";

export const dynamic = "force-dynamic";

export const GET = withErrors("load the settlements", async () => {
  const { error } = await requireMember();
  if (error) return error;
  const db = await getDb();
  const rows = await db.select().from(settlements).orderBy(desc(settlements.createdAt));
  return NextResponse.json(rows);
});

/** Records a settlement. Retries with the same clientId are stored once (see ./save.ts). */
export const POST = withErrors("record the settlement", async (req: Request) => {
  const { member, error } = await requireMember();
  if (error) return error;
  const json = await readJson(req);
  if (json.error) return json.error;
  const { status, body } = await saveSettlement(await getDb(), member, json.body);
  return NextResponse.json(body, { status });
});

export const PUT = methodNotAllowed(["GET", "POST"]);
export const PATCH = PUT;
export const DELETE = PUT;
