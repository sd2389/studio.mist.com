"use client";

import { useCallback, useState } from "react";
import { inspectModelFromFile } from "@/lib/convert/to-glb";
import type { ModelLoadStatus } from "@/lib/convert/types";
import { captureClientException, logClientEvent } from "@/lib/observability/sentry";
import { groupModelFiles, unsupportedFilesMessage, type ModelFileSet } from "@/lib/upload/model-files";
import { fetchSampleModelFile, type SampleModel } from "@/lib/upload/sample-models";
import { buildParsedUpload, parseErrorMessage, type ParsedUpload } from "@/lib/upload/parsed-upload";

export type ModelIngestCallbacks = {
  onStart: () => void;
  onParsed: (parsed: ParsedUpload) => void;
  onError: (message: string) => void;
};

/** Files, samples and handoffs → a parsed, slot-labelled model (or a user-facing error). */
export function useModelIngest({ onStart, onParsed, onError }: ModelIngestCallbacks) {
  const [parseStatus, setParseStatus] = useState<ModelLoadStatus | null>(null);

  const ingestFileSet = useCallback(
    async ({ primary: file, companions }: ModelFileSet) => {
      onStart();
      setParseStatus(null);
      logClientEvent("upload.parse.start", { filename: file.name, size: file.size, companions: companions.length });
      try {
        const inspected = await inspectModelFromFile(file, { companions, onStatus: setParseStatus });
        const parsed = buildParsedUpload(file, inspected);
        logClientEvent("upload.parse.done", {
          filename: file.name,
          polyCount: parsed.polyCount,
          slotCount: Object.keys(parsed.modelConfig.slotTokens ?? {}).length,
          units: inspected.loaded.units?.source,
        });
        onParsed(parsed);
      } catch (err) {
        captureClientException(err, { stage: "upload.parse", filename: file.name });
        onError(parseErrorMessage(err, file.name));
      } finally {
        setParseStatus(null);
      }
    },
    [onError, onParsed, onStart],
  );

  /** A drop or pick: the first model file plus any MTL / textures / .bin that came with it. */
  const ingestFiles = useCallback(
    async (files: File[]) => {
      const fileSet = groupModelFiles(files);
      if (!fileSet) {
        onError(unsupportedFilesMessage(files));
        return;
      }
      await ingestFileSet(fileSet);
    },
    [ingestFileSet, onError],
  );

  const ingestFile = useCallback((file: File) => ingestFiles([file]), [ingestFiles]);

  const handleSample = useCallback(
    async (sample: SampleModel) => {
      onStart();
      setParseStatus({ message: `Loading the ${sample.label} sample…` });
      let file: File;
      try {
        file = await fetchSampleModelFile(sample);
      } catch (err) {
        // A missing sample (404) is not a crash: say so and keep the drop panel usable.
        setParseStatus(null);
        onError(err instanceof Error ? err.message : "Could not load sample");
        return;
      }
      await ingestFile(file);
    },
    [ingestFile, onError, onStart],
  );

  return { parseStatus, ingestFiles, ingestFile, handleSample };
}
