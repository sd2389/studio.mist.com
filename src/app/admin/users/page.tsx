import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminShell } from "@/features/admin/ui/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { fetchCurrentUser } from "@/lib/auth/server-session";
import { fetchAdminUsersServer } from "@/lib/admin/server-fetch";
import { formatStorageGb } from "@/lib/billing/format";

export const metadata: Metadata = {
  title: "Users · Admin",
};

type PageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const user = await fetchCurrentUser();
  if (!user) redirect("/login?next=/admin/users");
  if (user.role !== "admin") redirect("/dashboard");

  const { q } = await searchParams;
  const data = await fetchAdminUsersServer(q);
  if (!data) redirect("/dashboard");

  return (
    <AdminShell userEmail={user.email} title="Users">
      <form className="mb-6 max-w-md" action="/admin/users" method="get">
        <Input name="q" defaultValue={q ?? ""} placeholder="Search email or name…" />
      </form>

      <p className="mb-4 text-sm text-muted-foreground">{data.total} users</p>

      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-muted-foreground">
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Model</th>
              <th className="px-4 py-3 font-medium">AI</th>
              <th className="px-4 py-3 font-medium">Storage</th>
              <th className="px-4 py-3 font-medium">Models</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.users.map((row) => (
              <tr key={row.id} className="border-b border-border/40 last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/admin/users/${row.id}`} className="font-medium hover:underline">
                    {row.email}
                  </Link>
                  {row.name ? (
                    <p className="text-xs text-muted-foreground">{row.name}</p>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline">{row.plan_tier}</Badge>
                </td>
                <td className="px-4 py-3">{row.model_credits}</td>
                <td className="px-4 py-3">{row.ai_image_credits}</td>
                <td className="px-4 py-3">{formatStorageGb(row.storage_bytes_used)}</td>
                <td className="px-4 py-3">{row.scene_count}</td>
                <td className="px-4 py-3">
                  <Badge variant={row.is_active ? "default" : "destructive"}>
                    {row.is_active ? "Active" : "Off"}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
