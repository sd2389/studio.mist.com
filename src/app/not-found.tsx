import Link from "next/link";
import { FilmFrame } from "@/components/site/FilmFrame";
import { ctaPrimary, ctaSecondary, kicker } from "@/components/site/site-styles";

/** Any unknown address, in the house look. */
export default function NotFound() {
  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center bg-background px-5 text-center text-foreground">
      <FilmFrame />
      <p className={`${kicker} mx-auto`}>404</p>
      <h1 className="mt-6 font-display text-[clamp(3rem,1.6rem+4vw,6rem)] font-light leading-[0.92] tracking-[-0.045em]">
        Nothing here
        <br />
        <span className="italic">to render.</span>
      </h1>
      <p className="mt-5 max-w-md text-[15px] leading-relaxed text-dim">The page moved or never existed.</p>
      <div className="mt-9 flex flex-wrap justify-center gap-3">
        <Link href="/" className={ctaPrimary}>
          Home
        </Link>
        <Link href="/features" className={ctaSecondary}>
          Features
        </Link>
      </div>
    </div>
  );
}
