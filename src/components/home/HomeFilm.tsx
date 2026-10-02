"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFilmTheme } from "@/components/scroll-film/film-theme";
import { Chapter, chapterLabel, FilmChrome, Line, Magnetic, Preloader, Readout } from "@/components/scroll-film/film-ui";
import { ThemeToggle } from "@/components/site/ThemeToggle";
import { SplitText } from "@/components/scroll-film/SplitText";
import { clamp01, filmMoment, filmProgress } from "@/components/scroll-film/story";
import { onStoryFrame, useStoryDriver } from "@/components/scroll-film/use-story-driver";
import "@/components/scroll-film/scroll-film.css";
import {
  BAND_END,
  chapter,
  CHAPTERS,
  climbAt,
  FACTS,
  hoverAt,
  I,
  landedAt,
  reformAt,
  REFORM_METALS,
  STONE_ZONES,
  SWARM_POINTS,
  sweepAt,
  wireAt,
} from "./experience/chapters";
import "./home.css";

const Stage = dynamic(() => import("./experience/Stage").then((m) => m.Stage), { ssr: false });

/** The build on the film clock, so every counter agrees with what the stage shows. */
const build = () => {
  const { index, progress } = filmMoment();
  return { i: index, p: progress };
};
const count = (n: number) => Math.round(n).toLocaleString("en-US");
/** A measured fact, or a dash until the stage has built the piece. */
const fact = (value: number, format: (v: number) => string) => (value > 0 ? format(value) : "—");
const percent = (v: number) => `${String(Math.round(clamp01(v) * 100)).padStart(2, "0")}%`;

const readChapter = chapterLabel(CHAPTERS);
const readPoints = () => {
  const { i, p } = build();
  return count(landedAt(i, p) * SWARM_POINTS);
};
const readTriangles = () => {
  const { i, p } = build();
  return fact(FACTS.triangles, (t) => count(clamp01(wireAt(i, p)) * t));
};
const readSize = () => fact(FACTS.usSize, (s) => `US ${s} · Ø ${FACTS.innerDiameterMm.toFixed(1)} MM`);
const readBand = () => fact(FACTS.bandWidthMm, (w) => `${w.toFixed(1)} × ${FACTS.bandThicknessMm.toFixed(1)} MM`);
const readGoldWeight = () => fact(FACTS.grams["gold-18k-yellow"] ?? 0, (g) => `${g.toFixed(2)} G`);
const readSetting = () => fact(FACTS.settingHeightMm, (h) => `${h.toFixed(1)} MM`);
const readStone = () => fact(FACTS.carat, (c) => `${c.toFixed(2)} CT · Ø ${FACTS.stoneMm.toFixed(1)} MM`);
const readCoverage = () => {
  const { i, p } = build();
  return percent(climbAt(i, p) / BAND_END);
};
const readHead = () => {
  const { i, p } = build();
  return percent((climbAt(i, p) - BAND_END) / (1 - BAND_END));
};
const readZone = () => {
  const { i, p } = build();
  const depth = sweepAt(i, p);
  if (depth >= 1) return hoverAt(i, p) > 0.01 ? "Setting" : "Set";
  return STONE_ZONES.find((z) => clamp01(depth) < z.until)!.name;
};
/** The metal the re-forming ring is in now (the front has passed the middle of the piece). */
const reformMetal = () => {
  const { i, p } = build();
  const { from, front } = reformAt(i, p);
  return REFORM_METALS[front > 0.5 ? from + 1 : from]!;
};
const readMetal = () => reformMetal().name;
const readMetalWeight = () => fact(FACTS.grams[reformMetal().id] ?? 0, (g) => `${g.toFixed(2)} G`);
const readBuild = () => `${String(Math.round(filmProgress() * 100)).padStart(3, "0")}`;

/** The build steps down the right edge: done, live or still to come. */
const STEPS = [
  { label: "Points", until: I.points },
  { label: "Mesh", until: I.mesh },
  { label: "Metal", until: I.metal },
  { label: "Claws", until: I.claws },
  { label: "Stone", until: I.spark },
  { label: "Finish", until: I.reform },
];

