/**
 * web-preview tests — Phase 54 (WebBuddy)
 *
 * Covers the pure preview assembler that powers the live iframe:
 *   - entry HTML detection
 *   - relative reference resolution (./, ../, root-relative, external)
 *   - <link> CSS inlining
 *   - <script src> JS inlining (incl. type="module" preservation)
 *   - console bridge injection
 *   - non-previewable sets
 *
 * Run: npx vitest run src/lib/web-preview.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  buildPreviewDocument,
  findEntryHtml,
  isPreviewable,
  resolveRef,
  CONSOLE_BRIDGE_SNIPPET,
} from "./web-preview";

describe("resolveRef", () => {
  it("resolves plain filenames against the html's directory", () => {
    expect(resolveRef("app/index.html", "styles.css")).toBe("app/styles.css");
    expect(resolveRef("index.html", "app.js")).toBe("app.js");
  });

  it("resolves ./ and ../ segments", () => {
    expect(resolveRef("app/index.html", "./styles/main.css")).toBe("app/styles/main.css");
    expect(resolveRef("app/pages/index.html", "../shared/app.js")).toBe("app/shared/app.js");
  });

  it("treats leading / as root-relative", () => {
    expect(resolveRef("app/index.html", "/static/app.js")).toBe("static/app.js");
  });

  it("returns null for external URLs, data URIs, and hash refs", () => {
    expect(resolveRef("index.html", "https://cdn.example.com/x.css")).toBeNull();
    expect(resolveRef("index.html", "//cdn.example.com/x.css")).toBeNull();
    expect(resolveRef("index.html", "data:image/png;base64,AAA")).toBeNull();
    expect(resolveRef("index.html", "#top")).toBeNull();
  });

  it("strips query strings and hashes from refs", () => {
    expect(resolveRef("index.html", "app.js?v=2")).toBe("app.js");
  });
});

describe("findEntryHtml / isPreviewable", () => {
  it("prefers index.html over other html files", () => {
    const files = [
      { path: "about.html", content: "<p>about</p>" },
      { path: "index.html", content: "<p>home</p>" },
    ];
    expect(findEntryHtml(files)?.path).toBe("index.html");
  });

  it("falls back to the first .html file", () => {
    const files = [{ path: "landing.html", content: "<p>x</p>" }];
    expect(findEntryHtml(files)?.path).toBe("landing.html");
  });

  it("returns null when there is no html at all", () => {
    expect(findEntryHtml([{ path: "app.js", content: "console.log(1)" }])).toBeNull();
    expect(isPreviewable([{ path: "styles.css", content: "body{}" }])).toBe(false);
  });
});

describe("buildPreviewDocument — inlining", () => {
  const files = [
    {
      path: "index.html",
      content: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="styles.css">
  <link rel="stylesheet" href="https://cdn.example.com/bootstrap.css">
</head>
<body>
  <h1>Hello</h1>
  <script src="app.js"></script>
  <script src="https://cdn.example.com/analytics.js"></script>
</body>
</html>`,
    },
    { path: "styles.css", content: "h1 { color: red; }" },
    { path: "app.js", content: "console.log('from app.js');" },
  ];

  it("inlines local CSS as <style> and keeps external CDN links", () => {
    const doc = buildPreviewDocument(files)!;
    expect(doc).toContain("<style data-from=\"styles.css\">");
    expect(doc).toContain("h1 { color: red; }");
    expect(doc).toContain('href="https://cdn.example.com/bootstrap.css"');
  });

  it("inlines local JS and keeps external CDN scripts", () => {
    const doc = buildPreviewDocument(files)!;
    expect(doc).toContain("<script data-from=\"app.js\">");
    expect(doc).toContain("console.log('from app.js');");
    expect(doc).toContain('src="https://cdn.example.com/analytics.js"');
  });

  it("injects the console bridge into <head>", () => {
    const doc = buildPreviewDocument(files)!;
    expect(doc).toContain("__webbuddyPreview");
    const headEnd = doc.indexOf("</head>");
    const bridgePos = doc.indexOf("__webbuddyPreview");
    expect(bridgePos).toBeGreaterThan(-1);
    expect(bridgePos).toBeLessThan(headEnd);
  });

  it("works without a <head> tag (bridge prepended)", () => {
    const doc = buildPreviewDocument([
      { path: "index.html", content: "<p>no head</p>" },
    ])!;
    expect(doc.startsWith("<script>")).toBe(true);
    expect(doc).toContain("no head");
  });

  it("preserves type=module on inlined scripts", () => {
    const doc = buildPreviewDocument([
      { path: "index.html", content: '<script src="m.js" type="module"></script>' },
      { path: "m.js", content: "export default 1;" },
    ])!;
    expect(doc).toContain('<script type="module" data-from="m.js">');
  });

  it("leaves missing local assets untouched (no crash)", () => {
    const doc = buildPreviewDocument([
      { path: "index.html", content: '<script src="does-not-exist.js"></script><p>ok</p>' },
    ])!;
    expect(doc).toContain('src="does-not-exist.js"');
    expect(doc).toContain("ok");
  });

  it("returns null for sets without an html entry", () => {
    expect(buildPreviewDocument([{ path: "app.js", content: "1+1" }])).toBeNull();
  });

  it("the bridge snippet is valid script markup (no accidental closing tag)", () => {
    expect(CONSOLE_BRIDGE_SNIPPET.startsWith("<script>")).toBe(true);
    expect(CONSOLE_BRIDGE_SNIPPET.endsWith("</script>")).toBe(true);
    expect(CONSOLE_BRIDGE_SNIPPET).toContain("postMessage");
  });
});
