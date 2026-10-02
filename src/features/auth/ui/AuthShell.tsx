import Link from "next/link";
import type { ReactNode } from "react";
import { FilmFrame } from "@/components/site/FilmFrame";
import { kicker } from "@/components/site/site-styles";
import { ThemeToggle } from "@/components/site/ThemeToggle";

type AuthShellProps = {
  /** The mono label over the title. */
  kicker?: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
};

/**
 * Sign-in, sign-up, password and contact pages in the home film's look: the film's
 * closing line on a dark-stage panel beside a hairline form.
 */
export function AuthShell({ kicker: label = "Private workspace", title, description, children, footer }: AuthShellProps) {
  return (
    <div className="relative grid min-h-[100dvh] bg-background p-2.5 text-foreground lg:grid-cols-2 lg:p-4">
      <FilmFrame corners={false} />
      <aside className="relative hidden overflow-hidden rounded-[28px] border border-hairline bg-[radial-gradient(circle_at_30%_25%,color-mix(in_srgb,var(--mist-holo)_16%,transparent),transparent_55%)] bg-surface p-10 lg:flex lg:flex-col lg:justify-between">
        <Link href="/" className="relative z-10 text-[13px] font-medium uppercase tracking-[0.24em]">
          Mist Studio
        </Link>
        <div className="relative z-10 max-w-lg">
          <p className="font-display text-[clamp(3.5rem,6vw,6.5rem)] font-light leading-[0.88] tracking-[-0.05em]">
            Assembled
            <span className="block italic">in light.</span>
          </p>
          <p className="mt-7 max-w-sm text-[15px] leading-relaxed text-dim">
            Configure materials, art-direct every angle and publish campaign-ready jewelry — rendered true, in your browser.
          </p>
        </div>
        <p className="relative z-10 font-mono text-[11px] uppercase tracking-[0.3em] text-faint">CAD · Render · Publish</p>
      </aside>
      <div className="relative flex min-h-[100dvh] flex-col lg:min-h-0">
        <header className="flex items-center justify-between px-5 pt-6 lg:justify-end lg:px-10">
          <Link href="/" className="text-[13px] font-medium uppercase tracking-[0.24em] lg:hidden">
            Mist Studio
          </Link>
          <ThemeToggle />
        </header>
        <main className="site-rise mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-12 sm:px-8">
          <p className={kicker}>{label}</p>
          <h1 className="mt-6 font-display text-[clamp(3rem,1.6rem+3vw,4.5rem)] font-light leading-[0.94] tracking-[-0.045em]">{title}</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-dim">{description}</p>
          <div className="mt-9 rounded-[24px] border border-hairline bg-surface p-6 sm:p-8">{children}</div>
          {footer ? <div className="mt-6 text-center text-[14px] text-dim">{footer}</div> : null}
        </main>
      </div>
    </div>
  );
}
