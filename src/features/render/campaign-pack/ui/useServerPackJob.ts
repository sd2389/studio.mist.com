"use client";

import { liveViewCamera } from "../../lib/live-view-camera";
import { campaignPackJobRequest, campaignPackJobSpec } from "../../lib/render-job-requests";
import type { RenderJobRequest } from "../../lib/render-jobs-api";
import { useExportScene } from "../../ui/export-scene";
import { useRenderJobQuote } from "../../ui/useRenderJobQuote";
import { useStartedRenderJobs } from "../../ui/useStartedRenderJobs";
import type { CampaignPackConfig } from "../domain/types";

type ServerPackInput = {
  /** A pack may be asked for: server exports are on, the plan has packs and the settings make something. */
  active: boolean;
  /** The config as the dialog resolved it. */
  config: CampaignPackConfig;
  /** The pack's root folder, which names its ZIP as the studio's pack names it. */
  rootName: string;
  hasTracedGems: boolean;
};

/**
 * A Campaign Pack rendered on the server (ADR 0005, D2): the job the dialog's settings ask for,
 * of the saved scene in the studio's look, what it would cost, and the jobs started from here. A
 * job renders on whether or not the dialog stays open; it is in the Exports panel either way.
 */
export function useServerPackJob({ active, config, rootName, hasTracedGems }: ServerPackInput) {
  const exportScene = useExportScene();
  const started = useStartedRenderJobs();

  /** Built for the price as the dialog draws and again for the click, with the camera as it is then. */
  const request = (): RenderJobRequest | null => {
    if (!active || !exportScene) return null;
    const live = liveViewCamera();
    const view = live && "view" in live ? live.view : null;
    const spec = campaignPackJobSpec(config, { hasTracedGems, view });
    return campaignPackJobRequest(spec, { sceneId: exportScene.sceneId, look: exportScene.look(), name: rootName });
  };
  const quote = useRenderJobQuote(request());

  return {
    /** Packs render from a saved scene; pages without one (a catalogue piece, the demo) can't start one. */
    hasScene: exportScene !== null,
    quote,
    jobs: started.jobs,
    starting: started.starting,
    error: started.error,
    start() {
      const next = request();
      if (next) void started.startJob(next);
    },
    add: started.add,
    clear: started.clear,
  };
}
