import { describe, expect, it } from "vitest";
import { buildSpinViewerHtml, escapeHtml, scriptSafeJson, type SpinViewerData } from "./spin-viewer";

const frames = (slug: string, count: number) =>
  Array.from({ length: count }, (_, i) => `${slug}/${slug}_${String(i + 1).padStart(3, "0")}.jpg`);

const input = {
  title: 'Solitaire <Halo> & "Co"',
  size: 1080,
  metals: [
    { slug: "18k-yellow-gold", label: "18K Yellow Gold", frames: frames("18k-yellow-gold", 72) },
    { slug: "platinum", label: "Platinum", frames: frames("platinum", 72) },
  ],
};

function scripts(html: string): string[] {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].map((match) => {
    expect(match[1]!.trim(), "script must be inline").toBe("");
    return match[2]!;
  });
}

function embeddedData(html: string): SpinViewerData {
  const script = scripts(html)[0]!;
  const json = script.match(/var DATA = (\{[\s\S]*?\});\n/)![1]!;
  return JSON.parse(json) as SpinViewerData;
}

describe("buildSpinViewerHtml", () => {
  const html = buildSpinViewerHtml(input);

  it("is a complete HTML document", () => {
    expect(html.startsWith("<!doctype html>\n<html lang=\"en\">")).toBe(true);
    expect(html.trimEnd().endsWith("</html>")).toBe(true);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<meta name="viewport"');
    for (const tag of ["html", "head", "body", "style", "script", "main", "div", "button", "canvas"]) {
      const open = (html.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length;
      const close = (html.match(new RegExp(`</${tag}>`, "g")) ?? []).length;
      expect(open, `<${tag}> balanced`).toBe(close);
    }
  });

  it("has exactly one inline script that parses as JavaScript", () => {
    const all = scripts(html);
    expect(all).toHaveLength(1);
    expect(() => new Function(all[0]!)).not.toThrow();
  });

  it("embeds the frame list for every metal", () => {
    const data = embeddedData(html);
    expect(data.metals.map((metal) => metal.slug)).toEqual(["18k-yellow-gold", "platinum"]);
    expect(data.metals[0]!.frames).toHaveLength(72);
    expect(data.metals[1]!.frames[71]).toBe("platinum/platinum_072.jpg");
    expect(data.size).toBe(1080);
    expect(data.autoplayFps).toBeGreaterThan(0);
  });

  it("works offline: no external resources", () => {
    expect(html).not.toMatch(/\b(?:src|href)=["']?(?:https?:)?\/\//i);
    expect(html).not.toMatch(/@import|url\(\s*["']?https?:/i);
  });

  it("supports drag, wheel, touch (pointer events), keys and autoplay", () => {
    const script = scripts(html)[0]!;
    for (const needle of ["pointerdown", "pointermove", "wheel", "keydown", "setPointerCapture", "requestAnimationFrame", "prefers-reduced-motion"]) {
      expect(script).toContain(needle);
    }
    expect(html).toContain("touch-action:none");
    expect(html).toContain('id="play"');
  });

  it("escapes the title and keeps the JSON script-safe", () => {
    expect(html).toContain("Solitaire &lt;Halo&gt; &amp; &quot;Co&quot;");
    expect(html).not.toContain("<Halo>");
    expect(scriptSafeJson({ t: "</script><b>" })).not.toContain("</script>");
    expect(escapeHtml("'")).toBe("&#39;");
  });

  it("drops metals without frames", () => {
    const data = embeddedData(buildSpinViewerHtml({ ...input, metals: [...input.metals, { slug: "x", label: "X", frames: [] }] }));
    expect(data.metals).toHaveLength(2);
  });
});
