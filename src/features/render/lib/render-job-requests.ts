import type { RenderJob, RenderJobRequest } from "./render-jobs-api";

/** Kinds whose `frames` the API counts itself; a video's or a spin's is the request's own setting. */
const IMAGE_JOB_KINDS: ReadonlySet<string> = new Set(["still", "angle_set"]);

/** What the API adds to a spec when it takes a job: the file names (`outputs` before A2), an image job's count. */
function addedSpecFields(kind: string): string[] {
  const names = ["output_names", "outputs"];
  return IMAGE_JOB_KINDS.has(kind) ? [...names, "frames"] : names;
}

/**
 * The request that makes `job` again (its Retry): the kind, scene, saved variant, kept look and
 * file stem it was asked for, and its spec less what the API added when it took it. Null for a
 * job of no scene, which the studio can't ask for.
 */
export function jobRetryRequest(job: RenderJob): RenderJobRequest | null {
  if (job.scene_id === null) return null;
  const added = addedSpecFields(job.kind);
  const spec = Object.fromEntries(Object.entries(job.spec).filter(([field]) => !added.includes(field)));
  // The API checks the kind and spec, as it did the first time.
  return {
    kind: job.kind,
    scene_id: job.scene_id,
    variant_id: job.variant_id,
    look: job.look,
    name: job.name,
    spec,
  } as RenderJobRequest;
}
