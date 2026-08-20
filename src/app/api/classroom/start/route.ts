import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { callAIJson, type ChatMessage } from "@/lib/ai";
import { checkAndDeductTokens, refundTokens } from "@/lib/monetization";
import { recordActivity } from "@/lib/gamify";

export const runtime = "nodejs";
export const maxDuration = 60;

const FLOW_STATES = ["ASSESSMENT", "LEARNING", "PRACTICE", "QUIZ", "REVIEW", "MASTERED"] as const;

/**
 * POST /api/classroom/start
 * Body: { topicId }
 *
 * Combined Phase 14 + Phase 16:
 * - Deducts tokens (Phase 14: 50 tokens, free 1/day)
 * - Creates/resumes a ClassroomSession with guided flow state (Phase 16)
 * - Generates whiteboard lesson content via AI (Phase 14)
 * - Returns lessonBlocks + flowState + session
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({})) as { topicId?: string };
  const topicId = (body.topicId ?? "").toString().trim();
  if (!topicId) {
    return NextResponse.json({ error: "topicId is required." }, { status: 400 });
  }

  // Verify topic
  const topic = await db.topic.findUnique({
    where: { id: topicId },
    select: { id: true, name: true, subject: true, description: true },
  }).catch(() => null);
  if (!topic) {
    return NextResponse.json({ error: "Topic not found." }, { status: 404 });
  }

  // Load classroom settings
  let settings: any = await db.classroomSettings.findFirst().catch(() => null);
  if (!settings) settings = { durationMinutes: 30, testIntervalMin: 10, tokenCost: 50, passThreshold: 0.7, coinReward: 10, xpReward: 20, dailyLimit: 1 };

  // Check for an existing NON-completed, NON-mastered session to resume
  let session = await db.classroomSession.findFirst({
    where: {
      userId: user.id,
      topicId: topic.id,
      status: "active",
      flowState: { not: "MASTERED" },
    },
    orderBy: { lastActivity: "desc" },
  }).catch(() => null);

  // If found, resume it (no token charge for resume)
  if (session) {
    session = await db.classroomSession.update({
      where: { id: session.id },
      data: { lastActivity: new Date() },
    });
    // Update room state
    await db.studyRoomState.upsert({
      where: { userId_topicId: { userId: user.id, topicId: topic.id } },
      create: { userId: user.id, topicId: topic.id, currentClassroomSessionId: session.id, lastVisited: new Date() },
      update: { currentClassroomSessionId: session.id, lastVisited: new Date() },
    }).catch(() => {});

    // Fetch lesson content (from cache or generate)
    const lessonBlocks = await getOrGenerateLesson(user.id, topic);

    return NextResponse.json({
      session,
      flowState: session.flowState,
      currentStep: session.currentStep,
      progress: session.progress,
      lessonBlocks,
      durationMinutes: settings.durationMinutes,
      testIntervalMin: settings.testIntervalMin,
      resumed: true,
    });
  }

  // No active session — create new one. Deduct tokens first.
  const deduct = await checkAndDeductTokens(user.id, "classroom");
  if (!deduct.ok) {
    if (deduct.code === "DAILY_LIMIT" || deduct.code === "INSUFFICIENT_TOKENS" || deduct.code === "MODEL_LOCKED" || deduct.code === "MODEL_RESTING") {
      return NextResponse.json(
        { error: deduct.error, code: deduct.code, tokenBalance: user.tokenBalance, needsUpgrade: true },
        { status: 402 }
      );
    }
    return NextResponse.json(
      { error: "We couldn't start the class right now. Please try again.", code: deduct.code, detail: deduct.error },
      { status: 500 }
    );
  }

  // Check UserTopicFlow for starting state (from intake diagnostic)
  const flow = await db.userTopicFlow.findUnique({
    where: { userId_topicId: { userId: user.id, topicId: topic.id } },
    select: { currentState: true, progress: true },
  }).catch(() => null);

  const startState = flow?.currentState ?? "ASSESSMENT";
  const startProgress = flow?.progress ?? 0;

  // Create new ClassroomSession
  session = await db.classroomSession.create({
    data: {
      userId: user.id,
      topicId: topic.id,
      flowState: startState,
      currentStep: 0,
      totalSteps: FLOW_STATES.length,
      progress: startProgress,
      status: "active",
      lastActivity: new Date(),
    },
  });

  // Update UserTopicFlow
  await db.userTopicFlow.upsert({
    where: { userId_topicId: { userId: user.id, topicId: topic.id } },
    create: { userId: user.id, topicId: topic.id, currentState: startState, progress: startProgress, lastActivity: new Date() },
    update: { currentState: startState, progress: startProgress, lastActivity: new Date() },
  }).catch(() => {});

  // Update room state
  await db.studyRoomState.upsert({
    where: { userId_topicId: { userId: user.id, topicId: topic.id } },
    create: { userId: user.id, topicId: topic.id, currentClassroomSessionId: session.id, lastVisited: new Date() },
    update: { currentClassroomSessionId: session.id, lastVisited: new Date() },
  }).catch(() => {});

  await recordActivity(user.id, 0).catch(() => {});

  // Generate lesson content
  const lessonBlocks = await getOrGenerateLesson(user.id, topic);

  return NextResponse.json({
    session,
    flowState: session.flowState,
    currentStep: session.currentStep,
    progress: session.progress,
    lessonBlocks,
    durationMinutes: settings.durationMinutes,
    testIntervalMin: settings.testIntervalMin,
    resumed: false,
    tokenBalance: deduct.newBalance,
    costTokens: deduct.costTokens,
  });
}

/** Generate or fetch cached whiteboard lesson for a topic */
async function getOrGenerateLesson(userId: string, topic: any): Promise<any[]> {
  // Check cache first
  const cached = await db.lessonContent.findFirst({
    where: { topicId: topic.id },
    orderBy: { createdAt: "desc" },
  }).catch(() => null);

  if (cached && Array.isArray(cached.contentJson) && (cached.contentJson as any[]).length > 0) {
    return cached.contentJson as any[];
  }

  // Generate via AI
  const userRec = await db.user.findUnique({
    where: { id: userId },
    select: { encryptedApiKey: true },
  }).catch(() => null);
  const apiKey = userRec?.encryptedApiKey ? decryptApiKey(userRec.encryptedApiKey) : null;

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        `You are Professor Bloom teaching ${topic.name} (${topic.subject}). ` +
        "Generate whiteboard content as a JSON array of blocks. Each block has a 'type' and 'content'. " +
        "Types: 'heading', 'text', 'equation', 'bullet'. " +
        "Generate 15-20 blocks covering the key concepts. Include 1-2 equations if applicable. " +
        "Return ONLY the JSON array, no other text.",
    },
    { role: "user", content: `Topic: ${topic.name}\nSubject: ${topic.subject}\nDescription: ${topic.description ?? "general"}` },
  ];

  try {
    const raw = await callAIJson<any[]>(messages, apiKey, { userId, route: "/api/classroom/start" });
    if (Array.isArray(raw) && raw.length > 0) {
      // Cache
      await db.lessonContent.create({
        data: { topicId: topic.id, contentJson: raw as any },
      }).catch(() => {});
      return raw;
    }
  } catch (e: any) {
    console.error("lesson generation failed:", e?.message);
  }

  // Fallback default lesson
  const fallback = [
    { type: "heading", content: `Welcome to ${topic.name}` },
    { type: "text", content: `Today we'll explore ${topic.name} in ${topic.subject}. This is a foundational topic that builds the groundwork for further study.` },
    { type: "heading", content: "Key Concepts" },
    { type: "bullet", content: `Definition and importance of ${topic.name}` },
    { type: "bullet", content: "Core principles and terminology" },
    { type: "bullet", content: "Common applications and examples" },
    { type: "text", content: "Let's dive into each of these areas step by step." },
    { type: "heading", content: "Summary" },
    { type: "text", content: `In this lesson, we've covered the fundamentals of ${topic.name}. Take the mini-test to check your understanding!` },
  ];
  return fallback;
}
