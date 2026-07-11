import {
  ArrowRight,
  Box,
  Gem,
  Link2,
  Play,
  Sparkles,
  Wand2,
} from "lucide-react";
import Link from "next/link";
import { LandingUploadIsland } from "@/components/landing/LandingUploadIsland";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const capabilities = [
  {
    icon: Box,
    number: "01",
    title: "CAD, made cinematic",
    body: "Turn GLB, STL, and Rhino files into photoreal product imagery without leaving the browser.",
  },
  {
    icon: Gem,
    number: "02",
    title: "Jewelry-native materials",
    body: "Precious metals, faceted stones, finishes, and lighting tuned for fine jewelry—not generic 3D.",
  },
  {
    icon: Link2,
    number: "03",
    title: "Ready for commerce",
    body: "Ship stills, 360° video, AI campaign visuals, share links, and interactive PDP embeds.",
  },
];

export function LandingPage() {
  return (
    <div className="min-h-[100dvh] overflow-hidden bg-[#171614] text-[#f4efe5]">
      <header className="relative z-30 mx-auto flex max-w-[1440px] items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-full border border-[#cdb88f]/40 bg-[#cdb88f]/10">
            <Gem className="size-4 text-[#d7c195]" aria-hidden />
          </span>
          <span className="text-[15px] font-semibold tracking-[-0.01em]">
            DEVJEWELS
          </span>
          <span className="hidden border-l border-white/15 pl-3 text-[10px] font-medium uppercase tracking-[0.2em] text-white/45 sm:inline">
            Studio
          </span>
        </Link>
        <nav className="hidden items-center gap-8 text-xs font-medium text-white/58 md:flex">
          <Link href="/gallery" className="transition-colors hover:text-white">
            Showcase
          </Link>
          <Link href="/stones" className="transition-colors hover:text-white">
            Diamond cuts
          </Link>
          <Link href="/pricing" className="transition-colors hover:text-white">
            Pricing
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "text-white/65 hover:bg-white/8 hover:text-white",
            )}
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className={cn(
              buttonVariants({ size: "sm" }),
              "bg-[#e4d1a8] px-4 text-[#1a1815] hover:bg-[#efe0be]",
            )}
          >
            Create account
          </Link>
        </div>
      </header>

      <main>
        <section className="relative mx-auto grid min-h-[calc(100dvh-80px)] max-w-[1440px] items-center gap-12 px-5 pb-16 pt-10 sm:px-8 lg:grid-cols-[0.86fr_1.14fr] lg:px-12 lg:pb-20 lg:pt-12">
          <div
            aria-hidden
            className="pointer-events-none absolute left-[38%] top-[-15%] size-[680px] rounded-full bg-[#b99b66]/[0.07] blur-[120px]"
          />
          <div className="relative z-10 max-w-2xl">
            <div className="mb-8 flex items-center gap-3">
              <span className="h-px w-8 bg-[#d7c195]" />
              <p className="text-kicker text-[#d7c195]">
                The digital jewelry atelier
              </p>
            </div>
            <h1 className="font-display text-[clamp(3.7rem,7vw,7.9rem)] font-normal italic leading-[0.84] tracking-[-0.055em] text-[#f5f0e7]">
              CAD to
              <span className="block pl-[0.42em] text-[#d7c195]">
                campaign.
              </span>
            </h1>
            <p className="mt-9 max-w-lg text-base leading-7 text-white/55 sm:text-lg">
              A professional rendering workspace built for jewelers. Create
              campaign-grade images, product videos, and interactive experiences
              from one CAD file.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "h-12 bg-[#e4d1a8] px-6 text-[#1a1815] hover:bg-[#efe0be]",
                )}
              >
                Start creating <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link
                href="/viewer/clearcoat"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "h-12 border-white/15 bg-white/[0.04] px-6 text-white hover:border-white/25 hover:bg-white/[0.08]",
                )}
              >
                <Play className="size-3.5 fill-current" aria-hidden /> Open live
                studio
              </Link>
            </div>
            <div className="mt-12 grid max-w-lg grid-cols-3 gap-5 border-t border-white/10 pt-6">
              {[
                ["3", "CAD formats"],
                ["4K", "still exports"],
                ["360°", "product video"],
              ].map(([value, label]) => (
                <div key={label}>
                  <p className="font-display text-2xl italic text-white">
                    {value}
                  </p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-white/35">
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10 lg:pl-4">
            <div
              className="absolute -inset-10 bg-[radial-gradient(circle,#c5a86c18_0%,transparent_68%)]"
              aria-hidden
            />
            <LandingUploadIsland />
          </div>
        </section>

        <section className="border-y border-white/[0.08] bg-[#1e1c19]">
          <div className="mx-auto grid max-w-[1440px] md:grid-cols-3">
            {capabilities.map(({ icon: Icon, number, title, body }, index) => (
              <article
                key={title}
                className={cn(
                  "group relative p-8 sm:p-10 lg:p-14",
                  index > 0 &&
                    "border-t border-white/[0.08] md:border-l md:border-t-0",
                )}
              >
                <div className="mb-16 flex items-center justify-between text-[#d7c195]">
                  <span className="text-[10px] font-medium tracking-[0.2em]">
                    {number}
                  </span>
                  <Icon
                    className="size-5 transition-transform duration-500 group-hover:rotate-6 group-hover:scale-110"
                    strokeWidth={1.3}
                    aria-hidden
                  />
                </div>
                <h2 className="font-display text-3xl font-normal italic tracking-tight text-white">
                  {title}
                </h2>
                <p className="mt-4 max-w-sm text-sm leading-6 text-white/45">
                  {body}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="bg-[#f1ece2] px-5 py-24 text-[#201e1a] sm:px-8 lg:px-12 lg:py-32">
          <div className="mx-auto grid max-w-[1344px] gap-14 lg:grid-cols-[0.72fr_1.28fr] lg:items-end">
            <div>
              <p className="text-kicker text-[#8a7350]">
                One continuous workflow
              </p>
              <h2 className="mt-6 font-display text-5xl font-normal italic leading-[0.95] tracking-[-0.04em] sm:text-6xl">
                From bench idea
                <span className="block text-[#92784e]">to buyer screen.</span>
              </h2>
            </div>
            <div className="grid gap-px overflow-hidden rounded-3xl border border-black/10 bg-black/10 sm:grid-cols-3">
              {[
                {
                  icon: Gem,
                  label: "01 · Configure",
                  text: "Map every metal, stone, and finish.",
                },
                {
                  icon: Wand2,
                  label: "02 · Art direct",
                  text: "Build the lighting and campaign world.",
                },
                {
                  icon: Sparkles,
                  label: "03 · Publish",
                  text: "Export assets or embed the live piece.",
                },
              ].map(({ icon: Icon, label, text }) => (
                <div key={label} className="bg-[#f8f4ec] p-7">
                  <Icon
                    className="size-5 text-[#92784e]"
                    strokeWidth={1.4}
                    aria-hidden
                  />
                  <p className="mt-12 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#92784e]">
                    {label}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-black/60">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-[#171614] px-5 py-10 text-white/45 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-[1344px] flex-col gap-6 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 DevJewels Studio. Built for the jewelry industry.</p>
          <nav className="flex flex-wrap gap-6">
            <Link href="/terms" className="hover:text-white">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-white">
              Privacy
            </Link>
            <Link href="/refund" className="hover:text-white">
              Refunds
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
