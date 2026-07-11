"use client";

import { Download, ExternalLink } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AiVisualsResultProps = {
  resultUrl: string;
  onDownload: () => void;
};

export function AiVisualsResult({ resultUrl, onDownload }: AiVisualsResultProps) {
  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-xl border border-border">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={resultUrl}
          alt="Latest AI generated jewelry image"
          className="aspect-video w-full object-cover"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <a
          href={resultUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "inline-flex items-center justify-center gap-2",
          )}
        >
          <ExternalLink className="size-4" aria-hidden />
          Open
        </a>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={onDownload}
        >
          <Download className="size-4" aria-hidden />
          Download
        </Button>
      </div>
    </div>
  );
}
