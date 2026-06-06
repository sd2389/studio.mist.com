"use client";

import { ArrowLeft, Loader2, Shield } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AdminShellProps = {
  userEmail: string;
  title: string;
  children: ReactNode;
  backHref?: string;
};

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/features", label: "Features" },
  { href: "/admin/events", label: "Webhooks" },
  { href: "/admin/contact", label: "Contact" },
] as const;

export function AdminShell({ userEmail, title, children, backHref }: AdminShellProps) {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background">
      <AppHeader userEmail={userEmail} showAdminLink />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          {backHref ? (
            <Button variant="ghost" size="sm" onClick={() => router.push(backHref)} className="gap-2">
              <ArrowLeft className="size-4" />
              Back
            </Button>
          ) : null}
          <div className="flex items-center gap-2">
            <Shield className="size-5 text-primary" />
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          </div>
        </div>

        <nav className="mb-8 flex flex-wrap gap-2 border-b border-border/60 pb-4">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {children}
      </div>
    </div>
  );
}

export function AdminBusy({ label = "Saving…" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      {label}
    </span>
  );
}
