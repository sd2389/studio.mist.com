"use client";

import { UpgradePrompt } from "@/components/billing/UpgradePrompt";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ApiKeyList as ApiKeyListAnswer, NewApiKey } from "@/lib/api/api-keys";
import { activeKeyCount } from "../domain/api-keys";
import { ApiKeyList } from "./ApiKeyList";
import { NewApiKeyForm } from "./NewApiKeyForm";
import { NewApiKeyReveal } from "./NewApiKeyReveal";
import { useApiKeyDraft } from "./useApiKeyDraft";
import { useApiKeys } from "./useApiKeys";

type ApiKeysSectionProps = {
  initial: ApiKeyListAnswer;
  /** The plan includes the API: keys can be made. Existing ones are listed and revoked either way. */
  canCreate: boolean;
};

/** The profile page's API keys (ADR 0006, Phase G): make one, see its secret once, list, revoke. */
export function ApiKeysSection({ initial, canCreate }: ApiKeysSectionProps) {
  const keys = useApiKeys(initial);
  const form = useApiKeyDraft();
  const active = activeKeyCount(keys.keys);

  async function createKey(body: NewApiKey) {
    if (await keys.create(body)) form.reset();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle className="text-lg">API keys</CardTitle>
          <p className="text-sm text-muted-foreground">
            Your own systems call the MIST API (<span className="font-mono">/v1</span>) with a key. It acts as you,
            within your plan, and only with the scopes you give it; it can&apos;t sign in or manage keys.
          </p>
        </div>
        <Badge variant="outline" className="shrink-0 rounded-full px-3 py-1">
          {active} of {keys.maxActive} active
        </Badge>
      </CardHeader>
      <CardContent className="space-y-6">
        {keys.error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {keys.error}
          </p>
        ) : null}
        {/* While a secret shows, no other key can be made: a new one would replace it, its only copy. */}
        {keys.revealed ? (
          <NewApiKeyReveal created={keys.revealed} onDone={keys.dismissRevealed} />
        ) : canCreate ? (
          <NewApiKeyForm
            form={form}
            atLimit={active >= keys.maxActive}
            maxActive={keys.maxActive}
            creating={keys.creating}
            onCreate={(body) => void createKey(body)}
          />
        ) : (
          <UpgradePrompt>API keys come with the Studio plan.</UpgradePrompt>
        )}
        <ApiKeyList keys={keys.keys} revokingId={keys.revokingId} onRevoke={(id) => void keys.revoke(id)} />
      </CardContent>
    </Card>
  );
}
