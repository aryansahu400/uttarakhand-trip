"use server";
import { headers } from "next/headers";
import { signIn, signOut } from "@/auth";
import { safeCallbackPath } from "@/auth.config";

/** Where to land after sign-in: the validated same-origin `callbackUrl` form field (deep links such as ?tab=). */
function redirectTarget(formData?: FormData) {
  const h = headers();
  return safeCallbackPath(formData?.get("callbackUrl"), h.get("x-forwarded-host") ?? h.get("host"));
}

export async function signInWithGoogle(formData: FormData) {
  await signIn("google", { redirectTo: redirectTarget(formData) });
}

export async function signInDev(formData: FormData) {
  await signIn("dev", { person: String(formData.get("person") ?? ""), redirectTo: redirectTarget(formData) });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/signin" });
}
