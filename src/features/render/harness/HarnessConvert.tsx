"use client";

import { useEffect } from "react";
import { convertDesign, type ConvertedDesign, type DesignFiles } from "./convert-design";
import {
  companionInput,
  CONVERT_OUTPUTS,
  ConvertFailure,
  readConvertJob,
  SOURCE_INPUT,
  type ConvertFailureResult,
  type ConvertFile,
  type ConvertResult,
  type ConvertSpec,
} from "./convert-job";
import { probeRenderer } from "./renderer-info";
import { createSinkClient, type SinkClient } from "./sink-client";

/** Strict Mode runs a mount's effect twice in development; a page converts its job once. */
let converting = false;

function failureOf(error: unknown): ConvertFailureResult["failure"] {
  if (error instanceof ConvertFailure) return { code: error.code, message: error.message };
  const message = error instanceof Error ? error.message : String(error);
  // A hand-off the shared readers refuse (its sink).
  return { code: message.startsWith("invalid render job") ? "invalid_spec" : "unknown", message };
}

function reportFailure(error: unknown) {
  const failure = failureOf(error);
  const result: ConvertFailureResult = { failure };
  window.__RENDER_RESULT__ = result;
  window.__HARNESS_STATE__ = `error:${failure.message}`;
}

/** The design's files from the sink, each a File of the name it was dropped with. */
async function fetchDesignFiles(sink: SinkClient, spec: ConvertSpec): Promise<DesignFiles> {
  const fetchFile = async (path: string, { filename }: ConvertFile) => new File([await sink.fetchInput(path)], filename);
  return {
    source: await fetchFile(SOURCE_INPUT, spec.source),
    companions: await Promise.all(spec.companions.map((companion, index) => fetchFile(companionInput(index), companion))),
  };
}

/** Posts the design's files to the sink, conversion.json last, and lists them. */
async function postDesign(sink: SinkClient, design: ConvertedDesign): Promise<ConvertResult["outputs"]> {
  const report = new Blob([JSON.stringify(design.report)], { type: "application/json" });
  const files: [string, Blob][] = [[CONVERT_OUTPUTS.model, design.glb]];
  if (design.thumbnail) files.push([CONVERT_OUTPUTS.thumbnail, design.thumbnail]);
  files.push([CONVERT_OUTPUTS.report, report]);
  for (const [name, file] of files) await sink.postFile(name, file);
  return files.map(([name, file]) => ({ name, content_type: file.type }));
}

async function convertJob(): Promise<void> {
  const job = readConvertJob(window.__RENDER_JOB__);
  const sink = createSinkClient(job.sink);
  await sink.postProgress(0, "loading");
  const files = await fetchDesignFiles(sink, job.payload.spec);
  const design = await convertDesign(files, job.payload.spec, (progress) => sink.postProgress(progress, "rendering"));
  const outputs = await postDesign(sink, design);
  await sink.postProgress(1, "rendering");
  const result: ConvertResult = { renderer: await probeRenderer(), outputs };
  window.__RENDER_RESULT__ = result;
  window.__HARNESS_STATE__ = "done";
}

/**
 * The render harness's convert mode (ADR 0006, "Conversion jobs"): converts the design of the
 * `convert` job the worker put in `window.__RENDER_JOB__`, its files read from the sink, and hands
 * the sink model.glb, thumbnail.webp and conversion.json. The page reports through
 * `window.__HARNESS_STATE__` and `window.__RENDER_RESULT__`; a design that can't be converted
 * reports why in `failure`.
 */
export function HarnessConvert() {
  useEffect(() => {
    if (converting) return;
    converting = true;
    window.__HARNESS_STATE__ = "loading";
    convertJob().catch(reportFailure);
  }, []);
  return null;
}
