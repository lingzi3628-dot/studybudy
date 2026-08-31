/**
 * web-preview.ts — Phase 54 (WebBuddy)
 *
 * Pure preview assembler for the WebBuilderScreen live iframe.
 *
 * The AI (and the user) write a MULTI-FILE site: index.html + styles.css +
 * app.js. An <iframe srcdoc> can only render a single document, so this
 * module inlines every referenced local asset:
 *
 *   <link rel="stylesheet" href="styles.css">  →  <style>…css content…</style>
 *   <script src="app.js"></script>             →  <script>…js content…</script>
 *   <img src="logo.png"> with a data file?     →  left as-is (only css/js inline)
 *
 * It also injects a console bridge so the preview panel can show logs and
 * runtime errors next to the code (like a real devtools-lite): every
 * console.* call and uncaught error is postMessage'd to the parent window.
 *
 * Everything here is synchronous and pure — fully unit-testable.
 */

export type PreviewFile = {
  path: string;
  content: string;
};

/** The script injected at the top of <head> — forwards console + errors to parent. */
export const CONSOLE_BRIDGE_SNIPPET = `<script>(function(){
  var send=function(level,args){try{parent.postMessage({__webbuddyPreview:true,level:level,text:Array.prototype.map.call(args,function(a){
    try{return (typeof a==="object"&&a!==null)?JSON.stringify(a):String(a);}catch(e){return String(a);}
  }).join(" ")}, "*");}catch(e){}};
  ["log","warn","error","info"].forEach(function(m){var orig=console[m];console[m]=function(){send(m,arguments);if(orig)orig.apply(console,arguments);};});
  window.addEventListener("error",function(e){send("error",[e.message+" ("+(e.filename||"preview")+":"+e.lineno+")"]);});
  window.addEventListener("unhandledrejection",function(e){send("error",["Unhandled promise rejection: "+(e.reason&&e.reason.message?e.reason.message:e.reason)]);});
})();<\/script>`;

/**
 * Resolve a relative href/src against the directory of the given html path.
 * e.g. resolveRef("app/index.html", "./styles/main.css") === "app/styles/main.css"
 * Also handles leading "/" (root-relative) and plain filenames.
 */
export function resolveRef(htmlPath: string, ref: string): string | null {
  if (!ref || /^(https?:)?\/\//i.test(ref) || ref.startsWith("data:") || ref.startsWith("mailto:") || ref.startsWith("#")) {
    return null;
  }
  const clean = ref.split(/[?#]/)[0];
  if (clean.startsWith("/")) return clean.slice(1);
  const dir = htmlPath.includes("/") ? htmlPath.slice(0, htmlPath.lastIndexOf("/") + 1) : "";
  const stack = (dir + clean).split("/");
  const out: string[] = [];
  for (const seg of stack) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return out.join("/");
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Make a file path safe for an HTML attribute value (NOT regex-escaped). */
function attrSafe(s: string): string {
  return s.replace(/["'<>\\]/g, "");
}

/**
 * Pick the entry HTML file: an explicit index.html, else the first .html.
 */
export function findEntryHtml(files: PreviewFile[]): PreviewFile | null {
  const htmls = files.filter((f) => f.path.toLowerCase().endsWith(".html"));
  if (htmls.length === 0) return null;
  return htmls.find((f) => f.path.toLowerCase() === "index.html" || f.path.toLowerCase().endsWith("/index.html")) ?? htmls[0];
}

/**
 * Assemble a single self-contained HTML document ready for iframe srcdoc.
 * Returns null when the file set has no .html entry.
 */
export function buildPreviewDocument(files: PreviewFile[]): string | null {
  const entry = findEntryHtml(files);
  if (!entry) return null;

  const byPath = new Map<string, PreviewFile>();
  for (const f of files) byPath.set(f.path.replace(/^\.\//, ""), f);

  let html = entry.content;

  // 1) Inline <link rel="stylesheet" href="...">
  html = html.replace(/<link\b[^>]*>/gi, (tag) => {
    if (!/stylesheet/i.test(tag)) return tag;
    const href = tag.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) return tag;
    const resolved = resolveRef(entry.path, href);
    const asset = resolved ? byPath.get(resolved) : undefined;
    if (!asset) return tag; // external CDN link or missing file — leave untouched
    return `<style data-from="${attrSafe(asset.path)}">\n${asset.content}\n</style>`;
  });

  // 2) Inline <script src="..."></script>
  html = html.replace(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>\s*<\/script>/gi, (tag, src: string) => {
    const resolved = resolveRef(entry.path, src);
    const asset = resolved ? byPath.get(resolved) : undefined;
    if (!asset) return tag;
    const typeAttr = /type\s*=\s*["']module["']/i.test(tag) ? ' type="module"' : "";
    return `<script${typeAttr} data-from="${attrSafe(asset.path)}">\n${asset.content}\n</script>`;
  });

  // 3) Inject the console bridge right after <head> (or at the very top).
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head[^>]*>/i, (m) => `${m}\n${CONSOLE_BRIDGE_SNIPPET}`);
  } else {
    html = `${CONSOLE_BRIDGE_SNIPPET}\n${html}`;
  }

  return html;
}

/**
 * Is this file set previewable at all? (has an entry html)
 */
export function isPreviewable(files: PreviewFile[]): boolean {
  return findEntryHtml(files) !== null;
}
