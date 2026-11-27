import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Terms of use · Uttarakhand Trip" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="27 November 2026">
      <p>
        Uttarakhand Trip is a private, free app for a small group of friends to track and split the costs of one trip.
        It is run by Aryan, the trip organiser. By using it you agree to these simple terms.
      </p>

      <h2>Who can use it</h2>
      <p>Only trip members added by the organiser. Please don&apos;t share your access with anyone else.</p>

      <h2>Your entries</h2>
      <ul>
        <li>Enter expenses, lends and settlements honestly and as accurately as you can.</li>
        <li>You can delete entries you added. The organiser can delete any entry to fix mistakes.</li>
      </ul>

      <h2>No guarantees</h2>
      <p>
        The app calculates balances and suggested payments to help the group, but it is provided as is. Check amounts
        before paying anyone. The organiser is not responsible for errors, lost data or disagreements over money.
      </p>

      <h2>Changes and ending</h2>
      <p>
        The app may be changed or switched off after the trip. Any updates to these terms will be posted on this page.
      </p>

      <h2>Privacy</h2>
      <p>
        How your information is handled is explained in the <a href="/privacy" className="underline underline-offset-2">privacy policy</a>.
      </p>
    </LegalPage>
  );
}
