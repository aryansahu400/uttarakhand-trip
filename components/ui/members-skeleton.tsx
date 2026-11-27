import { Card } from "./card";
import { Skeleton } from "./skeleton";
import { PEOPLE } from "@/lib/people";

/**
 * Placeholder for the Members list: one card with a row per member, shaped like the real rows
 * (avatar + name + status, then the email field and Save button), so nothing jumps when the
 * list arrives. Shared by app/members/loading.tsx (route loading) and MembersManager (data loading).
 */
export function MembersSkeleton({ rows = PEOPLE.length }: { rows?: number }) {
  return (
    <Card className="divide-y" role="status" aria-label="Loading members" aria-busy>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="space-y-2 p-4">
          <div className="flex h-7 items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Skeleton className="h-7 w-7 rounded-full" />
              <Skeleton className="h-4 w-20" />
            </span>
            <Skeleton className="h-3 w-16" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-11 min-w-0 flex-1 lg:h-9" />
            <Skeleton className="h-11 w-[4.25rem] shrink-0 lg:h-9" />
          </div>
        </div>
      ))}
    </Card>
  );
}
