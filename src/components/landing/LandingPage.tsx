import { ArrowDown, ArrowDownRight, ArrowUpRight, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingHeroRingIsland } from "@/components/landing/LandingHeroRingIsland";

const capabilities = [
  {
    number: "01",
    title: "Precious materials",
    copy: "Gold, platinum, diamonds, and custom finishes calibrated in real time.",
    href: "/viewer/clearcoat",
  },
  {
    number: "02",
    title: "Studio lighting",
    copy: "Direct every reflection with jewelry-specific environments and controls.",
    href: "/gallery",
  },
  {
    number: "03",
    title: "Campaign output",
    copy: "Create stills, motion, embeds, and AI scenes from one approved object.",
    href: "/login?mode=signup",
  },
] as const;

export function LandingPage() {
  return (
    <div className="min-h-dvh overflow-x-clip bg-white text-[#212121] selection:bg-[#212121] selection:text-white">
      <main className="p-2.5 sm:p-4">
        <section className="ice-panel relative flex min-h-[min(100dvh,920px)] flex-col overflow-hidden lg:min-h-[calc(100dvh-32px)]">
          <LandingHeader />

          <div className="relative z-20 shrink-0 px-5 pt-2 sm:px-8 sm:pt-4 lg:px-12">
            <h1 className="max-w-4xl text-[clamp(2.35rem,7.5vw,6.7rem)] font-light leading-[0.9] tracking-[-0.07em] sm:leading-[0.86] sm:tracking-[-0.075em]">
              Jewelry visualization
              <span className="text-black/20"> technology</span>
              <span className="mt-1 block sm:mt-0 sm:pl-[12%] lg:pl-[18%]">
                for a <strong className="font-semibold">brilliant</strong>
              </span>
              <span className="mt-1 block sm:mt-0 sm:pl-[28%] lg:pl-[48%]">
                and confident launch.
              </span>
            </h1>
          </div>

          <div className="relative z-10 mx-auto mt-2 w-full min-h-[240px] flex-1 sm:mt-0 sm:min-h-[320px] lg:min-h-[420px]">
            <LandingHeroRingIsland />

            <div className="pointer-events-none absolute left-1/2 top-[52%] z-20 hidden -translate-x-1/2 lg:block">
              <span className="absolute left-0 top-2 h-px w-28 origin-left -rotate-12 bg-white" />
              <span className="grid size-4 place-items-center rounded-full border border-white bg-white/40">
                <span className="size-1.5 rounded-full bg-white" />
              </span>
              <p className="ml-32 -mt-1 w-36 text-[8px] leading-3 text-black/55">
                Physically accurate precious-metal response
              </p>
            </div>
          </div>

          <div className="relative z-20 flex shrink-0 flex-col gap-6 px-5 pb-7 pt-2 sm:flex-row sm:items-end sm:justify-between sm:px-8 sm:pb-8 lg:px-12 lg:pb-12">
            <div className="max-w-[280px]">
              <p className="text-[10px] leading-4 text-black/55 sm:text-[11px] sm:leading-5">
                One browser-based production environment for configuring,
                lighting, rendering, and publishing fine jewelry.
              </p>
              <Link
                href="/viewer/clearcoat"
                className="mt-4 inline-flex min-h-11 items-center gap-3 rounded-full bg-[#212121] px-5 py-3 text-[9px] font-semibold uppercase tracking-[0.08em] text-white sm:mt-5"
              >
                Enter the studio
                <ArrowDownRight className="size-3.5" aria-hidden />
              </Link>
            </div>

            <div className="flex items-end justify-between gap-6 sm:justify-end sm:gap-8">
              <div>
                <p className="text-4xl font-light tracking-[-0.07em] sm:text-5xl">
                  12
                </p>
                <p className="text-[8px] uppercase tracking-[0.14em] text-black/45">
                  Output modes
                </p>
              </div>
              <div>
                <p className="text-4xl font-light tracking-[-0.07em] sm:text-5xl">
                  04
                </p>
                <p className="text-[8px] uppercase tracking-[0.14em] text-black/45">
                  Core workflows
                </p>
              </div>
              <a
                href="#platform"
                className="grid size-11 place-items-center rounded-full border border-black/15 sm:size-12"
                aria-label="Discover the platform"
              >
                <ArrowDown className="size-4" aria-hidden />
              </a>
            </div>
          </div>
        </section>

        <section
          id="platform"
          className="grid gap-8 px-3 py-16 sm:px-6 sm:py-24 lg:grid-cols-[0.7fr_1.3fr] lg:px-8 lg:py-36"
        >
          <div className="flex items-start gap-3 sm:gap-4">
            <p className="text-5xl font-light leading-none tracking-[-0.08em] sm:text-7xl">
              01
            </p>
            <div className="pt-1 text-xl font-light leading-[0.9] sm:pt-2 sm:text-2xl">
              The
              <strong className="block font-semibold">Platform</strong>
            </div>
          </div>
          <div className="min-w-0">
            <h2 className="max-w-5xl text-[clamp(2rem,5.3vw,5.9rem)] font-light leading-[0.95] tracking-[-0.055em] sm:leading-[0.9] sm:tracking-[-0.065em]">
              A new era of jewelry production — where
              <strong className="font-semibold"> advanced technology</strong>
              <span className="text-black/20"> meets natural brilliance.</span>
            </h2>
            <p className="mt-10 max-w-2xl text-[clamp(1.25rem,3vw,3.4rem)] font-light leading-[1.05] tracking-[-0.04em] sm:ml-auto sm:mt-16 sm:leading-[0.95] sm:tracking-[-0.05em]">
              MIST unites the precision of real-time 3D with the elegance
              of campaign-grade presentation.
            </p>
          </div>
        </section>

        <section className="ice-panel overflow-hidden">
          <div className="grid border-b border-black/10 px-5 py-10 sm:px-6 sm:py-12 lg:grid-cols-[0.65fr_1.35fr] lg:px-12 lg:py-20">
            <div className="flex items-start gap-3 sm:gap-4">
              <p className="text-5xl font-light leading-none tracking-[-0.08em] sm:text-7xl">
                02
              </p>
              <p className="pt-1 text-xl font-light leading-[0.9] sm:pt-2 sm:text-2xl">
                One object
                <strong className="block font-semibold">Every output</strong>
              </p>
            </div>
            <h2 className="mt-8 max-w-4xl text-[clamp(2.25rem,6vw,7rem)] font-light leading-[0.9] tracking-[-0.06em] sm:leading-[0.84] sm:tracking-[-0.07em] lg:mt-0">
              More than a renderer —
              <strong className="font-semibold"> your launch partner.</strong>
            </h2>
          </div>

          <div className="grid md:grid-cols-3">
            {capabilities.map((item) => (
              <Link
                key={item.number}
                href={item.href}
                className="group flex min-h-[260px] flex-col justify-between border-b border-black/10 p-5 transition-colors hover:bg-white/35 sm:min-h-[300px] sm:p-6 md:min-h-[340px] md:border-b-0 md:border-r md:last:border-r-0 lg:p-9"
              >
                <div className="flex items-start justify-between">
                  <p className="text-[10px] text-black/45">{item.number}</p>
                  <ArrowUpRight
                    className="size-4 text-black/35 transition-transform group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-black"
                    aria-hidden
                  />
                </div>
                <div className="mt-16 sm:mt-24 md:mt-36">
                  <h3 className="text-2xl font-light tracking-[-0.05em] sm:text-3xl">
                    {item.title}
                  </h3>
                  <p className="mt-3 max-w-xs text-[11px] leading-5 text-black/55 sm:mt-4">
                    {item.copy}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="relative my-2.5 min-h-[520px] overflow-hidden rounded-[1.75rem] bg-[#212121] text-white sm:my-4 sm:min-h-[680px] sm:rounded-[2.25rem]">
          <Image
            src="/images/devjewels-ice-ring.png"
            alt=""
            fill
            sizes="100vw"
            className="object-cover opacity-45 mix-blend-screen"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#212121]/20 to-[#212121]/90" />
          <div className="relative z-10 flex min-h-[520px] flex-col justify-between p-6 sm:min-h-[680px] sm:p-12">
            <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.15em] text-white/55">
              <span>MIST / Studio</span>
              <Sparkles className="size-4" aria-hidden />
            </div>
            <div>
              <h2 className="max-w-5xl text-[clamp(2.75rem,9vw,10rem)] font-light uppercase leading-[0.82] tracking-[-0.06em] sm:leading-[0.75] sm:tracking-[-0.075em]">
                Ready to make
                <strong className="block font-semibold">
                  every facet count?
                </strong>
              </h2>
              <div className="mt-8 flex flex-col gap-5 sm:mt-10 sm:flex-row sm:items-end sm:justify-between">
                <p className="max-w-xs text-xs leading-5 text-white/55">
                  Upload a CAD model and turn it into a complete digital product
                  experience.
                </p>
                <Link
                  href="/upload-model"
                  className="inline-flex min-h-11 w-fit items-center gap-3 rounded-full bg-white px-6 py-4 text-[9px] font-semibold uppercase tracking-[0.1em] text-black"
                >
                  Upload your first object
                  <ArrowUpRight className="size-3.5" aria-hidden />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
