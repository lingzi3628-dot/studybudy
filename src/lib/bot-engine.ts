/**
 * Server-side chatbot engine — Phase 70
 *
 * Mirrors the retrieval + generative-fallback logic from
 * ChatbotPlayground.sendMessage, but as a pure function that runs in a
 * Next.js route handler (no DOM, no USE embeddings — server-side TF-IDF
 * only for now; semantic mode would require a separate ONNX/transformers
 * setup that's out of scope for this phase).
 *
 * Used by POST /api/embed/[slug]/messages to serve deployed bots.
 */

import { callAI, type ChatMessage } from "@/lib/ai";

// === Types ===

export type BotTrainingPair = {
  id?: string;
  input: string;
  output: string;
  intent?: string;
  isTest?: boolean;
};

export type BotConfig = {
  matchingMode: "tfidf" | "keyword" | "fuzzy" | "hybrid";
  threshold: number;
  personaPrompt?: string | null;
  generativeFallback: boolean;
};

export type KnowledgeChunkForBot = {
  index: number;
  text: string;
  sourceTitle?: string;
};

export type BotReply = {
  reply: string;
  source: "retrieval" | "generative" | "fallback";
  confidence: number;
  matchedInput: string | null;
  topMatches: Array<{ input: string; score: number }>;
  responseMs: number;
  /** Phase 72 — RAG chunks retrieved from knowledge sources, if any. */
  ragChunks?: Array<{ text: string; score: number; sourceTitle?: string }>;
};

// === NLP primitives (mirror ChatbotPlayground) ===

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter((w) => w.length > 1);
}

const ABBREVIATIONS: Record<string, string> = {
  u: "you", ur: "your", urs: "yours", "u r": "you are",
  // Phase 73.1: REMOVED single-letter abbreviations (c→see, b→be, r→are, y→why,
  // n→and, k→ok) — they broke "c language", "r programming", "plan b", etc.
  nd: "and", ok: "ok",
  pls: "please", plz: "please", tho: "though", "thru": "through",
  "wat": "what", "wut": "what", "yolo": "you only live once",
  "lol": "laughing out loud", "omg": "oh my god", "idk": "i do not know",
  "tbh": "to be honest", "imo": "in my opinion", "imho": "in my honest opinion",
  "gonna": "going to", "wanna": "want to", "gotta": "got to",
  "dunno": "do not know", "kinda": "kind of", "sorta": "sort of",
  "couldnt": "could not", "wouldnt": "would not", "shouldnt": "should not",
  "dont": "do not", "doesnt": "does not", "didnt": "did not",
  "cant": "cannot", "wont": "will not", "isnt": "is not", "arent": "are not",
  "wasnt": "was not", "werent": "were not", "hasnt": "has not",
  "havent": "have not", "hadnt": "had not", "im": "i am", "ive": "i have",
  "youre": "you are", "theyre": "they are", "thats": "that is",
  "whats": "what is", "wheres": "where is", "hows": "how is",
  // Phase 73.1: common misspelling variants for greeting words
  "hii": "hi", "hiii": "hi", "hiiii": "hi", "hey": "hi",
  "helloo": "hello", "hellow": "hello", "hallo": "hello",
};

