import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { people } from "../db/schema";
import { PEOPLE } from "../lib/people";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = drizzle(neon(url));
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.insert(people).values(PEOPLE.map((name) => ({ name }))).onConflictDoNothing();
  console.log("Migrated and seeded people.");
}
main().catch((e) => (console.error(e), process.exit(1)));
