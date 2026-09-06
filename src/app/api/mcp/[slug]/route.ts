import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runBot, type BotTrainingPair, type BotConfig } from "@/lib/bot-engine";
import {
  handleInitialize,
  handleToolsList,
  handleToolsCall,
  jsonRpcResult,
  jsonRpcError,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from "@/lib/integrations/mcp";

export const runtime = "nodejs";

/**
 * POST /api/mcp/[slug]
 *
 * MCP (Model Context Protocol) server endpoint. Lets AI assistants like
 * Claude Desktop or Cursor use the deployed chatbot as a tool.
 *
 * Implements JSON-RPC 2.0 over HTTP (the "streamable HTTP" transport).
 * The slug identifies the bot — no auth (the slug is a 48-bit unguessable
 * token, same as the embed widget).
 *
 * Supported methods:
 *   - initialize:        MCP handshake
 *   - tools/list:        returns the "chat_with_bot" tool
 *   - tools/call:        runs the bot, returns the reply
 *   - notifications/initialized: ack (no response needed)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // Parse the JSON-RPC request.
  const body = await req.json().catch(() => null) as JsonRpcRequest | JsonRpcRequest[] | null;
  if (!body) {
    return NextResponse.json(jsonRpcError(null, -32700, "Parse error"), { status: 400 });
  }

  // Handle batch requests (JSON-RPC supports arrays).
  if (Array.isArray(body)) {
    const results = await Promise.all(body.map((r) => handleSingle(r, slug)));
    return NextResponse.json(results.filter((r) => r !== null));
  }

  const result = await handleSingle(body, slug);
  if (result === null) {
    // Notification — no response.
    return new NextResponse(null, { status: 204 });
  }
  return NextResponse.json(result);
}

async function handleSingle(req: JsonRpcRequest, slug: string): Promise<JsonRpcResponse | null> {
  const { id, method, params } = req;

  // Notifications (no id) get no response.
  const isNotification = id === null || id === undefined;

  // Load the bot (needed for most methods — but initialize + tools/list
  // only need the name, so we lazy-load).
  let bot: any = null;
  async function loadBot() {
    if (bot) return bot;
    bot = await db.deployedBot.findUnique({
      where: { slug },
      select: {
        id: true, userId: true, name: true, status: true,
        matchingMode: true, threshold: true, personaPrompt: true,
        generativeFallback: true, trainingData: true,
      },
    });
    return bot;
  }

  switch (method) {
    case "initialize": {
      const b = await loadBot();
      if (!b || b.status !== "deployed") {
        return jsonRpcError(id, -32001, "Bot not found or not deployed");
      }
      return handleInitialize(id, b.name);
    }

    case "notifications/initialized":
    case "notifications/cancelled":
      // Ack notifications with no response.
      return null;

    case "tools/list": {
      const b = await loadBot();
      if (!b || b.status !== "deployed") {
        return jsonRpcError(id, -32001, "Bot not found or not deployed");
      }
      return handleToolsList(id, b.name);
    }

    case "tools/call": {
      const b = await loadBot();
      if (!b || b.status !== "deployed") {
        return jsonRpcError(id, -32001, "Bot not found or not deployed");
      }
      const trainingPairs = (b.trainingData as unknown as BotTrainingPair[]) ?? [];
      const botConfig: BotConfig = {
        matchingMode: b.matchingMode as BotConfig["matchingMode"],
        threshold: b.threshold,
        personaPrompt: b.personaPrompt,
        generativeFallback: b.generativeFallback,
      };
      return handleToolsCall(id, params, async (message: string) => {
        const result = await runBot(message, trainingPairs, botConfig, b.userId);
        // Log the call (async, fire-and-forget).
        db.deployedBotMessage.create({
          data: {
            botId: b.id,
            visitorHash: "mcp",
            input: message.slice(0, 1000),
            output: result.reply.slice(0, 4000),
            bestScore: result.confidence,
            source: result.source,
            understood: result.source === "retrieval",
            topMatches: result.topMatches,
            responseMs: result.responseMs,
          },
        }).catch(() => {});
        return result;
      });
    }

    case "ping":
      return jsonRpcResult(id, {});

    default:
      if (isNotification) return null;
      return jsonRpcError(id, -32601, `Method not found: ${method}`);
  }
}

/**
 * GET /api/mcp/[slug]
 *   Returns a human-readable info page (for when someone opens the URL
 *   in a browser instead of calling it via JSON-RPC).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const bot = await db.deployedBot.findUnique({
    where: { slug },
    select: { name: true, status: true },
  });

  if (!bot || bot.status !== "deployed") {
    return new NextResponse("Bot not found", { status: 404, headers: { "Content-Type": "text/plain" } });
  }

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${bot.name} — MCP Server</title>
<style>
body { font-family: system-ui, sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; color: #1f2937; }
h1 { color: #7c3aed; }
code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
pre { background: #1f2937; color: #e5e7eb; padding: 16px; border-radius: 8px; overflow-x: auto; }
</style></head><body>
<h1>🤖 ${bot.name}</h1>
<p>This is an <a href="https://modelcontextprotocol.io">MCP (Model Context Protocol)</a> server endpoint. It exposes the chatbot as a tool that AI assistants like Claude Desktop or Cursor can call.</p>
<h2>How to use</h2>
<p>Add this URL to your MCP client config:</p>
<pre><code>${typeof globalThis !== "undefined" && globalThis.location ? globalThis.location.href : `/api/mcp/${slug}`}</code></pre>
<h2>Example JSON-RPC call</h2>
<pre><code>POST /api/mcp/${slug}
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "chat_with_bot",
    "arguments": { "message": "hello" }
  }
}</code></pre>
</body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
}
