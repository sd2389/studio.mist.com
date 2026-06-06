import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell } from "@/components/legal/LegalPageShell";

export const metadata: Metadata = {
  title: "Terms of Service · DevJewels Studio",
};

export default function TermsPage() {
  return (
    <LegalPageShell title="Terms of Service" updated="June 6, 2026">
      <p>
        These Terms of Service (&quot;Terms&quot;) govern your use of DevJewels Studio
        (&quot;Service&quot;) operated by DevJewels. By creating an account or using the Service,
        you agree to these Terms.
      </p>
      <h2>Accounts</h2>
      <p>
        You are responsible for maintaining the confidentiality of your credentials and for all
        activity under your account. You must provide accurate registration information.
      </p>
      <h2>Subscriptions and credits</h2>
      <p>
        Paid plans and credit top-ups are billed through Stripe. Credits are consumed when you
        upload models, generate AI images, create custom materials, or store assets. Unused
        monthly credits do not roll over unless stated otherwise at purchase.
      </p>
      <h2>Acceptable use</h2>
      <p>
        You may not abuse rate limits, attempt to circumvent quota enforcement, upload unlawful
        content, or use the Service to infringe third-party intellectual property.
      </p>
      <h2>Content</h2>
      <p>
        You retain ownership of models and assets you upload. You grant DevJewels a limited license
        to host, process, and display your content solely to operate the Service.
      </p>
      <h2>Termination</h2>
      <p>
        We may suspend or terminate accounts that violate these Terms. You may cancel subscriptions
        through the billing portal at any time.
      </p>
      <h2>Disclaimer</h2>
      <p>
        The Service is provided &quot;as is&quot; without warranties of merchantability or fitness
        for a particular purpose. See our{" "}
        <Link href="/refund" className="text-primary hover:underline">
          Refund Policy
        </Link>{" "}
        for billing disputes.
      </p>
    </LegalPageShell>
  );
}
