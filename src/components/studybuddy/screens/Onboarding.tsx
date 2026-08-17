"use client";

import { useState } from "react";
import {
  GraduationCap,
  BookOpen,
  Users,
  Laptop,
  Lightbulb,
  Calculator,
  Type,
  MessageCircle,
  Languages,
  FlaskConical,
  Globe,
  Code,
  Heart,
  Briefcase,
  Check,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useApp } from "../store";
import { api } from "../api";

const TOTAL_STEPS = 5;

const roles = [
  { key: "Student", label: "Student", icon: GraduationCap },
  { key: "Teacher", label: "Teacher / Tutor", icon: BookOpen },
  { key: "Parent", label: "Parent", icon: Users },
  { key: "Self-Learner", label: "Self-Learner", icon: Laptop },
  { key: "Inventor", label: "Inventor / Maker", icon: Lightbulb },
];

const grades = [
  "Kindergarten",
  "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5",
  "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10",
  "Grade 11", "Grade 12",
  "Form 1", "Form 2", "Form 3", "Form 4",
  "University", "Self-Learner",
];

const subjects = [
  { key: "Mathematics", label: "Mathematics", icon: Calculator },
  { key: "English", label: "English", icon: Type },
  { key: "Kiswahili", label: "Kiswahili", icon: MessageCircle },
  { key: "Chinese", label: "Chinese", icon: Languages },
  { key: "Science", label: "Science", icon: FlaskConical },
  { key: "Social Studies", label: "Social Studies", icon: Globe },
  { key: "Coding", label: "Coding / Computer", icon: Code },
  { key: "Life Skills", label: "Life Skills", icon: Heart },
  { key: "Business", label: "Business", icon: Briefcase },
];

const goals = [
  "Pass my exams with good grades",
  "Learn a new language",
  "Become an engineer",
  "Invent something new",
  "Learn coding",
  "Improve my career skills",
];

const languages = ["English", "Kiswahili", "Chinese", "French", "Spanish", "Arabic"];

