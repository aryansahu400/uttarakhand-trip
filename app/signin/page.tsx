import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { safeCallbackPath } from "@/auth.config";
import { devLoginEnabled, memberForEmail } from "@/lib/members";
import { PEOPLE } from "@/lib/people";
import { MountainBanner } from "@/components/mountain-banner";
import { SubmitButton } from "@/components/ui/submit-button";
import { signInDev, signInWithGoogle } from "../actions";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: { error?: string | string[]; callbackUrl?: string | string[] };
}) {
  // Deep link to return to after sign-in (e.g. "/?tab=settle"); anything not on this site becomes "/".
  const h = headers();
  const rawCallback = Array.isArray(searchParams.callbackUrl) ? searchParams.callbackUrl[0] : searchParams.callbackUrl;
  const callbackUrl = safeCallbackPath(rawCallback, h.get("x-forwarded-host") ?? h.get("host"));
  const session = await auth();
  if (await memberForEmail(session?.user?.email)) redirect(callbackUrl);
  const error = Array.isArray(searchParams.error) ? searchParams.error[0] : searchParams.error;
  const denied = error === "AccessDenied";
  const failed = error && !denied;

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-4 py-10">
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="relative h-36">
          <MountainBanner className="absolute inset-0 h-full w-full" />
          <div className="relative px-5 pt-5">
            <h1 className="text-xl font-semibold tracking-tight text-[#0f2238]">Uttarakhand trip</h1>
            <p className="text-sm text-[#3a4e66]">18 December · 7 people</p>
          </div>
        </div>
        <div className="space-y-4 p-5">
          <p className="text-sm text-muted-foreground">Sign in with the Google account your trip admin added.</p>

          {denied && (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              This app is only for the trip group. Ask Aryan to add your email on the Members page.
            </p>
          )}
          {failed && (
            <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Sign-in didn&apos;t complete. Please try again.
            </p>
          )}

          <form action={signInWithGoogle}>
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            {/* Pending state (spinner, disabled, aria-busy) stops double taps that would start a second OAuth
                flow and break the first redirect. */}
            <SubmitButton variant="outline" pendingText="Redirecting to Google…" className="h-11 w-full gap-3">
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z" />
                <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
                <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z" />
                <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
              </svg>
              Continue with Google
            </SubmitButton>
          </form>

          {devLoginEnabled() && (
            <form action={signInDev} className="space-y-2 rounded-md border border-dashed p-3">
              <input type="hidden" name="callbackUrl" value={callbackUrl} />
              <p className="text-xs text-muted-foreground">Local testing only (DEV_LOGIN=1) — never shown on the live site.</p>
              <div className="flex gap-2">
                <select
                  name="person"
                  aria-label="Person"
                  className="h-10 min-w-0 flex-1 rounded-md border border-input bg-card px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {PEOPLE.map((p) => <option key={p}>{p}</option>)}
                </select>
                <SubmitButton pendingText="Signing in…" className="h-10 shrink-0 px-3">Sign in as</SubmitButton>
              </div>
            </form>
          )}

          <p className="pt-1 text-center text-xs text-muted-foreground">
            By signing in you agree to the{" "}
            <a href="/terms" className="underline underline-offset-2 hover:text-foreground">terms of use</a> and{" "}
            <a href="/privacy" className="underline underline-offset-2 hover:text-foreground">privacy policy</a>.
          </p>
        </div>
      </div>
    </main>
  );
}
