"use client";

import { useEffect, useState } from "react";
import { lookTemplateFromScene, type LookTemplate } from "@/lib/api/ingest";
import { registerLookMaterials } from "@/lib/catalog/look-materials";
import { useCatalogParamsStore } from "@/stores/catalog-params-store";
import { withTemplateFirst } from "../domain/look-templates";

/** How many catalogue materials the swatches can draw, so they draw again once the templates' are in. */
const catalogueMaterialCount = (state: ReturnType<typeof useCatalogParamsStore.getState>) =>
  Object.keys(state.metals).length + Object.keys(state.gems).length;

/**
 * The bulk upload's look: the studio's default (null) or one of the user's look templates, the
 * latest first, and making one of a scene's look ("Use the look of…"), which selects it. The API
 * makes and checks every template; the page only picks one.
 */
export function useLookTemplates(initial: LookTemplate[]) {
  const [templates, setTemplates] = useState(initial);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [making, setMaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The stores are the browser's: on the server they would be shared between requests.
  useEffect(() => {
    for (const template of templates) registerLookMaterials(template.look);
  }, [templates]);
  useCatalogParamsStore(catalogueMaterialCount);

  /** Makes (or brings up to date) the template of a scene's look and selects it; false when the API refused. */
  async function makeFromScene(sceneId: number): Promise<boolean> {
    setMaking(true);
    setError(null);
    try {
      const made = await lookTemplateFromScene(sceneId);
      setTemplates((current) => withTemplateFirst(current, made));
      setSelectedId(made.id);
      return true;
    } catch (failure) {
      setError(failure instanceof Error && failure.message ? failure.message : "That scene's look couldn't be made a template");
      return false;
    } finally {
      setMaking(false);
    }
  }

  return { templates, selectedId, select: setSelectedId, making, error, makeFromScene };
}

export type LookTemplates = ReturnType<typeof useLookTemplates>;
