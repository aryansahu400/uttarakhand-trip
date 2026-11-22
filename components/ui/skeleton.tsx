import { cn } from "@/lib/utils";

/** Neutral pulsing placeholder used while data is loading. */
export const Skeleton = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div aria-hidden className={cn("animate-pulse rounded-md bg-muted", className)} {...p} />
);
