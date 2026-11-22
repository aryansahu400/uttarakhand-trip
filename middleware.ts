import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

export default NextAuth(authConfig).auth;

// Everything needs sign-in except auth routes, the sign-in page, the public privacy/terms pages (Google checks
// them), icons and Next.js assets.
export const config = {
  matcher: ["/((?!api/auth|signin|privacy|terms|_next/static|_next/image|icon.svg|apple-icon|favicon.ico).*)"],
};
