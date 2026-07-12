import {
  ArrowDown,
  ArrowDownRight,
  ArrowUpRight,
  Menu,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

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
    href: "/signup",
  },
];

export function LandingPage() {
  return (
    <div className="min-h-dvh bg-white text-[#212121] selection:bg-[#212121] selection:text-white">
      <main className="p-2.5 sm:p-4">
        <section className="ice-panel relative min-h-[760px] overflow-hidden lg:min-h-[calc(100dvh-32px)]">
          <header className="relative z-30 flex h-[78px] items-center justify-between px-5 sm:px-8 lg:px-12">
            <Link href="/" className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-full border border-black/15">
                <span className="size-2.5 rotate-45 border border-black" />
              </span>
              <span className="text-[11px] font-semibold uppercase leading-[0.9] tracking-[-0.025em]">
                DevJewels
                <span className="block font-light text-black/45">Studio</span>
              </span>
            </Link>

            <nav className="hidden items-center gap-8 text-[10px] md:flex">
              <Link href="/" className="border-b border-black pb-1">
                Home
              </Link>
              <Link href="/gallery" className="text-black/55 hover:text-black">
                Gallery
              </Link>
              <Link href="/stones" className="text-black/55 hover:text-black">
                Materials
              </Link>
              <Link href="/pricing" className="text-black/55 hover:text-black">
                Pricing
              </Link>
            </nav>

            <div className="flex items-center gap-3">
              <Link
                href="/login"
                className="hidden text-[10px] text-black/65 sm:inline"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="rounded-full bg-[#212121] px-5 py-3 text-[9px] font-semibold uppercase tracking-[0.08em] text-white"
              >
                Start creating
              </Link>
              <button
                type="button"
                className="grid size-10 place-items-center rounded-full bg-white/45 md:hidden"
                aria-label="Open menu"
              >
                <Menu className="size-4" aria-hidden />
              </button>
            </div>
          </header>

          <div className="absolute inset-x-0 top-[78px] z-20 grid px-5 sm:px-8 lg:grid-cols-12 lg:px-12">
            <h1 className="max-w-4xl text-[clamp(3rem,5.8vw,6.7rem)] font-light leading-[0.86] tracking-[-0.075em] lg:col-span-8">
              Jewelry visualization
              <span className="text-black/20"> technology</span>
              <span className="block pl-[18%]">
                for a <strong className="font-semibold">brilliant</strong>
              </span>
              <span className="block pl-[48%]">and confident launch.</span>
            </h1>
          </div>

          <div className="absolute inset-x-0 bottom-0 top-[180px]">
            <Image
              src="/images/devjewels-ice-ring.png"
              alt="A platinum diamond ring rendered inside DevJewels Studio"
              fill
              priority
              sizes="100vw"
              className="object-cover object-center mix-blend-multiply"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#eaeff5]/70" />
          </div>

          <div className="absolute bottom-8 left-5 z-20 max-w-[245px] sm:left-8 lg:bottom-12 lg:left-12">
            <p className="text-[10px] leading-4 text-black/55">
              One browser-based production environment for configuring,
              lighting, rendering, and publishing fine jewelry.
            </p>
            <Link
              href="/viewer/clearcoat"
              className="mt-5 inline-flex items-center gap-3 rounded-full bg-[#212121] px-5 py-3 text-[9px] font-semibold uppercase tracking-[0.08em] text-white"
            >
              Enter the studio
              <ArrowDownRight className="size-3.5" aria-hidden />
            </Link>
          </div>

          <div className="absolute bottom-8 right-5 z-20 hidden items-end gap-8 sm:flex sm:right-8 lg:bottom-12 lg:right-12">
            <div>
              <p className="text-5xl font-light tracking-[-0.07em]">12</p>
              <p className="text-[8px] uppercase tracking-[0.14em] text-black/45">
                Output modes
              </p>
            </div>
            <div>
              <p className="text-5xl font-light tracking-[-0.07em]">04</p>
              <p className="text-[8px] uppercase tracking-[0.14em] text-black/45">
                Core workflows
              </p>
            </div>
            <a
              href="#platform"
              className="grid size-12 place-items-center rounded-full border border-black/15"
              aria-label="Discover the platform"
            >
              <ArrowDown className="size-4" aria-hidden />
            </a>
          </div>

          <div className="absolute left-[49%] top-[57%] z-20 hidden lg:block">
            <span className="absolute left-0 top-2 h-px w-28 origin-left -rotate-12 bg-white" />
            <span className="grid size-4 place-items-center rounded-full border border-white bg-white/40">
              <span className="size-1.5 rounded-full bg-white" />
            </span>
            <p className="ml-32 -mt-1 w-36 text-[8px] leading-3 text-black/55">
              Physically accurate precious-metal response
            </p>
          </div>
        </section>

        <section
          id="platform"
          className="grid gap-8 px-3 py-24 sm:px-6 lg:grid-cols-[0.7fr_1.3fr] lg:px-8 lg:py-36"
        >
          <div className="flex items-start gap-4">
            <p className="text-7xl font-light leading-none tracking-[-0.08em]">
              01
            </p>
            <div className="pt-2 text-2xl font-light leading-[0.9]">
              The
              <strong className="block font-semibold">Platform</strong>
            </div>
          </div>
          <div>
            <h2 className="max-w-5xl text-[clamp(2.7rem,5.3vw,5.9rem)] font-light leading-[0.9] tracking-[-0.065em]">
              A new era of jewelry production — where
              <strong className="font-semibold"> advanced technology</strong>
              <span className="text-black/20"> meets natural brilliance.</span>
            </h2>
            <p className="ml-auto mt-16 max-w-2xl text-[clamp(1.6rem,3vw,3.4rem)] font-light leading-[0.95] tracking-[-0.05em]">
              DevJewels unites the precision of real-time 3D with the elegance
              of campaign-grade presentation.
            </p>
          </div>
        </section>

        <section className="ice-panel overflow-hidden">
          <div className="grid border-b border-black/10 px-6 py-12 lg:grid-cols-[0.65fr_1.35fr] lg:px-12 lg:py-20">
            <div className="flex items-start gap-4">
              <p className="text-7xl font-light leading-none tracking-[-0.08em]">
                02
              </p>
              <p className="pt-2 text-2xl font-light leading-[0.9]">
                One object
                <strong className="block font-semibold">Every output</strong>
              </p>
            </div>
            <h2 className="mt-12 max-w-4xl text-[clamp(3rem,6vw,7rem)] font-light leading-[0.84] tracking-[-0.07em] lg:mt-0">
              More than a renderer —
              <strong className="font-semibold"> your launch partner.</strong>
            </h2>
          </div>

          <div className="grid md:grid-cols-3">
            {capabilities.map((item) => (
              <Link
                key={item.number}
                href={item.href}
                className="group min-h-[340px] border-b border-black/10 p-6 transition-colors hover:bg-white/35 md:border-b-0 md:border-r md:last:border-r-0 lg:p-9"
              >
                <div className="flex items-start justify-between">
                  <p className="text-[10px] text-black/45">{item.number}</p>
                  <ArrowUpRight
                    className="size-4 text-black/35 transition-transform group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-black"
                    aria-hidden
                  />
                </div>
                <div className="mt-36">
                  <h3 className="text-3xl font-light tracking-[-0.05em]">
                    {item.title}
                  </h3>
                  <p className="mt-4 max-w-xs text-[11px] leading-5 text-black/55">
                    {item.copy}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="relative my-2.5 min-h-[680px] overflow-hidden rounded-[2.25rem] bg-[#212121] text-white sm:my-4">
          <Image
            src="/images/devjewels-ice-ring.png"
            alt=""
            fill
            sizes="100vw"
            className="object-cover opacity-45 mix-blend-screen"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#212121]/20 to-[#212121]/90" />
          <div className="relative z-10 flex min-h-[680px] flex-col justify-between p-7 sm:p-12">
            <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.15em] text-white/55">
              <span>DevJewels / Studio</span>
              <Sparkles className="size-4" aria-hidden />
            </div>
            <div>
              <h2 className="max-w-5xl text-[clamp(4rem,9vw,10rem)] font-light uppercase leading-[0.75] tracking-[-0.075em]">
                Ready to make
                <strong className="block font-semibold">
                  every facet count?
                </strong>
              </h2>
              <div className="mt-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                <p className="max-w-xs text-xs leading-5 text-white/55">
                  Upload a CAD model and turn it into a complete digital product
                  experience.
                </p>
                <Link
                  href="/upload-model"
                  className="inline-flex w-fit items-center gap-3 rounded-full bg-white px-6 py-4 text-[9px] font-semibold uppercase tracking-[0.1em] text-black"
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
