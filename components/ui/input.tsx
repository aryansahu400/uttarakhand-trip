import * as React from "react";
import { cn } from "@/lib/utils";

/*
 * Inputs stay 44px tall with a 16px font below `lg`: tablets and phones are touch devices,
 * and iOS Safari zooms into any focused field whose font is smaller than 16px.
 * From `lg` up they become compact (36px / 14px), matching Button's default size.
 */
const field =
  "flex h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-base shadow-none lg:h-9 lg:py-1.5 lg:text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(field, "placeholder:text-muted-foreground", className)} {...props} />
));
Input.displayName = "Input";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn(field, "text-ellipsis", className)} {...props} />
));
Select.displayName = "Select";
