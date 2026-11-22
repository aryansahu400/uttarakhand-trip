"use client";
import { X } from "lucide-react";
import { Input } from "./input";
import { cn } from "@/lib/utils";

/**
 * Date filter with a visible label and a clear (×) button.
 * iPhone Safari's native date picker has no way to empty a date once picked, so we provide one.
 */
export function DateField({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex min-w-0 items-center gap-1">
        <Input
          type="date"
          className="min-w-0 flex-1 px-2 text-sm"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} date`}
        />
        {value && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onChange("");
            }}
            aria-label={`Clear ${label.toLowerCase()} date`}
            className="flex h-11 w-9 shrink-0 items-center justify-center rounded-md border border-input bg-card text-muted-foreground hover:bg-muted hover:text-foreground sm:h-9 sm:w-8"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </label>
  );
}
