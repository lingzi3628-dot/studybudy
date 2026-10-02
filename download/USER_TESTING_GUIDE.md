# StudyBuddy — Complete User Testing Guide

This guide covers every feature shipped in this session. Follow the steps in order to test each one as a real user would.

---

## Step 0: Set Up Feature Flags (Vercel Environment Variables)

Go to your Vercel project → Settings → Environment Variables. Add these:

| Variable | Value | What it enables |
|---|---|---|
| `NEXT_PUBLIC_NEW_DASHBOARD` | `true` | New clean dashboards (all tracks) |
| `NEXT_PUBLIC_TUTOR_WORKSPACE` | `true` | AI Tutor workspace panel + auto-open + labs |
| `NEXT_PUBLIC_FLOWCHART_RENDERER_ENABLED` | `true` | Client can render flowchart_v1 attachments |
| `TUTOR_FLOWCHART_GENERATION_ENABLED` | `true` | AI prompt includes flowchart_v1 instructions |

**Important:** Redeploy after adding these (push any commit or click "Redeploy" in Vercel).

If you want to test WITHOUT the new features, set all to `false` or remove them — old behavior is 100% preserved.

---

## Part 1: New Dashboards

### Test 1: K-12 Student Dashboard

1. **Log in as a K-12 student** (track=k12, grade=Grade 4 or 5)
2. **Verify the new dashboard appears** (not the old PathDashboard):
   - Greeting with your name + "Grade 4 · CBC"
   - Streak badge (if streak > 0)
   - "Continue Learning" card (shows your last studied topic, or "Choose a subject" if new)
   - Subject chips (Mathematics, English, Kiswahili, Science, etc.)
   - "Practice and progress" card (shows cards due + topics to review)
   - "Your study materials" (max 3 study sets)

3. **Test interactions:**
   - Click "Continue with AI tutor" → navigates to tutor
   - Click a subject chip → navigates to curriculum subject view
   - Click "Start review" → navigates to flashcards
   - Click "View progress" → navigates to progress screen
   - Click a study set → navigates to flashcards with that set

4. **Test new user:**
   - Create a brand new account (K-12, Grade 1)
   - Dashboard should show "Choose a subject" (not a fake recommendation)
   - Should show "Get started" nudge card

5. **Test error state:**
   - Turn off internet → refresh → should show "Couldn't load your dashboard" with Retry button (not "0% progress")

### Test 2: University Student Dashboard

1. **Log in as a university student** (track=university, course="Bachelor of Laws (LLB)")
2. **Verify the new dashboard:**
   - Greeting + course name
   - Subject chips for the course (Constitutional Law, Criminal Law, etc.)
   - Practice and progress card
   - Recent projects (if any)

3. **Test interactions:**
   - Click "Continue with AI tutor" → tutor opens
   - Click a subject chip → tutor opens (ready to ask about that subject)

### Test 3: Dev Track Dashboard

1. **Log in as a dev track student** (track=dev)
2. **Verify:**
   - "💻 Coding" badge
   - "Start a project" instead of "Choose a subject" (different empty state)
   - Recent projects list
   - "Create project" button in nudge card

---

## Part 2: AI Tutor Workspace

### Test 4: Workspace Panel Opens

**Prerequisite:** `NEXT_PUBLIC_TUTOR_WORKSPACE=true`

1. **Open AI Tutor**
2. **Ask:** "Draw a bar graph showing test scores: Alice 85, Bob 92, Charlie 78, Diana 88"
3. **Watch what happens:**
   - AI replies with text + a compact notification card in the chat: "📊 Graph ready — [Open ↗]"
   - After ~2 seconds, the workspace panel **auto-opens** on the right side
   - The graph renders in the workspace panel (not inline in chat)
   - Chat messages scroll properly on the left (with scrollbar)

4. **Test the workspace header:**
   - "Ask AI" button → fills input with bounded context
   - "Save" button → saves artifact as a Project
   - "X" button → closes workspace

5. **Test closing:**
   - Click X → workspace closes, chat takes full width again
   - Click "Open" on the notification card → workspace re-opens

6. **Test persistence:**
   - Open workspace → navigate to Profile → come back to tutor → workspace should still be open (localStorage)

### Test 5: Graph Lab (Interactive Bar Graph)

1. **Ask:** "Draw a bar graph of books read: Alice 4, Bob 6, Charlie 3, Diana 5"
2. **When workspace opens, verify 3 tabs:**

   **Explore tab:**
   - Graph renders with bars
   - Tap a bar → shows "Selected: Bob: 6"
   - Text summary: "The highest value is Bob at 6. The lowest is Charlie at 3. The total is 18."
   - "Explain graph" button → fills input with bounded context
   - "Ask me a question" button → fills input
   - "Explain selected" button (only when a bar is selected)

   **Edit Data tab:**
   - Table with Category + Value columns
   - Change a value → graph preview updates live
   - Add row → new row appears
   - Remove row → row disappears
   - "Reset to original" → restores original data
   - "Apply changes" → updates the workspace artifact

   **Questions tab:**
   - Q1: "Which category has the highest value?" → type "Bob" → Check → "Correct!"
   - Q1 wrong: type "Charlie" → "Not quite. The correct answer is Bob."
   - Q2: "What is the total?" → type "18" → Check → "Correct!"
   - Q3: "Difference between highest and lowest?" → type "3" → Check → "Correct!"
   - Practice disclaimer at bottom

