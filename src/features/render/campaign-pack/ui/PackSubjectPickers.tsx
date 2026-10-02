"use client";

import { getPresetSwatchColor } from "@/lib/material-swatch";
import { customPoses, poseAngleId } from "../domain/angles";
import { BUILT_IN_ANGLES, PACK_METAL_OPTIONS, type PackMetalOption } from "../domain/defaults";
import type { PackMetalId, SavedPoseLike } from "../domain/types";
import { PackSection } from "./pack-ui";
import { Chip } from "@/components/ui/chip";

const METAL_GROUPS: { id: PackMetalOption["group"]; label: string }[] = [
  { id: "yellow", label: "Yellow" },
  { id: "white", label: "White" },
  { id: "rose", label: "Rose & red" },
  { id: "speciality", label: "Speciality" },
];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function PackMetalPicker({
  value,
  onChange,
  disabled,
}: {
  value: PackMetalId[];
  onChange: (next: PackMetalId[]) => void;
  disabled?: boolean;
}) {
  return (
    <PackSection title="Metals" aside={`${value.length} selected · gems stay as set`}>
      <div className="space-y-2">
        {METAL_GROUPS.map((group) => (
          <div key={group.id} className="flex flex-wrap items-center gap-1.5">
            <span className="w-16 shrink-0 font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
              {group.label}
            </span>
            {PACK_METAL_OPTIONS.filter((option) => option.group === group.id).map((option) => (
              <Chip
                key={option.id}
                selected={value.includes(option.id)}
                onClick={() => onChange(toggle<PackMetalId>(value, option.id))}
                swatch={option.id === "current" ? undefined : getPresetSwatchColor(option.id)}
                disabled={disabled}
              >
                {option.label}
              </Chip>
            ))}
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-16 shrink-0 font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Studio</span>
          <Chip
            selected={value.includes("current")}
            onClick={() => onChange(toggle<PackMetalId>(value, "current"))}
            disabled={disabled}
            title="Render the model exactly as configured — keeps two-tone metals"
          >
            As configured
          </Chip>
        </div>
      </div>
    </PackSection>
  );
}

export function PackAnglePicker({
  value,
  savedPoses,
  onChange,
  disabled,
}: {
  value: string[];
  savedPoses: SavedPoseLike[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const poses = customPoses(savedPoses);
  return (
    <PackSection title="Angles" aside={poses.length ? `${poses.length} saved pose${poses.length > 1 ? "s" : ""}` : undefined}>
      <div className="flex flex-wrap gap-1.5">
        {BUILT_IN_ANGLES.map((angle) => (
          <Chip
            key={angle.id}
            selected={value.includes(angle.id)}
            onClick={() => onChange(toggle(value, angle.id))}
            disabled={disabled}
          >
            {angle.label}
          </Chip>
        ))}
        {poses.map((pose) => (
          <Chip
            key={pose.id}
            selected={value.includes(poseAngleId(pose.id))}
            onClick={() => onChange(toggle(value, poseAngleId(pose.id)))}
            disabled={disabled}
            title="Saved pose"
          >
            {pose.name}
          </Chip>
        ))}
      </div>
    </PackSection>
  );
}
