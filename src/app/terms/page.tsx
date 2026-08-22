import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
};

export default function Terms() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-bold mb-8">Terms of Service</h1>
      <div className="space-y-4 text-gray-700 leading-relaxed">
        <p>Last updated: August 2026</p>

        <h2 className="text-xl font-semibold pt-4">The short version</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>Live Notes is a free, public, shared whiteboard. Be civil.</li>
          <li>
            Anyone with the link can read and change any note — treat it like
            a public wall, not a private notebook.
          </li>
          <li>
            The app is provided &quot;as is&quot;, with no guarantees of availability,
            accuracy, or data retention.
          </li>
        </ul>

        <h2 className="text-xl font-semibold pt-4">Acceptable use</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>Don&apos;t post illegal content, malware, spam, or others&apos; personal data.</li>
          <li>Don&apos;t attempt to break the service or abuse Firebase quotas.</li>
          <li>The owner may remove content or block access at their discretion.</li>
        </ul>

        <h2 className="text-xl font-semibold pt-4">Your account</h2>
        <p>
          Signing in is optional; anonymous use is supported. You are
          responsible for keeping your Google account credentials secure.
        </p>

        <h2 className="text-xl font-semibold pt-4">Liability</h2>
        <p>
          To the maximum extent permitted by law, the site owner is not liable
          for any loss of notes or data. This is a hobby project — keep your
          own backups of anything important.
        </p>
      </div>
    </main>
  );
}
