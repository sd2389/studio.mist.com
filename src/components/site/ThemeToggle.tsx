"use client";

import { Moon, Sun } from "lucide-react";
import { setFilmTheme, useFilmTheme } from "@/components/scroll-film/film-theme";
import { cn } from "@/lib/utils";

/**
 * Switches the whole site between its light and dark looks. Until the theme is known on
 * the client it keeps its place in the header without an icon (the page itself is already
 * in the right look, set before first paint).
 */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useFilmTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => setFilmTheme(next)}
      disabled={!theme}
      aria-label={theme ? `Switch to ${next} mode` : "Theme"}
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-full border border-hairline-strong text-foreground transition-colors duration-300 hover:bg-foreground hover:text-background focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-holo",
        className,
      )}
    >
      {theme === "dark" ? <Sun size={15} strokeWidth={1.6} /> : theme === "light" ? <Moon size={15} strokeWidth={1.6} /> : null}
    </button>
  );
}
