"use client";

import {
  Sparkles,
  Brain,
  Layers,
  LineChart,
  Languages,
  ArrowRight,
  ChevronRight,
  Check,
  Bot,
  BookOpen,
  User,
  GraduationCap,
} from "lucide-react";
import { useApp } from "../store";
import { AuthControls } from "../AuthControls";
import { AnimatedDemo } from "./AnimatedDemo";

export function Landing() {
  const { setScreen } = useApp();

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-indigo-50/30 to-violet-50/40">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-500 flex items-center justify-center text-white font-bold">
              S
            </span>
            <span className="text-base font-bold text-gray-900">StudyBuddy AI</span>
          </div>
          <AuthControls />
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 pt-12 pb-16 text-center">
        <div className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-semibold mb-4">
          <Sparkles className="w-3 h-3" /> AI-powered study companion
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-gray-900 tracking-tight">
          Your AI Study Buddy
          <br />
          <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
            for Every Subject
          </span>
        </h1>
        <p className="mt-5 max-w-xl mx-auto text-base sm:text-lg text-gray-600 leading-relaxed">
          Generate flashcards from your notes, practice with adaptive quizzes,
          explore math graphs, chat with an AI tutor, and track your progress
          with spaced-repetition — all in one beautiful mobile-first app.
        </p>
        <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => setScreen("auth")}
            className="h-12 px-6 rounded-full bg-indigo-600 text-white font-semibold shadow-lg hover:bg-indigo-700 transition flex items-center gap-1.5"
          >
            <User className="w-4 h-4" /> I'm a Student (Personal)
          </button>
          <button
            onClick={() => setScreen("schoolRegister")}
            className="h-12 px-6 rounded-full bg-emerald-600 text-white font-semibold shadow-lg hover:bg-emerald-700 transition flex items-center gap-1.5"
          >
            <GraduationCap className="w-4 h-4" /> I'm a School Student
          </button>
        </div>
        <p className="mt-3 text-xs text-gray-400">
          No credit card needed · Free forever for the basics
        </p>

        {/* Animated demo */}
        <div className="mt-10">
          <AnimatedDemo />
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 pb-16">
        <h2 className="text-center text-2xl sm:text-3xl font-bold text-gray-900">
          Everything you need to ace your next exam
        </h2>
        <p className="text-center text-sm text-gray-500 mt-2">
          Built for students, teachers, self-learners and inventors alike.
        </p>
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              icon: Layers,
              color: "bg-indigo-50 text-indigo-600",
              title: "AI Flashcards & Quizzes",
              desc: "Upload notes or paste text — AI generates flashcards + MCQs with explanations, ready to study.",
            },
            {
              icon: BookOpen,
              color: "bg-emerald-50 text-emerald-600",
              title: "Interactive Study Room",
              desc: "A dedicated space per topic with lesson, practice, AI tutor chat, and step-by-step solver.",
            },
            {
              icon: LineChart,
              color: "bg-sky-50 text-sky-600",
              title: "Math Graph Explorer",
              desc: "Type an equation — get a live chart, slope/intercept detection, and a plain-English explanation.",
            },
            {
              icon: Languages,
              color: "bg-amber-50 text-amber-600",
              title: "Language Learning",
              desc: "Practice Swahili, Chinese, French, Spanish, Arabic — flashcards, listening, and matching modes.",
            },
          ].map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="rounded-2xl bg-white border border-gray-200 p-5 shadow-sm hover:shadow-md transition"
              >
                <span className={`w-10 h-10 rounded-full flex items-center justify-center ${f.color}`}>
                  <Icon className="w-5 h-5" />
                </span>
                <h3 className="mt-3 text-sm font-bold text-gray-900">{f.title}</h3>
                <p className="mt-1 text-xs text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-4xl mx-auto px-4 pb-16">
        <h2 className="text-center text-2xl sm:text-3xl font-bold text-gray-900">
          How it works
        </h2>
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              n: 1,
              title: "Create or upload",
              desc: "Paste notes, upload a PDF, or pick a popular topic. AI does the rest.",
              icon: Sparkles,
            },
            {
              n: 2,
              title: "Study & practice",
              desc: "Flip flashcards, take quizzes with instant feedback, draw graphs, chat with the tutor.",
              icon: Brain,
            },
            {
              n: 3,
              title: "Track mastery",
              desc: "Spaced repetition schedules reviews; mastery bars show what you've nailed and what needs work.",
              icon: Check,
            },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.n} className="rounded-2xl bg-white border border-gray-200 p-5 shadow-sm text-center">
                <span className="inline-flex w-10 h-10 rounded-full bg-indigo-600 text-white items-center justify-center font-bold">
                  {s.n}
                </span>
                <Icon className="w-5 h-5 text-indigo-500 mx-auto mt-3" />
                <h3 className="mt-2 text-sm font-bold text-gray-900">{s.title}</h3>
                <p className="mt-1 text-xs text-gray-500 leading-relaxed">{s.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-4 pb-20">
        <div className="rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-600 p-8 sm:p-12 text-center text-white shadow-xl">
          <Bot className="w-10 h-10 mx-auto opacity-90" />
          <h2 className="mt-3 text-2xl sm:text-3xl font-bold">
            Ready to study smarter, not harder?
          </h2>
          <p className="mt-2 text-sm sm:text-base opacity-90">
            Join thousands of learners using StudyBuddy AI to master any subject.
          </p>
          <button
            onClick={() => setScreen("auth")}
            className="mt-5 h-12 px-8 rounded-full bg-white text-indigo-700 font-semibold shadow hover:bg-indigo-50 transition inline-flex items-center gap-1.5"
          >
            Get Started Free <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 bg-white">
        <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-500 flex items-center justify-center text-white font-bold text-xs">
              S
            </span>
            <span>StudyBuddy AI · v1.0.0</span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setScreen("auth")} className="hover:text-gray-900">Privacy</button>
            <button onClick={() => setScreen("auth")} className="hover:text-gray-900">Terms</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
