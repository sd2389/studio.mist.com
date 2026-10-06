import { chmod, writeFile } from "node:fs/promises";
import path from "node:path";

/*
 * For tests: an executable that stands in for ffmpeg. It reads raw frames of the `-s` size on
 * stdin, reports `frame=<n>` on stdout as ffmpeg's `-progress pipe:1` does, and writes a small
 * stand-in MP4 to its last argument; `-version` and `-encoders` answer as ffmpeg does. It writes
 * its pid and arguments next to itself, in `<path>.json`.
 */

const SCRIPT = `#!/usr/bin/env node
const fs = require("node:fs");
const behaviour = __BEHAVIOUR__;
const args = process.argv.slice(2);
fs.writeFileSync(__filename + ".json", JSON.stringify({ pid: process.pid, args }));
if (args.includes("-version")) {
  process.stdout.write("ffmpeg version fake-9.0 Copyright (c) 2000-2026 the FFmpeg developers\\n");
  process.exit(0);
}
if (args.includes("-encoders")) {
  process.stdout.write(" V....D " + behaviour.encoder + " " + behaviour.encoder + " H.264\\n V....D mpeg4 MPEG-4 part 2\\n");
  process.exit(0);
}
const [width, height] = args[args.indexOf("-s") + 1].split("x").map(Number);
const frameBytes = width * height * 4;
let bytes = 0;
const framesIn = () => Math.floor(bytes / frameBytes);
process.stdin.on("data", (chunk) => {
  bytes += chunk.length;
  if (behaviour.failAfterFrames !== null && framesIn() >= behaviour.failAfterFrames) {
    process.stderr.write("[libx264 @ 0x1] fake: out of memory\\nError while encoding the stream\\n");
    process.exit(1);
  }
  process.stdout.write("frame=" + framesIn() + "\\nprogress=continue\\n");
});
process.stdin.on("end", () => {
  if (behaviour.hang) {
    setInterval(() => {}, 1000);
    return;
  }
  const frames = framesIn() - behaviour.dropFrames;
  fs.writeFileSync(args[args.length - 1], "fake mp4: " + frames + " frames of " + width + "x" + height);
  process.stdout.write("frame=" + frames + "\\nprogress=end\\n");
});
`;

/**
 * Writes the stand-in to `dir` and returns its path.
 *
 * @param {string} dir
 * @param {object} [behaviour]
 * @param {number | null} [behaviour.failAfterFrames] Exits 1, with an error on stderr, once this many frames are in.
 * @param {boolean} [behaviour.hang] Never exits.
 * @param {number} [behaviour.dropFrames] Reports this many frames fewer than it got.
 * @param {string} [behaviour.encoder] The H.264 encoder `-encoders` lists.
 */
export async function writeFakeFfmpeg(dir, { failAfterFrames = null, hang = false, dropFrames = 0, encoder = "libx264" } = {}) {
  const file = path.join(dir, `ffmpeg-${Math.random().toString(36).slice(2)}.cjs`);
  await writeFile(file, SCRIPT.replace("__BEHAVIOUR__", JSON.stringify({ failAfterFrames, hang, dropFrames, encoder })));
  await chmod(file, 0o755);
  return file;
}
