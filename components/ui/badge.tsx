import { cn } from "@/lib/utils";

export const Badge = ({ className, ...p }: React.HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn("inline-flex items-center whitespace-nowrap rounded border bg-card px-1.5 py-0.5 text-xs text-muted-foreground", className)} {...p} />
);
