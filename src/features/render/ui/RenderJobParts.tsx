import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatStorageGb } from "@/lib/billing/format";
import { cn } from "@/lib/utils";
import { jobStatusLabel } from "../lib/render-job-labels";
import { outputDownloadUrl, type RenderJob, type RenderJobOutput, type RenderJobStatus } from "../lib/render-jobs-api";

/*
 * The pieces every list of server render jobs draws a job with: its status, its progress while it
 * renders, and a download for each file it made. The Exports panel and a bulk batch's page both
 * use them.
 */

const STATUS_BADGES: Record<RenderJobStatus, "default" | "secondary" | "outline" | "destructive"> = {
  queued: "outline",
  running: "secondary",
  completed: "default",
  failed: "destructive",
  canceled: "outline",
};

/** "Queued", "Encoding", "Canceling", "Ready", "Failed", as a badge. */
export function RenderJobStatusBadge({
  job,
  className,
}: {
  job: Pick<RenderJob, "status" | "stage" | "cancel_requested_at">;
  className?: string;
}) {
  return (
    <Badge variant={STATUS_BADGES[job.status] ?? "outline"} className={className}>
      {jobStatusLabel(job)}
    </Badge>
  );
}

/** How far a running job has got, as a bar and a percentage. */
export function RenderJobProgress({ progress, className }: { progress: number; className?: string }) {
  const percent = Math.round(progress * 100);
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Progress value={percent} aria-label="Render progress" className="flex-1" />
      <span className="text-[10.5px] tabular-nums text-muted-foreground">{percent}%</span>
    </div>
  );
}

/** "Download · 18 MB" for a job's one file; each file by its label when it made several. */
export function RenderJobDownloads({ job }: { job: Pick<RenderJob, "id"> & { outputs: RenderJobOutput[] } }) {
  const several = job.outputs.length > 1;
  return job.outputs.map((output, index) => (
    <a
      key={output.id}
      href={outputDownloadUrl(job.id, output.id)}
      download={output.filename ?? undefined}
      title={output.filename ?? undefined}
      className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
    >
      <Download aria-hidden />
      {several ? (output.label ?? output.filename ?? `File ${index + 1}`) : "Download"}
      <span className="font-normal text-muted-foreground">· {formatStorageGb(output.bytes)}</span>
    </a>
  ));
}
