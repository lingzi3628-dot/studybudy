import { detectRelevantBuiltinPlugins } from "@/lib/plugins/registry";
import { executePlugin, type StoredPlugin } from "@/lib/plugins/executor";

/** Execute only built-in tutor tools with clear user intent; external actions stay disabled. */
export async function runTutorTools(message: string): Promise<string> {
  const explicitCodeRun = /\b(run|execute)\b/i.test(message) &&
    (/\b(code|script|program)\b/i.test(message) || /```(?:python|py|javascript|js)/i.test(message));
  const asksTime = /\b(?:what (?:time|date) is it|what(?:'s| is) (?:the )?(?:time|date|day)|today(?:'s)? date|current (?:time|date)|what day is it)\b/i.test(message);
  const selected = detectRelevantBuiltinPlugins(message).filter((plugin) => {
    if (plugin.name === "calculator") return true;
    if (plugin.name === "datetime") return asksTime;
    if (plugin.name === "code_runner") return explicitCodeRun;
    return false; // Web search has its own citation/attachment path in tutor-chat-engine.
  }).slice(0, 2);

  if (selected.length === 0) return "";
  const results = await Promise.all(selected.map((plugin) => {
    const stored: StoredPlugin = {
      id: `tutor-${plugin.name}`,
      name: plugin.name,
      type: "builtin",
      description: plugin.description,
      config: { builtinName: plugin.name },
      enabled: true,
    };
    return executePlugin(stored, message);
  }));
  return results.map((result) =>
    `[Tutor tool: ${result.pluginName}; ${result.success ? "success" : "failed"}]\n${result.output}`
  ).join("\n\n");
}
