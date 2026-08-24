"use client";

import { useState } from "react";
import {
  ChevronLeft,
  Mail,
  Lock,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  Users,
  Plus,
  Trash2,
  User,
  Check,
  Copy,
  Sparkles,
} from "lucide-react";
import { useApp } from "../store";

type Child = {
  username: string;
  passcode: string;
  displayName: string;
  gradeLevel: string;
  avatarEmoji: string;
};

const EMOJI_CHOICES = ["🦊", "🐼", "🐯", "🦁", "🐸", "🦉", "🐱", "🐰", "🦊", "🐨"];

/**
 * FamilyRegister — Phase 20
 *
 * Parent signs up with email + password, then creates 2+ child profiles.
 * Each child gets their own username + passcode that they'll use to log in.
 */
export function FamilyRegister() {
  const { setScreen } = useApp();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parent fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [displayName, setDisplayName] = useState("");

  // Children
  const [children, setChildren] = useState<Child[]>([
    { username: "", passcode: "", displayName: "", gradeLevel: "", avatarEmoji: "🦊" },
    { username: "", passcode: "", displayName: "", gradeLevel: "", avatarEmoji: "🐼" },
  ]);

  // Success — after registration, show children credentials
  const [success, setSuccess] = useState<{
    children: Array<{ username: string; displayName: string; avatarEmoji: string }>;
    familyDisplayName: string | null;
  } | null>(null);

  const addChild = () => {
    if (children.length >= 10) return;
    setChildren([
      ...children,
      {
        username: "",
        passcode: "",
        displayName: "",
        gradeLevel: "",
        avatarEmoji: EMOJI_CHOICES[children.length % EMOJI_CHOICES.length],
      },
    ]);
  };

  const removeChild = (i: number) => {
    if (children.length <= 2) return;
    setChildren(children.filter((_, idx) => idx !== i));
  };

  const updateChild = (i: number, field: keyof Child, value: string) => {
    setChildren(children.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)));
  };

  const validateStep1 = (): string | null => {
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return "Please enter a valid email address";
    }
    if (password.length < 6) {
      return "Password must be at least 6 characters";
    }
    return null;
  };

  const validateStep2 = (): string | null => {
    const seenUsernames = new Set<string>();
    for (let i = 0; i < children.length; i++) {
      const c = children[i];
      if (!c.displayName.trim()) return `Child ${i + 1}: Display name is required`;
      if (!c.username.trim() || c.username.length < 3) {
        return `Child ${i + 1}: Username must be at least 3 characters`;
      }
      if (!/^[a-zA-Z0-9_]+$/.test(c.username)) {
        return `Child ${i + 1}: Username can only contain letters, numbers, and underscores`;
      }
      if (c.passcode.length < 4) {
        return `Child ${i + 1}: Passcode must be at least 4 characters`;
      }
      const lower = c.username.toLowerCase();
      if (seenUsernames.has(lower)) {
        return `Child ${i + 1}: Username "${c.username}" is used twice. Please make each child's username unique.`;
      }
      seenUsernames.add(lower);
    }
    return null;
  };

  const submit = async () => {
    const err = validateStep2();
    if (err) {
      setError(err);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/family/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          displayName: displayName.trim() || undefined,
          children: children.map((c) => ({
            username: c.username.trim(),
            passcode: c.passcode,
            displayName: c.displayName.trim(),
            gradeLevel: c.gradeLevel.trim() || undefined,
            avatarEmoji: c.avatarEmoji,
          })),
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        throw new Error(d.error ?? `HTTP ${r.status}`);
      }
      setSuccess({
        children: d.children,
        familyDisplayName: d.family?.displayName ?? null,
      });
      setStep(3);
    } catch (e: any) {
      setError(e?.message ?? "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  const finish = () => {
    // Send the parent to the home screen — they're now logged in.
    setScreen("home");
  };

  // --- Step 3: Success screen with children credentials ---
  if (step === 3 && success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="rounded-3xl bg-white border border-gray-200 shadow-xl overflow-hidden">
            <div className="bg-gradient-to-br from-emerald-600 to-teal-600 p-6 text-center text-white">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-white/10 flex items-center justify-center">
                <Check className="w-6 h-6" />
              </div>
              <h1 className="mt-3 text-lg font-bold">Your family is ready!</h1>
              <p className="text-xs opacity-90 mt-1">
                {success.familyDisplayName ?? "Your family"} · {success.children.length} children
              </p>
            </div>

            <div className="p-5 space-y-4">
              <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-3">
                <p className="text-xs font-semibold text-emerald-700 mb-1">
                  📱 How children log in
                </p>
                <p className="text-[11px] text-emerald-700/80">
                  Each child opens StudyBuddy AI, taps &quot;Family Mode&quot; → &quot;Child Login&quot;,
                  then types their username and passcode.
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Child credentials
                </p>
                {success.children.map((c, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-gray-200 p-3 flex items-center gap-3"
                  >
                    <span className="text-2xl">{c.avatarEmoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{c.displayName}</p>
                      <p className="text-[11px] text-gray-500 font-mono">
                        Username: <span className="font-bold text-gray-700">{c.username}</span>
                      </p>
                      <p className="text-[11px] text-gray-500">
                        Passcode: as you set it
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(
                          `${c.displayName} — username: ${c.username}`
                        );
                      }}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700"
                      title="Copy"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={finish}
                className="w-full h-12 rounded-full bg-emerald-600 text-white font-semibold text-sm shadow-md hover:bg-emerald-700 transition flex items-center justify-center gap-1.5"
              >
                Continue to dashboard <Sparkles className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- Step 1 + 2 form ---
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-violet-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <button
          onClick={() => (step === 1 ? setScreen("landing") : setStep(1))}
          className="text-gray-500 hover:text-gray-900 text-sm flex items-center gap-1 mb-4"
        >
          <ChevronLeft className="w-4 h-4" /> {step === 1 ? "Back to home" : "Back"}
        </button>

        <div className="rounded-3xl bg-white border border-gray-200 shadow-xl overflow-hidden">
          <div className="bg-gradient-to-br from-indigo-600 to-violet-600 p-6 text-center text-white">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-white/10 flex items-center justify-center">
              <Users className="w-6 h-6" />
            </div>
            <h1 className="mt-3 text-lg font-bold">
              {step === 1 ? "Create a Family account" : "Add your children"}
            </h1>
            <p className="text-xs opacity-90 mt-1">
              {step === 1
                ? "One email · Multiple children"
                : `${children.length} ${children.length === 1 ? "child" : "children"} so far`}
            </p>
          </div>

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 py-3 bg-gray-50 border-b border-gray-100">
            <span className={`w-2 h-2 rounded-full ${step >= 1 ? "bg-indigo-600" : "bg-gray-300"}`} />
            <span className="text-[10px] font-bold text-gray-500 uppercase">Parent</span>
            <span className="mx-2 text-gray-300">→</span>
            <span className={`w-2 h-2 rounded-full ${step >= 2 ? "bg-indigo-600" : "bg-gray-300"}`} />
            <span className="text-[10px] font-bold text-gray-500 uppercase">Children</span>
          </div>

          <div className="p-5 space-y-3">
            {/* STEP 1: Parent fields */}
            {step === 1 && (
              <>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Parent Email
                  </label>
                  <div className="mt-1 relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="parent@example.com"
                      className="w-full pl-10 pr-3 p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Password (for parent)
                  </label>
                  <div className="mt-1 relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type={showPw ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className="w-full pl-10 pr-10 p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Family display name (optional)
                  </label>
                  <div className="mt-1 relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="The Smith Family"
                      className="w-full pl-10 pr-3 p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                </div>

                {error && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    const err = validateStep1();
                    if (err) {
                      setError(err);
                      return;
                    }
                    setError(null);
                    setStep(2);
                  }}
                  className="w-full h-12 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700 transition flex items-center justify-center gap-1.5"
                >
                  Next: Add children →
                </button>

                <p className="text-center text-[11px] text-gray-500 mt-2">
                  Family Mode is for parents with 2+ children who want one shared account.
                </p>
              </>
            )}

            {/* STEP 2: Children list */}
            {step === 2 && (
              <>
                <div className="space-y-3">
                  {children.map((c, i) => (
                    <ChildCard
                      key={i}
                      index={i}
                      child={c}
                      canRemove={children.length > 2}
                      onUpdate={(field, value) => updateChild(i, field, value)}
                      onRemove={() => removeChild(i)}
                    />
                  ))}
                </div>

                {children.length < 10 && (
                  <button
                    type="button"
                    onClick={addChild}
                    className="w-full h-10 rounded-xl border border-dashed border-indigo-300 text-indigo-600 font-semibold text-xs hover:bg-indigo-50 flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" /> Add another child
                  </button>
                )}

                {error && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="button"
                  disabled={busy}
                  onClick={submit}
                  className="w-full h-12 rounded-full bg-emerald-600 text-white font-semibold text-sm shadow-md hover:bg-emerald-700 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {busy ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Creating family…
                    </>
                  ) : (
                    <>Create family ({children.length} children)</>
                  )}
                </button>
              </>
            )}
          </div>
        </div>

        <p className="text-center text-[11px] text-gray-400 mt-4">
          StudyBuddy AI · Family Mode
        </p>
      </div>
    </div>
  );
}

