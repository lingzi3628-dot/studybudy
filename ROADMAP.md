# StudyBuddy AI — Roadmap (Phase 53 → 59)

> This roadmap targets the **developer-track users** introduced in Phase 51:
> **web dev**, **AI/ML app dev**, **data**, **backend**, and **server/DevOps**.
> It completes the buddy system promised in the Phase 47 stubs
> (`src/lib/buddies/*.ts`) and closes the infrastructure gaps identified in the
> Phase 52 round. Track-based routing (K-12 vs higher-ed) already exists — every
> phase below ships into the surfaces HigherEdHome, BuddySwitcher, ProjectsScreen
> and the AI Tutor already provide.

## Current state snapshot (end of Phase 52)

| Buddy | Track | Status | Tooling shipped |
|---|---|---|---|
| StudyBuddy | k12 | ✅ Full | Curriculum, exams, spaced repetition, tutor |
| DevBuddy | dev | ✅ Full | CodeMirror editor + JS/Python runners (Ph 48) |
| DataBuddy | data | ✅ Full | Pyodide notebooks + datasets + matplotlib (Ph 49) |
| MLBuddy | ml | 🟡 v1 | TF.js playground: XOR/Iris/Housing only (Ph 50) |
| **WebBuddy** | dev | ❌ Stub | Prompt → site → preview → deploy promised, not built |
| **BackendBuddy** | dev | ❌ Stub | SQL playground + API tester promised, not built |
| **AIBuddy** | — | ❌ Missing | **No buddy teaches building AI apps at all** |
| ServerBuddy | dev | ❌ Stub | Simulated shell + Docker promised, not built |
| TVETBuddy | tvet | ❌ Stub | CDACC simulators promised, not built |

Known debt carried from Phase 52 (see worklog): no Prisma migrations
(`db push --accept-data-loss` on 102 models), no per-user SSE rate limiting,
63 tests for ~80k lines of TS, premium buddies gated with no live payment rail.

---

## Phase 53 — Hardening sprint (pre-flight, ~2 sessions)

**Why first.** Every phase after this adds models and SSE endpoints. Doing this
on a codebase that already runs 102 Prisma models multiplies the blast radius.
This is the small, unglamorous phase that makes 54–59 safe.

1. **Prisma migrations baseline** — `prisma/` has only `schema.prisma`; deploys
   use `db push --accept-data-loss`, which can silently drop columns.
   - `prisma migrate diff --from-empty --to-schema-datamodel schema.prisma --script > migrations/0_init/migration.sql`
   - `prisma migrate resolve --applied 0_init` (baseline the live Neon DB)
   - Switch `db:push` script to `prisma migrate deploy` in production paths;
     keep push for throwaway dev only. Remove `--accept-data-loss`.
   - Add a CI step: `migrate diff --exit-code` fails the build if a commit's
     schema has no migration.
2. **Per-user SSE rate limiting** — `/api/tutor/chat/stream` and
   `/api/study-groups/[id]/chat/stream` bypass `rate-limit.ts` (it only covers
   the classic POST path). Add a sliding-window limiter per userId for SSE
   opens + a global concurrent-connections cap (protects Neon connection pool
   and self-hosted memory).
3. **Streak-reminder push cron** — the Phase 52 push stack
   (`lib/push.ts`, `PushSubscription`, sw.js v61) is idle. Add
   `GET /api/cron/streak-reminder` (CRON_SECRET, same pattern as
   parent-digest): daily 17:00 UTC, fan out Web Push to users whose streak is
   alive but who haven't studied today; vercel.json entry.
4. **Test expansion, wave 1** — target the money and memory paths first:
   `monetization.ts`, `progression.ts` (mastery/SM-2), `tutor-chat-engine.ts`
   (intent detection + attachment parsing), `parent-digest.ts` aggregation.
   Goal: 63 → ~120 tests, all pure-logic (no DB).

**Done when:** a fresh Neon branch provisions via `migrate deploy`; SSE opens
are limited and logged; streak reminders arrive on a real device; test suite
doubles without touching DB.

---

## Phase 54 — WebBuddy: prompt → live website → deploy (web dev track)

**Fulfils the web.ts stub.** Audience: the "vibe-coder" web dev user — indie
hackers, designers, students who want a real URL by dinner.

1. **Generation contract** — new fenced spec ` ```webgen { … } ``` ` parsed in
   `tutor-chat-engine.ts` (same pattern as mathgraph/examgen): AI emits a
   single-file or multi-file HTML/CSS/JS site as structured JSON; server
   validates (script-tag injection into head/body only, no external hosts
   beyond CDN allowlist) and returns files as attachments.
