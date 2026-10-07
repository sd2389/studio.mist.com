"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { ModelLoadStatus } from "@/lib/convert/types";
import { formatPolyCount } from "@/lib/upload/polygon-limits";
import { formatModelSizeMm, type ParsedUpload } from "@/lib/upload/parsed-upload";
import { Button, buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { BuyCreditsLink, outOfCredits } from "@/features/billing/ui/BuyCreditsLink";

/** Spinner + live parse step ("Converting CAD… tessellating STEP surfaces"). */
export function UploadParsingState({ status }: { status: ModelLoadStatus | null }) {
  return (
    <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-4 bg-muted">
      <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
      <p className="text-sm font-medium text-foreground" role="status">
        {status?.message ?? "Parsing to glb file…"}
      </p>
      {status?.progress !== undefined ? (
        <Progress value={Math.round(status.progress * 100)} className="w-56" />
      ) : null}
      <p className="max-w-sm text-center text-xs text-muted-foreground">
        Converting CAD in your browser. Your file stays on-device until you save.
      </p>
    </div>
  );
}

/** File name, polygon count and detected real-world size. */
export function UploadModelSummary({ parsed }: { parsed: ParsedUpload | null }) {
  const size = parsed ? formatModelSizeMm(parsed.preloaded) : null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Model details
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {parsed?.file.name} · {formatPolyCount(parsed?.polyCount ?? 0)} polys
        {size ? ` · ${size}` : null}
      </p>
    </div>
  );
}

type PolyLimitNoticeProps = {
  polyCount: number;
  planLabel: string;
  maxPolygons: number;
  decimating: boolean;
  onDecimate: () => void;
};

export function UploadPolyLimitNotice({ polyCount, planLabel, maxPolygons, decimating, onDecimate }: PolyLimitNoticeProps) {
  return (
    <div
      className="rounded-xl border border-red-600/25 bg-red-500/[0.07] px-4 py-3 text-sm text-red-950"
      role="alert"
    >
      <p>
        This model has {formatPolyCount(polyCount)} polygons — your {planLabel} plan allows up to{" "}
        {formatPolyCount(maxPolygons)}. Decimation only simplifies metal; stones keep their facets.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href="/pricing" className={buttonVariants({ size: "sm" })}>
          Upgrade plan
        </Link>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-red-800/25 text-red-950 hover:bg-red-500/10"
          disabled={decimating}
          onClick={onDecimate}
        >
          {decimating ? "Decimating metal…" : `Decimate metal to ~${formatPolyCount(maxPolygons)}`}
        </Button>
      </div>
    </div>
  );
}

type SaveStatusProps = {
  saving: boolean;
  progress: number;
  message: string | null;
  error: string | null;
};

/** Save progress while saving, then any error (with a way to buy credits when they ran out). */
export function UploadSaveStatus({ saving, progress, message, error }: SaveStatusProps) {
  return (
    <>
      {saving ? (
        <div className="space-y-2">
          <Progress value={progress} />
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {message ?? "Saving…"}
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
          {outOfCredits(error) ? <BuyCreditsLink /> : null}
        </p>
      ) : null}
    </>
  );
}
