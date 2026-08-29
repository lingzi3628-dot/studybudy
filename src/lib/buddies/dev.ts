/**
 * DevBuddy — Phase 47 stub (full system shipped in Phase 48)
 *
 * Audience: coders, bootcampers, self-taught devs.
 * Specialty: writing, debugging, refactoring, explaining code in Python,
 * JavaScript, TypeScript, Go, and Rust.
 *
 * Phase 47 ships:
 *   - The buddy definition (metadata + system prompt)
 *   - The picker UI / switcher wiring
 *
 * Phase 48 will add:
 *   - The actual code editor (CodeMirror 6)
 *   - Multi-file project support (ProjectFile model is already in DB)
 *   - Python runner (already shipped in Phase 46 — just re-wires here)
 *   - JavaScript runner (QuickJS WASM)
 *   - Project save/load UI
 */

import type { Buddy, BuddySuggestion } from "./types";
import { MATHGRAPH_INSTRUCTIONS } from "./study";

const SUGGESTIONS: BuddySuggestion[] = [
  { icon: "🐍", text: "Write a Python function to reverse a linked list", category: "Python" },
  { icon: "🟨", text: "Explain async/await in JavaScript with a real example", category: "JavaScript" },
  { icon: "🦀", text: "Show me how ownership works in Rust with a simple example", category: "Rust" },
  { icon: "🐛", text: "Debug: my Python code throws 'list index out of range' — here's the code", category: "Debugging" },
  { icon: "♻️", text: "Refactor this JavaScript callback hell into async/await", category: "Refactoring" },
  { icon: "🧪", text: "Write unit tests for a function that validates Kenyan phone numbers", category: "Testing" },
  { icon: "📊", text: "What's the time and space complexity of binary search? Explain step-by-step.", category: "Algorithms" },
  { icon: "🏛️", text: "Explain SOLID principles with code examples in TypeScript", category: "Design" },
  { icon: "🌐", text: "Build a REST API in Express with CRUD for a 'todos' resource", category: "Backend" },
  { icon: "⚛️", text: "What's the difference between useMemo and useCallback? When to use each?", category: "React" },
];

export const devBuddy: Buddy = {
  id: "dev",
  displayName: "DevBuddy",
  tagline: "Code, debug, refactor, ship",
  description: "Pair-programmer for Python, JavaScript, TypeScript, Go, and Rust. Explains code line-by-line, debugs errors, refactors messy code, writes unit tests, and explains Big-O. Supports multi-file projects saved to your account.",
  emoji: "💻",
  accentGradient: "from-emerald-500 to-teal-500",
  accentText: "text-emerald-600",
  phase: 48,
  plan: "free",
  capabilities: [
    "code_files", "python_run", "js_run", "go_run",
    "graph_drawing", "step_by_step", "concept_maps",
    "project_save",
  ],
  knowledgeBases: [
    "MDN Web Docs", "freeCodeCamp curriculum",
    "Python official docs", "Go by Example", "Rust Book",
    "Clean Code (Robert C. Martin)", "Refactoring (Fowler)",
  ],
  suggestions: SUGGESTIONS,

  buildSystemPrompt: (ctx) => {
    const dataSaverHint = ctx.dataSaver
      ? `\nDATA SAVER MODE is ON. Keep your reply concise — code first, then a 1-2 sentence explanation. No long prose.\n`
      : ``;

    return `You are DevBuddy, an experienced pair-programmer for software developers. You help with Python, JavaScript, TypeScript, Go, Rust, and SQL. You're friendly but precise — you write real, runnable code, not pseudocode.

WORKING STYLE:
- Always wrap code in fenced blocks with the correct language tag (\`\`\`python, \`\`\`javascript, \`\`\`typescript, \`\`\`go, \`\`\`rust, \`\`\`sql).
- When debugging, point to the specific line that's wrong, explain WHY it's wrong, then show the fix.
- When teaching a new concept, lead with a minimal working example (≤15 lines), then expand.
- When asked to refactor, show the BEFORE and AFTER side-by-side and explain the trade-off.
- When explaining algorithms, give the time + space complexity and a one-line "when to use this".
- Use modern syntax: prefer async/await over .then(), prefer const over let, prefer arrow functions, prefer optional chaining.

CAPABILITIES AVAILABLE TO YOU:
- You can write multi-file code projects. Wrap each file in a separate code block with the file path in the language tag, e.g. \`\`\`python path="src/main.py"\`.
- You can draw diagrams using the mathgraph block (for architecture, data flow, sequence diagrams — use the "network" type for boxes-and-arrows).
- You can write step-by-step explanations using the mathgraph block with type="steps".

${MATHGRAPH_INSTRUCTIONS}

The user's grade level is: ${ctx.userGrade ?? "not set"}. The user's preferred language of instruction is: ${ctx.languageOfInstruction}. Adjust your explanations to that language if requested, but always write code in English (industry standard).

User's current AI model: ${ctx.currentModel}.${dataSaverHint}
`;
  },
};
