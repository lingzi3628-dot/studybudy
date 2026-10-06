"use client";
import { useState, useEffect } from "react";
import { Play, Loader2, X, RotateCcw } from "lucide-react";

/**
 * CodePlayground — interactive code editor + runner.
 *
 * Phase 9: lets learners write Python + JavaScript, click Run, and see
 * the output inline. Calls /api/tools/sandbox which routes to Tools Hub
 * when enabled (Phase 9 integration). When Tools Hub is disabled, shows
 * a friendly "code execution not available" message.
 *
 * Used in the workspace as a `code_playground` attachment type. Also
 * usable standalone (the AI Tutor can open it for "let's code together"
 * sessions).
 */
export function CodePlayground({
  spec,
  onChange,
}: {
  spec?: any;
  onChange?: (newSpec: any) => void;
}) {
  const initialLang = spec?.language ?? spec?.lang ?? "python";
  const initialCode = spec?.code ?? spec?.content ?? defaultCode(initialLang);

  const [language, setLanguage] = useState<"python" | "javascript">(initialLang === "javascript" || initialLang === "js" ? "javascript" : "python");
  const [code, setCode] = useState(initialCode);
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<{
    stdout?: string;
    stderr?: string;
    exitCode?: number | null;
    unsupported?: boolean;
    durationMs?: number;
  } | null>(null);

  // Persist edits to the parent (workspace tab + DB) when code or language changes.
  useEffect(() => {
    if (!onChange) return;
    onChange({ language, code });
  }, [language, code]); // eslint-disable-line react-hooks/exhaustive-deps

  const runCode = async () => {
    if (!code.trim()) return;
    setRunning(true);
    setOutput(null);
    try {
      const r = await fetch("/api/tools/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, code }),
      });
      const d = await r.json();
      if (!r.ok) {
        setOutput({ stderr: d.error ?? "Run failed", unsupported: true });
      } else {
        setOutput({
          stdout: d.stdout,
          stderr: d.stderr,
          exitCode: d.exitCode,
          unsupported: d.unsupported,
          durationMs: d.durationMs,
        });
      }
    } catch (e: any) {
      setOutput({ stderr: `Network error: ${e?.message ?? e}`, unsupported: true });
    } finally {
      setRunning(false);
    }
  };

  const reset = () => {
    setCode(defaultCode(language));
    setOutput(null);
  };

  const switchLanguage = (lang: "python" | "javascript") => {
    setLanguage(lang);
    setCode(defaultCode(lang));
    setOutput(null);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-2 bg-gray-50 border-b border-gray-200">
        {/* Language selector */}
        <div className="flex bg-gray-200 rounded-full p-0.5">
          <button
            onClick={() => switchLanguage("python")}
            className={`px-3 py-1 rounded-full text-[10px] font-bold transition ${
              language === "python" ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500"
            }`}
          >
            🐍 Python
          </button>
          <button
            onClick={() => switchLanguage("javascript")}
            className={`px-3 py-1 rounded-full text-[10px] font-bold transition ${
              language === "javascript" ? "bg-white text-yellow-600 shadow-sm" : "text-gray-500"
            }`}
          >
            🟨 JavaScript
          </button>
        </div>

        <div className="flex-1" />

        <button
          onClick={reset}
          className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition"
          title="Reset to starter code"
        >
          <RotateCcw className="w-3 h-3" />
          Reset
        </button>
        <button
          onClick={runCode}
          disabled={running || !code.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition"
          title="Run code (Ctrl+Enter)"
        >
          {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
          {running ? "Running…" : "Run"}
        </button>
      </div>

      {/* Editor — textarea for now (can upgrade to CodeMirror later) */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 overflow-hidden">
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              // Ctrl/Cmd+Enter to run
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                runCode();
              }
              // Tab to indent (not focus next element)
              if (e.key === "Tab") {
                e.preventDefault();
                const start = e.currentTarget.selectionStart;
                const end = e.currentTarget.selectionEnd;
                const newValue = code.substring(0, start) + "  " + code.substring(end);
                setCode(newValue);
                e.currentTarget.selectionStart = e.currentTarget.selectionEnd = start + 2;
              }
            }}
            spellCheck={false}
            className="w-full h-full p-3 font-mono text-xs bg-gray-900 text-gray-100 resize-none focus:outline-none"
            style={{ minHeight: "200px" }}
            placeholder={`# Write your ${language} code here...\n# Press Ctrl+Enter (or Cmd+Enter) to run`}
          />
        </div>

        {/* Output panel */}
        {output && (
          <div className="border-t border-gray-300 bg-gray-50 max-h-[40%] overflow-auto">
            <div className="flex items-center justify-between px-3 py-1.5 bg-gray-100 border-b border-gray-200 sticky top-0">
              <span className="text-[10px] font-bold uppercase text-gray-500">
                Output
                {typeof output.durationMs === "number" && output.durationMs > 0 && (
                  <span className="ml-2 text-gray-400">· {output.durationMs}ms</span>
                )}
              </span>
              <button
                onClick={() => setOutput(null)}
                className="text-gray-400 hover:text-gray-600"
                title="Clear output"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="p-3">
              {output.unsupported ? (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                  <div className="font-semibold mb-0.5">Code execution is not available</div>
                  <div className="text-amber-600">
                    {output.stderr || "An admin needs to enable Tools Hub in the admin panel before code can run."}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {output.stdout && (
                    <div>
                      <div className="text-[10px] uppercase font-bold text-emerald-600 mb-0.5">stdout</div>
                      <pre className="text-xs font-mono text-gray-800 bg-white border border-gray-200 rounded p-2 whitespace-pre-wrap break-words">{output.stdout}</pre>
                    </div>
                  )}
                  {output.stderr && (
                    <div>
                      <div className="text-[10px] uppercase font-bold text-red-600 mb-0.5">stderr</div>
                      <pre className="text-xs font-mono text-red-800 bg-red-50 border border-red-200 rounded p-2 whitespace-pre-wrap break-words">{output.stderr}</pre>
                    </div>
                  )}
                  {!output.stdout && !output.stderr && (
                    <pre className="text-xs font-mono text-gray-400 italic">(no output — program ran successfully but printed nothing)</pre>
                  )}
                  {typeof output.exitCode === "number" && (
                    <div className="text-[10px] text-gray-500">
                      Process exited with code <span className="font-mono font-bold">{output.exitCode}</span>
                      {output.exitCode === 0 && <span className="ml-1 text-emerald-600">✓</span>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function defaultCode(language: "python" | "javascript"): string {
  if (language === "python") {
    return `# Welcome to the Python sandbox!
# Write code, then click Run (or press Ctrl+Enter).

name = "World"
print(f"Hello, {name}!")

# Try changing the code and running again:
for i in range(3):
    print(f"  Count: {i + 1}")
`;
  }
  return `// Welcome to the JavaScript sandbox!
// Write code, then click Run (or press Ctrl+Enter).

const name = "World";
console.log(\`Hello, \${name}!\`);

// Try changing the code and running again:
for (let i = 0; i < 3; i++) {
  console.log(\`  Count: \${i + 1}\`);
}
`;
}
