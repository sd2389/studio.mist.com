"use client";

import { FileSpreadsheet, X } from "lucide-react";
import { FileDropZone } from "@/components/ui/file-drop-zone";
import type { IngestProblem } from "@/lib/api/ingest";
import { MODEL_FILE_ACCEPT, SUPPORTED_FORMATS_LABEL } from "@/lib/upload/model-files";
import { MANIFEST_COLUMNS } from "../domain/manifest";
import { panelLabel } from "./BatchPlanPanel";
import { ProblemList } from "./ProblemList";
import type { BulkDrop } from "./useBulkDrop";

/** What the bulk drop takes: every model format and companion, ZIPs, and the CSV manifest. */
export const BULK_FILE_ACCEPT = `${MODEL_FILE_ACCEPT},.zip,application/zip,.csv,text/csv`;
/** Files no design takes, listed by name at most this many. */
const LEFT_OUT_SHOWN = 20;

function ManifestControl({ drop, problems, disabled }: { drop: BulkDrop; problems: IngestProblem[]; disabled: boolean }) {
  const rows = drop.parsedManifest?.rows.length ?? 0;
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={panelLabel}>CSV manifest</p>
          {drop.manifest ? (
            <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-foreground">
              <FileSpreadsheet className="size-4 shrink-0" aria-hidden />
              {drop.manifest.name} · {rows} row{rows === 1 ? "" : "s"}
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Optional: a row per design with the columns {MANIFEST_COLUMNS.join(", ")}; only file is required.
              Without one, SKUs and names come from the file names.
            </p>
          )}
        </div>
        {drop.manifest ? (
          <button
            type="button"
            onClick={drop.clearManifest}
            disabled={disabled}
            aria-label="Remove the CSV manifest"
            className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-45"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        ) : (
          <label className="shrink-0">
            <span className="sr-only">Choose a CSV manifest</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              disabled={disabled}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void drop.readManifest(file);
                event.target.value = "";
              }}
            />
            <span className="inline-flex cursor-pointer rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-foreground/30">
              Add CSV
            </span>
          </label>
        )}
      </div>
      <ProblemList problems={problems} className="mt-2" />
    </div>
  );
}

type BulkDropPanelProps = {
  drop: BulkDrop;
  /** Problems with the manifest's rows that no design is named for. */
  manifestProblems: IngestProblem[];
  /** Once the batch is made, nothing more is dropped. */
  disabled: boolean;
};

/** Where a bulk upload's files and CSV come in, with what was left out of them and why. */
export function BulkDropPanel({ drop, manifestProblems, disabled }: BulkDropPanelProps) {
  const { leftOut } = drop.grouped;
  return (
    <div className="space-y-3">
      <FileDropZone
        title="Drop CAD files, a folder or a ZIP"
        hint={
          <>
            <p>{SUPPORTED_FORMATS_LABEL} · ZIPs open here, in your browser</p>
            <p className="text-[11px] text-muted-foreground/80">
              Bring an OBJ&apos;s .mtl and a glTF&apos;s .bin beside it. A CSV dropped with them is the manifest.
            </p>
          </>
        }
        accept={BULK_FILE_ACCEPT}
        folders
        busy={disabled || drop.reading}
        onFiles={(files) => void drop.addFiles(files)}
      />
      <ManifestControl drop={drop} problems={manifestProblems} disabled={disabled} />
      {drop.notes.length > 0 ? (
        <ul className="space-y-1 text-xs text-destructive" role="alert">
          {drop.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
      {leftOut.length > 0 ? (
        <details className="rounded-xl border border-border/60 bg-card/60 p-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer text-foreground">
            {leftOut.length} file{leftOut.length === 1 ? "" : "s"} left out
          </summary>
          <ul className="mt-2 space-y-1">
            {leftOut.slice(0, LEFT_OUT_SHOWN).map(({ file, reason }) => (
              <li key={file.path} className="truncate" title={file.path}>
                {file.path}: {reason}
              </li>
            ))}
            {leftOut.length > LEFT_OUT_SHOWN ? <li>and {leftOut.length - LEFT_OUT_SHOWN} more</li> : null}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
