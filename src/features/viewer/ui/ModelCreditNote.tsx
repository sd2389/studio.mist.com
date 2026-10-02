import type { ModelCredit } from "../domain/model-credit";

const linkClass = "underline decoration-foreground/25 underline-offset-2 hover:text-foreground";

/**
 * A bundled third-party model's licence credit, in the corner of the view clear of the zoom
 * controls, on a chip like theirs so it reads on any backdrop.
 */
export function ModelCreditNote({ credit }: { credit: ModelCredit }) {
  return (
    <p className="pointer-events-auto absolute bottom-4 left-4 z-30 max-w-[calc(100%-13rem)] rounded-full border border-foreground/10 bg-surface px-3 py-1.5 text-[10px] leading-snug text-foreground/65">
      <a href={credit.sourceUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
        {credit.title}
      </a>{" "}
      by {credit.author},{" "}
      <a href={credit.licenceUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
        {credit.licence}
      </a>
    </p>
  );
}
