"use client";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { LogOut, Users } from "lucide-react";
import { signOutAction } from "@/app/actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";
import { useMe } from "./me";
import { Avatar } from "./avatar";

/**
 * Signed-in person + menu (Manage members for the admin, Sign out).
 * A disclosure button: closes on an outside tap/click, Escape (focus returns to the chip), focus leaving the
 * chip, and whenever `closeSignal` changes (the app passes the current tab).
 */
export function UserChip({ className, align = "right", closeSignal }: { className?: string; align?: "left" | "right"; closeSignal?: unknown }) {
  const me = useMe();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => setOpen(false), [closeSignal]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // min-h-10: 40px rows so menu items are easy to hit on phones.
  const item = "flex min-h-10 w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors hover:bg-muted active:bg-muted active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div
      ref={root}
      className={cn("relative", className)}
      // Keyboard users tabbing out of the menu close it too.
      onBlur={(e) => {
        if (open && e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`${me.person}${me.isAdmin ? " (admin)" : ""}: account menu`}
        onClick={() => setOpen((o) => !o)}
        className="glass flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-full p-1 text-sm transition-transform [-webkit-tap-highlight-color:transparent] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-[380px]:pr-3"
      >
        <Avatar name={me.person} src={me.image} size={28} />
        {/* Narrow phones (<380px) show the avatar only and the Admin badge waits for sm, so the chip never
            squeezes the page title onto two lines. The aria-label and the menu still name the person and role. */}
        <span className="hidden font-medium text-[#0f2238] min-[380px]:inline">{me.person}</span>
        {me.isAdmin && (
          <span className="hidden rounded border border-[#0f2238]/20 px-1 text-[10px] text-[#3a4e66] sm:inline">Admin</span>
        )}
      </button>
      <div
        id={menuId}
        hidden={!open}
        className={cn(
          "absolute z-40 mt-2 w-52 rounded-lg border bg-card p-1 text-sm shadow-lg animate-in fade-in-0 zoom-in-95",
          align === "right" ? "right-0" : "left-0"
        )}
      >
        <p className="truncate px-3 pb-1 pt-1.5 text-xs text-muted-foreground">Signed in as {me.person}</p>
        {me.isAdmin && (
          <Link href="/members" onClick={() => setOpen(false)} className={item}>
            <Users className="h-4 w-4" /> Manage members
          </Link>
        )}
        <form action={signOutAction}>
          <SubmitButton variant="ghost" pendingText="Signing out…" className="h-auto min-h-10 w-full justify-start gap-2 px-3 py-2 font-normal">
            <LogOut className="h-4 w-4" /> Sign out
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
