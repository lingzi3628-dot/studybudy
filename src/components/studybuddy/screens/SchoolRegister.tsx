"use client";

import { useState, useEffect } from "react";
import {
  X, Loader2, AlertCircle, Check, ChevronRight, ChevronLeft,
  GraduationCap, School as SchoolIcon, User, Mail, Lock,
  BookOpen, Building2,
} from "lucide-react";
import { useApp } from "../store";

type Step = 1 | 2 | 3 | 4 | 5;

export function SchoolRegister() {
  const { setScreen } = useApp();
  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // form data
  const [fullName, setFullName] = useState("");
  const [admissionNumber, setAdmissionNumber] = useState("");
  const [schoolLevel, setSchoolLevel] = useState<"primary" | "secondary">("secondary");
  const [schoolId, setSchoolId] = useState("");
  const [schools, setSchools] = useState<any[]>([]);
  const [gradeLevel, setGradeLevel] = useState("");
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Load schools + subjects on mount
  useEffect(() => {
    fetch("/api/admin/school").then(r => r.json()).then(d => setSchools(d.schools ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`/api/school/subjects?level=${schoolLevel}`).then(r => r.json()).then(d => setSubjects(d.subjects ?? [])).catch(() => {});
    setSelectedSubjects([]);
  }, [schoolLevel]);

  const grades = schoolLevel === "primary"
    ? ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"]
    : ["Form 1", "Form 2", "Form 3", "Form 4"];

  const canContinue = () => {
    if (step === 1) return fullName.trim() && schoolLevel;
    if (step === 2) return schoolId || true; // school optional for MVP
    if (step === 3) return gradeLevel;
    if (step === 4) return selectedSubjects.length > 0;
    if (step === 5) return email.trim() && password.length >= 6;
    return false;
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/school/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          admissionNumber: admissionNumber.trim() || undefined,
          schoolId: schoolId || undefined,
          gradeLevel,
          subjects: selectedSubjects,
          email: email.trim().toLowerCase(),
          password,
          name: fullName.trim().split(" ")[0],
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        throw new Error(d.error ?? `HTTP ${r.status}`);
      }
      // Success — redirect to school dashboard
      setScreen("schoolDashboard");
    } catch (e: any) {
      setError(e?.message ?? "Registration failed");
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-violet-50">
      <header className="px-4 h-14 flex items-center gap-2">
        <button onClick={() => step > 1 ? setStep((s) => (s - 1) as Step) : setScreen("landing")}
          className="w-9 h-9 rounded-full hover:bg-indigo-100 flex items-center justify-center">
          {step > 1 ? <ChevronLeft className="w-5 h-5" /> : <X className="w-5 h-5" />}
        </button>
        <GraduationCap className="w-5 h-5 text-indigo-600" />
        <h1 className="text-base font-bold text-gray-900">School Registration</h1>
      </header>

      {/* Progress dots */}
      <div className="px-4 mb-2">
        <div className="flex items-center gap-1.5 max-w-sm mx-auto">
          {[1, 2, 3, 4, 5].map((s) => (
            <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${s <= step ? "bg-indigo-600" : "bg-gray-200"}`} />
          ))}
        </div>
        <p className="text-center text-[10px] text-gray-500 mt-1">Step {step} of 5</p>
      </div>

      <div className="max-w-md mx-auto px-4 py-2 space-y-4">
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /><span>{error}</span>
          </div>
        )}

        {/* Step 1: Name + Level */}
        {step === 1 && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">Let's get to know you! 🎒</h2>
            <div>
              <label className="text-xs font-semibold text-gray-500">Full Name</label>
              <div className="mt-1 relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input value={fullName} onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Doe"
                  className="w-full pl-10 pr-3 p-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500">Admission / Index Number (optional)</label>
              <input value={admissionNumber} onChange={(e) => setAdmissionNumber(e.target.value)}
                placeholder="e.g., 12345"
                className="mt-1 w-full p-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500">School Level</label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {(["primary", "secondary"] as const).map((l) => (
                  <button key={l} onClick={() => setSchoolLevel(l)}
                    className={`p-3 rounded-xl text-sm font-semibold capitalize ${schoolLevel === l ? "bg-indigo-600 text-white" : "bg-white border border-gray-200 text-gray-600"}`}>
                    {l === "primary" ? "🏫 Primary" : "🎓 Secondary"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: School */}
        {step === 2 && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">Pick your school 🏫</h2>
            <p className="text-xs text-gray-500">Don't see your school? You can skip this step.</p>
            {schools.length > 0 ? (
              <select value={schoolId} onChange={(e) => setSchoolId(e.target.value)}
                className="w-full p-3 rounded-xl border border-gray-200 text-sm bg-white outline-none focus:border-indigo-400">
                <option value="">Select your school...</option>
                {schools.filter((s: any) => s.level === schoolLevel).map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-gray-400 text-center py-4">Loading schools...</p>
            )}
            <button onClick={() => setSchoolId("")}
              className="text-xs text-indigo-600 font-medium hover:underline">
              Skip — I'll add my school later
            </button>
          </div>
        )}

        {/* Step 3: Grade/Form */}
        {step === 3 && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">{schoolLevel === "primary" ? "What grade are you in?" : "What form are you in?"}</h2>
            <div className="grid grid-cols-3 gap-2">
              {grades.map((g) => (
                <button key={g} onClick={() => setGradeLevel(g)}
                  className={`p-3 rounded-xl text-sm font-semibold ${gradeLevel === g ? "bg-indigo-600 text-white" : "bg-white border border-gray-200 text-gray-600"}`}>
                  {g}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 4: Subjects */}
        {step === 4 && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">Choose your subjects! 📚</h2>
            <p className="text-xs text-gray-500">Tap the subjects you study.</p>
            <div className="grid grid-cols-2 gap-2">
              {subjects.map((s: any) => {
                const selected = selectedSubjects.includes(s.id);
                return (
                  <button key={s.id} onClick={() => {
                    setSelectedSubjects(selected ? selectedSubjects.filter(id => id !== s.id) : [...selectedSubjects, s.id]);
                  }}
                    className={`p-3 rounded-xl border-2 text-sm font-medium transition text-left ${selected ? "border-indigo-500 bg-indigo-50" : "border-gray-200 bg-white"}`}
                    style={selected ? { borderColor: s.color, backgroundColor: s.color + "20" } : {}}>
                    <span className="text-xl mr-1">{s.icon}</span>
                    {s.name}
                    {selected && <Check className="inline ml-1 w-4 h-4 text-indigo-600" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 5: Account */}
        {step === 5 && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-gray-900">Create your account 🔐</h2>
            <p className="text-xs text-gray-500">You'll use this to log in next time.</p>
            <div>
              <label className="text-xs font-semibold text-gray-500">Email</label>
              <div className="mt-1 relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-3 p-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500">Password (min 6 characters)</label>
              <div className="mt-1 relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  className="w-full pl-10 pr-3 p-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400" />
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-2 pt-2">
          {step < 5 ? (
            <button onClick={() => setStep((s) => (s + 1) as Step)} disabled={!canContinue()}
              className="flex-1 h-12 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={submit} disabled={busy || !canContinue()}
              className="flex-1 h-12 rounded-full bg-emerald-600 text-white font-semibold text-sm shadow-md hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
              {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating account...</> : <><Check className="w-4 h-4" /> Register & Start Learning</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
