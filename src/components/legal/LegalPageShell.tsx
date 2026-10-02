import Link from "next/link";
import type { ReactNode } from "react";
import { PageIntro } from "@/components/site/PageIntro";
import { SiteShell } from "@/components/site/SiteShell";
import { sectionFrame } from "@/components/site/site-styles";

type LegalPageShellProps = {
  title: string;
  updated: string;
  children: ReactNode;
};

const LEGAL_PAGES = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/refund", label: "Refunds" },
];

/** Terms, privacy and refunds: the site shell with a quiet reading column. */
export function LegalPageShell({ title, updated, children }: LegalPageShellProps) {
  return (
    <SiteShell>
      <section className={`${sectionFrame} pb-24 pt-20 sm:pt-28`}>
        <PageIntro kicker="Legal" title={title} lead={`Last updated ${updated}`}>
          <nav aria-label="Legal" className="flex gap-6 font-mono text-[11px] uppercase tracking-[0.25em] text-dim">
            {LEGAL_PAGES.map((page) => (
              <Link key={page.href} href={page.href} className="hover:text-foreground">
                {page.label}
              </Link>
            ))}
          </nav>
        </PageIntro>
        <article className="prose prose-neutral mt-14 max-w-3xl dark:prose-invert prose-headings:font-display prose-headings:font-light prose-headings:tracking-[-0.03em] prose-p:text-dim prose-li:text-dim prose-a:text-holo">
          {children}
        </article>
      </section>
    </SiteShell>
  );
}
