import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { memberForEmail, type Member } from "./members";

/**
 * Every error from the API is a JSON body {error: string, code?: string}: a readable message, plus a stable code
 * the app's upload queue uses to tell "retry later" from "needs attention" without reading the English text.
 */
export const apiError = (error: string, status: number, code?: string) =>
  NextResponse.json(code ? { error, code } : { error }, { status });

/**
 * Sent on every API response from this version. The phone only uploads saved entries to a server that shows it,
 * so a rollback to a release without duplicate protection can never turn retries into duplicates.
 */
export const API_VERSION_HEADER = "X-Trip-Api";
export const API_VERSION = "2";

/** For API routes: the signed-in trip member, re-checked against the members list on every request. */
export async function requireMember(): Promise<{ member: Member; error?: never } | { member?: never; error: NextResponse }> {
  const session = await auth();
  if (!session?.user) return { error: apiError("Sign in required", 401, "signed_out") };
  const member = await memberForEmail(session.user.email);
  if (!member) return { error: apiError("Your account is no longer on the trip list", 403, "not_member") };
  return { member };
}

/**
 * Reads a JSON request body. Mutating routes only accept Content-Type: application/json
 * (415 otherwise), which also stops "simple" cross-site form posts; unparsable JSON is a 400.
 */
export async function readJson(req: Request): Promise<{ body: unknown; error?: never } | { body?: never; error: NextResponse }> {
  const type = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") return { error: apiError("Content-Type must be application/json", 415, "bad_content_type") };
  try {
    return { body: await req.json() };
  } catch {
    return { error: apiError("Request body is not valid JSON", 400, "bad_json") };
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
  if (code === "40001" || code === "40P01") return apiError(`Could not ${action} because of a conflicting change — please try again`, 409, "conflict");
  return apiError(`Could not ${action} right now — please try again in a moment`, 503, "unavailable");
}

/**
 * Wraps a route handler so any thrown error becomes serverError(...) JSON (logged server-side), and every
 * response carries the API version header (see API_VERSION_HEADER).
 * Usage: `export const POST = withErrors("save the expense", async (req) => { ... })`.
 */
export function withErrors<A extends unknown[]>(action: string, fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    let res: Response;
    try {
      res = await fn(...args);
    } catch (e) {
      res = serverError(e, action);
    }
    try {
      res.headers.set(API_VERSION_HEADER, API_VERSION);
    } catch {
      /* immutable headers (never for our own responses) */
    }
    return res;
  };
}

/** A handler that answers 405 {error} with an Allow header, for HTTP methods a route doesn't support. */
export const methodNotAllowed = (allow: string[]) => async () =>
  NextResponse.json(
    { error: `Method not allowed — use ${allow.join(" or ")}`, code: "method_not_allowed" },
    { status: 405, headers: { Allow: allow.join(", "), [API_VERSION_HEADER]: API_VERSION } }
  );
