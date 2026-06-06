import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminUserDetailShell } from "@/features/admin/ui/AdminUserDetailShell";
import { fetchCurrentUser } from "@/lib/auth/server-session";
import { fetchAdminUserDetailServer } from "@/lib/admin/server-fetch";

export const metadata: Metadata = {
  title: "User detail · Admin",
};

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminUserDetailPage({ params }: PageProps) {
  const user = await fetchCurrentUser();
  if (!user) redirect("/login?next=/admin/users");
  if (user.role !== "admin") redirect("/dashboard");

  const { id } = await params;
  const userId = Number(id);
  if (!Number.isFinite(userId)) redirect("/admin/users");

  const detail = await fetchAdminUserDetailServer(userId);
  if (!detail) redirect("/dashboard");

  return <AdminUserDetailShell userEmail={user.email} initial={detail} />;
}
