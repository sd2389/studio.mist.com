import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isModelCompanionFilename,
  isSupportedModelFilename,
  modelExtFromFilename,
  SUPPORTED_MODEL_EXTS,
} from "@/lib/model-key";
import { groupModelFiles, MODEL_FILE_ACCEPT, unsupportedFilesMessage } from "@/lib/upload/model-files";
import { isSupportedModelFile } from "@/lib/upload/persist-model";
import { fetchSampleModelFile, SAMPLE_MODELS, SampleUnavailableError } from "@/lib/upload/sample-models";

const file = (name: string) => new File(["x"], name);

describe("model file allow-list", () => {
  it("accepts every jewelry CAD format, case-insensitively", () => {
    for (const name of ["a.glb", "a.gltf", "a.3dm", "a.STEP", "a.stp", "a.iges", "a.IGS", "a.obj", "a.fbx", "a.stl", "a.ply", "a.3mf"]) {
      expect(isSupportedModelFilename(name), name).toBe(true);
      expect(isSupportedModelFile(file(name)), name).toBe(true);
    }
    expect(modelExtFromFilename("Ring #2.STP")).toBe("stp");
  });

  it("rejects non-model files, including companions on their own", () => {
    for (const name of ["a.dwg", "a.zip", "a.mtl", "a.png", "README", "a.glb.exe"]) {
      expect(isSupportedModelFilename(name), name).toBe(false);
    }
    expect(isModelCompanionFilename("ring.mtl")).toBe(true);
    expect(isModelCompanionFilename("scene.bin")).toBe(true);
    expect(isModelCompanionFilename("mtl")).toBe(false);
  });

  it("lists every format and companion in the input accept attribute", () => {
    for (const ext of [...SUPPORTED_MODEL_EXTS, "mtl", "bin", "png", "jpg"]) {
      expect(MODEL_FILE_ACCEPT.split(",")).toContain(`.${ext}`);
    }
  });
});

describe("groupModelFiles", () => {
  it("pairs an OBJ with its MTL and textures, ignoring unrelated files", () => {
    const obj = file("ring.obj");
    const mtl = file("ring.mtl");
    const png = file("gold.png");
    const set = groupModelFiles([mtl, file("notes.txt"), obj, png]);
    expect(set?.primary).toBe(obj);
    expect(set?.companions).toEqual([mtl, png]);
  });

  it("returns null without a model, with guidance when only companions were picked", () => {
    expect(groupModelFiles([file("ring.mtl")])).toBeNull();
    expect(unsupportedFilesMessage([file("ring.mtl")])).toMatch(/model file/);
    expect(unsupportedFilesMessage([file("ring.dwg")])).toMatch(/STEP/);
  });
});

describe("sample models", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("points the quick-start buttons at the Solitaire and Halo samples", () => {
    expect(SAMPLE_MODELS.map((s) => [s.label, s.url])).toEqual([
      ["Solitaire", "/models/samples/solitaire.glb"],
      ["Halo", "/models/samples/halo.glb"],
    ]);
  });

  it("turns a missing sample (404) into a friendly, typed error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Not found", { status: 404 })));
    await expect(fetchSampleModelFile(SAMPLE_MODELS[1])).rejects.toBeInstanceOf(SampleUnavailableError);
    await expect(fetchSampleModelFile(SAMPLE_MODELS[1])).rejects.toThrow(/Halo sample isn't available/);
  });

  it("treats an HTML fallback page as unavailable too", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html/>", { headers: { "content-type": "text/html" } })));
    await expect(fetchSampleModelFile(SAMPLE_MODELS[0])).rejects.toBeInstanceOf(SampleUnavailableError);
  });

  it("wraps a deployed sample as a .glb File", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
      headers: { "content-type": "model/gltf-binary" },
    })));
    const sample = await fetchSampleModelFile(SAMPLE_MODELS[0]);
    expect(sample.name).toBe("Solitaire.glb");
    expect(sample.size).toBe(3);
  });
});
