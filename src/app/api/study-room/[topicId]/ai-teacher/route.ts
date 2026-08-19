import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";
import { callAI, type ChatMessage } from "@/lib/ai";
import { checkAndDeductTokens, refundTokens } from "@/lib/monetization";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/study-room/[topicId]/ai-teacher
 * Body: { message, history? }
 *
 * AI teacher responds in-character (name + style + avatar from study_room_state).
 * Knows: topic, user's path progress, today's review results.
 *
 * Costs 'ai_teacher' tokens (50 by default). Free users: 10 messages/day.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ topicId: string }> }
) {
  const user = await getCurrentUser();
  const { topicId } = await params;
  const body = await req.json().catch(() => ({})) as {
    message?: string;
    history?: { role: string; content: string }[];
  };

  const message = (body.message ?? "").toString().trim();
  if (!message) {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }
  if (message.length > 1000) {
    return NextResponse.json({ error: "Message too long (max 1000 chars)" }, { status: 400 });
  }

  // Load room state + topic
  const [room, topic] = await Promise.all([
    db.studyRoomState.findUnique({
      where: { userId_topicId: { userId: user.id, topicId } },
    }).catch(() => null),
    db.topic.findUnique({
      where: { id: topicId },
      select: { id: true, name: true, subject: true, description: true },
    }).catch(() => null),
  ]);
  if (!topic) {
    return NextResponse.json({ error: "Topic not found." }, { status: 404 });
  }

  const teacherName = room?.aiTeacherName ?? "Professor Bloom";
  const teacherStyle = room?.aiTeacherStyle ?? "encouraging";
  const teacherAvatar = room?.aiTeacherAvatar ?? "🧙‍♂️";

  // Build persona prompt based on style
  const styleGuide: Record<string, string> = {
    encouraging: "Be warm, encouraging, and celebrate small wins. Use phrases like 'Great question!' and 'You're making progress'.",
    strict: "Be precise, demanding, and academically rigorous. Push the student to be thorough.",
    fun: "Use humor, jokes, and pop-culture references. Make learning feel like a game.",
    academic: "Be formal and scholarly. Use proper academic terminology and cite concepts.",
  };

  // Get user's progress + today's review
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [todayReview, userProgress] = await Promise.all([
    db.dailyReview.findUnique({
      where: { userId_date: { userId: user.id, date: today } },
      select: { status: true, score: true },
    }).catch(() => null),
    db.userPathProgress.findMany({
      where: { userId: user.id, pathItem: { module: { path: { topicId } } } },
      select: { status: true, score: true },
    }).catch(() => []),
  ]);

  const completedCount = userProgress.filter((p) => p.status === "completed").length;

  // Deduct tokens
  const deduct = await checkAndDeductTokens(user.id, "ai_teacher");
  if (!deduct.ok) {
    if (deduct.code === "DAILY_LIMIT" || deduct.code === "INSUFFICIENT_TOKENS" || deduct.code === "MODEL_LOCKED") {
      return NextResponse.json(
        { error: deduct.error, code: deduct.code, tokenBalance: user.tokenBalance, needsUpgrade: true },
        { status: 402 }
      );
    }
    return NextResponse.json(
      { error: "Couldn't start AI teacher chat. Please try again.", code: deduct.code, detail: deduct.error },
      { status: 500 }
    );
  }

  // Build messages
  const userRec = await db.user.findUnique({
    where: { id: user.id },
    select: { encryptedApiKey: true },
  }).catch(() => null);
  const apiKey = userRec?.encryptedApiKey ? decryptApiKey(userRec.encryptedApiKey) : null;

  const systemPrompt =
    `You are ${teacherName}, an AI teacher helping a student learn ${topic.name} (${topic.subject}).\n` +
    `Teaching style: ${styleGuide[teacherStyle] ?? styleGuide.encouraging}\n` +
    `Context:\n` +
    `- Student has completed ${completedCount} path items so far\n` +
    `- Today's review: ${todayReview?.status === "completed" ? `completed (score: ${Math.round((todayReview.score ?? 0) * 100)}%)` : "not yet started"}\n` +
    `- Topic description: ${topic.description ?? "general study"}\n\n` +
    `Rules:\n- Always stay in character as ${teacherName}.\n- Keep responses under 200 words.\n- Use the student's name when relevant.\n- If they ask off-topic, gently steer back to ${topic.name}.\n- Encourage them to keep going.`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...(Array.isArray(body.history) ? body.history.slice(-10).map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content ?? ""),
    }) as ChatMessage) : []),
    { role: "user", content: message },
  ];

  try {
    const reply = await callAI(messages, apiKey, {
      userId: user.id,
      route: "/api/study-room/ai-teacher",
    });

    return NextResponse.json({
      reply,
      teacherName,
      teacherAvatar,
      teacherStyle,
      tokenBalance: deduct.newBalance,
      costTokens: deduct.costTokens,
    });
  } catch (e: any) {
    await refundTokens(user.id, "ai_teacher", deduct.costTokens);
    return NextResponse.json(
      { error: `${teacherName} couldn't respond right now. Please try again.`, detail: e?.message, tokenBalance: user.tokenBalance },
      { status: 500 }
    );
  }
}

/** PUT /api/study-room/[topicId]/ai-teacher — update AI teacher persona (premium) */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ topicId: string }> }
) {
  const user = await getCurrentUser();
  const { topicId } = await params;
  const body = await req.json().catch(() => ({})) as {
    aiTeacherName?: string;
    aiTeacherAvatar?: string;
    aiTeacherStyle?: string;
  };

  // Premium check
  const isPremium = Boolean(user.planId && (!user.subscriptionExpiry || new Date() < user.subscriptionExpiry));
  if (!isPremium) {
    return NextResponse.json(
      { error: "Customizing your AI teacher requires a premium plan. Upgrade to personalize your teacher's name, avatar, and style.", needsUpgrade: true, code: "PREMIUM_REQUIRED" },
      { status: 402 }
    );
  }

  const data: any = {};
  if (typeof body.aiTeacherName === "string" && body.aiTeacherName.trim()) {
    data.aiTeacherName = body.aiTeacherName.trim().slice(0, 50);
  }
  if (typeof body.aiTeacherAvatar === "string" && body.aiTeacherAvatar.trim()) {
    data.aiTeacherAvatar = body.aiTeacherAvatar.trim().slice(0, 10);
  }
  if (typeof body.aiTeacherStyle === "string" && ["encouraging", "strict", "fun", "academic"].includes(body.aiTeacherStyle)) {
    data.aiTeacherStyle = body.aiTeacherStyle;
  }

  const updated = await db.studyRoomState.upsert({
    where: { userId_topicId: { userId: user.id, topicId } },
    create: { userId: user.id, topicId, ...data },
    update: data,
  });

  return NextResponse.json({ room: updated });
}
