import { buildEmbedIframeSnippet, buildEmbedUrl } from "@/lib/embed-settings";
import { sceneDisplayName } from "@/lib/scene-display-name";
import { ASET_LEGEND, TURNTABLE_FORMATS } from "./defaults";
import { relativeTo } from "./naming";
import { buildSpinViewerHtml, escapeHtml } from "./spin-viewer";
import type {
  CampaignPackConfig,
  PackFailure,
  PackFileRecord,
  PackIdentity,
  PackPlan,
} from "./types";

export type PackDocument = { path: string; content: string };

export type PackDocumentInput = {
  plan: PackPlan;
  config: CampaignPackConfig;
  identity: PackIdentity;
  /** Resolved hex/CSS colour the JPGs and videos were flattened onto. */
  backgroundLabel: string;
  /** Studio origin for the live embed URL (e.g. https://studio.mist.com). */
  origin: string;
  files: PackFileRecord[];
  failures: PackFailure[];
  generatedAt: Date;
};

/** Human-facing title (viewer page, README); file paths use `packRootName` instead. */
export function packTitle(identity: PackIdentity): string {
  return identity.name?.trim() || sceneDisplayName(identity.modelId);
}

export function buildSpinDocument(input: PackDocumentInput): PackDocument | null {
  const { plan, files } = input;
  if (!plan.spinViewerPath) return null;
  const written = new Set(files.map((file) => file.path));
  const metals = plan.jobs.flatMap((job) => {
    if (job.kind !== "spin") return [];
    const frames = job.framePaths.filter((path) => written.has(path));
    const label = plan.metals.find((metal) => metal.id === job.metal)?.label ?? job.metal;
    const slug = plan.metals.find((metal) => metal.id === job.metal)?.slug ?? job.metal;
    return frames.length > 0
      ? [{ slug, label, frames: frames.map((path) => relativeTo(plan.spinViewerPath!, path)) }]
      : [];
  });
  if (metals.length === 0) return null;
  return {
    path: plan.spinViewerPath,
    content: buildSpinViewerHtml({ title: packTitle(input.identity), metals, size: input.config.spin.size }),
  };
}

export function buildEmbedDocuments(input: PackDocumentInput): PackDocument[] {
  const { plan, identity } = input;
  const sku = identity.sku?.trim();
  if (!plan.embedPath || !plan.embedSnippetPath || !sku) return [];
  const title = packTitle(identity);
  const embedUrl = buildEmbedUrl(input.origin, sku);
  const snippet = buildEmbedIframeSnippet(embedUrl, { title });
  const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · 3D embed</title>
<style>
body{margin:0;padding:24px;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f4f2ee;color:#1f1f1f}
main{max-width:860px;margin:0 auto;display:grid;gap:16px}
pre{margin:0;padding:14px;border-radius:10px;background:#1f1f1f;color:#f4f2ee;overflow:auto;font-size:12px}
</style>
</head>
<body>
<main>
<h1>${escapeHtml(title)}</h1>
<p>Live, interactive 3D viewer. Paste the snippet below into any product page, CMS block or deck.</p>
${snippet}
<pre><code>${escapeHtml(snippet)}</code></pre>
<p>Viewer URL: <a href="${escapeHtml(embedUrl)}">${escapeHtml(embedUrl)}</a></p>
</main>
</body>
</html>
`;
  return [
    { path: plan.embedPath, content: page },
    { path: plan.embedSnippetPath, content: `${snippet}\n` },
  ];
}

function count(files: PackFileRecord[], kind: PackFileRecord["kind"]): number {
  return files.filter((file) => file.kind === kind).length;
}

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function contentsSection(input: PackDocumentInput): string[] {
  const { plan, config, files } = input;
  const root = plan.rootName;
  const lines = ["## Contents", ""];
  const stills = count(files, "still-jpg") + count(files, "still-png");
  if (stills > 0) {
    const formats = [config.formats.jpg && "JPG", config.formats.png && "transparent PNG"].filter(Boolean);
    lines.push(`- \`${root}/stills/\` — ${stills} stills, ${config.stillSize}×${config.stillSize} px (${formats.join(" + ")}).`);
    lines.push("  Named `{metal}_{angle}.jpg|png`.");
  }
  const videos = files.filter((file) => file.kind === "video");
  if (videos.length > 0) {
    const sizes = [...new Set(videos.map((file) => `${file.width}×${file.height}`))].join(", ");
    lines.push(`- \`${root}/video/\` — ${videos.length} × ${config.turntable.durationSec}s 360° turntables, H.264 MP4 at ${config.turntable.fps} fps (${sizes}).`);
  }
  const spinFrames = count(files, "spin-frame");
  if (spinFrames > 0 && plan.spinViewerPath) {
    lines.push(`- \`${root}/spin/\` — ${spinFrames} JPG frames (${config.spin.frames} per metal, ${config.spin.size}×${config.spin.size} px) and \`spin.html\`.`);
  }
  if (count(files, "scope") > 0) {
    lines.push(`- \`${root}/cut-scope/aset_top.png\` — ASET cut-quality image of the stones (top view, white background).`);
  }
  if (plan.embedPath) {
    lines.push(`- \`${root}/embed/\` — \`embed.html\` preview page and \`embed-snippet.html\` (iframe code).`);
  }
  lines.push(`- \`${root}/manifest.json\` — every file with size, metal, angle and pixel dimensions.`);
  return lines;
}

