"use client";

import { FILM_THEME_SCRIPT } from "@/components/scroll-film/film-theme-script";

/**
 * The pre-paint theme script, in the server HTML only. The browser runs it while parsing, before
 * first paint; on the client this renders nothing, and React 19 skips the extra tag in <head>
 * during hydration, so React never creates (and warns about) a script element of its own.
 */
export function ThemeScript() {
  if (typeof window !== "undefined") return null;
  return <script dangerouslySetInnerHTML={{ __html: FILM_THEME_SCRIPT }} />;
}
