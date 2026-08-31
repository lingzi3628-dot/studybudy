# StudyBuddy AI

[![CI](https://github.com/lingzi3628-dot/studybudy/actions/workflows/ci.yml/badge.svg)](https://github.com/lingzi3628-dot/studybudy/actions/workflows/ci.yml)

A mobile-first, AI-powered study companion web app (PWA). Built with Next.js 16, TypeScript, Tailwind CSS, custom JWT authentication (email + password), Neon Postgres, and the Z.ai GLM SDK.

## Features

- **AI Flashcards & Quizzes** — paste text or upload a PDF, AI generates flashcards + MCQs with explanations
- **Interactive Study Room** — a dedicated space per topic with lesson, practice cards, AI tutor chat, and step-by-step math solver
- **Math Graph Explorer** — type an equation, get a live chart (Recharts) with slope/intercept/vertex detection
- **Language Learning** — Swahili, Chinese, French, Spanish, Arabic with flashcards, listening, and matching modes
- **AI Tutor Chat** — full-screen conversational tutor with topic context
- **Learning Paths** — 4-week AI-generated roadmaps with weekly objectives
- **Spaced Repetition (SM-2)** — schedules card reviews based on memory engine
- **Progression Engine** — Laplace-smoothed mastery per subject/topic, XP, streaks, badges
- **Admin Panel** — manage users, AI providers, content (books/chapters/topics), and view logs
- **BYOK Support** — users can paste their own OpenAI-compatible API key
- **PWA** — installable, offline-capable, with app icons and manifest
- **Streaming AI Tutor** — token-by-token replies via SSE (ChatGPT-style) *(Phase 52)*
- **Real-time Group Chat** — SSE live stream with auto-reconnect + polling fallback *(Phase 52)*
- **Web Push Notifications** — group messages and system alerts reach users even with the app closed *(Phase 52)*
- **Weekly Parent Emails** — automated child progress digests via cron *(Phase 52)*
- **WebBuddy Website Builder** — prompt → generated HTML/CSS/JS files → live sandboxed preview (device toggles + console) → save/export ZIP → one-click Vercel deploy with your own token; 8 offline-first starter templates *(Phase 54)*
- **AIBuddy — AI App Dev track** — new onboarding track + buddy for building AI apps: A/B Prompt Playground (temperature, latency, token estimates), in-browser RAG notebook cells (TF.js Universal Sentence Encoder embeddings + [chunk N] citations), Agent Builder (spec + runnable tool-calling loop), and 4 ship-it starter projects *(Phase 56)*

## Tech Stack

- **Framework**: Next.js 16 (App Router) + TypeScript 5
- **Styling**: Tailwind CSS 4 + shadcn/ui (New York style)
- **Database**: Neon Postgres + Prisma ORM
- **User Auth**: Custom JWT (HTTP-only cookie, bcrypt-hashed passwords, email OTP verification)
- **Admin Auth**: Separate JWT (HTTP-only cookie, bcrypt-hashed admin_users table)
- **AI**: Z.ai GLM SDK (platform fallback) + OpenAI-compatible admin-configured providers + BYOK
- **Real-time**: Server-Sent Events (streaming AI tutor replies, live study-group chat)
- **Push**: Web Push (VAPID) via the service worker
- **Charts**: Recharts
- **PDF Text Extraction**: pdf-parse
- **Math Parsing**: mathjs
- **Icons**: lucide-react

## Project Structure

```
studybudy/
├── prisma/
│   └── schema.prisma           # Prisma schema (User, AdminUser, StudySet, Card, Topic, etc.)
├── public/
│   ├── icon.svg                 # App icon source (SVG)
│   ├── icon-16.png              # PNG icons (various sizes)
│   ├── icon-32.png
│   ├── icon-192.png
│   ├── icon-512.png
│   ├── apple-touch-icon.png     # Apple touch icon (180x180)
│   ├── favicon.ico
│   ├── manifest.json            # PWA manifest
│   └── sw.js                    # Service worker
├── scripts/
│   └── generate-icons.ts        # Generates PNG icons from SVG
├── src/
│   ├── app/
│   │   ├── api/                 # API routes
│   │   │   ├── admin/           # Admin-only (protected by JWT)
│   │   │   ├── user/            # User-only (protected by JWT cookie)
│   │   │   ├── study-sets/
│   │   │   ├── generate/
│   │   │   ├── topics/
│   │   │   ├── review/
│   │   │   └── ...
│   │   ├── layout.tsx           # Root layout (ClerkProvider, manifest, SW register)
│   │   └── page.tsx             # Main entry — state-based screen dispatcher
│   ├── components/
│   │   ├── studybuddy/          # All StudyBuddy-specific components
│   │   │   ├── screens/         # All screens (Landing, AdminLogin, AdminPanel, etc.)
│   │   │   ├── AuthProvider.tsx
│   │   │   ├── BottomNav.tsx
│   │   │   ├── TopBar.tsx
│   │   │   ├── store.ts         # Zustand store (screen state, navigation)
│   │   │   └── api.ts           # Frontend API client
│   │   └── ui/                  # shadcn/ui components
│   └── lib/
│       ├── ai.ts                # AI helper (BYOK → admin providers → GLM fallback)
│       ├── ai-providers.ts      # Admin-configured AI provider logic + logging
│       ├── admin-auth.ts        # (deprecated) requireAdmin based on ADMIN_EMAILS
│       ├── admin-jwt.ts         # signAdminToken / verifyAdminToken
│       ├── admin-session.ts    # requireAdminJwt — used by all /api/admin/* routes
│       ├── auth.ts              # getCurrentUser — Clerk + dev fallback
│       ├── crypto.ts            # AES-256-CBC encrypt/decrypt/mask
│       ├── db.ts                # Prisma client singleton
│       ├── memory.ts            # SM-2 spaced repetition algorithm
│       ├── pdf.ts               # PDF text extraction
│       ├── progression.ts       # recordAttempt + Laplace mastery + SM-2 updates
│       └── rate-limit.ts        # Per-user daily AI call limit
├── .env.example                 # Template — copy to .env and fill in
├── next.config.ts
├── package.json
└── README.md
```

## Setup

### Prerequisites

- Node.js 20+ (or Bun)
- A Neon Postgres database (https://console.neon.tech)
- A Clerk account (https://dashboard.clerk.com)
- (Optional) An OpenAI-compatible AI provider key for admin-configured providers

### Install

```bash
# Clone the repo
git clone https://github.com/lingzi3628-dot/studybudy.git
cd studybudy

# Install dependencies
bun install   # or: npm install
```

### Configure environment

```bash
# Copy the template
cp .env.example .env

# Edit .env with your real values
# Required for dev: DATABASE_URL, API_KEY_ENCRYPTION_SECRET, ADMIN_JWT_SECRET, ADMIN_INITIAL_EMAIL, ADMIN_INITIAL_PASSWORD
# Required for prod: all of the above + NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY + CLERK_SECRET_KEY
```

### Set up the database

```bash
# Fresh database — apply the migration history (recommended)
bun run db:deploy      # prisma migrate deploy

# Existing database created with the old `db push` flow — baseline it ONCE:
npx prisma migrate resolve --applied 0_init

# (Optional) View/edit your data
bun run db:studio
```

### Database migrations (Phase 53)

The schema is now managed by **Prisma Migrate** — `prisma/migrations/` holds
the migration history (0_init is the baseline of the full 102-model schema).
Deploys run `prisma migrate deploy`, which only applies pending migrations and
**never** discards data (the old `db push --accept-data-loss` could silently
drop columns).

Rules:

- **Schema change → new migration.** After editing `prisma/schema.prisma`,
  generate the SQL into a new migration folder:
  ```bash
  npx prisma migrate diff --from-migrations prisma/migrations \
    --shadow-database-url "$SHADOW_DATABASE_URL" \
    --to-schema-datamodel prisma/schema.prisma \
    --script > prisma/migrations/<name>/migration.sql
  ```
  CI's **Migration drift check** step fails if `schema.prisma` and the
  migration history disagree.
- `db:push` still exists for throwaway experiments but no longer carries
  `--accept-data-loss`.
- The build script runs `migrate deploy` warn-only (so builds without a
  reachable DB don't break); run `bun run db:deploy` explicitly after deploying
  if you prefer strictness.

### Run in dev

```bash
bun run dev
# → http://localhost:3000
```

The dev server will start on port 3000. Open http://localhost:3000 in your browser.

In dev mode (no Clerk keys), the app falls back to a demo user (alex@studybuddy.ai) so all features work end-to-end without real auth.

### Lint

```bash
bun run lint
```

## Environment Variables

See [`.env.example`](./.env.example) for the full list with descriptions.

| Variable | Purpose | Required |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk user auth (publishable key) | Prod yes, dev optional |
| `CLERK_SECRET_KEY` | Clerk user auth (secret) | Prod yes, dev optional |
| `DATABASE_URL` | Neon Postgres connection string | Yes |
| `PLATFORM_AI_API_KEY` | Optional: swap off GLM SDK to a paid OpenAI-compatible endpoint | No |
| `PLATFORM_AI_API_URL` | Optional: base URL for platform AI | No |
| `PLATFORM_AI_MODEL` | Optional: model name | No |
| `API_KEY_ENCRYPTION_SECRET` | 32-byte hex — encrypts user BYOK keys | Yes |
| `ADMIN_JWT_SECRET` | 32-byte hex — signs admin JWT cookies | Yes |
| `ADMIN_INITIAL_EMAIL` | Initial admin email (used once on first deploy) | Yes |
| `ADMIN_INITIAL_PASSWORD` | Initial admin password (used once on first deploy) | Yes |

### Generating secrets

```bash
# 32-byte hex secret for API_KEY_ENCRYPTION_SECRET or ADMIN_JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Authentication

### User Auth (custom JWT)

The app uses its own JWT auth (no third-party provider):
- **Email + Password** with bcrypt hashing (`POST /api/auth/register`, `POST /api/auth/login`)
- **Email verification OTP** required before using the app (sendmail via SMTP)
- **Password reset** via emailed reset links
- Session = HTTP-only `user_token` cookie signed with `ADMIN_JWT_SECRET`

All user API routes verify the session via `getCurrentUser()` (`src/lib/auth.ts`).

### Admin Auth (custom JWT, separate from Clerk)

The admin panel uses a **separate** authentication system:
1. On first deploy, the `/api/admin/auth/login` endpoint auto-seeds the initial admin from `ADMIN_INITIAL_EMAIL` + `ADMIN_INITIAL_PASSWORD` (bcrypt-hashed) if the `admin_users` table is empty.
2. Admin logs in at `/admin/login` with email + password.
3. Server verifies bcrypt hash, signs a JWT, sets it as an HTTP-only cookie (`admin_token`, 7-day expiry).
4. All `/api/admin/*` routes verify the JWT via `requireAdminJwt()` — no Clerk session required.
5. Admin can change their password inside the admin panel (Account tab).

The admin auth is **fully separate** from user auth. A regular user cannot access `/api/admin/*` routes — they need to log in with admin credentials separately.

## API Routes

### User routes (protected by JWT — uses `getCurrentUser()`)
- `GET /api/user` — current user
- `POST /api/user` — update profile
- `POST /api/user/onboarding` — save onboarding answers
- `GET /api/user/profile` — full profile
- `PUT /api/user/profile` — update profile fields
- `GET/POST/DELETE /api/user/api-key` — BYOK management
- `POST /api/user/delete` — delete account (requires `{ confirmation: "DELETE" }`)
- `GET /api/user/sessions` — login history
- `GET/POST /api/study-sets` + `GET/DELETE /api/study-sets/[id]` — study set CRUD
- `POST /api/generate/cards` — AI flashcards + MCQs from text
- `POST /api/generate/learning-path` — 4-week AI roadmap
- `POST /api/generate/graph` — equation parsing + sample points + AI explanation
- `POST /api/search` — AI summary + key points + sample MCQ
- `POST /api/attempts` — record attempt + SM-2 update + mastery update
- `POST /api/language/translate` — AI translate
- `GET /api/progress` — XP, level, streak, mastery, weak areas, badges
- `GET /api/review/queue` — due cards
- `POST /api/review/submit` — submit review quality
- `POST /api/tutor` — AI tutor chat
- `POST /api/tutor/chat/stream` — AI tutor chat with SSE streaming (Phase 52)
- `GET /api/study-groups/[id]/chat/stream` — live group chat via SSE (Phase 52)
- `POST /api/push/subscribe` / `POST /api/push/unsubscribe` / `GET /api/push/status` — Web Push (Phase 52)
- `GET|POST /api/cron/parent-digest` — weekly parent progress emails, CRON_SECRET-protected (Phase 52)
- `GET|POST /api/cron/streak-reminder` — daily streak-keeper push notifications, CRON_SECRET-protected (Phase 53)
- `GET /api/projects/[id]/export` — download any project as a ZIP (Phase 54)
- `POST /api/deploy/vercel` — deploy a static project to Vercel with a user-supplied token (BYOT, never stored) (Phase 54)
- `POST /api/ai/playground` — run a (system, user) prompt pair with sampling controls for the Prompt Playground (Phase 56)
- `POST /api/extract/file` — PDF/text upload + text extraction
- `POST /api/study-sets/from-graph` — save graph as study set
- `GET/POST /api/topics` + `GET /api/topics/[id]` — topic browse + details
- `POST /api/topics/[id]/lesson` — AI lesson (cached)
- `GET /api/topics/[id]/practice` — due + new cards
- `POST /api/topics/[id]/tutor` — topic-aware chat
- `POST /api/topics/[id]/solver` — step-by-step math solver

### Admin routes (protected by `requireAdminJwt()`)
- `POST /api/admin/auth/login` — verify creds, set cookie (auto-seeds initial admin on first call if `admin_users` is empty)
- `POST /api/admin/auth/logout` — clear cookie
- `GET /api/admin/auth/me` — current admin
- `POST /api/admin/auth/change-password` — change admin password
- `GET /api/admin/check` — admin status check (used by client)
- `GET /api/admin/stats` — dashboard stats
- `GET/PUT/DELETE /api/admin/users` + `GET/PUT/DELETE /api/admin/users/[id]` — user management
- `GET/POST/PUT/DELETE /api/admin/providers` + `[id]` + `[id]/test` — AI provider management
- `GET/POST/PUT/DELETE /api/admin/books` + `[id]` — book CRUD
- `GET/POST/PUT/DELETE /api/admin/chapters` + `[id]` — chapter CRUD
- `GET/POST/PUT/DELETE /api/admin/topics` + `[id]` — topic CRUD (admin)
- `POST /api/admin/generate/book` — AI book outline
- `POST /api/admin/generate/topic` — AI topic lesson + cards
- `GET /api/admin/logs/ai` — AI call logs
- `GET /api/admin/logs/actions` — admin action logs

## PWA

The app is installable as a PWA:
- `public/manifest.json` — name, icons, theme color, display mode
- `public/sw.js` — service worker for offline caching + Web Push (push / notificationclick handlers)
- `ServiceWorkerRegister.tsx` — registers the SW in production builds
- App icons in 16x16, 32x32, 192x192, 512x512 PNG + 180x180 apple-touch-icon
- **Web Push** — set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` (generate with `npx web-push generate-vapid-keys`); users opt in via the bell panel

To regenerate icons from the SVG source:

```bash
bun run scripts/generate-icons.ts
```

## Deploy to Vercel

1. Push the repo to GitHub.
2. In Vercel dashboard → New Project → import the GitHub repo.
3. Add all environment variables from `.env.example` in Project Settings → Environment Variables.
4. Vercel auto-detects Next.js and runs `next build` on deploy.
5. After the first deploy, the initial admin is auto-seeded from `ADMIN_INITIAL_EMAIL` + `ADMIN_INITIAL_PASSWORD` on the first request to `/api/admin/auth/login`.
6. Log in at `https://your-domain.vercel.app/admin/login` with the initial admin credentials.
7. **Immediately** change the admin password via the Account tab in the admin panel.
8. (Optional) Remove `ADMIN_INITIAL_EMAIL` + `ADMIN_INITIAL_PASSWORD` from Vercel env vars after the admin password is changed — they're only used on first deploy when `admin_users` is empty.

## License

MIT — see LICENSE file (or just use it however you want).
