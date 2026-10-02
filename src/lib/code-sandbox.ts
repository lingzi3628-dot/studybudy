/**
 * Code sandbox — Phase 74 / Phase 0 (security containment)
 *
 * Executes Python and JavaScript code snippets.
 *
 * PHASE 0 SECURITY CONTAINMENT:
 *   Server-side code execution is DISABLED BY DEFAULT.
 *   - TUTOR_SERVER_PYTHON_EXECUTION_ENABLED (default: false)
 *   - TUTOR_SERVER_JAVASCRIPT_EXECUTION_ENABLED (default: false)
 *
 *   When disabled, runCode() returns an `unsupported` result WITHOUT:
 *     - Spawning a child_process
 *     - Creating a vm.Script
 *     - Accessing the filesystem
 *     - Accessing environment variables
 *     - Making network calls
 *
 *   Kill switches are at this lowest level so ALL callers are covered:
 *     - tutor-tools.ts (auth-gated tutor chat)
 *     - bot-engine.ts (deployed bots, embed routes, Slack/Telegram webhooks)
 *     - plugins/executor.ts (custom plugin execution)
 *
 * LEGACY SECURITY NOTES (for when execution is re-enabled in the future):
 *   - JavaScript: Node's `vm` module — NOT a security boundary per Node docs.
 *     Escaped prototype chains can reach the host. Only suitable for low-stakes
 *     tutor code, not untrusted input.
 *   - Python: child_process.exec with python3 -c. Full site-packages loaded,
 *     unrestricted FS + network. NOT safe for untrusted code.
 *   For production untrusted execution, use a separately isolated service
 *   (Docker container, E2B, or a managed sandbox provider).
 */

import vm from "node:vm";
import { exec } from "node:child_process";
import {
  isServerPythonExecutionEnabled,
  isServerJavascriptExecutionEnabled,
  PYTHON_UNSUPPORTED_MESSAGE,
  JAVASCRIPT_UNSUPPORTED_MESSAGE,
} from "./security-config";

// === Types ===

export type CodeResult = {
  language: "javascript" | "python";
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
  /** Phase 0 — true when execution was not attempted because the kill switch was off. */
  unsupported?: boolean;
};

// === JavaScript sandbox (Node vm) ===

const JS_TIMEOUT_MS = 5000;

/**
 * Execute JavaScript in a sandboxed V8 context.
 *
 * Phase 0: DISABLED by default. Returns `unsupported` without creating
 * a vm.Script or executing any code when the kill switch is off.
 */
export async function runJavaScript(code: string): Promise<CodeResult> {
  // Phase 0 — Kill switch check FIRST. Do NOT create vm.Script when disabled.
  if (!isServerJavascriptExecutionEnabled()) {
    return {
      language: "javascript",
      stdout: "",
      stderr: JAVASCRIPT_UNSUPPORTED_MESSAGE,
      exitCode: null,
      durationMs: 0,
      timedOut: false,
      unsupported: true,
    };
  }

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
 * Execute Python code via subprocess.
 *
 * Phase 0: DISABLED by default. Returns `unsupported` without spawning
 * a child_process or accessing the filesystem when the kill switch is off.
 */
export async function runPython(code: string): Promise<CodeResult> {
  // Phase 0 — Kill switch check FIRST. Do NOT spawn process when disabled.
  if (!isServerPythonExecutionEnabled()) {
    return {
      language: "python",
      stdout: "",
      stderr: PYTHON_UNSUPPORTED_MESSAGE,
      exitCode: null,
      durationMs: 0,
      timedOut: false,
      unsupported: true,
    };
  }

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
