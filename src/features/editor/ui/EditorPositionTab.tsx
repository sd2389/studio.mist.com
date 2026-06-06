"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_MODEL_TRANSFORM,
  getDefaultModelTransform,
  type ModelTransform,
} from "@/lib/slot-materials/model-config";
import { useMaterialPresetStore } from "@/stores/material-preset-store";
import { EditorStepperField } from "./EditorStepperField";

function readTransform(value: ModelTransform | undefined): ModelTransform {
  return {
    position: {
      x: value?.position?.x ?? 0,
      y: value?.position?.y ?? 0,
      z: value?.position?.z ?? 0,
    },
    rotation: {
      x: value?.rotation?.x ?? 0,
      y: value?.rotation?.y ?? 0,
      z: value?.rotation?.z ?? 0,
    },
  };
}

export function EditorPositionTab() {
  const sceneSettings = useMaterialPresetStore((s) => s.sceneSettings);
  const setModelTransform = useMaterialPresetStore((s) => s.setModelTransform);
  const transform = readTransform(sceneSettings.modelTransform);

  const updatePosition = (axis: "x" | "y" | "z", value: number) => {
    setModelTransform({
      ...transform,
      position: { ...transform.position, [axis]: value },
    });
  };

  const updateRotation = (axis: "x" | "y" | "z", value: number) => {
    setModelTransform({
      ...transform,
      rotation: { ...transform.rotation, [axis]: value },
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-border px-4 py-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Position</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Translate and rotate the model in the viewport.
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-4">
          <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Position
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-[10px]"
                onClick={() =>
                  setModelTransform({
                    ...transform,
                    position: { ...DEFAULT_MODEL_TRANSFORM.position },
                  })
                }
              >
                <RotateCcw className="size-3" aria-hidden />
                Reset position
              </Button>
            </div>
            <EditorStepperField
              label="X"
              value={transform.position.x}
              step={0.01}
              min={-5}
              max={5}
              onChange={(value) => updatePosition("x", value)}
            />
            <EditorStepperField
              label="Y"
              value={transform.position.y}
              step={0.01}
              min={-5}
              max={5}
              onChange={(value) => updatePosition("y", value)}
            />
            <EditorStepperField
              label="Z"
              value={transform.position.z}
              step={0.01}
              min={-5}
              max={5}
              onChange={(value) => updatePosition("z", value)}
            />
          </div>

          <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Rotation
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-[10px]"
                onClick={() =>
                  setModelTransform({
                    ...transform,
                    rotation: { ...DEFAULT_MODEL_TRANSFORM.rotation },
                  })
                }
              >
                <RotateCcw className="size-3" aria-hidden />
                Reset rotation
              </Button>
            </div>
            <EditorStepperField
              label="X"
              value={transform.rotation.x}
              step={1}
              min={-180}
              max={180}
              suffix="deg"
              onChange={(value) => updateRotation("x", value)}
            />
            <EditorStepperField
              label="Y"
              value={transform.rotation.y}
              step={1}
              min={-180}
              max={180}
              suffix="deg"
              onChange={(value) => updateRotation("y", value)}
            />
            <EditorStepperField
              label="Z"
              value={transform.rotation.z}
              step={1}
              min={-180}
              max={180}
              suffix="deg"
              onChange={(value) => updateRotation("z", value)}
            />
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={() => setModelTransform(getDefaultModelTransform())}
          >
            Reset all transforms
          </Button>
        </div>
      </div>
    </div>
  );
}
