import { describe, expect, it } from "vitest";
import {
  buildEmbedIframeSnippet,
  buildEmbedUrl,
  embedSettingsToQuery,
  parseEmbedUrlParams,
  resolveEmbedKey,
  resolveEmbedSettings,
} from "@/lib/embed-settings";

describe("embed-settings", () => {
  it("builds URL with query overrides", () => {
    const url = buildEmbedUrl("https://studio.example", "SKU-1", {
      autoRotate: false,
      showChrome: false,
    });
    expect(url).toContain("/embed/SKU-1");
    expect(url).toContain("autorotate=0");
    expect(url).toContain("chrome=0");
  });

  it("round-trips settings through query params", () => {
    const settings = resolveEmbedSettings({ showTitle: false, brandingText: "Acme" });
    const qs = embedSettingsToQuery(settings);
    const params = Object.fromEntries(new URLSearchParams(qs.replace(/^\?/, "")));
    const parsed = parseEmbedUrlParams(params);
    expect(resolveEmbedSettings(null, parsed).showTitle).toBe(false);
    expect(resolveEmbedSettings(null, parsed).brandingText).toBe("Acme");
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

  it("defaults shopper embed to stay on the jeweler site", () => {
    expect(resolveEmbedSettings(null).showStudioLink).toBe(false);
  });

  it("resolveEmbedKey prefers sku", () => {
    expect(resolveEmbedKey(" ABC ", "viewer-1")).toBe("ABC");
    expect(resolveEmbedKey(null, "viewer-1")).toBe("viewer-1");
  });
});
