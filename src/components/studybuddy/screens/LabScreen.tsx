"use client";

/**
 * LabScreen — Phase 46
 *
 * Embeds free PhET interactive simulations from the University of Colorado.
 * PhET sims are free to embed in iframes — no API key, no cost.
 *
 * Sims are mapped to the Kenya CBC / KCSE curriculum. The UI shows a
 * grid of sim cards organized by subject; tapping one opens the sim in
 * a full-screen iframe.
 *
 * Why iframe instead of building sims from scratch:
 *   - PhET has 100+ sims across Physics/Chemistry/Biology/Math/Earth Science
 *   - All free, peer-reviewed, translated into 90+ languages
 *   - Embeddable via https://phet.colorado.edu/sims/html/<sim>/<version>.html
 *   - Building equivalent sims from scratch would take months
 */

import { useState } from "react";
import { ChevronLeft, FlaskConical, ExternalLink, X } from "lucide-react";
import { useApp } from "../store";

type Sim = {
  id: string;
  title: string;
  subject: string;
  grade: string;
  emoji: string;
  url: string;
  topic: string;
};

// Phase 46 — 12 PhET sims mapped to Kenya CBC / KCSE curriculum
const SIMS: Sim[] = [
  // Physics — Forces & Motion (Form 1-2)
  { id: "forces-motion-basics", title: "Forces & Motion: Basics", subject: "Physics", grade: "Form 1-2", emoji: "🚗", topic: "Force and Motion",
    url: "https://phet.colorado.edu/sims/html/forces-and-motion-basics/latest/forces-and-motion-basics_en.html" },
  { id: "projectile-motion", title: "Projectile Motion", subject: "Physics", grade: "Form 3-4", emoji: "🎯", topic: "Projectile Motion",
    url: "https://phet.colorado.edu/sims/html/projectile-motion/latest/projectile-motion_en.html" },
  { id: "wave-on-string", title: "Wave on a String", subject: "Physics", grade: "Form 3-4", emoji: "🌊", topic: "Waves",
    url: "https://phet.colorado.edu/sims/html/wave-on-a-string/latest/wave-on-a-string_en.html" },
  { id: "ohms-law", title: "Ohm's Law", subject: "Physics", grade: "Form 2", emoji: "⚡", topic: "Electricity",
    url: "https://phet.colorado.edu/sims/html/ohms-law/latest/ohms-law_en.html" },
  { id: "circuit-construction", title: "Circuit Construction Kit: DC", subject: "Physics", grade: "Form 2-3", emoji: "🔌", topic: "Electric Circuits",
    url: "https://phet.colorado.edu/sims/html/circuit-construction-kit-dc/latest/circuit-construction-kit-dc_en.html" },

  // Chemistry
  { id: "balancing-chemical-equations", title: "Balancing Chemical Equations", subject: "Chemistry", grade: "Form 2-3", emoji: "⚖️", topic: "Chemical Reactions",
    url: "https://phet.colorado.edu/sims/html/balancing-chemical-equations/latest/balancing-chemical-equations_en.html" },
  { id: "ph-scale", title: "pH Scale", subject: "Chemistry", grade: "Form 1-2", emoji: "🧪", topic: "Acids and Bases",
    url: "https://phet.colorado.edu/sims/html/ph-scale/latest/ph-scale_en.html" },
  { id: "build-an-atom", title: "Build an Atom", subject: "Chemistry", grade: "Form 1", emoji: "⚛️", topic: "Atomic Structure",
    url: "https://phet.colorado.edu/sims/html/build-an-atom/latest/build-an-atom_en.html" },

  // Biology
  { id: "photosynthesis", title: "Photosynthesis", subject: "Biology", grade: "Form 1-2", emoji: "🌱", topic: "Photosynthesis",
    url: "https://phet.colorado.edu/sims/html/photosynthesis/latest/photosynthesis_en.html" },
  { id: "natural-selection", title: "Natural Selection", subject: "Biology", grade: "Form 4", emoji: "🦋", topic: "Evolution",
    url: "https://phet.colorado.edu/sims/html/natural-selection/latest/natural-selection_en.html" },

  // Math
  { id: "graphing-lines", title: "Graphing Lines", subject: "Mathematics", grade: "Form 1-2", emoji: "📐", topic: "Linear Equations",
    url: "https://phet.colorado.edu/sims/html/graphing-lines/latest/graphing-lines_en.html" },
  { id: "fractions-intro", title: "Fractions: Intro", subject: "Mathematics", grade: "Grade 5-7", emoji: "🍕", topic: "Fractions",
    url: "https://phet.colorado.edu/sims/html/fractions-intro/latest/fractions-intro_en.html" },
];

