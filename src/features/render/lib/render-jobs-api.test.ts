import { afterEach, describe, expect, it, vi } from "vitest";
import { createRenderJob, createRenderJobs, onRenderJobsCreated, type RenderJobRequest } from "./render-jobs-api";

const REQUEST: RenderJobRequest = {
  kind: "still",
  scene_id: 812,
  name: "ring",
  spec: { camera: { pose: "pose-default" }, width: 2048, height: 2048 },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("onRenderJobsCreated", () => {
  // The Exports panel reads its list again then, so a dialog's job shows there once the dialog closes.
  it("tells a listener each time this page creates jobs, until it stops listening", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      Response.json(String(input).endsWith("/bulk") ? { jobs: [{ id: 2 }, { id: 3 }] } : { id: 1 }, { status: 201 }),
    );
    const heard = vi.fn();
    const stop = onRenderJobsCreated(heard);

    await createRenderJob(REQUEST);
    await createRenderJobs([REQUEST, REQUEST]);
    stop();
    await createRenderJob(REQUEST);

    expect(heard).toHaveBeenCalledTimes(2);
  });

  it("says nothing of jobs the API refused", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ detail: "Not enough render credits." }, { status: 402 }));
    const heard = vi.fn();
    const stop = onRenderJobsCreated(heard);

    await expect(createRenderJob(REQUEST)).rejects.toThrow();
    stop();

    expect(heard).not.toHaveBeenCalled();
  });
});
