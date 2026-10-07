import { isSupportedModelFilename } from "@/lib/model-key";
import type { ConvertedUpload } from "@/lib/upload/convert-upload";

export type PersistModelMetadata = {
  name: string;
  sku: string;
  category: string;
  note: string;
};

export type PersistModelResult = {
  sceneId: number;
  modelKey: string;
};

/** A save the server refused on its merits — retrying as multipart would fail identically. */
class RegisterRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegisterRejectedError";
  }
}

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
    /** What the URL signs (type and cache policy); the PUT must send exactly these. */
    headers?: Record<string, string>;
  };
  const put = await fetch(p.upload_url, {
    method: p.method || "PUT",
    body,
    headers: p.headers ?? { "Content-Type": contentType },
  });
  if (!put.ok) {
    throw new Error(`Direct upload failed (${put.status})`);
  }
  return p;
}

/**
 * Stores what Save converted (`convertParsedUpload`) as a new scene: the GLB and thumbnail through
 * presigned PUTs and register, or one multipart upload when presigning fails.
 */
export async function persistUploadedModel(converted: ConvertedUpload, metadata: PersistModelMetadata): Promise<PersistModelResult> {
  const { modelConfig: mergedConfig, slotSelections, sceneSettings, polygonCount } = converted;

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
        polygon_count: polygonCount,
        model_config: mergedConfig,
        slot_selections: slotSelections,
        scene_settings: sceneSettings,
      }),
    });
    const regJson = (await reg.json()) as { error?: string; scene_id?: number; model_key?: string };
    if (!reg.ok) {
      throw new RegisterRejectedError(regJson.error ?? "Register failed");
    }
    if (typeof regJson.scene_id !== "number" || !regJson.model_key) {
      throw new Error("Missing scene_id or model_key from register response");
    }
    // The server keeps the checked model under a key of its own and deletes the presigned one.
    return { sceneId: regJson.scene_id, modelKey: regJson.model_key };
  } catch (presignErr) {
    if (presignErr instanceof RegisterRejectedError) throw presignErr;

    const glbFile = new File([converted.glb], converted.glbFilename, {
      type: "model/gltf-binary",
    });
    const fd = new FormData();
    fd.append("file", glbFile);
    fd.append("name", metadata.name);
    fd.append("sku", metadata.sku);
    fd.append("category", metadata.category);
    fd.append("note", metadata.note);
    fd.append("polygon_count", String(polygonCount));
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
  return isSupportedModelFilename(file.name);
}
