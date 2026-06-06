import type { PersistedModelConfig, SceneSettingsBuckets } from "@/lib/slot-materials/model-config";
import { convertUploadToGlb } from "@/lib/convert/to-glb";
import type { LoadedModel } from "@/lib/convert/types";

export type PersistModelMetadata = {
  name: string;
  sku: string;
  category: string;
  note: string;
};

export type PersistModelInput = {
  file: File;
  preloaded: LoadedModel;
  modelConfig: PersistedModelConfig;
  slotSelections: Record<string, string>;
  sceneSettings: SceneSettingsBuckets;
  metadata: PersistModelMetadata;
};

export type PersistModelResult = {
  sceneId: number;
  modelKey: string;
};

async function presignAndPut(
  filename: string,
  body: Blob,
  contentType: string,
): Promise<{ key: string; upload_url: string; method?: string }> {
  const presignRes = await fetch("/api/upload/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, content_type: contentType }),
  });
  if (!presignRes.ok) {
    const err = (await presignRes.json()) as { error?: string };
    throw new Error(err.error ?? "Presign failed");
  }
  const p = (await presignRes.json()) as {
    upload_url: string;
    key: string;
    method?: string;
  };
  const put = await fetch(p.upload_url, {
    method: p.method || "PUT",
    body,
    headers: { "Content-Type": contentType },
  });
  if (!put.ok) {
    throw new Error(`Direct upload failed (${put.status})`);
  }
  return p;
}

export async function persistUploadedModel(input: PersistModelInput): Promise<PersistModelResult> {
  const { file, preloaded, modelConfig, slotSelections, sceneSettings, metadata } = input;

  const converted = await convertUploadToGlb(file, {
    modelConfig,
    preloaded,
  });

  const mergedConfig = {
    ...modelConfig,
    slotTokens: converted.slotTokens,
    materialProps: converted.materialProps,
  };

  try {
    const modelPut = await presignAndPut(
      converted.glbFilename,
      converted.glb,
      "model/gltf-binary",
    );

    let thumbnailKey: string | undefined;
    if (converted.thumbnail) {
      const thumbPut = await presignAndPut(
        "thumbnail.webp",
        converted.thumbnail,
        "image/webp",
      );
      thumbnailKey = thumbPut.key;
    }

    const reg = await fetch("/api/upload/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: modelPut.key,
        name: metadata.name,
        sku: metadata.sku,
        category: metadata.category,
        note: metadata.note,
        thumbnail_key: thumbnailKey,
        model_config: mergedConfig,
        slot_selections: slotSelections,
        scene_settings: sceneSettings,
      }),
    });
    const regJson = (await reg.json()) as { error?: string; scene_id?: number };
    if (!reg.ok) {
      throw new Error(regJson.error ?? "Register failed");
    }
    if (typeof regJson.scene_id !== "number") {
      throw new Error("Missing scene_id from register response");
    }
    return { sceneId: regJson.scene_id, modelKey: modelPut.key };
  } catch (presignErr) {
    const glbFile = new File([converted.glb], converted.glbFilename, {
      type: "model/gltf-binary",
    });
    const fd = new FormData();
    fd.append("file", glbFile);
    fd.append("name", metadata.name);
    fd.append("sku", metadata.sku);
    fd.append("category", metadata.category);
    fd.append("note", metadata.note);
    fd.append("model_config", JSON.stringify(mergedConfig));
    fd.append("slot_selections", JSON.stringify(slotSelections));
    fd.append("scene_settings", JSON.stringify(sceneSettings));
    const up = await fetch("/api/models/upload", { method: "POST", body: fd });
    const data = (await up.json()) as {
      model_key?: string;
      scene_id?: number;
      error?: string;
    };
    if (!up.ok) {
      throw new Error(data.error ?? "Upload failed");
    }
    if (typeof data.scene_id !== "number" || !data.model_key) {
      throw new Error("Missing scene_id or model_key");
    }
    if (presignErr instanceof Error) {
      console.warn("[upload] presign path failed, used multipart fallback:", presignErr.message);
    }
    return { sceneId: data.scene_id, modelKey: data.model_key };
  }
}

export function isSupportedModelFile(file: File): boolean {
  const n = file.name.toLowerCase();
  return n.endsWith(".glb") || n.endsWith(".gltf") || n.endsWith(".stl") || n.endsWith(".3dm");
}