function BuildSteps() {
  const ref = useRef<HTMLOListElement>(null);
  useEffect(
    () =>
      onStoryFrame(() => {
        const list = ref.current;
        if (!list) return;
        const { i, p } = build();
        list.querySelectorAll<HTMLElement>("[data-step]").forEach((item, k) => {
          const until = STEPS[k]!.until;
          const state = i > until || (i === until && p > 0.96) ? "done" : i === until ? "live" : "todo";
          if (item.dataset.state !== state) item.dataset.state = state;
        });
        list.style.setProperty("--build", filmProgress().toFixed(4));
      }),
    [],
  );
  return (
    <ol ref={ref} className="hf-steps" aria-hidden>
      {STEPS.map((s, k) => (
        <li key={s.label} data-step data-state="todo">
          <span className="hf-step-index">{String(k + 1).padStart(2, "0")}</span>
          {s.label}
        </li>
      ))}
    </ol>
  );
}

/** Thin corner brackets and a build meter: the viewport as a fabricator's viewfinder. */
function Hud() {
  return (
    <div aria-hidden className="hf-hud">
      <span className="hf-corner hf-corner-tl" />
      <span className="hf-corner hf-corner-tr" />
      <span className="hf-corner hf-corner-bl" />
      <span className="hf-corner hf-corner-br" />
      <div className="hf-meter">
        <span>BUILD</span>
        <Readout read={readBuild} initial="000" className="tabular-nums text-[var(--sf-paper)]" />
        <span className="hf-meter-bar" />
      </div>
      <BuildSteps />
    </div>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="block">
      <span className="block font-mono text-[10px] tracking-[0.3em] text-[var(--sf-faint)]">{label}</span>
      <span className="mt-1 block font-mono text-[13px] tracking-[0.12em] text-[var(--sf-holo)]">{children}</span>
    </span>
  );
}

type Spec = { label: string; value: ReactNode };

/** A chapter's spec sheet: facts that arrive one after another as the chapter plays. */
function Specs({ items, from = 0.16, className }: { items: Spec[]; from?: number; className?: string }) {
  return (
    <div className={`mt-9 grid grid-cols-2 gap-x-8 gap-y-5 ${className ?? ""}`}>
      {items.map((item, k) => (
        <Line key={item.label} s={from + k * 0.06} e={1.2}>
          <Stat label={item.label}>{item.value}</Stat>
        </Line>
      ))}
    </div>
  );
}

/** The opening: the galaxy owns the middle of the screen; the type keeps to the bottom edge. */
function HeroChapter() {
  return (
    <Chapter chapter={chapter("swarm")}>
      <div className="absolute inset-x-0 bottom-[9vh] flex flex-col gap-6 px-5 sm:flex-row sm:items-end sm:justify-between sm:px-10">
        <div className="sf-rise sf-scatter">
          <p className="hf-kicker">Mist Studio · Assembly</p>
          <h1 className="sf-display text-[clamp(3rem,1.2rem+5.2vw,8rem)] leading-[0.86]">
            <SplitText text="Assembled" />
            <br />
            <SplitText text="in light." className="italic" />
          </h1>
        </div>
        <div className="sf-exit max-w-[40ch] sm:text-right">
          <p className="font-mono text-[11px] tracking-[0.3em] text-[var(--sf-holo)]">36,000 POINTS · ONE RING</p>
          <p className="mt-3 text-[15px] leading-relaxed text-[var(--sf-dim)]">
            Scroll and watch a ring build itself — points, mesh, metal, stone. Stir the swarm with your cursor; hold to
            pull it in, let go or tap to send a wave through it.
          </p>
        </div>
      </div>
    </Chapter>
  );
}

/** The end: the finished ring keeps the centre; the call to action sits along the bottom. */
function BeginChapter() {
  return (
    <Chapter chapter={chapter("start")}>
      <div className="absolute inset-x-0 bottom-[9vh] flex flex-col gap-5 px-5 sm:flex-row sm:items-end sm:justify-between sm:px-10">
        <div>
          <p className="hf-kicker">Your turn</p>
          <Magnetic>
            <Link
              href="/login?mode=signup&next=/dashboard"
              className="sf-display block text-[clamp(3rem,1rem+6vw,8.5rem)] italic leading-none transition-colors duration-500 hover:text-[var(--sf-holo)]"
            >
              Build yours
            </Link>
          </Magnetic>
        </div>
        <p className="text-[16px] text-[var(--sf-dim)] sm:text-right">
          Three pieces on us ·{" "}
          <Link href="/design" className="underline decoration-[var(--sf-faint)] underline-offset-[6px] hover:decoration-[var(--sf-paper)]">
            Design a ring
          </Link>{" "}
          ·{" "}
          <Link href="/pricing" className="underline decoration-[var(--sf-faint)] underline-offset-[6px] hover:decoration-[var(--sf-paper)]">
            Pricing
          </Link>
        </p>
      </div>
    </Chapter>
  );
}

