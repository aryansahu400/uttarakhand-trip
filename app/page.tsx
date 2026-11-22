import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { memberForEmail, savePhoto } from "@/lib/members";
import { AppShell } from "@/components/app-shell";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await auth();
  const member = await memberForEmail(session?.user?.email);
  if (!member) redirect(session ? "/signin?error=AccessDenied" : "/signin");
  const image = session?.user?.image ?? null;
  // Keeps the stored photo current for people already signed in (no need to sign out and back in).
  await savePhoto(member.person, image);
  return <AppShell me={{ ...member, image }} />;
}
