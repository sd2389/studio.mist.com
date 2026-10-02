"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Lets a block rise into place the first time it scrolls into view, as the home film's
 * staged lines do. Server HTML carries no hidden state, and blocks already on screen at
 * load stay put — only the ones below the fold wait for the scroll.
 */
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || element.getBoundingClientRect().top < innerHeight * 0.9) return;
    element.dataset.shown = "false";
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        element.dataset.shown = "true";
        observer.disconnect();
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className={`site-reveal ${className ?? ""}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}
