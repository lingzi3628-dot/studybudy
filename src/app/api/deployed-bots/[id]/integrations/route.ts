import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { setTelegramWebhook, deleteTelegramWebhook, getTelegramBotInfo } from "@/lib/integrations/telegram";
import crypto from "crypto";

export const runtime = "nodejs";

/**
 * GET /api/deployed-bots/[id]/integrations
 *   List all integrations for this bot.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id } = await params;

  const bot = await db.deployedBot.findUnique({
    where: { id },
    select: { userId: true, apiKey: true },
  });
  if (!bot || bot.userId !== user.id) {
    return NextResponse.json({ error: "Bot not found" }, { status: 404 });
  }

  const integrations = await db.botIntegration.findMany({
    where: { botId: id },
    select: {
      id: true,
      platform: true,
      enabled: true,
      messageCount: true,
      lastMessageAt: true,
      createdAt: true,
      // Don't return the full config (may contain secrets) — just non-secret fields.
      config: true,
    },
  });

  // Mask sensitive fields in config.
  const masked = integrations.map((i) => {
    const config = i.config as any;
    const maskedConfig: any = {};
    for (const [k, v] of Object.entries(config)) {
      if (typeof v === "string" && (k.toLowerCase().includes("token") || k.toLowerCase().includes("secret"))) {
        maskedConfig[k] = v ? `${v.slice(0, 4)}…${v.slice(-4)}` : "";
      } else {
        maskedConfig[k] = v;
      }
    }
    return {
      ...i,
      config: maskedConfig,
      lastMessageAt: i.lastMessageAt?.toISOString() ?? null,
      createdAt: i.createdAt.toISOString(),
    };
  });

  return NextResponse.json({
    integrations: masked,
    apiKey: bot.apiKey,
  });
}

/**
 * POST /api/deployed-bots/[id]/integrations
 *   Body: { platform: "telegram"|"slack"|"mcp", config: {...} }
 *   Creates or updates an integration. For Telegram, also sets the webhook.
 *   For MCP, no setup needed — the endpoint is always available at /api/mcp/[slug].
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as {
    platform?: string;
    config?: any;
  };

  const bot = await db.deployedBot.findUnique({
    where: { id },
    select: { userId: true, slug: true, name: true },
  });
  if (!bot || bot.userId !== user.id) {
    return NextResponse.json({ error: "Bot not found" }, { status: 404 });
  }

  const platform = body.platform ?? "";
  if (!["telegram", "slack"].includes(platform)) {
    return NextResponse.json({ error: "platform must be 'telegram' or 'slack'" }, { status: 400 });
  }

  const config = body.config ?? {};

  // === Telegram-specific setup ===
  if (platform === "telegram") {
    const botToken = (config.botToken ?? "").toString().trim();
    if (!botToken || !/^\d+:.+/.test(botToken)) {
      return NextResponse.json({ error: "Invalid Telegram bot token (format: 123456:ABC-DEF)" }, { status: 400 });
    }

    // Verify the token by calling getMe.
    const info = await getTelegramBotInfo(botToken);
    if (!info.ok) {
      return NextResponse.json({ error: `Telegram rejected the token: ${info.error}` }, { status: 400 });
    }

    // Generate a webhook secret + set the webhook.
    const webhookSecret = crypto.randomBytes(24).toString("hex");
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://studybuddy.ai"}/api/integrations/telegram/${id}/webhook`;
    const setResult = await setTelegramWebhook(botToken, webhookUrl, webhookSecret);
    if (!setResult.ok) {
      return NextResponse.json({ error: `Failed to set Telegram webhook: ${setResult.error}` }, { status: 500 });
    }

    // Upsert the integration.
    const integration = await db.botIntegration.upsert({
      where: { botId_platform: { botId: id, platform: "telegram" } },
      create: {
        botId: id,
        platform: "telegram",
        config: { botToken, webhookSecret, botUsername: info.username },
      },
      update: {
        config: { botToken, webhookSecret, botUsername: info.username },
        enabled: true,
      },
    });

    return NextResponse.json({
      integration: {
        id: integration.id,
        platform: "telegram",
        botUsername: info.username,
        webhookUrl,
      },
    });
  }

  // === Slack-specific setup ===
  if (platform === "slack") {
    const botToken = (config.botToken ?? "").toString().trim();
    const signingSecret = (config.signingSecret ?? "").toString().trim();
    if (!botToken || !botToken.startsWith("xoxb-")) {
      return NextResponse.json({ error: "Invalid Slack bot token (must start with xoxb-)" }, { status: 400 });
    }
    if (!signingSecret) {
      return NextResponse.json({ error: "Slack signing secret is required" }, { status: 400 });
    }

    const integration = await db.botIntegration.upsert({
      where: { botId_platform: { botId: id, platform: "slack" } },
      create: {
        botId: id,
        platform: "slack",
        config: { botToken, signingSecret },
      },
      update: {
        config: { botToken, signingSecret },
        enabled: true,
      },
    });

    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://studybuddy.ai"}/api/integrations/slack/${id}/webhook`;
    return NextResponse.json({
      integration: {
        id: integration.id,
        platform: "slack",
        webhookUrl,
        // User needs to create a Slack app with this slash command.
        instructions: `In your Slack app settings, add a slash command (e.g. /ask-bot) pointing to: ${webhookUrl}`,
      },
    });
  }

  return NextResponse.json({ error: "Unknown platform" }, { status: 400 });
}

/**
 * DELETE /api/deployed-bots/[id]/integrations/[platform]
 *   Disconnect an integration. For Telegram, also deletes the webhook.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; platform: string }> }
) {
  const user = await getCurrentUser();
  const { id, platform } = await params;

  const bot = await db.deployedBot.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!bot || bot.userId !== user.id) {
    return NextResponse.json({ error: "Bot not found" }, { status: 404 });
  }

  const integration = await db.botIntegration.findUnique({
    where: { botId_platform: { botId: id, platform } },
  });
  if (!integration) {
    return NextResponse.json({ error: "Integration not found" }, { status: 404 });
  }

  // For Telegram, delete the webhook first.
  if (platform === "telegram") {
    const config = integration.config as { botToken: string };
    if (config.botToken) {
      await deleteTelegramWebhook(config.botToken);
    }
  }

  await db.botIntegration.delete({ where: { id: integration.id } });
  return NextResponse.json({ ok: true });
}

/**
 * POST /api/deployed-bots/[id]/integrations/api-key
 *   Generate or regenerate the REST API key for this bot.
 *   (Separate route under the same path for clarity.)
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id } = await params;

  const bot = await db.deployedBot.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!bot || bot.userId !== user.id) {
    return NextResponse.json({ error: "Bot not found" }, { status: 404 });
  }

  // Generate a new API key: "sk_" + 32 random hex chars.
  const apiKey = "sk_" + crypto.randomBytes(16).toString("hex");
  await db.deployedBot.update({ where: { id }, data: { apiKey } });
  return NextResponse.json({ apiKey });
}
