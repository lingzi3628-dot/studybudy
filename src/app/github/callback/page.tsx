"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2, Check, X, Github } from "lucide-react";

function GitHubCallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);

  const code = searchParams.get("code");
  const state = searchParams.get("state");

  useEffect(() => {
    if (!code) {
      setStatus("error");
      setError("No OAuth code received from GitHub");
      return;
    }

    fetch("/api/github/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          setStatus("success");
          setUsername(d.username);
          setTimeout(() => router.push("/"), 3000);
        } else {
          setStatus("error");
          setError(d.error || "Failed to connect GitHub account");
        }
      })
      .catch(e => {
        setStatus("error");
        setError(e?.message ?? "Network error");
      });
  }, [code, state, router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-gray-200 p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-900 flex items-center justify-center">
          <Github className="w-8 h-8 text-white" />
        </div>

        {status === "loading" && (
          <>
            <Loader2 className="w-6 h-6 animate-spin text-indigo-600 mx-auto mb-2" />
            <h1 className="text-lg font-bold text-gray-900">Connecting GitHub…</h1>
            <p className="text-sm text-gray-500 mt-1">Authorizing your account</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-emerald-100 flex items-center justify-center">
              <Check className="w-5 h-5 text-emerald-600" />
            </div>
            <h1 className="text-lg font-bold text-gray-900">GitHub Connected!</h1>
            <p className="text-sm text-gray-500 mt-1">
              Connected as <span className="font-semibold">{username}</span>
            </p>
            <p className="text-xs text-gray-400 mt-3">Redirecting in 3 seconds…</p>
          </>
        )}

        {status === "error" && (
          <>
            <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-red-100 flex items-center justify-center">
              <X className="w-5 h-5 text-red-600" />
            </div>
            <h1 className="text-lg font-bold text-gray-900">Connection Failed</h1>
            <p className="text-sm text-red-500 mt-1">{error}</p>
            <button
              onClick={() => router.push("/")}
              className="mt-4 px-4 py-2 rounded-full bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700"
            >
              Go home
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function GitHubCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    }>
      <GitHubCallbackContent />
    </Suspense>
  );
}
