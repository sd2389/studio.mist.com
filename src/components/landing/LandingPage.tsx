import { ArrowDownRight, ArrowUpRight, Menu } from "lucide-react";
import Link from "next/link";

const chapters = [
  {
    number: "01",
    eyebrow: "Material",
    title: "Configure",
    href: "/viewer/clearcoat",
  },
  { number: "02", eyebrow: "Light", title: "Direct", href: "/gallery" },
  { number: "03", eyebrow: "Output", title: "Publish", href: "/signup" },
];

export function LandingPage() {
  return (
    <div className="min-h-dvh bg-[#0b0b0a] text-white selection:bg-[#ef5b2a] selection:text-black">
      <section className="relative min-h-[780px] overflow-hidden border-b border-white/20 lg:min-h-dvh">
        <div
          className="cinematic-grain absolute inset-0 opacity-20"
          aria-hidden
        />
        <header className="relative z-30 flex h-[76px] items-center justify-between border-b border-white/20 px-5 sm:px-8">
          <Link
            href="/"
            className="flex items-center text-[15px] font-black tracking-[-0.035em]"
          >
            <span className="mr-2.5 size-2.5 bg-[#ef5b2a]" />
            DEVJEWELS / STUDIO
          </Link>
          <nav className="hidden items-center gap-10 text-[9px] font-bold uppercase tracking-[0.2em] md:flex">
            <Link
              href="/gallery"
              className="transition-opacity hover:opacity-50"
            >
              Objects
            </Link>
            <Link
              href="/stones"
              className="transition-opacity hover:opacity-50"
            >
              Process
            </Link>
            <Link
              href="/pricing"
              className="transition-opacity hover:opacity-50"
            >
              Access
            </Link>
            <Link
              href="/login"
              className="grid size-11 place-items-center rounded-full border border-white/30"
            >
              <Menu className="size-4" aria-hidden />
            </Link>
          </nav>
        </header>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_68%_43%,#4b4840_0%,#25241f_29%,#0d0d0c_68%)]" />
        <div
          className="absolute right-[-8%] top-[12%] h-[70%] w-[67%] opacity-90"
          aria-hidden
        >
          <div className="absolute left-1/2 top-[59%] h-[61%] w-[36%] -translate-x-1/2 -translate-y-1/2 -rotate-[17deg] rounded-[50%] border-[clamp(42px,5vw,76px)] border-[#aaa69d] shadow-[inset_20px_0_28px_rgba(255,255,255,.45),inset_-24px_-10px_32px_#282725,0_55px_60px_rgba(0,0,0,.7)]" />
          <div className="absolute left-1/2 top-[17%] h-[27%] w-[26%] -translate-x-1/2 -rotate-[8deg] bg-[#aaa69d] shadow-[inset_28px_18px_30px_rgba(255,255,255,.4),inset_-24px_-18px_32px_#2c2b29] [clip-path:polygon(12%_24%,49%_0,88%_21%,100%_69%,50%_100%,0_70%)]" />
          <div className="absolute left-1/2 top-[18%] h-[21%] w-[19%] -translate-x-1/2 -rotate-[8deg] bg-[conic-gradient(from_30deg,#faffff,#809ba0,#fff,#bbced0,#fff,#738d93,#fff)] drop-shadow-[0_0_35px_rgba(220,249,255,.5)] [clip-path:polygon(50%_0,87%_18%,100%_59%,50%_100%,0_59%,13%_18%)]" />
        </div>
        <div className="absolute inset-x-0 bottom-0 z-20 px-5 pb-8 sm:px-8">
          <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.22em] text-[#ef5b2a]">
            01 — Digital production for fine jewelry
          </p>
          <h1 className="max-w-[1200px] text-[clamp(5rem,11.4vw,11rem)] font-black uppercase leading-[0.76] tracking-[-0.09em]">
            Jewelry
            <span className="ml-[16%] block text-transparent [-webkit-text-stroke:1px_white]">
              in motion
            </span>
          </h1>
          <div className="mt-8 flex items-end justify-between gap-6">
            <p className="max-w-sm text-xs leading-5 text-white/70">
              A browser-based production environment where CAD becomes campaign
              imagery, motion, and interactive commerce.
            </p>
            <Link
              href="/viewer/clearcoat"
              className="grid size-28 shrink-0 place-items-center rounded-full bg-[#ef5b2a] text-center text-[9px] font-black uppercase tracking-[0.15em] text-black transition-transform hover:rotate-6 hover:scale-105 sm:size-32"
            >
              Enter studio
              <ArrowDownRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>
      <section className="grid min-h-[660px] bg-[#d8d5cd] text-black lg:grid-cols-[1.25fr_.75fr]">
        <div className="flex flex-col justify-between border-b border-black p-6 sm:p-8 lg:border-b-0 lg:border-r">
          <p className="text-[9px] font-bold uppercase tracking-[0.22em]">
            The platform / 2026
          </p>
          <h2 className="my-20 max-w-4xl text-[clamp(3.4rem,6.4vw,6.5rem)] font-black uppercase leading-[0.88] tracking-[-0.075em]">
            One object.
            <span className="block text-[#ef5b2a]">Every output.</span>
            No compromise.
          </h2>
          <div className="grid gap-8 border-t border-black pt-5 text-xs leading-5 sm:grid-cols-2">
            <p>
              Configure precious materials.
              <br />
              Direct the light. Publish everywhere.
            </p>
            <p>
              GLB / STL / 3DM
              <br />
              Still / Film / Embed / AI
            </p>
          </div>
        </div>
        <div className="grid">
          {chapters.map((chapter) => (
            <Link
              key={chapter.number}
              href={chapter.href}
              className="group flex items-end justify-between border-b border-black p-7 transition-colors last:border-0 hover:bg-[#ef5b2a]"
            >
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.18em]">
                  {chapter.number} / {chapter.eyebrow}
                </p>
                <h3 className="mt-1 text-3xl font-black uppercase tracking-[-0.05em]">
                  {chapter.title}
                </h3>
              </div>
              <ArrowUpRight
                className="size-4 transition-transform group-hover:-translate-y-1 group-hover:translate-x-1"
                aria-hidden
              />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
