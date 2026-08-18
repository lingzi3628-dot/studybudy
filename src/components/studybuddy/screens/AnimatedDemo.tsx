"use client";

import { useEffect, useState } from "react";
import {
  Layers,
  ListChecks,
  LineChart,
  Bot,
  Check,
  X,
  Sparkles,
} from "lucide-react";

/**
 * Animated demo that cycles through StudyBuddy's features.
 * Pure CSS/React animation — no video file needed.
 * Cycles: Flashcard flip → Quiz → Graph → AI Chat → repeat.
 */
export function AnimatedDemo() {
  const [step, setStep] = useState(0);
  const [flipped, setFlipped] = useState(false);

  // Auto-advance through steps every 4 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setStep((s) => (s + 1) % 4);
      setFlipped(false);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Flip the flashcard after 2 seconds in step 0
  useEffect(() => {
    if (step === 0) {
      const t = setTimeout(() => setFlipped(true), 2000);
      return () => clearTimeout(t);
    }
  }, [step]);

  return (
    <div className="relative w-full max-w-sm mx-auto h-80">
      {/* Phone frame */}
      <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-br from-indigo-600 to-violet-600 p-1 shadow-2xl">
        <div className="w-full h-full rounded-[1.8rem] bg-gray-50 overflow-hidden flex flex-col">
          {/* Top bar */}
          <div className="h-8 bg-white border-b border-gray-100 flex items-center px-3 gap-1.5">
            <div className="w-2 h-2 rounded-full bg-rose-400" />
            <div className="w-2 h-2 rounded-full bg-amber-400" />
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="ml-auto text-[8px] font-bold text-indigo-600">StudyBuddy AI</span>
          </div>

          {/* Content area — changes based on step */}
          <div className="flex-1 flex items-center justify-center p-4 relative overflow-hidden">
            {/* Step 0: Flashcard flip */}
            {step === 0 && (
              <div className={`flip-card w-full h-40 transition-all duration-500 ${flipped ? "scale-95" : "scale-100"}`}>
                <div className={`flip-card-inner rounded-2xl h-full ${flipped ? "rotateY(180deg)" : ""}`} style={{ transformStyle: "preserve-3d", transition: "transform 0.6s", transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}>
                  <div className="absolute inset-0 rounded-2xl bg-white shadow-md flex flex-col items-center justify-center" style={{ backfaceVisibility: "hidden" }}>
                    <Layers className="w-6 h-6 text-indigo-500 mb-2" />
                    <p className="text-xs font-bold text-gray-900 text-center px-4">What is photosynthesis?</p>
                    <p className="text-[9px] text-gray-400 mt-2">Tap to flip</p>
                  </div>
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-500 shadow-md flex items-center justify-center" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
                    <p className="text-xs font-bold text-white text-center px-4">Plants convert light into energy 🌱</p>
                  </div>
                </div>
              </div>
            )}

            {/* Step 1: Quiz */}
            {step === 1 && (
              <div className="w-full space-y-2 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-1.5 mb-2">
                  <ListChecks className="w-4 h-4 text-emerald-500" />
                  <span className="text-[9px] font-bold text-gray-700">Quiz · Question 1/5</span>
                </div>
                <p className="text-xs font-semibold text-gray-900 mb-2">Which organelle performs photosynthesis?</p>
                {["Mitochondria", "Chloroplast ✓", "Nucleus", "Ribosome"].map((opt, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-1.5 p-1.5 rounded-lg text-[10px] font-medium transition-all ${i === 1 ? "bg-emerald-50 border border-emerald-300 text-emerald-700" : "bg-white border border-gray-100 text-gray-600"}`}
                    style={{ animationDelay: `${i * 100}ms` }}
                  >
                    <span className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center text-[8px] font-bold">
                      {String.fromCharCode(65 + i)}
                    </span>
                    {opt}
                    {i === 1 && <Check className="w-3 h-3 ml-auto" />}
                  </div>
                ))}
              </div>
            )}

            {/* Step 2: Graph */}
            {step === 2 && (
              <div className="w-full h-full flex flex-col items-center justify-center animate-in fade-in duration-500">
                <div className="flex items-center gap-1.5 mb-2">
                  <LineChart className="w-4 h-4 text-sky-500" />
                  <span className="text-[9px] font-bold text-gray-700">y = 2x + 3</span>
                </div>
                <div className="relative w-full h-32 rounded-xl bg-white border border-gray-100 overflow-hidden">
                  <div className="absolute inset-0" style={{
                    backgroundImage: "linear-gradient(to right, #E5E7EB 1px, transparent 1px), linear-gradient(to bottom, #E5E7EB 1px, transparent 1px)",
                    backgroundSize: "20px 20px",
                  }} />
                  <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-300" />
                  <div className="absolute top-1/2 left-0 right-0 h-px bg-gray-300" />
                  <svg className="absolute inset-0 w-full h-full" viewBox="0 0 200 130" preserveAspectRatio="none">
                    <line x1="0" y1="100" x2="200" y2="20" stroke="#4F46E5" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
                <p className="text-[9px] text-gray-500 mt-1">Slope: 2 · Y-intercept: 3</p>
              </div>
            )}

            {/* Step 3: AI Tutor */}
            {step === 3 && (
              <div className="w-full space-y-2 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-1.5 mb-2">
                  <Bot className="w-4 h-4 text-rose-500" />
                  <span className="text-[9px] font-bold text-gray-700">AI Tutor</span>
                </div>
                <div className="flex justify-end">
                  <div className="bg-indigo-600 text-white text-[10px] rounded-2xl rounded-br-sm px-2.5 py-1.5 max-w-[80%]">
                    Why does the parabola open upward?
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-100 text-gray-700 text-[10px] rounded-2xl rounded-bl-sm px-2.5 py-1.5 max-w-[80%] shadow-sm">
                    When the coefficient of x² is positive, the parabola opens upward! 📈
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Step indicator */}
          <div className="h-6 flex items-center justify-center gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-1 rounded-full transition-all ${step === i ? "w-6 bg-indigo-600" : "w-1.5 bg-gray-300"}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Floating sparkles */}
      <Sparkles className="absolute -top-2 -right-2 w-6 h-6 text-amber-400 animate-pulse" />
      <Sparkles className="absolute -bottom-2 -left-2 w-5 h-5 text-violet-400 animate-pulse" style={{ animationDelay: "0.5s" }} />
    </div>
  );
}
