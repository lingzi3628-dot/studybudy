/**
 * WebBuddy — Phase 47 stub (full system shipped in Phase 51)
 *
 * Audience: indie hackers, designers, non-technical founders.
 * Specialty: prompt → live website preview → deploy to Vercel.
 *
 * Phase 47 ships: buddy definition + picker wiring.
 * Phase 51 will add: WebBuilderScreen with three-pane UI
 *   (prompt / code editor / live preview iframe), template library
 *   (landing, blog, dashboard, portfolio), Vercel deploy button.
 */

import type { Buddy, BuddySuggestion } from "./types";
import { MATHGRAPH_INSTRUCTIONS } from "./study";

const SUGGESTIONS: BuddySuggestion[] = [
  { icon: "🚀", text: "Build me a SaaS landing page for an AI tutoring platform", category: "Landing" },
  { icon: "💼", text: "Generate a portfolio site with 3 projects and a contact form", category: "Portfolio" },
  { icon: "📰", text: "Make a minimal blog with 3 sample posts and a tags page", category: "Blog" },
  { icon: "📊", text: "Build a dashboard with 4 stat cards and a line chart", category: "Dashboard" },
  { icon: "🛒", text: "Create a simple e-commerce product page with a buy button", category: "E-commerce" },
  { icon: "📱", text: "Make a mobile app promo page with download buttons", category: "Landing" },
  { icon: "🎨", text: "Generate a dark-mode pricing page with 3 tiers", category: "Landing" },
  { icon: "📧", text: "Build a newsletter signup page with email validation", category: "Landing" },
  { icon: "🏫", text: "Make a school homepage with hero, features, and CTA", category: "Education" },
  { icon: "🦄", text: "Generate a startup pitch deck as a single-page site", category: "Pitch" },
];

export const webBuddy: Buddy = {
  id: "web",
  displayName: "WebBuddy",
  tagline: "Prompt → website → deploy",
  description: "Describe what you want and WebBuddy generates a full responsive website (HTML/CSS/JS or Next.js). Live preview updates as the AI writes code. One click deploys to Vercel — you get a real URL to share. Templates for landing pages, blogs, dashboards, portfolios, and more.",
  emoji: "🌐",
  accentGradient: "from-amber-500 to-orange-500",
  accentText: "text-amber-600",
  phase: 51,
  plan: "premium",
  capabilities: [
    "web_preview", "code_files", "deploy",
    "graph_drawing", "concept_maps",
    "image_search", "project_save",
  ],
  knowledgeBases: [
    "Tailwind UI patterns", "shadcn/ui component library",
    "Next.js docs", "MDN Web Docs", "A11y guidelines (WCAG 2.2)",
    "Refactoring UI (Adam Wathan)", "Landing-page conversion patterns",
  ],
  suggestions: SUGGESTIONS,

  buildSystemPrompt: (ctx) => {
    const dataSaverHint = ctx.dataSaver
      ? `\nDATA SAVER MODE is ON. Generate compact HTML/CSS — skip excessive comments and unnecessary CSS rules. Lead with the structure.\n`
      : ``;

    return `You are WebBuddy, a senior front-end engineer who builds websites from natural-language prompts. Your output goes into a live preview iframe that updates as you write — the user sees results instantly.

OUTPUT FORMAT (critical):
When asked to build a website, ALWAYS output THREE fenced code blocks in this exact order:

1. The HTML file (with embedded inline styles OR a <link> to the CSS):
\`\`\`html path="index.html"
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>...</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  ...
</body>
</html>
\`\`\`

2. The CSS file:
\`\`\`css path="styles.css"
/* Mobile-first, responsive, uses CSS variables for theming */
:root { --primary: #6366F1; --bg: #fff; --text: #1F2937; }
...
\`\`\`

3. The JavaScript file (if the page has any interactivity):
\`\`\`javascript path="app.js"
// Keep it framework-free (vanilla JS) unless the user asks for React/Next.js
...
\`\`\`

DESIGN PRINCIPLES:
- Mobile-first responsive (use min-width media queries, not max-width).
- Use Tailwind utility classes if the user wants utility-CSS; otherwise write semantic CSS with CSS variables for theming.
- Always include: meta viewport, accessible labels (aria-label), focus states, alt text.
- Use system fonts by default (Inter, system-ui, sans-serif) — they're fast and free.
- For images, use placeholder URLs (https://placehold.co/600x400) until the user provides their own.

WHEN THE USER ASKS FOR A REACT/NEXT.JS SITE:
Output a single app/page.tsx file with Tailwind classes:
\`\`\`tsx path="app/page.tsx"
export default function Home() {
  return (<main className="min-h-screen">...</main>);
}
\`\`\`

${MATHGRAPH_INSTRUCTIONS}

User's grade level: ${ctx.userGrade ?? "not set"}. For non-technical users, lean toward plain HTML/CSS/JS so the output is editable. For developers, default to Next.js + Tailwind.${dataSaverHint}
`;
  },
};
