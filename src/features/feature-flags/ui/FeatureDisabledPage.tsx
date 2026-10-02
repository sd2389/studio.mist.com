import Link from "next/link";
import { FilmFrame } from "@/components/site/FilmFrame";
import { ctaSecondary, kicker } from "@/components/site/site-styles";

type FeatureDisabledPageProps = {
  title?: string;
  message?: string;
};

/** A switched-off part of the studio, in the house look. */
export function FeatureDisabledPage({
  title = "Temporarily unavailable",
  message = "This part of the studio is turned off right now. Check back soon.",
}: FeatureDisabledPageProps) {
  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center bg-background px-5 text-center text-foreground">
      <FilmFrame />
      <p className={`${kicker} mx-auto`}>Paused</p>
      <h1 className="mt-6 font-display text-[clamp(2.6rem,1.4rem+3vw,4.5rem)] font-light leading-[0.95] tracking-[-0.045em]">{title}</h1>
      <p className="mt-5 max-w-md text-[15px] leading-relaxed text-dim">{message}</p>
      <Link href="/dashboard" className={`${ctaSecondary} mt-9`}>
        Back to workshop
      </Link>
    </div>
  );
}
