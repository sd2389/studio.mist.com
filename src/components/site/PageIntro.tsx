import type { ReactNode } from "react";
import { headingDisplay, kicker as kickerStyle, statLabel, statValue } from "./site-styles";

type PageIntroProps = {
  /** The mono label above the title ("02 · Mesh" in the film). */
  kicker: string;
  /** The title; a second line is set in italic, as the film sets its chapter titles. */
  title: string;
  titleItalic?: string;
  lead?: ReactNode;
  /** Actions or facts under the lead. */
  children?: ReactNode;
  className?: string;
};

/** A page's opening in the home film's voice: kicker, two-line display title, lead. */
export function PageIntro({ kicker, title, titleItalic, lead, children, className }: PageIntroProps) {
  return (
    <div className={`site-rise ${className ?? ""}`}>
      <p className={kickerStyle}>{kicker}</p>
      <h1 className={`${headingDisplay} mt-6`}>
        {title}
        {titleItalic ? (
          <>
            <br />
            <span className="italic">{titleItalic}</span>
          </>
        ) : null}
      </h1>
      {lead ? <p className="mt-7 max-w-[56ch] text-[16px] leading-relaxed text-dim sm:text-[17px]">{lead}</p> : null}
      {children ? <div className="mt-9">{children}</div> : null}
    </div>
  );
}

/** A mono readout: a faint label over a hologram-blue value. */
export function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="block">
      <span className={statLabel}>{label}</span>
      <span className={statValue}>{children}</span>
    </span>
  );
}

export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={`${kickerStyle} ${className ?? ""}`}>{children}</p>;
}