function normalizeText(text: string): string {
  const tokens = text.toLowerCase().replace(/[^\w\s']/g, " ").split(/\s+/).filter(Boolean);
  const expanded = tokens.map((tok) => ABBREVIATIONS[tok.replace(/'/g, "")] ?? tok);
  return expanded.join(" ").replace(/\s+/g, " ").trim();
}

function buildVocab(pairs: Array<{ input: string }>): string[] {
  const set = new Set<string>();
  for (const p of pairs) for (const w of tokenize(p.input)) set.add(w);
  return Array.from(set);
}

function computeIDF(pairs: Array<{ input: string }>, vocab: string[]): Map<string, number> {
  const dc = new Map<string, number>();
  for (const p of pairs) {
    const t = new Set(tokenize(p.input));
    for (const w of t) dc.set(w, (dc.get(w) ?? 0) + 1);
  }
  const N = pairs.length;
  return new Map(vocab.map((w) => [w, Math.log((N + 1) / ((dc.get(w) ?? 0) + 1)) + 1]));
}

function tfidfVector(text: string, vocab: string[], idf: Map<string, number>): number[] {
  const tokens = tokenize(text);
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return vocab.map((w) => ((tf.get(w) ?? 0) / Math.max(tokens.length, 1)) * (idf.get(w) ?? 1));
}

function cosineSim(a: number[], b: number[]): number {
  let d = 0, ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; ma += a[i] * a[i]; mb += b[i] * b[i]; }
  const den = Math.sqrt(ma) * Math.sqrt(mb);
  return den > 0 ? d / den : 0;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i][j - 1], dp[i - 1][j]);
    }
  }
  return dp[m][n];
}

// === Default persona (mirrors Phase 68 / 69 default template) ===

const DEFAULT_PERSONA = "You are a friendly chatbot. Answer the user's message. If any of the retrieved Q&A pairs below are clearly relevant, build on them. If none are relevant, answer from your own knowledge — don't force a connection. Keep replies short (1–3 sentences) and conversational. No markdown headings.";

// === The main bot function ===

/**
 * Given training pairs + config + a user message, produce a reply.
 *
 * Decision tree:
 *   1. Score the query against all training pairs (mode-dependent).
 *   2. If best score ≥ threshold → return the matched pair's output (retrieval).
 *   3. Else if generativeFallback → call the LLM with top-3 as context (generative).
 *   4. Else → return a canned "I don't know" reply (fallback).
 *
 * @param ownerUserId — the DeployedBot owner's user ID (passed to callAI for
 *   rate-limit attribution; the owner pays for the LLM call, not the visitor).
 */
