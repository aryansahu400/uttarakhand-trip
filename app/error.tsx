"use client";
import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/** A JS chunk that failed to download (offline, or removed by a redeploy): only a full reload can fix it. */
function isChunkLoadError(err: Error) {
  return err.name === "ChunkLoadError" || /Loading (CSS )?chunk [\w/.-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i.test(err.message);
}

/** Route-level error screen (instead of Next's blank "Application error"). The root layout and toaster stay. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const chunk = isChunkLoadError(error);

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-4 py-10">
      <div role="alert" className="space-y-3 rounded-2xl border bg-card p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold tracking-tight">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">
          {chunk
            ? "Part of the app couldn't be downloaded. Check your connection, then reload. The app may also have just been updated."
            : "The page hit an unexpected error. Your saved expenses are safe."}
        </p>
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          <Button className="h-10" onClick={() => (chunk ? window.location.reload() : reset())}>
            {chunk ? "Reload app" : "Try again"}
          </Button>
          <Button asChild variant="outline" className="h-10">
            <Link href="/">Back to the trip</Link>
          </Button>
        </div>
        {error.digest && <p className="pt-1 text-xs text-muted-foreground">Error reference: {error.digest}</p>}
      </div>
    </main>
  );
}
