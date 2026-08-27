"use client";

import { useSyncExternalStore } from "react";

export const SHORT_VIEWPORT_QUERY = "(max-height: 500px)";

export function useShortViewport(): boolean {
  return useSyncExternalStore(subscribeShortViewport, shortViewportSnapshot, shortViewportServerSnapshot);
}

function subscribeShortViewport(onChange: () => void): () => void {
  const media = window.matchMedia(SHORT_VIEWPORT_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function shortViewportSnapshot(): boolean {
  return window.matchMedia(SHORT_VIEWPORT_QUERY).matches;
}

function shortViewportServerSnapshot(): boolean {
  return false;
}
