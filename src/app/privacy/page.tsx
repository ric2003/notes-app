import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPolicy() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-bold mb-8">Privacy Policy</h1>
      <div className="space-y-4 text-gray-700 leading-relaxed">
        <p>
          Last updated: August 2026
        </p>
        <p>
          Live Notes is a free, shared sticky-note board. This page explains
          what data the app handles, in plain language.
        </p>

        <h2 className="text-xl font-semibold pt-4">What we collect</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong>Notes you create:</strong> note text, color, position,
            and timestamps are stored so the board works for everyone.
          </li>
          <li>
            <strong>If you sign in:</strong> your email address, display name,
            and profile photo (from Google or email sign-up) are stored to
            show who wrote each note and who is online.
          </li>
          <li>
            <strong>Presence data:</strong> a transient &quot;online&quot; flag while
            you have the board open.
          </li>
        </ul>

        <h2 className="text-xl font-semibold pt-4">What you should know</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>
            <strong>The board is public.</strong> Anyone with the link can
            read, create, edit, move, and delete any note. Do not write
            anything private or sensitive on it.
          </li>
          <li>Data is stored in Google Firebase (Realtime Database).</li>
          <li>
            We do not sell or share your data with anyone. There are no ads
            and no analytics beyond Firebase&apos;s basic defaults.
          </li>
        </ul>

        <h2 className="text-xl font-semibold pt-4">Deleting your data</h2>
        <p>
          You can delete any notes you created directly on the board. To have
          your account removed entirely, contact the site owner.
        </p>

        <h2 className="text-xl font-semibold pt-4">Contact</h2>
        <p>
          Questions about this policy? Open an issue on the project&apos;s
          repository.
        </p>
      </div>
    </main>
  );
}
