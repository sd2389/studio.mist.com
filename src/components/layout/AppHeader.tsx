"use client";

import { LogOut, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/site/ThemeToggle";
import { FeatureGate } from "@/features/feature-flags";
import { logOut } from "@/lib/auth/client";
import { cn } from "@/lib/utils";

type AppHeaderProps = {
  userEmail?: string | null;
  showAdminLink?: boolean;
};

const appNavLink =
  "hidden rounded-full px-3 py-2 text-[13px] text-dim transition-colors hover:text-foreground sm:inline-flex";

/** The workspace header in the home film's style: wordmark, workshop links, theme toggle, account. */
export function AppHeader({ userEmail, showAdminLink }: AppHeaderProps) {
  const router = useRouter();

  return (
    <header className="site-header sticky top-0 z-40 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between gap-4 px-5 sm:px-10 lg:h-[72px]">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="text-[13px] font-medium uppercase tracking-[0.24em] text-foreground">
            Mist Studio
          </Link>
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.24em] text-faint lg:inline">Workshop</span>
        </div>

        <nav className="flex items-center gap-1 sm:gap-2">
          <Link href="/dashboard" className={appNavLink}>
            Workshop
          </Link>
          <FeatureGate feature="pricing_page">
            <Link href="/pricing" className={appNavLink}>
              Pricing
            </Link>
          </FeatureGate>
          <Link href="/profile#credits" className={appNavLink}>
            Buy credits
          </Link>
          <ThemeToggle className="ml-1" />

          <DropdownMenu>
            {/* base-ui Trigger renders a <button>; asChild is not supported */}
            <DropdownMenuTrigger
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "h-9 gap-2 rounded-full border-hairline-strong bg-transparent px-4 text-[13px] shadow-none hover:bg-foreground hover:text-background",
              )}
            >
              <User className="size-4" />
              <span className="hidden max-w-[140px] truncate sm:inline">
                {userEmail ?? "Account"}
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => router.push("/profile")}>
                Profile
              </DropdownMenuItem>
              {showAdminLink ? (
                <DropdownMenuItem onClick={() => router.push("/admin")}>
                  Admin console
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={() => router.push("/contact")}>
                Contact us
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