function specsSection(input: PackDocumentInput): string[] {
  const { plan, config } = input;
  const formats = config.turntable.formats.map((format) => TURNTABLE_FORMATS[format].label);
  return [
    "## Specs",
    "",
    `- Metals: ${plan.metals.map((metal) => metal.label).join(", ") || "—"}`,
    `- Angles: ${plan.angles.map((angle) => angle.label).join(", ") || "—"}`,
    `- Background (JPG, video, spin frames): ${input.backgroundLabel}`,
    `- JPEG quality: ${Math.round(config.jpegQuality * 100)}`,
    `- Framing: ${config.autoFrame ? `auto-fit, ${config.marginPct}% margin, centred` : "current studio camera"}`,
    `- Turntable formats: ${config.turntable.enabled && formats.length ? formats.join(", ") : "none"}`,
  ];
}

function usageSection(input: PackDocumentInput): string[] {
  const lines = ["## Using the files", ""];
  if (input.plan.spinViewerPath) {
    lines.push("- **360° spin** — open `spin/spin.html` in any browser (works offline). Drag, scroll or use the arrow keys; upload the whole `spin/` folder to host it.");
  }
  if (input.plan.embedPath) {
    lines.push("- **Live 3D embed** — paste `embed/embed-snippet.html` into your product page.");
  } else if (input.config.embed) {
    lines.push("- **Live 3D embed** — set a SKU on this model in the studio to include an embed snippet.");
  }
  lines.push("- **Transparent PNGs** — the piece alone on alpha (no set, no shadow); drop onto any background.");
  if (input.files.some((file) => file.kind === "scope")) {
    lines.push(`- **ASET scope** — how the cut returns light, as gem labs grade it: ${ASET_LEGEND}.`);
  }
  return lines;
}

export function buildReadme(input: PackDocumentInput): string {
  const { failures, files, identity } = input;
  const bytes = files.reduce((sum, file) => sum + file.bytes, 0);
  const lines = [
    `# ${packTitle(identity)} — Campaign Pack`,
    "",
    `Generated by MIST Studio on ${input.generatedAt.toISOString().slice(0, 10)}.`,
    identity.sku ? `SKU: ${identity.sku}` : `Model: ${identity.modelId}`,
    `${files.length} files · ${formatMegabytes(bytes)} (plus this README and manifest.json)`,
    "",
    ...contentsSection(input),
    "",
    ...specsSection(input),
    "",
    ...usageSection(input),
  ];
  if (failures.length > 0) {
    lines.push("", "## Not included", "");
    for (const failure of failures) lines.push(`- ${failure.label}: ${failure.message}`);
  }
  return `${lines.join("\n")}\n`;
}

export function buildManifest(input: PackDocumentInput): string {
  const { plan, config, identity, files, failures } = input;
  return `${JSON.stringify(
    {
      generator: "MIST Studio Campaign Pack",
      version: 1,
      createdAt: input.generatedAt.toISOString(),
      model: { id: identity.modelId, sku: identity.sku, name: identity.name },
      settings: {
        metals: plan.metals.map((metal) => metal.slug),
        angles: plan.angles.map((angle) => angle.slug),
        stillSize: config.stillSize,
        jpegQuality: config.jpegQuality,
        background: input.backgroundLabel,
        autoFrame: config.autoFrame,
        marginPct: config.marginPct,
        turntable: config.turntable.enabled ? config.turntable : null,
        spin: config.spin.enabled ? config.spin : null,
      },
      files,
      failures,
    },
    null,
    2,
  )}\n`;
}

/** Every generated text file, in the order they go into the ZIP (manifest last). */
export function buildPackDocuments(input: PackDocumentInput): PackDocument[] {
  const docs: PackDocument[] = [];
  const spin = buildSpinDocument(input);
  if (spin) docs.push(spin);
  docs.push(...buildEmbedDocuments(input));
  const withDocs = (content: PackDocument[]) =>
    content.map((doc) => ({ path: doc.path, bytes: new TextEncoder().encode(doc.content).byteLength, kind: "document" as const }));
  const readmeInput = { ...input, files: [...input.files, ...withDocs(docs)] };
  const readme = { path: input.plan.readmePath, content: buildReadme(readmeInput) };
  docs.push(readme);
  const manifestInput = { ...input, files: [...input.files, ...withDocs(docs)] };
  docs.push({ path: input.plan.manifestPath, content: buildManifest(manifestInput) });
  return docs;
}
