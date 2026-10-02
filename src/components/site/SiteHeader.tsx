"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";
import { isActiveNavLink, SIGN_IN_HREF, SITE_NAV, START_FREE_HREF } from "./site-nav";
import { ctaCompact, sectionFrame } from "./site-styles";
import { ThemeToggle } from "./ThemeToggle";

/** The MIST STUDIO wordmark, as the home film sets it. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <Link href="/" className={`text-[13px] font-medium uppercase tracking-[0.24em] text-foreground ${className ?? ""}`}>
      Mist Studio
    </Link>
  );
}

function useMenuLock(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [open, close]);
}

const navLink =
  "text-[13px] tracking-[-0.005em] underline-offset-[10px] transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-holo";

/**
 * The site header in the home film's style: wordmark left; navigation, theme toggle and
 * the sign-up pill right. Transparent at the top of a page, frosted once it scrolls.
 */
export function SiteHeader({ isAuthenticated = false }: { isAuthenticated?: boolean }) {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const close = useCallback(() => setOpen(false), []);
  useMenuLock(open, close);

  return (
    <header className="site-header sticky top-0 z-40 backdrop-blur-xl">
      <div className={`${sectionFrame} flex h-16 items-center justify-between gap-6 lg:h-[72px]`}>
        <Wordmark />
        <nav aria-label="Main" className="hidden items-center gap-7 md:flex">
          {SITE_NAV.map((link) => {
            const active = isActiveNavLink(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`${navLink} ${active ? "text-foreground underline decoration-holo" : "text-dim hover:text-foreground"}`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          {isAuthenticated ? (
            <Link href="/dashboard" className={ctaCompact}>
              Dashboard
            </Link>
          ) : (
            <>
              <Link href={SIGN_IN_HREF} className={`${navLink} hidden text-dim hover:text-foreground sm:inline-flex`}>
                Sign in
              </Link>
              <Link href={START_FREE_HREF} className={ctaCompact}>
                Start free
              </Link>
            </>
          )}
          <button
            type="button"
            className="grid size-9 place-items-center rounded-full border border-hairline-strong text-foreground md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X className="size-4" aria-hidden /> : <Menu className="size-4" aria-hidden />}
          </button>
        </div>
      </div>
      {open ? (
        <div id={panelId} className="absolute inset-x-0 top-full z-50 h-[calc(100dvh_-_4rem)] overflow-y-auto border-t border-hairline bg-background px-5 pb-10 pt-4 md:hidden">
          <nav aria-label="Main" className="flex flex-col">
            {SITE_NAV.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={close}
                aria-current={isActiveNavLink(pathname, link.href) ? "page" : undefined}
                className="border-b border-hairline py-4 font-display text-[30px] font-light tracking-[-0.03em] text-foreground"
              >
                {link.label}
              </Link>
            ))}
            {isAuthenticated ? null : (
              <Link href={SIGN_IN_HREF} onClick={close} className="py-4 font-display text-[30px] font-light tracking-[-0.03em] text-dim">
                Sign in
              </Link>
            )}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
