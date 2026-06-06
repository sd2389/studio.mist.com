import { Gem } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

type LegalPageShellProps = {
  title: string;
  updated: string;
  children: ReactNode;
};

export function LegalPageShell({ title, updated, children }: LegalPageShellProps) {
  return (
    <div className="min-h-[100dvh] bg-app-canvas">
      <header className="border-b border-border/60 bg-background/80">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 text-foreground">
            <Gem className="size-6 text-primary" aria-hidden />
            <span className="text-sm font-semibold">DevJewels Studio</span>
          </Link>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            <Link href="/terms" className="hover:text-foreground hover:underline">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-foreground hover:underline">
              Privacy
            </Link>
            <Link href="/refund" className="hover:text-foreground hover:underline">
              Refunds
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="font-display text-4xl font-normal italic tracking-tight text-foreground">
          {title}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated {updated}</p>
        <article className="prose prose-neutral mt-10 max-w-none dark:prose-invert prose-headings:font-semibold prose-p:text-muted-foreground prose-li:text-muted-foreground">
          {children}
        </article>
      </main>
    </div>
  );
}
