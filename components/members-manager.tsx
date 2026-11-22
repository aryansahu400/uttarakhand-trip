"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ADMIN_PERSON } from "@/lib/people";

type Row = { name: string; email: string | null };

export function MembersManager() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/members", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d: { adminEmail: string | null; members: Row[] }) => {
        setRows(d.members);
        setAdminEmail(d.adminEmail);
        setDrafts(Object.fromEntries(d.members.map((m) => [m.name, m.email ?? ""])));
      })
      .catch(() => toast.error("Could not load members"));
  }, []);

  async function save(name: string, email: string | null) {
    setSaving(name);
    try {
      const res = await fetch("/api/members", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email: email?.trim() ? email.trim() : null }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Could not save");
      setRows((rs) => rs!.map((r) => (r.name === name ? { ...r, email: body.email } : r)));
      setDrafts((d) => ({ ...d, [name]: body.email ?? "" }));
      toast.success(body.email ? `${name} can now sign in` : `${name}'s access removed`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(null);
    }
  }

  if (!rows) return <Card className="p-6 text-sm text-muted-foreground">Loading…</Card>;

  return (
    <Card className="divide-y">
      {rows.map((r) => {
        const isAdminRow = r.name === ADMIN_PERSON;
        const draft = drafts[r.name] ?? "";
        const dirty = draft.trim().toLowerCase() !== (r.email ?? "");
        return (
          <div key={r.name} className="space-y-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{r.name}</span>
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
                save(r.name, draft);
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
              <Button type="submit" disabled={!dirty || saving === r.name} className="shrink-0">
                {saving === r.name && <Loader2 className="h-4 w-4 animate-spin" />} Save
              </Button>
              {r.email && (
                <Button type="button" variant="outline" className="shrink-0" disabled={saving === r.name} onClick={() => save(r.name, null)}>
                  Remove
                </Button>
              )}
            </form>
          </div>
        );
      })}
    </Card>
  );
}
