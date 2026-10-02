import { unzipSync, strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { DEFAULT_CAMPAIGN_PACK_CONFIG } from "./defaults";
import { buildPackDocuments } from "./documents";
import { planCampaignPack } from "./plan";
import type { PackFileRecord } from "./types";
import { crc32, PackZipWriter } from "./zip-writer";

async function unzip(blob: Blob) {
  return unzipSync(new Uint8Array(await blob.arrayBuffer()));
}

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
});

describe("PackZipWriter", () => {
  it("round-trips stored media and deflated text", async () => {
    const writer = new PackZipWriter(new Date("2026-09-30T12:00:00"));
    const jpg = new Uint8Array(4096).map((_, i) => (i * 31) % 251);
    await writer.add("PACK/stills/a.jpg", new Blob([jpg]));
    await writer.add("PACK/README.md", "# Pack\n".repeat(200), { compress: true });
    const zip = writer.finish();
    const files = await unzip(zip);
    expect(Object.keys(files)).toEqual(["PACK/stills/a.jpg", "PACK/README.md"]);
    expect(files["PACK/stills/a.jpg"]).toEqual(jpg);
    expect(strFromU8(files["PACK/README.md"]!)).toBe("# Pack\n".repeat(200));
    expect(writer.files).toEqual([
      { path: "PACK/stills/a.jpg", bytes: 4096, compressed: false },
      { path: "PACK/README.md", bytes: 1400, compressed: true },
    ]);
  });

  it("writes real sizes in local headers (no data descriptors)", async () => {
    const writer = new PackZipWriter();
    await writer.add("a.txt", "hello");
    const bytes = new Uint8Array(await writer.finish().arrayBuffer());
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint16(6, true) & 0x8).toBe(0);
    expect(view.getUint32(18, true)).toBe(5);
    expect(view.getUint32(22, true)).toBe(5);
  });

  it("rejects duplicate paths and writes after finish", async () => {
    const writer = new PackZipWriter();
    await writer.add("a.txt", "1");
    await expect(writer.add("a.txt", "2")).rejects.toThrow(/Duplicate/);
    writer.finish();
    await expect(writer.add("b.txt", "3")).rejects.toThrow(/finished/);
  });
});

describe("pack manifest", () => {
  it("lists every written file with metadata, and the ZIP matches it", async () => {
    const config = {
      ...DEFAULT_CAMPAIGN_PACK_CONFIG,
      metals: ["gold-18k-yellow" as const],
      angleIds: ["front", "top"],
      turntable: { ...DEFAULT_CAMPAIGN_PACK_CONFIG.turntable, enabled: false },
      spin: { enabled: true, frames: 3, size: 64 },
    };
    const identity = { modelId: "ring-1", sku: "SKU-9", name: "Solitaire" };
    const plan = planCampaignPack(config, { identity, savedPoses: [] });
    const writer = new PackZipWriter();
    const files: PackFileRecord[] = [];
    for (const job of plan.jobs) {
      const paths = job.kind === "still" ? [job.jpgPath, job.pngPath] : job.kind === "spin" ? job.framePaths : [job.path];
      for (const path of paths) {
        if (!path) continue;
        const bytes = await writer.add(path, new Blob([path]));
        files.push({ path, bytes, kind: path.endsWith(".png") ? "still-png" : path.includes("/spin/") ? "spin-frame" : "still-jpg" });
      }
    }
    const docs = buildPackDocuments({
      plan,
      config,
      identity,
      backgroundLabel: "#FFFFFF (white)",
      origin: "https://studio.example",
      files,
      failures: [{ jobId: "turntable:x", label: "18K Yellow Gold · Turntable", message: "encoder unavailable" }],
      generatedAt: new Date("2026-09-30T12:00:00Z"),
    });
    for (const doc of docs) await writer.add(doc.path, doc.content, { compress: true });
    const unzipped = await unzip(writer.finish());

    const manifest = JSON.parse(strFromU8(unzipped["SKU-9/manifest.json"]!));
    const listed = manifest.files.map((file: PackFileRecord) => file.path);
    expect(listed).toEqual(expect.arrayContaining(["SKU-9/stills/18k-yellow-gold_front.jpg", "SKU-9/spin/spin.html", "SKU-9/README.md"]));
    for (const path of listed) expect(unzipped[path], path).toBeDefined();
    expect(Object.keys(unzipped).sort()).toEqual([...listed, "SKU-9/manifest.json"].sort());
    expect(manifest.model).toEqual({ id: "ring-1", sku: "SKU-9", name: "Solitaire" });
    expect(manifest.failures).toHaveLength(1);

    const readme = strFromU8(unzipped["SKU-9/README.md"]!);
    expect(readme).toContain("# Solitaire — Campaign Pack");
    expect(readme).toContain("4 stills");
    expect(readme).toContain("encoder unavailable");
    expect(strFromU8(unzipped["SKU-9/embed/embed-snippet.html"]!)).toContain('src="https://studio.example/embed/SKU-9"');
  });
});
