"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Check, Loader2, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MembersSkeleton } from "@/components/ui/members-skeleton";
import { ADMIN_PERSON } from "@/lib/people";
import { Avatar } from "./avatar";
import { handleApiFailure, isAuthRedirecting } from "./types";

// Signed out -> /signin; removed from the trip -> /signin?error=AccessDenied; signed in but not the admin -> "/".
const AUTH = { onForbidden: "/" };

type Row = { name: string; email: string | null; image: string | null };

export function MembersManager() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // Which row is saving and which button started it, so the spinner shows on the pressed button.
  const [saving, setSaving] = useState<{ name: string; action: "save" | "remove" } | null>(null);

  // Load failure that is not an auth redirect: shown inline with a Retry button (never an endless "Loading…").
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/members", { cache: "no-store" });
      if (!res.ok) {
        const msg = await handleApiFailure(res, "Could not load members", AUTH);
        if (msg !== null) setLoadError(msg); // null: redirecting to sign-in / home, keep the skeleton
        return;
      }
      const d: { adminEmail: string | null; members: Row[] } = await res.json();
      setLoadError(null);
      setRows(d.members);
      setAdminEmail(d.adminEmail);
      setDrafts(Object.fromEntries(d.members.map((m) => [m.name, m.email ?? ""])));
    } catch {
      if (!isAuthRedirecting()) setLoadError("Could not load members. Check your connection and try again.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(name: string, email: string | null, action: "save" | "remove") {
    if (saving) return;
    // Removing access (Remove, or Save with an emptied field) stops that person signing in, so ask first.
    if (!email?.trim() && !confirm(`Remove ${name}'s access? They will no longer be able to sign in.`)) return;
    setSaving({ name, action });
    try {
      const res = await fetch("/api/members", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email: email?.trim() ? email.trim() : null }),
      });
      if (!res.ok) {
        const msg = await handleApiFailure(res, "Could not save", AUTH);
        if (msg !== null) toast.error(msg);
        return;
      }
      const body = await res.json();
      setRows((rs) => rs!.map((r) => (r.name === name ? { ...r, email: body.email } : r)));
      setDrafts((d) => ({ ...d, [name]: body.email ?? "" }));
      toast.success(body.email ? `${name} can now sign in` : `${name}'s access removed`);
    } catch {
      toast.error("Could not save. Check your connection and try again.");
    } finally {
      setSaving(null);
    }
  }

  if (!rows && loadError)
    return (
      <Card role="alert" className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          {loadError}
        </p>
        <Button
          variant="outline"
          className="shrink-0"
          disabled={retrying}
          aria-busy={retrying}
          onClick={async () => {
            setRetrying(true);
            await load();
            setRetrying(false);
          }}
        >
          {retrying && <Loader2 className="h-4 w-4 animate-spin" />} Retry
        </Button>
      </Card>
    );
  if (!rows) return <MembersSkeleton />;

  return (
    <Card className="divide-y">
      {rows.map((r) => {
        const isAdminRow = r.name === ADMIN_PERSON;
        const draft = drafts[r.name] ?? "";
        const dirty = draft.trim().toLowerCase() !== (r.email ?? "");
        const busy = saving?.name === r.name ? saving.action : null;
        return (
          <div key={r.name} className="space-y-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-medium">
                <Avatar name={r.name} src={r.image} size={28} />
                {r.name}
              </span>
              {r.email || (isAdminRow && adminEmail) ? (
                <span className="flex items-center gap-1 text-xs text-emerald-700">
                  <Check className="h-3.5 w-3.5" /> Can sign in
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">No access yet</span>
              )}
            </div>
            {isAdminRow && adminEmail && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="h-3 w-3" /> Admin account: {adminEmail} (set in Vercel, always allowed)
              </p>
            )}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                save(r.name, draft, "save");
              }}
            >
              <Input
                type="email"
                inputMode="email"
                autoComplete="off"
                placeholder={isAdminRow ? "Optional extra email" : "name@gmail.com"}
                value={draft}
                onChange={(e) => setDrafts((d) => ({ ...d, [r.name]: e.target.value }))}
                aria-label={`${r.name}'s Google email`}
                className="min-w-0 flex-1"
              />
              <Button type="submit" disabled={!dirty || !!busy} aria-busy={busy === "save"} className="shrink-0">
                {busy === "save" && <Loader2 className="h-4 w-4 animate-spin" />} Save
              </Button>
              {r.email && (
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  disabled={!!busy}
                  aria-busy={busy === "remove"}
                  onClick={() => save(r.name, null, "remove")}
                >
                  {busy === "remove" && <Loader2 className="h-4 w-4 animate-spin" />} Remove
                </Button>
              )}
            </form>
          </div>
        );
      })}
    </Card>
  );
}
