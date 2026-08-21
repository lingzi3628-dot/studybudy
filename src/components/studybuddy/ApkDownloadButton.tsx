"use client";

import { useState, useRef, useCallback } from "react";
import { Download, Check, Loader2, X, Smartphone, FileDown } from "lucide-react";

type DownloadState = "idle" | "downloading" | "complete" | "error" | "cancelled";

/**
 * ApkDownloadButton — Phase 19
 *
 * Downloads the APK with a Play Store-style progress bar.
 * Uses fetch + ReadableStream reader for real-time progress tracking.
 * On complete, creates a Blob URL and triggers the browser download.
 */
export function ApkDownloadButton() {
  const [state, setState] = useState<DownloadState>("idle");
  const [progress, setProgress] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const handleDownload = useCallback(async () => {
    if (state === "downloading") return;

    setState("downloading");
    setProgress(0);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/app-release.apk", { signal: controller.signal });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const total = Number(response.headers.get("content-length")) || 0;
      const reader = response.body?.getReader();

      if (!reader || total === 0) {
        // No content-length or no stream — just download directly
        const blob = await response.blob();
        triggerDownload(blob);
        setState("complete");
        setProgress(100);
        return;
      }

      // Read in chunks for progress tracking
      let received = 0;
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        received += value.length;
        const pct = Math.round((received / total) * 100);
        setProgress(pct);
      }

      // Combine chunks into a single Blob
      const blob = new Blob(chunks as BlobPart[], { type: "application/vnd.android.package-archive" });
      triggerDownload(blob);
      setState("complete");
      setProgress(100);
    } catch (e: any) {
      if (e?.name === "AbortError" || controller.signal.aborted) {
        setState("cancelled");
      } else {
        console.error("APK download failed:", e?.message);
        setState("error");
      }
    } finally {
      abortRef.current = null;
    }
  }, [state]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setState("cancelled");
  }, []);

  const handleRetry = useCallback(() => {
    setState("idle");
    setProgress(0);
  }, []);

  // --- Render ---

  if (state === "complete") {
    return (
      <div className="w-full max-w-sm rounded-2xl bg-emerald-50 border-2 border-emerald-300 p-4 text-center">
        <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500 flex items-center justify-center text-white">
          <Check className="w-6 h-6" />
        </div>
        <p className="mt-2 text-sm font-bold text-gray-900">Download Complete!</p>
        <p className="mt-1 text-xs text-gray-600">
          📱 Tap the downloaded APK file to install on your Android device.
        </p>
        <p className="mt-1 text-[10px] text-gray-400">
          You may need to enable "Install from unknown sources" in Settings.
        </p>
        <button onClick={handleRetry} className="mt-3 text-xs text-indigo-600 font-semibold hover:underline">
          Download again
        </button>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="w-full max-w-sm rounded-2xl bg-rose-50 border-2 border-rose-300 p-4 text-center">
        <p className="text-sm font-bold text-rose-700">Download failed</p>
        <p className="mt-1 text-xs text-gray-500">Please try again or use the web version.</p>
        <button onClick={handleRetry} className="mt-3 px-4 h-9 rounded-full bg-indigo-600 text-white text-xs font-semibold">
          Retry
        </button>
      </div>
    );
  }

  if (state === "downloading") {
    return (
      <div className="w-full max-w-sm rounded-2xl bg-white border-2 border-indigo-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
            <span className="text-xs font-semibold text-gray-700">Downloading APK…</span>
          </div>
          <button onClick={handleCancel} className="text-[10px] text-gray-400 hover:text-rose-500 font-medium">
            Cancel
          </button>
        </div>
        {/* Progress bar — Play Store style */}
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-violet-600 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between text-[10px] text-gray-400">
          <span>{progress}%</span>
          <span className="flex items-center gap-0.5">
            <Smartphone className="w-2.5 h-2.5" /> Android APK
          </span>
        </div>
      </div>
    );
  }

  // idle / cancelled
  return (
    <button
      onClick={handleDownload}
      className="w-full max-w-sm h-12 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-lg hover:bg-indigo-700 transition flex items-center justify-center gap-2"
    >
      <FileDown className="w-4 h-4" />
      {state === "cancelled" ? "Download Again (APK)" : "Download App (APK)"}
    </button>
  );
}

function triggerDownload(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "StudyBuddy-AI.apk";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
