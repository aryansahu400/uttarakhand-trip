"use client";
import { useRef } from "react";
import { CalendarDays, X } from "lucide-react";
import { Input } from "./input";
import { cn } from "@/lib/utils";

/**
 * Date filter with a visible label and a clear (×) button.
 * iPhone Safari's native date picker has no way to empty a date once picked, so we provide one.
 *
 * The × sits INSIDE the field (absolutely positioned over its right padding), so the field keeps
 * the same width whether or not a date is set; the right padding is always reserved so the date
 * text and the browser's calendar icon never move either. Font size is inherited from Input
 * (16px below lg, so iOS does not zoom on focus).
 *
 * Touch (below lg): the × is a full 40px-wide target and the field reserves 40px on the right for it,
 * so it never covers the date. The date text ("20/11/2026" at 16px) needs ~86px, so the field must be
 * at least ~136px wide: callers put date fields on their own row below ~360px (e.g. `max-[359px]:col-span-2`).
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
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="text-xs text-muted-foreground" aria-hidden>
        {label}
      </span>
      <div className="relative min-w-0">
        <Input
          ref={inputRef}
          type="date"
          // Below sm the field is too narrow for date + native calendar icon + ×, so the icon is hidden
          // there and a tap anywhere opens the picker instead (showPicker), which is what phones do anyway.
          className="min-w-0 pl-2 pr-10 lg:pr-8 max-sm:[&::-webkit-calendar-picker-indicator]:hidden"
          onClick={(e) => {
            try {
              e.currentTarget.showPicker?.();
            } catch {
              /* not allowed (e.g. no user activation): the native behaviour still applies */
            }
          }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} date`}
        />
        {/*
          iOS Safari shows an EMPTY date field as a blank box (no "dd/mm/yyyy" and no calendar icon),
          so on iOS only (the -webkit-touch-callout test matches iOS WebKit and nothing else) we draw a
          hint over it. pointer-events-none lets the tap reach the input underneath and open the picker.
        */}
        {!value && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 hidden items-center justify-between pl-2 pr-3 text-base text-muted-foreground supports-[-webkit-touch-callout:none]:flex lg:text-sm"
          >
            Any date
            <CalendarDays className="h-4 w-4 shrink-0" />
          </span>
        )}
        {value && (
          <button
            type="button"
            onClick={(e) => {
              onChange("");
              // The × disappears once the date is cleared, which would drop keyboard focus to <body>.
              // Hand it back to the field, but only for keyboard presses (detail 0): a tap would
              // otherwise pop the iOS date wheel open straight away.
              if (e.detail === 0) inputRef.current?.focus({ preventScroll: true });
            }}
            aria-label={`Clear ${label.toLowerCase()} date`}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground transition-[color,background-color] [-webkit-tap-highlight-color:transparent] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-muted lg:w-8"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
