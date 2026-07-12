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
    <header className="sticky top-0 z-40 border-b border-black/10 bg-white/75 backdrop-blur-2xl">
      <div className="grid h-[76px] grid-cols-[1fr_auto] md:grid-cols-[260px_1fr_auto]">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 border-r border-black/10 text-foreground"
        >
          <span className="ml-6 grid size-8 place-items-center rounded-full border border-black/15">
            <span className="size-2.5 rotate-45 border border-black" />
          </span>
          <span className="text-[11px] font-semibold uppercase leading-[0.9] tracking-[-0.025em]">
            DevJewels
            <span className="block font-light text-black/45">Studio</span>
          </span>
        </Link>
        <div className="hidden items-center border-r border-black/10 px-6 text-[9px] uppercase tracking-[0.16em] text-black/45 md:flex">
          Private production environment
        </div>

        <nav className="flex items-center gap-1 px-3 sm:px-5">
          <Link
            href="/dashboard"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "rounded-full px-4 text-[9px] uppercase tracking-[0.1em] text-black/55 hover:bg-[#eaeff5] hover:text-black",
            )}
          >
            Workshop
          </Link>
          <FeatureGate feature="pricing_page">
            <Link
              href="/pricing"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "rounded-full px-4 text-[9px] uppercase tracking-[0.1em] text-black/55 hover:bg-[#eaeff5] hover:text-black",
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
                className="gap-2 rounded-full border-black/10 bg-[#eaeff5]/70 px-4 shadow-none"
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
