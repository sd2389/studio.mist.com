"use client";

import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip, ChipField } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { API_SCOPES, type NewApiKey } from "@/lib/api/api-keys";
import { EXPIRY_OPTIONS, MAX_NAME_LENGTH } from "../domain/api-keys";
import type { ApiKeyDraftState } from "./useApiKeyDraft";

type NewApiKeyFormProps = {
  form: ApiKeyDraftState;
  /** As many keys are active as may be: none more until one is revoked. */
  atLimit: boolean;
  maxActive: number;
  creating: boolean;
  onCreate: (body: NewApiKey) => void;
};

/** A new key: its name, what it may do (scopes) and how long it works. */
export function NewApiKeyForm({ form, atLimit, maxActive, creating, onCreate }: NewApiKeyFormProps) {
  const { draft, body } = form;
  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
      <div className="space-y-2">
        <Label htmlFor="api-key-name">Name</Label>
        <Input
          id="api-key-name"
          value={draft.name}
          maxLength={MAX_NAME_LENGTH}
          placeholder="Catalogue sync"
          onChange={(event) => form.setName(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label className="text-muted-foreground">Scopes</Label>
        <div className="flex flex-wrap gap-2">
          {API_SCOPES.map((scope) => (
            <Chip key={scope} selected={draft.scopes.includes(scope)} onClick={() => form.toggleScope(scope)}>
              <span className="font-mono">{scope}</span>
            </Chip>
          ))}
        </div>
      </div>
      <ChipField label="Expires" options={EXPIRY_OPTIONS} value={draft.expiresInDays} onChange={form.setExpiry} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={!body || creating || atLimit} onClick={() => body && onCreate(body)}>
          {creating ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <KeyRound className="size-4" aria-hidden />}
          Create key
        </Button>
        {atLimit ? (
          <p className="text-xs text-muted-foreground">
            {maxActive} keys are active, the most there may be: revoke one to make another.
          </p>
        ) : null}
      </div>
    </div>
  );
}
