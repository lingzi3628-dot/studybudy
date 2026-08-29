"use client";

/**
 * useJSRunner — Phase 48
 *
 * A React hook that runs JavaScript code in a Web Worker sandbox.
 * The worker is created from a Blob URL so we don't need a separate file.
 *
 * Why a Web Worker (not eval in the main thread):
 *   - Infinite loops can't freeze the UI — we can kill the worker
 *   - The worker has no access to the DOM, localStorage, cookies, or
 *     the main thread's globals (safer than eval)
 *   - Network calls go through the worker's own fetch (separate from
 *     the page's auth context)
 *
 * What we DON'T sandbox:
 *   - The worker CAN call fetch() — but it can't access cookies from the
 *     main page (different origin context). For a learning tool this is
 *     acceptable. If we ever need full isolation, we'd use QuickJS WASM
 *     (400KB dep) — left as a Phase 48+ upgrade.
 *   - We do cap execution time at 5 seconds (configurable) to prevent
 *     infinite loops.
 *
 * Captures:
 *   - console.log/info/warn/error output
 *   - The return value of the last expression (if not undefined)
 *   - Errors (with stack trace if available)
 *
 * Usage:
 *   const { run, isRunning, output, error, stop, clear } = useJSRunner();
 *   run("console.log('hello')").then(result => { ... });
 */

import { useState, useRef, useCallback } from "react";

const WORKER_CODE = `
self.onmessage = function(e) {
  if (e.data.type !== 'run') return;
  const code = e.data.code;
  const timeoutMs = e.data.timeoutMs || 5000;

  const logs = [];
  const origLog = console.log;
  const origInfo = console.info;
  const origWarn = console.warn;
  const origError = console.error;

  const capture = (level) => (...args) => {
    const msg = args.map(a => {
      try {
        if (typeof a === 'object' && a !== null) return JSON.stringify(a, null, 2);
        return String(a);
      } catch { return String(a); }
    }).join(' ');
    logs.push({ level, message: msg });
  };
  console.log = capture('log');
  console.info = capture('info');
  console.warn = capture('warn');
  console.error = capture('error');

  let result = undefined;
  let error = null;
  let timeoutId = null;

  try {
    // Use eval() to run the user code. eval preserves the local scope and
    // returns the value of the last expression, which we assign to result
    // so we can show it in the output panel.
    result = eval(code);
  } catch (err) {
    error = {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
  } finally {
    console.log = origLog;
    console.info = origInfo;
    console.warn = origWarn;
    console.error = origError;
    if (timeoutId) clearTimeout(timeoutId);
  }

  self.postMessage({
    type: 'result',
    logs,
    result: result === undefined ? null : result,
    resultType: result === undefined ? 'undefined' : typeof result,
    error,
  });
};
`;

export type JSLogEntry = {
  level: "log" | "info" | "warn" | "error";
  message: string;
};

export type JSRunResult = {
  ok: boolean;
  logs: JSLogEntry[];
  result: any;
  resultType: string;
  error: { name: string; message: string; stack?: string } | null;
  durationMs: number;
};

export function useJSRunner() {
  const [isRunning, setIsRunning] = useState(false);
  const [output, setOutput] = useState<JSRunResult | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const timeoutRef = useRef<any>(null);

  const run = useCallback((code: string, timeoutMs = 5000): Promise<JSRunResult> => {
    return new Promise((resolve) => {
      // Terminate any existing worker before starting a new run
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      setIsRunning(true);
      const startTime = Date.now();

      // Create a new worker from the Blob URL
      const blob = new Blob([WORKER_CODE], { type: "application/javascript" });
      const blobUrl = URL.createObjectURL(blob);
      const worker = new Worker(blobUrl);
      workerRef.current = worker;

      // Cleanup the blob URL when done (revoke after worker terminates)
      const cleanup = () => {
        URL.revokeObjectURL(blobUrl);
        worker.terminate();
        if (workerRef.current === worker) workerRef.current = null;
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        setIsRunning(false);
      };

      // Hard timeout — kill the worker if it takes too long
      timeoutRef.current = setTimeout(() => {
        const timeoutResult: JSRunResult = {
          ok: false,
          logs: [],
          result: null,
          resultType: "undefined",
          error: {
            name: "TimeoutError",
            message: `Execution exceeded ${timeoutMs}ms — killed. Check for infinite loops.`,
          },
          durationMs: Date.now() - startTime,
        };
        cleanup();
        setOutput(timeoutResult);
        resolve(timeoutResult);
      }, timeoutMs);

      worker.onmessage = (e: MessageEvent) => {
        if (e.data.type !== "result") return;
        const result: JSRunResult = {
          ok: !e.data.error,
          logs: e.data.logs ?? [],
          result: e.data.result,
          resultType: e.data.resultType,
          error: e.data.error,
          durationMs: Date.now() - startTime,
        };
        cleanup();
        setOutput(result);
        resolve(result);
      };

      worker.onerror = (e: ErrorEvent) => {
        const result: JSRunResult = {
          ok: false,
          logs: [],
          result: null,
          resultType: "undefined",
          error: {
            name: "WorkerError",
            message: e.message || "Worker failed to execute",
            stack: undefined,
          },
          durationMs: Date.now() - startTime,
        };
        cleanup();
        setOutput(result);
        resolve(result);
      };

      worker.postMessage({ type: "run", code, timeoutMs });
    });
  }, []);

  const stop = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
      setIsRunning(false);
      setOutput({
        ok: false,
        logs: [],
        result: null,
        resultType: "undefined",
        error: { name: "Killed", message: "Execution was stopped by user." },
        durationMs: 0,
      });
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const clear = useCallback(() => {
    setOutput(null);
  }, []);

  return { run, stop, clear, isRunning, output };
}
