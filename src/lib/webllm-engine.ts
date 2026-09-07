/**
 * WebLLM Engine — Phase 76
 *
 * Runs a small LLM ENTIRELY in the browser via WebGPU. No external API,
 * no server round-trip — the model downloads once (~1-2GB), then runs
 * locally on the user's device.
 *
 * Used for Option 3 (hybrid architecture):
 *   - Simple chat (greetings, small talk, basic Q&A) → local model (instant, free)
 *   - Complex tasks (code writing, long explanations) → GLM API (high quality)
 *
 * Smart routing decides which engine to use based on the query complexity.
 *
 * Models:
 *   - Phi-3.5-mini-instruct-q4f16_1-MLC (~2.3GB) — best quality local model
 *   - Qwen2-1.5B-Instruct-q4f16_1-MLC (~1.1GB) — faster, smaller, good quality
 *   - SmolLM-360M-Instruct-q4f16_1-MLC (~250MB) — tiny, very fast, basic quality
 *
 * The model is cached by the browser after the first download, so subsequent
 * sessions load instantly (no re-download).
 */

import type { InitProgressReport, ChatCompletionMessageParam } from "@mlc-ai/web-llm";

// === Types ===

export type LocalModelId = "phi3" | "qwen2" | "smollm";

export type LocalModelConfig = {
  id: LocalModelId;
  label: string;
  modelId: string;
  size: string;
  quality: string;
  speed: string;
};

export const LOCAL_MODELS: LocalModelConfig[] = [
  {
    id: "smollm",
    label: "SmolLM2 360M (Fast)",
    modelId: "SmolLM2-360M-Instruct-q4f16_1-MLC",
    size: "~250MB",
    quality: "Basic — good for simple chat",
    speed: "Very fast (1-3s)",
  },
  {
    id: "qwen2",
    label: "Qwen2 1.5B (Balanced)",
    modelId: "Qwen2-1.5B-Instruct-q4f16_1-MLC",
    size: "~1.1GB",
    quality: "Good — handles most conversations",
    speed: "Fast (3-8s)",
  },
  {
    id: "phi3",
    label: "Phi-3.5 Mini (Best)",
    modelId: "Phi-3.5-mini-instruct-q4f16_1-MLC",
    size: "~2.3GB",
    quality: "Excellent — near GLM quality",
    speed: "Medium (5-15s)",
  },
];

// === Singleton engine ===

let engine: any = null;
let loadingModel: string | null = null;
let loadProgress: { progress: number; text: string } | null = null;
let loadedModelId: string | null = null;

/**
 * Check if WebGPU is available in this browser.
 */
export function isWebGPUAvailable(): boolean {
  if (typeof navigator === "undefined") return false;
  return !!(navigator as any).gpu;
}

/**
 * Load a local model. Returns when the model is ready to generate.
 * Reports progress via the onProgress callback.
 *
 * The model is cached by the browser — subsequent loads are instant.
 */
export async function loadLocalModel(
  modelId: string,
  onProgress?: (progress: number, text: string) => void,
): Promise<void> {
  if (loadedModelId === modelId && engine) return; // already loaded
  if (loadingModel === modelId) return; // already loading

  loadingModel = modelId;
  loadProgress = { progress: 0, text: "Initializing WebGPU…" };

  try {
    const webllm = await import("@mlc-ai/web-llm");
    const CreateMLCEngine = (webllm as any).CreateMLCEngine ?? (webllm as any).default?.CreateMLCEngine;

    if (!CreateMLCEngine) {
      throw new Error("WebLLM engine not available. Make sure @mlc-ai/web-llm is installed.");
    }

    loadProgress = { progress: 0.01, text: "Downloading model (one-time)…" };

    engine = await CreateMLCEngine(modelId, {
      initProgressCallback: (report: InitProgressReport) => {
        loadProgress = {
          progress: report.progress,
          text: report.text || `Loading… ${(report.progress * 100).toFixed(0)}%`,
        };
        onProgress?.(report.progress, report.text || "");
      },
    });

    loadedModelId = modelId;
    loadProgress = null;
    loadingModel = null;
  } catch (e: any) {
    loadingModel = null;
    loadProgress = null;
    throw new Error(`Failed to load local model: ${e?.message || e}`);
  }
}

/**
 * Get the current load progress (for the UI to show download status).
 */
export function getLoadProgress(): { progress: number; text: string } | null {
  return loadProgress;
}

/**
 * Check if a model is currently loaded and ready.
 */
