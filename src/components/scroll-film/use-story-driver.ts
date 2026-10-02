"use client";

import { useEffect, type RefObject } from "react";
import { chapterProgress, story } from "./story";

type FrameListener = () => void;
const listeners = new Set<FrameListener>();

/** Run `listener` once per frame after the story state updates (chapter labels, counters). */
export function onStoryFrame(listener: FrameListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The film's playhead chases the scroll with a top speed and a limited acceleration, and
 * brakes in time to land on it: a slow scroll scrubs the film frame by frame, a fling still
 * plays every beat (catching up a moment later) instead of skipping them.
 */
/** How tightly the playhead tracks a nearby scroll position, 1/s. */
const FOLLOW = 7.5;
/** Viewports per second: the pace at which a fast scroll plays. */
const MAX_SPEED = 1.3;
/** A playhead this many viewports behind is a jump, not a scroll: it may hurry, up to `JUMP_SPEED`. */
const JUMP_LAG = 2.5;
const JUMP_SPEED = 4;
/** Viewports per second², so full speed builds over about a third of a second. */
const MAX_ACCELERATION = MAX_SPEED * 3;
const STEP = 1 / 120;
const SNAP_ON_LOAD_MS = 1500;

/**
 * Drives the film from the page's native scroll: measures the chapters, advances both clocks
 * (see `story`) and eases the pointer each frame, hands every chapter its progress as `--p`
 * and the root the playhead's speed as `--v`. Also tracks presses: mouse holds set
 * `story.pressed`, and every release (or a tap on touch) counts in `story.releases`.
 */
export function useStoryDriver(root: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const chapters = [...element.querySelectorAll<HTMLElement>("[data-chapter]")];
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const target = { x: 0, y: 0 };
    const written = chapters.map(() => -1);
    let writtenVelocity = 0;

    const measure = () => {
      story.vh = innerHeight;
      story.vw = innerWidth;
      story.sections = chapters.map((c) => ({ top: c.getBoundingClientRect().top + scrollY, height: c.offsetHeight }));
    };
    const onPointer = (e: PointerEvent) => {
      target.x = (e.clientX / innerWidth) * 2 - 1;
      target.y = (e.clientY / innerHeight) * 2 - 1;
    };
    let press: { x: number; y: number; at: number; touch: boolean } | null = null;
    const onDown = (e: PointerEvent) => {
      onPointer(e);
      press = { x: e.clientX, y: e.clientY, at: performance.now(), touch: e.pointerType === "touch" };
      // A touch is usually the start of a scroll, so only mice and pens hold.
      story.pressed = !press.touch;
    };
    const onUp = (e: PointerEvent) => {
      if (!press) return;
      const tap = Math.hypot(e.clientX - press.x, e.clientY - press.y) < 12 && performance.now() - press.at < 350;
      if (!press.touch || tap) story.releases += 1;
      story.pressed = false;
      press = null;
    };
    const onCancel = () => {
      story.pressed = false;
      press = null;
    };

    measure();
    story.y = scrollY;
    story.scroll = scrollY;
    let speed = 0;
    let last = performance.now();
    // The browser may restore a reload's scroll position after this mounts; until the
    // preloader has lifted, the playhead jumps there instead of replaying the film to it.
    const snapUntil = last + SNAP_ON_LOAD_MS;
    let frame = 0;
    const follow = (dt: number) => {
      const maxAcceleration = MAX_ACCELERATION * story.vh;
      for (let left = dt; left > 1e-6; left -= STEP) {
        const h = Math.min(STEP, left);
        const distance = scrollY - story.y;
        const lag = Math.abs(distance) / story.vh;
        const maxSpeed = Math.min(MAX_SPEED * (1 + Math.max(0, lag - JUMP_LAG) * 0.6), JUMP_SPEED) * story.vh;
        // The fastest speed that can still brake to a stop at the scroll position.
        const reach = Math.min(maxSpeed, Math.sqrt(2 * maxAcceleration * Math.abs(distance)), FOLLOW * Math.abs(distance));
        const change = Math.sign(distance) * reach - speed;
        speed += Math.min(Math.max(change, -maxAcceleration * h), maxAcceleration * h);
        story.y += speed * h;
      }
      if (Math.abs(scrollY - story.y) < 0.05 && Math.abs(speed) < 2) {
        story.y = scrollY;
        speed = 0;
      }
    };
    const tick = (now: number) => {
      // Real time up to a quarter second, so slow devices keep the film's pace.
      const dt = Math.min((now - last) / 1000, 0.25);
      last = now;
      if (reduced || now < snapUntil) {
        story.y = scrollY;
        speed = 0;
      } else follow(dt);
      story.scroll = reduced ? scrollY : story.scroll + (scrollY - story.scroll) * (1 - Math.exp(-dt * 14));
      if (Math.abs(scrollY - story.scroll) < 0.05) story.scroll = scrollY;
      // Viewports per second, smoothed: type and stage lean into fast scrolls.
      story.velocity += (speed / story.vh - story.velocity) * (1 - Math.exp(-dt * 6));
      const v = Math.abs(story.velocity) < 0.002 ? 0 : story.velocity;
      if (Math.abs(v - writtenVelocity) > 0.002) {
        writtenVelocity = v;
        element.style.setProperty("--v", v.toFixed(3));
      }
      story.pointer.x += (target.x - story.pointer.x) * (1 - Math.exp(-dt * 5));
      story.pointer.y += (target.y - story.pointer.y) * (1 - Math.exp(-dt * 5));
      chapters.forEach((chapter, i) => {
        const p = chapterProgress(i);
        if (Math.abs(p - written[i]!) > 0.0004) {
          written[i] = p;
          chapter.style.setProperty("--p", p.toFixed(4));
        }
      });
      for (const listener of listeners) listener();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    addEventListener("resize", measure);
    addEventListener("pointermove", onPointer, { passive: true });
    addEventListener("pointerdown", onDown, { passive: true });
    addEventListener("pointerup", onUp, { passive: true });
    addEventListener("pointercancel", onCancel, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      removeEventListener("resize", measure);
      removeEventListener("pointermove", onPointer);
      removeEventListener("pointerdown", onDown);
      removeEventListener("pointerup", onUp);
      removeEventListener("pointercancel", onCancel);
      story.pressed = false;
    };
  }, [root]);
}
