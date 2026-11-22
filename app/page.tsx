import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { memberForEmail } from "@/lib/members";
import { AppShell } from "@/components/app-shell";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await auth();
  const me = await memberForEmail(session?.user?.email);
  if (!me) redirect(session ? "/signin?error=AccessDenied" : "/signin");
  return <AppShell me={me} />;
}
