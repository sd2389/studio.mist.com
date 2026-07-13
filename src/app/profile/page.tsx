import type { Metadata } from "next";
import { ProfileShell } from "@/features/billing/ui/ProfileShell";
import { requirePageUser } from "@/lib/auth/require-page-user";
import { requireBillingAccountServer } from "@/lib/billing/server-fetch";

export const metadata: Metadata = {
  title: "Profile · DevJewels Studio",
  description: "Plan details, credits, and account settings.",
};

export default async function ProfilePage() {
  const user = await requirePageUser("/profile");
  const billing = await requireBillingAccountServer();

  return <ProfileShell initialUser={user} initialBilling={billing} />;
}