2. **WebBuilderScreen** (three-pane, desktop split / tabbed mobile):
   - Left: chat with WebBuddy (reuses AITutorChat primitives)
   - Middle: CodeMirror file tree (reuses Phase 48 editor + Project model)
   - Right: sandboxed `<iframe srcdoc>` live preview with reload-on-change,
     device-size toggles (375/768/1280), and a captured console panel
   - Debounced preview refresh on file save
3. **Template library** — 8 seeded templates (landing, portfolio, blog,
   dashboard, pricing, product, school page, newsletter) stored as static
   JSON in `src/lib/web-templates.ts`; "Start from template" bypasses AI for
   free-tier sampling.
4. **Export & deploy** —
   - Save to Project (buddyId="web") via existing `/api/projects` routes
   - Download as ZIP (reuse pdf-export-style streaming, add `archiver`)
   - **Deploy**: Vercel Deploy Button flow — POST /api/projects/[id]/export
     produces a deploy-ready blob; real token-based deploys stay
     server-side (user pastes their own Vercel token, AES-encrypted like
     BYOK keys via `crypto.ts` — never stored plaintext)
5. **Wire the orphan** — `VisualApiEditor.tsx` currently is imported
   nowhere; keep it out of this phase (it belongs to BackendBuddy) but delete
   or wire it, don't leave dead screens.

**Done when:** "Build me a SaaS landing page" produces a live, editable,
shareable site in ≤60s; a project can be exported as ZIP; a premium user can
connect a Vercel token and get a real URL.

---

## Phase 55 — BackendBuddy: SQL playground + API tester (backend track)

**Fulfils the backend.ts stub** (and absorbs the orphaned VisualApiEditor
idea). Audience: full-stack learners who keep schema design at arm's length.

1. **SQL playground** — sql.js (WASM) in a worker, like Pyodide lazy-load:
   - Sample schemas loadable in one tap (blog, e-commerce, school)
   - Query editor with schema sidebar + result table + EXPLAIN-style
     row counts; queries run against an in-memory DB, persisted to
     Project files (`schema.sql`, `seed.sql`, `queries.sql`)
2. **OpenAPI editor** — wire/rewrite `VisualApiEditor.tsx` into an endpoint
   designer: methods, paths, request/response shapes → live OpenAPI 3.1 YAML
   with validation (Astro… no — use `@readme/openapi-parser` or similar);
   render docs preview.
3. **API tester** — built-in HTTP client (method, headers, JSON body) hitting
   **user-specified absolute URLs**; block private-IP/localhost SSRF targets
   server-side via a tiny proxy route `/api/tools/http` (browser CORS makes
   direct calls impossible; the proxy enforces allowlist + rate limits).
4. **Schema visualizer** — reuse the Phase 31 ER/concept-map renderer to draw
   the sql.js schema (tables → nodes, FKs → edges); also renders Prisma
   schema pasted by the user.
5. **Scaffold generator** — AI codegen from OpenAPI spec → Express or FastAPI
   project files, delivered through the Phase 48 "Save as project" pipeline
   so they open in DevBuddy's editor.

**Done when:** a learner designs a blog schema, seeds it, queries it, diagrams
it, generates an Express CRUD scaffold from an OpenAPI spec — all in-session.

---

## Phase 56 — AIBuddy: build AI-powered apps (the "AI app dev" track) — *new buddy*

**The gap.** No buddy teaches the user who wants to *ship* AI features:
prompt engineering, RAG, agents, evals. MLBuddy trains models; AIBuddy builds
products on top of them. Adds buddy `ai` to the registry + an `aiapp` choice
to the Phase 51 track picker (onboarding, /api/auth/me, page.tsx routing,
Profile switcher all get the new track value).

1. **Prompt Playground screen** — system prompt + user prompt + temperature/
   max-tokens controls; side-by-side A/B compare of two prompt versions using
   the existing provider chain (`ai.ts`: BYOK → admin providers → GLM);
   token usage + latency per run; save winning prompts as versioned Project
   files (`prompts.v1.md`).
2. **RAG notebook** — extends NotebookScreen with a `%%rag` cell magic:
   - Upload PDF/text → chunk → embed **in-browser** (TF.js Universal Sentence
     Encoder, no server cost) → vectors kept in an in-browser store
   - Ask a question → retrieve top-k chunks with similarity scores → answer
     with citations; export the whole pipeline as Python (Chroma + OpenAI) so
     learners see the production equivalent
3. **Agent canvas** — visual tool-calling flow builder: nodes = (LLM call,
   tool, condition); tools from a fixed set (web search, calculator, HTTP via
   the Phase 55 proxy, code run via Phase 48 sandbox); runs step-by-step with
   a visible trace; JSON export matches an OpenAI function-calling loop
   template the learner can download.
4. **Ship-it templates** — 4 starter projects auto-created via the Project
   model: streaming-chat page (mirrors our own Phase 52 SSE route),
   RAG-with-citations app, tool-calling agent, eval harness (prompt →
   assertions → score). Each is a runnable Next.js/Express mini-app the
   learner can export and grow.
