"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { AddExpense } from "./add-expense";
import { GlassNav, LiquidGlassDefs } from "./glass-nav";
import { MountainBanner } from "./mountain-banner";
import { RawExpenses } from "./raw-expenses";
import { Dashboard } from "./dashboard";
import { Settlements } from "./settlements";
import type { Expense, Settlement } from "./types";

export function AppShell() {
  const [tab, setTab] = useState("add");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);

  const load = useCallback(async () => {
    try {
      const [e, s] = await Promise.all([fetch("/api/expenses", { cache: "no-store" }), fetch("/api/settlements", { cache: "no-store" })]);
      if (!e.ok || !s.ok) throw new Error();
      setExpenses(await e.json());
      setSettlements(await s.json());
    } catch {
      toast.error("Could not load data");
    }
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

  useEffect(() => { load(); }, [load, tab]); // refetch on tab switch
  useEffect(() => { window.scrollTo(0, 0); }, [tab]);

  return (
    <Tabs value={tab} onValueChange={setTab} orientation={isDesktop ? "vertical" : "horizontal"}>
      <LiquidGlassDefs />
      <main className="mx-auto max-w-6xl px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 sm:pt-8 lg:flex lg:gap-6 lg:pb-16">
        {/* Desktop: liquid glass side panel */}
        <aside className="hidden w-52 shrink-0 lg:sticky lg:top-8 lg:block lg:self-start">
          <GlassNav value={tab} variant="side" />
        </aside>

        <div className="min-w-0 flex-1">
          <header className="relative mb-5 h-32 overflow-hidden rounded-lg border sm:mb-6 sm:h-44">
            <MountainBanner className="absolute inset-0 h-full w-full" />
            <div className="relative px-4 pt-4 sm:px-6 sm:pt-5">
              <h1 className="text-xl font-semibold tracking-tight text-[#0f2238] sm:text-2xl">Uttarakhand trip</h1>
              <p className="text-sm text-[#3a4e66]">18 December · 7 people</p>
            </div>
          </header>

          <TabsContent value="add"><AddExpense onSaved={load} expenses={expenses} /></TabsContent>
          <TabsContent value="raw"><RawExpenses expenses={expenses} onChanged={load} /></TabsContent>
          <TabsContent value="dash"><Dashboard expenses={expenses} settlements={settlements} /></TabsContent>
          <TabsContent value="settle"><Settlements expenses={expenses} settlements={settlements} onChanged={load} /></TabsContent>

          <footer className="mt-10 flex justify-center gap-4 text-xs text-muted-foreground">
            <Link href="/privacy" className="hover:text-foreground hover:underline">Privacy policy</Link>
            <Link href="/terms" className="hover:text-foreground hover:underline">Terms of use</Link>
          </footer>
        </div>
      </main>

      {/* Phones + tablets: floating liquid glass capsule */}
      <GlassNav value={tab} variant="bar" />
    </Tabs>
  );
}