export function Onboarding() {
  const { completeOnboarding } = useApp();
  const [step, setStep] = useState(0);
  const [role, setRole] = useState<string | null>(null);
  const [grade, setGrade] = useState<string | null>(null);
  const [pickedSubjects, setPickedSubjects] = useState<string[]>([]);
  const [goal, setGoal] = useState<string | null>(null);
  const [language, setLanguage] = useState<string>("English");
  const [saving, setSaving] = useState(false);

  const next = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const toggleSubject = (k: string) =>
    setPickedSubjects((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]
    );

  const isLast = step === TOTAL_STEPS - 1;
  const canContinue =
    (step === 0 && role) ||
    (step === 1 && grade) ||
    step === 2 ||
    (step === 3 && goal) ||
    step === 4;

  const finish = async () => {
    setSaving(true);
    try {
      // upsert profile — pushes selected subjects/grade/ambitions to /api/user
      await api.updateUser({
        grade: grade ?? undefined,
        subjects: pickedSubjects,
        ambitions: goal ? [goal] : [],
        learningLanguage: language,
        name: role ? `${role} user` : undefined,
      });
    } catch (e) {
      // best-effort — don't block onboarding on a network error
      console.warn("Onboarding upsert failed", e);
    } finally {
      setSaving(false);
      completeOnboarding();
    }
  };

  return (
    <div className="min-h-screen bg-white max-w-md mx-auto flex flex-col">
      {/* progress bar */}
      <div className="px-4 pt-5 pb-2">
        <div className="flex items-center gap-2">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i <= step ? "bg-indigo-600" : "bg-gray-200"
              }`}
            />
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <button
            onClick={back}
            disabled={step === 0}
            className="flex items-center text-sm text-gray-500 disabled:opacity-0"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <span className="text-xs text-gray-400 font-medium">
            Step {step + 1} of {TOTAL_STEPS}
          </span>
        </div>
      </div>

      <div className="flex-1 px-4 overflow-y-auto pb-32">
        {step === 0 && (
          <section>
            <h1 className="text-2xl font-bold text-gray-900 mt-4">Who are you?</h1>
            <p className="text-sm text-gray-500 mt-1">We&apos;ll personalise your study experience.</p>
            <div className="mt-6 space-y-3">
              {roles.map((r) => {
                const Icon = r.icon;
                const selected = role === r.key;
                return (
                  <button
                    key={r.key}
                    onClick={() => setRole(r.key)}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${
                      selected ? "border-indigo-600 bg-indigo-50" : "border-gray-200 bg-white hover:border-indigo-300"
                    }`}
                  >
                    <span className={`w-10 h-10 rounded-full flex items-center justify-center ${selected ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"}`}>
                      <Icon className="w-5 h-5" />
                    </span>
                    <span className="text-base font-medium text-gray-900">{r.label}</span>
                    {selected && <Check className="w-5 h-5 text-indigo-600 ml-auto" />}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {step === 1 && (
          <section>
            <h1 className="text-2xl font-bold text-gray-900 mt-4">Select your grade or level</h1>
            <p className="text-sm text-gray-500 mt-1">Pick the level that best describes you.</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {grades.map((g) => {
                const selected = grade === g;
                return (
                  <button
                    key={g}
                    onClick={() => setGrade(g)}
                    className={`p-3 rounded-2xl border-2 text-sm font-medium transition-all ${
                      selected ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-gray-200 bg-white text-gray-700 hover:border-indigo-300"
                    }`}
                  >
                    {g}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {step === 2 && (
          <section>
            <h1 className="text-2xl font-bold text-gray-900 mt-4">Which subjects do you want to learn?</h1>
            <p className="text-sm text-gray-500 mt-1">Select all that apply.</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {subjects.map((s) => {
                const Icon = s.icon;
                const selected = pickedSubjects.includes(s.key);
                return (
                  <button
                    key={s.key}
                    onClick={() => toggleSubject(s.key)}
                    className={`relative flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                      selected ? "border-indigo-600 bg-indigo-50" : "border-gray-200 bg-white hover:border-indigo-300"
                    }`}
                  >
                    <span className={`w-10 h-10 rounded-full flex items-center justify-center ${selected ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"}`}>
                      <Icon className="w-5 h-5" />
                    </span>
                    <span className="text-xs font-medium text-gray-900 text-center">{s.label}</span>
                    {selected && <Check className="w-4 h-4 text-indigo-600 absolute top-2 right-2" />}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {step === 3 && (
          <section>
            <h1 className="text-2xl font-bold text-gray-900 mt-4">What is your goal?</h1>
            <p className="text-sm text-gray-500 mt-1">Choose one main goal to focus on.</p>
            <div className="mt-6 space-y-3">
              {goals.map((g) => {
                const selected = goal === g;
                return (
                  <button
                    key={g}
                    onClick={() => setGoal(g)}
                    className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${
                      selected ? "border-indigo-600 bg-indigo-50" : "border-gray-200 bg-white hover:border-indigo-300"
                    }`}
                  >
                    <span className="text-sm font-medium text-gray-900">{g}</span>
                    <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selected ? "border-indigo-600 bg-indigo-600" : "border-gray-300"}`}>
                      {selected && <Check className="w-3 h-3 text-white" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {step === 4 && (
          <section>
            <h1 className="text-2xl font-bold text-gray-900 mt-4">Choose your learning language</h1>
            <p className="text-sm text-gray-500 mt-1">We&apos;ll use this for lessons and explanations.</p>
            <div className="mt-6 space-y-3">
              {languages.map((l) => {
                const selected = language === l;
                return (
                  <button
                    key={l}
                    onClick={() => setLanguage(l)}
                    className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${
                      selected ? "border-indigo-600 bg-indigo-50" : "border-gray-200 bg-white hover:border-indigo-300"
                    }`}
                  >
                    <span className="text-sm font-medium text-gray-900">{l}</span>
                    {selected && <Check className="w-5 h-5 text-indigo-600" />}
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 pb-safe">
        <div className="max-w-md mx-auto px-4 py-3">
          {isLast ? (
            <button
              onClick={finish}
              disabled={saving}
              className="w-full h-12 rounded-full bg-indigo-600 text-white font-semibold shadow-md hover:bg-indigo-700 transition disabled:opacity-60"
            >
              {saving ? "Saving..." : "Start Learning"}
            </button>
          ) : (
            <button
              onClick={next}
              disabled={!canContinue}
              className="w-full h-12 rounded-full bg-indigo-600 text-white font-semibold shadow-md hover:bg-indigo-700 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1"
            >
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
