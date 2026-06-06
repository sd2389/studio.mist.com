import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell } from "@/components/legal/LegalPageShell";

export const metadata: Metadata = {
  title: "Privacy Policy · DevJewels Studio",
};

export default function PrivacyPage() {
  return (
    <LegalPageShell title="Privacy Policy" updated="June 6, 2026">
      <p>
        DevJewels Studio (&quot;we&quot;, &quot;us&quot;) respects your privacy. This policy
        describes what data we collect and how we use it.
      </p>
      <h2>Data we collect</h2>
      <ul>
        <li>Account information: email, name, phone (optional), password hash.</li>
        <li>Usage data: model uploads, credit consumption, render and AI generation events.</li>
        <li>Billing data: Stripe customer ID and subscription status (payment details stay with Stripe).</li>
        <li>Technical data: error reports via Sentry when enabled.</li>
      </ul>
      <h2>How we use data</h2>
      <p>
        We use your data to authenticate you, enforce plan quotas, deliver the Service, process
        payments, send transactional email (password reset, receipts), and improve reliability.
      </p>
      <h2>Model files</h2>
      <p>
        CAD files are converted to GLB in your browser before upload. We store the resulting GLB,
        thumbnails, and scene configuration on our storage infrastructure.
      </p>
      <h2>Third parties</h2>
      <p>
        We use Stripe for payments, optional SMTP for email, and optional Sentry for error
        monitoring. Each provider processes data under their own privacy terms.
      </p>
      <h2>Your rights</h2>
      <p>
        You may update profile information from your account page. For data export or deletion
        requests, contact us via the{" "}
        <Link href="/contact" className="text-primary hover:underline">
          contact form
        </Link>
        .
      </p>
    </LegalPageShell>
  );
}