export function isLocalModelReady(): boolean {
  return engine !== null && loadedModelId !== null;
}

/**
 * Get the currently loaded model ID.
 */
export function getLoadedModelId(): string | null {
  return loadedModelId;
}

/**
 * Generate a response using the local model.
 *
 * @param systemPrompt — the system prompt (persona)
 * @param userPrompt — the user's message + context
 * @param temperature — 0.1=precise, 0.7=creative
 * @param maxTokens — max response length
 * @returns the generated text, or null if generation failed
 */
export async function generateLocal(
  systemPrompt: string,
  userPrompt: string,
  temperature: number = 0.7,
  maxTokens: number = 1000,
): Promise<string> {
  if (!engine) {
    throw new Error("No local model loaded. Call loadLocalModel() first.");
  }

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  try {
    const response = await engine.chat.completions.create({
      messages,
      temperature,
      max_tokens: maxTokens,
    });
    const output = response.choices[0]?.message?.content?.trim() ?? "";
    return output;
  } catch (e: any) {
    throw new Error(`Local generation failed: ${e?.message || e}`);
  }
}

/**
 * Unload the current model (frees GPU memory).
 */
export async function unloadLocalModel(): Promise<void> {
  if (engine) {
    try {
      await engine.unload();
    } catch {}
    engine = null;
    loadedModelId = null;
  }
}

// === Smart routing — decide whether to use local model or GLM ===

/**
 * Query complexity levels:
 *   - "simple": greetings, small talk, basic identity questions, farewells
 *   - "moderate": explanations, definitions, opinions, follow-ups
 *   - "complex": code writing, multi-step reasoning, long explanations, math
 *
 * Simple → local model (instant, free)
 * Moderate → local model (if loaded) or GLM
 * Complex → GLM (high quality)
 */
export type QueryComplexity = "simple" | "moderate" | "complex";

export function assessQueryComplexity(message: string): QueryComplexity {
  const lower = message.toLowerCase();
  const wordCount = lower.split(/\s+/).length;

  // Complex: code generation, multi-step reasoning, long explanations
  const complexPatterns = [
    /\b(write|create|generate|build|implement|develop|program|code)\b.*\b(function|class|program|script|app|game|algorithm|api|server|website)\b/i,
    /\b(explain|describe|analyze|compare|contrast|derive|prove|calculate|solve)\b/i,
    /```/, // markdown code block
    /\bstep.by.step\b/i,
    /\b(tutorial|guide|walkthrough|example)\b/i,
  ];
  if (complexPatterns.some((re) => re.test(message)) || wordCount > 30) {
    return "complex";
  }

  // Simple: greetings, farewells, identity, short small talk
  const simplePatterns = [
    /^(hi|hello|hey|sup|yo|hola|greetings|howdy|hiya)\b/i,
    /^(bye|goodbye|see.you|farewell|good.night|later|cya)\b/i,
    /\b(thank|thanks|thx|ty|appreciate)\b/i,
    /^(ok|okay|k|sure|yes|no|yeah|nope|cool|nice|great|awesome)\b/i,
    /\b(how are you|what.s up|what.s your name|who are you|what can you do)\b/i,
    /\b(good morning|good afternoon|good evening)\b/i,
  ];
  if (simplePatterns.some((re) => re.test(message)) && wordCount <= 10) {
    return "simple";
  }

  // Moderate: everything else
  return "moderate";
}

/**
 * Decide which engine to use for a given message.
 *
 * @param message — the user's message
 * @param localModelReady — whether a local model is loaded
 * @param generativeFallback — whether GLM generative fallback is enabled
 * @returns "local" | "glm" | "retrieval-only"
 */
export function routeQuery(
  message: string,
  localModelReady: boolean,
  generativeFallback: boolean,
): "local" | "glm" | "retrieval-only" {
  const complexity = assessQueryComplexity(message);

  // Simple queries → local model (if available), else GLM
  if (complexity === "simple") {
    if (localModelReady) return "local";
    if (generativeFallback) return "glm";
    return "retrieval-only";
  }

  // Moderate → local model (if available), else GLM
  if (complexity === "moderate") {
    if (localModelReady) return "local";
    if (generativeFallback) return "glm";
    return "retrieval-only";
  }

  // Complex → always GLM (local models aren't good enough for code generation)
  if (generativeFallback) return "glm";
  if (localModelReady) return "local"; // fall back to local if GLM is disabled
  return "retrieval-only";
}
