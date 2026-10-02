"use client";

import { useSyncExternalStore } from "react";
import { FILM_THEME_STORAGE_KEY, LIGHT_ONLY_PATHS } from "./film-theme-script";

/**
 * A film's light or dark look: the visitor's choice when they made one (kept in this
 * browser when storage allows), otherwise their system setting — for the whole site. It
 * is unknown (`null`) while the server renders and the page hydrates; CSS never waits on
 * it, because `FILM_THEME_SCRIPT` has already set `<html>` before first paint.
 */
export type FilmTheme = "dark" | "light";

const listeners = new Set<() => void>();
/** This visit's choice, so it holds even where storage is refused. */
let chosen: FilmTheme | null = null;

function stored(): FilmTheme | null {
  try {
    const value = localStorage.getItem(FILM_THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function read(): FilmTheme {
  return chosen ?? stored() ?? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
}

/** The page's look follows the theme: `<html>` carries it for every token (see FILM_THEME_SCRIPT). */
function applyToDocument(theme: FilmTheme) {
  if (LIGHT_ONLY_PATHS.some((path) => location.pathname === path || location.pathname.startsWith(`${path}/`))) return;
  const root = document.documentElement;
  root.setAttribute("data-film-theme", theme);
  root.classList.toggle("dark", theme === "dark");
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const media = matchMedia("(prefers-color-scheme: light)");
  const onSystemChange = () => {
    applyToDocument(read());
    listener();
  };
  media.addEventListener("change", onSystemChange);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", onSystemChange);
  };
}

export function setFilmTheme(theme: FilmTheme): void {
  chosen = theme;
  try {
    localStorage.setItem(FILM_THEME_STORAGE_KEY, theme);
  } catch {
    // Private windows may refuse storage; `chosen` still holds for this visit.
  }
  applyToDocument(theme);
  listeners.forEach((listener) => listener());
}

export function useFilmTheme(): FilmTheme | null {
  return useSyncExternalStore(subscribe, read, () => null);
}
