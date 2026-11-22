import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { people } from "@/db/schema";
import { ADMIN_PERSON, PEOPLE } from "@/lib/people";
import { adminEmail } from "@/lib/members";
import { firstError } from "@/lib/validate";
import { apiError, methodNotAllowed, readJson, requireMember, withErrors } from "@/lib/session";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const r = await requireMember();
  if (r.error) return r;
  if (!r.member.isAdmin) return { error: apiError("Only the admin can manage members", 403) };
  return r;
}

export const GET = withErrors("load the members", async () => {
  const { error } = await requireAdmin();
  if (error) return error;
  const db = await getDb();
  const rows = await db.select({ name: people.name, email: people.email, image: people.image }).from(people).orderBy(people.id);
  return NextResponse.json({ adminEmail: adminEmail() || null, members: rows });
});

// Each field has its own message so the admin knows which one was wrong.
const body = z.object(
  {
    name: z.enum(PEOPLE, { error: "Unknown person — pick one of the trip members" }),
    email: z
      .string({ error: "Enter a valid email address (or null to remove access)" })
      .trim()
      .toLowerCase()
      .max(254, "Email address is too long")
      .pipe(z.email({ error: "Enter a valid email address" }))
      .nullable(),
  },
  { error: "Request body must be a JSON object" }
);

export const PUT = withErrors("save the member", async (req: Request) => {
  const { error } = await requireAdmin();
  if (error) return error;
  const json = await readJson(req);
  if (json.error) return json.error;
  const parsed = body.safeParse(json.body);
  if (!parsed.success) return apiError(firstError(parsed.error), 400);
  const { name, email } = parsed.data;
  // These addresses would never reach this row: sign-in checks ADMIN_EMAIL (always the admin) and,
  // in local dev, *@dev.local test logins before looking at the members list.
  if (email && email.endsWith("@dev.local")) return apiError("@dev.local addresses are reserved for local test logins", 400);
  if (email && adminEmail() && email === adminEmail() && name !== ADMIN_PERSON)
    return apiError(`That email is the admin's sign-in (${ADMIN_PERSON}) — use a different address`, 409);
  const db = await getDb();
  if (email) {
    const [taken] = await db
      .select({ name: people.name })
      .from(people)
      .where(sql`lower(${people.email}) = ${email} and ${people.name} <> ${name}`)
      .limit(1);
    if (taken) return apiError(`That email is already used by ${taken.name}`, 409);
  }
  const [row] = await db.update(people).set({ email }).where(eq(people.name, name)).returning({ name: people.name, email: people.email });
  if (!row) return apiError("Unknown person — pick one of the trip members", 404);
  return NextResponse.json(row);
});

export const POST = methodNotAllowed(["GET", "PUT"]);
export const PATCH = POST;
export const DELETE = POST;
