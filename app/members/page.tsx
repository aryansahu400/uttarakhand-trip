import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/auth";
import { memberForEmail } from "@/lib/members";
import { MembersManager } from "@/components/members-manager";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const session = await auth();
  const me = await memberForEmail(session?.user?.email);
  if (!me) redirect("/signin");
  if (!me.isAdmin) redirect("/");

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
      <Link href="/" className="mb-4 -ml-1 inline-flex min-h-10 items-center gap-1.5 px-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to the trip
      </Link>
      <h1 className="text-xl font-semibold tracking-tight">Members</h1>
      <p className="mb-5 mt-1 text-sm text-muted-foreground">
        Add each person&apos;s Google email so they can sign in. Clearing an email removes their access straight away.
      </p>
      <MembersManager />
    </main>
  );
}