### Test 6: Quiz Lab

1. **Ask:** "Quiz me on photosynthesis with 3 questions"
2. **When workspace opens, verify 3 tabs:**

   **Answer tab:**
   - 3 MCQ questions with A/B/C/D options
   - Submit disabled until all answered
   - Select answers → Submit enabled → click "Submit Answers"

   **Review tab:**
   - Score: "3/3" or "2/3" etc.
   - Per-question: green for correct, red for wrong
   - Explanation boxes (blue)
   - "Ask tutor about this question" button per question
   - "Retry wrong answers" button (if any wrong)

   **Retry tab:**
   - Shows ONLY the questions you got wrong
   - Re-answer → "Check retry answers"
   - Score updates: original correct + retry correct = total

### Test 7: Drawing Studio

1. **Ask:** "Draw a triangle and label its sides" (or any geometry request)
2. **When the AI emits a draw_task, verify:**
   - Compact card in chat: "✏️ Drawing Task ready"
   - Workspace opens with Drawing Studio
   - 3 tabs: Draw / Review / Redo

   **Draw tab:**
   - Canvas (touch + mouse)
   - 6 colors, 3 brush sizes
   - Clear button
   - Hint button (if AI provided a hint)
   - "Submit Drawing for Review" button

   **Review tab (after submit):**
   - Shows submitted drawing as image
   - "Drawing submitted! Check the chat for feedback."
   - Expected keywords checklist
   - "Ask for feedback" / "Show correct drawing" buttons
   - "Start Over" button

   **Redo tab:**
   - Fresh canvas with same task

### Test 8: Fraction Manipulative

1. **Ask:** "Help me practice dividing 12 mangoes into 3 equal baskets"
2. **Verify:**
   - Tap mangoes 🥭 to pick them up
   - Tap baskets 🧺 to drop them
   - "Check Answer" button → verifies 4 per basket
   - Correct: "🎉 Correct! 12 ÷ 3 = 4"
   - Wrong: shows current distribution + hints

### Test 9: Code Preview Panel

1. **Ask:** "Create a simple webpage about visiting Kenya with a heading and paragraph"
2. **Verify:**
   - Compact card: "💻 Code Project ready"
   - Workspace opens with Code Preview Panel
   - Preview/Code tabs
   - Live preview renders in sandboxed iframe
   - Code view shows source with file tabs
   - Console output (if any console.log in the code)
   - Refresh button

### Test 10: Circuit Simulation

1. **Ask:** "Show me a simple circuit with a battery, switch, and lamp"
2. **Verify:**
   - Battery 🔋, switch, lamp 💡 icons
   - Tap switch to toggle open/closed
   - When switch closed: lamp glows, current flows
   - Live readings: current (A), resistance (Ω), power (W)
   - "Check Circuit" button → verifies success condition
   - Safety notice at bottom

---

## Part 3: Flowchart Pilot

**Prerequisite:** Both `TUTOR_FLOWCHART_GENERATION_ENABLED=true` AND `NEXT_PUBLIC_FLOWCHART_RENDERER_ENABLED=true`

### Test 11: Flowchart Generation

1. **Ask:** "Draw a flowchart showing how rain forms: water heats up, vapour rises, clouds form, rain falls"
2. **Verify:**
   - AI emits a flowchart_v1 spec (NOT a scene with coordinates)
   - Compact card: "🔀 Flowchart ready"
   - Workspace opens with flowchart
   - Nodes are positioned in layers (top to bottom)
   - Arrows point downward between nodes
   - Each node has a label
   - No coordinates visible to the user

3. **Test the workspace:**
   - Activity objective at top
   - Text summary at bottom
   - "Explain flowchart" button → fills input with bounded context

4. **Verify NO coordinates in the AI's response:**
   - Check the chat — the AI should describe the flowchart in text
   - The actual JSON should have nodes with id/label/shape, NOT x/y coordinates

### Test 12: Flowchart with Branches

1. **Ask:** "Draw a flowchart: Start → (branches to A and B) → both go to End"
2. **Verify:**
   - Two nodes appear side by side in the same layer
   - Both connect to End below
   - No overlap between nodes

### Test 13: Flowchart Error Handling

1. **Turn off `NEXT_PUBLIC_FLOWCHART_RENDERER_ENABLED`** (keep generation on)
2. **Ask for a flowchart**
3. **Verify:** Chat shows "🔀 Flowchart attachment (renderer not enabled)" — no crash

4. **Turn rendering back on, turn off generation**
5. **Ask for a flowchart**
6. **Verify:** AI uses old scene/drawing behavior (no flowchart_v1 in response)

---

## Part 4: "Teach on My Work" Feature

### Test 14: Ask AI About Workspace Content

