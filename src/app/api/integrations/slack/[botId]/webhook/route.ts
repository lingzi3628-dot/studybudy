import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runBot, type BotTrainingPair, type BotConfig } from "@/lib/bot-engine";
import { verifySlackSignature, parseSlackSlashCommand, postSlackMessage, formatSlackReply } from "@/lib/integrations/slack";

export const runtime = "nodejs";

/**
 * POST /api/integrations/slack/[botId]/webhook
 *
 * Slack slash-command receiver. When a user types /ask-bot hello in Slack,
 * Slack POSTs form-encoded data here.
 *
 * We verify the signing signature (X-Slack-Signature + X-Slack-Request-Timestamp
 * headers, HMAC-SHA256 with the signing secret), run the bot, and reply.
 *
 * For fast replies (<3s), we return the reply inline as JSON (Slack shows
 * it immediately). For slower replies, we'd use the response_url — but
 * since runBot is usually fast (TF-IDF retrieval is instant), we do inline.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ botId: string }> }
) {
  const { botId } = await params;

  // Load the integration + bot.
  const integration = await db.botIntegration.findUnique({
    where: { botId_platform: { botId, platform: "slack" } },
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
    return NextResponse.json({ error: "Integration not found" }, { status: 404 });
  }

  const config = integration.config as { botToken: string; signingSecret: string };

  // Read the raw body (needed for signature verification).
  const rawBody = await req.text();
  const timestamp = req.headers.get("x-slack-request-timestamp") || "";
  const signature = req.headers.get("x-slack-signature") || "";

  // Verify signature.
  if (!verifySlackSignature(config.signingSecret, timestamp, rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Parse the form-encoded body.
  const formData = new URLSearchParams(rawBody);
  const cmd = parseSlackSlashCommand(formData);

  if (!cmd.text.trim()) {
    return NextResponse.json({
      response_type: "ephemeral",
      text: `Hi! I'm ${integration.bot.name}. Use \`/${cmd.command.replace("/", "")} your question here\` to ask me something.`,
    });
  }

  // Run the bot.
  const trainingPairs = (integration.bot.trainingData as unknown as BotTrainingPair[]) ?? [];
  const botConfig: BotConfig = {
    matchingMode: integration.bot.matchingMode as BotConfig["matchingMode"],
    threshold: integration.bot.threshold,
    personaPrompt: integration.bot.personaPrompt,
    generativeFallback: integration.bot.generativeFallback,
  };
  const result = await runBot(cmd.text, trainingPairs, botConfig, integration.bot.userId);

  // Reply inline (visible to everyone in the channel).
  // We also post asynchronously to support longer processing times.
  const replyText = formatSlackReply(result.reply, result.source, result.confidence);

  // If the response took a while, post via chat.postMessage for reliability.
  // Otherwise return inline for speed.
  if (result.responseMs > 2500 && cmd.responseUrl) {
    // Async post (Slack's response_url has a 30-min window).
    postSlackMessage(config.botToken, cmd.channelId, replyText).catch(() => {});
    return NextResponse.json({ response_type: "ephemeral", text: "Thinking…" });
  }

  // Log + update stats (async).
  db.botIntegration.update({
    where: { id: integration.id },
    data: { messageCount: { increment: 1 }, lastMessageAt: new Date() },
  }).catch(() => {});

  db.deployedBotMessage.create({
    data: {
      botId: integration.bot.id,
      visitorHash: `slack:${cmd.userId}`,
      input: cmd.text.slice(0, 1000),
      output: result.reply.slice(0, 4000),
      bestScore: result.confidence,
      source: result.source,
      understood: result.source === "retrieval",
      topMatches: result.topMatches,
      responseMs: result.responseMs,
    },
  }).catch(() => {});

  return NextResponse.json({
    response_type: "in_channel",
    text: replyText,
  });
}
