import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell } from "@/components/legal/LegalPageShell";

export const metadata: Metadata = {
  title: "Refund Policy · DevJewels Studio",
};

export default function RefundPage() {
  return (
    <LegalPageShell title="Refund Policy" updated="June 6, 2026">
      <p>
        We want you to be satisfied with DevJewels Studio. This Refund Policy explains how
        subscription and top-up purchases are handled.
      </p>
      <h2>Subscriptions</h2>
      <p>
        Monthly subscriptions renew automatically through Stripe. You may cancel anytime from the
        billing portal; access continues until the end of the current billing period. We do not
        provide prorated refunds for partial months unless required by law.
      </p>
      <h2>Credit top-ups</h2>
      <p>
        One-time credit purchases are generally non-refundable once credits have been applied to
        your account. If credits were not delivered due to a technical error, contact support
        within 14 days for a review.
      </p>
      <h2>Billing disputes</h2>
      <p>
        Email us through the{" "}
        <Link href="/contact" className="text-primary hover:underline">
          contact form
        </Link>{" "}
        with your account email and Stripe receipt. We respond within 5 business days.
      </p>
      <h2>Chargebacks</h2>
      <p>
        Initiating a chargeback without contacting us first may result in account suspension while
        the dispute is investigated.
      </p>
    </LegalPageShell>
  );
}
