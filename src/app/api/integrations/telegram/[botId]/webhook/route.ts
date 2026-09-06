import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runBot, type BotTrainingPair, type BotConfig } from "@/lib/bot-engine";
import { sendTelegramMessage, type TelegramUpdate } from "@/lib/integrations/telegram";

export const runtime = "nodejs";

/**
 * POST /api/integrations/telegram/[botId]/webhook
 *
 * Telegram webhook receiver. Telegram sends one POST per incoming message.
 * The [botId] in the path tells us which DeployedBot to route to.
 *
 * Telegram sets the `secret_token` header (X-Telegram-Bot-Api-Secret-Token)
 * — we verify it matches the webhookSecret stored in the integration config.
 * This prevents randoms from spoofing messages.
 *
 * No auth — this is a public webhook. The secret in the URL + header is
 * the auth.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ botId: string }> }
) {
  const { botId } = await params;

  // Load the integration + bot.
  const integration = await db.botIntegration.findUnique({
    where: { botId_platform: { botId, platform: "telegram" } },
    include: {
      bot: {
        select: {
          id: true,
          userId: true,
          name: true,
          status: true,
          matchingMode: true,
          threshold: true,
          personaPrompt: true,
          generativeFallback: true,
          trainingData: true,
        },
      },
    },
  });

  if (!integration || !integration.enabled || !integration.bot) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  // Verify the webhook secret (constant-time compare).
  const config = integration.config as { botToken: string; webhookSecret: string };
  const headerSecret = req.headers.get("x-telegram-bot-api-secret-token") || "";
  if (!config.webhookSecret || !headerSecret || config.webhookSecret !== headerSecret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // Parse the update.
  const update = await req.json().catch(() => null) as TelegramUpdate | null;
  if (!update || !update.message || !update.message.text) {
    // Not a text message — ack so Telegram doesn't retry.
    return NextResponse.json({ ok: true });
  }

  const chatId = update.message.chat.id;
  const text = update.message.text;

  // Ignore commands (Telegram sends /start, /help, etc).
  if (text.startsWith("/")) {
    await sendTelegramMessage(config.botToken, chatId, `Hi! I'm ${integration.bot.name}. Send me a message and I'll do my best to answer!`);
    return NextResponse.json({ ok: true });
  }

  // Run the bot.
  const trainingPairs = (integration.bot.trainingData as unknown as BotTrainingPair[]) ?? [];
  const botConfig: BotConfig = {
    matchingMode: integration.bot.matchingMode as BotConfig["matchingMode"],
    threshold: integration.bot.threshold,
    personaPrompt: integration.bot.personaPrompt,
    generativeFallback: integration.bot.generativeFallback,
  };
  const result = await runBot(text, trainingPairs, botConfig, integration.bot.userId);

  // Send the reply.
  await sendTelegramMessage(config.botToken, chatId, result.reply);

  // Log + update stats (async, fire-and-forget).
  db.botIntegration.update({
    where: { id: integration.id },
    data: {
      messageCount: { increment: 1 },
      lastMessageAt: new Date(),
    },
  }).catch(() => {});

  db.deployedBotMessage.create({
    data: {
      botId: integration.bot.id,
      visitorHash: `tg:${update.message.chat.id}`,
      input: text.slice(0, 1000),
      output: result.reply.slice(0, 4000),
      bestScore: result.confidence,
      source: result.source,
      understood: result.source === "retrieval",
      topMatches: result.topMatches,
      responseMs: result.responseMs,
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
