import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { FilmFrame } from "./FilmFrame";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

/**
 * A marketing page in the home film's look: grain and viewfinder corners, the site header
 * (Dashboard for signed-in visitors, Start free otherwise), the page, and the footer.
 */
export async function SiteShell({ children }: { children: ReactNode }) {
  const signedIn = Boolean((await cookies()).get(SESSION_COOKIE)?.value);
  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-background text-foreground">
      <FilmFrame />
      <SiteHeader isAuthenticated={signedIn} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
