"use client";

import { useEffect } from "react";
import { useFilmTheme } from "@/components/scroll-film/film-theme";
import { siteLighting } from "@/lib/viewer-lighting";
import { useMaterialPresetStore } from "@/stores/material-preset-store";

/**
 * Catalogue viewers (a loose stone, a gallery piece) start on the set that matches the
 * site's look and follow it when the theme changes — unless the visitor has picked a set
 * of their own, which is left alone.
 */
export function useThemeLighting(): void {
  const theme = useFilmTheme();
  useEffect(() => {
    if (!theme) return;
    const store = useMaterialPresetStore.getState();
    const otherDefault = siteLighting(theme === "dark" ? "light" : "dark");
    if (store.lighting === otherDefault) store.setLighting(siteLighting(theme));
  }, [theme]);
}
