"use client";

import { Check, Copy } from "lucide-react";
import { useCopyFeedback } from "@/components/embed/embed-code";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ApiKeyCreated } from "@/lib/api/api-keys";

/** A new key's secret, shown this once with a copy button; "Done" puts it away for good. */
export function NewApiKeyReveal({ created, onDone }: { created: ApiKeyCreated; onDone: () => void }) {
  const { copied, copy } = useCopyFeedback<"key">();
  return (
    <div role="status" className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
      <p className="text-sm font-medium text-foreground">{created.name} is ready</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          readOnly
          value={created.secret}
          aria-label="Your new API key"
          spellCheck={false}
          autoComplete="off"
          className="font-mono text-xs"
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button type="button" variant="outline" className="gap-2 text-xs" onClick={() => void copy(created.secret, "key")}>
          {copied === "key" ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          {copied === "key" ? "Copied" : "Copy key"}
        </Button>
      </div>
      <p className="text-xs text-amber-700 dark:text-amber-400">
        Copy it now and keep it somewhere safe: you won&apos;t see this key again.
      </p>
      <Button type="button" size="sm" variant="ghost" onClick={onDone}>
        Done
      </Button>
    </div>
  );
}
