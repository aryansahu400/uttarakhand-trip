import { useMemo, useRef } from "react";

/** A random version-4 UUID: crypto.randomUUID where available, otherwise built from crypto.getRandomValues. */
export function newClientId(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * The client id for a form's next save. Tapping Save again with exactly the same details (after a failure or a
 * lost answer) reuses the id, so the server stores the entry once; any change to the details makes it a new
 * entry with a new id. Call clear() after a successful save.
 */
export function useDraftClientId() {
  const draft = useRef<{ id: string; key: string } | null>(null);
  return useMemo(
    () => ({
      idFor(details: unknown): string {
        const key = JSON.stringify(details);
        if (draft.current?.key !== key) draft.current = { id: newClientId(), key };
        return draft.current.id;
      },
      clear() {
        draft.current = null;
      },
    }),
    []
  );
}
