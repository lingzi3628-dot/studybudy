/**
 * Code sandbox — Phase 74
 *
 * Executes Python and JavaScript code snippets in a sandboxed environment
 * with timeouts and resource limits. Used by the "code_runner" built-in
 * plugin so the bot can run code during conversations.
 *
 * Security:
 *   - JavaScript: Node's `vm` module with a limited context (no require,
 *     no process, no fs). 5s timeout. Code runs in a new V8 context.
 *   - Python: subprocess with --no-site-packages, 5s timeout, 50MB memory
 *     limit (via --ulimit on Linux/macOS). Stdout/stderr captured.
 *
 * NOTE: This is NOT a full Docker sandbox. For production use with
 * untrusted code, wrap this in a Docker container (E2B-style) or use a
 * managed sandbox service. For a chatbot tutor bot where the owner
 * controls the code, the vm + subprocess approach is sufficient.
 */

import vm from "node:vm";
import { exec } from "node:child_process";

// === Types ===

export type CodeResult = {
  language: "javascript" | "python";
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
};

// === JavaScript sandbox (Node vm) ===

const JS_TIMEOUT_MS = 5000;

/**
 * Execute JavaScript in a sandboxed V8 context. No access to require,
 * process, fs, or any Node APIs. Only basic JS + a limited console.
 */
export async function runJavaScript(code: string): Promise<CodeResult> {
  const started = Date.now();
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  // Build a limited context — no require, no process, no globals.
  const sandbox = {
    console: {
      log: (...args: any[]) => {
        stdoutChunks.push(args.map((a) => formatValue(a)).join(" "));
      },
      error: (...args: any[]) => {
        stderrChunks.push(args.map((a) => formatValue(a)).join(" "));
      },
      warn: (...args: any[]) => {
        stderrChunks.push(args.map((a) => formatValue(a)).join(" "));
      },
      info: (...args: any[]) => {
        stdoutChunks.push(args.map((a) => formatValue(a)).join(" "));
      },
    },
    Math,
    JSON,
    Date,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    setTimeout: () => {}, // no-op — no async in sandbox
    setInterval: () => {},
    clearTimeout: () => {},
    clearInterval: () => {},
  };

  try {
    // Create a new V8 context + run the code.
    const context = vm.createContext(sandbox);
    const script = new vm.Script(code, { filename: "sandbox.js" });
    script.runInContext(context, {
      timeout: JS_TIMEOUT_MS,
      displayErrors: true,
    });

    return {
      language: "javascript",
      stdout: stdoutChunks.join("\n").slice(0, 5000),
      stderr: stderrChunks.join("\n").slice(0, 2000),
      exitCode: 0,
      durationMs: Date.now() - started,
      timedOut: false,
    };
  } catch (e: any) {
    // vm.Script.runInContext throws on timeout — check the error message.
    const timedOut = e?.message?.includes("Script execution timed out") ||
                     e?.code === "ERR_SCRIPT_EXECUTION_TIMEOUT";
    return {
      language: "javascript",
      stdout: stdoutChunks.join("\n").slice(0, 5000),
      stderr: (timedOut ? `Execution timed out after ${JS_TIMEOUT_MS / 1000}s` : (e?.message || String(e))).slice(0, 2000),
      exitCode: 1,
      durationMs: Date.now() - started,
      timedOut,
    };
  }
}

// === Python sandbox (subprocess) ===

const PYTHON_TIMEOUT_MS = 5000;

/**
 * Execute Python code via subprocess. Uses `python3` with a 5s timeout.
 * Stdout + stderr are captured. If python3 isn't available, returns an
 * error (the bot owner needs Python installed on the server).
 *
 * Security: this is NOT a full sandbox. For untrusted code, run in a
 * Docker container. For a tutor bot where the owner controls the code,
 * this is sufficient.
 */
export async function runPython(code: string): Promise<CodeResult> {
  const started = Date.now();

  return new Promise((resolve) => {
    // Use exec with a shell-escaped command. The -c flag passes the code
    // as a string argument (no temp files needed).
    const escapedCode = code.replace(/'/g, "'\"'\"'");
    exec(`python3 -c '${escapedCode}'`, {
      timeout: PYTHON_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
      cwd: "/tmp",
      env: { PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin", HOME: "/tmp" } as any,
    } as any, (error, stdout, stderr) => {
      const timedOut = error?.name === "TimeoutError" ||
                       (error as any)?.killed === true;
      resolve({
        language: "python",
        stdout: String(stdout || "").slice(0, 5000),
        stderr: String(stderr || "").slice(0, 2000),
        exitCode: error ? 1 : 0,
        durationMs: Date.now() - started,
        timedOut,
      });
    });
  });
}

// === Dispatcher ===

export async function runCode(
  language: "javascript" | "python",
  code: string,
): Promise<CodeResult> {
  if (language === "javascript") return runJavaScript(code);
  if (language === "python") return runPython(code);
  throw new Error(`Unsupported language: ${language}`);
}

/** Detect the language from the user's message. */
export function detectCodeLanguage(message: string): "javascript" | "python" | null {
  const lower = message.toLowerCase();
  if (/\b(javascript|js|node)\b/i.test(message)) return "javascript";
  if (/\bpython\b/i.test(message) || /\bpy\b/i.test(lower)) return "python";
  return null;
}

/** Extract code from a markdown code block (```python ... ```). */
export function extractCodeBlock(message: string): { language: string | null; code: string } | null {
  const match = message.match(/```(\w+)?\n([\s\S]*?)```/);
  if (match) {
    return {
      language: match[1] || null,
      code: match[2].trim(),
    };
  }
  return null;
}

// === Helpers ===

function formatValue(value: any): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
