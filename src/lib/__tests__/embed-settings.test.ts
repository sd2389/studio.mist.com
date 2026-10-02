import { describe, expect, it } from "vitest";
import {
  buildEmbedIframeSnippet,
  buildEmbedUrl,
  parseEmbedUrlParams,
  resolveEmbedKey,
  resolveEmbedSettings,
} from "@/lib/embed-settings";

describe("embed-settings", () => {
  it("links to the piece alone, so saved changes reach snippets already pasted", () => {
    expect(buildEmbedUrl("https://studio.example/", "SKU 1")).toBe("https://studio.example/embed/SKU%201");
  });

  it("reads the saved viewer options, with any options on the link winning", () => {
    const saved = { showChrome: true, showTitle: false, autoRotate: false };
    const parsed = parseEmbedUrlParams({ chrome: "0", branding: [" Acme ", "Other"] });
    const settings = resolveEmbedSettings(saved, parsed);
    expect(settings.showChrome).toBe(false);
    expect(settings.showTitle).toBe(false);
    expect(settings.autoRotate).toBe(false);
    expect(settings.brandingText).toBe("Acme");
    expect(settings.showZoomControls).toBe(true);
  });

  it("iframe snippet includes src and dimensions", () => {
    const snippet = buildEmbedIframeSnippet("https://studio.example/embed/x", {
      width: 640,
      height: 480,
      title: "Ring",
    });
    expect(snippet).toContain('src="https://studio.example/embed/x"');
    expect(snippet).toContain('width="640"');
    expect(snippet).toContain('title="Ring"');
  });

  it("defaults the embed to stay on the jeweler site", () => {
    expect(resolveEmbedSettings(null).showStudioLink).toBe(false);
  });

  it("resolveEmbedKey prefers sku", () => {
    expect(resolveEmbedKey(" ABC ", "viewer-1")).toBe("ABC");
    expect(resolveEmbedKey(null, "viewer-1")).toBe("viewer-1");
  });
});
