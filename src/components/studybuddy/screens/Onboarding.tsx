"use client";

import { useState, useEffect, useMemo } from "react";
import {
  GraduationCap, BookOpen, Users, Laptop, Lightbulb,
  Calculator, Type, MessageCircle, Languages, FlaskConical,
  Globe, Code, Heart, Briefcase, Check, ChevronLeft, ChevronRight,
  Database, Brain, Wrench, Sparkles, Bot, Zap, Flame, Car,
  UtensilsCrossed, Shirt, Building, Smartphone, Server, Table, Eye,
  BarChart3, Settings, Search, AlertCircle, Lock, Rocket,
} from "lucide-react";
import { useApp } from "../store";
import { api } from "../api";
import {
  EDUCATION_LEVELS, type EducationLevel, type LevelConfig,
  searchUniversityCourses, searchTVETTrades,
  getUniversityCourseCategories, getTVETTradeCategories,
  type UniversityCourse, type TVETTrade,
} from "@/lib/education-levels";

// === Existing track/grade/subject configs (kept from Phase 78) ===

const TRACK_GRADES: Record<string, string[]> = {
  k12: [], dev: ["Beginner","Intermediate","Advanced","Bootcamp student","Self-taught","Professional"],
  data: ["Beginner","Intermediate","Advanced","Analyst","Data engineer","Researcher"],
  ml: ["Beginner","Intermediate","Advanced","Researcher","PhD student","AI engineer"],
  aiapp: ["Beginner","Intermediate","Advanced","Full-stack dev adding AI","AI engineer","ML engineer"],
  tvet: ["CDACC Level 4","CDACC Level 5","CDACC Level 6","Artisan","Trainer","Vocational student"],
  mixed: ["Beginner","Intermediate","Advanced","Self-taught"],
};

const FALLBACK_GRADES = ["Kindergarten","Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6","Grade 7","Grade 8","Grade 9","Grade 10","Grade 11","Grade 12","Form 1","Form 2","Form 3","Form 4","University","Self-Learner"];