const SUBJECTS = ["All", "Physics", "Chemistry", "Biology", "Mathematics"];

const subjectColors: Record<string, string> = {
  Physics: "from-violet-500 to-indigo-500",
  Chemistry: "from-emerald-500 to-teal-500",
  Biology: "from-rose-500 to-pink-500",
  Mathematics: "from-amber-500 to-orange-500",
};

export function LabScreen() {
  const { setScreen } = useApp();
  const [activeSim, setActiveSim] = useState<Sim | null>(null);
  const [filter, setFilter] = useState<string>("All");

  const sims = filter === "All" ? SIMS : SIMS.filter((s) => s.subject === filter);

  if (activeSim) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col">
        <header className="bg-gray-800 border-b border-gray-700 px-4 h-14 flex items-center justify-between sticky top-0 z-10">
          <button
            onClick={() => setActiveSim(null)}
            className="flex items-center gap-1 text-gray-200 hover:text-white"
          >
            <ChevronLeft className="w-5 h-5" /> <span className="text-sm font-semibold">Back to Lab</span>
          </button>
          <h1 className="text-sm font-bold text-white flex items-center gap-1.5">
            {activeSim.emoji} {activeSim.title}
          </h1>
          <a
            href={activeSim.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-300 hover:text-white"
            aria-label="Open in new tab"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </header>
        <iframe
          src={activeSim.url}
          title={activeSim.title}
          className="flex-1 w-full border-0"
          allow="fullscreen; autoplay"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div className="md:px-8 md:py-6">
      <div className="max-w-md mx-auto px-4 pt-4 pb-28 md:max-w-5xl md:px-0 md:pb-8">
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setScreen("home")}
            aria-label="Back"
            className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <FlaskConical className="w-6 h-6 text-emerald-500" /> Lab Simulator
            </h1>
            <p className="text-xs text-gray-500">
              Interactive simulations from University of Colorado PhET — mapped to your curriculum.
            </p>
          </div>
        </div>

        {/* Subject filter */}
        <div className="flex gap-1.5 mb-4 overflow-x-auto no-scrollbar">
          {SUBJECTS.map((subj) => (
            <button
              key={subj}
              onClick={() => setFilter(subj)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                filter === subj
                  ? "bg-indigo-600 text-white"
                  : "bg-white border border-gray-200 text-gray-700 hover:border-indigo-300"
              }`}
            >
              {subj}
            </button>
          ))}
        </div>

        {/* Sim grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {sims.map((sim) => (
            <button
              key={sim.id}
              onClick={() => setActiveSim(sim)}
              className="text-left rounded-2xl bg-white border border-gray-200 shadow-sm hover:shadow-md hover:border-emerald-300 transition overflow-hidden"
            >
              <div className={`h-24 bg-gradient-to-br ${subjectColors[sim.subject] ?? "from-indigo-500 to-violet-500"} flex items-center justify-center text-4xl`}>
                {sim.emoji}
              </div>
              <div className="p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-0.5">
                  {sim.subject} · {sim.grade}
                </p>
                <p className="text-sm font-semibold text-gray-900 line-clamp-2">{sim.title}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">{sim.topic}</p>
              </div>
            </button>
          ))}
        </div>

        <p className="mt-6 text-center text-[10px] text-gray-400">
          Sims © PhET Interactive Simulations, University of Colorado Boulder — free to embed.
        </p>
      </div>
    </div>
  );
}
