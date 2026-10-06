"use client";

import { FolderOpen, Loader2, UploadCloud } from "lucide-react";
import { useState, type DragEvent, type ReactNode } from "react";
import {
  entriesOfDrop,
  filesOfEntries,
  filesOfInput,
  type DroppedFile,
} from "@/lib/upload/dropped-files";
import { cn } from "@/lib/utils";

type FileDropZoneProps = {
  title: string;
  /** A line under the title: the formats, what to bring along. */
  hint?: ReactNode;
  /** `accept` for the file picker. */
  accept?: string;
  /** Lets a folder be picked or dropped: its files arrive with their folders in their paths. */
  folders?: boolean;
  busy?: boolean;
  /** Everything dropped or picked at once. */
  onFiles: (files: DroppedFile[]) => void;
  className?: string;
  /** More copy under the buttons. */
  children?: ReactNode;
};

const pickButton =
  "inline-flex cursor-pointer items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-medium shadow-sm transition hover:opacity-90";

/** The dashed area files are dropped on or picked from: the upload page's, and the bulk upload's. */
export function FileDropZone({ title, hint, accept, folders = false, busy, onFiles, className, children }: FileDropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const disabled = busy || reading;

  function hand(files: DroppedFile[]) {
    if (files.length > 0) onFiles(files);
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    // Entries must be taken while the event runs; their files can be read after it.
    const entries = folders ? entriesOfDrop(event.dataTransfer) : null;
    if (!entries) {
      hand(filesOfInput(event.dataTransfer.files));
      return;
    }
    setReading(true);
    filesOfEntries(entries)
      .then(hand)
      .finally(() => setReading(false));
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      aria-busy={reading}
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-card/80 px-6 py-10 text-center shadow-sm transition-colors hover:border-primary/30",
        dragging && "border-primary/50 bg-primary/5",
        disabled && "pointer-events-none opacity-60",
        className,
      )}
    >
      {reading ? (
        <Loader2 className="size-10 animate-spin text-primary/80" aria-hidden />
      ) : (
        <UploadCloud className="size-10 text-primary/80" aria-hidden />
      )}
      <div>
        <p className="text-base font-medium text-foreground">{reading ? "Reading files…" : title}</p>
        {hint ? <div className="mt-1 space-y-1 text-xs text-muted-foreground">{hint}</div> : null}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <label>
          <span className="sr-only">Choose files</span>
          <input
            type="file"
            accept={accept}
            multiple
            className="hidden"
            disabled={disabled}
            onChange={(event) => {
              hand(filesOfInput(event.target.files ?? []));
              event.target.value = "";
            }}
          />
          <span className={cn(pickButton, "bg-primary text-primary-foreground")}>Browse files</span>
        </label>
        {folders ? (
          <label>
            <span className="sr-only">Choose a folder</span>
            <input
              type="file"
              multiple
              className="hidden"
              disabled={disabled}
              ref={(input) => {
                if (input) input.webkitdirectory = true;
              }}
              onChange={(event) => {
                hand(filesOfInput(event.target.files ?? []));
                event.target.value = "";
              }}
            />
            <span className={cn(pickButton, "border border-border bg-card text-foreground")}>
              <FolderOpen className="size-4" aria-hidden />
              Choose folder
            </span>
          </label>
        ) : null}
      </div>
      {children}
    </div>
  );
}
