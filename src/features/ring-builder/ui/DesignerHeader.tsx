"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/site/ThemeToggle";

const LINKS = [
  { href: "/gallery", label: "Gallery" },
  { href: "/stones", label: "Materials" },
  { href: "/upload-model", label: "Upload" },
];

/** The designer's header in the home film's style: wordmark, section label, links, theme, studio. */
export function DesignerHeader({ onOpenInStudio, disabled }: { onOpenInStudio: () => void; disabled: boolean }) {
  return (
    <header className="flex h-[64px] items-center justify-between gap-3 px-4 sm:h-[72px] sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-4">
        <Link href="/" className="text-[13px] font-medium uppercase tracking-[0.24em] text-foreground" aria-label="MIST Studio home">
          Mist Studio
        </Link>
        <span className="hidden h-6 w-px bg-foreground/10 sm:block" aria-hidden />
        <span className="hidden font-mono text-[10px] uppercase tracking-[0.24em] text-foreground/50 sm:block">Designer</span>
      </div>
      <nav className="flex items-center gap-1 sm:gap-2" aria-label="Designer">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="hidden rounded-full px-3 py-2 text-[13px] text-dim transition-colors hover:text-foreground md:inline">
            {l.label}
          </Link>
        ))}
        <ThemeToggle />
        <button
          type="button"
          onClick={onOpenInStudio}
          disabled={disabled}
          className="rounded-full bg-foreground px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.24em] text-background transition hover:bg-holo disabled:opacity-50 sm:px-5 sm:py-3"
        >
          Open in Studio
        </button>
      </nav>
    </header>
  );
}
