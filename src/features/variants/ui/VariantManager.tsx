"use client";

import { Copy, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PlanGate } from "@/components/billing/PlanGate";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ModelVariant } from "@/lib/variants/types";
import { variantLimitMessage } from "@/lib/variants/variant-utils";
import { cn } from "@/lib/utils";
import type { VariantPlan } from "../hooks/useVariantPlan";

type VariantManagerProps = {
  items: ModelVariant[];
  activeVariantId: string | null;
  canAdd: boolean;
  /** The owner's plan once read; it sets the variant cap. */
  plan: VariantPlan | null;
  /** Why the server refused the last save, when it went past the cap. */
  limitError: string | null;
  onSave: () => void;
  onUpdateActive: () => boolean;
  onSwitch: (variantId: string | null) => void;
  onRename: (variantId: string, name: string) => void;
  onDelete: (variantId: string) => void;
};

function variantCountLine(count: number, plan: VariantPlan | null): string {
  if (!plan) return `Save material, scene, and pose combos (${count} saved).`;
  const cap = plan.features.max_variants_per_model;
  if (count >= cap) return variantLimitMessage(plan.planLabel, cap);
  return `Save material, scene, and pose combos (${count}/${cap}).`;
}

export function VariantManager({
  items,
  activeVariantId,
  canAdd,
  plan,
  limitError,
  onSave,
  onUpdateActive,
  onSwitch,
  onRename,
  onDelete,
}: VariantManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  // A refused save was rolled back, so an earlier "Variant saved" no longer holds.
  const [previousLimitError, setPreviousLimitError] = useState(limitError);
  if (previousLimitError !== limitError) {
    setPreviousLimitError(limitError);
    if (limitError) setStatus(null);
  }

  function startRename(variant: ModelVariant) {
    setEditingId(variant.id);
    setEditName(variant.name);
  }

  function commitRename(variantId: string) {
    onRename(variantId, editName);
    setEditingId(null);
    setEditName("");
  }

  const saveButton = (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-8 shrink-0 gap-1"
      disabled={!canAdd}
      onClick={() => {
        onSave();
        setStatus("Variant saved");
      }}
    >
      <Plus className="size-3.5" aria-hidden />
      Save
    </Button>
  );

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Variants
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">{variantCountLine(items.length, plan)}</p>
        </div>
        {/* At the cap, Save turns into an upgrade prompt; the top plan just keeps Save disabled. */}
        {plan?.canUpgrade ? (
          <PlanGate
            features={plan.features}
            require="variants"
            currentValue={items.length}
            fallback={
              <Link href="/pricing" className={cn(buttonVariants({ size: "sm" }), "h-8 shrink-0")}>
                Upgrade
              </Link>
            }
          >
            {saveButton}
          </PlanGate>
        ) : (
          saveButton
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No variants yet. Configure materials and scene, then save a named variant.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((variant) => {
            const active = variant.id === activeVariantId;
            return (
              <li
                key={variant.id}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-2 py-1.5",
                  active ? "border-primary/40 bg-primary/5" : "border-border bg-background",
                )}
              >
                {editingId === variant.id ? (
                  <Input
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") commitRename(variant.id);
                      if (event.key === "Escape") setEditingId(null);
                    }}
                    className="h-7 flex-1 text-xs"
                    autoFocus
                  />
                ) : (
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left text-xs font-medium text-foreground"
                    onClick={() => onSwitch(active ? null : variant.id)}
                    title={active ? "Click to deselect" : "Apply variant"}
                  >
                    {variant.name}
                  </button>
                )}
                <div className="flex shrink-0 items-center gap-0.5">
                  {active ? (
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      title="Update variant with current settings"
                      onClick={() => {
                        const ok = onUpdateActive();
                        setStatus(ok ? "Variant updated" : "Select a variant first");
                      }}
                    >
                      <Copy className="size-3.5" aria-hidden />
                    </Button>
                  ) : null}
                  {editingId === variant.id ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="h-7 px-2 text-[10px]"
                      onClick={() => commitRename(variant.id)}
                    >
                      OK
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[10px]"
                      onClick={() => startRename(variant)}
                    >
                      Rename
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    title="Delete variant"
                    onClick={() => {
                      onDelete(variant.id);
                      setStatus("Variant deleted");
                    }}
                  >
                    <Trash2 className="size-3.5 text-destructive" aria-hidden />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {limitError ? (
        <p className="text-[10px] text-destructive" role="alert">
          {limitError}
        </p>
      ) : status ? (
        <p className="text-[10px] text-muted-foreground" role="status">
          {status}
        </p>
      ) : null}
    </div>
  );
}
