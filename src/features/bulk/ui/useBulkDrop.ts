"use client";

import { useMemo, useState } from "react";
import { DEFAULT_JEWELRY_CATEGORY } from "@/lib/upload/categories";
import { withoutSharedFolder, type DroppedFile } from "@/lib/upload/dropped-files";
import { planDesigns } from "../domain/design-checks";
import { extensionOf, groupDesignFiles, mergeDrops, uploadedFilesOf, type DesignFiles } from "../domain/design-files";
import { parseManifest } from "../domain/manifest";
import { expandZips } from "../lib/expand-zips";

export type DroppedManifest = { name: string; text: string };

/**
 * What a bulk upload holds before it is made: the files dropped so far (ZIPs expanded, the first
 * drop's shared folder left off), the CSV manifest, the designs they make and every problem
 * with them, checked as the API will check them.
 */
export function useBulkDrop(maxFileBytes: number | null) {
  const [files, setFiles] = useState<DroppedFile[]>([]);
  const [manifest, setManifest] = useState<DroppedManifest | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [defaultCategory, setDefaultCategory] = useState<string>(DEFAULT_JEWELRY_CATEGORY);

  const grouped = useMemo(() => groupDesignFiles(files), [files]);
  const parsedManifest = useMemo(() => (manifest ? parseManifest(manifest.text) : null), [manifest]);
  const plan = useMemo(
    () => planDesigns(grouped.designs, parsedManifest, defaultCategory, maxFileBytes),
    [grouped.designs, parsedManifest, defaultCategory, maxFileBytes],
  );

  async function readManifest(file: File) {
    setManifest({ name: file.name, text: await file.text() });
  }

  /** Adds a drop: its ZIPs opened, its CSV taken as the manifest, its files beside those dropped already. */
  async function addFiles(dropped: DroppedFile[]) {
    setReading(true);
    try {
      const expanded = await expandZips(dropped);
      const csvs = expanded.files.filter(({ path }) => extensionOf(path) === "csv");
      const others = expanded.files.filter(({ path }) => extensionOf(path) !== "csv");
      const dropNotes = expanded.failures.map(({ message }) => message);
      if (csvs.length > 0) {
        const chosen = csvs[csvs.length - 1];
        if (csvs.length > 1) dropNotes.push(`${csvs.length} CSV files were dropped; ${chosen.path} is the manifest.`);
        await readManifest(chosen.file);
      }
      setNotes(dropNotes);
      // A first drop's paths start inside its folder, as a CSV beside its files names them.
      setFiles((current) => mergeDrops(current, current.length === 0 ? withoutSharedFolder(others) : others));
    } finally {
      setReading(false);
    }
  }

  /** Leaves designs out, with their companions and textures. */
  function removeDesigns(designs: DesignFiles[]) {
    const leaving = new Set(designs.flatMap((design) => [...uploadedFilesOf(design), ...design.textures]));
    setFiles((current) => current.filter((dropped) => !leaving.has(dropped)));
  }

  function reset() {
    setFiles([]);
    setManifest(null);
    setNotes([]);
  }

  return {
    grouped,
    manifest,
    parsedManifest,
    plan,
    notes,
    reading,
    defaultCategory,
    setDefaultCategory,
    addFiles,
    readManifest,
    clearManifest: () => setManifest(null),
    removeDesigns,
    reset,
  };
}

export type BulkDrop = ReturnType<typeof useBulkDrop>;
