import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { memberForEmail, type Member } from "./members";

/** For API routes: the signed-in trip member, re-checked against the members list on every request. */
export async function requireMember(): Promise<{ member: Member; error?: never } | { member?: never; error: NextResponse }> {
  const session = await auth();
  if (!session?.user) return { error: NextResponse.json({ error: "Sign in required" }, { status: 401 }) };
  const member = await memberForEmail(session.user.email);
  if (!member) return { error: NextResponse.json({ error: "Your account is no longer on the trip list" }, { status: 403 }) };
  return { member };
}
