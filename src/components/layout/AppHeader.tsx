"use client";

import { Gem, LogOut, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FeatureGate } from "@/features/feature-flags";
import { logOut } from "@/lib/auth/client";
import { cn } from "@/lib/utils";

type AppHeaderProps = {
  userEmail?: string | null;
  showAdminLink?: boolean;
};

export function AppHeader({ userEmail, showAdminLink }: AppHeaderProps) {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-40 border-b border-foreground/[0.08] bg-background/78 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-foreground"
        >
          <span className="grid size-8 place-items-center rounded-full border border-[#9a7d4d]/30 bg-[#9a7d4d]/10">
            <Gem className="size-3.5 text-[#9a7d4d]" aria-hidden />
          </span>
          <span className="text-sm font-semibold tracking-[-0.01em]">
            DEVJEWELS
          </span>
          <span className="hidden border-l border-foreground/10 pl-2.5 text-[9px] uppercase tracking-[0.18em] text-muted-foreground sm:inline">
            Studio
          </span>
        </Link>

        <nav className="flex items-center gap-2">
          <Link
            href="/dashboard"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "text-muted-foreground hover:text-foreground",
            )}
          >
            Workshop
          </Link>
          <FeatureGate feature="pricing_page">
            <Link
              href="/pricing"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "text-muted-foreground hover:text-foreground",
              )}
            >
              Pricing
            </Link>
          </FeatureGate>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 rounded-full bg-card/70"
              >
                <User className="size-4" />
                <span className="hidden max-w-[140px] truncate sm:inline">
                  {userEmail ?? "Account"}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem asChild>
                <Link href="/profile">Profile</Link>
              </DropdownMenuItem>
              {showAdminLink ? (
                <DropdownMenuItem asChild>
                  <Link href="/admin">Admin console</Link>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem asChild>
                <Link href="/contact">Contact us</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => {
                  await logOut();
                  router.push("/login");
                }}
              >
                <LogOut className="size-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      </div>
    </header>
  );
}
