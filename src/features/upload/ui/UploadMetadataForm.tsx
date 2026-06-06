"use client";

import { JEWELRY_CATEGORIES } from "@/lib/upload/categories";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type UploadMetadata = {
  name: string;
  sku: string;
  category: string;
  note: string;
};

type UploadMetadataFormProps = {
  value: UploadMetadata;
  onChange: (patch: Partial<UploadMetadata>) => void;
  skuError?: string | null;
};

export function UploadMetadataForm({ value, onChange, skuError }: UploadMetadataFormProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="upload-name">Name</Label>
        <Input
          id="upload-name"
          value={value.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Model name"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="upload-sku">SKU</Label>
        <Input
          id="upload-sku"
          value={value.sku}
          onChange={(e) => onChange({ sku: e.target.value })}
          placeholder="Unique SKU"
          aria-invalid={Boolean(skuError)}
        />
        {skuError ? <p className="text-xs text-red-400">{skuError}</p> : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="upload-category">Category</Label>
        <select
          id="upload-category"
          value={value.category}
          onChange={(e) => onChange({ category: e.target.value })}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {JEWELRY_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="upload-note">Note</Label>
        <Textarea
          id="upload-note"
          value={value.note}
          onChange={(e) => onChange({ note: e.target.value })}
          placeholder="Optional notes"
          rows={3}
        />
      </div>
    </div>
  );
}
