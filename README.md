# Uttarakhand Trip Expense Tracker

Next.js 14 (App Router) · Tailwind · shadcn-style UI · Recharts · Drizzle ORM · Neon Postgres.

## Run locally
1. `npm install`
2. `npm run dev` → http://localhost:3000

With no `DATABASE_URL`, the app uses a built-in local Postgres (PGlite) stored in `.local-db/`,
migrated and seeded automatically. Set `DATABASE_URL` in `.env` only if you want to use Neon locally.

## Deploy (Vercel Hobby + Neon)
1. `npx vercel login`, then `npx vercel` in this folder (creates and links the project).
2. Vercel dashboard → project → **Storage → Create Database → Neon** → connect it to the project.
   This sets `DATABASE_URL` (pooled) for every environment.
3. `npx vercel --prod` → the live URL is printed at the end.

Migrations run automatically on every Vercel build (`vercel-build` script: `tsx scripts/migrate.ts && next build`),
so tables, new columns and the 7 people are created/updated on Neon with no manual step. (Vercel marks the Neon
connection string as sensitive, so it can't be pulled to a laptop — running migrations inside the build avoids that.)

To ship later changes: `npx vercel --prod` (or connect a GitHub repo in Vercel for auto-deploys).

## Other commands
- `npm test` — balance / settle-up / Naveen cap checks
- `npm run db:generate` — create a migration after editing `db/schema.ts`
- `NEXT_DIST_DIR=.next-build npm run build` — production build without disturbing a running `npm run dev`
