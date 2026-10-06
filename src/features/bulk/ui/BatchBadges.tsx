import { Badge } from "@/components/ui/badge";
import type { IngestBatchStatus, IngestItemStatus } from "@/lib/api/ingest";
import { BATCH_STATUS_LABELS, ITEM_STATUS_LABELS } from "../domain/statuses";

type BadgeVariant = "default" | "secondary" | "outline" | "destructive";

const BATCH_BADGES: Record<IngestBatchStatus, BadgeVariant> = {
  draft: "outline",
  processing: "secondary",
  completed: "default",
  completed_with_errors: "destructive",
  canceled: "outline",
};

const ITEM_BADGES: Record<IngestItemStatus, BadgeVariant> = {
  awaiting_upload: "outline",
  uploaded: "secondary",
  converting: "secondary",
  converted: "secondary",
  rendering: "secondary",
  done: "default",
  failed: "destructive",
  skipped: "outline",
  canceled: "outline",
};

export function BatchStatusBadge({ status, className }: { status: IngestBatchStatus; className?: string }) {
  return (
    <Badge variant={BATCH_BADGES[status] ?? "outline"} className={className}>
      {BATCH_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export function ItemStatusBadge({ status, className }: { status: IngestItemStatus; className?: string }) {
  return (
    <Badge variant={ITEM_BADGES[status] ?? "outline"} className={className}>
      {ITEM_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
