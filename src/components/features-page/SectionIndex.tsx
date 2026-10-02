"use client";

import { useEffect, useRef } from "react";

/**
 * The chapter list down the side, as the home film's build steps: each entry lights while
 * its section is on screen. Plain anchor links underneath, so it works without scripts.
 */
export function SectionIndex({ sections }: { sections: readonly { id: string; label: string }[] }) {
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const list = ref.current;
    if (!list) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          list.querySelectorAll<HTMLElement>("[data-index]").forEach((item) => {
            item.dataset.active = String(item.dataset.index === entry.target.id);
          });
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    for (const section of sections) {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [sections]);
  return (
    <ol ref={ref} className="grid gap-3 font-mono text-[10px] uppercase tracking-[0.28em]">
      {sections.map((section, k) => (
        <li key={section.id}>
          <a
            href={`#${section.id}`}
            data-index={section.id}
            data-active="false"
            className="group flex items-center gap-3 text-faint transition-colors hover:text-foreground data-[active=true]:text-holo"
          >
            <span className="tabular-nums">{String(k + 1).padStart(2, "0")}</span>
            {section.label}
            <span aria-hidden className="size-1.5 rounded-full border border-current group-data-[active=true]:bg-current" />
          </a>
        </li>
      ))}
    </ol>
  );
}
