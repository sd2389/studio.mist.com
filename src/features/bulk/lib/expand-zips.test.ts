import { strToU8, Zip, ZipDeflate, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import type { DroppedFile } from "@/lib/upload/dropped-files";
import { expandZips, filesInZip } from "./expand-zips";

function asDropped(path: string, bytes: Uint8Array<ArrayBuffer>): DroppedFile {
  return { path, file: new File([bytes], path.split("/").at(-1)!) };
}

/** A ZIP as Finder writes one: streamed entries with data descriptors, a folder, and its resource forks. */
function streamedZip(entries: Record<string, string>): Promise<Uint8Array<ArrayBuffer>> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    const zip = new Zip((error, chunk, final) => {
      if (error) return reject(error);
      chunks.push(chunk);
      if (final) resolve(new Uint8Array(chunks.flatMap((part) => [...part])));
    });
    for (const [name, text] of Object.entries(entries)) {
      const entry = new ZipDeflate(name, { level: 6 });
      zip.add(entry);
      entry.push(strToU8(text), true);
    }
    zip.end();
  });
}

async function contents(files: DroppedFile[]): Promise<[string, string][]> {
  return Promise.all(files.map(async ({ path, file }) => [path, await file.text()] as [string, string]));
}

describe("filesInZip", () => {
  it("expands stored and deflated entries in the browser, each at its path in the ZIP's own folder", async () => {
    const zip = zipSync({
      "rings/R-1.3dm": [strToU8("rhino"), { level: 0 }],
      "rings/R-1001.obj": [strToU8("v 0 0 0\n".repeat(200)), { level: 9 }],
      "rings/R-1001.mtl": strToU8("newmtl gold"),
      "rings/": new Uint8Array(0),
    });

    const { files } = await filesInZip(asDropped("drop/catalog.zip", zip as Uint8Array<ArrayBuffer>));

    expect(await contents(files)).toEqual([
      ["drop/rings/R-1.3dm", "rhino"],
      ["drop/rings/R-1001.obj", "v 0 0 0\n".repeat(200)],
      ["drop/rings/R-1001.mtl", "newmtl gold"],
    ]);
    expect(files[0].file.name).toBe("R-1.3dm");
  });

  it("reads streamed entries with data descriptors and skips Finder's leftovers", async () => {
    const zip = await streamedZip({
      "catalog/P-220.stp": "ISO-10303-21;",
      "__MACOSX/catalog/._P-220.stp": "fork",
      "catalog/.DS_Store": "finder",
      "catalog/manifest.csv": "file,sku\nP-220.stp,P-220\n",
    });

    const { files } = await filesInZip(asDropped("catalog.zip", zip));

    expect(await contents(files)).toEqual([
      ["catalog/P-220.stp", "ISO-10303-21;"],
      ["catalog/manifest.csv", "file,sku\nP-220.stp,P-220\n"],
    ]);
  });
});

describe("expandZips", () => {
  it("puts each ZIP's files in its place and passes other files through", async () => {
    const zip = zipSync({ "R-2.stl": strToU8("solid") }) as Uint8Array<ArrayBuffer>;
    const loose = asDropped("R-1.stl", strToU8("solid one") as Uint8Array<ArrayBuffer>);

    const expanded = await expandZips([loose, asDropped("more.ZIP", zip)]);

    expect(expanded.files.map(({ path }) => path)).toEqual(["R-1.stl", "R-2.stl"]);
    expect(expanded.files[0]).toBe(loose);
    expect(expanded.failures).toEqual([]);
  });

  it("says which ZIPs couldn't be opened, and keeps the rest of the drop", async () => {
    const whole = zipSync({ "R-1.stl": [strToU8("solid ".repeat(500)), { level: 9 }] }) as Uint8Array<ArrayBuffer>;
    const cut = whole.slice(0, 60);
    const empty = zipSync({}) as Uint8Array<ArrayBuffer>;

    const expanded = await expandZips([
      asDropped("cut.zip", cut),
      asDropped("empty.zip", empty),
      asDropped("R-9.stl", strToU8("solid") as Uint8Array<ArrayBuffer>),
    ]);

    expect(expanded.files.map(({ path }) => path)).toEqual(["R-9.stl"]);
    expect(expanded.failures.map(({ path }) => path)).toEqual(["cut.zip", "empty.zip"]);
    expect(expanded.failures[1].message).toBe("empty.zip couldn't be opened: it holds no files");
  });

  it("leaves out a file over the plan's limit as it unzips, whatever size the ZIP declares, and keeps the rest", async () => {
    // Streamed entries declare no size; stored ones do. Either way the bytes are counted.
    const streamed = await streamedZip({ "big.stp": "x".repeat(5000), "R-1.stl": "solid" });
    const declared = zipSync({ "huge.obj": [strToU8("v".repeat(5000)), { level: 9 }], "R-2.stl": strToU8("solid") }) as Uint8Array<ArrayBuffer>;

    const expanded = await expandZips([asDropped("a.zip", streamed), asDropped("b.zip", declared)], { maxFileBytes: 1000 });

    expect(expanded.files.map(({ path }) => path)).toEqual(["R-1.stl", "R-2.stl"]);
    expect(expanded.failures).toEqual([
      { path: "big.stp", message: "big.stp is over 1000 B unzipped, and a file may be at most 1000 B, so it was left out." },
      { path: "huge.obj", message: "huge.obj is over 1000 B unzipped, and a file may be at most 1000 B, so it was left out." },
    ]);
  });

  it("stops a drop whose ZIPs unzip to more than a batch may hold, and opens no ZIP after it", async () => {
    const bomb = await streamedZip({ "R-1.stl": "a".repeat(800), "R-2.stl": "b".repeat(800), "R-3.stl": "c".repeat(800) });
    const next = zipSync({ "R-4.stl": strToU8("solid") }) as Uint8Array<ArrayBuffer>;
    const loose = asDropped("R-5.stl", strToU8("solid") as Uint8Array<ArrayBuffer>);

    const expanded = await expandZips([asDropped("bomb.zip", bomb), asDropped("next.zip", next), loose], {
      maxFileBytes: 1000,
      maxTotalBytes: 2000,
    });

    expect(expanded.files).toEqual([loose]);
    expect(expanded.failures.map(({ path }) => path)).toEqual(["bomb.zip", "next.zip"]);
    expect(expanded.failures[0].message).toBe("bomb.zip couldn't be opened: unzipped, it holds more than a batch may (2.0 KB)");
    expect(expanded.failures[1].message).toBe("next.zip wasn't opened: the ZIPs before it already hold more than a batch may.");
  });
});
