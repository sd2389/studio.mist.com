import { getCadCut, type CadCutId, type PresetId } from "@/lib/jewelry-cad";

/**
 * Line glyphs for the configurator. Cut icons are drawn from the same girdle outlines the
 * CAD kernel cuts, so the icon is exactly the stone you get.
 */

const STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 1.2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function outlinePath(cut: CadCutId, scale: number): string {
  const def = getCadCut(cut);
  const w = 1 / def.ratio;
  const pts = def.outline(1, w).points;
  // Length axis up the icon (north–south, as the stone sits on a ring).
  return `${pts.map((p, i) => `${i === 0 ? "M" : "L"}${(24 + p.z * scale * 36).toFixed(2)} ${(24 - p.x * scale * 36).toFixed(2)}`).join(" ")}Z`;
}

const CUT_PATHS = new Map<CadCutId, { girdle: string; table: string }>();

export function CutGlyph({ cut, className }: { cut: CadCutId; className?: string }) {
  let paths = CUT_PATHS.get(cut);
  if (!paths) {
    paths = { girdle: outlinePath(cut, 1), table: outlinePath(cut, 0.56) };
    CUT_PATHS.set(cut, paths);
  }
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path d={paths.girdle} {...STROKE} />
      <path d={paths.table} {...STROKE} strokeOpacity={0.45} />
    </svg>
  );
}

function Diamond({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return <path d={`M${x - 5 * s} ${y}l${2.2 * s} ${-3 * s}h${5.6 * s}l${2.2 * s} ${3 * s}l${-5 * s} ${6 * s}z M${x - 5 * s} ${y}h${10 * s}`} {...STROKE} />;
}

export function StyleGlyph({ style, className }: { style: PresetId; className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      {style === "studs" ? (
        <>
          <Diamond x={15} y={20} s={0.9} />
          <Diamond x={33} y={20} s={0.9} />
          <path d="M15 26v10M33 26v10" {...STROKE} strokeOpacity={0.55} />
        </>
      ) : style === "pendant" ? (
        <>
          <path d="M8 6c4 10 10 16 16 16s12-6 16-16" {...STROKE} strokeOpacity={0.5} />
          <circle cx={24} cy={24.5} r={2} {...STROKE} />
          <circle cx={24} cy={33} r={7} {...STROKE} strokeOpacity={0.5} />
          <Diamond x={24} y={32} s={0.75} />
        </>
      ) : (
        <RingGlyph style={style} />
      )}
    </svg>
  );
}

function RingGlyph({ style }: { style: PresetId }) {
  const band = style === "band" ? 3.2 : 1.6;
  const dots = style === "eternity" ? 12 : style === "pave" ? 6 : 0;
  return (
    <>
      <ellipse cx={24} cy={30} rx={12} ry={12} {...STROKE} strokeWidth={band} strokeOpacity={style === "band" ? 0.9 : 0.75} />
      {Array.from({ length: dots }, (_, i) => {
        const a = style === "eternity" ? (i / dots) * Math.PI * 2 : -Math.PI / 2 + (i < 3 ? -1 : 1) * (0.55 + (i % 3) * 0.32);
        // Rounded: server and browser trig differ in the last digit, which breaks hydration.
        const cx = Math.round((24 + Math.cos(a) * 12) * 100) / 100;
        const cy = Math.round((30 + Math.sin(a) * 12) * 100) / 100;
        return <circle key={i} cx={cx} cy={cy} r={1.25} fill="currentColor" />;
      })}
      {style === "solitaire" || style === "pave" ? <Diamond x={24} y={13} /> : null}
      {style === "halo" ? (
        <>
          <circle cx={24} cy={14} r={7.5} {...STROKE} strokeOpacity={0.45} strokeDasharray="1.6 1.4" />
          <Diamond x={24} y={13} s={0.8} />
        </>
      ) : null}
      {style === "three-stone" ? (
        <>
          <Diamond x={24} y={12} s={0.85} />
          <Diamond x={14.5} y={15} s={0.55} />
          <Diamond x={33.5} y={15} s={0.55} />
        </>
      ) : null}
      {style === "bezel" ? (
        <>
          <rect x={17} y={8} width={14} height={10} rx={2.5} {...STROKE} />
          <rect x={20} y={10.5} width={8} height={5} rx={1} {...STROKE} strokeOpacity={0.45} />
        </>
      ) : null}
    </>
  );
}
