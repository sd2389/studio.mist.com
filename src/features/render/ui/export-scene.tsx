"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { LookSnapshot } from "@/features/viewer";

/** What a server export renders from the studio: its saved scene, with the look the studio shows. */
export type ExportScene = {
  sceneId: number;
  /** The studio's look as it would save it now (`lookSnapshot`), unsaved edits included. */
  look: () => LookSnapshot;
};

const ExportSceneContext = createContext<ExportScene | null>(null);

/** Gives the studio's export buttons and dialogs the scene they render; null where there is none. */
export function ExportSceneProvider({ value, children }: { value: ExportScene | null; children: ReactNode }) {
  return <ExportSceneContext.Provider value={value}>{children}</ExportSceneContext.Provider>;
}

/**
 * The saved scene server exports render, and its current look; null on pages without one (a
 * catalogue piece, the bundled demo), where no export can render.
 */
export function useExportScene(): ExportScene | null {
  return useContext(ExportSceneContext);
}
