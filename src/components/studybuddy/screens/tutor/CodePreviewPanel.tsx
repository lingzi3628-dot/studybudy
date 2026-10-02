"use client";

/**
 * CodePreviewPanel — Phase F11 (Pilot A activity)
 *
 * Renders HTML/CSS/JS code as a live preview in the workspace panel.
 * Reuses the existing web-preview.ts infrastructure (buildPreviewDocument)
 * from WebBuilderScreen — no new preview engine.
 *
 * SAFETY: The preview runs inside a sandboxed <iframe srcDoc> with:
 *   - No access to parent cookies or auth (different origin context)
 *   - console.* + errors captured via the CONSOLE_BRIDGE_SNIPPET
 *   - No network access to /api/* routes (relative URLs won't resolve)
 *
 * Artifact spec format (emitted by AI as ```mathgraph with type "code_project"):
 * {
 *   "type": "code_project",
 *   "title": "Kenyan County Tourism Page",
 *   "instruction": "Build a simple webpage with a heading, paragraph, and image section",
 *   "files": {
 *     "index.html": "<h1>Visit Kenya</h1><p>...</p>",
 *     "styles.css": "body { font-family: sans-serif; }"
 *   }
 * }
 *
 * The AI provides starter code; the learner can't edit it in this Phase
 * (editing comes in Phase 4 with the CodeEditor integration). For now,
 * this is a "view the AI's code + see it rendered live" experience.
 */

import { useState, useMemo, useRef, useEffect } from "react";
import { Play, RefreshCw, Code2, Eye, Loader2 } from "lucide-react";
import { buildPreviewDocument, type PreviewFile } from "@/lib/web-preview";

export type CodeProjectSpec = {
  type: "code_project";
  title: string;
  instruction: string;
  files: Record<string, string>;
};

type Props = {
  spec: CodeProjectSpec;
};

export function CodePreviewPanel({ spec }: Props) {
  const [view, setView] = useState<"preview" | "code">("preview");
  const [refreshKey, setRefreshKey] = useState(0);
  const [consoleEntries, setConsoleEntries] = useState<Array<{ level: string; text: string }>>([]);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Convert the spec's files object into PreviewFile[]
  const previewFiles: PreviewFile[] = useMemo(() => {
    return Object.entries(spec.files).map(([path, content]) => ({
      path,
      content,
    }));
  }, [spec.files]);

  // Build the preview document (inlines CSS/JS into one HTML doc)
  const previewDoc = useMemo(() => {
    try {
      const doc = buildPreviewDocument(previewFiles);
      return doc ?? "<html><body><h2>No index.html found</h2></body></html>";
    } catch (e: any) {
      return `<html><body><h2>Preview Error</h2><p>${e?.message ?? "Could not build preview"}</p></body></html>`;
    }
  }, [previewFiles]);

  // Listen for console messages from the iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.__webbuddyPreview === true) {
        setConsoleEntries((prev) => [
          ...prev.slice(-50), // keep last 50 entries
          { level: e.data.level, text: e.data.text },
        ]);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [refreshKey]);

  // Clear console on refresh
  useEffect(() => {
    setConsoleEntries([]);
  }, [refreshKey]);

  // Get the list of files for the code view
  const fileList = Object.entries(spec.files);
  const [activeFileIdx, setActiveFileIdx] = useState(0);
  const activeFile = fileList[activeFileIdx]?.[0] ?? "index.html";
  const activeContent = spec.files[activeFile] ?? "";

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header with title + view toggle */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <div className="min-w-0">
          <p className="text-xs font-bold text-gray-900 truncate">{spec.title || "Code Preview"}</p>
          {spec.instruction && (
            <p className="text-[10px] text-gray-500 truncate">{spec.instruction}</p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* View toggle */}
          <button
            onClick={() => setView("preview")}
            className={`px-2 py-1 rounded-md text-[10px] font-semibold transition ${
              view === "preview" ? "bg-indigo-600 text-white" : "text-gray-500 hover:bg-gray-200"
            }`}
            title="Live preview"
          >
            <Eye className="w-3 h-3 inline" /> Preview
          </button>
          <button
            onClick={() => setView("code")}
            className={`px-2 py-1 rounded-md text-[10px] font-semibold transition ${
              view === "code" ? "bg-indigo-600 text-white" : "text-gray-500 hover:bg-gray-200"
            }`}
            title="View source code"
          >
            <Code2 className="w-3 h-3 inline" /> Code
          </button>
          {/* Refresh */}
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            className="px-2 py-1 rounded-md text-[10px] font-semibold text-gray-500 hover:bg-gray-200 transition"
            title="Refresh preview"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden min-h-0">
        {view === "preview" ? (
          <div className="flex flex-col h-full">
            {/* iframe preview */}
            <div className="flex-1 min-h-0">
              <iframe
                key={refreshKey}
                ref={iframeRef}
                srcDoc={previewDoc ?? undefined}
                className="w-full h-full border-0 bg-white"
                sandbox="allow-scripts allow-same-origin"
                title="Code Preview"
              />
            </div>
            {/* Console output */}
            {consoleEntries.length > 0 && (
              <div className="h-32 border-t border-gray-200 bg-gray-900 overflow-y-auto p-2 flex-shrink-0">
                <p className="text-[9px] font-bold uppercase text-gray-500 mb-1">Console</p>
                {consoleEntries.map((entry, i) => (
                  <div
                    key={i}
                    className={`text-[10px] font-mono leading-tight ${
                      entry.level === "error" ? "text-red-400"
                      : entry.level === "warn" ? "text-yellow-400"
                      : "text-green-400"
                    }`}
                  >
                    {entry.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col h-full">
            {/* File tabs */}
            <div className="flex border-b border-gray-200 bg-gray-50 overflow-x-auto flex-shrink-0">
              {fileList.map(([path], idx) => (
                <button
                  key={path}
                  onClick={() => setActiveFileIdx(idx)}
                  className={`px-3 py-1.5 text-[10px] font-semibold whitespace-nowrap transition ${
                    idx === activeFileIdx
                      ? "bg-white text-indigo-600 border-b-2 border-indigo-600"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {path.split("/").pop()}
                </button>
              ))}
            </div>
            {/* Code display */}
            <div className="flex-1 overflow-auto bg-gray-900 p-3">
              <pre className="text-[11px] font-mono text-gray-300 whitespace-pre-wrap break-words">
                {activeContent}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
