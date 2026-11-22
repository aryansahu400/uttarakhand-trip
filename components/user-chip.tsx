"use client";
import Link from "next/link";
import { LogOut, Users } from "lucide-react";
import { signOutAction } from "@/app/actions";
import { cn } from "@/lib/utils";
import { useMe } from "./me";
import { Avatar } from "./avatar";

/** Signed-in person + menu (Manage members for the admin, Sign out). */
export function UserChip({ className, align = "right" }: { className?: string; align?: "left" | "right" }) {
  const me = useMe();
  return (
    <details className={cn("group relative", className)}>
      <summary className="glass flex cursor-pointer list-none items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm [&::-webkit-details-marker]:hidden">
        <Avatar name={me.person} src={me.image} size={28} />
        <span className="font-medium text-[#0f2238]">{me.person}</span>
        {me.isAdmin && <span className="rounded border border-[#0f2238]/20 px-1 text-[10px] text-[#3a4e66]">Admin</span>}
      </summary>
      <div className={cn("absolute z-40 mt-2 w-52 rounded-lg border bg-card p-1 text-sm shadow-lg", align === "right" ? "right-0" : "left-0")}>
        {me.isAdmin && (
          <Link href="/members" className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-muted">
            <Users className="h-4 w-4" /> Manage members
          </Link>
        )}
        <form action={signOutAction}>
          <button type="submit" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-muted">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </form>
      </div>
    </details>
  );
}
