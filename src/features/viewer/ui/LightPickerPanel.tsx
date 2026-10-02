"use client";

import { cn } from "@/lib/utils";
import { useMaterialPresetStore } from "@/stores/material-preset-store";
import { LIGHTING } from "@/features/viewer/ui/studio-material-groups";
import { resolveSceneSetup, SceneSetupPicker, type SceneSetupId } from "@/features/scene-setups";
import { Switch } from "@/components/ui/switch";

type LightPickerPanelProps = {
  className?: string;
};

export function LightPickerPanel({ className }: LightPickerPanelProps) {
  const lighting = useMaterialPresetStore((s) => s.lighting);
  const setLighting = useMaterialPresetStore((s) => s.setLighting);
  const sceneSetup = useMaterialPresetStore((s) => resolveSceneSetup(s.sceneSettings.sceneSetup).id);
  const starGlints = useMaterialPresetStore((s) => s.sceneSettings.advanced?.starGlints === true);
  const macroLens = useMaterialPresetStore((s) => s.sceneSettings.advanced?.macroLens === true);
  const setSceneSetting = useMaterialPresetStore((s) => s.setSceneSetting);
  const setSceneAdvanced = useMaterialPresetStore((s) => s.setSceneAdvanced);

  // Picking a scene also adopts its sparkle default; the switch below can still override it.
  const chooseScene = (id: SceneSetupId) => {
    setSceneSetting("sceneSetup", id);
    setSceneAdvanced({ starGlints: resolveSceneSetup(id).starGlints });
  };

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-5 pt-4", className)}>
      <section>
        <h3 className="mb-2.5 text-[10.5px] font-medium uppercase tracking-[0.16em] text-foreground/80">
          Lighting
        </h3>
        <div className="grid grid-cols-3 gap-1.5">
          {LIGHTING.map((L) => {
            const Icon = L.icon;
            const active = lighting === L.id;
            return (
              <button
                key={L.id}
                type="button"
                onClick={() => setLighting(L.id)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-2xl border bg-card/60 px-2 py-3 text-center transition-colors",
                  "border-border/60",
                  active
                    ? "border-foreground/45 bg-card shadow-sm"
                    : "hover:border-foreground/25 hover:bg-card",
                )}
                aria-pressed={active}
              >
                <Icon
                  className={cn(
                    "size-4 transition-colors",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                  aria-hidden
                />
                <span
                  className={cn(
                    "text-[10.5px] font-medium leading-tight tracking-tight",
                    active ? "text-foreground" : "text-foreground/75",
                  )}
                >
                  {L.label}
                </span>
              </button>
            );
          })}
        </div>
      </section>
      <section className="mt-6">
        <h3 className="mb-2.5 text-[10.5px] font-medium uppercase tracking-[0.16em] text-foreground/80">
          Scene
        </h3>
        <SceneSetupPicker value={sceneSetup} onChange={chooseScene} />
        <label className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/60 px-3 py-2.5">
          <span>
            <span className="block text-[11px] font-medium text-foreground">Star glints</span>
            <span className="block text-[10px] text-muted-foreground">Star-filter sparkle on gem highlights</span>
          </span>
          <Switch checked={starGlints} onCheckedChange={(checked) => setSceneAdvanced({ starGlints: checked })} />
        </label>
        <label className="mt-2 flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/60 px-3 py-2.5">
          <span>
            <span className="block text-[11px] font-medium text-foreground">Macro lens</span>
            <span className="block text-[10px] text-muted-foreground">Shallow depth of field focused on the piece</span>
          </span>
          <Switch checked={macroLens} onCheckedChange={(checked) => setSceneAdvanced({ macroLens: checked })} />
        </label>
      </section>
    </div>
  );
}
