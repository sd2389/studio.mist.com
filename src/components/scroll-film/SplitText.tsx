import type { CSSProperties } from "react";

/**
 * Letters as spans carrying their index (`--i`), so CSS can stagger them. Assistive tech reads
 * the plain text once; the animated letters are hidden from it.
 */
export function SplitText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {[...text].map((char, i) => (
          <span key={i} className="sf-char" style={{ "--i": i } as CSSProperties}>
            <span className="sf-char-in">{char}</span>
          </span>
        ))}
      </span>
    </span>
  );
}
