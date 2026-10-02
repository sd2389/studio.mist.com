/**
 * Class recipes for the site in the home film's language: pill buttons that invert on
 * hover, mono kickers led by a hairline, display-serif titles, hairline panels. Colours are
 * theme tokens (globals.css), so every recipe reads right on paper and on the dark stage.
 */

const pill =
  "inline-flex h-11 shrink-0 items-center justify-center gap-2.5 whitespace-nowrap rounded-full px-6 text-[14px] font-medium tracking-[-0.01em] transition-[background-color,border-color,color,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-holo motion-reduce:transition-none";

/** The main action: a solid pill in the text colour. */
export const ctaPrimary = `${pill} bg-foreground text-background hover:bg-holo`;

/** A secondary action: an outlined pill that fills on hover, like the film's "Start free". */
export const ctaSecondary = `${pill} border border-hairline-strong text-foreground hover:border-foreground hover:bg-foreground hover:text-background`;

/** The main action on an inverted (foreground-coloured) panel. */
export const ctaOnInk = `${pill} bg-background text-foreground hover:bg-holo hover:text-background`;

/** Compact header pill ("Start free", "Dashboard"). */
export const ctaCompact =
  "inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-foreground px-4 text-[13px] text-foreground transition-colors duration-300 hover:bg-foreground hover:text-background focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-holo";

/** Inline text link with an underline that firms up on hover. */
export const textLink =
  "inline-flex items-center gap-2 text-[15px] text-foreground underline decoration-faint decoration-1 underline-offset-[6px] transition-[text-decoration-color] duration-300 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-holo";

/** Section wrapper: the film's page gutter and max width. */
export const sectionFrame = "mx-auto w-full max-w-[1480px] px-5 sm:px-10";

/** A mono label led by a short hairline, in the hologram colour. */
export const kicker =
  "flex w-fit items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.3em] text-holo before:h-px before:w-7 before:bg-current before:content-['']";

/** Page-level display title (one per page). */
export const headingDisplay = "font-display text-[clamp(2.6rem,1.1rem+4.4vw,6rem)] font-light leading-[0.94] tracking-[-0.045em] text-foreground";

/** Section title. */
export const headingSection = "font-display text-[clamp(2rem,1rem+2.6vw,3.6rem)] font-light leading-[1] tracking-[-0.04em] text-foreground";

/** A hairline panel on the page surface. */
export const panel = "rounded-[24px] border border-hairline bg-surface";

/** Mono stat label and value (the film's HUD readouts). */
export const statLabel = "block font-mono text-[10px] uppercase tracking-[0.3em] text-faint";
export const statValue = "mt-1 block font-mono text-[13px] tracking-[0.12em] text-holo";
