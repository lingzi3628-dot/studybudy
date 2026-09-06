/**
 * Plugin registry + built-in plugins — Phase 73
 *
 * Built-in plugins need zero config — they're code that lives in this file.
 * The bot detects when a built-in plugin is relevant (via keyword matching)
 * and calls it, passing the result to the LLM.
 *
 * Custom plugins (HTTP, MCP) are defined per-bot in the DB and dispatched
 * through executor.ts.
 */

// === Types ===

export type PluginResult = {
  pluginName: string;
  success: boolean;
  output: string;          // the result text passed to the LLM
  raw?: any;               // optional raw response for logging
  durationMs: number;
};

export type BuiltinPlugin = {
  name: string;
  description: string;
  // Keyword patterns that trigger this plugin. Case-insensitive.
  // If any pattern matches the normalized message, the plugin is a candidate.
  triggers: RegExp[];
  // Execute the plugin. Returns the output string.
  execute: (message: string) => Promise<string>;
};

// === Built-in: Calculator ===

function evaluateMath(expr: string): string {
  // Strip everything except digits, operators, parens, decimal points, spaces.
  const cleaned = expr.replace(/[^0-9+\-*/().\s]/g, "").trim();
  if (!cleaned || !/^[\d+\-*/().\s]+$/.test(cleaned)) {
    throw new Error("No valid math expression found");
  }
  const result = Function(`"use strict";return(${cleaned})`)();
  if (typeof result !== "number" || !isFinite(result)) {
    throw new Error("Calculation did not produce a finite number");
  }
  return `${cleaned} = ${result}`;
}

const calculatorPlugin: BuiltinPlugin = {
  name: "calculator",
  description: "Evaluates math expressions. Use for arithmetic like '15 * 23' or '(100 - 30) / 2'.",
  triggers: [
    /\bcalculate\b/i,
    /\bwhat(?:'s| is)\s+[\d\s+\-*/().]+\??$/i,
    /\b[\d\s]+\s*[+\-*/]\s*[\d\s+\-*/().]+/,
    /\b\d+\s*(?:plus|minus|times|divided by)\s+\d+/i,
  ],
  async execute(message: string): Promise<string> {
    return evaluateMath(message);
  },
};

// === Built-in: Web Search ===

const webSearchPlugin: BuiltinPlugin = {
  name: "web_search",
  description: "Searches the web for current information. Use when the user asks about recent events, facts you don't know, or current data.",
  triggers: [
    /\bsearch\s+(?:for|the web)\b/i,
    /\bgoogle\b/i,
    /\bwhat(?:'s| is)\s+(?:the latest|today's|current)\b/i,
    /\bnews\s+about\b/i,
    /\bweather\s+(?:in|for|today)\b/i,
    /\bprice\s+of\b/i,
    /\bscore\s+(?:of|for)\b/i,
  ],
  async execute(message: string): Promise<string> {
    // Use the z-ai-web-dev-sdk search function (same as the tutor engine).
    try {
      const ZAI = (await import("z-ai-web-dev-sdk")).default;
      const zai = await ZAI.create();
      const results: any = await zai.functions.invoke("web_search", { query: message, num: 5 });
      const arr: any[] = Array.isArray(results) ? results : (results?.results ?? results?.data ?? []);
      if (arr.length > 0) {
        return arr.map((r, i) =>
          `[${i + 1}] ${r.title || "(no title)"}\n${r.snippet || r.description || r.content?.slice(0, 200) || ""}`
        ).join("\n\n");
      }
      return "Web search returned no results.";
    } catch (e: any) {
      throw new Error(`Web search failed: ${e?.message || e}`);
    }
  },
};

// === Built-in: DateTime ===

const datetimePlugin: BuiltinPlugin = {
  name: "datetime",
  description: "Returns the current date and time. Use when the user asks 'what time is it' or 'what's today's date'.",
  triggers: [
    /\bwhat(?:'s| is)\s+(?:the\s+)?(?:time|date|day)\b/i,
    /\bwhat\s+day\s+is\s+it\b/i,
    /\btoday's\s+date\b/i,
    /\bcurrent\s+time\b/i,
    /\bnow\b/i,
  ],
  async execute(_message: string): Promise<string> {
    const now = new Date();
    return `Current date and time: ${now.toLocaleString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      timeZoneName: "short",
    })}`;
  },
};

// === Registry ===

export const BUILTIN_PLUGINS: BuiltinPlugin[] = [
  calculatorPlugin,
  webSearchPlugin,
  datetimePlugin,
];

export function getBuiltinPlugin(name: string): BuiltinPlugin | undefined {
  return BUILTIN_PLUGINS.find((p) => p.name === name);
}

/**
 * Detect which built-in plugins are relevant to a message.
 * Returns the list of matching plugins (usually 0 or 1, but could be more
 * if multiple triggers match — e.g. "calculate the time" matches both
 * calculator and datetime).
 */
export function detectRelevantBuiltinPlugins(message: string): BuiltinPlugin[] {
  return BUILTIN_PLUGINS.filter((p) => p.triggers.some((re) => re.test(message)));
}

/** Get the built-in plugin definitions for the UI (name + description + triggers). */
export function listBuiltinPluginsForUI(): Array<{
  name: string;
  description: string;
  triggerExamples: string[];
}> {
  return BUILTIN_PLUGINS.map((p) => ({
    name: p.name,
    description: p.description,
    triggerExamples: p.triggers.map((re) => {
      // Extract a human-readable example from the regex source.
      const src = re.source
        .replace(/\\b/g, "")
        .replace(/\\s/g, " ")
        .replace(/\\\./g, ".")
        .replace(/\?:/g, "")
        .replace(/\((?!<)(?!\?)/g, "(")
        .replace(/<[^>]+>/g, "")
        .slice(0, 40);
      return src;
    }),
  }));
}