export async function runBot(
  userMessage: string,
  trainingPairs: BotTrainingPair[],
  config: BotConfig,
  ownerUserId: string,
  knowledgeChunks: KnowledgeChunkForBot[] = [],
  plugins: Array<{ name: string; type: string; description: string; config: any; enabled: boolean }> = [],
  onPluginCalled?: (pluginName: string, success: boolean) => void,
): Promise<BotReply> {
  const started = Date.now();
  const normalized = normalizeText(userMessage);

  // Phase 73 — Plugin detection + execution.
  // Check if any enabled plugin is relevant to this message. If so, call it
  // BEFORE the retrieval/generation flow — the plugin result gets included
  // in the LLM context.
  let pluginResults: Array<{ name: string; output: string; success: boolean }> = [];
  if (plugins.length > 0) {
    try {
      const { detectRelevantPlugins, executePlugin } = await import("@/lib/plugins/executor");
      const relevant = detectRelevantPlugins(userMessage, plugins as any);
      if (relevant.length > 0) {
        // Execute up to 2 plugins (cap to avoid latency).
        const toCall = relevant.slice(0, 2);
        const results = await Promise.all(
          toCall.map((p) => executePlugin(p as any, userMessage)),
        );
        pluginResults = results.map((r) => ({
          name: r.pluginName,
          output: r.output,
          success: r.success,
        }));
        // Fire callbacks for stats updates.
        for (const r of results) {
          onPluginCalled?.(r.pluginName, r.success);
        }
      }
    } catch (e) {
      console.warn("[bot-engine] plugin execution failed:", e);
    }
  }

  // Hold out test pairs (mirrors ChatbotPlayground Phase 69).
  const trainPairs = trainingPairs.filter((p) => !p.isTest);
  const pairsForModel = trainPairs.length > 0 ? trainPairs : trainingPairs;

  // Score the query.
  let scores: Array<{ pair: BotTrainingPair; score: number }> = [];

  if (pairsForModel.length > 0) {
    const vocab = buildVocab(pairsForModel);
    const idf = computeIDF(pairsForModel, vocab);
    const inputVec = tfidfVector(normalized, vocab, idf);
    const tokens = tokenize(normalized);

    if (config.matchingMode === "tfidf" || config.matchingMode === "hybrid") {
      scores = pairsForModel.map((p) => {
        const v = tfidfVector(p.input, vocab, idf);
        return { pair: p, score: cosineSim(inputVec, v) };
      });
    } else if (config.matchingMode === "keyword") {
      const inputTokens = new Set(tokens);
      scores = pairsForModel.map((p) => {
        const pairTokens = new Set(tokenize(p.input));
        const overlap = Array.from(inputTokens).filter((t) => pairTokens.has(t)).length;
        return { pair: p, score: overlap / Math.max(inputTokens.size + pairTokens.size - overlap, 1) };
      });
    } else if (config.matchingMode === "fuzzy") {
      scores = pairsForModel.map((p) => {
        const dist = levenshtein(normalized, p.input.toLowerCase());
        const maxLen = Math.max(normalized.length, p.input.length);
        return { pair: p, score: 1 - dist / Math.max(maxLen, 1) };
      });
    }

    // Hybrid: blend TF-IDF + keyword.
    if (config.matchingMode === "hybrid") {
      const inputTokens = new Set(tokens);
      const keywordScores = pairsForModel.map((p) => {
        const pairTokens = new Set(tokenize(p.input));
        const overlap = Array.from(inputTokens).filter((t) => pairTokens.has(t)).length;
        return overlap / Math.max(inputTokens.size + pairTokens.size - overlap, 1);
      });
      scores = scores.map((s, i) => ({ ...s, score: s.score * 0.7 + keywordScores[i] * 0.3 }));
    }
  }

  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];
  const bestScore = best?.score ?? 0;
  const top3 = scores.slice(0, 3).map((s) => ({ input: s.pair.input, score: s.score }));

  // Phase 73.1 — RAG-first detection. Even when Q&A retrieval succeeds, if
  // the user is clearly asking about the knowledge base, OR the retrieval
  // score is marginal, skip the Q&A answer and run RAG + generative instead.
  const asksAboutKnowledge = /\b(knowledge|document|kb|wiki|manual|textbook|notes?|according to|what do you know|check your|search your)\b/i.test(userMessage);
  const marginalMatch = best && bestScore >= config.threshold && bestScore < config.threshold + 0.2;
  const shouldUseRag = knowledgeChunks.length > 0 && config.generativeFallback && (asksAboutKnowledge || marginalMatch);

  // Decision: retrieve / generate / fallback.
  if (best && bestScore >= config.threshold && !shouldUseRag) {
    return {
      reply: best.pair.output,
      source: "retrieval",
      confidence: bestScore,
      matchedInput: best.pair.input,
      topMatches: top3,
      responseMs: Date.now() - started,
    };
  }

  // Phase 72 — RAG retrieval from knowledge sources.
  // TF-IDF retrieve top-k chunks from the knowledge base. These get passed
  // to the LLM as additional context alongside the weak Q&A matches.
  let ragChunks: Array<{ text: string; score: number; sourceTitle?: string }> = [];
  if (knowledgeChunks.length > 0) {
    const chunkTexts = knowledgeChunks.map((c) => c.text);
    const chunkVocab = buildVocab(chunkTexts.map((t) => ({ input: t })));
    const chunkIdf = computeIDF(chunkTexts.map((t) => ({ input: t })), chunkVocab);
    const queryVec = tfidfVector(normalized, chunkVocab, chunkIdf);
    ragChunks = knowledgeChunks
      .map((c, i) => ({
        text: c.text,
        score: cosineSim(queryVec, tfidfVector(c.text, chunkVocab, chunkIdf)),
        sourceTitle: c.sourceTitle,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4) // top-4 chunks
      .filter((c) => c.score > 0.05); // drop zero-overlap chunks
  }

  // Generative fallback.
  if (config.generativeFallback) {
    const contextBlock = top3
      .map((s, i) => `Q${i + 1}: ${s.input}\nA${i + 1}: ${pairsForModel.find((p) => p.input === s.input)?.output ?? ""}`)
      .join("\n");
    const ragBlock = ragChunks.length > 0
      ? ragChunks.map((c, i) => `[Knowledge ${i + 1}]${c.sourceTitle ? ` (${c.sourceTitle}):` : ":"}\n${c.text}`).join("\n\n")
      : "";
    const pluginBlock = pluginResults.length > 0
      ? pluginResults.map((p) => `[Plugin: ${p.name}${p.success ? "" : " (failed)"}]\n${p.output}`).join("\n\n")
      : "";
    const persona = (config.personaPrompt?.trim() || DEFAULT_PERSONA);
    const messages: ChatMessage[] = [
      {
        role: "system",
        content: [
          persona,
          bestScore > 0
            ? `Best retrieval score was ${bestScore.toFixed(2)} (below the ${config.threshold} threshold), so treat the retrieved pairs as weak hints only.`
            : `No training examples matched at all.`,
          ragChunks.length > 0
            ? `${ragChunks.length} relevant knowledge chunks were retrieved — use these as primary context for your answer. Cite them as [Knowledge N] where N is the chunk number.`
            : "",
          pluginResults.length > 0
            ? `${pluginResults.length} plugin(s) were called and returned results — use these as factual data for your answer. Plugin results are authoritative (they come from external tools/APIs).`
            : "",
        ].filter(Boolean).join(" "),
      },
      {
        role: "user",
        content: [
          pluginBlock ? `Plugin results:\n${pluginBlock}\n` : "",
          ragBlock ? `Retrieved knowledge:\n${ragBlock}\n` : "",
          contextBlock ? `Retrieved Q&A (weak):\n${contextBlock}\n` : "",
          `User message: ${userMessage}`,
        ].filter(Boolean).join("\n"),
      },
    ];
    try {
      const reply = await callAI(messages, null, {
        userId: ownerUserId,
        route: "deployed-bot",
        alreadyCharged: false,
        temperature: 0.6,
      });
      const trimmed = (reply ?? "").trim();
      if (trimmed.length > 0) {
        return {
          reply: trimmed.slice(0, 4000),
          source: "generative",
          confidence: bestScore,
          matchedInput: null,
          topMatches: top3,
          responseMs: Date.now() - started,
          ragChunks,
        };
      }
    } catch (e) {
      console.warn("[bot-engine] generative fallback failed:", e);
    }
  }

  // Canned fallback.
  return {
    reply: "I'm not sure how to answer that. Could you rephrase, or add a training example for it?",
    source: "fallback",
    confidence: bestScore,
    matchedInput: null,
    topMatches: top3,
    responseMs: Date.now() - started,
    ragChunks,
  };
}

// === Slug + visitor-hash helpers ===

/**
 * Generate a URL-safe slug. 8 chars of base36 from a crypto-random buffer,
 * prefixed with a check digit so we can detect typos. Collision-resistant
 * enough for ~10M bots (48 bits of entropy).
 */
export function generateBotSlug(): string {
  const bytes = new Uint8Array(8);
  // Node 18+ global crypto; falls back to Math.random for older runtimes.
  if (typeof globalThis !== "undefined" && globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  // Take 8 chars, base36-encode to keep it short + URL-safe.
  const num = BigInt("0x" + hex);
  return num.toString(36).slice(0, 10).padStart(10, "0");
}

/** SHA-256 hash of the visitor IP — for unique-user counting only. */
export async function hashVisitorIp(ip: string): Promise<string> {
  if (!ip) return "";
  try {
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest("SHA-256", enc.encode(ip));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
  } catch {
    // Fallback for runtimes without SubtleCrypto (rare).
    return ip.slice(0, 32);
  }
}

/** Extract the visitor IP from a request — handles proxies. */
export function getVisitorIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
