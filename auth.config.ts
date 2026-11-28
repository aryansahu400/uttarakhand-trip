import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

const INTERNAL = "http://internal.invalid";

/**
 * Turns a sign-in `callbackUrl` (from the query string or a form field) into a safe same-origin path such as
 * "/?tab=settle", or "/" when it is missing, malformed, points at another site, or would loop back into sign-in.
 * Absolute URLs are accepted only when their host equals `host` (the request's own host, if known).
 * Only the path + query + hash is ever returned, so the result can never redirect off-site.
 */
export function safeCallbackPath(raw: unknown, host?: string | null): string {
  if (typeof raw !== "string" || !raw || raw.length > 2048) return "/";
  let u: URL;
  try {
    u = new URL(raw, INTERNAL);
  } catch {
    return "/";
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return "/";
  // A relative path resolves to INTERNAL; an absolute URL must be for this very host.
  if (u.origin !== INTERNAL && (!host || u.host.toLowerCase() !== host.toLowerCase())) return "/";
  const path = u.pathname;
  // "//evil.com" or "/\\evil.com" style paths would be protocol-relative once used as a redirect.
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return "/";
  if (path === "/signin" || path.startsWith("/signin/") || path.startsWith("/api/")) return "/";
  return path + u.search + u.hash;
}

/** Edge-safe part of the auth config (used by middleware — no database access here). */
export const authConfig = {
  providers: [Google],
  pages: { signIn: "/signin", error: "/signin" },
  // 60 days, renewed on every request the middleware sees, so nobody is signed out during the trip.
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 60 },
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (["/signin", "/api/auth", "/privacy", "/terms"].some((p) => pathname.startsWith(p))) return true;
      if (auth?.user) return true;
      if (pathname.startsWith("/api/")) return Response.json({ error: "Sign in required", code: "signed_out" }, { status: 401 });
      return false; // → redirect to /signin
    },
  },
} satisfies NextAuthConfig;
