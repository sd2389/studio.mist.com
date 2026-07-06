import { captureAll } from "./browser.mjs";

const outDir = process.argv[2] ?? "tests/goldens";
captureAll(outDir).then(
  () => console.log(`goldens written to ${outDir}`),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
