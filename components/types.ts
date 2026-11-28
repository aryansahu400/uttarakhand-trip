import { toast } from "sonner";

export type Expense = {
  id: number;
  description: string;
  amount: string;
  dateTime: string;
  paidBy: string;
  type: "trip" | "personal";
  splitAmong: string[];
  owedTo: string | null;
  naveenPayment: "direct" | "indirect" | null;
  category: string;
  createdBy: string | null;
  /** The phone's id for this entry (null for entries saved before offline support). */
  clientId?: string | null;
};
export type Settlement = {
  id: number;
  fromPerson: string;
  toPerson: string;
  amount: string;
  note: string | null;
  createdAt: string;
  createdBy: string | null;
  clientId?: string | null;
};

/** AppShell's data refresh (onSaved / onChanged). Resolves once the new data is in state. */
export type Reload = () => Promise<unknown> | void;

/** Reads `{ error: string }` from a failed API response; falls back to `fallback`. */
export async function apiError(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  if (typeof body?.error === "string" && body.error.trim()) return body.error;
  if (res.status === 401) return "Your session has expired. Please sign in again.";
  return fallback;
}

/* ------------------------------------------------------------------------------------------------
 * Shared auth-failure handling for the browser (data load, add, settle, delete, members).
 * 401 = signed out / session expired -> straight to /signin.
 * 403 "not on the trip list" = the account was removed -> explain, then /signin?error=AccessDenied.
 * Only one redirect is ever started per page, and the toast uses the fixed id "auth" so repeated
 * failures replace it instead of stacking.
 * ---------------------------------------------------------------------------------------------- */

let redirecting = false;

/** True once an auth redirect has started (callers can skip further error toasts). */
export const isAuthRedirecting = () => redirecting;

/**
 * Sends the browser to the right page for an auth failure. `status` 401 -> /signin;
 * 403 -> shows `message` and goes to /signin?error=AccessDenied after 1.5 s.
 */
export function redirectForAuth(status: 401 | 403, message?: string): void {
  if (redirecting) return;
  redirecting = true;
  if (status === 401) {
    toast.error("Your session has ended. Please sign in again.", { id: "auth" });
    window.location.assign("/signin");
  } else {
    toast.error(message || "Your account is no longer on the trip list", { id: "auth" });
    setTimeout(() => window.location.assign("/signin?error=AccessDenied"), 1500);
  }
}

/**
 * For a 403 from a mutation: is it "you are not a trip member" (auth) rather than a permission
 * rule such as "You can only delete expenses you added"? A 403 from requireMember is re-checked
 * with a cheap GET, so this does not depend on the exact wording of the API message.
 */
async function isMembershipDenied(body: { error?: unknown; code?: unknown } | null): Promise<boolean> {
  if (body?.code === "not_member") return true;
  if (typeof body?.error === "string" && /no longer on the trip list/i.test(body.error)) return true;
  try {
    const probe = await fetch("/api/settlements", { cache: "no-store" });
    return probe.status === 401 || probe.status === 403;
  } catch {
    return false;
  }
}

/**
 * The one error path for failed API calls made from the UI. Reads the `{ error }` message,
 * handles 401/403 auth failures (redirect, see above) and otherwise returns the message to show.
 * Returns `null` when an auth redirect was started (the caller should show nothing more).
 *
 * `onForbidden`: where a 403 that is NOT a membership problem should go (e.g. the admin-only
 * Members page sends non-admins to "/"); by default such a 403 is shown as a normal error.
 */
export async function handleApiFailure(
  res: Response,
  fallback: string,
  opts: { onForbidden?: string } = {}
): Promise<string | null> {
  const body = (await res.json().catch(() => null)) as { error?: unknown; code?: unknown } | null;
  const message = typeof body?.error === "string" && body.error.trim() ? body.error : null;
  if (res.status === 401) {
    redirectForAuth(401);
    return null;
  }
  if (res.status === 403) {
    if (await isMembershipDenied(body)) {
      redirectForAuth(403, message ?? undefined);
      return null;
    }
    if (opts.onForbidden) {
      if (!redirecting) {
        redirecting = true;
        toast.error(message ?? "You don't have access to that page", { id: "auth" });
        window.location.assign(opts.onForbidden);
      }
      return null;
    }
  }
  return message ?? fallback;
}

/** `handleApiFailure` + toast: shows the error (unless an auth redirect started). */
export async function toastApiFailure(res: Response, fallback: string, opts?: { onForbidden?: string }): Promise<void> {
  const msg = await handleApiFailure(res, fallback, opts);
  if (msg === null) return;
  toast.error(msg);
}
