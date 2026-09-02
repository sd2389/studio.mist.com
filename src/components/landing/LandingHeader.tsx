"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState } from "react";

const NAV_LINKS: ReadonlyArray<{
  href: string;
  label: string;
  active?: boolean;
}> = [
  { href: "/", label: "Home", active: true },
  { href: "/gallery", label: "Gallery" },
  { href: "/stones", label: "Materials" },
  { href: "/pricing", label: "Pricing" },
];

export function LandingHeader() {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <header className="relative z-30 flex h-[72px] shrink-0 items-center justify-between px-5 sm:h-[78px] sm:px-8 lg:px-12">
      <Link href="/" className="flex items-center gap-3">
        <span className="grid size-8 place-items-center rounded-full border border-black/15">
          <span className="size-2.5 rotate-45 border border-black" />
        </span>
        <span className="text-[11px] font-semibold uppercase leading-[0.9] tracking-[-0.025em]">
          MIST
          <span className="block font-light text-black/45">Studio</span>
        </span>
      </Link>

      <nav className="hidden items-center gap-8 text-[10px] md:flex">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={
              link.active
                ? "border-b border-black pb-1"
                : "text-black/55 hover:text-black"
            }
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="flex items-center gap-2 sm:gap-3">
        <Link
          href="/login"
          className="hidden text-[10px] text-black/65 sm:inline"
        >
          Sign in
        </Link>
        <Link
          href="/login?mode=signup"
          className="rounded-full bg-[#212121] px-4 py-2.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-white sm:px-5 sm:py-3"
        >
          Start creating
        </Link>
        <button
          type="button"
          className="grid size-10 place-items-center rounded-full bg-white/45 md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? (
            <X className="size-4" aria-hidden />
          ) : (
            <Menu className="size-4" aria-hidden />
          )}
        </button>
      </div>

      {open ? (
        <div
          id={panelId}
          className="absolute inset-x-3 top-[72px] z-40 rounded-[1.5rem] border border-black/8 bg-white/95 p-5 shadow-[0_24px_60px_rgba(61,82,105,0.18)] backdrop-blur-xl sm:inset-x-4 md:hidden"
        >
          <nav className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`rounded-xl px-4 py-3 text-sm tracking-[-0.02em] ${
                  link.active
                    ? "bg-[#212121] text-white"
                    : "text-black/70 hover:bg-black/[0.04]"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="rounded-xl px-4 py-3 text-sm text-black/70 hover:bg-black/[0.04] sm:hidden"
            >
              Sign in
            </Link>
            <Link
              href="/viewer/clearcoat"
              onClick={() => setOpen(false)}
              className="mt-2 rounded-full bg-[#212121] px-4 py-3 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-white"
            >
              Enter the studio
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
