import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { ssim } from "ssim.js";
import { captureAll, LIGHTING_IDS } from "./browser.mjs";

// NOTE: Node 22.19 does not enable type-stripping by default (requires --experimental-strip-types,
// which is only the default in Node 23+). Rather than add a tsx devDependency or complicate the
// npm script, the ~15-line compareImages logic from src/lib/golden/compare-images.ts is inlined
// here as plain JS. The unit-tested TypeScript version remains the source of truth for vitest.

const THRESHOLD = 0.98;
const GOLDEN_DIR = "tests/goldens";

function compareImages(a, b) {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`image dimensions differ: ${a.width}x${a.height} vs ${b.width}x${b.height}`);
  }
  const { mssim } = ssim(
    { data: a.data, width: a.width, height: a.height },
    { data: b.data, width: b.width, height: b.height },
  );
  return mssim;
}

function decode(file) {
  const png = PNG.sync.read(readFileSync(file));
  return { data: new Uint8ClampedArray(png.data), width: png.width, height: png.height };
}

async function main() {
  if (process.argv.includes("--self-test")) {
    const s = compareImages(decode(`${GOLDEN_DIR}/studio.png`), decode(`${GOLDEN_DIR}/dark.png`));
    if (s >= 0.95) throw new Error(`self-test: studio vs dark SSIM ${s.toFixed(4)} — comparator not discriminating`);
    console.log(`self-test ok (studio vs dark SSIM ${s.toFixed(4)})`);
    return;
  }
  const tmp = mkdtempSync(path.join(tmpdir(), "golden-"));
  await captureAll(tmp);
  let failed = false;
  for (const lighting of LIGHTING_IDS) {
    const score = compareImages(
      decode(path.join(tmp, `${lighting}.png`)),
      decode(`${GOLDEN_DIR}/${lighting}.png`),
    );
    const ok = score >= THRESHOLD;
    if (!ok) failed = true;
    console.log(`${ok ? "PASS" : "FAIL"} ${lighting}: SSIM ${score.toFixed(4)} (threshold ${THRESHOLD})`);
  }
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
