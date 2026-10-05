/**
 * What the render harness page (`src/app/render-harness/page.worker.tsx`) shares on `window`
 * with the process driving it: the golden scripts (`scripts/golden/`) and the render worker.
 */
interface Window {
  /** "loading", then "ready" (golden, probe), "done" (export), "exported" (fixture) or "error:<message>". */
  __HARNESS_STATE__?: string;
  /** The export mode's job (`HarnessJob`), set by the worker with an init script; never in the URL. */
  __RENDER_JOB__?: unknown;
  /** What the probe and export modes report once they finish (`HarnessResult`). */
  __RENDER_RESULT__?: unknown;
}