function ChildCard({
  index,
  child,
  canRemove,
  onUpdate,
  onRemove,
}: {
  index: number;
  child: Child;
  canRemove: boolean;
  onUpdate: (field: keyof Child, value: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 p-3 space-y-2 bg-gray-50/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{child.avatarEmoji}</span>
          <span className="text-xs font-bold text-gray-500 uppercase">
            Child {index + 1}
          </span>
        </div>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="p-1 rounded-lg hover:bg-rose-50 text-gray-400 hover:text-rose-500"
            title="Remove child"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-semibold uppercase text-gray-500">Display name</label>
          <input
            type="text"
            value={child.displayName}
            onChange={(e) => onUpdate("displayName", e.target.value)}
            placeholder="Alex"
            className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 bg-white"
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold uppercase text-gray-500">Grade (optional)</label>
          <input
            type="text"
            value={child.gradeLevel}
            onChange={(e) => onUpdate("gradeLevel", e.target.value)}
            placeholder="Grade 3"
            className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 bg-white"
          />
        </div>
      </div>

      <div>
        <label className="text-[10px] font-semibold uppercase text-gray-500">
          Username (for login)
        </label>
        <input
          type="text"
          value={child.username}
          onChange={(e) => onUpdate("username", e.target.value)}
          placeholder="alex_smith"
          autoCapitalize="none"
          autoCorrect="off"
          className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm font-mono outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 bg-white"
        />
        <p className="text-[10px] text-gray-400 mt-0.5">3-20 chars · letters, numbers, underscores</p>
      </div>

      <div>
        <label className="text-[10px] font-semibold uppercase text-gray-500">
          Passcode (for login)
        </label>
        <input
          type="text"
          value={child.passcode}
          onChange={(e) => onUpdate("passcode", e.target.value)}
          placeholder="1234 or a short word"
          autoCapitalize="none"
          autoCorrect="off"
          className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm font-mono outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 bg-white"
        />
        <p className="text-[10px] text-gray-400 mt-0.5">4-20 chars · share this with your child</p>
      </div>

      <div>
        <label className="text-[10px] font-semibold uppercase text-gray-500">Avatar</label>
        <div className="flex flex-wrap gap-1 mt-1">
          {EMOJI_CHOICES.map((e, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onUpdate("avatarEmoji", e)}
              className={`w-7 h-7 rounded-lg text-base flex items-center justify-center transition ${
                child.avatarEmoji === e
                  ? "bg-indigo-100 ring-2 ring-indigo-400"
                  : "bg-white hover:bg-gray-100"
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
