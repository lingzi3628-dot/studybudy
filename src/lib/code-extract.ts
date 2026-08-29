/**
 * extractCodeFiles — Phase 48 helper
 *
 * Parses an AI reply and extracts code blocks as if they were files in a
 * project. Two modes:
 *
 *   1. Annotated code blocks (preferred) — the AI uses the WebBuddy/DevBuddy
 *      convention of putting the file path in the language tag:
 *      ```python path="src/main.py"
 *      print("hello")
 *      ```
 *      → extracts to [{ path: "src/main.py", language: "python", content: "print(\"hello\")", isEntry: true }]
 *
 *   2. Unannotated code blocks (fallback) — the AI uses a plain language tag:
 *      ```python
 *      print("hello")
 *      ```
 *      → extracts to [{ path: "main.py", language: "python", content: "...", isEntry: true }]
 *      (uses a default filename based on the language; first one is marked as entry)
 *
 * Only used when the active buddy is one that supports code files
 * (dev, web, backend). Other buddies' code blocks are ignored.
 *
 * Returns null if no code blocks were found.
 */

export type ExtractedFile = {
  path: string;
  language: string;  // CodeEditor language id (e.g. "python", "javascript")
  content: string;
  isEntry: boolean;
};

const DEFAULT_FILENAMES: Record<string, string> = {
  python: "main.py",
  javascript: "main.js",
  typescript: "main.ts",
  js: "main.js",
  ts: "main.ts",
  jsx: "App.jsx",
  tsx: "App.tsx",
  sql: "schema.sql",
  markdown: "README.md",
  md: "README.md",
  json: "data.json",
  html: "index.html",
  css: "styles.css",
  yaml: "config.yaml",
  yml: "config.yml",
  bash: "script.sh",
  sh: "script.sh",
  go: "main.go",
  rust: "main.rs",
  rs: "main.rs",
};

/**
 * Map a code-block language tag to the CodeEditor's language id.
 */
function normalizeLanguage(lang: string): string {
  const l = lang.toLowerCase().trim();
  if (l === "py") return "python";
  if (l === "js" || l === "mjs" || l === "cjs") return "javascript";
  if (l === "ts") return "typescript";
  if (l === "md") return "markdown";
  if (l === "yml") return "yaml";
  if (l === "sh" || l === "shell") return "bash";
  if (l === "rs") return "rust";
  return l;
}

/**
 * Extract code files from an AI reply.
 * Returns an array of { path, language, content, isEntry } or null if no
 * code blocks were found.
 *
 * The first Python/JS/TS file is marked as the entry point (isEntry=true).
 * If the AI used path= annotations, the file marked as isEntry in the AI
 * output is respected.
 */
export function extractCodeFiles(reply: string): ExtractedFile[] | null {
  if (!reply) return null;

  // Match fenced code blocks: ```lang path="..." ... ```
  // The `path="..."` is optional and may be quoted with single or double quotes.
  // We also handle path=... without quotes (less common but tolerant).
  const codeBlockRe = /```([\w+-]+)(?:\s+path\s*=\s*["']([^"']+)["'])?[^`\n]*\n([\s\S]*?)```/g;
  const files: ExtractedFile[] = [];
  let match: RegExpExecArray | null;
  let foundAnnotated = false;

  while ((match = codeBlockRe.exec(reply)) !== null) {
    const lang = normalizeLanguage(match[1]);
    const path = match[2];  // may be undefined
    const content = match[3].trimEnd();

    // Skip non-code blocks the AI might emit (mathgraph, examgen, text, etc.)
    // BUT only if there's no path= annotation — if the AI explicitly tagged a
    // block with a path like `text path="config.json"`, that's a real file.
    if (!path && ["mathgraph", "examgen", "text", "csv", "mermaid", "plain"].includes(lang)) continue;

    if (path) {
      foundAnnotated = true;
      files.push({
        path,
        language: detectLanguageFromPath(path) ?? lang,
        content,
        isEntry: false,  // will be set below
      });
    } else {
      // No path annotation — use the default filename for this language
      const defaultName = DEFAULT_FILENAMES[lang] ?? `main.${lang}`;
      files.push({
        path: defaultName,
        language: lang,
        content,
        isEntry: false,
      });
    }
  }

  if (files.length === 0) return null;

  // Determine the entry file:
  //   - If the AI used path= annotations, mark the FIRST file as the entry
  //     (the AI convention is that the entry file comes first in the reply).
  //   - If no path= annotations, mark the first Python/JS/TS file as entry.
  //   - If neither, mark the first file as entry.
  let entryIdx = 0;
  if (foundAnnotated) {
    entryIdx = 0;  // already correct — first file is the entry
  } else {
    const runnableIdx = files.findIndex((f) =>
      ["python", "javascript", "typescript", "jsx", "tsx"].includes(f.language)
    );
    if (runnableIdx >= 0) entryIdx = runnableIdx;
  }
  files[entryIdx].isEntry = true;

  return files;
}

/**
 * Helper: detect the CodeEditor language from a file path extension.
 * Returns null if the extension isn't recognized.
 * (Duplicated from CodeEditor.tsx to avoid a circular import.)
 */
function detectLanguageFromPath(path: string): string | null {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "py": return "python";
    case "js": case "mjs": case "cjs": return "javascript";
    case "ts": return "typescript";
    case "jsx": return "jsx";
    case "tsx": return "tsx";
    case "sql": return "sql";
    case "md": case "markdown": return "markdown";
    case "json": return "json";
    case "html": case "htm": return "html";
    case "css": return "css";
    default: return null;
  }
}
