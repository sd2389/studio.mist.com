import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminShell } from "@/features/admin/ui/AdminShell";
import { fetchCurrentUser } from "@/lib/auth/server-session";
import { fetchBillingEventsServer } from "@/lib/admin/server-fetch";

export const metadata: Metadata = {
  title: "Webhooks · Admin",
};

export default async function AdminEventsPage() {
  const user = await fetchCurrentUser();
  if (!user) redirect("/login?next=/admin/events");
  if (user.role !== "admin") redirect("/dashboard");

  const data = await fetchBillingEventsServer();
  if (!data) redirect("/dashboard");

  return (
    <AdminShell userEmail={user.email} title="Stripe webhook log">
      <p className="mb-4 text-sm text-muted-foreground">{data.total} events recorded</p>
      <div className="overflow-x-auto rounded-lg border border-border/60">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-muted-foreground">
              <th className="px-4 py-3 font-medium">Event ID</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Processed</th>
            </tr>
          </thead>
          <tbody>
            {data.events.map((row) => (
              <tr key={row.id} className="border-b border-border/40 last:border-0">
                <td className="px-4 py-3 font-mono text-xs">{row.stripe_event_id}</td>
                <td className="px-4 py-3">{row.event_type}</td>
                <td className="px-4 py-3">{new Date(row.processed_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