5. **Curriculum seed** — 6 AI-generated lessons: prompting patterns, chunking
   strategies, embeddings, RAG evals, guardrails/PII, cost & latency budgets
   (cached like topic lessons via `/api/topics/[id]/lesson`).

**Done when:** a dev-track user can go "I have a PDF → build me a RAG bot" and
walk away with a working in-browser demo *and* a downloadable production
starter, having seen every moving part.

---

## Phase 57 — MLBuddy 2.0: depth + the notebook bridge (ML track)

**Closes what the ml.ts stub promised but Phase 50 didn't ship** (MNIST,
confusion matrix) and deepens the ML track.

1. **MNIST/CNN demo** — TF.js convolution layers already supported in
   `buildModel()`; add the MNIST dataset loader (hosted sample, cached in SW),
   canvas digit-draw input for inference.
2. **Confusion matrix renderer** — per-epoch and final, SVG, clickable cells
   showing misclassified samples.
3. **CSV dataset upload** — drop a CSV → column dtype inference →
   feature/target picker → normalized tensors (Housing demo logic
   generalized); stored in the Project.
4. **Notebook ↔ Playground bridge** — "Train in playground" button inside a
   DataBuddy notebook passes a dataframe (CSV-serialized) straight into
   MLPlaygroundScreen; conversely "Export training code" emits the
   equivalent Python (Keras) into the notebook.
5. **Model export** — download as TFJS layers JSON (already persisted) +
   generated Python/Keras equivalent + a one-page model card (architecture,
   metrics, intended use) rendered from the saved README.md.

**Done when:** a learner uploads their own CSV, trains, reads a confusion
matrix, exports code + model card without leaving the browser.

---

## Phase 58 — ServerBuddy: simulated terminal + deployment wizard (DevOps)

**Fulfils the server.ts stub.**

1. **xterm.js terminal + interpreter** — client-side fake filesystem (cwd,
   permissions, services) with a command interpreter covering the suggestion
   set: ls/cd/cat/chmod/chown/ps/systemctl/journalctl, curl against the
   Phase 55 proxy, and **simulated** `docker` / `docker-compose` (build a
   Dockerfile the learner wrote, "run" it, see logs). Everything simulated —
   no real shell, no server execution.
2. **Nginx config editor + validator** — write server blocks; lint against a
   grammar (duplicate directives, missing semicolons); live "nginx -t"
   equivalent; render the proxied-route diagram using the concept-map
   renderer.
3. **Deployment wizard** — guided runbooks (Vercel, Railway, VPS+Caddy —
   mirroring our own Caddyfile) with checkable steps; generates scripts and
   systemd units into a Project; quiz gate before "deploy complete".

**Done when:** a learner writes a Dockerfile, "runs" it in the sim, fixes a
failing Nginx proxy pass, and completes a VPS deploy runbook.

---

## Phase 59 — TVETBuddy: CDACC simulators (TVET track)

**Fulfils the tvet.ts stub** — unchanged from the original plan: CDACC
competency data per trade, then simulators in priority order: circuit builder
(electrical), gear train (mechanical), network topology (ICT), PLC ladder
logic, with skill checklists and practical-assessment sheets.

---

## Standing workstreams (parallel to all phases)

| Item | Detail |
|---|---|
| **Monetization** | web/backend/server/ml/ai buddies are premium-gated. Ship M-Pesa Daraja (STK push) + card fallback via a provider; entitlement checks in `/api/buddies` + tutor routes; Phase 53's test wave covers `monetization.ts` first. |
| **CI** | Keep the Phase 52 pipeline green; add migration-drift check (Ph 53) and typecheck promotion advisory → blocking once the current error count is paid down. |
| **Security hygiene** | Rotate any credential that ever touched git history (PAT, Gmail app password, admin passwords); keep secrets env-driven per `.env.example`. |
| **Docs freshness** | README tracks shipped features only; each phase updates README + worklog + bumps sw.js version (v61 → next). |
| **Android shell** | `android-build.md` Bubblewrap flow — rebuild the TWA after every SW bump that changes the navigation surface (54, 56). |

## Sequencing at a glance

```
Ph 53 Hardening ──► Ph 54 WebBuddy ──► Ph 55 BackendBuddy ──► Ph 56 AIBuddy
        │                                                            │
        └──────────────► Ph 57 MLBuddy 2.0 ◄────────────────────────┘
                              │
                    Ph 58 ServerBuddy ──► Ph 59 TVETBuddy
```

Numbering note: the Phase 47 stub comments said web=51 / backend=52 / server=53
/ tvet=54 — those slots were consumed by Higher-Ed tracks and the Phase 52
upgrade round. The stub `phase` fields are renumbered to match this roadmap
(54 / 55 / 58 / 59) so the BuddySwitcher "coming soon" labels stay honest.
