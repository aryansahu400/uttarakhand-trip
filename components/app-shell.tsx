"use client";
import { Component, Suspense, lazy, useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { AddExpense } from "./add-expense";
import { GlassNav, LiquidGlassDefs, TABS } from "./glass-nav";
import { MountainBanner } from "./mountain-banner";
import { RawExpenses } from "./raw-expenses";
import { Settlements } from "./settlements";
import type { Expense, Settlement } from "./types";
import { MeProvider, type Me } from "./me";
import { UserChip } from "./user-chip";
import { PhotosProvider } from "./avatar";

/** Neutral placeholder shown while the dashboard's chart bundle downloads. */
function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading dashboard" className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg border bg-card" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-lg border bg-card" />
      <div className="h-48 animate-pulse rounded-lg border bg-card" />
    </div>
  );
}

// Recharts (+ lodash, d3) is only needed on the Dashboard tab, so keep it out of the first-load bundle.
const loadDashboard = () => import("./dashboard").then((m) => m.Dashboard);
type DashboardProps = { expenses: Expense[]; settlements: Settlement[]; loading: boolean };
/**
 * A fresh lazy component per attempt. React.lazy (and next/dynamic) cache a rejected import forever, so after a
 * ChunkLoadError (offline, or the chunk hash changed after a redeploy) Retry must build a new one; webpack drops a
 * failed chunk from its cache, so the new import() really downloads it again.
 */
const makeDashboard = () => lazy(() => loadDashboard().then((Dashboard) => ({ default: Dashboard as ComponentType<DashboardProps> })));

