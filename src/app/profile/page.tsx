import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ProfileShell } from "@/features/billing/ui/ProfileShell";
import { fetchCurrentUser } from "@/lib/auth/server-session";
import { requireBillingAccountServer } from "@/lib/billing/server-fetch";

export const metadata: Metadata = {
  title: "Profile · DevJewels Studio",
  description: "Plan details, credits, and account settings.",
};

export default async function ProfilePage() {
  const user = await fetchCurrentUser();
  if (!user) redirect("/login?next=/profile");

  const billing = await requireBillingAccountServer();

  return <ProfileShell initialUser={user} initialBilling={billing} />;
}
