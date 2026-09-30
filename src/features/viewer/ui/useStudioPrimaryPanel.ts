"use client";

import { useState } from "react";
import type { StudioPrimaryPanel } from "@/features/viewer/ui/StudioPrimaryBar";

/** Shared Metal | Gem | Light | Export | More selection for sidebar + mobile sheet. */
export function useStudioPrimaryPanel(initial: StudioPrimaryPanel = "metal") {
  const [panel, setPanel] = useState<StudioPrimaryPanel>(initial);
  return { panel, setPanel };
}
