import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { callAI, type ChatMessage } from "@/lib/ai";

export const runtime = "nodejs";

/**
 * POST /api/curriculum/chatbot-path
 *
 * A chatbot that interviews the student about their goals + availability,
 * then generates a personalized multi-month learning path for a subject.
 *
 * Two modes:
 *
 * 1. INTERVIEW mode (no `answers` in body):
 *    The chatbot asks the student a series of questions:
 *      - "How much time can you spend per day?"
 *      - "What's your goal with this subject?"
 *      - "How confident are you with this subject?"
 *      - "Do you prefer quick sessions or deep dives?"
 *    Returns the next question to ask.
 *
 * 2. PLAN mode (body contains `answers: { time, goal, confidence, style }`):
 *    The chatbot generates a structured learning path with:
 *      - Total duration (e.g. 5 months for Grade 1, 6 months for Form 1)
 *      - Milestones per month
 *      - Recommended topics per milestone
 *    Returns the plan as JSON.
 *
 * Auth required. Uses the user's tokens (or parent's for family children).
 */
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await getCurrentUser();
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Authentication required" },
      { status: (e as any)?.status ?? 401 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const subjectId = (body?.subjectId ?? "").toString().trim();
  const answers = body?.answers; // if present, generate the plan; if absent, ask questions

  if (!subjectId) {
    return NextResponse.json({ error: "subjectId is required" }, { status: 400 });
  }

  // Load the subject + its topics + the user's grade
  const subject = await db.curriculumSubject.findUnique({
    where: { id: subjectId },
    include: {
      grade: { select: { name: true } },
      topics: {
        orderBy: { orderIndex: "asc" },
        select: { id: true, name: true, summary: true, orderIndex: true, estimatedMin: true },
      },
    },
  });

  if (!subject) {
    return NextResponse.json({ error: "Subject not found" }, { status: 404 });
  }

  // -----------------------------------------------------------------
  // MODE 1: INTERVIEW — ask questions
  // -----------------------------------------------------------------
  if (!answers) {
    return NextResponse.json({
      mode: "interview",
      questions: [
        {
          key: "time",
          question: `How much time can you spend studying ${subject.name} each day?`,
          options: ["15 minutes", "30 minutes", "1 hour", "2+ hours"],
        },
        {
          key: "goal",
          question: `What's your main goal with ${subject.name}?`,
          options: [
            "Pass my exams",
            "Understand the basics",
            "Become an expert",
            "Just for fun",
          ],
        },
        {
          key: "confidence",
          question: `How confident do you feel with ${subject.name} right now?`,
          options: ["Not at all", "A little", "Pretty confident", "Very confident"],
        },
        {
          key: "style",
          question: "How do you prefer to learn?",
          options: ["Quick daily sessions", "Long deep dives", "Mix of both"],
        },
      ],
    });
  }

  // -----------------------------------------------------------------
  // MODE 2: PLAN — generate the learning path via AI
  // -----------------------------------------------------------------
  const { time = "30 minutes", goal = "Pass my exams", confidence = "A little", style = "Quick daily sessions" } = answers;

  // Determine base duration by grade (months)
  const gradeName = subject.grade.name;
  let baseMonths = 5; // default
  if (/Grade 1|Grade 2|Grade 3/i.test(gradeName)) baseMonths = 4;
  else if (/Grade 4|Grade 5|Grade 6/i.test(gradeName)) baseMonths = 5;
  else if (/Form 1|Form 2/i.test(gradeName)) baseMonths = 6;
  else if (/Form 3|Form 4/i.test(gradeName)) baseMonths = 7;

  // Adjust based on time commitment
  if (/15 minutes/i.test(time)) baseMonths += 1;
  if (/2\+ hours/i.test(time)) baseMonths -= 1;

  // Adjust based on confidence
  if (/Very confident/i.test(confidence)) baseMonths -= 1;
  if (/Not at all/i.test(confidence)) baseMonths += 1;

  baseMonths = Math.max(2, Math.min(12, baseMonths)); // clamp 2-12

  // Build the topic list for the AI
  const topicList = subject.topics.length > 0
    ? subject.topics.map((t, i) => `${i + 1}. ${t.name}${t.summary ? ` — ${t.summary}` : ""}`).join("\n")
    : "(no topics uploaded yet — the AI will suggest generic topics)";

  // AI prompt to generate the plan
  const systemPrompt = `You are a curriculum planner. Generate a personalized learning path as JSON.

The student is in ${gradeName} studying ${subject.name}.
- Daily time available: ${time}
- Goal: ${goal}
- Current confidence: ${confidence}
- Preferred learning style: ${style}
- Total duration: ${baseMonths} months

Available topics in the curriculum:
${topicList}

Generate a ${baseMonths}-month learning path. Split the topics across the months.
Each month should have:
- A milestone name (e.g. "Month 1: Foundations")
- 2-5 topics to focus on (use the actual topic names from the list above)
- A short goal for the month

Return ONLY valid JSON (no markdown fences, no commentary):
{
  "totalMonths": ${baseMonths},
  "summary": "1-2 sentence overview of the plan",
  "months": [
    {
      "month": 1,
      "title": "Month 1: Foundations",
      "goal": "Short goal for this month",
      "topics": ["Topic Name 1", "Topic Name 2"]
    }
  ]
}`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `Generate the ${baseMonths}-month learning path.` },
  ];

  try {
    const reply = await callAI(messages, null, {
      userId: user.id,
      route: "/api/curriculum/chatbot-path",
    });

    // Parse the AI's JSON response
    let cleaned = reply.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    }
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1) {
      throw new Error("AI did not return valid JSON");
    }
    const jsonStr = cleaned.slice(firstBrace, lastBrace + 1);
    const plan = JSON.parse(jsonStr);

    // Validate + return
    if (!plan.months || !Array.isArray(plan.months)) {
      throw new Error("AI response missing months array");
    }

    return NextResponse.json({
      mode: "plan",
      plan: {
        ...plan,
        subjectName: subject.name,
        gradeName,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (e: any) {
    // Fallback: generate a simple plan without AI (distribute topics evenly)
    const months: Array<{ month: number; title: string; goal: string; topics: string[] }> = [];
    const topicsPerMonth = Math.max(1, Math.ceil(subject.topics.length / baseMonths));
    for (let m = 1; m <= baseMonths; m++) {
      const start = (m - 1) * topicsPerMonth;
      const end = start + topicsPerMonth;
      const monthTopics = subject.topics.slice(start, end).map((t) => t.name);
      months.push({
        month: m,
        title: `Month ${m}${monthTopics.length > 0 ? `: ${monthTopics[0]}` : ""}`,
        goal: m === 1 ? "Build foundations" : m === baseMonths ? "Master and review" : "Continue building",
        topics: monthTopics.length > 0 ? monthTopics : ["Review and practice"],
      });
    }

    return NextResponse.json({
      mode: "plan",
      plan: {
        totalMonths: baseMonths,
        summary: `A ${baseMonths}-month plan for ${subject.name} (${gradeName}). Study ${time} per day with a focus on ${goal.toLowerCase()}.`,
        months,
        subjectName: subject.name,
        gradeName,
        generatedAt: new Date().toISOString(),
        fallback: true,
      },
      aiError: e?.message,
    });
  }
}
