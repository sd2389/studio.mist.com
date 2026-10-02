"use client";

import { useEffect, useRef } from "react";

/**
 * A ring that trails the pointer and swells over links. Fine pointers only; CSS hides it on
 * touch screens and for reduced motion, and the effect below then has nothing to drive.
 */
export function Cursor() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ring = ref.current;
    if (!ring || getComputedStyle(ring).display === "none") return;
    const target = { x: innerWidth / 2, y: innerHeight / 2 };
    const pos = { ...target };
    let frame = 0;
    const tick = () => {
      pos.x += (target.x - pos.x) * 0.18;
      pos.y += (target.y - pos.y) * 0.18;
      ring.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      frame = requestAnimationFrame(tick);
    };
    const move = (e: PointerEvent) => {
      target.x = e.clientX;
      target.y = e.clientY;
      ring.dataset.active = String(e.target instanceof Element && Boolean(e.target.closest("a, button")));
    };
    addEventListener("pointermove", move, { passive: true });
    frame = requestAnimationFrame(tick);
    return () => {
      removeEventListener("pointermove", move);
      cancelAnimationFrame(frame);
    };
  }, []);

  return <div ref={ref} className="sf-cursor" aria-hidden />;
}
