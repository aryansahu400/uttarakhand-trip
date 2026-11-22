import { MembersSkeleton } from "@/components/ui/members-skeleton";

/** Shown while the admin-only Members page checks the session and loads (navigating from the user chip). */
export default function MembersLoading() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:py-10" aria-busy>
      <div className="mb-4 flex h-10 items-center">
        <div className="h-5 w-32 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-7 w-28 animate-pulse rounded bg-muted" />
      <div className="mb-5 mt-2 h-4 w-full max-w-md animate-pulse rounded bg-muted" />
      <MembersSkeleton />
    </main>
  );
}
