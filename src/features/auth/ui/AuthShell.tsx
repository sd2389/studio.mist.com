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
    <div className="grid min-h-[100dvh] bg-[#0b0b0a] text-white lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden border-r border-white/20 p-8 lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="cinematic-grain absolute inset-0 opacity-20"
        />
        <Link href="/" className="relative z-10 flex items-center gap-2">
          <span className="size-2.5 bg-[#ef5b2a]" />
          <span className="text-[15px] font-black tracking-[-0.04em]">
            DEVJEWELS
          </span>
        </Link>
        <div className="relative z-10 max-w-lg">
          <p className="text-[clamp(4rem,7vw,7rem)] font-black uppercase leading-[0.78] tracking-[-0.085em]">
            One object.
            <span className="block text-[#ef5b2a]">Every output.</span>
          </p>
          <p className="mt-6 max-w-sm text-sm leading-6 text-white/42">
            Configure materials, art direct every angle, and publish
            campaign-ready jewelry assets.
          </p>
        </div>
        <p className="relative z-10 text-[9px] uppercase tracking-[0.18em] text-white/45">
          CAD · Render · Publish
        </p>
      </aside>

      <div className="relative flex min-h-[100dvh] flex-col bg-[#d8d5cd] text-[#10100f]">
        <header className="flex items-center justify-center px-5 pt-8 lg:hidden">
          <Link href="/" className="flex items-center gap-2">
            <span className="size-2 bg-[#ef5b2a]" />
            <span className="text-sm font-black">DEVJEWELS STUDIO</span>
          </Link>
        </header>
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-12 sm:px-8">
          <p className="text-kicker text-[#ef5b2a]">Private workspace</p>
          <h1 className="mt-5 text-6xl font-black uppercase leading-none tracking-[-0.07em]">
            {title}
          </h1>
          <p className="mt-3 text-sm leading-6 text-black/48">{description}</p>
          <div className="mt-9 border border-black bg-transparent p-6 sm:p-8">
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