const K12_SUBJECTS = [
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
const TVET_SUBJECTS = [
  { key: "Electrical Installation", label: "Electrical Installation", icon: Zap },
  { key: "Plumbing", label: "Plumbing", icon: Wrench },
  { key: "Welding", label: "Welding & Fabrication", icon: Flame },
  { key: "Automotive Mechanics", label: "Automotive Mechanics", icon: Car },
  { key: "ICT Technician", label: "ICT Technician", icon: Code },
  { key: "Hospitality & Food", label: "Hospitality & Food Service", icon: UtensilsCrossed },
  { key: "Fashion & Design", label: "Fashion & Design", icon: Shirt },
  { key: "Building & Construction", label: "Building & Construction", icon: Building },
  { key: "Business Studies", label: "Business Studies", icon: Briefcase },
];
const DEV_SUBJECTS = [
  { key: "Web Development", label: "Web Development", icon: Code },
  { key: "Python", label: "Python", icon: Code },
  { key: "JavaScript", label: "JavaScript", icon: Code },
  { key: "Databases", label: "Databases & SQL", icon: Database },
  { key: "Mobile Development", label: "Mobile Development", icon: Smartphone },
  { key: "DevOps", label: "DevOps & Cloud", icon: Server },
  { key: "API Design", label: "API Design", icon: Settings },
];
const TRACK_SUBJECTS: Record<string, Array<{ key: string; label: string; icon: any }>> = {
  k12: K12_SUBJECTS, tvet: TVET_SUBJECTS, dev: DEV_SUBJECTS,
  data: DEV_SUBJECTS, ml: DEV_SUBJECTS, aiapp: DEV_SUBJECTS,
  server: DEV_SUBJECTS, backend: DEV_SUBJECTS, web: DEV_SUBJECTS,
  mixed: [...K12_SUBJECTS, ...DEV_SUBJECTS],
};

const roles = [
  { key: "Student", label: "Student", icon: GraduationCap },
  { key: "Teacher", label: "Teacher / Tutor", icon: BookOpen },
  { key: "Parent", label: "Parent", icon: Users },
  { key: "Self-Learner", label: "Self-Learner", icon: Laptop },
  { key: "Inventor", label: "Inventor / Maker", icon: Lightbulb },
];

const goals = [
  "Pass my exams with good grades","Learn a new language","Become an engineer",
  "Invent something new","Learn coding","Improve my career skills",
];
const languages = ["English", "Kiswahili", "Chinese", "French", "Spanish", "Arabic"];

// === New Onboarding Flow (Phase 79) ===
// Steps:
//   0: Pick education level (6 cards)
//   1: Pick grade (level-specific)
//   2: Verification quiz (pass → continue, fail → back to step 0)
//   3: Role (Student/Teacher/Parent/etc.)
//   4: Track-specific content:
//      - K12: pick K-12 subjects
//      - University: search courses → sets track
//      - TVET: search trades
//   5: Goal + language
//   6: Study Buddy model (Free/Plus/Pro)
//   7: Welcome tutorial (how to use the app)

const TOTAL_STEPS = 8;

export function Onboarding() {
  const { completeOnboarding } = useApp();
  const [step, setStep] = useState(0);
  const [educationLevel, setEducationLevel] = useState<EducationLevel | null>(null);
  const [track, setTrack] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [grade, setGrade] = useState<string | null>(null);
  const [pickedSubjects, setPickedSubjects] = useState<string[]>([]);
  const [goal, setGoal] = useState<string | null>(null);
  const [language, setLanguage] = useState<string>("English");
  const [selectedBuddy, setSelectedBuddy] = useState<string>("study_buddy_free");
  const [saving, setSaving] = useState(false);

  // Quiz state
  const [quizAnswer, setQuizAnswer] = useState<number | null>(null);
  const [quizResult, setQuizResult] = useState<"pending" | "correct" | "wrong">("pending");

  // University/TVET course search
  const [courseSearch, setCourseSearch] = useState("");
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [selectedCourseTrack, setSelectedCourseTrack] = useState<string | null>(null);

  const levelConfig = educationLevel ? EDUCATION_LEVELS.find((l) => l.id === educationLevel) : null;

  const next = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const toggleSubject = (k: string) =>
    setPickedSubjects((prev) => prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]);

  // Quiz submission
  const submitQuiz = () => {
    if (quizAnswer === null || !levelConfig) return;
    if (quizAnswer === levelConfig.quizQuestion.correctIndex) {
      setQuizResult("correct");
      setTimeout(() => { next(); }, 1200);
    } else {
      setQuizResult("wrong");
    }
  };

  const resetQuiz = () => {
    setQuizAnswer(null);
    setQuizResult("pending");
  };

  const onLevelSelect = (level: EducationLevel) => {
    const config = EDUCATION_LEVELS.find((l) => l.id === level);
    if (!config) return;
    setEducationLevel(level);
    setTrack(config.track);
    setGrade(null);
    resetQuiz();
  };

  // When university course is selected, set the track
  const onCourseSelect = (course: UniversityCourse) => {
    setSelectedCourse(course.name);
    setSelectedCourseTrack(course.track);
    setTrack(course.track);
  };

  const onTradeSelect = (trade: TVETTrade) => {
    setSelectedCourse(trade.name);
    setTrack("tvet");
  };

  const canContinue =
    (step === 0 && educationLevel) ||
    (step === 1 && grade) ||
    (step === 2 && quizResult === "correct") ||
    (step === 3 && role) ||
    (step === 4 && (educationLevel === "university" ? selectedCourse : educationLevel === "tvet" ? selectedCourse : pickedSubjects.length > 0)) ||
    (step === 5 && goal) ||
    step === 6 ||
    step === 7;

  const finish = async () => {
    setSaving(true);
    try {
      const finalTrack = track ?? "k12";
      const finalGrade = grade ?? levelConfig?.grades[0] ?? "Self-Learner";
      const finalSubjects = educationLevel === "university" || educationLevel === "tvet"
        ? (selectedCourse ? [selectedCourse] : [])
        : pickedSubjects;

      try {
        const r = await fetch("/api/user/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: role ?? undefined,
            grade: finalGrade,
            track: finalTrack,
            subjects: finalSubjects,
            ambitions: goal ? [goal] : [],
            preferred_language: language,
            name: role ? `${role} user` : undefined,
          }),
        });
        if (selectedBuddy) {
          await fetch("/api/user/model", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ modelName: selectedBuddy }),
          }).catch(() => {});
        }
        if (!r.ok) {
          await api.updateUser({
            grade: finalGrade, track: finalTrack, subjects: finalSubjects,
            ambitions: goal ? [goal] : [], learningLanguage: language,
            name: role ? `${role} user` : undefined,
          });
        }
      } catch {
        await api.updateUser({
          grade: finalGrade, track: finalTrack, subjects: finalSubjects,
          ambitions: goal ? [goal] : [], learningLanguage: language,
          name: role ? `${role} user` : undefined,
        });
      }

      await fetch("/api/onboarding/complete", { method: "POST" }).catch(() => {});

      if (finalTrack) {
        try { localStorage.setItem("studybuddy_user_track", finalTrack); } catch { /* ignore */ }
      }
    } catch (e) {
      console.warn("Onboarding save failed", e);
    } finally {
      setSaving(false);
      completeOnboarding();
    }
  };

  // Filtered course lists
  const uniResults = useMemo(() => searchUniversityCourses(courseSearch), [courseSearch]);
  const tvetResults = useMemo(() => searchTVETTrades(courseSearch), [courseSearch]);
  const uniCategories = useMemo(() => getUniversityCourseCategories(), []);
  const tvetCategories = useMemo(() => getTVETTradeCategories(), []);

  const subjectList: Array<{ key: string; label: string; icon: any }> = (track && TRACK_SUBJECTS[track]) || K12_SUBJECTS;

  return (
    <div className="min-h-screen bg-white max-w-md mx-auto flex flex-col">
      {/* Progress bar */}
      <div className="px-4 pt-5 pb-2">
        <div className="flex items-center gap-2">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? "bg-indigo-600" : "bg-gray-200"}`} />
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <button onClick={back} disabled={step === 0} className="flex items-center text-sm text-gray-500 disabled:opacity-0">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <span className="text-xs text-gray-400 font-medium">Step {step + 1} of {TOTAL_STEPS}</span>
        </div>
      </div>

      <div className="flex-1 px-4 overflow-y-auto pb-32">
        {/* Step 0: Pick education level */}
        {step === 0 && (
          <section>
            <h1 className="text-2xl font-bold text-gray-900 mt-4">What's your education level?</h1>
            <p className="text-sm text-gray-500 mt-1">Choose your level — each one has its own dashboard and tools.</p>
            <div className="mt-6 space-y-3">
              {EDUCATION_LEVELS.map((level) => {
                const selected = educationLevel === level.id;
                return (
                  <button
                    key={level.id}
                    onClick={() => onLevelSelect(level.id)}
                    className={`w-full text-left p-4 rounded-2xl border-2 transition ${selected ? "border-indigo-600 bg-indigo-50" : "border-gray-200 bg-white hover:border-indigo-300"}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{level.icon}</span>
                      <div className="flex-1">
                        <p className="font-bold text-gray-900">{level.label}</p>
                        <p className="text-xs text-gray-500">{level.description}</p>
                      </div>
                      {selected && <Check className="w-5 h-5 text-indigo-600" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Step 1: Pick grade */}
        {step === 1 && levelConfig && (
          <section>
            <h1 className="text-2xl font-bold text-gray-900 mt-4">What grade are you in?</h1>
            <p className="text-sm text-gray-500 mt-1">{levelConfig.label} — select your current grade.</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {levelConfig.grades.map((g) => (
                <button
                  key={g}
                  onClick={() => setGrade(g)}
                  className={`p-4 rounded-xl border-2 text-center font-semibold transition ${grade === g ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-gray-200 bg-white text-gray-700 hover:border-indigo-300"}`}
                >
                  {g}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Step 2: Verification quiz */}
        {step === 2 && levelConfig && (
          <section>
            <h1 className="text-2xl font-bold text-gray-900 mt-4">Quick verification</h1>
            <p className="text-sm text-gray-500 mt-1">Answer this question to confirm you're from this level.</p>

            {quizResult === "wrong" && (
              <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-200">
                <div className="flex items-center gap-2 text-rose-700">
                  <AlertCircle className="w-5 h-5" />
                  <p className="font-bold text-sm">Wrong answer</p>
                </div>
                <p className="text-xs text-rose-600 mt-1">
                  We detected you might not be from {levelConfig.label}. Please go back and choose the correct level.
                </p>
                <button
                  onClick={() => { resetQuiz(); setStep(0); setEducationLevel(null); setGrade(null); }}
                  className="mt-3 w-full h-10 rounded-full bg-rose-600 text-white text-sm font-semibold"
                >
                  Choose a different level
                </button>
              </div>
            )}

            {quizResult === "correct" && (
              <div className="mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                <div className="flex items-center gap-2 text-emerald-700">
                  <Check className="w-5 h-5" />
                  <p className="font-bold text-sm">Correct! Welcome to {levelConfig.label}.</p>
                </div>
              </div>
            )}

            {quizResult === "pending" && (
              <div className="mt-6 p-6 rounded-2xl bg-gray-50 border border-gray-200">
                <p className="text-lg font-semibold text-gray-900 mb-4">{levelConfig.quizQuestion.question}</p>
                <div className="space-y-2">
                  {levelConfig.quizQuestion.options.map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => setQuizAnswer(i)}
                      className={`w-full p-3 rounded-xl border-2 text-left text-sm font-medium transition ${quizAnswer === i ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-gray-200 bg-white text-gray-700 hover:border-indigo-300"}`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                {levelConfig.quizQuestion.hint && quizAnswer === null && (
                  <p className="text-xs text-gray-400 mt-3">Hint: {levelConfig.quizQuestion.hint}</p>
                )}
                <button
                  onClick={submitQuiz}
                  disabled={quizAnswer === null}
                  className="mt-4 w-full h-11 rounded-full bg-indigo-600 text-white text-sm font-semibold disabled:opacity-40"
                >
                  Submit answer
                </button>
              </div>
            )}
          </section>
        )}

        {/* Step 3: Role */}
        {step === 3 && (
          <section>
            <h1 className="text-2xl font-bold text-gray-900 mt-4">What's your role?</h1>
            <p className="text-sm text-gray-500 mt-1">How do you want to use StudyBuddy?</p>
            <div className="mt-6 space-y-3">
              {roles.map((r) => {
                const Icon = r.icon;
                const selected = role === r.key;
                return (
                  <button
                    key={r.key}
                    onClick={() => setRole(r.key)}
                    className={`w-full p-4 rounded-xl border-2 flex items-center gap-3 transition ${selected ? "border-indigo-600 bg-indigo-50" : "border-gray-200 bg-white hover:border-indigo-300"}`}
                  >
                    <Icon className="w-5 h-5 text-indigo-600" />
                    <span className="font-semibold text-gray-900">{r.label}</span>
                    {selected && <Check className="w-5 h-5 text-indigo-600 ml-auto" />}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Step 4: Track-specific content */}
        {step === 4 && (
          <section>
            {educationLevel === "university" ? (
              <>
                <h1 className="text-2xl font-bold text-gray-900 mt-4">What course are you taking?</h1>
                <p className="text-sm text-gray-500 mt-1">Search for your course — we'll customize your dashboard.</p>
                <div className="mt-4 relative">
                  <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={courseSearch}
                    onChange={(e) => setCourseSearch(e.target.value)}
                    placeholder="Search courses... (e.g. Computer Science, Law, Nursing)"
                    className="w-full h-11 rounded-xl bg-gray-50 border border-gray-200 pl-10 pr-3 text-sm outline-none focus:border-indigo-400"
                  />
                </div>
                <div className="mt-3 max-h-80 overflow-y-auto space-y-1">
                  {uniResults.slice(0, 30).map((c) => (
                    <button
                      key={c.name}
                      onClick={() => onCourseSelect(c)}
                      className={`w-full p-3 rounded-lg border text-left transition ${selectedCourse === c.name ? "border-indigo-600 bg-indigo-50" : "border-gray-100 bg-white hover:border-indigo-300"}`}
                    >
                      <p className="text-sm font-semibold text-gray-900">{c.name}</p>
                      <p className="text-[10px] text-gray-400">{c.category}</p>
                    </button>
                  ))}
                  {uniResults.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No courses found. Try another search.</p>}
                </div>
                {selectedCourse && (
                  <div className="mt-3 p-3 rounded-xl bg-indigo-50 border border-indigo-200">
                    <p className="text-xs text-indigo-700">Selected: <b>{selectedCourse}</b> → Dashboard: {selectedCourseTrack}</p>
                  </div>
                )}
              </>
            ) : educationLevel === "tvet" ? (
              <>
                <h1 className="text-2xl font-bold text-gray-900 mt-4">What trade are you training in?</h1>
                <p className="text-sm text-gray-500 mt-1">Search for your trade — we'll customize your dashboard.</p>
                <div className="mt-4 relative">
                  <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={courseSearch}
                    onChange={(e) => setCourseSearch(e.target.value)}
                    placeholder="Search trades... (e.g. Electrical, Plumbing, Welding)"
                    className="w-full h-11 rounded-xl bg-gray-50 border border-gray-200 pl-10 pr-3 text-sm outline-none focus:border-indigo-400"
                  />
                </div>
                <div className="mt-3 max-h-80 overflow-y-auto space-y-1">
                  {tvetResults.slice(0, 30).map((t) => (
                    <button
                      key={t.name}
                      onClick={() => onTradeSelect(t)}
                      className={`w-full p-3 rounded-lg border text-left transition ${selectedCourse === t.name ? "border-indigo-600 bg-indigo-50" : "border-gray-100 bg-white hover:border-indigo-300"}`}
                    >
                      <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                      <p className="text-[10px] text-gray-400">{t.category} · {t.cdaccLevel}</p>
                    </button>
                  ))}
                  {tvetResults.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No trades found. Try another search.</p>}
                </div>
                {selectedCourse && (
                  <div className="mt-3 p-3 rounded-xl bg-indigo-50 border border-indigo-200">
                    <p className="text-xs text-indigo-700">Selected: <b>{selectedCourse}</b></p>
                  </div>
                )}
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-gray-900 mt-4">Which subjects do you want to learn?</h1>
                <p className="text-sm text-gray-500 mt-1">Select all that apply.</p>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  {subjectList.map((s) => {
                    const Icon = s.icon;
                    const selected = pickedSubjects.includes(s.key);
                    return (
                      <button
                        key={s.key}
                        onClick={() => toggleSubject(s.key)}
                        className={`p-3 rounded-xl border-2 flex flex-col items-center gap-2 transition ${selected ? "border-indigo-600 bg-indigo-50" : "border-gray-200 bg-white hover:border-indigo-300"}`}
                      >
                        <Icon className="w-5 h-5 text-indigo-600" />
                        <span className="text-xs font-semibold text-gray-900 text-center">{s.label}</span>
                        {selected && <Check className="w-4 h-4 text-indigo-600" />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        )}

        {/* Step 5: Goal + Language */}
        {step === 5 && (
          <section>
            <h1 className="text-2xl font-bold text-gray-900 mt-4">What's your goal?</h1>
            <div className="mt-6 space-y-2">
              {goals.map((g) => (
                <button
                  key={g}
                  onClick={() => setGoal(g)}
                  className={`w-full p-3 rounded-xl border-2 text-left text-sm font-medium transition ${goal === g ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-gray-200 bg-white text-gray-700 hover:border-indigo-300"}`}
                >
                  {g}
                </button>
              ))}
            </div>
            <h2 className="text-lg font-bold text-gray-900 mt-8 mb-3">Preferred language</h2>
            <div className="flex flex-wrap gap-2">
              {languages.map((l) => (
                <button
                  key={l}
                  onClick={() => setLanguage(l)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition ${language === l ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Step 6: Study Buddy model */}
        {step === 6 && (
          <section>
            <h1 className="text-2xl font-bold text-gray-900 mt-4">Choose your Study Buddy</h1>
            <p className="text-sm text-gray-500 mt-1">Your AI companion — pick the one that fits. You can switch anytime.</p>
            <div className="mt-6 space-y-3">
              {[
                { id: "study_buddy_free", name: "Study Buddy Free", emoji: "🌱", desc: "Free · Daily limits · GLM model", color: "bg-emerald-50 border-emerald-200" },
                { id: "study_buddy_plus", name: "Study Buddy Plus", emoji: "⚡", desc: "Premium · Higher limits · Mistral", color: "bg-violet-50 border-violet-200", premium: true },
                { id: "study_buddy_pro", name: "Study Buddy Pro", emoji: "🚀", desc: "Premium · Best AI · Gemini Pro", color: "bg-fuchsia-50 border-fuchsia-200", premium: true },
                { id: "study_buddy_king", name: "Study Buddy King", emoji: "👑", desc: "Premium · Unlimited · Mistral", color: "bg-amber-50 border-amber-200", premium: true },
              ].map((b) => (
                <button
                  key={b.id}
                  onClick={() => setSelectedBuddy(b.id)}
                  className={`w-full p-4 rounded-2xl border-2 flex items-center gap-3 transition ${selectedBuddy === b.id ? "border-indigo-600 bg-indigo-50" : b.color + " hover:border-indigo-300"}`}
                >
                  <span className="text-2xl">{b.emoji}</span>
                  <div className="flex-1 text-left">
                    <p className="font-bold text-gray-900 text-sm">{b.name}</p>
                    <p className="text-xs text-gray-500">{b.desc}</p>
                  </div>
                  {selectedBuddy === b.id && <Check className="w-5 h-5 text-indigo-600" />}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Step 7: Welcome tutorial */}
        {step === 7 && (
          <section>
            <h1 className="text-2xl font-bold text-gray-900 mt-4">Welcome to StudyBuddy AI!</h1>
            <p className="text-sm text-gray-500 mt-1">Here's how to get started:</p>
            <div className="mt-6 space-y-4">
              {[
                { icon: MessageCircle, title: "Ask AI Tutor", desc: "Tap the chat icon to ask questions. Your Study Buddy will explain concepts, solve problems, and help you learn." },
                { icon: BookOpen, title: "Study Subjects", desc: "Browse your subjects in the dashboard. Each has lessons, quizzes, and practice questions." },
                { icon: FlaskConical, title: "Do Experiments", desc: "If you're in a science track, use the lab tools to run simulations and explore concepts." },
                { icon: Brain, title: "Track Progress", desc: "Earn XP, coins, and badges as you learn. Keep your streak alive by studying daily!" },
                { icon: Rocket, title: "Build & Deploy", desc: "If you're in a dev/AI track, build projects in the playground and deploy them to the web." },
              ].map((t, i) => {
                const Icon = t.icon;
                return (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50">
                    <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <p className="font-bold text-sm text-gray-900">{t.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{t.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              onClick={finish}
              disabled={saving}
              className="mt-8 w-full h-12 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving ? <><Sparkles className="w-4 h-4 animate-spin" /> Setting up…</> : <><Rocket className="w-4 h-4" /> Start learning!</>}
            </button>
          </section>
        )}
      </div>

      {/* Continue button (hidden on last step + quiz step when wrong) */}
      {step < TOTAL_STEPS - 1 && !(step === 2 && quizResult !== "correct") && (
        <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-gray-200 p-4">
          <button
            onClick={next}
            disabled={!canContinue}
            className="w-full h-12 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-40"
          >
            Continue <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}
