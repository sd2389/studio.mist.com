/*
 * A job's progress as its heartbeats report it (ADR 0005: `progress` 0 to 1 and a `stage`), from
 * what is done: the share of its images or frames the page has rendered (as the page reports it)
 * and the share the worker has encoded (a turntable's frames ffmpeg has encoded, a spin's files
 * in its ZIP). Uploading fills the rest of the bar; `complete` sets it to 1.
 */

/** Where the bar stands while the outputs upload. */
export const UPLOADING_AT = 0.95;

/**
 * The share of the bar rendering and encoding fill, by kind. A turntable's frames go into ffmpeg
 * as they are rendered, so the two fill it together; a spin's ZIP is written after its frames, in
 * seconds; stills and angle sets go up as the page encoded them.
 */
const SHARES = {
  still: { rendering: 0.95, encoding: 0 },
  angle_set: { rendering: 0.95, encoding: 0 },
  turntable: { rendering: 0.475, encoding: 0.475 },
  spin: { rendering: 0.9, encoding: 0.05 },
};

const share = (value) => Math.min(Math.max(Number(value) || 0, 0), 1);

/**
 * @param {string} kind The job's kind.
 * @param {{ stage: "loading" | "rendering" | "encoding" | "uploading", rendered?: number, encoded?: number }} done
 *   `rendered` and `encoded` are shares, 0 to 1.
 * @returns {{ progress: number, stage: string }} What a heartbeat sends.
 */
export function jobProgress(kind, { stage, rendered = 0, encoded = 0 }) {
  if (stage === "uploading") return { progress: UPLOADING_AT, stage };
  const shares = SHARES[kind] ?? SHARES.still;
  const progress = shares.rendering * share(rendered) + shares.encoding * share(encoded);
  return { progress: Math.round(progress * 1000) / 1000, stage };
}
