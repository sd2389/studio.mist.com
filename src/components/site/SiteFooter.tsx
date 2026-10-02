import Link from "next/link";
import { SIGN_IN_HREF, SITE_NAV, START_FREE_HREF, STUDIO_HREF, UPLOAD_HREF, type SiteNavLink } from "./site-nav";
import { kicker, sectionFrame } from "./site-styles";
import { Wordmark } from "./SiteHeader";

const FOOTER_COLUMNS: ReadonlyArray<{ title: string; links: readonly SiteNavLink[] }> = [
  { title: "Product", links: [{ href: STUDIO_HREF, label: "Studio" }, ...SITE_NAV] },
  {
    title: "Get started",
    links: [
      { href: UPLOAD_HREF, label: "Upload your CAD" },
      { href: START_FREE_HREF, label: "Start free" },
      { href: SIGN_IN_HREF, label: "Sign in" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/contact", label: "Contact" },
      { href: "/terms", label: "Terms" },
      { href: "/privacy", label: "Privacy" },
      { href: "/refund", label: "Refund policy" },
    ],
  },
];

/** The site footer: the film's closing line, then the link columns under mono kickers. */
export function SiteFooter() {
  return (
    <footer className="border-t border-hairline">
      <div className={`${sectionFrame} grid gap-14 py-16 md:grid-cols-[1.2fr_2fr] md:gap-8 lg:py-24`}>
        <div className="flex flex-col gap-6">
          <Wordmark className="self-start" />
          <p className="max-w-[16ch] font-display text-[clamp(2rem,1rem+2vw,3rem)] font-light leading-[1] tracking-[-0.04em] text-foreground">
            Assembled <span className="italic">in light.</span>
          </p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3">
          {FOOTER_COLUMNS.map((column) => (
            <div key={column.title}>
              <p className={kicker}>{column.title}</p>
              <ul className="mt-5 flex flex-col gap-1">
                {column.links.map((link) => (
                  <li key={`${column.title}-${link.href}`}>
                    <Link href={link.href} className="inline-flex min-h-9 items-center text-[14px] text-dim transition-colors hover:text-foreground">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <div className={`${sectionFrame} flex items-center justify-between border-t border-hairline py-6 font-mono text-[11px] uppercase tracking-[0.25em] text-faint`}>
        <span>© {new Date().getFullYear()} MIST Studio</span>
        <span>Rendered in the browser</span>
      </div>
    </footer>
  );
}
