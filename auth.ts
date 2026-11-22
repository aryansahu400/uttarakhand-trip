import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { devLoginEnabled, memberForEmail } from "@/lib/members";
import { PEOPLE } from "@/lib/people";

declare module "next-auth" {
  interface Session {
    person?: string;
    isAdmin?: boolean;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    ...authConfig.providers,
    ...(devLoginEnabled()
      ? [
          Credentials({
            id: "dev",
            name: "Dev login",
            credentials: { person: {} },
            authorize: (c) => {
              const p = String(c?.person ?? "");
              return (PEOPLE as readonly string[]).includes(p) ? { id: p, name: p, email: `${p.toLowerCase()}@dev.local` } : null;
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    // Only trip members (admin email, or an email saved on the Members page) may sign in.
    async signIn({ user }) {
      return !!(await memberForEmail(user.email));
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const m = await memberForEmail(user.email);
        if (m) Object.assign(token, { person: m.person, isAdmin: m.isAdmin });
      }
      return token;
    },
    async session({ session, token }) {
      session.person = token.person as string | undefined;
      session.isAdmin = token.isAdmin as boolean | undefined;
      return session;
    },
  },
});
