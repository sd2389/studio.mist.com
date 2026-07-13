import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminFeaturesShell } from "@/features/feature-flags";
import { fetchAdminFeaturesServer } from "@/lib/feature-flags/server-fetch";
import { requirePageUser } from "@/lib/auth/require-page-user";

export const metadata: Metadata = {
  title: "Features · Admin",
};

export default async function AdminFeaturesPage() {
  const user = await requirePageUser("/admin/features");
  if (user.role !== "admin") redirect("/dashboard");

  const data = await fetchAdminFeaturesServer();
  if (!data) redirect("/dashboard");

  return <AdminFeaturesShell userEmail={user.email} initial={data} />;
}
