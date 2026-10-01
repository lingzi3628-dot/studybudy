# AI Tutor Backend — Complete Testing Guide

This guide covers how to test every phase of the AI tutor backend improvements (Phases 91–96). Tests are organized into **automated tests** (run locally, no DB needed) and **manual smoke tests** (run against a live deployment).

---

## Quick Start

```bash
# 1. Install dependencies (if not already done)
npm install

# 2. Run the full automated test suite
npx vitest run src/lib/tutor/__tests__/ src/lib/tutor-intents.test.ts src/lib/rag-engine.test.ts

# Expected: 170 tests passing across 7 files
```

---

## Automated Test Suite (170 tests, no DB required)

All tests are mocked — they don't need a running PostgreSQL database or the TensorFlow.js model. They run in ~2 seconds.

### Test files + what they cover

| File | Tests | Phase | What it covers |
|---|---|---|---|
| `src/lib/tutor/__tests__/context-builder.test.ts` | 48 | 91, 92, 93, 95 | System-prompt assembly for all 6 track×course branches + learner-state/RAG/lesson-state injection |
| `src/lib/tutor/__tests__/learner-state.test.ts` | 29 | 92 | Learner state fetching + prompt formatting (weakest/strongest topics, streak, new learner) |
| `src/lib/tutor/__tests__/rag.test.ts` | 15 | 93 | RAG feature flag + retrieved-knowledge prompt formatting |
| `src/lib/tutor/__tests__/curriculum-engine.test.ts` | 16 | 94 | KICD source URL resolution + curriculum context citation rules |
| `src/lib/tutor/__tests__/lesson-controller.test.ts` | 27 | 95 | Lesson state machine (introduce → explain → check → advance → complete) |
| `src/lib/tutor-intents.test.ts` | 20 | (existing) | Intent detection regex (video, image, graph types) — no regression |
| `src/lib/rag-engine.test.ts` | 15 | (existing) | Browser-side RAG chunking + cosine similarity — no regression |

### Running individual test files

```bash
# Phase 91 — context-builder extraction
npx vitest run src/lib/tutor/__tests__/context-builder.test.ts

# Phase 92 — learner-state injection
npx vitest run src/lib/tutor/__tests__/learner-state.test.ts

# Phase 93 — semantic RAG
npx vitest run src/lib/tutor/__tests__/rag.test.ts

# Phase 94 — KICD source citations
npx vitest run src/lib/tutor/__tests__/curriculum-engine.test.ts

# Phase 95 — lesson controller
npx vitest run src/lib/tutor/__tests__/lesson-controller.test.ts
```

### Running tests in watch mode (during development)

```bash
npx vitest src/lib/tutor/__tests__/
```

---

## TypeScript Build Verification

```bash
# Check for type errors across the whole project
npx tsc --noEmit

# Expected: 13 pre-existing errors (in untouched admin-tab + json-schemas files).
# All Phase 91–96 files should have ZERO errors.
# To verify only the new files:
npx tsc --noEmit 2>&1 | grep -E "tutor/|curriculum-engine|upload-outline"
# Expected: (empty output)
```

---

## Database Migrations (2 new tables)

Two new Prisma migrations were added. They run automatically on the next `prisma migrate deploy` (which happens during the Vercel build).

### Migration 1: `20261001090000_tutor_lesson_state`
Adds the `TutorLessonState` table (Phase 95 — lesson controller state machine).

### Migration 2: `20261001100000_course_knowledge_chunk`
Adds the `CourseKnowledgeChunk` table (Phase 93 — semantic RAG chunks + embeddings).

### Applying migrations locally

```bash
# If you have a local PostgreSQL running:
npx prisma migrate deploy

# If you want to reset + reapply all migrations (DESTRUCTIVE — drops all data):
# npx prisma migrate reset

# Regenerate the Prisma client (picks up the new models):
npx prisma generate
```

### Verifying migrations applied

```bash
# Connect to your DB and check both tables exist:
psql $DATABASE_URL -c "\dt" | grep -E "TutorLessonState|CourseKnowledgeChunk"
# Expected: both tables listed
```

---

## Feature Flags (env vars)

All new features are behind feature flags so you can disable them instantly without redeploying.

| Env var | Default | What it controls |
|---|---|---|
| `TUTOR_LEARNER_STATE_ENABLED` | `true` | Phase 92 — learner-state block in system prompt |
| `TUTOR_RAG_ENABLED` | `true` | Phase 93 — semantic RAG retrieval |
| `TUTOR_LESSON_CONTROLLER_ENABLED` | `true` | Phase 95 — lesson controller state machine |

### Disabling a feature

```bash
# In your .env file (or Vercel env vars):
TUTOR_RAG_ENABLED=false  # instantly disables RAG without redeploy
```

When a feature is disabled, the AI tutor falls back to the previous phase's behavior (byte-identical system prompt).

---

## Manual Smoke Tests

After deploying, run these smoke tests against your live environment to verify each feature works end-to-end.

### Phase 91 — Context-builder extraction
**No visible change.** This was a pure refactor. Verify:
1. Open the AI Tutor chat
2. Send a message (e.g. "Hello")
3. Confirm the AI responds normally (same quality as before)

### Phase 92 — Learner-state injection
**Prerequisite:** The learner must have some quiz history (TopicMastery rows) or an active StudyRoomState.

1. Take a quiz on any topic (so `TopicMastery` rows exist)
2. Open the AI Tutor chat
3. Ask: "What should I review?"
4. **Expected:** The AI mentions one of your weak topics (the ones you scored low on)
5. Ask: "What am I good at?"
6. **Expected:** The AI mentions one of your strong topics