1. **Open any activity in the workspace** (graph, quiz, drawing, flowchart)
2. **Click "Ask AI" in the workspace header** (desktop)
3. **Verify:**
   - Input fills with context: `[Looking at the graph in my workspace: {spec data}]`
   - Type a question after it: "Why does Bob have the highest value?"
   - Send → AI responds with awareness of the workspace content

4. **Mobile test:**
   - Open workspace (full screen on mobile)
   - Click "Ask AI about this" in the top bar
   - Workspace closes, input has context pre-filled
   - Type question and send

---

## Part 5: Chat Cleanliness

### Test 15: No Duplicate API Calls

1. **Open browser DevTools → Network tab**
2. **Open AI Tutor** (dashboard loads)
3. **Count `/api/auth/me` calls:**
   - Should be 2 (page.tsx auth check + BottomNav family check)
   - NOT 4-5 like before (eliminated duplicates from HigherEdHome, TrackHome, TopBar)

4. **Count `/api/progress` calls:**
   - Should be 1 (from TopBar, shared with Home)
   - NOT 2 like before (eliminated /api/user/xp duplicate)

### Test 16: No TopicCardsBar

1. **Open AI Tutor**
2. **Verify:** No animated project cards sliding across the top
3. **Verify:** Chat messages start at the top of the screen (more space)

### Test 17: Clean Chat with Workspace

1. **With workspace enabled, ask AI to draw a graph**
2. **Verify chat shows:** AI text + small notification card (not the full graph)
3. **Verify workspace shows:** The full interactive graph
4. **Chat should be clean** — only text and small cards flow through it

---

## Part 6: Rollback Test

### Test 18: Disable All Features

1. **Set ALL feature flags to `false`** (or remove them)
2. **Redeploy**
3. **Verify:**
   - Old PathDashboard renders (not NewHome)
   - Old HigherEdHome renders (not NewHigherEdHome)
   - Old TrackHome renders (not NewTrackHome)
   - AI Tutor shows inline attachments (not workspace panel)
   - No flowchart rendering
   - No compact cards
   - No TopicCardsBar (this was removed unconditionally — it's the only permanent change)

4. **All existing conversations should still work** — no data loss

---

## Quick Checklist

| # | Test | Feature Flag | Pass? |
|---|---|---|---|
| 1 | K-12 dashboard renders | NEW_DASHBOARD | ☐ |
| 2 | University dashboard renders | NEW_DASHBOARD | ☐ |
| 3 | Dev track dashboard renders | NEW_DASHBOARD | ☐ |
| 4 | Workspace panel opens + auto-opens | TUTOR_WORKSPACE | ☐ |
| 5 | Graph Lab (3 tabs) works | TUTOR_WORKSPACE | ☐ |
| 6 | Quiz Lab (answer/review/retry) works | TUTOR_WORKSPACE | ☐ |
| 7 | Drawing Studio (draw/review/redo) works | TUTOR_WORKSPACE | ☐ |
| 8 | Fraction manipulative works | TUTOR_WORKSPACE | ☐ |
| 9 | Code preview panel works | TUTOR_WORKSPACE | ☐ |
| 10 | Circuit simulation works | TUTOR_WORKSPACE | ☐ |
| 11 | Flowchart renders deterministically | BOTH FLOWCHART flags | ☐ |
| 12 | Flowchart with branches | BOTH FLOWCHART flags | ☐ |
| 13 | Flowchart error handling (flag off) | ONE flag off | ☐ |
| 14 | "Ask AI" sends bounded context | TUTOR_WORKSPACE | ☐ |
| 15 | No duplicate API calls | (always) | ☐ |
| 16 | No TopicCardsBar | (always) | ☐ |
| 17 | Clean chat (compact cards) | TUTOR_WORKSPACE | ☐ |
| 18 | Rollback works (all flags off) | (all off) | ☐ |

---

## Troubleshooting

**Workspace doesn't open?**
- Check `NEXT_PUBLIC_TUTOR_WORKSPACE=true` in Vercel env vars
- Hard refresh (Ctrl+Shift+R) after deploying

**Flowchart shows "renderer not enabled"?**
- Check `NEXT_PUBLIC_FLOWCHART_RENDERER_ENABLED=true` (client-side)
- This is separate from the generation flag

**AI doesn't generate flowcharts?**
- Check `TUTOR_FLOWCHART_GENERATION_ENABLED=true` (server-side, NOT public)
- This must be set on the server — it's not a NEXT_PUBLIC variable

**Old dashboard still showing?**
- Check `NEXT_PUBLIC_NEW_DASHBOARD=true`
- Hard refresh after deploy (env vars are baked into the client build)

**Graph validation error still showing?**
- This was fixed in Phase G2 — the AI's `labels`/`data` fields are now auto-corrected to `categories`/`values`
- If you still see it, the fix may not be deployed yet

**Tests failing locally?**
- Run: `npx vitest run src/lib/tutor/__tests__/ src/components/studybuddy/screens/__tests__/ src/components/studybuddy/screens/tutor/__tests__/ src/lib/tutor-intents.test.ts src/lib/rag-engine.test.ts src/lib/flowchart.test.ts`
- Expected: 250/250 passing
