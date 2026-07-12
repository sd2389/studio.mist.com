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
    <div className="grid min-h-[100dvh] bg-white p-2.5 text-[#212121] lg:grid-cols-2 lg:p-4">
      <aside className="ice-panel relative hidden overflow-hidden p-8 lg:flex lg:flex-col lg:justify-between">
        <Link href="/" className="relative z-10 flex items-center gap-3">
          <span className="grid size-8 place-items-center rounded-full border border-black/15">
            <span className="size-2.5 rotate-45 border border-black" />
          </span>
          <span className="text-[11px] font-semibold uppercase leading-[0.9]">
            DevJewels
            <span className="block font-light text-black/45">Studio</span>
          </span>
        </Link>
        <div className="relative z-10 max-w-lg">
          <p className="text-[clamp(4rem,7vw,7rem)] font-light leading-[0.78] tracking-[-0.085em]">
            One object.
            <span className="block font-semibold">Every output.</span>
          </p>
          <p className="mt-6 max-w-sm text-sm leading-6 text-black/45">
            Configure materials, art direct every angle, and publish
            campaign-ready jewelry assets.
          </p>
        </div>
        <p className="relative z-10 text-[9px] uppercase tracking-[0.16em] text-black/45">
          CAD · Render · Publish
        </p>
      </aside>

      <div className="relative flex min-h-[100dvh] flex-col bg-white text-[#212121]">
        <header className="flex items-center justify-center px-5 pt-8 lg:hidden">
          <Link href="/" className="flex items-center gap-2">
            <span className="size-2 rotate-45 border border-black" />
            <span className="text-sm font-semibold">DEVJEWELS STUDIO</span>
          </Link>
        </header>
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-12 sm:px-8">
          <p className="text-kicker text-black/45">Private workspace</p>
          <h1 className="mt-5 text-6xl font-light leading-none tracking-[-0.07em]">
            {title}
          </h1>
          <p className="mt-3 text-sm leading-6 text-black/48">{description}</p>
          <div className="mt-9 rounded-[1.75rem] border border-black/[0.06] bg-[#eaeff5]/65 p-6 sm:p-8">
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
