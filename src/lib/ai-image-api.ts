import type { AiImageSubMode, AiModelVariant } from "@/lib/ai-image-presets";

export type AiImageRequest = {
  jewelry_b64: string;
  sub_mode: AiImageSubMode;
  preset_id?: string | null;
  model_variant?: AiModelVariant | null;
  prompt?: string | null;
};

export type AiImageResponse = {
  result_key?: string;
  result_url?: string | null;
  mode?: string;
  sub_mode?: string;
  prompt?: string;
  error?: string;
};

/** User-facing status from API `mode` (e.g. `shoot:stub`, `model:stub`). */
export function aiImageStatusLabel(mode: string | null | undefined): string {
  return (mode ?? "").includes("stub")
    ? "Stub result (dev mode) — not production AI"
    : "AI image ready";
}

export async function requestAiImage(body: AiImageRequest): Promise<AiImageResponse> {
  const response = await fetch("/api/ai-background", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as AiImageResponse & { detail?: string };
  if (!response.ok) {
    throw new Error(data.detail ?? data.error ?? "AI image request failed");
  }
  return data;
}
