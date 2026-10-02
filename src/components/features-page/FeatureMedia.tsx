import Image from "next/image";
import { LiveStone } from "@/components/stones/LiveStone";
import type { FeatureMedia as FeatureMediaSpec } from "./feature-sections";

/** The film's viewfinder brackets, framing a feature's picture. */
function Brackets() {
  return (
    <>
      {(["left-3 top-3 border-l border-t", "right-3 top-3 border-r border-t", "bottom-3 left-3 border-b border-l", "bottom-3 right-3 border-b border-r"] as const).map((at) => (
        <span key={at} aria-hidden className={`pointer-events-none absolute z-10 size-4 border-holo/60 ${at}`} />
      ))}
    </>
  );
}

/** A feature's visual: a product render, or a live ray-traced stone, in a hairline frame. */
export function FeatureMedia({ media }: { media: FeatureMediaSpec }) {
  return (
    <figure>
      <div className="relative overflow-hidden rounded-[24px] border border-hairline bg-surface">
        <Brackets />
        {media.kind === "image" ? (
          <Image
            src={media.src}
            alt={media.alt}
            width={media.width}
            height={media.height}
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="h-auto w-full"
          />
        ) : (
          <LiveStone cutId={media.cutId} className="aspect-[4/3]" />
        )}
      </div>
      <figcaption className="mt-3 font-mono text-[10px] uppercase tracking-[0.28em] text-faint">{media.caption}</figcaption>
    </figure>
  );
}
