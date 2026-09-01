/**
 * ServerBuddy — SHIPPED in Phase 58 (see ROADMAP.md).
 *
 * Audience: DevOps learners, sysadmins, junior backend devs.
 * Specialty: simulated Linux shell, Docker, Nginx, deployment runbooks.
 *
 * Phase 47 shipped: buddy definition + picker wiring.
 * Phase 58 shipped (ServerBuddyScreen — a fully simulated DevOps lab):
 *   - Simulated shell over a fake filesystem (permissions, sudo, chown,
 *     chmod, redirection, grep) with services + journals (systemctl,
 *     journalctl, ps) — all client-side, nothing can break
 *   - Simulated docker: real Dockerfile parsing (FROM/WORKDIR/COPY/RUN/
 *     ENV/EXPOSE/CMD), build/run/ps/stop/rm/logs/images/pull, port-conflict
 *     errors, plus a docker-compose subset (up/down/ps/logs)
 *   - Nginx config editor + live "nginx -t" validator (missing semicolons,
 *     unbalanced braces, duplicate vhosts, proxy_pass placement) with a
 *     request-flow diagram; saved configs are validated by
 *     `systemctl restart nginx` in the sim — broken configs fail to boot
 *   - Deployment runbooks (Vercel, Railway, VPS+Caddy) with checkable
 *     steps, generated artifacts (scripts, systemd units, Caddyfile)
 *     saved into Projects, and a quiz gate before "deploy complete"
 *   - curl answers only from within the sim (localhost services and
 *     containers); external URLs point learners at the real SSRF-guarded
 *     API tester in BackendBuddy
 */

import type { Buddy, BuddySuggestion } from "./types";
import { MATHGRAPH_INSTRUCTIONS } from "./study";

const SUGGESTIONS: BuddySuggestion[] = [
  { icon: "🐧", text: "Show me 20 essential Linux commands every dev should know", category: "Linux Basics" },
  { icon: "📁", text: "Explain Linux file permissions (chmod, chown) with examples", category: "Linux" },
  { icon: "🐳", text: "Write a Dockerfile for a Node.js app and explain each line", category: "Docker" },
  { icon: "🔧", text: "How do I set up Nginx as a reverse proxy for a Node app?", category: "Nginx" },
  { icon: "🚀", text: "Deploy a Next.js app to Vercel step-by-step", category: "Deploy" },
  { icon: "☁️", text: "What's the difference between EC2, ECS, and Lambda?", category: "AWS" },
  { icon: "📜", text: "Write a bash script to back up a directory to S3 daily", category: "Bash" },
  { icon: "🔍", text: "How do I debug a slow server? What commands do I run first?", category: "Troubleshooting" },
  { icon: "🛡️", text: "Set up a basic firewall with ufw on Ubuntu", category: "Security" },
  { icon: "⚙️", text: "What's a systemd service file? Show me one for a Node app", category: "Systemd" },
];

export const serverBuddy: Buddy = {
  id: "server",
  displayName: "ServerBuddy",
  tagline: "Linux, Docker, Nginx, deploy",
  description: "Practice Linux admin, Docker, and deployment in a safe simulated shell. Run commands like ls, cd, mkdir, grep, docker run, nginx -t — all in your browser. Includes step-by-step deployment runbooks for AWS, Vercel, Railway, and Fly.io. No real server required.",
  emoji: "🖥️",
  accentGradient: "from-gray-700 to-gray-900",
  accentText: "text-gray-700",
  phase: 58,
  plan: "premium",
  capabilities: [
    "shell_run", "code_files",
    "graph_drawing", "concept_maps", "step_by_step",
    "project_save",
  ],
  knowledgeBases: [
    "Linuxjourney.com", "Linux man pages", "Docker docs",
    "Nginx docs", "AWS Well-Architected Framework",
    "The Phoenix Project (Kim)", "UNIX and Linux System Administration Handbook",
  ],
  suggestions: SUGGESTIONS,

  buildSystemPrompt: (ctx) => {
    const dataSaverHint = ctx.dataSaver
      ? `\nDATA SAVER MODE is ON. Show commands first, then 1-line explanation per command. Skip long prose.\n`
      : ``;

    return `You are ServerBuddy, a senior DevOps engineer who teaches Linux administration, Docker, Nginx, and cloud deployment. You work in a simulated Linux shell that the user can run real commands in (ls, cd, cat, grep, mkdir, docker, nginx -t, etc.) — no real server, no risk of breaking anything.

WORKING STYLE:
- When explaining a command, ALWAYS wrap it in a bash code block so the user can copy it:
  \`\`\`bash
  ls -lah /var/log
  \`\`\`
- For multi-step procedures (deploy, set up a server), use a numbered list. Each step should be runnable independently.
- Always explain WHAT a command does before WHY. Beginners need to understand the action first, then the rationale.
- For dangerous commands (rm -rf, dd, mkfs), wrap them in a clear warning box:
  ⚠️ DANGER: \`rm -rf /\` will delete everything. NEVER run this on a real server.
- For Docker, default to multi-stage builds to keep image size small.
- For Nginx, always include a \`\`\`nginx path="/etc/nginx/sites-available/app"\` block when showing config.

DEPLOYMENT RUNBOOKS:
When asked to deploy, output a step-by-step runbook in this format:
\`\`\`bash
# Step 1: Install the CLI
npm install -g vercel

# Step 2: Log in
vercel login

# Step 3: Deploy
vercel --prod
\`\`\`

${MATHGRAPH_INSTRUCTIONS}

User's grade level: ${ctx.userGrade ?? "not set"}. For younger students, use analogies ("a server is like a kitchen — different tools do different jobs"). For experienced devs, just give the commands.${dataSaverHint}
`;
  },
};
