"use client";

import { PackageOpen } from "lucide-react";
import { useMemo, useState } from "react";
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
import { useServerExports } from "../../ui/useServerExports";
import { DEFAULT_CAMPAIGN_PACK_CONFIG } from "../domain/defaults";
import { planCampaignPack } from "../domain/plan";
import type { CampaignPackConfig, PackPlan, SavedPoseLike } from "../domain/types";
import { PackOutputOptions } from "./PackOutputOptions";
import { PackRunFooter, PackRunStateView } from "./PackRunViews";
import { PackAnglePicker, PackMetalPicker } from "./PackSubjectPickers";
import { formatBytes } from "./pack-ui";
import { ServerPackFooter, ServerPackJobs } from "./ServerPackViews";
import { useCampaignPackRun } from "./useCampaignPackRun";
import { usePackIdentity } from "./usePackIdentity";
import { useServerPackJob } from "./useServerPackJob";
import { useStudioLook } from "./useStudioLook";

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

type FooterState = { locked: boolean; blocked: string | null; hasScene: boolean; identityPending: boolean };

/** The footer's line: why the pack can't start, or what it makes. */
function footerSummary(plan: PackPlan, { locked, blocked, hasScene, identityPending }: FooterState): string {
  if (locked) return "Campaign packs come with Grow and Studio.";
  if (blocked) return blocked;
  if (!hasScene) return "Packs render from a saved piece: open one of yours in the studio to render it.";
  if (identityPending) return "Reading the piece's SKU and name…";
  return `${plan.totals.files} files · ${planSummary(plan)}`;
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
  // A pack waits for the scene's SKU and name, which name its files and decide its embed.
  const { identity, pending: identityPending } = usePackIdentity({ modelId, sku, name, sceneId, enabled: open });
  const { state, start, cancel, reset } = useCampaignPackRun();
  // Grow and Studio only: other plans see the pack with an upgrade in place of the run button.
  const exportPlan = useExportPlan();
  const locked = exportPlan !== null && !exportPlan.campaignPack;
  const running = state.status === "running";
  const hasSku = Boolean(identity.sku);
  // Read again while the dialog waits: it can open before the stage has the piece's gems.
  const studio = useStudioLook(open, !running);
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
  // While server exports are on, the pack renders on the server (ADR 0005, D2); else on this
  // device, as it always has. Until the flag is read, neither way starts.
  const serverExports = useServerExports();
  const server = useServerPackJob({
    // Priced only while the dialog is open, where the price shows.
    active: open && serverExports === true && !locked && !blocked && !identityPending,
    config: effectiveConfig,
    rootName: plan.rootName,
    hasTracedGems: studio.hasTracedGems,
  });
  const showSettings = serverExports ? server.jobs.length === 0 : state.status === "idle";

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
    // A pack takes minutes; only the explicit Cancel button may stop one in this browser. One on
    // the server renders on with the dialog closed, and waits in Exports.
    if (!next && running) return;
    if (!next) {
      reset();
      server.clear();
    }
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
            turntables, a 360° spin and an embed — rendered {serverExports ? "on our servers" : "on this device"} into one ZIP.
          </DialogDescription>
        </DialogHeader>

        {showSettings ? (
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
            {serverExports ? (
              <ServerPackFooter
                summary={footerSummary(plan, { locked, blocked, hasScene: server.hasScene, identityPending })}
                quote={locked ? null : server.quote}
                locked={locked}
                canStart={Boolean(exportPlan) && !blocked && server.hasScene && !identityPending}
                starting={server.starting}
                error={server.error}
                onStart={server.start}
              />
            ) : (
              <PackRunFooter
                summary={footerSummary(plan, { locked, blocked, hasScene: true, identityPending })}
                locked={locked}
                disabled={Boolean(blocked) || !exportPlan || serverExports === null || identityPending}
                onStart={handleStart}
              />
            )}
          </div>
        ) : null}
        {serverExports ? (
          showSettings ? null : (
            <ServerPackJobs jobs={server.jobs} onRetried={server.add} onAgain={server.clear} onClose={() => handleOpenChange(false)} />
          )
        ) : (
          <PackRunStateView state={state} onCancel={cancel} onAgain={reset} onClose={() => handleOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}
