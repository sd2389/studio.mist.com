import { Progress } from "@/components/ui/progress";
import { formatStorageGb } from "@/lib/billing/format";
import type { UploadTotals } from "./useBatchUploads";

/** A batch's uploads from this page, in total: designs confirmed and bytes sent. */
export function UploadProgress({ totals }: { totals: UploadTotals }) {
  const percent = totals.total > 0 ? Math.round((totals.sent / totals.total) * 100) : 0;
  return (
    <div className="space-y-2" role="status">
      <Progress value={percent} aria-label="Upload progress" />
      <p className="text-xs text-muted-foreground">
        {totals.confirmed} of {totals.designs} design{totals.designs === 1 ? "" : "s"} uploaded ·{" "}
        {formatStorageGb(totals.sent)} of {formatStorageGb(totals.total)}
        {totals.failed > 0 ? ` · ${totals.failed} failed` : ""}
      </p>
    </div>
  );
}
