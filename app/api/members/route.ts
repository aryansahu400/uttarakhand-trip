import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { people } from "@/db/schema";
import { PEOPLE } from "@/lib/people";
import { adminEmail } from "@/lib/members";
import { requireMember } from "@/lib/session";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const r = await requireMember();
  if (r.error) return r;
  if (!r.member.isAdmin) return { error: NextResponse.json({ error: "Only the admin can manage members" }, { status: 403 }) };
  return r;
}

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  const db = await getDb();
  const rows = await db.select({ name: people.name, email: people.email }).from(people).orderBy(people.id);
  return NextResponse.json({ adminEmail: adminEmail() || null, members: rows });
}

const body = z.object({
  name: z.enum(PEOPLE),
  email: z.string().trim().toLowerCase().email().max(254).nullable(),
});

export async function PUT(req: Request) {
  const { error } = await requireAdmin();
  if (error) return error;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  const { name, email } = parsed.data;
  const db = await getDb();
  if (email) {
    const [taken] = await db
      .select({ name: people.name })
      .from(people)
      .where(sql`lower(${people.email}) = ${email} and ${people.name} <> ${name}`)
      .limit(1);
    if (taken) return NextResponse.json({ error: `That email is already used by ${taken.name}` }, { status: 409 });
  }
  const [row] = await db.update(people).set({ email }).where(eq(people.name, name)).returning({ name: people.name, email: people.email });
  if (!row) return NextResponse.json({ error: "Unknown person" }, { status: 404 });
  return NextResponse.json(row);
}
