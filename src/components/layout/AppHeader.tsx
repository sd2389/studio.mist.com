"use client";

import { LogOut, User } from "lucide-react";
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
    <header className="sticky top-0 z-40 border-b border-black bg-[#d8d5cd]">
      <div className="grid h-[70px] grid-cols-[1fr_auto] md:grid-cols-[260px_1fr_auto]">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 border-r border-black text-foreground"
        >
          <span className="ml-6 size-2.5 bg-[#ef5b2a]" />
          <span className="text-[15px] font-black tracking-[-0.04em]">
            DEVJEWELS
          </span>
        </Link>
        <div className="hidden items-center border-r border-black px-6 text-[9px] font-bold uppercase tracking-[0.2em] md:flex">
          Private production archive
        </div>

        <nav className="flex items-center gap-1 px-3 sm:px-5">
          <Link
            href="/dashboard"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "rounded-none text-[9px] font-bold uppercase tracking-[0.14em] text-black/60 hover:bg-transparent hover:text-black",
            )}
          >
            Workshop
          </Link>
          <FeatureGate feature="pricing_page">
            <Link
              href="/pricing"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "rounded-none text-[9px] font-bold uppercase tracking-[0.14em] text-black/60 hover:bg-transparent hover:text-black",
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
                className="gap-2 rounded-none border-black bg-transparent"
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
