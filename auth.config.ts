import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/** Edge-safe part of the auth config (used by middleware — no database access here). */
export const authConfig = {
  providers: [Google],
  pages: { signIn: "/signin", error: "/signin" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (pathname.startsWith("/signin") || pathname.startsWith("/api/auth")) return true;
      if (auth?.user) return true;
      if (pathname.startsWith("/api/")) return Response.json({ error: "Sign in required" }, { status: 401 });
      return false; // → redirect to /signin
    },
  },
} satisfies NextAuthConfig;
