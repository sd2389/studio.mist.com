"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { SITE_NAV, START_FREE_HREF } from "@/components/site/site-nav";
import { Cursor } from "./Cursor";
import { currentChapter, story, type FilmChapter } from "./story";
import { onStoryFrame } from "./use-story-driver";

/** A chapter: a tall scroll section whose content stays pinned while it plays. */
export function Chapter({ chapter, children }: { chapter: FilmChapter; children: ReactNode }) {
  return (
    <section data-chapter={chapter.id} className="sf-chapter" style={{ height: `${chapter.vh}vh` }} aria-label={chapter.title}>
      <div className="sf-sticky">{children}</div>
    </section>
  );
}

/** A line that plays between chapter progress `s` and `e`. */
export function Line({ s, e, className, children }: { s: number; e: number; className?: string; children: ReactNode }) {
  return (
    <p className={`sf-line ${className ?? ""}`} style={{ "--s": s, "--e": e } as CSSProperties}>
      {children}
    </p>
  );
}

/** Text that follows the film, written straight to the DOM each frame (no re-render). */
export function Readout({ read, initial, className }: { read: () => string; initial: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(
    () =>
      onStoryFrame(() => {
        const element = ref.current;
        const text = read();
        if (element && element.textContent !== text) element.textContent = text;
      }),
    [read],
  );
  return (
    <span ref={ref} className={className}>
      {initial}
    </span>
  );
}

/** Counts up while the stage compiles its shaders, then lifts like a curtain. */
export function Preloader({ label, onDone }: { label: string; onDone: () => void }) {
  const [value, setValue] = useState(0);
  const [done, setDone] = useState(false);
  useEffect(() => {
    let shown = 0;
    let frame = 0;
    const started = performance.now();
    let last = started;
    const tick = (now: number) => {
      // Time-based, so a slow first frame (shader compile) never stalls the count.
      const dt = Math.min((now - last) / 1000, 0.25);
      last = now;
      const waitedTooLong = now - started > 14000;
      const goal = story.ready || waitedTooLong ? 100 : 91;
      shown += (goal - shown) * (1 - Math.exp(-dt * (goal === 100 ? 6 : 1.4)));
      setValue(Math.min(100, Math.round(shown)));
      if (goal === 100 && shown > 99.4) {
        setDone(true);
        onDone();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [onDone]);
  return (
    <div className="sf-preloader" data-done={done} aria-hidden={done}>
      <div className="text-center">
        <p className="sf-display text-[clamp(3rem,10vw,8rem)] leading-none">MIST</p>
        <p className="mt-6 font-mono text-[12px] tracking-[0.3em] text-[var(--sf-dim)]">
          {label} · {String(value).padStart(3, "0")}
        </p>
        <div className="mx-auto mt-4 h-px w-56 overflow-hidden bg-[color-mix(in_srgb,var(--sf-paper)_12%,transparent)]">
          <div className="h-full bg-[var(--sf-paper)] transition-[width] duration-150" style={{ width: `${value}%` }} />
        </div>
      </div>
    </div>
  );
}

/** Pulls toward the pointer when it comes near: the last button deserves a little gravity. */
export function Magnetic({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia("(pointer: coarse), (prefers-reduced-motion: reduce)").matches) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const near = Math.hypot(dx, dy) < Math.max(r.width, r.height);
      el.style.transform = near ? `translate3d(${dx * 0.22}px, ${dy * 0.3}px, 0)` : "";
    };
    addEventListener("pointermove", move, { passive: true });
    return () => removeEventListener("pointermove", move);
  }, []);
  return (
    <div ref={ref} className="inline-block transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]">
      {children}
    </div>
  );
}

/** "03 — The cut": the chapter on screen, for the corner readout. */
export function chapterLabel(chapters: readonly FilmChapter[]): () => string {
  return () => {
    const { index } = currentChapter();
    return `${String(index + 1).padStart(2, "0")} — ${chapters[index]?.title ?? ""}`;
  };
}

/**
 * Grain, cursor, the blended header and the chapter readout every film shares. `actions`
 * sit in the header before the sign-up button (a theme toggle, for films that have one).
 */
export function FilmChrome({ readChapter, initialChapter, actions }: { readChapter: () => string; initialChapter: string; actions?: ReactNode }) {
  return (
    <>
      <div aria-hidden className="sf-grain" />
      <Cursor />
      <header className="fixed inset-x-0 top-0 z-[60] flex items-center justify-between px-5 py-5 mix-blend-difference sm:px-10">
        <Link href="/" className="text-[13px] font-medium uppercase tracking-[0.24em] text-white">
          Mist Studio
        </Link>
        <nav className="flex items-center gap-6 text-[13px] text-white">
          {SITE_NAV.map((link) => (
            <Link key={link.href} href={link.href} className="hidden hover:opacity-70 lg:inline">
              {link.label}
            </Link>
          ))}
          {actions}
          <Link href={START_FREE_HREF} className="rounded-full border border-white px-4 py-2 transition hover:bg-white hover:text-black">
            Start free
          </Link>
        </nav>
      </header>
      <div className="pointer-events-none fixed bottom-6 left-5 z-[60] font-mono text-[11px] uppercase tracking-[0.25em] text-[var(--sf-dim)] mix-blend-difference sm:left-10">
        <Readout read={readChapter} initial={initialChapter} />
      </div>
    </>
  );
}
