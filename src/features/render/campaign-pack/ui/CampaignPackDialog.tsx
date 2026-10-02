"use client";

import { PackageOpen, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { UpgradeButton } from "@/components/billing/UpgradePrompt";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PersistedModelConfig } from "@/lib/slot-materials/model-config";
import { useMaterialPresetStore } from "@/stores/material-preset-store";
import { useExportPlan } from "../../ui/useExportPlan";
import { DEFAULT_CAMPAIGN_PACK_CONFIG } from "../domain/defaults";
import { planCampaignPack } from "../domain/plan";
import type { CampaignPackConfig, PackPlan, SavedPoseLike } from "../domain/types";
import { readStudioLook } from "../engine/start-pack";
import { PackOutputOptions } from "./PackOutputOptions";
import { PackMessageView, PackProgressView, PackSummaryView } from "./PackRunViews";
import { PackAnglePicker, PackMetalPicker } from "./PackSubjectPickers";
import { formatBytes } from "./pack-ui";
import { useCampaignPackRun } from "./useCampaignPackRun";
import { usePackIdentity } from "./usePackIdentity";

export type CampaignPackDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Viewer id — the file-name fallback when there is no SKU or name. */
  modelId: string;
  sku?: string | null;
  name?: string | null;
  sceneId?: number;
  /** Slot tokens make metal re-skinning match the studio's slot detection. */
  modelConfig?: PersistedModelConfig;
};

const NO_POSES: SavedPoseLike[] = [];

function emptyReason(config: CampaignPackConfig, plan: PackPlan): string | null {
  if (plan.jobs.length > 0) return null;
  if (config.metals.length === 0) return "Pick at least one metal.";
  return "Pick at least one angle, turntable format or the 360° spin.";
}

function planSummary(plan: PackPlan): string {
  const parts = [
    plan.totals.stills && `${plan.totals.stills} stills`,
    plan.totals.videos && `${plan.totals.videos} videos`,
    plan.totals.spinFrames && `${plan.totals.spinFrames} spin frames`,
    plan.totals.scopes && "ASET scope",
  ].filter(Boolean);
  return `${parts.join(" · ") || "Nothing selected"} · ≈ ${formatBytes(plan.totals.estimatedBytes)}`;
}

export function CampaignPackDialog({
  open,
  onOpenChange,
  modelId,
  sku,
  name,
  sceneId,
  modelConfig,
}: CampaignPackDialogProps) {
  const [config, setConfig] = useState<CampaignPackConfig>(DEFAULT_CAMPAIGN_PACK_CONFIG);
  const [backgroundTouched, setBackgroundTouched] = useState(false);
  const poses = useMaterialPresetStore((s) => s.sceneSettings.poses) as SavedPoseLike[] | undefined;
  const savedPoses = poses ?? NO_POSES;
  const identity = usePackIdentity({ modelId, sku, name, sceneId, enabled: open });
  const { state, start, cancel, reset } = useCampaignPackRun();
  // Grow and Studio only: other plans see the pack with an upgrade in place of the run button.
  const exportPlan = useExportPlan();
  const locked = exportPlan !== null && !exportPlan.campaignPack;
  const running = state.status === "running";
  const hasSku = Boolean(identity.sku);
  const studio = useMemo(
    () => (open ? readStudioLook() : { backdrop: null, hasStudioSet: false, hasTracedGems: false }),
    [open],
  );
  // A styled studio set (mirror floor, plinth…) is the look the user built: keep it unless
  // they pick a clean background themselves.
  const effectiveConfig = useMemo<CampaignPackConfig>(
    () => ({
      ...config,
      embed: config.embed && hasSku,
      background: !backgroundTouched && studio.hasStudioSet ? { kind: "scene" } : config.background,
    }),
    [config, hasSku, backgroundTouched, studio.hasStudioSet],
  );
  const plan = useMemo(
    () => planCampaignPack(effectiveConfig, { identity, savedPoses, hasTracedGems: studio.hasTracedGems }),
    [effectiveConfig, identity, savedPoses, studio.hasTracedGems],
  );
  const blocked = emptyReason(effectiveConfig, plan);

  // Options edit the effective config; keep derived values (auto background, embed without
  // a SKU) out of state unless the user actually changed them.
  function updateConfig(next: CampaignPackConfig) {
    const backgroundChanged = next.background !== effectiveConfig.background;
    if (backgroundChanged) setBackgroundTouched(true);
    setConfig({
      ...next,
      background: backgroundChanged ? next.background : config.background,
      embed: next.embed !== effectiveConfig.embed ? next.embed : config.embed,
    });
  }

  function handleOpenChange(next: boolean) {
    // A pack takes minutes; only the explicit Cancel button may stop it.
    if (!next && running) return;
    if (!next) reset();
    onOpenChange(next);
  }

  function handleStart() {
    void start({ config: effectiveConfig, identity, savedPoses, slotTokens: modelConfig?.slotTokens });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={!running} className="max-h-[92dvh] overflow-y-auto border-border bg-card sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl text-foreground">
            <PackageOpen className="size-5 text-primary" aria-hidden />
            Campaign pack
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Every marketing asset for <span className="text-foreground">{plan.rootName}</span> — stills in each metal,
            turntables, a 360° spin and an embed — rendered on this device into one ZIP.
          </DialogDescription>
        </DialogHeader>

        {state.status === "idle" ? (
          <div className="space-y-5">
            <PackMetalPicker value={config.metals} onChange={(metals) => setConfig({ ...config, metals })} />
            <PackAnglePicker
              value={config.angleIds}
              savedPoses={savedPoses}
              onChange={(angleIds) => setConfig({ ...config, angleIds })}
            />
            <PackOutputOptions
              config={effectiveConfig}
              onChange={updateConfig}
              sceneBackdrop={studio.backdrop}
              hasSku={hasSku}
              hasTracedGems={studio.hasTracedGems}
            />
            {/* Sticky offsets are inset by the dialog's p-4; -bottom-4 pins it to the edge. */}
            <div className="sticky -bottom-4 -mx-4 -mb-4 flex flex-col gap-2 border-t border-border bg-card/95 px-4 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground" role="status">
                {locked ? "Campaign packs come with Grow and Studio." : blocked ?? `${plan.totals.files} files · ${planSummary(plan)}`}
              </p>
              {locked ? (
                <UpgradeButton className="gap-2">
                  <Sparkles className="size-4" aria-hidden />
                  Upgrade to render
                </UpgradeButton>
              ) : (
                <Button type="button" onClick={handleStart} disabled={Boolean(blocked) || !exportPlan} className="gap-2">
                  <Sparkles className="size-4" aria-hidden />
                  Render campaign pack
                </Button>
              )}
            </div>
          </div>
        ) : null}
        {state.status === "running" ? <PackProgressView progress={state.progress} onCancel={cancel} /> : null}
        {state.status === "done" ? (
          <PackSummaryView result={state.result} url={state.url} onAgain={reset} onClose={() => handleOpenChange(false)} />
        ) : null}
        {state.status === "error" ? <PackMessageView tone="error" message={state.message} onBack={reset} /> : null}
        {state.status === "cancelled" ? (
          <PackMessageView tone="cancelled" message="Cancelled — nothing was downloaded." onBack={reset} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
