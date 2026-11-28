import { useRef } from "react";

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
 * entry with a new id. Clear it after a confirmed save, after a "deleted" (410) answer, and once a refreshed
 * list shows the entry was saved after all (see savedOnServer), so a later identical entry gets its own id.
 */
export class DraftClientId {
  private draft: { id: string; key: string } | null = null;
  constructor(private readonly make: () => string = newClientId) {}

  /** The id for these details: the kept one if the details are unchanged, otherwise a new one. */
  idFor(details: unknown): string {
    const key = JSON.stringify(details);
    if (this.draft?.key !== key) this.draft = { id: this.make(), key };
    return this.draft.id;
  }

  /** The id kept for exactly these details, without making one. */
  peek(details: unknown): string | null {
    return this.draft?.key === JSON.stringify(details) ? this.draft.id : null;
  }

  /** The id of the last save that has not been confirmed yet (whatever its details), or null. */
  pending(): string | null {
    return this.draft?.id ?? null;
  }

  clear(): void {
    this.draft = null;
  }
}

/** One DraftClientId for the lifetime of a form component. */
export function useDraftClientId(): DraftClientId {
  const ref = useRef<DraftClientId | null>(null);
  if (!ref.current) ref.current = new DraftClientId();
  return ref.current;
}

/** True when a list from the server already holds the entry with this client id: its save went through after all. */
export const savedOnServer = (id: string | null, rows: readonly { clientId?: string | null }[]) =>
  !!id && rows.some((r) => r.clientId === id);
