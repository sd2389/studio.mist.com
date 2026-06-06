import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminFeaturesShell } from "@/features/feature-flags";
import { fetchAdminFeaturesServer } from "@/lib/feature-flags/server-fetch";
import { fetchCurrentUser } from "@/lib/auth/server-session";

export const metadata: Metadata = {
  title: "Features · Admin",
};

export default async function AdminFeaturesPage() {
  const user = await fetchCurrentUser();
  if (!user) redirect("/login?next=/admin/features");
  if (user.role !== "admin") redirect("/dashboard");

  const data = await fetchAdminFeaturesServer();
  if (!data) redirect("/dashboard");

  return <AdminFeaturesShell userEmail={user.email} initial={data} />;
}
