import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeZip, ZipTooLarge } from "./zip.mjs";

const NO_CAP = 4 * 1024 ** 3 - 1;
const PAGE = "<!doctype html><title>Ring</title>" + "<p>turn me</p>".repeat(200);

let dir;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "zip-test-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** Files on disk, as a spin leaves them: frames, then the viewer page. */
function spinFiles(frameBytes = 1000) {
  const entries = ["frame_001.jpg", "frame_002.jpg", "frame_003.jpg"].map((name, index) => {
    const file = path.join(dir, name);
    writeFileSync(file, Buffer.alloc(frameBytes, index + 1));
    return { name, path: file, compress: false };
  });
  const page = path.join(dir, "spin.html");
  writeFileSync(page, PAGE);
  return [...entries, { name: "spin.html", path: page, compress: true }];
}

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

describe("writeZip", () => {
  it("streams each file into the archive in order, images stored and text deflated", async () => {
    const entries = spinFiles();
    const added = [];
    const out = path.join(dir, "ring-spin.zip");
    const written = await writeZip(entries, out, { maxBytes: NO_CAP, onAdded: (entry, count) => added.push([entry.name, count]) });

    const archive = readFileSync(out);
    expect(written).toEqual({ bytes: archive.length, sha256: sha256(archive) });
    expect(added).toEqual([["frame_001.jpg", 1], ["frame_002.jpg", 2], ["frame_003.jpg", 3], ["spin.html", 4]]);
    const methods = {};
    const files = unzipSync(archive, { filter: (file) => ((methods[file.name] = file.compression), true) });
    expect(Object.keys(files)).toEqual(["frame_001.jpg", "frame_002.jpg", "frame_003.jpg", "spin.html"]);
    expect(Buffer.from(files["frame_002.jpg"])).toEqual(Buffer.alloc(1000, 2));
    expect(new TextDecoder().decode(files["spin.html"])).toBe(PAGE);
    expect(methods).toEqual({ "frame_001.jpg": 0, "frame_002.jpg": 0, "frame_003.jpg": 0, "spin.html": 8 });
  });

  it.skipIf(spawnSync("python3", ["--version"]).status !== 0)("makes an archive another unzipper reads, CRCs and all", async () => {
    const out = path.join(dir, "ring-spin.zip");
    await writeZip(spinFiles(), out, { maxBytes: NO_CAP });
    const check = spawnSync("python3", ["-c", "import sys, zipfile; z = zipfile.ZipFile(sys.argv[1]); print(z.testzip(), len(z.namelist()))", out]);
    expect(check.stdout.toString().trim()).toBe("None 4");
  });

  // Reading waits on writing: a frame is never in memory whole, nor is the archive.
  it("writes as it reads", async () => {
    const big = path.join(dir, "frame_001.png");
    writeFileSync(big, Buffer.alloc(8 * 1024 * 1024, 7));
    const out = path.join(dir, "ring-spin.zip");
    let onDiskWhenRead = 0;
    await writeZip([{ name: "frame_001.png", path: big }, ...spinFiles().slice(-1)], out, {
      maxBytes: NO_CAP,
      onAdded: (entry) => {
        if (entry.name === "frame_001.png") onDiskWhenRead = statSync(out).size;
      },
    });
    expect(onDiskWhenRead).toBeGreaterThan(6 * 1024 * 1024);
    expect(statSync(out).size).toBeGreaterThan(8 * 1024 * 1024);
  });

  it("stops past its cap and keeps nothing; up to it is fine", async () => {
    const entries = spinFiles();
    const sized = path.join(dir, "sized.zip");
    const { bytes } = await writeZip(entries, sized, { maxBytes: NO_CAP });

    const out = path.join(dir, "ring-spin.zip");
    await expect(writeZip(entries, out, { maxBytes: bytes - 1 })).rejects.toThrow(ZipTooLarge);
    expect(existsSync(out)).toBe(false);
    expect((await writeZip(entries, out, { maxBytes: bytes })).bytes).toBe(bytes);
  });

  it("refuses more entries than a ZIP without ZIP64 holds", async () => {
    const entries = Array.from({ length: 65_536 }, (_, index) => ({ name: `frame_${index}.jpg`, path: path.join(dir, "missing.jpg") }));
    await expect(writeZip(entries, path.join(dir, "ring-spin.zip"), { maxBytes: NO_CAP })).rejects.toThrow(/at most 65535 files/);
  });

  it("stops when the job does, and keeps nothing", async () => {
    const controller = new AbortController();
    const out = path.join(dir, "ring-spin.zip");
    const writing = writeZip(spinFiles(), out, { maxBytes: NO_CAP, signal: controller.signal, onAdded: () => controller.abort(new Error("timed out")) });
    await expect(writing).rejects.toThrow();
    expect(existsSync(out)).toBe(false);
  });
});
