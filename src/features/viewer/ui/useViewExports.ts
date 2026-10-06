"use client";

import { useState } from "react";
import {
  liveViewCamera,
  quickStillSpec,
  setThumbnailFromView,
  stillJobRequest,
  useExportScene,
  useStartedRenderJobs,
} from "@/features/render";
import { getHiresRefs } from "@/stores/hires-export-store";

/** What server exports and thumbnails need and pages without a saved scene don't have. */
const NO_SAVED_SCENE = "Open one of your saved pieces in the studio to export it.";

/**
 * Export & share's actions while server exports are on (ADR 0005), each of the view as it is
 * when clicked: "Quick still", which Download PNG becomes, and "Set as thumbnail", which Capture
 * still becomes. Their outcome goes to `report`, the panel's status line.
 */
export function useViewExports(modelId: string, report: (status: string | null) => void) {
  const exportScene = useExportScene();
  const quickStills = useStartedRenderJobs();
  const [settingThumbnail, setSettingThumbnail] = useState(false);

  /** The view as the scene's thumbnail: at most 1024 px on its longest side, free and unmarked. */
  async function setThumbnail() {
    if (!exportScene) return report(NO_SAVED_SCENE);
    setSettingThumbnail(true);
    report(null);
    try {
      report((await setThumbnailFromView(exportScene.sceneId)) ? "Thumbnail updated" : "Canvas not ready");
    } catch (error) {
      report(error instanceof Error ? error.message : "Thumbnail update failed");
    } finally {
      setSettingThumbnail(false);
    }
  }

  /**
   * A still job of the view at the viewport's aspect ratio and 2048 px on its longest side, for 1
   * credit; the scene's Exports follow it and download it once it is ready.
   */
  async function quickStill() {
    const viewport = getHiresRefs()?.gl.domElement;
    const camera = liveViewCamera();
    if (!exportScene) return report(NO_SAVED_SCENE);
    if (!viewport || !camera) return report("Canvas not ready");
    report(null);
    const spec = quickStillSpec(viewport, camera);
    await quickStills.startJob(
      stillJobRequest(spec, { sceneId: exportScene.sceneId, look: exportScene.look(), name: `${modelId}-render` }),
    );
  }

  return { exportScene, quickStills, settingThumbnail, setThumbnail, quickStill };
}
