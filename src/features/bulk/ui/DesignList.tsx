"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ChipField } from "@/components/ui/chip";
import { Progress } from "@/components/ui/progress";
import type { IngestProblem } from "@/lib/api/ingest";
import { formatBytesShort } from "@/lib/admin/format";
import { baseName } from "@/lib/upload/dropped-files";
import type { PlannedDesign } from "../domain/design-checks";
import { designBytes } from "../domain/design-files";
import { ProblemList } from "./ProblemList";
import type { DesignUploadState } from "./useBatchUploads";

type DesignFilter = "all" | "problems" | "failed";

type DesignListProps = {
  designs: PlannedDesign[];
  /** By the design's index in the request. */
  problems: Map<number, IngestProblem[]>;
  /** Each design's upload, by its index, once its batch is made. */
  uploads?: Map<number, DesignUploadState>;
  /** Leaves a design out; only before its batch is made. */
  onRemove?: (design: PlannedDesign) => void;
};

const UPLOAD_LABELS: Record<DesignUploadState["status"], string> = {
  waiting: "Waiting",
  uploading: "Uploading",
  stored: "Stored",
  confirmed: "Uploaded",
  failed: "Failed",
};

function designMeta(design: PlannedDesign): string {
  const parts = [design.sku, design.name, design.category, formatBytesShort(designBytes(design.files))];
  if (design.units !== "auto") parts.push(`in ${design.units}`);
  if (design.row !== null) parts.push(`CSV row ${design.row}`);
  return parts.join(" · ");
}

function companionsNote(design: PlannedDesign): string | null {
  const { companions, textures } = design.files;
  const parts = [];
  if (companions.length > 0) parts.push(`with ${companions.map(({ path }) => baseName(path)).join(", ")}`);
  if (textures.length > 0) {
    parts.push(`${textures.length} texture${textures.length === 1 ? "" : "s"} left behind: conversion replaces every material`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function DesignBadge({ problems, upload }: { problems: number; upload?: DesignUploadState }) {
  if (upload) {
    const percent = upload.total > 0 ? Math.round((upload.sent / upload.total) * 100) : 0;
    const label = upload.status === "uploading" ? `${percent}%` : UPLOAD_LABELS[upload.status];
    const variant = upload.status === "failed" ? "destructive" : upload.status === "confirmed" ? "default" : "secondary";
    return <Badge variant={variant}>{label}</Badge>;
  }
  if (problems > 0) return <Badge variant="destructive">{problems === 1 ? "1 problem" : `${problems} problems`}</Badge>;
  return <Badge variant="outline">Ready</Badge>;
}

function DesignRow({ design, problems, upload, onRemove }: {
  design: PlannedDesign;
  problems: IngestProblem[];
  upload?: DesignUploadState;
  onRemove?: (design: PlannedDesign) => void;
}) {
  const path = design.files.source.path;
  const note = companionsNote(design);
  const percent = upload && upload.total > 0 ? Math.round((upload.sent / upload.total) * 100) : 0;
  return (
    <li className="rounded-xl border border-border/60 bg-card/60 px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-foreground" title={path}>
            {path}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{designMeta(design)}</p>
          {note ? <p className="mt-0.5 text-[11px] text-muted-foreground/80">{note}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <DesignBadge problems={problems.length} upload={upload} />
          {onRemove ? (
            <button
              type="button"
              onClick={() => onRemove(design)}
              aria-label={`Leave out ${path}`}
              className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
      </div>
      {upload?.status === "uploading" ? (
        <Progress value={percent} aria-label={`Upload of ${path}`} className="mt-2" />
      ) : null}
      {upload?.status === "failed" && upload.message ? (
        <p className="mt-1.5 text-xs text-destructive">{upload.message}</p>
      ) : null}
      <ProblemList problems={problems} className="mt-1.5" />
    </li>
  );
}

/**
 * A bulk drop's designs in request order: each CAD file with what it brings, the SKU, name and
 * category it will have, and its problems; once the batch is made, its upload instead.
 */
export function DesignList({ designs, problems, uploads, onRemove }: DesignListProps) {
  const [filter, setFilter] = useState<DesignFilter>("all");
  const withProblems = designs.filter((design) => (problems.get(design.index)?.length ?? 0) > 0);
  const failed = uploads ? designs.filter((design) => uploads.get(design.index)?.status === "failed") : [];
  const options: { value: DesignFilter; label: string }[] = [{ value: "all", label: `All ${designs.length}` }];
  if (withProblems.length > 0) options.push({ value: "problems", label: `With problems ${withProblems.length}` });
  if (failed.length > 0) options.push({ value: "failed", label: `Failed ${failed.length}` });
  const shown = filter === "problems" && withProblems.length > 0 ? withProblems : filter === "failed" && failed.length > 0 ? failed : designs;

  if (designs.length === 0) return null;
  return (
    <section className="space-y-3" aria-label="Designs">
      {options.length > 1 ? (
        <ChipField label="Show" options={options} value={shown === designs ? "all" : filter} onChange={setFilter} />
      ) : null}
      <ul className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
        {shown.map((design) => (
          <DesignRow
            key={design.files.source.path}
            design={design}
            problems={problems.get(design.index) ?? []}
            upload={uploads?.get(design.index)}
            onRemove={onRemove}
          />
        ))}
      </ul>
    </section>
  );
}
