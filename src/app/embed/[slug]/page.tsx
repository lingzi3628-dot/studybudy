import { db } from "@/lib/db";
import { EmbedChatWidget } from "./EmbedChatWidget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /embed/[slug] — public chat widget for a deployed bot.
 *
 * Server component: fetches the bot config from the DB, then renders
 * the EmbedChatWidget client component. No auth — anyone with the slug
 * can chat. Designed to be iframed into WordPress sites, Notion pages,
 * LMS courses, etc.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const bot = await db.deployedBot.findUnique({
    where: { slug },
    select: { name: true, status: true },
  }).catch(() => null);
  return {
    title: bot ? `${bot.name} — Chatbot` : "Chatbot",
    description: "Powered by StudyBuddy AI",
  };
}

export default async function EmbedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const bot = await db.deployedBot.findUnique({
    where: { slug },
    select: {
      name: true,
      status: true,
      thinkingDelay: true,
      botMemory: true,
    },
  }).catch(() => null);

  if (!bot || bot.status === "draft") {
    return (
      <div style={{ padding: 32, textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "#374151" }}>Bot not found</h2>
        <p style={{ color: "#6b7280", fontSize: 14, marginTop: 8 }}>This chatbot doesn&apos;t exist or has been removed.</p>
      </div>
    );
  }

  if (bot.status === "paused") {
    return (
      <div style={{ padding: 32, textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "#374151" }}>Bot paused</h2>
        <p style={{ color: "#6b7280", fontSize: 14, marginTop: 8 }}>The owner has temporarily disabled this chatbot.</p>
      </div>
    );
  }

  return (
    <EmbedChatWidget
      slug={slug}
      name={bot.name}
      thinkingDelay={bot.thinkingDelay}
      botMemory={bot.botMemory}
    />
  );
}
