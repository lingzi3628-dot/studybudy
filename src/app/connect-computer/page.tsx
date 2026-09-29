"use client";

import { useState, type FormEvent } from "react";

export default function ConnectComputerPage() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const connect = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/pairing-codes/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "That code could not be used.");
      if (data.topicId && data.conversationId) localStorage.setItem(`studybuddy-room-chat.${data.topicId}`, data.conversationId);
      else if (data.conversationId) localStorage.setItem("studybuddy.tutor.lastConversationId", data.conversationId);
      if (data.workspaceOffer) localStorage.setItem("studybuddy.pendingComputerWorkspace", JSON.stringify({ ...data.workspaceOffer, topicId: data.topicId || null }));
      const params = new URLSearchParams();
      if (data.topicId) params.set("continueTopic", data.topicId);
      else if (data.conversationId) params.set("continueTutor", "1");
      const query = params.toString();
      window.location.assign(query ? `/?${query}` : "/");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not connect this computer.");
    } finally {
      setBusy(false);
    }
  };

  return <main className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-violet-50 px-5 py-12 flex items-center justify-center">
    <form onSubmit={connect} className="w-full max-w-md rounded-3xl border border-indigo-100 bg-white p-7 shadow-xl shadow-indigo-100/50">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-xl text-white">✦</div>
      <p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-600">Continue learning</p>
      <h1 className="mt-2 text-2xl font-bold text-gray-900">Connect your computer</h1>
      <p className="mt-2 text-sm leading-6 text-gray-600">Enter the one-time code from your StudyBuddy app. Your room, lesson, and tutor conversation will open here. The code expires after 8 minutes.</p>
      <label htmlFor="pairing-code" className="mt-6 block text-xs font-semibold text-gray-700">12-character code</label>
      <input id="pairing-code" autoComplete="one-time-code" autoCapitalize="characters" value={code} onChange={(event) => setCode(event.target.value.replace(/[^a-f0-9]/gi, "").slice(0, 12).toUpperCase())} placeholder="A1B2C3D4E5F6" className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-3 font-mono text-lg tracking-[.18em] outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" />
      {error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
      <button disabled={busy || code.length !== 12} className="mt-5 w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Connecting…" : "Connect and continue"}</button>
      <p className="mt-4 text-center text-xs text-gray-500">No separate website account is needed. Only pair computers you trust.</p>
    </form>
  </main>;
}
