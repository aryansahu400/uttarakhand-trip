import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/** Simple readable layout for the privacy policy and terms pages. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Uttarakhand Trip
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">Last updated {updated}</p>
      <div className="mt-6 space-y-5 text-[15px] leading-relaxed [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
        {children}
      </div>
      <p className="mt-10 border-t pt-4 text-sm text-muted-foreground">
        <Link href="/privacy" className="underline underline-offset-2">Privacy policy</Link>
        {" · "}
        <Link href="/terms" className="underline underline-offset-2">Terms of use</Link>
      </p>
    </main>
  );
}
