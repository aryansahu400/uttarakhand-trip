import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { memberForEmail, savePhoto } from "@/lib/members";
import { AppShell } from "@/components/app-shell";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: { tab?: string | string[] } }) {
  const session = await auth();
  const member = await memberForEmail(session?.user?.email);
  // ?tab= restores the open section on reload or from a shared link (the client keeps it in sync).
  const tab = Array.isArray(searchParams.tab) ? searchParams.tab[0] : searchParams.tab;
  if (!member) {
    if (session) redirect("/signin?error=AccessDenied");
    // Come back to the same section after signing in.
    redirect(`/signin?callbackUrl=${encodeURIComponent(tab ? `/?tab=${encodeURIComponent(tab)}` : "/")}`);
  }
  const image = session?.user?.image ?? null;
  // Keeps the stored photo current for people already signed in (no need to sign out and back in).
  await savePhoto(member.person, image);
  return <AppShell me={{ ...member, image }} initialTab={tab} />;
}