/** True for webpack/Next chunk download failures (as opposed to a bug while rendering). */
function isChunkLoadError(err: unknown) {
  if (!(err instanceof Error)) return false;
  return err.name === "ChunkLoadError" || /Loading (CSS )?chunk [\w/.-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i.test(err.message);
}

/**
 * Keeps a failed dashboard load (or a dashboard crash) inside its own tab instead of replacing the whole app
 * with Next's error screen, so half-filled forms in the other tabs survive. `onRetry` is called before the
 * boundary resets so the parent can swap in a fresh lazy component.
 */
class DashboardBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { error: unknown; attempts: number }> {
  state = { error: null as unknown, attempts: 0 };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  componentDidCatch(error: unknown) {
    console.error("Dashboard failed to load", error);
  }
  retry = () => {
    this.props.onRetry();
    this.setState((s) => ({ error: null, attempts: s.attempts + 1 }));
  };
  render() {
    const { error, attempts } = this.state;
    if (!error) return this.props.children;
    const chunk = isChunkLoadError(error);
    return (
      <div role="alert" className="flex flex-col items-center gap-3 rounded-lg border bg-card px-4 py-10 text-center">
        <p className="font-medium">Couldn&apos;t load the dashboard</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {chunk
            ? attempts > 0
              ? "Still no luck. Check your connection, or reload the app if it was just updated."
              : "Check your connection and try again."
            : "Something went wrong while drawing the charts."}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={this.retry} className="h-10 gap-2">
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Retry
          </Button>
          {/* After a redeploy the old chunk no longer exists, so only a full reload fetches the new build. */}
          {attempts > 0 && (
            <Button variant="outline" className="h-10" onClick={() => window.location.reload()}>
              Reload app
            </Button>
          )}
        </div>
      </div>
    );
  }
}

export type TabValue = (typeof TABS)[number]["value"];
const TAB_VALUES = TABS.map((t) => t.value) as readonly string[];
const parseTab = (v: string | null | undefined): TabValue => (v && TAB_VALUES.includes(v) ? (v as TabValue) : "add");

/** Don't refetch on focus/visibility more often than this (both events usually fire together). */
const REFOCUS_MIN_MS = 5_000;

/** Reads `{error}` from an API error response, falling back to a generic message. */
async function errorMessage(res: Response, fallback: string) {
  try {
    const body = await res.json();
    if (body && typeof body.error === "string" && body.error) return body.error as string;
  } catch {}
  return fallback;
}

/** Thrown for 401/403 so the caller can stop and send the person to sign in. */
class AuthError extends Error {
  constructor(readonly status: 401 | 403, message: string) {
    super(message);
  }
}

/** `initialTab` is the raw ?tab= value from the server render; unknown values fall back to "add". */
export function AppShell({ me, initialTab }: { me: Me; initialTab?: string }) {
  const [tab, setTabState] = useState<TabValue>(() => parseTab(initialTab));
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  // True until the first successful fetch: components show skeletons instead of believable zeros.
  const [loaded, setLoaded] = useState(false);
  // The dashboard is mounted on first visit and then kept (so its filters survive tab switches).
  const [dashSeen, setDashSeen] = useState(() => parseTab(initialTab) === "dash");
  const [Dashboard, setDashboard] = useState(makeDashboard);
  const retryDashboard = useCallback(() => setDashboard(makeDashboard), []);
  // The dashboard is client-only (charts measure the DOM): the server render and hydration show the skeleton.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  // ---- Data loading -------------------------------------------------------------------------------
  // Each call gets a sequence number; only the newest response is applied, so a slow older request can
  // never overwrite fresher data. The returned promise resolves once the *latest* data is on screen.
  const seq = useRef(0);
  const latest = useRef<Promise<void>>(Promise.resolve());
  const abort = useRef<AbortController | null>(null);
  const lastStart = useRef(0);
  const redirecting = useRef(false);

  const fetchOnce = useCallback(async (id: number, signal: AbortSignal) => {
    try {
      const opts = { cache: "no-store" as const, signal };
      const [e, s] = await Promise.all([fetch("/api/expenses", opts), fetch("/api/settlements", opts)]);
      for (const r of [e, s]) {
        if (r.status === 401) throw new AuthError(401, await errorMessage(r, "Sign in required"));
        if (r.status === 403) throw new AuthError(403, await errorMessage(r, "Your account is no longer on the trip list"));
        if (!r.ok) throw new Error(await errorMessage(r, "Could not load data"));
      }
      const [ex, st] = await Promise.all([e.json(), s.json()]);
      if (id !== seq.current) return; // superseded by a newer load
      setExpenses(ex);
      setSettlements(st);
      setLoaded(true);
      toast.dismiss("load-error");
    } catch (err) {
      if (signal.aborted || id !== seq.current || redirecting.current) return;
      if (err instanceof AuthError) {
        // Session expired → straight to sign-in. Removed member → explain, then show the "not on the list" page.
        redirecting.current = true;
        if (err.status === 401) {
          toast.error("Your session has ended. Please sign in again.", { id: "auth" });
          // Return to the same section (?tab=) once signed in again.
          const back = window.location.pathname + window.location.search;
          window.location.assign(`/signin?callbackUrl=${encodeURIComponent(back)}`);
        } else {
          toast.error(err.message, { id: "auth" });
          setTimeout(() => window.location.assign("/signin?error=AccessDenied"), 1500);
        }
        return;
      }
      // fetch() rejects with a TypeError on network failure ("Failed to fetch" / "Load failed").
      const msg =
        err instanceof TypeError
          ? "Could not load data. Check your connection."
          : err instanceof Error && err.constructor === Error && err.message // our own Error(body.error), not a parse error
            ? err.message
            : "Could not load data";
      // A fixed id means repeated failures update one toast instead of stacking new ones.
      toast.error(msg, { id: "load-error" });
    }
  }, []);

  const load = useCallback((): Promise<void> => {
    const id = ++seq.current;
    lastStart.current = Date.now();
    abort.current?.abort(); // the older request's result would be discarded anyway
    const ctrl = new AbortController();
    abort.current = ctrl;
    const p = fetchOnce(id, ctrl.signal);
    latest.current = p;
    // If a newer load starts while this one runs, wait for that one too before resolving.
    const settle = async (): Promise<void> => {
      await p;
      let seen = id;
      while (seen !== seq.current) {
        seen = seq.current;
        await latest.current;
      }
    };
    return settle();
  }, [fetchOnce]);

  // First load, then refresh when the person comes back to the app (not on every tab switch).
  useEffect(() => {
    load();
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastStart.current < REFOCUS_MIN_MS) return;
      load();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      abort.current?.abort();
    };
  }, [load]);

  // ---- Tab ↔ URL (?tab=) --------------------------------------------------------------------------
  // Radix may report the same change twice for one tap (mousedown, then focus) before React re-renders,
  // so the "already on this tab?" check reads a ref that updates synchronously, not the `tab` state.
  const tabRef = useRef(tab);
  const showTab = useCallback((v: TabValue) => {
    tabRef.current = v;
    setTabState(v);
    if (v === "dash") setDashSeen(true);
  }, []);

  const setTab = useCallback(
    (raw: string) => {
      const v = parseTab(raw);
      if (v === tabRef.current) return;
      showTab(v);
      const url = new URL(window.location.href);
      if (v === "add") url.searchParams.delete("tab");
      else url.searchParams.set("tab", v);
      // Push (not replace) so the browser Back button walks back through tabs.
      window.history.pushState(null, "", url);
      window.scrollTo(0, 0);
    },
    [showTab]
  );

  useEffect(() => {
    const onPop = () => showTab(parseTab(new URLSearchParams(window.location.search).get("tab")));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [showTab]);

  // Warm the dashboard chunk once the page is idle so the first visit is instant.
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number; cancelIdleCallback?: (h: number) => void };
    // A failed prefetch is harmless: the real visit retries the import and shows its own fallback.
    const warm = () => void loadDashboard().catch(() => {});
    if (w.requestIdleCallback) {
      const h = w.requestIdleCallback(warm);
      return () => w.cancelIdleCallback?.(h);
    }
    const t = setTimeout(warm, 2000);
    return () => clearTimeout(t);
  }, []);

  // Desktop (lg, ≥1024px) uses the vertical side panel, so arrow keys go Up/Down there.
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Members' Google photos (filled in as each person signs in)
  const [photos, setPhotos] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch("/api/people", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { name: string; image: string | null }[]) =>
        setPhotos(Object.fromEntries(rows.filter((r) => r.image).map((r) => [r.name, r.image as string])))
      )
      .catch(() => {});
  }, []);

  const loading = !loaded;
  // Every panel stays mounted (forceMount) so half-typed forms, filters and expanded rows survive tab
  // switches; Radix marks inactive panels with the `hidden` attribute, which removes them from layout.
  const panel = "outline-none data-[state=inactive]:hidden";

  return (
    <MeProvider value={me}>
    <PhotosProvider value={me.image ? { ...photos, [me.person]: me.image } : photos}>
    <Tabs value={tab} onValueChange={setTab} orientation={isDesktop ? "vertical" : "horizontal"}>
      <LiquidGlassDefs />
      <main className="mx-auto max-w-6xl px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 sm:pt-8 lg:flex lg:gap-6 lg:pb-16">
        {/* Desktop: liquid glass side panel */}
        <aside className="hidden w-52 shrink-0 lg:sticky lg:top-8 lg:block lg:self-start">
          <GlassNav value={tab} variant="side" />
          <UserChip className="mt-3" align="left" closeSignal={tab} />
        </aside>

        <div className="relative min-w-0 flex-1">
          {/* The banner clips itself, so the header can stay overflow-visible and hold the chip's menu. */}
          <header className="relative mb-5 h-32 rounded-lg border sm:mb-6 sm:h-44">
            <div className="absolute inset-0 overflow-hidden rounded-[inherit]">
              <MountainBanner className="absolute inset-0 h-full w-full" />
            </div>
            {/* Title and chip share one row, so the chip can never sit on top of the title. */}
            <div className="relative flex items-start gap-3 px-4 pt-4 sm:px-6 sm:pt-5">
              <div className="relative min-w-0 flex-1">
                {/* One line each at every width (the chip shrinks first, see UserChip); truncate is a last resort. */}
                <h1 className="truncate text-xl font-semibold tracking-tight text-[#0f2238] sm:text-2xl">Uttarakhand trip</h1>
                <p className="truncate text-sm text-[#3a4e66]">18 December · 7 people</p>
              </div>
              <UserChip className="-mr-1 -mt-1 shrink-0 lg:hidden" closeSignal={tab} />
            </div>
          </header>

          <TabsContent value="add" forceMount className={panel}>
            <AddExpense onSaved={load} expenses={expenses} loading={loading} />
          </TabsContent>
          <TabsContent value="raw" forceMount className={panel}>
            <RawExpenses expenses={expenses} onChanged={load} loading={loading} />
          </TabsContent>
          {/* The dashboard is NOT display:none when inactive: Recharts' ResponsiveContainer would measure 0×0,
              warn and redraw from scratch on every return. Instead it stays laid out at full width, collapsed
              to 0 height and invisible (so it is also unfocusable and hidden from screen readers). */}
          <TabsContent
            value="dash"
            forceMount
            className="outline-none data-[state=inactive]:pointer-events-none data-[state=inactive]:invisible data-[state=inactive]:absolute data-[state=inactive]:inset-x-0 data-[state=inactive]:top-0 data-[state=inactive]:block data-[state=inactive]:h-0 data-[state=inactive]:overflow-hidden"
          >
            {dashSeen && !hydrated && <DashboardSkeleton />}
            {dashSeen && hydrated && (
              <DashboardBoundary onRetry={retryDashboard}>
                <Suspense fallback={<DashboardSkeleton />}>
                  <Dashboard expenses={expenses} settlements={settlements} loading={loading} />
                </Suspense>
              </DashboardBoundary>
            )}
          </TabsContent>
          <TabsContent value="settle" forceMount className={panel}>
            <Settlements expenses={expenses} settlements={settlements} onChanged={load} loading={loading} />
          </TabsContent>

          {/* Links keep a 40px-tall hit area for thumbs while the text stays small. */}
          <footer className="mt-8 flex justify-center gap-2 text-xs text-muted-foreground">
            <Link href="/privacy" className="inline-flex min-h-10 items-center px-2 hover:text-foreground hover:underline">Privacy policy</Link>
            <Link href="/terms" className="inline-flex min-h-10 items-center px-2 hover:text-foreground hover:underline">Terms of use</Link>
          </footer>
        </div>
      </main>

      {/* Phones + tablets: floating liquid glass capsule */}
      <GlassNav value={tab} variant="bar" />
    </Tabs>
    </PhotosProvider>
    </MeProvider>
  );
}
