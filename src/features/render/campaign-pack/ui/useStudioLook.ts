"use client";

import { useEffect, useReducer } from "react";
import { readStudioLook, type StudioLook } from "../engine/studio-look";

const NO_STUDIO_LOOK: StudioLook = { backdrop: null, hasStudioSet: false, hasTracedGems: false };

/** How often the stage is read again while the dialog waits on it. */
const READ_EVERY_MS = 500;

/**
 * What the studio shows while the dialog is open: read as the dialog draws, and read again every
 * half second while `watching`, drawing the dialog again when it has changed. The dialog can open
 * before the stage has loaded the piece, and the piece's traced gems decide whether a pack has an
 * ASET image: a look read once at opening would leave that image out of the pack the user pays for.
 */
export function useStudioLook(open: boolean, watching: boolean): StudioLook {
  const [, redraw] = useReducer((count: number) => count + 1, 0);
  const look = open ? readStudioLook() : NO_STUDIO_LOOK;
  const drawn = JSON.stringify(look);

  useEffect(() => {
    if (!open || !watching) return;
    const timer = window.setInterval(() => {
      if (JSON.stringify(readStudioLook()) !== drawn) redraw();
    }, READ_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [open, watching, drawn]);

  return look;
}
