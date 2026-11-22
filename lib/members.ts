import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { people } from "@/db/schema";
import { ADMIN_PERSON, PEOPLE } from "./people";

export type Member = { person: string; isAdmin: boolean };

export const adminEmail = () => (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();

/** Local-only test login (pick a person, no Google). Never on in production. */
export const devLoginEnabled = () =>
  process.env.NODE_ENV !== "production" && !process.env.VERCEL && process.env.DEV_LOGIN === "1";

/** Which trip member (if any) this signed-in email belongs to. Checked on every request. */
export async function memberForEmail(email?: string | null): Promise<Member | null> {
  const e = email?.trim().toLowerCase();
  if (!e) return null;
  if (adminEmail() && e === adminEmail()) return { person: ADMIN_PERSON, isAdmin: true };
  if (devLoginEnabled() && e.endsWith("@dev.local")) {
    const person = PEOPLE.find((p) => `${p.toLowerCase()}@dev.local` === e);
    return person ? { person, isAdmin: person === ADMIN_PERSON } : null;
  }
  const db = await getDb();
  const [row] = await db
    .select({ name: people.name })
    .from(people)
    .where(sql`lower(${people.email}) = ${e}`)
    .limit(1);
  return row ? { person: row.name, isAdmin: row.name === ADMIN_PERSON } : null;
}
