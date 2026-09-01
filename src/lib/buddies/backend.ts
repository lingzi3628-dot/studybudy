/**
 * BackendBuddy — SHIPPED in Phase 55 (see ROADMAP.md).
 *
 * Audience: backend developers, full-stack engineers.
 * Specialty: API design, SQL, database modeling, server code.
 *
 * Phase 55 workspace (BackendBuddyScreen):
 *   - SQL playground (sql.js WASM): schema/seed/queries files, sample
 *     schemas, per-statement result tables, live schema sidebar
 *   - OpenAPI 3.1 endpoint designer → live YAML (validated)
 *   - Express/FastAPI scaffold generation into project files
 *   - API tester via the SSRF-guarded /api/tools/http proxy
 *   - ER visualizer (sql.js schema or pasted Prisma schema)
 */

import type { Buddy, BuddySuggestion } from "./types";
import { MATHGRAPH_INSTRUCTIONS } from "./study";

const SUGGESTIONS: BuddySuggestion[] = [
  { icon: "🗄️", text: "Design a database schema for a blog with users, posts, comments, and tags", category: "Schema" },
  { icon: "📝", text: "Generate an OpenAPI spec for a todo CRUD API", category: "API Design" },
  { icon: "🚂", text: "Scaffold an Express server with JWT auth and PostgreSQL", category: "Scaffold" },
  { icon: "🐍", text: "Build a FastAPI server with SQLAlchemy + Pydantic", category: "Scaffold" },
  { icon: "🔍", text: "Write a SQL query to find the top 5 customers by purchase amount", category: "SQL" },
  { icon: "🔑", text: "Explain JWT vs session cookies — when to use each?", category: "Auth" },
  { icon: "🛡️", text: "How do I prevent SQL injection in Node.js? Show code", category: "Security" },
  { icon: "📈", text: "Design a rate limiter for a public API (token bucket)", category: "Scaling" },
  { icon: "🧩", text: "What's the repository pattern? Show me in TypeScript", category: "Patterns" },
  { icon: "🚦", text: "Design a REST API for an e-commerce checkout flow", category: "API Design" },
];

export const backendBuddy: Buddy = {
  id: "backend",
  displayName: "BackendBuddy",
  tagline: "APIs, SQL, databases, servers",
  description: "Design REST/GraphQL APIs, write SQL against an in-browser SQLite, generate Express/FastAPI server code, visualize database schemas as ER diagrams, and test endpoints with a built-in HTTP client. All without leaving the browser.",
  emoji: "⚙️",
  accentGradient: "from-rose-500 to-pink-500",
  accentText: "text-rose-600",
  phase: 55,
  plan: "premium",
  capabilities: [
    "sql_run", "api_test", "code_files",
    "graph_drawing", "concept_maps", "step_by_step",
    "project_save",
  ],
  knowledgeBases: [
    "12-Factor App", "REST API best practices (Zalando RESTful API guidelines)",
    "PostgreSQL docs", "MongoDB docs", "Prisma docs",
    "OWASP Top 10", "Designing Data-Intensive Applications (Kleppmann)",
  ],
  suggestions: SUGGESTIONS,

  buildSystemPrompt: (ctx) => {
    const dataSaverHint = ctx.dataSaver
      ? `\nDATA SAVER MODE is ON. Lead with the schema/code, then a 1-line summary. Skip long explanations.\n`
      : ``;

    return `You are BackendBuddy, a senior backend engineer who helps learners design APIs, model databases, and write server code. You work in an environment that includes an in-browser SQL sandbox (SQLite via WASM), an OpenAPI editor, and an HTTP client for testing endpoints.

WORKING STYLE:
- When designing an API, ALWAYS output the OpenAPI spec first (YAML), then the SQL schema, then the server code.
- When designing a database, output CREATE TABLE statements that work in SQLite (no Postgres-only features unless asked).
- Always include indexes on foreign keys and columns used in WHERE/ORDER BY clauses.
- Use parameterized queries — NEVER string concatenation. Show the user why.
- For auth, default to JWT (stateless) for stateless APIs and session cookies for traditional web apps. Explain the trade-off.
- For pagination, default to cursor-based for large datasets and offset-based for small ones.

OPENAPI SPEC FORMAT:
\`\`\`yaml path="openapi.yaml"
openapi: 3.0.3
info:
  title: ...
  version: 1.0.0
paths:
  /todos:
    get:
      summary: List todos
      responses:
        '200':
          description: OK
\`\`\`

SQL SCHEMA FORMAT:
\`\`\`sql path="schema.sql"
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_users_email ON users(email);
\`\`\`

ER DIAGRAM:
When asked to visualize a schema, use the mathgraph block with type="erdiagram":
\`\`\`mathgraph
{ "type": "erdiagram", "tables": [...], "relationships": [...] }
\`\`\`

${MATHGRAPH_INSTRUCTIONS}

User's grade level: ${ctx.userGrade ?? "not set"}. For beginners, explain foreign keys with a real example. For experienced devs, just write the schema.${dataSaverHint}
`;
  },
};
