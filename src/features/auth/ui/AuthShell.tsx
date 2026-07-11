import { Gem, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

type AuthShellProps = {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function AuthShell({
  title,
  description,
  children,
  footer,
}: AuthShellProps) {
  return (
    <div className="grid min-h-[100dvh] bg-[#171614] text-white lg:grid-cols-[0.92fr_1.08fr]">
      <aside className="relative hidden overflow-hidden border-r border-white/[0.08] p-12 lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="absolute -left-40 top-1/4 size-[620px] rounded-full bg-[#b99b66]/10 blur-[120px]"
        />
        <Link href="/" className="relative z-10 flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-full border border-[#d7c195]/30 bg-[#d7c195]/10">
            <Gem className="size-4 text-[#d7c195]" aria-hidden />
          </span>
          <span className="text-sm font-semibold tracking-[0.03em]">
            DEVJEWELS
          </span>
          <span className="border-l border-white/15 pl-3 text-[9px] uppercase tracking-[0.2em] text-white/40">
            Studio
          </span>
        </Link>
        <div className="relative z-10 max-w-lg">
          <Sparkles
            className="mb-7 size-5 text-[#d7c195]"
            strokeWidth={1.4}
            aria-hidden
          />
          <p className="font-display text-5xl font-normal italic leading-[0.94] tracking-[-0.04em]">
            Your digital atelier,
            <span className="block text-[#d7c195]">always in session.</span>
          </p>
          <p className="mt-6 max-w-sm text-sm leading-6 text-white/42">
            Configure materials, art direct every angle, and publish
            campaign-ready jewelry assets.
          </p>
        </div>
        <p className="relative z-10 text-[9px] uppercase tracking-[0.18em] text-white/25">
          CAD · Render · Publish
        </p>
      </aside>

      <div className="relative flex min-h-[100dvh] flex-col bg-[#f3eee5] text-[#211f1b]">
        <header className="flex items-center justify-center px-5 pt-8 lg:hidden">
          <Link href="/" className="flex items-center gap-2">
            <Gem className="size-5 text-[#92784e]" aria-hidden />
            <span className="text-sm font-semibold">DEVJEWELS STUDIO</span>
          </Link>
        </header>
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-12 sm:px-8">
          <p className="text-kicker text-[#92784e]">Private workspace</p>
          <h1 className="mt-5 font-display text-5xl font-normal italic tracking-[-0.04em]">
            {title}
          </h1>
          <p className="mt-3 text-sm leading-6 text-black/48">{description}</p>
          <div className="mt-9 rounded-3xl border border-black/[0.08] bg-white/75 p-6 shadow-[0_30px_80px_-50px_rgba(30,22,12,0.5)] backdrop-blur sm:p-8">
            {children}
          </div>
          {footer ? (
            <div className="mt-6 text-center text-sm text-black/45">
              {footer}
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
