"use client";

import { Badge } from "@/components/ui/badge";
import type { ApiKey } from "@/lib/api/api-keys";
import { formatRelativeTime } from "@/lib/relative-time";
import { isKeyExpired, keyExpiryLabel, keyUsageLabel, maskedKey } from "../domain/api-keys";
import { RevokeApiKeyDialog } from "./RevokeApiKeyDialog";

type ApiKeyListProps = {
  keys: readonly ApiKey[];
  revokingId: number | null;
  onRevoke: (id: number) => void;
};

/** The user's keys by name and prefix, never their secrets, each with what it may do and Revoke. */
export function ApiKeyList({ keys, revokingId, onRevoke }: ApiKeyListProps) {
  if (keys.length === 0) {
    return <p className="text-sm text-muted-foreground">No API keys yet.</p>;
  }
  return (
    <ul className="divide-y divide-border/60">
      {keys.map((key) => (
        <li key={key.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-medium text-foreground">{key.name}</p>
              {isKeyExpired(key) ? <Badge variant="destructive">Expired</Badge> : null}
            </div>
            <p className="font-mono text-xs text-muted-foreground">{maskedKey(key.prefix)}</p>
            <div className="flex flex-wrap gap-1.5">
              {key.scopes.map((scope) => (
                <Badge key={scope} variant="outline" className="font-mono text-[11px]">
                  {scope}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Created {formatRelativeTime(key.created_at)} · {keyUsageLabel(key)} · {keyExpiryLabel(key)}
            </p>
          </div>
          <RevokeApiKeyDialog keyName={key.name} revoking={revokingId === key.id} onConfirm={() => onRevoke(key.id)} />
        </li>
      ))}
    </ul>
  );
}