**For a brand-new user (no quiz history):**
1. Create a new account
2. Open the AI Tutor chat
3. Say "hi"
4. **Expected:** The AI greets you as a new learner and suggests a starting topic

### Phase 93 — Semantic RAG
**Prerequisite:** Upload a course outline first.

1. Go to AI Tutor → tap the 📎 upload button
2. Upload a PDF or DOCX (e.g. a Law syllabus, a Biology textbook chapter)
3. **Expected:** Response says "✓ Outline parsed and saved! Embedded N chunks for semantic search."
4. Ask a question about the uploaded material (e.g. "What is consideration in contract law?")
5. **Expected:** The AI's answer references the uploaded content, with a citation like `[1] (similarity 78%) — "LLB Course Outline"`

**Backfill existing uploads:**
```bash
# If you already had CourseKnowledge rows before Phase 93:
npx tsx scripts/phase93-backfill.ts
# Expected: "Found N rows; M need embedding." then "Done. Processed M rows."
```

### Phase 94 — KICD source citations
**Prerequisite:** A K-12 or secondary student (higher-ed skips curriculum context).

1. Log in as a K-12 student (e.g. Grade 4)
2. Open the AI Tutor chat
3. Ask: "What is photosynthesis?"
4. **Expected:** The AI's answer includes a Markdown link to `https://kicd.ac.ke/cbc-materials/grade-4/` (cited once, not repeated)

### Phase 95 — Lesson controller
**Prerequisite:** A lesson must be active. Lessons are created when the AI starts teaching a new topic.

1. Open the AI Tutor chat
2. Say: "Teach me about fractions"
3. **Expected:** The AI introduces the topic (stage: introduce)
4. After the AI explains, it should quiz you (stage: check)
5. Answer the quiz correctly
6. **Expected:** The lesson advances — the AI celebrates and suggests the next topic (stage: advance)
7. If you answer wrong, the lesson stays on "check" and the AI re-explains

**To verify the state machine:**
```sql
-- In your DB, check the TutorLessonState table:
SELECT "conversationId", "currentTopic", "currentStage", "stageUpdatedAt"
FROM "TutorLessonState";
-- Expected: one row per active lesson, with currentStage in ('introduce','explain','check','advance')
```

### Phase 96 — Legacy route deprecation
1. Send a POST request to `/api/tutor` (the legacy route):
```bash
curl -X POST https://your-app.vercel.app/api/tutor \
  -H "Content-Type: application/json" \
  -H "Cookie: your-auth-cookie" \
  -d '{"message": "Hello"}'
```
2. **Expected response headers:**
   - `Deprecation: true`
   - `Link: </api/tutor/chat>; rel="successor-version"`
   - `Sunset: Sat, 31 Jan 2026 00:00:00 GMT`
3. **Expected JSON body includes:** `"deprecationWarning": "This endpoint (/api/tutor) is deprecated..."`

---

## End-to-End Test Scenarios

### Scenario A: New K-12 student
1. Register as a Grade 4 student
2. Open AI Tutor → say "hi"
3. **Verify:** AI greets as new learner, suggests a starting topic (Phase 92)
4. Ask "What is photosynthesis?"
5. **Verify:** AI cites KICD Grade 4 curriculum design (Phase 94)
6. Take a quiz the AI generates
7. **Verify:** Lesson state advances in the DB (Phase 95)

### Scenario B: University Law student
1. Register as a university student, course: "Bachelor of Laws (LLB)"
2. Upload the LLB course outline (PDF)
3. **Verify:** Response says "Embedded N chunks" (Phase 93)
4. Ask "What is consideration in contract law?"
5. **Verify:** AI retrieves relevant chunks, cites them with similarity scores (Phase 93)
6. **Verify:** AI does NOT mention KCSE or Form 1 (Phase 88.1 fix)

### Scenario C: Returning student with quiz history
1. Log in as a student who has taken several quizzes
2. Open AI Tutor → ask "What should I review?"
3. **Verify:** AI mentions your weakest topics (Phase 92)
4. Ask "What am I good at?"
5. **Verify:** AI mentions your strongest topics (Phase 92)

---

## Troubleshooting

### "TF.js USE load failed — disabling RAG for this process"
This means TensorFlow.js couldn't load the Universal Sentence Encoder model. RAG is disabled for that process. Causes:
- First load downloads ~25MB (slow connection)
- Memory pressure on the serverless function
- **Fix:** RAG will retry on the next cold start. No action needed — the tutor still works via the Phase 84 fallback.

### "lesson-state fetch failed"
The lesson controller DB query failed. The lesson block is omitted. Causes:
- `TutorLessonState` table doesn't exist (migration didn't run)
- **Fix:** Run `npx prisma migrate deploy` to apply the migration.

### "RAG retrieval failed"
The RAG fetch threw an error. Causes:
- `CourseKnowledgeChunk` table doesn't exist
- TF.js model not loaded
- **Fix:** Check that migrations ran + the feature flag is on.

### Tests fail with "Cannot find package 'vite'"
```bash
npm install vite --no-save
```

---

## Test Counts Summary

| Phase | New tests | Cumulative |
|---|---|---|
| Phase 91 (context-builder) | 22 | 22 |
| Phase 92 (learner-state) | 29 + 8 integration | 59 |
| Phase 93 (semantic RAG) | 15 + 10 integration | 84 |
| Phase 94 (KICD citations) | 16 | 100 |
| Phase 95 (lesson controller) | 27 + 8 integration | 135 |
| Existing (tutor-intents + rag-engine) | 35 | 170 |

**Total: 170 tests passing, 0 regressions.**
