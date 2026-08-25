import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminJwt as requireAdmin } from "@/lib/admin-session";
import { callAI, type ChatMessage } from "@/lib/ai";

export const runtime = "nodejs";

/**
 * POST /api/admin/curriculum/ground-test
 *
 * Admin-only. Tests what a specific StudyBuddy replies to a given question.
 * Body: { modelName: string, question: string }
 *
 * This lets the admin verify a StudyBuddy's responses before activating
 * it for students.
 *
 * The route:
 * 1. Looks up the ModelMapping for the given modelName
 * 2. If it has a providerId, uses that specific provider
 * 3. Calls the AI with the question + a simple system prompt
 * 4. Returns the reply + timing
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Admin access required" },
      { status: (e as any)?.status ?? 401 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const modelName = (body?.modelName ?? "").toString().trim();
  const question = (body?.question ?? "").toString().trim();

  if (!modelName || !question) {
    return NextResponse.json(
      { error: "modelName and question are required" },
      { status: 400 }
    );
  }

  // Look up the ModelMapping
  const mapping = await db.modelMapping.findUnique({
    where: { modelName },
  });

  if (!mapping) {
    return NextResponse.json(
      { error: `Model "${modelName}" not found in ModelMapping table` },
      { status: 404 }
    );
  }

  // Build a simple system prompt for testing
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: "You are a Study Buddy AI tutor. Answer the student's question clearly and helpfully. Keep it under 150 words.",
    },
    { role: "user", content: question },
  ];

  const startTime = Date.now();

  try {
    // Temporarily set the user's currentModel to the requested model
    // by passing it via the context. But callAI doesn't accept a model
    // override directly — instead, we check if the mapping has a providerId
    // and call that provider directly.

    let reply = "";
    let providerInfo = "platform (z-ai-web-dev-sdk)";

    // If the mapping has a linked provider, call it directly
    if (mapping.providerId) {
      const provider = await db.aiProvider.findUnique({
        where: { id: mapping.providerId },
      });

      if (provider && provider.enabled) {
        const { decryptApiKey } = await import("@/lib/crypto");
        const apiKey = provider.apiKeyEncrypted
          ? decryptApiKey(provider.apiKeyEncrypted)
          : "";

        // Allow keyless (pollinations)
        if (apiKey || provider.providerType === "pollinations") {
          const { callProvider } = await import("@/lib/ai-providers");
          const result = await callProvider(provider as any, messages, {
            userId: "admin-ground-test",
            route: "/api/admin/curriculum/ground-test",
          });
          if (result.content) {
            reply = result.content;
            providerInfo = `${provider.name} (${provider.providerType} · ${provider.model ?? "default"})`;
          } else {
            return NextResponse.json({
              ok: false,
              error: result.errorMessage ?? "Provider returned empty response",
              providerInfo,
              modelName,
              displayName: mapping.displayName,
              emoji: mapping.emoji,
              durationMs: Date.now() - startTime,
            });
          }
        }
      }
    }

    // If no provider linked or provider call failed, use callAI as fallback
    if (!reply) {
      reply = await callAI(messages, null, {
        userId: "admin-ground-test",
        route: "/api/admin/curriculum/ground-test",
      });
    }

    const durationMs = Date.now() - startTime;

    return NextResponse.json({
      ok: true,
      reply,
      providerInfo,
      modelName,
      displayName: mapping.displayName,
      emoji: mapping.emoji,
      durationMs,
    });
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      error: e?.message ?? "AI call failed",
      providerInfo: "unknown (error before call completed)",
      modelName,
      displayName: mapping.displayName,
      emoji: mapping.emoji,
      durationMs: Date.now() - startTime,
    });
  }
}
