"use client";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { toastApiFailure, type Reload } from "@/components/types";

/**
 * Confirm + DELETE for list rows, shared by Expenses and Settlements.
 * - Per-row busy state (`isDeleting`) so the pressed button can show a spinner.
 * - A ref guard blocks a second request for the same row while one is in flight (double tap).
 * - On success the row is hidden immediately (`isRemoved`), then the data is reloaded,
 *   so the row never lingers under the "Deleted" toast. 404 means it is already gone.
 */
export function useRowDelete(urlFor: (id: number) => string, noun: string, onChanged: Reload) {
  const inFlight = useRef(new Set<number>());
  const [deleting, setDeleting] = useState<ReadonlySet<number>>(new Set());
  const [removed, setRemoved] = useState<ReadonlySet<number>>(new Set());

  const remove = useCallback(
    async (id: number) => {
      if (inFlight.current.has(id)) return;
      if (!confirm(`Delete this ${noun}?`)) return;
      inFlight.current.add(id);
      setDeleting((s) => new Set(s).add(id));
      try {
        const res = await fetch(urlFor(id), { method: "DELETE" });
        if (res.ok || res.status === 404) {
          setRemoved((s) => new Set(s).add(id));
          toast.success(res.ok ? `${noun[0].toUpperCase()}${noun.slice(1)} deleted` : `That ${noun} was already deleted`);
          await onChanged();
        } else {
          await toastApiFailure(res, `Could not delete ${noun}`); // 401/403 (signed out / removed) redirect
        }
      } catch {
        toast.error(`Could not delete ${noun}. Check your connection and try again.`);
      } finally {
        inFlight.current.delete(id);
        setDeleting((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        });
      }
    },
    [urlFor, noun, onChanged]
  );

  /** `removed`: ids deleted in this session; filter them out of the list (stable Set identity until it changes). */
  return { remove, isDeleting: (id: number) => deleting.has(id), removed };
}
