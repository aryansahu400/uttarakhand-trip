import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { memberForEmail, type Member } from "./members";

/** Every 4xx from the API is a JSON body {error: string} with a readable message. */
export const apiError = (error: string, status: number) => NextResponse.json({ error }, { status });

/** For API routes: the signed-in trip member, re-checked against the members list on every request. */
export async function requireMember(): Promise<{ member: Member; error?: never } | { member?: never; error: NextResponse }> {
  const session = await auth();
  if (!session?.user) return { error: apiError("Sign in required", 401) };
  const member = await memberForEmail(session.user.email);
  if (!member)
    return { error: NextResponse.json({ error: "Your account is no longer on the trip list", code: "not_member" }, { status: 403 }) };
  return { member };
}

/**
 * Reads a JSON request body. Mutating routes only accept Content-Type: application/json
 * (415 otherwise), which also stops "simple" cross-site form posts; unparsable JSON is a 400.
 */
export async function readJson(req: Request): Promise<{ body: unknown; error?: never } | { body?: never; error: NextResponse }> {
  const type = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") return { error: apiError("Content-Type must be application/json", 415) };
  try {
    return { body: await req.json() };
  } catch {
    return { error: apiError("Request body is not valid JSON", 400) };
  }
}

/** Postgres SQLSTATE of a driver error (neon-http NeonDbError, PGlite / drizzle DrizzleQueryError cause). */
function sqlState(e: unknown): string | undefined {
  for (let x = e as { code?: unknown; cause?: unknown } | undefined, i = 0; x && i < 5; x = x.cause as typeof x, i++)
    if (typeof x.code === "string" && /^[0-9A-Z]{5}$/.test(x.code)) return x.code;
  return undefined;
}

/**
 * Turns an unexpected (database / driver) error into a readable JSON response instead of an empty 500.
 * The details are logged server-side only. Serialization failures / deadlocks (40001, 40P01) are a 409
 * "try again"; anything else (outage, cold-start timeout, missing table…) is a 503.
 */
export function serverError(e: unknown, action: string): NextResponse {
  console.error(`[api] ${action} failed`, e);
  const code = sqlState(e);
  if (code === "40001" || code === "40P01") return apiError(`Could not ${action} because of a conflicting change — please try again`, 409);
  return apiError(`Could not ${action} right now — please try again in a moment`, 503);
}

/**
 * Wraps a route handler so any thrown error becomes serverError(...) JSON (logged server-side).
 * Usage: `export const POST = withErrors("save the expense", async (req) => { ... })`.
 */
export function withErrors<A extends unknown[]>(action: string, fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      return serverError(e, action);
    }
  };
}

/** A handler that answers 405 {error} with an Allow header, for HTTP methods a route doesn't support. */
export const methodNotAllowed = (allow: string[]) => async () =>
  NextResponse.json({ error: `Method not allowed — use ${allow.join(" or ")}` }, { status: 405, headers: { Allow: allow.join(", ") } });
