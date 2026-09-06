/**
 * Plugin executor — Phase 73
 *
 * Executes a plugin by type:
 *   - builtin → calls the built-in plugin code from registry.ts
 *   - http    → makes an HTTP request to the user-defined endpoint
 *   - mcp     → connects to an external MCP server and calls a tool
 *
 * All execution is server-side (this file is imported by API routes only).
 */

import { getBuiltinPlugin, type PluginResult } from "./registry";

// === Types ===

export type PluginConfig = {
  // For "http" plugins:
  method?: "GET" | "POST";
  url?: string;
  headers?: Record<string, string>;
  bodyTemplate?: string;     // {{message}} is interpolated
  responsePath?: string;     // dot-path into the JSON response (e.g. "result.answer")
  // For "mcp" plugins:
  serverUrl?: string;
  toolName?: string;
  // For "builtin" plugins:
  builtinName?: string;
};

export type StoredPlugin = {
  id: string;
  name: string;
  type: string;        // "builtin" | "http" | "mcp"
  description: string;
  config: PluginConfig;
  enabled: boolean;
};

// === Main executor ===

export async function executePlugin(
  plugin: StoredPlugin,
  message: string,
): Promise<PluginResult> {
  const started = Date.now();
  try {
    let output: string;

    if (plugin.type === "builtin") {
      const builtin = getBuiltinPlugin(plugin.config.builtinName || plugin.name);
      if (!builtin) throw new Error(`Unknown built-in plugin: ${plugin.config.builtinName || plugin.name}`);
      output = await builtin.execute(message);
    } else if (plugin.type === "http") {
      output = await executeHttpPlugin(plugin.config, message);
    } else if (plugin.type === "mcp") {
      output = await executeMcpPlugin(plugin.config, message);
    } else {
      throw new Error(`Unknown plugin type: ${plugin.type}`);
    }

    return {
      pluginName: plugin.name,
      success: true,
      output: output.slice(0, 4000),
      durationMs: Date.now() - started,
    };
  } catch (e: any) {
    return {
      pluginName: plugin.name,
      success: false,
      output: `Plugin error: ${e?.message || e}`,
      durationMs: Date.now() - started,
    };
  }
}

// === HTTP plugin ===

async function executeHttpPlugin(config: PluginConfig, message: string): Promise<string> {
  if (!config.url) throw new Error("HTTP plugin missing url");

  const method = config.method || "POST";
  const headers = config.headers || {};

  let body: string | undefined;
  if (method === "POST" && config.bodyTemplate) {
    // Interpolate {{message}} into the body template.
    body = config.bodyTemplate.replace(/\{\{message\}\}/g, JSON.stringify(message).slice(1, -1));
  }

  const r = await fetch(config.url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body,
    signal: AbortSignal.timeout(10_000), // 10s timeout
  });

  if (!r.ok) {
    throw new Error(`HTTP ${r.status} ${r.statusText}`);
  }

  const contentType = r.headers.get("content-type") || "";
  let raw: any;
  if (contentType.includes("application/json")) {
    raw = await r.json();
  } else {
    raw = await r.text();
  }

  // Extract the response path if specified.
  if (config.responsePath && typeof raw === "object") {
    const extracted = config.responsePath.split(".").reduce((obj, key) => obj?.[key], raw);
    return typeof extracted === "string" ? extracted : JSON.stringify(extracted, null, 2);
  }

  return typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
}

// === MCP client plugin ===

/**
 * Connect to an external MCP server and call a tool.
 * Uses JSON-RPC 2.0 over HTTP (same protocol our /api/mcp/[slug] server speaks).
 *
 * Flow:
 *   1. POST { method: "tools/list" } → get available tools
 *   2. If toolName specified, call it. Else, call "chat_with_bot" or the first tool.
 *   3. Return the tool's text output.
 */
async function executeMcpPlugin(config: PluginConfig, message: string): Promise<string> {
  if (!config.serverUrl) throw new Error("MCP plugin missing serverUrl");

  const toolName = config.toolName || "chat_with_bot";

  // Call the tool directly (we skip initialize for simplicity — most MCP
  // servers handle tools/call without requiring the handshake).
  const r = await fetch(config.serverUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: { message },
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!r.ok) {
    throw new Error(`MCP server returned HTTP ${r.status}`);
  }

  const data = await r.json();
  if (data.error) {
    throw new Error(`MCP error: ${data.error.message}`);
  }

  // MCP tools return content as an array of typed blocks.
  const result = data.result;
  if (result?.content && Array.isArray(result.content)) {
    const textBlocks = result.content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text);
    return textBlocks.join("\n") || JSON.stringify(result);
  }

  return typeof result === "string" ? result : JSON.stringify(result, null, 2);
}

// === Plugin relevance detection (for the bot's "should I call a plugin?" decision) ===

/**
 * Given a message + the bot's enabled plugins, decide which plugins to call.
 *
 * Strategy:
 *   1. For builtin plugins: use the trigger regexes from registry.ts
 *   2. For HTTP + MCP plugins: check if the plugin name or keywords appear
 *      in the message (simple substring match — the user can name their
 *      plugin "weather" and it'll trigger on "what's the weather?")
 *
 * This is intentionally simple. A future version could use the LLM itself
 * to decide which plugin to call (function-calling), but keyword detection
 * is fast, free, and good enough for most cases.
 */
export function detectRelevantPlugins(
  message: string,
  plugins: StoredPlugin[],
): StoredPlugin[] {
  const relevant: StoredPlugin[] = [];
  const lowerMessage = message.toLowerCase();

  for (const plugin of plugins) {
    if (!plugin.enabled) continue;

    if (plugin.type === "builtin") {
      // Use the built-in's trigger regexes.
      const builtin = getBuiltinPlugin(plugin.config.builtinName || plugin.name);
      if (builtin && builtin.triggers.some((re) => re.test(message))) {
        relevant.push(plugin);
      }
    } else {
      // HTTP + MCP: check if the plugin name or keywords appear in the message.
      // The user can configure keywords in the description — we check both
      // the name and the description's first sentence.
      const keywords = [
        plugin.name.toLowerCase(),
        ...plugin.description.toLowerCase().split(/[.,;]/)[0].split(/\s+/).filter((w) => w.length > 3),
      ];
      if (keywords.some((kw) => lowerMessage.includes(kw))) {
        relevant.push(plugin);
      }
    }
  }

  return relevant;
}
