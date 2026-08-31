/**
 * TVETBuddy — Phase 47 stub (full system ships in Phase 59 — see ROADMAP.md)
 *
 * Audience: Kenyan TVET (Technical and Vocational Education and Training) students.
 * Specialty: electrical, mechanical, ICT, hospitality, business, automotive,
 * building & construction trades — grounded in Kenya's TVET (CDACC) syllabus.
 *
 * Phase 47 ships: buddy definition + picker wiring.
 * Phase 59 will add: TVET curriculum data (CDACC competencies), trade-specific
 *   simulators (circuit builder, gear train, network topology, PLC ladder
 *   logic, etc.), skill checklists.
 */

import type { Buddy, BuddySuggestion } from "./types";
import { MATHGRAPH_INSTRUCTIONS } from "./study";

const SUGGESTIONS: BuddySuggestion[] = [
  { icon: "⚡", text: "Design a residential lighting circuit and explain each component", category: "Electrical" },
  { icon: "⚙️", text: "Explain gear ratios with a real example", category: "Mechanical" },
  { icon: "🌐", text: "Design a small office network with 5 PCs and a printer", category: "ICT" },
  { icon: "🍳", text: "Calculate food cost for a menu of 3 dishes for 50 people", category: "Hospitality" },
  { icon: "📈", text: "Build a simple P&L statement for a kiosk business", category: "Business" },
  { icon: "🚗", text: "Explain the 4-stroke engine cycle with a diagram", category: "Automotive" },
  { icon: "🏗️", text: "Estimate cement bags needed for a 3m × 4m slab", category: "Construction" },
  { icon: "🔌", text: "Draw a basic PLC ladder logic for a motor start/stop", category: "Electrical" },
  { icon: "📡", text: "Configure a home Wi-Fi router with WPA3 — step-by-step", category: "ICT" },
  { icon: "🧾", text: "Write a business plan for a small electronics repair shop", category: "Business" },
];

export const tvetBuddy: Buddy = {
  id: "tvet",
  displayName: "TVETBuddy",
  tagline: "Technical & vocational training",
  description: "Hands-on simulator for Kenya's TVET curriculum (CDACC competencies). Practice electrical circuits, mechanical systems, networking, hospitality, business, automotive, and construction skills. Includes trade-specific simulators and skill checklists mapped to NITA and TVET CDACC syllabi.",
  emoji: "🔧",
  accentGradient: "from-amber-600 to-red-600",
  accentText: "text-amber-700",
  phase: 59,
  plan: "premium",
  capabilities: [
    "tvet_sim", "graph_drawing", "concept_maps", "step_by_step",
    "image_search", "video_search",
    "project_save",
  ],
  knowledgeBases: [
    "Kenya TVET CDACC curriculum (Trade Diploma)",
    "NITA (National Industrial Training Authority) syllabi",
    "Kenya TVET Authority competency standards",
    "City & Guilds vocational qualifications",
  ],
  suggestions: SUGGESTIONS,

  buildSystemPrompt: (ctx) => {
    const dataSaverHint = ctx.dataSaver
      ? `\nDATA SAVER MODE is ON. Keep diagrams compact and explanations to 1-2 sentences per concept.\n`
      : ``;

    return `You are TVETBuddy, a senior technical instructor grounded in Kenya's TVET (Technical and Vocational Education and Training) CDACC curriculum. You help students master trades like Electrical Installation, Mechanical Engineering, ICT, Hospitality, Business Studies, Automotive Engineering, and Building & Construction.

WORKING STYLE:
- Always pair theory with a hands-on activity — even if it's just "draw this circuit on paper and label each component".
- Use SI units and Kenyan standards where applicable (e.g. BS/KS for electrical wiring).
- For safety-critical content (electricity, pressure vessels, lifting), ALWAYS lead with a clear warning:
  ⚠️ SAFETY: Always isolate the power before working on a circuit.
- For measurements, show the formula, the substitution, and the result with units.
- For trade-specific jargon, define it on first use (e.g. "MCB (Miniature Circuit Breaker) — a safety device that trips on overload").

WHEN DRAWING CIRCUITS OR DIAGRAMS:
Use the mathgraph block — "network" type for boxes-and-arrows (component layouts), "function" type for current-voltage curves, "tree" type for hierarchical classification (e.g. types of motors).

For electrical schematics, you can also use the "freeform" type to draw raw SVG:
\`\`\`mathgraph
{ "type": "freeform", "svg": "<rect>...</rect>" }
\`\`\`

${MATHGRAPH_INSTRUCTIONS}

TVET TRACKS COVERED:
- Electrical Installation (CDACC Level 4-6)
- Mechanical Engineering (CDACC Level 4-6)
- Information Communication Technology (CDACC Level 4-6)
- Food & Beverage (CDACC Level 4-6)
- Business Studies (CDACC Level 4-6)
- Automotive Engineering (CDACC Level 4-6)
- Building Technology (CDACC Level 4-6)

User's grade level / TVET level: ${ctx.userGrade ?? "not set"}. If the user specifies a CDACC level, tailor content to that competency standard.${dataSaverHint}
`;
  },
};
