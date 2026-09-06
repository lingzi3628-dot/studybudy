/**
 * MCP (Model Context Protocol) server adapter — Phase 71
 *
 * Exposes a deployed chatbot as an MCP tool that AI assistants like
 * Claude Desktop or Cursor can call. The protocol is JSON-RPC 2.0 over
 * HTTP (we implement the "streamable HTTP" transport — single endpoint,
 * one JSON-RPC request per HTTP POST).
 *
 * MCP tools our server exposes:
 *   - "chat_with_bot": { message: string } → { reply, source, confidence }
 *
 * The endpoint is POST /api/mcp/[slug] — the slug identifies the bot.
 * No auth for now (the slug is a 48-bit unguessable token); API-key auth
 * can be added later for private bots.
 *
 * Reference: https://modelcontextprotocol.io/specification
 */

import type { BotReply } from "@/lib/bot-engine";

// === JSON-RPC types ===

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: any;
};

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: any;
  error?: { code: number; message: string; data?: any };
};

export function jsonRpcResult(id: string | number | null, result: any): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

export function jsonRpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: any,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}

// === MCP protocol handlers ===

/** The MCP "initialize" handshake — returns server info + capabilities. */
export function handleInitialize(id: string | number | null, botName: string): JsonRpcResponse {
  return jsonRpcResult(id, {
    protocolVersion: "2024-11-05",
    serverInfo: {
      name: `studybuddy-bot-${botName.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 30)}`,
      version: "1.0.0",
    },
    capabilities: {
      tools: {},  // we expose tools, not resources or prompts
    },
  });
}

/** The MCP "tools/list" method — returns the tools this server exposes. */
export function handleToolsList(id: string | number | null, botName: string): JsonRpcResponse {
  return jsonRpcResult(id, {
    tools: [
      {
        name: "chat_with_bot",
        description: `Chat with the "${botName}" chatbot. Ask it a question and it will reply using its trained knowledge (retrieval) or generate a new answer (LLM fallback).`,
        inputSchema: {
          type: "object",
          properties: {
            message: {
              type: "string",
              description: "The question or message to send to the bot.",
            },
          },
          required: ["message"],
        },
      },
    ],
  });
}

/** The MCP "tools/call" method — runs the bot. */
export function handleToolsCall(
  id: string | number | null,
  params: any,
  runBotFn: (message: string) => Promise<BotReply>,
): Promise<JsonRpcResponse> {
  return (async () => {
    const toolName = params?.name;
    const args = params?.arguments ?? {};

    if (toolName !== "chat_with_bot") {
      return jsonRpcError(id, -32601, `Unknown tool: ${toolName}`);
    }

    const message = typeof args.message === "string" ? args.message.trim() : "";
    if (!message) {
      return jsonRpcError(id, -32602, "Missing required argument: message");
    }

    const result = await runBotFn(message);
    // MCP tools return content as an array of typed blocks.
    return jsonRpcResult(id, {
      content: [
        {
          type: "text",
          text: result.reply,
        },
        {
          type: "text",
          text: `[source: ${result.source}, confidence: ${(result.confidence * 100).toFixed(0)}%]`,
        },
      ],
      // Structured data for programmatic clients.
      _meta: {
        source: result.source,
        confidence: result.confidence,
        matchedInput: result.matchedInput,
        responseMs: result.responseMs,
      },
    });
  })();
}
