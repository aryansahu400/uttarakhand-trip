import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Privacy policy · Uttarakhand Trip" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="23 November 2026">
      <p>
        Uttarakhand Trip is a small, private app that a group of seven friends uses to track and split the costs of
        one trip. It is run by Aryan, the trip organiser. It is not a commercial service and is not offered to the
        public.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Your Google account name and email address</strong>, when you sign in with Google. We use them only
          to check that you are one of the trip members and to show who you are in the app. We do not receive your
          Google password, contacts, files or any other Google data.
        </li>
        <li>
          <strong>Trip records you enter</strong>: expense descriptions, amounts, dates, who paid, who shares the cost,
          personal lends between members, settlements and notes.
        </li>
        <li>
          <strong>Your member email</strong>, if the organiser adds it to the members list so you can sign in.
        </li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To let trip members sign in and to keep everyone else out.</li>
        <li>To calculate who spent what, each person&apos;s share, and who should pay whom.</li>
        <li>To record who added each entry, so only that person (or the organiser) can delete it.</li>
      </ul>
      <p>We do not sell, rent or share your information, show ads, or use it for marketing or profiling.</p>

      <h2>Who can see it</h2>
      <p>
        All trip members can see the trip records, because splitting costs needs everyone&apos;s entries. Member email
        addresses are visible only to the organiser.
      </p>

      <h2>Where it is stored</h2>
      <p>
        The app runs on Vercel and stores data in a Neon Postgres database. These providers host the data for us and
        do not use it for their own purposes. Connections are encrypted (HTTPS).
      </p>

      <h2>Cookies</h2>
      <p>
        We use one essential cookie to keep you signed in. There are no advertising or tracking cookies and no
        analytics.
      </p>

      <h2>How long we keep it</h2>
      <p>
        Trip records are kept until the trip is settled and the group no longer needs them, after which the organiser
        can delete them. You can ask at any time for your entries or your email to be removed.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>Delete entries you added yourself from inside the app.</li>
        <li>Ask the organiser to correct or delete any of your information, or to remove your access.</li>
        <li>
          Remove the app&apos;s access to your Google account at any time from your Google Account settings
          (Security → Third-party apps with account access).
        </li>
      </ul>

      <h2>Contact</h2>
      <p>For any question or request about your information, contact Aryan, the trip organiser.</p>

      <h2>Changes</h2>
      <p>If this policy changes, the updated version will be posted on this page with a new date.</p>
    </LegalPage>
  );
}
