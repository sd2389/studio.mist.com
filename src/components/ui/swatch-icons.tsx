import { useId } from "react";

/**
 * Swatch icons that say what they are: a stone reads as a cut gem (a round brilliant's facet
 * diagram, face-up, in the stone's colour), an opaque gem as a cabochon, and a metal as a
 * band in that metal. Plain
 * coloured dots made white gold, platinum and silver — or diamond and moissanite —
 * indistinguishable.
 */

type Point = [number, number];

const C = 20;

/** Per-instance gradient id: the same swatch appears in several pickers, and ids must not collide. */
function useGradientId(prefix: string): string {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}
const GIRDLE_R = 17;

function polar(radius: number, deg: number): Point {
  const a = (deg - 90) * (Math.PI / 180);
  return [C + radius * Math.cos(a), C + radius * Math.sin(a)];
}

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace("#", "").slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** `hex` moved `t` (0..1) of the way toward `target`. */
function mix(hex: string, target: string, t: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(target);
  const c = a.map((v, i) => Math.round(v + (b[i]! - v) * t));
  return `rgb(${c[0]} ${c[1]} ${c[2]})`;
}

function isLight(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 170;
}

// Fixed precision: the server and the browser must print identical path data.
const xy = ([x, y]: Point) => `${x.toFixed(2)} ${y.toFixed(2)}`;
const path = (points: Point[]) => `M${points.map(xy).join("L")}Z`;

// Face-up round brilliant: table corners between the mains, star tips on them.
const TABLE = Array.from({ length: 8 }, (_, k) => polar(7.2, 22.5 + k * 45));
const STAR_TIPS = Array.from({ length: 8 }, (_, k) => polar(12, 45 + k * 45));
const FACET_LINES = [
  ...TABLE.map((t, k) => path([t, STAR_TIPS[k]!, TABLE[(k + 1) % 8]!]).slice(0, -1)),
  ...TABLE.map((t, k) => `M${xy(t)}L${xy(polar(GIRDLE_R, 22.5 + k * 45))}`),
  ...STAR_TIPS.map((s, k) => `M${xy(s)}L${xy(polar(GIRDLE_R, 45 + k * 45))}`),
].join("");
const WEDGES = Array.from({ length: 16 }, (_, k) => path([[C, C], polar(GIRDLE_R, k * 22.5), polar(GIRDLE_R, (k + 1) * 22.5)]));

export function GemIcon({ color }: { color: string }) {
  const light = isLight(color);
  const body = useGradientId("gem-body");
  return (
    <svg viewBox="0 0 40 40" className="size-10" aria-hidden>
      <defs>
        <radialGradient id={body} cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor={mix(color, "#ffffff", 0.7)} />
          <stop offset="45%" stopColor={mix(color, "#ffffff", light ? 0.15 : 0.05)} />
          <stop offset="100%" stopColor={mix(color, "#000000", light ? 0.18 : 0.35)} />
        </radialGradient>
      </defs>
      <circle cx={C} cy={C} r={GIRDLE_R} fill={`url(#${body})`} />
      {WEDGES.map((d, k) => (
        <path key={k} d={d} fill={k % 2 ? "#000000" : "#ffffff"} opacity={k % 2 ? 0.07 : 0.16} />
      ))}
      <path d={path(TABLE)} fill="#ffffff" opacity={light ? 0.35 : 0.2} />
      <path
        d={FACET_LINES}
        fill="none"
        stroke={light ? "rgb(40 52 72 / 0.32)" : "rgb(255 255 255 / 0.5)"}
        strokeWidth={0.6}
        strokeLinejoin="round"
      />
      <path d={path(TABLE)} fill="none" stroke={light ? "rgb(40 52 72 / 0.4)" : "rgb(255 255 255 / 0.6)"} strokeWidth={0.7} />
      <circle cx={C} cy={C} r={GIRDLE_R} fill="none" stroke={mix(color, "#000000", light ? 0.35 : 0.5)} strokeWidth={0.9} />
      <path d="M12.5 13.5l1.3-3.1 1.3 3.1 3.1 1.3-3.1 1.3-1.3 3.1-1.3-3.1-3.1-1.3z" fill="#ffffff" opacity={0.85} />
    </svg>
  );
}

export function MetalIcon({ color }: { color: string }) {
  const sheen = useGradientId("metal-sheen");
  return (
    <svg viewBox="0 0 40 40" className="size-10" aria-hidden>
      <defs>
        <linearGradient id={sheen} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={mix(color, "#ffffff", 0.65)} />
          <stop offset="32%" stopColor={color} />
          <stop offset="52%" stopColor={mix(color, "#000000", 0.28)} />
          <stop offset="70%" stopColor={color} />
          <stop offset="100%" stopColor={mix(color, "#ffffff", 0.45)} />
        </linearGradient>
      </defs>
      {/* A band seen face-on: the shank's polished outer face and its comfort-fit inner edge. */}
      <path
        d="M20 4.5a15.5 15.5 0 1 1 0 31a15.5 15.5 0 1 1 0-31ZM20 10.5a9.5 9.5 0 1 0 0 19a9.5 9.5 0 1 0 0-19Z"
        fill={`url(#${sheen})`}
        fillRule="evenodd"
        stroke={mix(color, "#000000", 0.35)}
        strokeWidth={0.8}
      />
      <circle cx={C} cy={C} r={10.6} fill="none" stroke={mix(color, "#000000", 0.18)} strokeWidth={1.4} opacity={0.6} />
      <path d="M9.2 13.2a12.5 12.5 0 0 1 7.6-6.8" fill="none" stroke="#ffffff" strokeWidth={1.6} strokeLinecap="round" opacity={0.8} />
    </svg>
  );
}

/** Pearl, opal, jade: a polished dome, since a facet diagram would misdescribe them. */
export function CabochonIcon({ color }: { color: string }) {
  const body = useGradientId("cabochon");
  return (
    <svg viewBox="0 0 40 40" className="size-10" aria-hidden>
      <defs>
        <radialGradient id={body} cx="36%" cy="30%" r="78%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="28%" stopColor={mix(color, "#ffffff", 0.35)} />
          <stop offset="75%" stopColor={color} />
          <stop offset="100%" stopColor={mix(color, "#000000", 0.3)} />
        </radialGradient>
      </defs>
      <circle cx={C} cy={C} r={GIRDLE_R} fill={`url(#${body})`} stroke={mix(color, "#000000", 0.3)} strokeWidth={0.8} />
    </svg>
  );
}
