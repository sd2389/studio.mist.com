"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  HEAD_STYLE_OPTIONS,
  SETTING_TYPE_OPTIONS,
  SHANK_PROFILE_OPTIONS,
  type ProductSpecs,
} from "@/lib/product-specs/types";

type Props = {
  value: ProductSpecs;
  onChange: (patch: Partial<ProductSpecs>) => void;
};

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function SettingSpecsSection({ value, onChange }: Props) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold text-foreground">Setting & design</legend>

      <div className="space-y-2">
        <Label htmlFor="spec-setting-type">Setting type</Label>
        <select
          id="spec-setting-type"
          value={value.setting_type ?? ""}
          onChange={(e) =>
            onChange({ setting_type: (e.target.value || null) as ProductSpecs["setting_type"] })
          }
          className={SELECT_CLASS}
        >
          <option value="">—</option>
          {SETTING_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {value.setting_type === "other" ? (
          <Input
            id="spec-setting-type-other"
            value={value.setting_type_other}
            onChange={(e) => onChange({ setting_type_other: e.target.value })}
            placeholder="Describe setting type"
          />
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="spec-head-style">Head style</Label>
        <select
          id="spec-head-style"
          value={value.head_style ?? ""}
          onChange={(e) =>
            onChange({ head_style: (e.target.value || null) as ProductSpecs["head_style"] })
          }
          className={SELECT_CLASS}
        >
          <option value="">—</option>
          {HEAD_STYLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {value.head_style === "other" ? (
          <Input
            id="spec-head-style-other"
            value={value.head_style_other}
            onChange={(e) => onChange({ head_style_other: e.target.value })}
            placeholder="Describe head style"
          />
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="spec-shank-profile">Shank profile</Label>
        <select
          id="spec-shank-profile"
          value={value.shank_profile ?? ""}
          onChange={(e) =>
            onChange({ shank_profile: (e.target.value || null) as ProductSpecs["shank_profile"] })
          }
          className={SELECT_CLASS}
        >
          <option value="">—</option>
          {SHANK_PROFILE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {value.shank_profile === "other" ? (
          <Input
            id="spec-shank-profile-other"
            value={value.shank_profile_other}
            onChange={(e) => onChange({ shank_profile_other: e.target.value })}
            placeholder="Describe shank profile"
          />
        ) : null}
      </div>
    </fieldset>
  );
}
