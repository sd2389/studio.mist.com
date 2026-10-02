"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * True while the element is on screen or within `margin` of it. Catalogue tiles keep a GPU
 * canvas only while near the viewport, so a page of them stays light at any length.
 */
export function useNearViewport(ref: RefObject<HTMLElement | null>, margin = "240px"): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setNear(entry?.isIntersecting ?? false), { rootMargin: margin });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, margin]);
  return near;
}