/** The home page: the landing as an assembly you scroll — a ring that builds itself out of light. */
export function HomeFilm() {
  const root = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const theme = useFilmTheme();
  useStoryDriver(root);

  return (
    <div ref={root} className={`sf-page hf-page relative ${loaded ? "sf-loaded" : ""}`}>
      {theme ? <Stage theme={theme} /> : null}
      <Preloader label="ASSEMBLING" onDone={() => setLoaded(true)} />
      <FilmChrome readChapter={readChapter} initialChapter="01 — Assembly" actions={<ThemeToggle className="border-white/60 text-white hover:bg-white hover:text-black" />} />
      <Hud />

      <main>
        <HeroChapter />

        <Chapter chapter={chapter("points")}>
          <div className="sf-skew absolute inset-y-0 left-0 flex w-full max-w-[600px] flex-col justify-center px-5 sm:px-10">
            <p className="hf-kicker">01 · Points</p>
            <h2 className="sf-kinetic sf-exit sf-display text-[clamp(2.3rem,0.9rem+3.4vw,5rem)] leading-[0.94]">
              <SplitText text="It starts" />
              <br />
              <SplitText text="as a cloud." className="italic" />
            </h2>
            <Line s={0.12} e={1.2} className="mt-8 max-w-[38ch] text-[16px] leading-relaxed text-[var(--sf-dim)]">
              It prints from the base up — every point lands exactly where the metal will be. Nothing here is a picture:
              it is the ring&apos;s own surface, sampled.
            </Line>
            <Specs
              items={[
                { label: "POINTS LANDED", value: <Readout read={readPoints} initial="0" /> },
                { label: "OF", value: count(SWARM_POINTS) },
                { label: "RING SIZE", value: <Readout read={readSize} initial="—" /> },
                { label: "ORDER", value: "BASE → STONE" },
              ]}
            />
          </div>
        </Chapter>

        <Chapter chapter={chapter("mesh")}>
          <div className="sf-skew absolute inset-y-0 right-0 flex w-full max-w-[600px] flex-col justify-center px-5 text-right sm:px-10 lg:max-w-[820px] lg:pr-[240px]">
            <p className="hf-kicker ml-auto">02 · Mesh</p>
            <h2 className="sf-kinetic sf-exit sf-display text-[clamp(2.3rem,0.9rem+3.4vw,5rem)] leading-[0.94]">
              <SplitText text="Then a mesh" />
              <br />
              <SplitText text="you could cast." className="italic" />
            </h2>
            <Specs
              className="text-left sm:ml-auto sm:w-[380px]"
              items={[
                { label: "TRIANGLES", value: <Readout read={readTriangles} initial="0" /> },
                { label: "WATERTIGHT", value: "YES" },
                { label: "EDGE-MANIFOLD", value: "YES" },
                { label: "EXPORTS", value: "STL · OBJ · GLB" },
              ]}
            />
          </div>
        </Chapter>

        <Chapter chapter={chapter("metal")}>
          <div className="sf-skew absolute inset-x-0 top-[13vh] px-5 sm:px-10">
            <p className="hf-kicker">03 · Metal</p>
            <h2 className="sf-kinetic sf-exit sf-display max-w-[11ch] text-[clamp(2.3rem,0.9rem+3.4vw,5rem)] leading-[0.94]">
              <SplitText text="Gold climbs," />
              <br />
              <SplitText text="tile by tile." className="italic" />
            </h2>
            <Specs
              className="max-w-[360px]"
              items={[
                { label: "ALLOY", value: "18K YELLOW · 750" },
                { label: "METAL WEIGHT", value: <Readout read={readGoldWeight} initial="—" /> },
                { label: "BAND", value: <Readout read={readBand} initial="—" /> },
                { label: "FINISH", value: "HIGH POLISH" },
              ]}
            />
          </div>
          <div className="sf-exit absolute inset-x-0 bottom-[10vh] flex items-end justify-between gap-6 px-5 sm:px-10">
            <Line s={0.1} e={1.2} className="max-w-[34ch] text-[15px] leading-relaxed text-[var(--sf-dim)]">
              Each tile lands where the CAD says it should, then cools to polish.
            </Line>
            <span className="text-right">
              <span className="block font-mono text-[10px] tracking-[0.3em] text-[var(--sf-faint)]">BAND</span>
              <Readout read={readCoverage} initial="00%" className="sf-display sf-outline block text-[clamp(2.8rem,1rem+4.5vw,6rem)] leading-none tabular-nums" />
            </span>
          </div>
        </Chapter>

        <Chapter chapter={chapter("claws")}>
          <div className="sf-skew absolute inset-y-0 left-0 flex max-w-[600px] flex-col justify-center px-5 pb-[12vh] sm:px-10">
            <p className="hf-kicker">04 · Claws</p>
            <h2 className="sf-kinetic sf-exit sf-display text-[clamp(2.3rem,0.9rem+3.4vw,5rem)] leading-[0.94]">
              <SplitText text="Six claws" />
              <br />
              <SplitText text="close." className="italic" />
            </h2>
            <Line s={0.12} e={1.2} className="mt-8 max-w-[34ch] text-[16px] leading-relaxed text-[var(--sf-dim)]">
              A head cut to the stone&apos;s exact girdle — so what you render is what the setter sets.
            </Line>
            <Specs
              className="max-w-[360px]"
              items={[
                { label: "PRONGS", value: "6" },
                { label: "SETTING HEIGHT", value: <Readout read={readSetting} initial="—" /> },
                { label: "SHANK", value: "CATHEDRAL" },
                { label: "HEAD", value: "GIRDLE-FIT" },
              ]}
            />
            {/* In the copy's column: the ring fills the other side of this close-up. */}
            <Line s={0.4} e={1.2} className="mt-8">
              <span className="block font-mono text-[10px] tracking-[0.3em] text-[var(--sf-faint)]">HEAD BUILT</span>
              <Readout read={readHead} initial="00%" className="sf-display sf-outline block text-[clamp(2.4rem,1rem+3vw,4.5rem)] leading-none tabular-nums" />
            </Line>
          </div>
        </Chapter>

        <Chapter chapter={chapter("spark")}>
          <div className="sf-skew absolute inset-y-0 right-0 flex w-full max-w-[600px] flex-col justify-center px-5 text-right sm:px-10 lg:max-w-[820px] lg:pr-[240px]">
            <p className="hf-kicker ml-auto">05 · Stone</p>
            <h2 className="sf-kinetic sf-exit sf-display text-[clamp(2.3rem,0.9rem+3.4vw,5rem)] leading-[0.94]">
              <SplitText text="The stone" />
              <br />
              <SplitText text="takes its fire." className="italic" />
            </h2>
            <Line s={0.12} e={1.2} className="ml-auto mt-8 max-w-[34ch] text-[16px] leading-relaxed text-[var(--sf-dim)]">
              It lifts clear of its claws and lights from table to culet, every facet ray-traced — then drops back in to be
              set.
            </Line>
            <Specs
              className="text-left sm:ml-auto sm:w-[380px]"
              items={[
                { label: "NOW TRACING", value: <Readout read={readZone} initial="Table" className="uppercase" /> },
                { label: "STONE", value: <Readout read={readStone} initial="—" /> },
                { label: "CUT", value: "ROUND BRILLIANT" },
                { label: "COLOUR", value: "D · COLOURLESS" },
              ]}
            />
          </div>
        </Chapter>

        <Chapter chapter={chapter("reform")}>
          <div className="sf-skew absolute inset-y-0 left-0 flex w-full max-w-[600px] flex-col justify-center px-5 sm:px-10">
            <p className="hf-kicker">06 · Finish</p>
            <h2 className="sf-kinetic sf-exit sf-display text-[clamp(2.3rem,0.9rem+3.4vw,5rem)] leading-[0.94]">
              <SplitText text="Change" />
              <br />
              <SplitText text="the metal." />
              <br />
              <SplitText text="It re-forms." className="italic" />
            </h2>
            <Specs
              className="max-w-[380px]"
              from={0.1}
              items={[
                { label: "NOW IN", value: <Readout read={readMetal} initial="18K yellow gold" className="uppercase" /> },
                { label: "METAL WEIGHT", value: <Readout read={readMetalWeight} initial="—" /> },
              ]}
            />
            <Line s={0.24} e={1.2} className="mt-7 font-mono text-[11px] tracking-[0.3em] text-[var(--sf-faint)]">
              21 METALS · 22 CUTS · 45 FANCY COLOURS
            </Line>
          </div>
        </Chapter>

        <BeginChapter />
      </main>
    </div>
  );
}
