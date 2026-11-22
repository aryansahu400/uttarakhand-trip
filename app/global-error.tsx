"use client";
import { useEffect } from "react";

/**
 * Last-resort screen when the root layout itself fails. It replaces the whole document, so it brings its own
 * <html>/<body> and uses inline styles (globals.css may be what failed to load).
 */
export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#f7f7f8", color: "#0f2238", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <main style={{ maxWidth: 420, margin: "0 auto", minHeight: "100dvh", display: "flex", flexDirection: "column", justifyContent: "center", padding: "40px 16px", boxSizing: "border-box" }}>
          <div role="alert" style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: 16, padding: 24, textAlign: "center" }}>
            <h1 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>Something went wrong</h1>
            <p style={{ fontSize: 14, color: "#52525b", margin: "0 0 16px" }}>
              The app couldn&apos;t start. Check your connection and reload. Your saved expenses are safe.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{ height: 40, padding: "0 16px", borderRadius: 8, border: 0, background: "#0f2238", color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer" }}
            >
              Reload app
            </button>
            {error.digest && <p style={{ fontSize: 12, color: "#71717a", margin: "12px 0 0" }}>Error reference: {error.digest}</p>}
          </div>
        </main>
      </body>
    </html>
  );
}
