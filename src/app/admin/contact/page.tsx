import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminShell } from "@/features/admin/ui/AdminShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchCurrentUser } from "@/lib/auth/server-session";
import { fetchContactMessagesServer } from "@/lib/admin/server-fetch";

export const metadata: Metadata = {
  title: "Contact · Admin",
};

export default async function AdminContactPage() {
  const user = await fetchCurrentUser();
  if (!user) redirect("/login?next=/admin/contact");
  if (user.role !== "admin") redirect("/dashboard");

  const data = await fetchContactMessagesServer();
  if (!data) redirect("/dashboard");

  return (
    <AdminShell userEmail={user.email} title="Contact inbox">
      <p className="mb-4 text-sm text-muted-foreground">{data.total} messages</p>
      <div className="space-y-4">
        {data.messages.map((msg) => (
          <Card key={msg.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{msg.name}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {msg.email} · {new Date(msg.created_at).toLocaleString()}
              </p>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm">{msg.message}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </AdminShell>
  );
}
