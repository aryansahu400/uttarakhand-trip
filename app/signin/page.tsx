import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { devLoginEnabled, memberForEmail } from "@/lib/members";
import { PEOPLE } from "@/lib/people";
import { MountainBanner } from "@/components/mountain-banner";
import { signInDev, signInWithGoogle } from "../actions";

export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: { error?: string } }) {
  const session = await auth();
  if (await memberForEmail(session?.user?.email)) redirect("/");
  const denied = searchParams.error === "AccessDenied";
  const failed = searchParams.error && !denied;

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
            <button
              type="submit"
              className="flex h-11 w-full items-center justify-center gap-3 rounded-md border border-input bg-card text-sm font-medium hover:bg-muted"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z" />
                <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
                <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z" />
                <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
              </svg>
              Continue with Google
            </button>
          </form>

          {devLoginEnabled() && (
            <form action={signInDev} className="space-y-2 rounded-md border border-dashed p-3">
              <p className="text-xs text-muted-foreground">Local testing only (DEV_LOGIN=1) — never shown on the live site.</p>
              <div className="flex gap-2">
                <select name="person" className="h-9 flex-1 rounded-md border border-input bg-card px-2 text-sm">
                  {PEOPLE.map((p) => <option key={p}>{p}</option>)}
                </select>
                <button type="submit" className="h-9 rounded-md bg-primary px-3 text-sm text-primary-foreground">Sign in as</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
