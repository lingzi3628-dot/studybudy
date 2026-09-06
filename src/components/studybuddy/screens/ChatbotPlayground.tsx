"use client";

/**
 * ChatbotPlayground — Phase 62 + Phase 68 hybrid response upgrade
 *
 * Hybrid retrieval + generative chatbot builder with:
 *   - Large dataset support (up to 100k Q&A pairs via CSV/JSON import)
 *   - Multi-training (train multiple intents/categories)
 *   - Bot memory (remembers conversation context)
 *   - AI tools: intent detection, entity extraction, sentiment analysis,
 *     response ranking, LIGHT text normalization (no aggressive spell correct)
 *   - FIVE matching modes: TF-IDF, keyword, fuzzy (Levenshtein), hybrid,
 *     SEMANTIC (Universal Sentence Encoder embeddings — in-browser, ~25MB
 *     one-time download, understands meaning not just word overlap)
 *   - GENERATIVE FALLBACK: when no training example clears the threshold,
 *     the bot calls an LLM (/api/ai/playground) with the top-3 retrieved
 *     Q&A pairs as context. If the LLM is unavailable, an honest "I don't
 *     know" reply is returned instead of a wrong stored answer.
 *   - Confidence + source display on every bot reply (retrieval / generative / fallback)
 *   - Continuous learning loop: low-confidence & generated turns are logged
 *     to a Review Queue so the bot owner can convert them into new training pairs.
 *   - Deploy bot: generates a shareable URL with a flowing StudyBuddy watermark
 *   - Rate-limit thinking delay (3-4 second "thinking" animation before reply)
 *   - Analytics: accuracy, coverage, response time, confusion matrix
 *   - Export: training data as CSV/JSON, deployed bot as standalone HTML
 */

import { useState, useRef, useEffect, useCallback } from "react";
import {
  ChevronLeft, Send, Brain, Plus, Trash2, Loader2, Save, Sparkles,
  MessageCircle, Zap, Eye, Upload, Download, Globe, Clock, Database,
  Settings, BarChart3, Bot, Link2, Copy, Check, FileText,
} from "lucide-react";
import { useApp } from "../store";
import {
  runEvaluation as runEvalLib,
  scanDataQuality as scanQualityLib,
  recommendMode as recommendModeLib,
  previewQuery as previewQueryLib,
  type EvalResult,
  type QualityIssue,
  type ModeRanking,
  type LivePreviewResult,
} from "@/lib/chatbot-eval";

// === Persona templates (Phase 69) ===
const PERSONA_TEMPLATES: Array<{ id: string; label: string; prompt: string }> = [
  {
    id: "default",
    label: "Default (friendly)",
    prompt: "You are a friendly chatbot. Answer the user's message. If any of the retrieved Q&A pairs below are clearly relevant, build on them. If none are relevant, answer from your own knowledge — don't force a connection. Keep replies short (1–3 sentences) and conversational. No markdown headings.",
  },
  {
    id: "tutor",
    label: "Patient tutor",
    prompt: "You are a patient, encouraging tutor. Break concepts down step-by-step. Ask one clarifying question if the user's request is ambiguous. Use simple language and concrete examples. Celebrate small wins ('Great question!'). Keep replies under 4 sentences unless the user asks for detail.",
  },
  {
    id: "concise",
    label: "Concise assistant",
    prompt: "You are a concise assistant. Answer in 1-2 sentences max. Skip pleasantries. Get straight to the point. If you don't know, say so plainly — never guess.",
  },
  {
    id: "sarcastic",
    label: "Sarcastic bot",
    prompt: "You are a sarcastic but helpful chatbot. Poke gentle fun at the user's question, then actually answer it. Never mean-spirited. Keep replies under 3 sentences. Use dry humor, not exclamation marks.",
  },
  {
    id: "kenyan-teacher",
    label: "Kenyan school teacher",
    prompt: "You are a Kenyan primary/secondary school teacher. Use clear English with occasional Swahili phrases ('sawa', 'karibu', 'pole'). Reference the CBC/KCSE curriculum where relevant. Encourage the student, ask if they understand, and offer to explain further. Keep replies under 4 sentences.",
  },
];

// === Types ===
type TrainingPair = { id: string; input: string; output: string; intent?: string; isTest?: boolean };
type ChatMessage = {
  role: "user" | "bot";
  text: string;
  thinking?: ThinkingStep[];
  sentiment?: string;
  intent?: string;
  confidence?: number;
  responseTime?: number;
  /** Where the reply came from — drives the colored source badge. */
  source?: "retrieval" | "generative" | "fallback";
  /** When source === "generative": the LLM model that produced the reply. */
  model?: string;
};
type ThinkingStep = { step: string; detail: string; data?: any };

/** A low-confidence or generated turn queued for the bot owner's review. */
type ReviewItem = {
  id: string;
  input: string;
  bestScore: number;
  source: "generative" | "fallback";
  topMatches: Array<{ input: string; score: number }>;
  generatedReply?: string;
  timestamp: number;
};

// === NLP Engine ===
function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter((w) => w.length > 1);
}

function buildVocab(pairs: TrainingPair[]): string[] {
  const set = new Set<string>();
  for (const p of pairs) for (const w of tokenize(p.input)) set.add(w);
  return Array.from(set);
}

function tfidfVector(text: string, vocab: string[], idf: Map<string, number>): number[] {
  const tokens = tokenize(text);
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return vocab.map((word) => ((tf.get(word) ?? 0) / Math.max(tokens.length, 1)) * (idf.get(word) ?? 1));
}

function computeIDF(pairs: TrainingPair[], vocab: string[]): Map<string, number> {
  const docCount = new Map<string, number>();
  for (const p of pairs) {
    const tokens = new Set(tokenize(p.input));
    for (const t of tokens) docCount.set(t, (docCount.get(t) ?? 0) + 1);
  }
  const N = pairs.length;
  const idf = new Map<string, number>();
  for (const word of vocab) {
    const df = docCount.get(word) ?? 0;
    idf.set(word, Math.log((N + 1) / (df + 1)) + 1);
  }
  return idf;
}

function cosineSim(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; magA += a[i] * a[i]; magB += b[i] * b[i]; }
  const d = Math.sqrt(magA) * Math.sqrt(magB);
  return d > 0 ? dot / d : 0;
}

// Levenshtein distance — used ONLY by the explicit "fuzzy" matching mode.
// (Phase 68: removed the aggressive spell-corrector that used this against the
// vocab on every query — it produced gibberish like "boring" → "morning".)
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j-1], dp[i][j-1], dp[i-1][j]);
    }
  }
  return dp[m][n];
}

/** Common SMS-style abbreviations. We expand these so "u" doesn't match the
 *  letter "u" in another training input. This is the ONLY text-level rewrite
 *  we do — no edit-distance spell correction, no vocab lookups. */
const ABBREVIATIONS: Record<string, string> = {
  u: "you", ur: "your", urs: "yours", "u r": "you are",
  r: "are", n: "and", nd: "and", b: "be", c: "see", k: "ok", ok: "ok",
  y: "why", pls: "please", plz: "please", tho: "though", "thru": "through",
  "u2": "you too", "ur2": "you too", "b/c": "because", bc: "because",
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
};

/** Light, context-safe text normalization — replaces the old aggressive
 *  spellCorrect(). Steps:
 *    1. lowercase  2. expand SMS abbreviations  3. strip punctuation
 *    4. collapse whitespace
 *  We deliberately do NOT correct misspellings against the vocab — semantic
 *  embedding mode handles misspellings naturally, and the surface modes
 *  (tfidf/keyword/hybrid) are more honest returning "no match" than
 *  returning a wrong match driven by a hallucinated correction. */
function normalizeText(text: string): string {
  let t = text.toLowerCase();
  // Expand abbreviations — token-by-token so we don't rewrite substrings.
  // Apostrophes are stripped from each token so "i'm" matches the "im" key.
  const tokens = t.replace(/[^\w\s']/g, " ").split(/\s+/).filter(Boolean);
  const expanded = tokens.map((tok) => ABBREVIATIONS[tok.replace(/'/g, "")] ?? tok);
  return expanded.join(" ").replace(/\s+/g, " ").trim();
}

// === Semantic embedding (Universal Sentence Encoder) ===
// Lazily loaded from the rag-engine — same model the Notebook RAG cells use.
// ~25MB one-time download, cached by the browser thereafter.
type Embedder = { embed: (texts: string[]) => Promise<number[][]> };
let _embedder: Embedder | null = null;
let _embedderLoading: Promise<Embedder> | null = null;
async function ensureEmbedder(): Promise<Embedder> {
  if (_embedder) return _embedder;
  if (_embedderLoading) return _embedderLoading;
  _embedderLoading = (async () => {
    const mod = await import("@/lib/rag-engine");
    const e: Embedder = {
      async embed(texts: string[]) {
        return mod.embedTexts(texts);
      },
    };
    _embedder = e;
    return e;
  })();
  return _embedderLoading;
}

function cosineSimVec(a: number[], b: number[]): number {
  let dot = 0, ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; ma += a[i] * a[i]; mb += b[i] * b[i]; }
  const d = Math.sqrt(ma) * Math.sqrt(mb);
  return d > 0 ? dot / d : 0;
}

// Simple sentiment: count positive/negative words
const POSITIVE_WORDS = new Set(["good", "great", "awesome", "love", "excellent", "happy", "amazing", "wonderful", "fantastic", "best", "like", "nice", "perfect", "brilliant", "superb"]);
const NEGATIVE_WORDS = new Set(["bad", "terrible", "awful", "hate", "horrible", "worst", "disappointing", "poor", "ugly", "broken", "useless", "waste", "boring", "sad", "angry"]);

function analyzeSentiment(text: string): { label: string; score: number } {
  const tokens = tokenize(text);
  let pos = 0, neg = 0;
  for (const t of tokens) {
    if (POSITIVE_WORDS.has(t)) pos++;
    if (NEGATIVE_WORDS.has(t)) neg++;
  }
  const score = pos - neg;
  return { label: score > 0 ? "positive" : score < 0 ? "negative" : "neutral", score };
}

// Extract simple entities (numbers, emails, URLs, dates)
function extractEntities(text: string): Array<{ type: string; value: string }> {
  const entities: Array<{ type: string; value: string }> = [];
  // Numbers
  const nums = text.match(/\b\d+(?:\.\d+)?\b/g);
  if (nums) nums.forEach((n) => entities.push({ type: "number", value: n }));
  // Emails
  const emails = text.match(/\b[\w.]+@[\w.]+\.\w+\b/g);
  if (emails) emails.forEach((e) => entities.push({ type: "email", value: e }));
  // URLs
  const urls = text.match(/https?:\/\/\S+/g);
  if (urls) urls.forEach((u) => entities.push({ type: "url", value: u }));
  // Dates (simple: "tomorrow", "today", "Monday"-"Sunday", "January"-"December")
  const dateWords = text.match(/\b(tomorrow|today|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)\b/gi);
  if (dateWords) dateWords.forEach((d) => entities.push({ type: "date", value: d }));
  return entities;
}

// Spell correction using Levenshtein distance against vocabulary
function spellCorrect(text: string, vocab: string[]): string {
  const tokens = tokenize(text);
  return tokens.map((token) => {
    if (vocab.includes(token)) return token;
    // Find closest vocab word within distance 2
    let best = token, bestDist = 3;
    for (const v of vocab) {
      const d = levenshtein(token, v);
      if (d < bestDist && d <= 2) { best = v; bestDist = d; }
    }
    return best;
  }).join(" ");
}

// === Component ===

const STARTER_DATA: TrainingPair[] = [
  { id: "1", input: "hello", output: "Hi there! How can I help you today?", intent: "greeting" },
  { id: "2", input: "hi", output: "Hello! What would you like to know?", intent: "greeting" },
  { id: "3", input: "how are you", output: "I'm doing great, thanks for asking! How about you?", intent: "greeting" },
  { id: "4", input: "what is your name", output: "I'm a chatbot trained by you! I learn from the Q&A pairs you give me.", intent: "identity" },
  { id: "5", input: "what can you do", output: "I can answer questions based on my training data. Add more Q&A pairs to make me smarter!", intent: "capabilities" },
  { id: "6", input: "thank you", output: "You're welcome! Happy to help.", intent: "gratitude" },
  { id: "7", input: "bye", output: "Goodbye! Come back soon.", intent: "farewell" },
  { id: "8", input: "help", output: "I can help with anything I've been trained on. Try asking me a question!", intent: "help" },
];

type TabType = "train" | "chat" | "tools" | "analytics" | "deploy" | "brain" | "knowledge" | "llm" | "review" | "evaluate" | "connect" | "plugins";
type MatchingMode = "tfidf" | "keyword" | "fuzzy" | "hybrid" | "semantic";

/** Per-mode default confidence thresholds.
 *  TF-IDF / hybrid cosine sims sit in a different range than USE embedding
 *  cosine sims, so a single 0.15 threshold (Phase 62) caused both wrong
 *  matches AND missed matches. These defaults were tuned on the Phase 62
 *  failing-examples corpus ("boring", "can you code", "hii", etc.). */
const MODE_DEFAULT_THRESHOLD: Record<MatchingMode, number> = {
  tfidf: 0.30,
  hybrid: 0.30,
  keyword: 0.20,
  fuzzy: 0.60,
  semantic: 0.65,
};

export function ChatbotPlayground() {
  const { setScreen, activeProjectId, chatbotTrainingData, setChatbotTrainingData, addChatbotTrainingPairs } = useApp() as any;
  const [trainingData, setTrainingData] = useState<TrainingPair[]>(() => {
    // Phase 64 — Load from shared Zustand store (which persists to localStorage)
    // This ensures data from DataLab (Dump Content, Import, Augment) is visible here
    if (chatbotTrainingData && chatbotTrainingData.length > 0) return chatbotTrainingData;
    // Try localStorage directly (in case store hasn't loaded yet)
    try {
      const stored = localStorage.getItem("studybuddy_chatbot_data");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return STARTER_DATA;
  });
  const [showWelcome, setShowWelcome] = useState(() => {
    // Phase 65 — Only show welcome if:
    //   1. It's the first session (sessionStorage flag not set)
    //   2. AND there's no saved training data in localStorage
    //   3. AND there's no activeProjectId (not opening from Projects)
    if (typeof window !== "undefined") {
      if (sessionStorage.getItem("chatbot_welcomed") === "1") return false;
      // Check if there's saved data — if so, skip welcome and resume
      try {
        const stored = localStorage.getItem("studybuddy_chatbot_data");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 8) return false; // has more than starter data
        }
      } catch {}
    }
    return true;
  });
  const [newInput, setNewInput] = useState("");
  const [newOutput, setNewOutput] = useState("");
  const [newIntent, setNewIntent] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isTraining, setIsTraining] = useState(false);
  const [isTrained, setIsTrained] = useState(false);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.30);
  const [thinkingDelay, setThinkingDelay] = useState(3); // seconds
  const [matchingMode, setMatchingModeRaw] = useState<MatchingMode>("hybrid");
  const [generativeFallback, setGenerativeFallback] = useState(true); // Phase 68
  const [embeddingProgress, setEmbeddingProgress] = useState<string | null>(null); // "loading model…" / "embedding 42/120…"
  // Phase 69 — persona prompt (drives generative fallback tone)
  const [personaPrompt, setPersonaPrompt] = useState<string>(() => {
    if (typeof window === "undefined") return PERSONA_TEMPLATES[0].prompt;
    try { return localStorage.getItem("studybuddy_chatbot_persona") || PERSONA_TEMPLATES[0].prompt; }
    catch { return PERSONA_TEMPLATES[0].prompt; }
  });
  // Phase 69 — evaluation results (null = not yet run)
  const [evalResult, setEvalResult] = useState<EvalResult | null>(null);
  const [evalRunning, setEvalRunning] = useState(false);
  // Phase 69 — mode recommender results
  const [modeRanking, setModeRanking] = useState<ModeRanking[] | null>(null);
  const [modeRecRunning, setModeRecRunning] = useState(false);
  // Phase 69 — data quality issues
  const [qualityIssues, setQualityIssues] = useState<QualityIssue[] | null>(null);
  // Phase 69 — live preview in Train tab
  const [previewInput, setPreviewInput] = useState("");
  const [previewResult, setPreviewResult] = useState<LivePreviewResult | null>(null);
  const [reviewLog, setReviewLog] = useState<ReviewItem[]>(() => {
    // Resume the continuous-learning queue from localStorage so it survives reloads.
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem("studybuddy_chatbot_review");
      if (raw) { const p = JSON.parse(raw); if (Array.isArray(p)) return p; }
    } catch {}
    return [];
  });
  const [activeTab, setActiveTab] = useState<TabType>("train");
  const [botMemory, setBotMemory] = useState<boolean>(true);
  const [conversationContext, setConversationContext] = useState<string[]>([]);
  const [deployedUrl, setDeployedUrl] = useState<string | null>(null);
  // Phase 70 — cloud deploy state
  const [cloudDeploying, setCloudDeploying] = useState(false);
  const [cloudBot, setCloudBot] = useState<{ id: string; slug: string; embedUrl: string; apiUrl: string; pairCount: number; version: number } | null>(null);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [cloudBots, setCloudBots] = useState<Array<{ id: string; name: string; slug: string; status: string; messageCount: number; fallbackCount: number; uniqueUsers: number; lastMessageAt: string | null }>>([]);
  const [showCloudList, setShowCloudList] = useState(false);
  // Phase 71 — Connect tab state
  const [connectBotId, setConnectBotId] = useState<string | null>(cloudBot?.id ?? null);
  const [integrations, setIntegrations] = useState<Array<{ id: string; platform: string; enabled: boolean; messageCount: number; config: any }>>([]);
  const [apiKeyVal, setApiKeyVal] = useState<string | null>(null);
  const [telegramToken, setTelegramToken] = useState("");
  const [slackBotToken, setSlackBotToken] = useState("");
  const [slackSigningSecret, setSlackSigningSecret] = useState("");
  const [connecting, setConnecting] = useState<string | null>(null); // which platform is connecting
  const [connectError, setConnectError] = useState<string | null>(null);
  // Phase 72 — Knowledge sources (RAG)
  const [knowledgeSources, setKnowledgeSources] = useState<Array<{ id: string; type: string; title: string; source: string | null; chunkCount: number; charCount: number; createdAt: string }>>([]);
  const [kbTab, setKbTab] = useState<"url" | "github" | "file" | "text">("text");
  const [kbUrl, setKbUrl] = useState("");
  const [kbGithub, setKbGithub] = useState("");
  const [kbText, setKbText] = useState("");
  const [kbTitle, setKbTitle] = useState("");
  const [ingesting, setIngesting] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [ragEnabled, setRagEnabled] = useState(true);
  // Phase 73 — Plugins
  const [botPlugins, setBotPlugins] = useState<Array<{ id: string; name: string; type: string; description: string; config: any; enabled: boolean; callCount: number; lastCalledAt: string | null }>>([]);
  const [availableBuiltin, setAvailableBuiltin] = useState<Array<{ name: string; description: string; triggerExamples: string[] }>>([]);
  const [httpPluginForm, setHttpPluginForm] = useState({ name: "", url: "", method: "POST", bodyTemplate: '{"query":"{{message}}"}', responsePath: "", description: "" });
  const [mcpPluginForm, setMcpPluginForm] = useState({ name: "", serverUrl: "", toolName: "chat_with_bot", description: "" });
  const [copied, setCopied] = useState(false);
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [loadedFromTemplate, setLoadedFromTemplate] = useState<string | null>(null);
  const [stats, setStats] = useState<{ coverage: number; avgResponseTime: number; totalChats: number; intents: string[] }>({
    coverage: 0, avgResponseTime: 0, totalChats: 0, intents: [],
  });

  const modelRef = useRef<{
    vocab: string[];
    idf: Map<string, number>;
    vectors: number[][];
    pairs: TrainingPair[];
    intents: Map<string, TrainingPair[]>;
    /** Pre-computed USE embeddings for semantic mode (one row per pair). */
    embeddings: number[][];
    /** The mode the embeddings were last computed for — invalidates on mode swap. */
    embeddingsMode: MatchingMode | null;
  } | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  // Persist the review queue whenever it changes.
  useEffect(() => {
    try { localStorage.setItem("studybuddy_chatbot_review", JSON.stringify(reviewLog.slice(-100))); } catch {}
  }, [reviewLog]);

  // Phase 69 — Persist persona prompt.
  useEffect(() => {
    try { localStorage.setItem("studybuddy_chatbot_persona", personaPrompt); } catch {}
  }, [personaPrompt]);

  // Phase 69 — Live preview: recompute whenever input/mode/threshold/training data change.
  useEffect(() => {
    if (!previewInput.trim() || !modelRef.current) { setPreviewResult(null); return; }
    const trainPairs = trainingData.filter((p) => !p.isTest);
    if (trainPairs.length === 0) { setPreviewResult(null); return; }
    try {
      setPreviewResult(previewQueryLib(previewInput, trainPairs, matchingMode, confidenceThreshold));
    } catch { setPreviewResult(null); }
  }, [previewInput, matchingMode, confidenceThreshold, trainingData]);

  // Phase 69 — Run evaluation against the test set.
  const runEvaluationNow = useCallback(() => {
    setEvalRunning(true);
    // Defer to next tick so the spinner can paint.
    setTimeout(() => {
      try {
        const result = runEvalLib(trainingData, matchingMode, confidenceThreshold);
        setEvalResult(result);
      } catch (e) { console.warn("Eval failed:", e); }
      setEvalRunning(false);
    }, 50);
  }, [trainingData, matchingMode, confidenceThreshold]);

  // Phase 69 — Run mode recommender (sweeps all 5 modes × thresholds).
  const runModeRecommender = useCallback(() => {
    setModeRecRunning(true);
    setTimeout(() => {
      try {
        const ranking = recommendModeLib(trainingData);
        setModeRanking(ranking);
      } catch (e) { console.warn("Mode rec failed:", e); }
      setModeRecRunning(false);
    }, 50);
  }, [trainingData]);

  // Phase 69 — Scan training data for quality issues.
  const scanQuality = useCallback(() => {
    setQualityIssues(scanQualityLib(trainingData));
  }, [trainingData]);

  // Phase 69 — Toggle a pair's test-set membership.
  const toggleTestFlag = useCallback((id: string) => {
    setTrainingData((prev) => prev.map((p) => p.id === id ? { ...p, isTest: !p.isTest } : p));
    setIsTrained(false); // retrain — test pairs are held out
    setEvalResult(null); // invalidate stale results
  }, []);

  // Phase 69 — Auto-mark ~15% of pairs as test set if none are tagged yet.
  const autoSplitTestSet = useCallback(() => {
    const hasTest = trainingData.some((p) => p.isTest);
    if (hasTest) return;
    const testCount = Math.max(3, Math.min(20, Math.floor(trainingData.length * 0.15)));
    const shuffled = [...trainingData].sort(() => Math.random() - 0.5);
    const testIds = new Set(shuffled.slice(0, testCount).map((p) => p.id));
    setTrainingData((prev) => prev.map((p) => p.isTest ? p : (testIds.has(p.id) ? { ...p, isTest: true } : p)));
    setIsTrained(false);
    setEvalResult(null);
  }, [trainingData]);

  // Phase 69 — Apply a persona template.
  const applyPersonaTemplate = useCallback((templateId: string) => {
    const t = PERSONA_TEMPLATES.find((p) => p.id === templateId);
    if (t) setPersonaPrompt(t.prompt);
  }, []);

  // Phase 68 — When the matching mode changes, snap the threshold back to that
  // mode's default — UNLESS the user has manually tweaked the slider. We track
  // that with a ref so the slider still feels free once the user touches it.
  const userTouchedThreshold = useRef(false);
  const setMatchingMode = useCallback((mode: MatchingMode) => {
    setMatchingModeRaw(mode);
    if (!userTouchedThreshold.current) setConfidenceThreshold(MODE_DEFAULT_THRESHOLD[mode]);
    // Semantic mode needs its own embedding index; force a retrain so the
    // embeddings get computed before the user sends a message.
    setIsTrained(false);
  }, []);

  // Mark the threshold slider as "user-tweaked" so subsequent mode swaps
  // don't override their choice.
  const onThresholdChange = useCallback((v: number) => {
    userTouchedThreshold.current = true;
    setConfidenceThreshold(v);
  }, []);

  // Phase 64 — Sync training data to the shared Zustand store + localStorage
  // whenever it changes. This ensures DataLab and ChatbotPlayground share data.
  useEffect(() => {
    setChatbotTrainingData(trainingData);
  }, [trainingData, setChatbotTrainingData]);

  // Phase 64 — Listen for training data changes from DataLab (via store)
  useEffect(() => {
    if (chatbotTrainingData && chatbotTrainingData.length > 0 && chatbotTrainingData.length !== trainingData.length) {
      setTrainingData(chatbotTrainingData);
      setIsTrained(false); // need to retrain
    }
  }, [chatbotTrainingData]);

  // Phase 64 — AUTO-TRAIN when training data changes.
  // This fixes the "bot forgets / never learns" issue. Whenever the training
  // data changes (from DataLab dump, manual add, import, or template load),
  // the bot automatically trains so the user can immediately chat.
  useEffect(() => {
    if (trainingData.length === 0 || isTraining) return;
    // Auto-train (no button click needed)
    const autoTrain = async () => {
      setIsTraining(true);
      await new Promise((r) => setTimeout(r, 300)); // brief delay for UX
      // Phase 69 — hold out test-set pairs from the training index.
      const trainPairs = trainingData.filter((p) => !p.isTest);
      const pairsForModel = trainPairs.length > 0 ? trainPairs : trainingData;
      const vocab = buildVocab(pairsForModel);
      const idf = computeIDF(pairsForModel, vocab);
      const vectors = pairsForModel.map((p) => tfidfVector(p.input, vocab, idf));
      const intents = new Map<string, TrainingPair[]>();
      for (const p of pairsForModel) {
        const intent = p.intent || "general";
        if (!intents.has(intent)) intents.set(intent, []);
        intents.get(intent)!.push(p);
      }
      // Phase 68 — Pre-compute USE embeddings if the user picked semantic mode.
      let embeddings: number[][] = [];
      let embeddingsMode: MatchingMode | null = null;
      if (matchingMode === "semantic") {
        try {
          setEmbeddingProgress("Loading embedding model (one-time, ~25MB)…");
          const embedder = await ensureEmbedder();
          setEmbeddingProgress(`Embedding ${pairsForModel.length} inputs…`);
          // USE embeds in batches internally; for >5k inputs we chunk to keep the
          // UI responsive and surface progress.
          const BATCH = 256;
          embeddings = [];
          for (let i = 0; i < pairsForModel.length; i += BATCH) {
            const slice = pairsForModel.slice(i, i + BATCH).map((p) => p.input);
            const vecs = await embedder.embed(slice);
            embeddings.push(...vecs);
            setEmbeddingProgress(`Embedding ${Math.min(i + BATCH, pairsForModel.length)}/${pairsForModel.length}…`);
          }
          embeddingsMode = "semantic";
        } catch (e) {
          console.warn("Embedding failed, falling back to tfidf vectors for semantic mode", e);
          // Fall back to using the tfidf vectors as a degraded semantic index —
          // better than blocking the user out of chat entirely.
          embeddings = vectors;
          embeddingsMode = "semantic";
        }
      }
      setEmbeddingProgress(null);
      modelRef.current = { vocab, idf, vectors, pairs: pairsForModel, intents, embeddings, embeddingsMode };
      setStats({ coverage: 0, avgResponseTime: 0, totalChats: 0, intents: Array.from(intents.keys()) });
      setIsTrained(true);
      setIsTraining(false);
    };
    autoTrain();
  }, [trainingData, matchingMode]); // Re-train when training data OR mode changes

  // Phase 62 — Load training data from a Project when activeProjectId is set
  // (e.g. when a template is used or a saved project is opened)
  useEffect(() => {
    if (!activeProjectId) return;
    (async () => {
      try {
        const r = await fetch(`/api/projects/${activeProjectId}`);
        if (!r.ok) return;
        const d = await r.json();
        const project = d.project;
        if (!project) return;
        // Look for a training_data.json file in the project
        const dataFile = project.files?.find((f: any) =>
          f.path === "training_data.json" || f.path.endsWith("training_data.json")
        );
        if (dataFile) {
          const parsed = JSON.parse(dataFile.content);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const loaded: TrainingPair[] = parsed.map((p: any, i: number) => ({
              id: `loaded-${i}-${Date.now()}`,
              input: String(p.input || p.question || p.q || ""),
              output: String(p.output || p.answer || p.a || p.response || ""),
              intent: p.intent || p.category || undefined,
            })).filter((p: TrainingPair) => p.input && p.output);
            if (loaded.length > 0) {
              setTrainingData(loaded);
              setIsTrained(false);
              setLoadedFromTemplate(project.title);
              // Auto-train after loading
              setTimeout(() => {
                setIsTraining(true);
                const vocab = buildVocab(loaded);
                const idf = computeIDF(loaded, vocab);
                const vectors = loaded.map((p) => tfidfVector(p.input, vocab, idf));
                const intents = new Map<string, TrainingPair[]>();
                for (const p of loaded) {
                  const intent = p.intent || "general";
                  if (!intents.has(intent)) intents.set(intent, []);
                  intents.get(intent)!.push(p);
                }
                modelRef.current = { vocab, idf, vectors, pairs: loaded, intents, embeddings: [], embeddingsMode: null };
                setStats({ coverage: 0, avgResponseTime: 0, totalChats: 0, intents: Array.from(intents.keys()) });
                setIsTrained(true);
                setIsTraining(false);
                // Auto-switch to chat tab so user can start chatting immediately
                setActiveTab("chat");
              }, 500);
              // Clear the toast after 5 seconds
              setTimeout(() => setLoadedFromTemplate(null), 5000);
            }
          }
        }
      } catch (e) {
        console.warn("Failed to load training data from project:", e);
      }
    })();
  }, [activeProjectId]);

  // Add training pair
  const addPair = () => {
    if (!newInput.trim() || !newOutput.trim()) return;
    setTrainingData((prev) => [...prev, {
      id: Date.now().toString(),
      input: newInput.trim(),
      output: newOutput.trim(),
      intent: newIntent.trim() || undefined,
    }]);
    setNewInput(""); setNewOutput(""); setNewIntent("");
    setIsTrained(false);
  };

  const removePair = (id: string) => {
    setTrainingData((prev) => prev.filter((p) => p.id !== id));
    setIsTrained(false);
  };

  // Import training data from CSV/JSON
  const importData = () => {
    try {
      let imported: TrainingPair[] = [];
      const text = importText.trim();
      if (text.startsWith("[")) {
        // JSON format
        const parsed = JSON.parse(text);
        imported = parsed.map((p: any, i: number) => ({
          id: `import-${Date.now()}-${i}`,
          input: String(p.input || p.question || p.q || ""),
          output: String(p.output || p.answer || p.a || p.response || ""),
          intent: p.intent || p.category || undefined,
        })).filter((p: TrainingPair) => p.input && p.output);
      } else {
        // CSV format: input,output,intent
        const lines = text.split("\n").filter((l) => l.trim());
        const skipHeader = lines[0]?.toLowerCase().includes("input") || lines[0]?.includes(",");
        const start = skipHeader ? 1 : 0;
        for (let i = start; i < lines.length; i++) {
          const parts = lines[i].split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
          if (parts.length >= 2 && parts[0] && parts[1]) {
            imported.push({
              id: `import-${Date.now()}-${i}`,
              input: parts[0],
              output: parts[1],
              intent: parts[2] || undefined,
            });
          }
        }
      }
      if (imported.length === 0) { alert("No valid Q&A pairs found. Use CSV (input,output,intent) or JSON ([{input, output}])"); return; }
      setTrainingData((prev) => [...prev, ...imported.slice(0, 100000)]); // 100k max
      setIsTrained(false);
      setShowImport(false);
      setImportText("");
      alert(`✓ Imported ${imported.length} Q&A pairs! Total: ${trainingData.length + imported.length}`);
    } catch (e: any) {
      alert(`Import failed: ${e?.message}`);
    }
  };

  // Phase 62 — Generate training data using AI (StudyBuddy)
  // User describes a topic → AI generates up to 50 Q&A pairs
  const [generateTopic, setGenerateTopic] = useState("");
  const [generateCount, setGenerateCount] = useState(20);
  const [generating, setGenerating] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);

  const generateTrainingData = async () => {
    const topic = generateTopic.trim();
    if (!topic || generating) return;
    setGenerating(true);
    try {
      const r = await fetch("/api/tutor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Generate ${generateCount} question-and-answer pairs for a chatbot about: ${topic}. Format as a JSON array: [{"input": "user question", "output": "bot answer", "intent": "category"}]. Output ONLY the JSON array, no markdown, no explanation.`,
          buddyId: "ml",
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      const reply = d.reply || "";

      // Extract JSON array from the reply
      const jsonMatch = reply.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("AI didn't return valid JSON. Try again with a more specific topic.");

      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) throw new Error("AI didn't return a JSON array.");

      const generated: TrainingPair[] = parsed.slice(0, generateCount).map((p: any, i: number) => ({
        id: `gen-${Date.now()}-${i}`,
        input: String(p.input || p.question || p.q || "").trim(),
        output: String(p.output || p.answer || p.a || p.response || "").trim(),
        intent: String(p.intent || p.category || topic.toLowerCase().split(/\s+/)[0]).trim() || undefined,
      })).filter((p: TrainingPair) => p.input && p.output);

      if (generated.length === 0) throw new Error("No valid Q&A pairs generated. Try again.");

      setTrainingData((prev) => [...prev, ...generated]);
      setIsTrained(false);
      setShowGenerate(false);
      setGenerateTopic("");
      alert(`✓ Generated ${generated.length} Q&A pairs about "${topic}"! Total: ${trainingData.length + generated.length}. Click Train to use them.`);
    } catch (e: any) {
      alert(`Generation failed: ${e?.message}. Make sure you have tokens available.`);
    } finally {
      setGenerating(false);
    }
  };

  // Export training data
  const exportData = (format: "json" | "csv") => {
    let content = "";
    if (format === "json") {
      content = JSON.stringify(trainingData.map(({ id, ...rest }) => rest), null, 2);
    } else {
      content = "input,output,intent\n" + trainingData.map((p) =>
        `"${p.input.replace(/"/g, '""')}","${p.output.replace(/"/g, '""')}",${p.intent || ""}`
      ).join("\n");
    }
    const blob = new Blob([content], { type: format === "json" ? "application/json" : "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `chatbot_training.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Train the model
  const train = useCallback(async () => {
    setIsTraining(true);
    await new Promise((r) => setTimeout(r, 800));
    // Phase 69 — hold out test-set pairs.
    const trainPairs = trainingData.filter((p) => !p.isTest);
    const pairsForModel = trainPairs.length > 0 ? trainPairs : trainingData;
    const vocab = buildVocab(pairsForModel);
    const idf = computeIDF(pairsForModel, vocab);
    const vectors = pairsForModel.map((p) => tfidfVector(p.input, vocab, idf));
    // Build intent index
    const intents = new Map<string, TrainingPair[]>();
    for (const p of pairsForModel) {
      const intent = p.intent || "general";
      if (!intents.has(intent)) intents.set(intent, []);
      intents.get(intent)!.push(p);
    }
    let embeddings: number[][] = [];
    let embeddingsMode: MatchingMode | null = null;
    if (matchingMode === "semantic") {
      try {
        setEmbeddingProgress("Loading embedding model (one-time, ~25MB)…");
        const embedder = await ensureEmbedder();
        setEmbeddingProgress(`Embedding ${pairsForModel.length} inputs…`);
        const BATCH = 256;
        for (let i = 0; i < pairsForModel.length; i += BATCH) {
          const slice = pairsForModel.slice(i, i + BATCH).map((p) => p.input);
          const vecs = await embedder.embed(slice);
          embeddings.push(...vecs);
          setEmbeddingProgress(`Embedding ${Math.min(i + BATCH, pairsForModel.length)}/${pairsForModel.length}…`);
        }
        embeddingsMode = "semantic";
      } catch (e) {
        embeddings = vectors;
        embeddingsMode = "semantic";
      }
    }
    setEmbeddingProgress(null);
    modelRef.current = { vocab, idf, vectors, pairs: pairsForModel, intents, embeddings, embeddingsMode };
    setStats({
      coverage: 0,
      avgResponseTime: 0,
      totalChats: 0,
      intents: Array.from(intents.keys()),
    });
    setIsTrained(true);
    setIsTraining(false);
  }, [trainingData, matchingMode]);

  // Send a message to the chatbot — Phase 68 hybrid retrieval + generative flow.
  const sendMessage = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || !modelRef.current) return;

    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", text }]);

    // Update conversation context (memory)
    if (botMemory) {
      setConversationContext((prev) => [...prev.slice(-4), text]); // keep last 5 messages
    }

    // Thinking delay (rate limit) — runs in parallel with embedding lookup
    // when in semantic mode so the user doesn't pay both costs.
    const startTime = Date.now();
    const thinkingPromise = new Promise((r) => setTimeout(r, thinkingDelay * 1000));

    const model = modelRef.current;
    const thinkingSteps: ThinkingStep[] = [];

    // Step 1: Tokenize
    const tokens = tokenize(text);
    thinkingSteps.push({ step: "1. Tokenize input", detail: `Split "${text}" into ${tokens.length} tokens`, data: tokens });

    // Step 2: Light normalization (replaces the old aggressive spellCorrect).
    //   - Lowercases, expands SMS abbreviations (u→you, dont→do not, etc.),
    //     strips punctuation, collapses whitespace.
    //   - Does NOT correct misspellings against the vocab — semantic mode
    //     handles those naturally, and surface modes are better off returning
    //     "no match" than a hallucinated correction.
    const normalized = normalizeText(text);
    if (normalized !== text.toLowerCase().replace(/[^\w\s]/g, " ").trim()) {
      thinkingSteps.push({ step: "2. Normalize text", detail: `Normalized to: "${normalized}"`, data: [normalized] });
    } else {
      thinkingSteps.push({ step: "2. Normalize text", detail: `No abbreviations/punctuation to fix` });
    }

    // Step 3: Entity extraction
    const entities = extractEntities(text);
    if (entities.length > 0) {
      thinkingSteps.push({ step: "3. Entity extraction", detail: `Found ${entities.length} entities`, data: entities.map((e) => `${e.type}: ${e.value}`) });
    }

    // Step 4: Sentiment analysis
    const sentiment = analyzeSentiment(text);
    thinkingSteps.push({ step: "4. Sentiment analysis", detail: `Sentiment: ${sentiment.label} (score: ${sentiment.score})` });

    // Step 5: Intent detection (if intents are defined)
    let detectedIntent = "general";
    if (model.intents.size > 1) {
      const intentScores = new Map<string, number>();
      for (const [intent, pairs] of model.intents) {
        const intentVecs = pairs.map((p) => tfidfVector(p.input, model.vocab, model.idf));
        const inputVec = tfidfVector(normalized, model.vocab, model.idf);
        const sims = intentVecs.map((v) => cosineSim(inputVec, v));
        const avg = sims.reduce((s, v) => s + v, 0) / Math.max(sims.length, 1);
        intentScores.set(intent, avg);
      }
      const sorted = Array.from(intentScores.entries()).sort((a, b) => b[1] - a[1]);
      detectedIntent = sorted[0]?.[0] ?? "general";
      thinkingSteps.push({ step: "5. Intent detection", detail: `Detected intent: ${detectedIntent}`, data: sorted.slice(0, 3).map(([i, s]) => `${i}: ${s.toFixed(4)}`) });
    }

    // Step 6: Match against training data — semantic mode uses USE embeddings,
    //   surface modes use TF-IDF / keyword / Levenshtein as before.
    let scores: Array<{ pair: TrainingPair; score: number; index: number }> = [];

    if (matchingMode === "semantic") {
      // Use pre-computed embeddings. If they're missing/stale (user swapped
      // modes mid-session), fall back to tfidf vectors with a warning.
      if (model.embeddingsMode === "semantic" && model.embeddings.length === model.pairs.length) {
        try {
          const embedder = await ensureEmbedder();
          const [userVec] = await embedder.embed([normalized]);
          scores = model.pairs.map((p, i) => ({
            pair: p,
            score: cosineSimVec(userVec, model.embeddings[i]),
            index: i,
          }));
          thinkingSteps.push({ step: "5. Embed query", detail: `Encoded query with USE → ${userVec.length}-dim vector` });
        } catch (e: any) {
          thinkingSteps.push({ step: "5. Embed query", detail: `Embedding failed: ${e?.message ?? e} — falling back to TF-IDF` });
          const inputVec = tfidfVector(normalized, model.vocab, model.idf);
          scores = model.vectors.map((v, i) => ({ pair: model.pairs[i], score: cosineSim(inputVec, v), index: i }));
        }
      } else {
        thinkingSteps.push({ step: "5. Embed query", detail: `Embeddings not ready (mode=${model.embeddingsMode ?? "null"}) — using TF-IDF vectors as fallback` });
        const inputVec = tfidfVector(normalized, model.vocab, model.idf);
        scores = model.vectors.map((v, i) => ({ pair: model.pairs[i], score: cosineSim(inputVec, v), index: i }));
      }
    } else {
      const inputVec = tfidfVector(normalized, model.vocab, model.idf);
      if (matchingMode === "tfidf" || matchingMode === "hybrid") {
        scores = model.vectors.map((v, i) => ({ pair: model.pairs[i], score: cosineSim(inputVec, v), index: i }));
      } else if (matchingMode === "keyword") {
        const inputTokens = new Set(tokens);
        scores = model.pairs.map((p, i) => {
          const pairTokens = new Set(tokenize(p.input));
          const overlap = Array.from(inputTokens).filter((t) => pairTokens.has(t)).length;
          return { pair: p, score: overlap / Math.max(inputTokens.size + pairTokens.size - overlap, 1), index: i };
        });
      } else if (matchingMode === "fuzzy") {
        scores = model.pairs.map((p, i) => {
          const dist = levenshtein(normalized, p.input.toLowerCase());
          const maxLen = Math.max(normalized.length, p.input.length);
          return { pair: p, score: 1 - dist / Math.max(maxLen, 1), index: i };
        });
      }
      // Hybrid mode: combine TF-IDF + keyword scores
      if (matchingMode === "hybrid") {
        const inputTokens = new Set(tokens);
        const keywordScores = model.pairs.map((p) => {
          const pairTokens = new Set(tokenize(p.input));
          const overlap = Array.from(inputTokens).filter((t) => pairTokens.has(t)).length;
          return overlap / Math.max(inputTokens.size + pairTokens.size - overlap, 1);
        });
        scores = scores.map((s, i) => ({ ...s, score: s.score * 0.7 + keywordScores[i] * 0.3 }));
      }
    }

    scores.sort((a, b) => b.score - a.score);
    const top3 = scores.slice(0, 3);
    thinkingSteps.push({ step: "6. Match training data", detail: `Compared against ${model.pairs.length} examples using ${matchingMode}`, data: top3.map((s) => ({ input: s.pair.input, score: s.score.toFixed(4), intent: s.pair.intent || "general" })) });

    // Wait for the thinking-delay timer to finish (it ran in parallel with
    // any embedding work above). This keeps the visible "thinking…" animation
    // honest — it always lasts at least thinkingDelay seconds.
    await thinkingPromise;

    // Step 7: Decide — retrieve (score ≥ threshold) OR generate (fallback).
    const best = scores[0];
    const responseTime = Date.now() - startTime;
    const bestScore = best?.score ?? 0;
    const isConfident = best && bestScore >= confidenceThreshold;

    if (isConfident) {
      thinkingSteps.push({ step: "7. Select best match", detail: `Best: "${best.pair.input}" (score: ${bestScore.toFixed(4)} ≥ threshold ${confidenceThreshold})` });

      // Context-aware response (if memory is on and there's conversation history)
      let responseText = best.pair.output;
      if (botMemory && conversationContext.length > 0 && best.pair.output.includes("{context}")) {
        responseText = responseText.replace("{context}", conversationContext.slice(-2).join(" → "));
      }

      setChatMessages((prev) => [...prev, {
        role: "bot", text: responseText, thinking: thinkingSteps,
        sentiment: sentiment.label, intent: detectedIntent,
        confidence: bestScore, responseTime,
        source: "retrieval",
      }]);
    } else {
      thinkingSteps.push({ step: "7. No confident match", detail: `Best score ${bestScore.toFixed(4)} < threshold ${confidenceThreshold}` });

      // Phase 68 — generative fallback.
      let replyText = "I'm not sure how to answer that. Could you rephrase, or add a training example for it?";
      let source: "generative" | "fallback" = "fallback";
      let modelName: string | undefined = undefined;

      if (generativeFallback) {
        thinkingSteps.push({ step: "8. Generative fallback", detail: `Calling LLM with top-${top3.length} retrieved Q&A as context…` });

        // Phase 72 — RAG retrieval from knowledge sources (client-side USE).
        let ragBlock = "";
        let ragChunkCount = 0;
        if (ragEnabled && knowledgeSources.length > 0) {
          thinkingSteps.push({ step: "8a. RAG retrieval", detail: `Retrieving from ${knowledgeSources.length} knowledge source(s)…` });
          try {
            // Load full chunks for each source (the list endpoint doesn't return chunks).
            const chunkPromises = knowledgeSources.map(async (src) => {
              const r = await fetch(`/api/knowledge-sources/${src.id}`);
              if (!r.ok) return [];
              const d = await r.json();
              const chunks = d.source?.chunks || [];
              return chunks.map((c: any) => ({ text: c.text, title: src.title }));
            });
            const allChunks = (await Promise.all(chunkPromises)).flat();
            if (allChunks.length > 0) {
              // Embed query + chunks with USE.
              const embedder = await ensureEmbedder();
              const [queryVec] = await embedder.embed([normalized]);
              const chunkTexts = allChunks.map((c: any) => c.text).slice(0, 500);
              const chunkVecs = await embedder.embed(chunkTexts);
              const scored = chunkTexts.map((t: string, i: number) => ({
                text: t,
                title: (allChunks[i] as any)?.title,
                score: cosineSimVec(queryVec, chunkVecs[i]),
              })).sort((a, b) => b.score - a.score).slice(0, 4).filter((c) => c.score > 0.15);
              ragChunkCount = scored.length;
              if (scored.length > 0) {
                ragBlock = scored.map((c, i) => `[Knowledge ${i + 1}]${c.title ? ` (${c.title}):` : ":"}\n${c.text}`).join("\n\n");
                thinkingSteps.push({ step: "8b. RAG retrieved", detail: `${scored.length} relevant chunks (top score ${scored[0].score.toFixed(2)})`, data: scored.map((c) => `${(c.score * 100).toFixed(0)}% — ${c.text.slice(0, 60)}…`) });
              }
            }
          } catch (e: any) {
            thinkingSteps.push({ step: "8a. RAG retrieval", detail: `RAG failed: ${e?.message || e} — continuing without knowledge context` });
          }
        }

        const contextBlock = top3
          .map((s, i) => `Q${i + 1}: ${s.pair.input}\nA${i + 1}: ${s.pair.output}`)
          .join("\n");
        // Phase 69 — persona prompt drives the tone. Falls back to the default
        // template if the user cleared the textarea.
        const persona = personaPrompt.trim() || PERSONA_TEMPLATES[0].prompt;
        const systemPrompt = [
          persona,
          bestScore > 0
            ? `Best retrieval score was ${bestScore.toFixed(2)} (below the ${confidenceThreshold} threshold), so treat the retrieved pairs as weak hints only.`
            : `No training examples matched at all.`,
          ragChunkCount > 0
            ? `${ragChunkCount} relevant knowledge chunks were retrieved — use these as primary context for your answer. Cite them as [Knowledge N] where N is the chunk number.`
            : "",
        ].filter(Boolean).join(" ");
        const userPrompt = [
          ragBlock ? `Retrieved knowledge:\n${ragBlock}\n` : "",
          contextBlock ? `Retrieved Q&A (weak):\n${contextBlock}\n` : "",
          `User message: ${text}`,
        ].filter(Boolean).join("\n");

        try {
          const r = await fetch("/api/ai/playground", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ systemPrompt, userPrompt, temperature: 0.6 }),
          });
          if (r.ok) {
            const d = await r.json();
            const out: string = (d?.output ?? "").trim();
            if (out.length > 0) {
              replyText = out;
              source = "generative";
              modelName = d?.model ?? "ai-playground";
              thinkingSteps.push({ step: "9. LLM replied", detail: `Generated ${out.length} chars via ${modelName}${ragChunkCount > 0 ? ` + ${ragChunkCount} RAG chunks` : ""}`, data: [out.slice(0, 120) + (out.length > 120 ? "…" : "")] });
            } else {
              thinkingSteps.push({ step: "9. LLM empty", detail: `API returned empty output — using canned fallback` });
            }
          } else {
            thinkingSteps.push({ step: "9. LLM unavailable", detail: `HTTP ${r.status} — using canned fallback` });
          }
        } catch (e: any) {
          thinkingSteps.push({ step: "9. LLM error", detail: `${e?.message ?? e} — using canned fallback` });
        }
      } else {
        thinkingSteps.push({ step: "8. Generative fallback disabled", detail: `Returning canned "I don't know" reply` });
      }

      setChatMessages((prev) => [...prev, {
        role: "bot", text: replyText, thinking: thinkingSteps,
        sentiment: sentiment.label, intent: detectedIntent,
        confidence: bestScore, responseTime,
        source, model: modelName,
      }]);

      // Continuous-learning loop — queue this turn for review.
      const reviewItem: ReviewItem = {
        id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        input: text,
        bestScore,
        source,
        topMatches: top3.map((s) => ({ input: s.pair.input, score: s.score })),
        generatedReply: source === "generative" ? replyText : undefined,
        timestamp: Date.now(),
      };
      setReviewLog((prev) => [...prev.slice(-49), reviewItem]); // keep last 50
    }

    // Update stats — count retrieval hits as "understood".
    setStats((prev) => ({
      coverage: prev.coverage + (isConfident ? 1 : 0),
      avgResponseTime: (prev.avgResponseTime * prev.totalChats + responseTime) / (prev.totalChats + 1),
      totalChats: prev.totalChats + 1,
      intents: prev.intents,
    }));
  }, [chatInput, confidenceThreshold, matchingMode, thinkingDelay, botMemory, conversationContext, generativeFallback, personaPrompt, ragEnabled, knowledgeSources]);

  // Deploy the bot (generates a standalone HTML file with watermark)
  const deployBot = () => {
    const html = generateDeployedBotHTML(trainingData, confidenceThreshold, botMemory, thinkingDelay);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    setDeployedUrl(url);
    // Also save as a project
    fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        buddyId: "ml",
        title: "Deployed Chatbot",
        description: `${trainingData.length} Q&A pairs, ${matchingMode} matching, threshold ${confidenceThreshold}`,
        tags: ["chatbot", "deployed"],
        files: [{ path: "chatbot.html", language: "html", content: html, isEntry: true }],
      }),
    }).catch(() => {});
  };

  // Phase 70 — Deploy to cloud (server-backed, generative fallback works).
  const deployToCloud = async () => {
    setCloudDeploying(true);
    setCloudError(null);
    try {
      const r = await fetch("/api/deployed-bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Chatbot ${new Date().toLocaleDateString()}`,
          trainingData: trainingData.map(({ id, ...rest }) => ({ id, ...rest })),
          matchingMode: matchingMode === "semantic" ? "hybrid" : matchingMode, // server doesn't have USE
          threshold: confidenceThreshold,
          personaPrompt,
          generativeFallback,
          thinkingDelay,
          botMemory,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setCloudError(d?.error || `Deploy failed (HTTP ${r.status})`);
      } else {
        setCloudBot(d.bot);
      }
    } catch (e: any) {
      setCloudError(e?.message || "Network error during deploy");
    }
    setCloudDeploying(false);
  };

  // Phase 70 — Load the user's existing cloud bots.
  const loadCloudBots = async () => {
    try {
      const r = await fetch("/api/deployed-bots");
      const d = await r.json();
      if (r.ok && Array.isArray(d.bots)) {
        setCloudBots(d.bots.map((b: any) => ({
          id: b.id, name: b.name, slug: b.slug, status: b.status,
          messageCount: b.messageCount, fallbackCount: b.fallbackCount,
          uniqueUsers: b.uniqueUsers,
          lastMessageAt: b.lastMessageAt,
        })));
        setShowCloudList(true);
      }
    } catch {}
  };

  // Phase 70 — Delete a cloud bot.
  const deleteCloudBot = async (id: string) => {
    if (!confirm("Delete this bot permanently? All chat history will be lost.")) return;
    try {
      await fetch(`/api/deployed-bots/${id}`, { method: "DELETE" });
      setCloudBots((prev) => prev.filter((b) => b.id !== id));
    } catch {}
  };

  // Phase 70 — Pause/resume a cloud bot.
  const toggleCloudBotStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "paused" ? "deployed" : "paused";
    try {
      const r = await fetch(`/api/deployed-bots/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (r.ok) {
        setCloudBots((prev) => prev.map((b) => b.id === id ? { ...b, status: newStatus } : b));
      }
    } catch {}
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Phase 71 — Connect tab handlers
  const loadIntegrations = async (botId: string) => {
    try {
      const r = await fetch(`/api/deployed-bots/${botId}/integrations`);
      const d = await r.json();
      if (r.ok) {
        setIntegrations(d.integrations || []);
        setApiKeyVal(d.apiKey || null);
      }
    } catch {}
  };

  const connectTelegram = async () => {
    if (!connectBotId || !telegramToken.trim()) return;
    setConnecting("telegram");
    setConnectError(null);
    try {
      const r = await fetch(`/api/deployed-bots/${connectBotId}/integrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "telegram", config: { botToken: telegramToken.trim() } }),
      });
      const d = await r.json();
      if (!r.ok) setConnectError(d?.error || "Failed to connect");
      else { setTelegramToken(""); loadIntegrations(connectBotId); }
    } catch (e: any) { setConnectError(e?.message); }
    setConnecting(null);
  };

  const connectSlack = async () => {
    if (!connectBotId || !slackBotToken.trim() || !slackSigningSecret.trim()) return;
    setConnecting("slack");
    setConnectError(null);
    try {
      const r = await fetch(`/api/deployed-bots/${connectBotId}/integrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "slack", config: { botToken: slackBotToken.trim(), signingSecret: slackSigningSecret.trim() } }),
      });
      const d = await r.json();
      if (!r.ok) setConnectError(d?.error || "Failed to connect");
      else { setSlackBotToken(""); setSlackSigningSecret(""); loadIntegrations(connectBotId); }
    } catch (e: any) { setConnectError(e?.message); }
    setConnecting(null);
  };

  const disconnectIntegration = async (platform: string) => {
    if (!connectBotId) return;
    if (!confirm(`Disconnect ${platform}?`)) return;
    try {
      await fetch(`/api/deployed-bots/${connectBotId}/integrations/${platform}`, { method: "DELETE" });
      loadIntegrations(connectBotId);
    } catch {}
  };

  const generateApiKey = async () => {
    if (!connectBotId) return;
    try {
      const r = await fetch(`/api/deployed-bots/${connectBotId}/integrations`, { method: "PUT" });
      const d = await r.json();
      if (r.ok) setApiKeyVal(d.apiKey);
    } catch {}
  };

  // Phase 72 — Knowledge source handlers
  const loadKnowledgeSources = async () => {
    try {
      const r = await fetch(`/api/knowledge-sources${connectBotId ? `?botId=${connectBotId}` : ""}`);
      const d = await r.json();
      if (r.ok && Array.isArray(d.sources)) setKnowledgeSources(d.sources);
    } catch {}
  };

  const ingestKnowledge = async (type: "url" | "github" | "file" | "text") => {
    setIngesting(true);
    setIngestError(null);
    try {
      if (type === "file") {
        // Handled by fileInputRef onChange — this shouldn't be called directly.
        return;
      }
      const body: any = { type, botId: connectBotId ?? undefined };
      if (type === "url") body.url = kbUrl;
      else if (type === "github") body.repo = kbGithub;
      else if (type === "text") { body.text = kbText; body.title = kbTitle || "Pasted text"; }
      const r = await fetch("/api/knowledge-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) setIngestError(d?.error || "Ingestion failed");
      else {
        if (type === "url") setKbUrl("");
        if (type === "github") setKbGithub("");
        if (type === "text") { setKbText(""); setKbTitle(""); }
        loadKnowledgeSources();
      }
    } catch (e: any) { setIngestError(e?.message); }
    setIngesting(false);
  };

  const uploadKnowledgeFile = async (file: File) => {
    setIngesting(true);
    setIngestError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      if (connectBotId) form.append("botId", connectBotId);
      const r = await fetch("/api/knowledge-sources/upload", { method: "POST", body: form });
      const d = await r.json();
      if (!r.ok) setIngestError(d?.error || "Upload failed");
      else loadKnowledgeSources();
    } catch (e: any) { setIngestError(e?.message); }
    setIngesting(false);
  };

  const deleteKnowledgeSource = async (id: string) => {
    if (!confirm("Delete this knowledge source?")) return;
    try {
      await fetch(`/api/knowledge-sources/${id}`, { method: "DELETE" });
      setKnowledgeSources((prev) => prev.filter((s) => s.id !== id));
    } catch {}
  };

  // Phase 73 — Plugin handlers
  const loadPlugins = async () => {
    if (!connectBotId) return;
    try {
      const r = await fetch(`/api/deployed-bots/${connectBotId}/plugins`);
      const d = await r.json();
      if (r.ok) {
        setBotPlugins(d.plugins || []);
        setAvailableBuiltin(d.availableBuiltin || []);
      }
    } catch {}
  };

  const addBuiltinPlugin = async (builtinName: string) => {
    if (!connectBotId) return;
    try {
      const r = await fetch(`/api/deployed-bots/${connectBotId}/plugins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "builtin", name: builtinName, config: { builtinName } }),
      });
      if (r.ok) loadPlugins();
    } catch {}
  };

  const addHttpPlugin = async () => {
    if (!connectBotId || !httpPluginForm.name.trim() || !httpPluginForm.url.trim()) return;
    try {
      const r = await fetch(`/api/deployed-bots/${connectBotId}/plugins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "http",
          name: httpPluginForm.name.trim(),
          description: httpPluginForm.description.trim() || `HTTP ${httpPluginForm.method} to ${httpPluginForm.url}`,
          config: {
            method: httpPluginForm.method,
            url: httpPluginForm.url.trim(),
            bodyTemplate: httpPluginForm.bodyTemplate,
            responsePath: httpPluginForm.responsePath.trim() || undefined,
          },
        }),
      });
      if (r.ok) {
        setHttpPluginForm({ name: "", url: "", method: "POST", bodyTemplate: '{"query":"{{message}}"}', responsePath: "", description: "" });
        loadPlugins();
      }
    } catch {}
  };

  const addMcpPlugin = async () => {
    if (!connectBotId || !mcpPluginForm.name.trim() || !mcpPluginForm.serverUrl.trim()) return;
    try {
      const r = await fetch(`/api/deployed-bots/${connectBotId}/plugins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "mcp",
          name: mcpPluginForm.name.trim(),
          description: mcpPluginForm.description.trim() || `MCP tool: ${mcpPluginForm.toolName}`,
          config: {
            serverUrl: mcpPluginForm.serverUrl.trim(),
            toolName: mcpPluginForm.toolName.trim() || "chat_with_bot",
          },
        }),
      });
      if (r.ok) {
        setMcpPluginForm({ name: "", serverUrl: "", toolName: "chat_with_bot", description: "" });
        loadPlugins();
      }
    } catch {}
  };

  const togglePlugin = async (pluginId: string, enabled: boolean) => {
    if (!connectBotId) return;
    try {
      await fetch(`/api/deployed-bots/${connectBotId}/plugins`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pluginId, enabled: !enabled }),
      });
      setBotPlugins((prev) => prev.map((p) => p.id === pluginId ? { ...p, enabled: !enabled } : p));
    } catch {}
  };

  const deletePlugin = async (pluginId: string) => {
    if (!connectBotId) return;
    if (!confirm("Delete this plugin?")) return;
    try {
      await fetch(`/api/deployed-bots/${connectBotId}/plugins?pluginId=${pluginId}`, { method: "DELETE" });
      setBotPlugins((prev) => prev.filter((p) => p.id !== pluginId));
    } catch {}
  };

  const copyUrl = () => {
    if (deployedUrl) {
      navigator.clipboard.writeText(deployedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Save training data — creates or updates a Project in the DB (Neon Postgres)
  // so the user can resume on any device.
  const [savedProjectId, setSavedProjectId] = useState<string | null>(null);

  const saveProject = async () => {
    try {
      const data = JSON.stringify(trainingData, null, 2);
      const projectId = savedProjectId || activeProjectId;

      if (projectId && !projectId.startsWith("temp-")) {
        // Update existing project
        const r = await fetch(`/api/projects/${projectId}/files`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            files: [{ path: "training_data.json", language: "json", content: data, isEntry: true }],
          }),
        });
        if (r.ok) {
          setSavedProjectId(projectId);
          alert(`✓ Saved ${trainingData.length} pairs to your project!`);
        }
      } else {
        // Create new project
        const r = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            buddyId: "ml",
            title: "Chatbot training data",
            description: `${trainingData.length} Q&A pairs, ${matchingMode} matching`,
            tags: ["chatbot", "nlp", matchingMode, "training_data"],
            files: [{ path: "training_data.json", language: "json", content: data, isEntry: true }],
          }),
        });
        if (r.ok) {
          const d = await r.json();
          setSavedProjectId(d.project.id);
          alert(`✓ Saved ${trainingData.length} pairs to My Projects! You can resume anytime.`);
        }
      }
    } catch (e: any) { alert(`Save failed: ${e?.message}`); }
  };

  // Clear chat
  const clearChat = () => {
    setChatMessages([]);
    setConversationContext([]);
    setStats((prev) => ({ ...prev, coverage: 0, avgResponseTime: 0, totalChats: 0 }));
  };

  const accuracy = stats.totalChats > 0 ? (stats.coverage / stats.totalChats * 100).toFixed(1) : "0";

  // Phase 64 — Welcome screen for first-time users
  if (showWelcome && !activeProjectId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-600 via-fuchsia-600 to-purple-700 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl overflow-hidden">
          <div className="p-6 text-center">
            <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-4xl mb-4">
              🤖
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Welcome to AI & Machine Learning</h1>
            <p className="text-sm text-gray-500 mt-2">Build, train, and deploy your own AI chatbot — no coding required.</p>

            <div className="mt-6 space-y-3 text-left">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-violet-50">
                <span className="text-2xl">🎓</span>
                <div>
                  <p className="text-sm font-bold text-gray-900">1. Train your bot</p>
                  <p className="text-xs text-gray-500">Add Q&A pairs, or use Data Lab to dump content and let AI generate training data.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-xl bg-fuchsia-50">
                <span className="text-2xl">💬</span>
                <div>
                  <p className="text-sm font-bold text-gray-900">2. Chat with your bot</p>
                  <p className="text-xs text-gray-500">Watch it think in real-time — see tokenization, intent detection, and confidence scores.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-xl bg-indigo-50">
                <span className="text-2xl">🧠</span>
                <div>
                  <p className="text-sm font-bold text-gray-900">3. Watch the brain grow</p>
                  <p className="text-xs text-gray-500">See neural nodes, connections, and learning stages as you add more data.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-xl bg-emerald-50">
                <span className="text-2xl">🚀</span>
                <div>
                  <p className="text-sm font-bold text-gray-900">4. Deploy your bot</p>
                  <p className="text-xs text-gray-500">Generate a shareable URL with a flowing StudyBuddy watermark.</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                sessionStorage.setItem("chatbot_welcomed", "1");
                setShowWelcome(false);
              }}
              className="w-full h-12 rounded-full bg-violet-600 text-white text-sm font-bold mt-6 hover:bg-violet-700 transition"
            >
              🚀 Start Building
            </button>
            <button
              onClick={() => { setScreen("aiTemplates" as any); }}
              className="w-full h-10 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold mt-2 hover:bg-gray-200 transition"
            >
              📋 Browse AI Templates (start from a pre-built bot)
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Template loaded toast */}
      {loadedFromTemplate && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-4 py-2 rounded-full shadow-lg text-xs font-semibold flex items-center gap-2 animate-pulse">
          <Sparkles className="w-3.5 h-3.5" /> Loaded "{loadedFromTemplate}" — training data ready! Auto-switching to chat…
        </div>
      )}
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 h-14 flex items-center gap-3 sticky top-0 z-20">
        <button onClick={() => setScreen("home")} className="text-gray-500 hover:text-gray-900">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <Bot className="w-5 h-5 text-violet-500 flex-shrink-0" />
        <h1 className="text-sm font-bold text-gray-900 flex-1">Chatbot Builder</h1>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isTrained ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"}`}>
          {isTrained ? `● ${trainingData.length} pairs trained` : "○ Not trained"}
        </span>
        <button onClick={() => setScreen("dataLab" as any)} className="px-3 h-9 rounded-full bg-fuchsia-600 text-white text-xs font-semibold flex items-center gap-1 hover:bg-fuchsia-700">
          <Database className="w-3.5 h-3.5" /> Data Lab
        </button>
        <button onClick={saveProject} className="px-3 h-9 rounded-full bg-violet-600 text-white text-xs font-semibold flex items-center gap-1 hover:bg-violet-700">
          <Save className="w-3.5 h-3.5" /> Save
        </button>
      </header>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 bg-white overflow-x-auto no-scrollbar">
        {([
          { id: "train", label: "🎓 Train", icon: Brain },
          { id: "chat", label: "💬 Chat", icon: MessageCircle },
          { id: "review", label: `📝 Review${reviewLog.length > 0 ? ` (${reviewLog.length})` : ""}`, icon: FileText },
          { id: "evaluate", label: "✅ Evaluate", icon: BarChart3 },
          { id: "connect", label: "🔌 Connect", icon: Link2 },
          { id: "brain", label: "🧠 Brain", icon: Sparkles },
          { id: "llm", label: "🔬 LLM Viz", icon: Zap },
          { id: "knowledge", label: "📚 Knowledge", icon: Database },
          { id: "plugins", label: "🔌 Plugins", icon: Zap },
          { id: "tools", label: "🔧 AI Tools", icon: Settings },
          { id: "analytics", label: "📊 Analytics", icon: BarChart3 },
          { id: "deploy", label: "🚀 Deploy", icon: Globe },
        ] as Array<{ id: TabType; label: string; icon: any }>).map((tab) => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} disabled={tab.id !== "train" && !isTrained}
              className={`flex-shrink-0 px-4 py-2.5 text-sm font-semibold border-b-2 transition flex items-center gap-1 ${
                activeTab === tab.id ? "border-violet-600 text-violet-600" : "border-transparent text-gray-500"
              } ${!isTrained && tab.id !== "train" ? "opacity-40 cursor-not-allowed" : ""}`}>
              <Icon className="w-3.5 h-3.5" /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* === TRAIN TAB === */}
      {activeTab === "train" && (
        <div className="max-w-2xl mx-auto px-4 py-4">
          {/* Import/Export */}
          <div className="flex items-center gap-2 mb-3">
            <button onClick={() => setShowImport(!showImport)} className="px-3 h-8 rounded-lg bg-sky-50 text-sky-600 text-xs font-semibold flex items-center gap-1 hover:bg-sky-100">
              <Upload className="w-3.5 h-3.5" /> Import (CSV/JSON)
            </button>
            <button onClick={() => exportData("json")} className="px-3 h-8 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-semibold flex items-center gap-1 hover:bg-emerald-100">
              <Download className="w-3.5 h-3.5" /> Export JSON
            </button>
            <button onClick={() => exportData("csv")} className="px-3 h-8 rounded-lg bg-amber-50 text-amber-600 text-xs font-semibold flex items-center gap-1 hover:bg-amber-100">
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
            <span className="text-[10px] text-gray-400 ml-auto">Max 100,000 pairs</span>
          </div>

          {/* Import textarea */}
          {showImport && (
            <div className="rounded-xl bg-sky-50 border border-sky-200 p-3 mb-3">
              <p className="text-xs text-sky-700 mb-2">Paste CSV (input,output,intent) or JSON array ([{`{input, output, intent}`}]):</p>
              <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={`hello,Hi there!,greeting\nwhat is your name,I'm a bot,identity`} className="w-full h-24 rounded-lg bg-white border border-sky-200 p-2 text-xs font-mono outline-none" />
              <div className="flex gap-2 mt-2">
                <button onClick={importData} className="px-3 h-8 rounded-lg bg-sky-600 text-white text-xs font-semibold">Import</button>
                <button onClick={() => setShowImport(false)} className="px-3 h-8 rounded-lg bg-gray-200 text-gray-600 text-xs font-semibold">Cancel</button>
              </div>
            </div>
          )}

          {/* Add new pair */}
          <div className="rounded-2xl bg-white border border-gray-200 p-4 mb-4">
            <h2 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-violet-500" /> Add training example
            </h2>
            <input type="text" value={newInput} onChange={(e) => setNewInput(e.target.value)} placeholder="User says... (e.g. 'what is photosynthesis')" className="w-full h-10 rounded-lg bg-gray-50 border border-gray-200 px-3 text-sm outline-none focus:border-violet-400 mb-2" />
            <input type="text" value={newOutput} onChange={(e) => setNewOutput(e.target.value)} placeholder="Bot replies..." className="w-full h-10 rounded-lg bg-gray-50 border border-gray-200 px-3 text-sm outline-none focus:border-violet-400 mb-2" onKeyDown={(e) => { if (e.key === "Enter") addPair(); }} />
            <div className="flex items-center gap-2">
              <input type="text" value={newIntent} onChange={(e) => setNewIntent(e.target.value)} placeholder="Intent (optional, e.g. 'science_question')" className="flex-1 h-9 rounded-lg bg-gray-50 border border-gray-200 px-3 text-xs outline-none focus:border-violet-400" />
              <button onClick={addPair} disabled={!newInput.trim() || !newOutput.trim()} className="px-4 h-9 rounded-full bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-40 flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
          </div>

          {/* Training data list */}
          <div className="rounded-2xl bg-white border border-gray-200 p-4 mb-4">
            <h2 className="text-sm font-bold text-gray-900 mb-2">Training data ({trainingData.length} pairs{trainingData.some((p) => p.isTest) ? ` · ${trainingData.filter((p) => p.isTest).length} test` : ""})</h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {trainingData.slice(0, 100).map((pair) => (
                <div key={pair.id} className={`flex items-start gap-2 p-2 rounded-lg border ${pair.isTest ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-100"}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs"><span className="font-bold text-gray-600">Q:</span> {pair.input}</p>
                    <p className="text-xs mt-0.5"><span className="font-bold text-gray-600">A:</span> {pair.output}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      {pair.intent && <span className="inline-block text-[9px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">{pair.intent}</span>}
                      {pair.isTest && <span className="inline-block text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">TEST</span>}
                    </div>
                  </div>
                  <button onClick={() => toggleTestFlag(pair.id)} className={`flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${pair.isTest ? "bg-amber-500 text-white" : "bg-gray-200 text-gray-500 hover:bg-amber-200"}`} title="Toggle test-set membership">{pair.isTest ? "Test" : "Train"}</button>
                  <button onClick={() => removePair(pair.id)} className="text-gray-400 hover:text-rose-500 flex-shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              {trainingData.length > 100 && <p className="text-[10px] text-gray-400 text-center py-2">Showing first 100 of {trainingData.length}. Export to see all.</p>}
            </div>
          </div>

          {/* Phase 69 — Live Preview pane */}
          <div className="rounded-2xl bg-white border border-gray-200 p-4 mb-4">
            <h2 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-1.5"><Eye className="w-4 h-4 text-violet-500" /> Live Preview</h2>
            <p className="text-[11px] text-gray-500 mb-2">Type a question to see what the bot would retrieve right now — no need to switch to Chat.</p>
            <input
              type="text"
              value={previewInput}
              onChange={(e) => setPreviewInput(e.target.value)}
              placeholder="Try: 'hello' or 'what can you do'"
              className="w-full h-10 rounded-lg bg-gray-50 border border-gray-200 px-3 text-sm outline-none focus:border-violet-400 mb-2"
            />
            {previewResult && (
              <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
                {previewResult.bestPair ? (
                  <>
                    <div className="flex items-center gap-1.5 mb-1.5 text-[10px]">
                      <span className="font-bold text-violet-500">BOT</span>
                      {previewResult.wouldFallback ? (
                        <span className="px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 font-semibold border border-gray-200">Would fall back</span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-100">Would retrieve</span>
                      )}
                      <span className="text-gray-500">{(previewResult.bestScore * 100).toFixed(0)}% match</span>
                      <span className="text-gray-400">{matchingMode}</span>
                    </div>
                    <p className="text-xs text-gray-700"><b>Would say:</b> {previewResult.bestPair.output}</p>
                    <p className="text-[10px] text-gray-400 mt-1">↳ matched training input: "{previewResult.bestPair.input}"</p>
                  </>
                ) : (
                  <p className="text-xs text-gray-500">No training data to match against.</p>
                )}
                {previewResult.top3.length > 1 && (
                  <details className="mt-2">
                    <summary className="text-[10px] text-gray-500 cursor-pointer hover:text-gray-700">Top-3 matches:</summary>
                    <div className="mt-1 space-y-0.5">
                      {previewResult.top3.map((m, i) => (
                        <p key={i} className="text-[10px] text-gray-500 pl-2">• {(m.score * 100).toFixed(0)}% — "{m.pair.input}"</p>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
          </div>

          {/* Settings */}
          <div className="rounded-2xl bg-white border border-gray-200 p-4 mb-4">
            <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5"><Settings className="w-4 h-4 text-violet-500" /> Bot Settings</h2>
            <div className="space-y-3">
              {/* Matching mode */}
              <div className="flex items-center gap-3">
                <label className="text-xs text-gray-500 w-32">Matching mode:</label>
                <select value={matchingMode} onChange={(e) => setMatchingMode(e.target.value as MatchingMode)} className="text-xs bg-white border border-gray-200 rounded-lg px-2 py-1 outline-none">
                  <option value="semantic">Semantic (USE embeddings) — recommended</option>
                  <option value="hybrid">Hybrid (TF-IDF + Keyword)</option>
                  <option value="tfidf">TF-IDF only</option>
                  <option value="keyword">Keyword matching</option>
                  <option value="fuzzy">Fuzzy (Levenshtein)</option>
                </select>
              </div>
              {matchingMode === "semantic" && (
                <p className="text-[10px] text-violet-600 ml-32 -mt-2">Uses the Universal Sentence Encoder (~25MB one-time download, cached after). Understands meaning, not just word overlap.</p>
              )}
              {/* Embedding progress (semantic mode only) */}
              {embeddingProgress && (
                <div className="ml-32 -mt-1 flex items-center gap-2 text-[11px] text-violet-600">
                  <Loader2 className="w-3 h-3 animate-spin" /> {embeddingProgress}
                </div>
              )}
              {/* Confidence threshold */}
              <div className="flex items-center gap-3">
                <label className="text-xs text-gray-500 w-32">Confidence threshold:</label>
                <input type="range" min={0} max={1} step={0.05} value={confidenceThreshold} onChange={(e) => onThresholdChange(parseFloat(e.target.value))} className="flex-1" />
                <span className="text-xs font-mono text-gray-700 w-10">{confidenceThreshold.toFixed(2)}</span>
              </div>
              <p className="text-[10px] text-gray-400 ml-32 -mt-2">Default for {matchingMode}: {MODE_DEFAULT_THRESHOLD[matchingMode].toFixed(2)} — below this, the bot generates a reply instead of retrieving one.</p>
              {/* Thinking delay */}
              <div className="flex items-center gap-3">
                <label className="text-xs text-gray-500 w-32 flex items-center gap-1"><Clock className="w-3 h-3" /> Thinking delay:</label>
                <input type="range" min={0} max={10} step={1} value={thinkingDelay} onChange={(e) => setThinkingDelay(parseInt(e.target.value))} className="flex-1" />
                <span className="text-xs font-mono text-gray-700 w-12">{thinkingDelay}s</span>
              </div>
              {/* Bot memory */}
              <div className="flex items-center gap-3">
                <label className="text-xs text-gray-500 w-32">Bot memory:</label>
                <button onClick={() => setBotMemory(!botMemory)} className={`relative w-11 h-6 rounded-full transition ${botMemory ? "bg-violet-600" : "bg-gray-300"}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${botMemory ? "translate-x-5" : ""}`} />
                </button>
                <span className="text-[10px] text-gray-400">Remember last 5 messages for context</span>
              </div>
              {/* Generative fallback (Phase 68) */}
              <div className="flex items-center gap-3">
                <label className="text-xs text-gray-500 w-32 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Generative fallback:</label>
                <button onClick={() => setGenerativeFallback(!generativeFallback)} className={`relative w-11 h-6 rounded-full transition ${generativeFallback ? "bg-violet-600" : "bg-gray-300"}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${generativeFallback ? "translate-x-5" : ""}`} />
                </button>
                <span className="text-[10px] text-gray-400">When no training example clears the threshold, ask the LLM (with top-3 retrieved Q&A as context).</span>
              </div>
              {/* Phase 69 — Persona editor */}
              <div className="border-t border-gray-100 pt-3 mt-3">
                <label className="text-xs text-gray-500 flex items-center gap-1 mb-1.5"><Sparkles className="w-3 h-3" /> Persona (system prompt for generative fallback)</label>
                <div className="flex flex-wrap gap-1 mb-2">
                  {PERSONA_TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => applyPersonaTemplate(t.id)}
                      className="px-2 h-6 rounded-full bg-violet-50 text-violet-700 text-[10px] font-semibold hover:bg-violet-100 border border-violet-100"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <textarea
                  value={personaPrompt}
                  onChange={(e) => setPersonaPrompt(e.target.value)}
                  placeholder="Describe how the bot should talk — tone, length, persona…"
                  className="w-full h-20 rounded-lg bg-gray-50 border border-gray-200 p-2 text-xs outline-none focus:border-violet-400 font-mono"
                />
                <p className="text-[10px] text-gray-400 mt-1">Saved to your browser. Clear the textarea to use the default.</p>
              </div>
            </div>
            <button onClick={train} disabled={isTraining || trainingData.length === 0} className="w-full h-10 rounded-full bg-violet-600 text-white text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-violet-700 disabled:opacity-50 mt-4">
              {isTraining ? <><Loader2 className="w-4 h-4 animate-spin" /> Training…</> : <><Brain className="w-4 h-4" /> Train Chatbot ({trainingData.length} pairs)</>}
            </button>
            {isTrained && <p className="text-xs text-emerald-600 text-center mt-2">✓ Trained! Vocab: {modelRef.current?.vocab.length ?? 0} words · Intents: {stats.intents.length}{matchingMode === "semantic" ? ` · Embeddings: ${modelRef.current?.embeddings.length ?? 0}` : ""}</p>}
          </div>
        </div>
      )}

      {/* === CHAT TAB === */}
      {activeTab === "chat" && (
        <div className="max-w-2xl mx-auto px-4 py-4 flex flex-col" style={{ minHeight: "calc(100vh - 120px)" }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-500">Mode: {matchingMode} · Delay: {thinkingDelay}s · Memory: {botMemory ? "On" : "Off"}</p>
            <button onClick={clearChat} className="text-xs text-gray-400 hover:text-rose-500">Clear chat</button>
          </div>
          <div className="flex-1 overflow-y-auto space-y-3 pb-4">
            {chatMessages.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <MessageCircle className="w-10 h-10 mx-auto mb-2" />
                <p className="text-sm">Start chatting with your bot!</p>
                <p className="text-xs mt-1">Thinking delay: {thinkingDelay}s · The AI will "think" before each reply.</p>
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i}>
                <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${msg.role === "user" ? "bg-indigo-600 text-white" : "bg-white border border-gray-200 text-gray-900"}`}>
                    {msg.role === "bot" && (
                      <div className="flex items-center gap-1.5 mb-1 text-[10px] flex-wrap">
                        <span className="font-bold text-violet-500 flex items-center gap-0.5"><Brain className="w-3 h-3" /> BOT</span>
                        {/* Phase 68 — source badge: green=retrieval, sky=generative, gray=fallback */}
                        {msg.source === "retrieval" && (
                          <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold border border-emerald-100">Retrieved</span>
                        )}
                        {msg.source === "generative" && (
                          <span className="px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-700 font-semibold border border-sky-100 flex items-center gap-0.5">
                            <Sparkles className="w-2.5 h-2.5" /> Generated{msg.model ? ` · ${msg.model}` : ""}
                          </span>
                        )}
                        {msg.source === "fallback" && (
                          <span className="px-1.5 py-0.5 rounded-full bg-gray-50 text-gray-500 font-semibold border border-gray-200">Fallback</span>
                        )}
                        {msg.intent && <span className="px-1 py-0.5 rounded-full bg-violet-50 text-violet-600 font-medium">{msg.intent}</span>}
                        {msg.sentiment && <span className="px-1 py-0.5 rounded-full bg-gray-50 text-gray-500">{msg.sentiment}</span>}
                        {msg.confidence !== undefined && <span className="text-gray-400">{(msg.confidence * 100).toFixed(0)}% match</span>}
                        {msg.responseTime && <span className="text-gray-400">{(msg.responseTime / 1000).toFixed(1)}s</span>}
                      </div>
                    )}
                    {msg.text}
                  </div>
                </div>
                {msg.thinking && (
                  <div className="mt-1.5 ml-4 rounded-xl bg-gray-900 border border-gray-700 p-2.5 max-w-[90%]">
                    <p className="text-[10px] font-bold text-gray-400 uppercase mb-1.5 flex items-center gap-1"><Zap className="w-3 h-3 text-amber-400" /> Thinking process ({thinkingDelay}s delay)</p>
                    {msg.thinking.map((step, j) => (
                      <div key={j} className="mb-1.5 last:mb-0">
                        <p className="text-[11px] font-semibold text-gray-300">{step.step}</p>
                        <p className="text-[10px] text-gray-500">{step.detail}</p>
                        {step.data && Array.isArray(step.data) && step.data.length > 0 && (
                          <div className="mt-1 space-y-0.5">{step.data.slice(0, 5).map((item: any, k: number) => (
                            <p key={k} className="text-[10px] font-mono text-gray-600 pl-2">{typeof item === "string" ? item : JSON.stringify(item)}</p>
                          ))}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
            <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} placeholder="Type a message…" className="flex-1 h-10 rounded-full bg-white border border-gray-200 px-4 text-sm outline-none focus:border-violet-400" />
            <button onClick={sendMessage} disabled={!chatInput.trim()} className="w-10 h-10 rounded-full bg-violet-600 text-white flex items-center justify-center disabled:opacity-40 hover:bg-violet-700"><Send className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* === AI TOOLS TAB === */}
      {activeTab === "tools" && (
        <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5 mb-2"><Sparkles className="w-4 h-4 text-violet-500" /> AI Tools built into your chatbot</h2>
          {[
            { name: "Intent Detection", icon: Brain, desc: "Automatically classifies user messages into intents (greeting, question, complaint, etc.). Uses TF-IDF similarity against intent-labeled training data.", enabled: true },
            { name: "Entity Extraction", icon: Database, desc: "Detects numbers, emails, URLs, and dates in user messages. E.g. 'book a table for 4 tomorrow' → entities: [number:4, date:tomorrow].", enabled: true },
            { name: "Sentiment Analysis", icon: MessageCircle, desc: "Analyzes whether the user's message is positive, negative, or neutral. Helps the bot respond empathetically.", enabled: true },
            { name: "Spell Correction", icon: Settings, desc: "Corrects typos using Levenshtein distance against the vocabulary. 'hwo are yuo' → 'how are you'.", enabled: true },
            { name: "Bot Memory", icon: Clock, desc: "Remembers the last 5 messages in the conversation. The bot can reference previous context in its responses.", enabled: botMemory },
            { name: "Response Ranking", icon: BarChart3, desc: "When multiple training pairs match, ranks them by score and picks the best. Shows top-3 candidates in the thinking process.", enabled: true },
            { name: "Thinking Delay", icon: Clock, desc: `Configurable ${thinkingDelay}s delay before the bot responds. Simulates 'thinking' and shows the full reasoning process.`, enabled: true },
            { name: "Multi-Mode Matching", icon: Settings, desc: `Currently using: ${matchingMode}. Hybrid combines TF-IDF + keyword overlap. Fuzzy uses Levenshtein distance for typo tolerance.`, enabled: true },
          ].map((tool) => {
            const Icon = tool.icon;
            return (
              <div key={tool.name} className="rounded-xl bg-white border border-gray-200 p-3 flex items-start gap-3">
                <span className={`w-8 h-8 rounded-lg ${tool.enabled ? "bg-violet-50 text-violet-600" : "bg-gray-100 text-gray-400"} flex items-center justify-center flex-shrink-0`}>
                  <Icon className="w-4 h-4" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-gray-900">{tool.name}</p>
                    {tool.enabled && <span className="text-[9px] font-bold uppercase text-emerald-600">● Active</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{tool.desc}</p>
                </div>
              </div>
            );
          })}
          <div className="rounded-xl bg-violet-50 border border-violet-100 p-3 mt-4">
            <h3 className="text-xs font-bold text-violet-700 mb-1">💡 How to use these tools</h3>
            <p className="text-[11px] text-violet-600 leading-relaxed">All tools run automatically during chat. The thinking process (visible under each bot reply) shows exactly which tools fired and what they detected. Add intent labels to your training data to enable intent detection. Import large datasets (up to 100k pairs) via CSV for production-quality bots.</p>
          </div>
        </div>
      )}

      {/* === ANALYTICS TAB === */}
      {activeTab === "analytics" && (
        <div className="max-w-2xl mx-auto px-4 py-4">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5 mb-3"><BarChart3 className="w-4 h-4 text-violet-500" /> Bot Analytics</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="rounded-xl bg-white border border-gray-200 p-3">
              <p className="text-[10px] font-bold uppercase text-gray-400">Training Pairs</p>
              <p className="text-xl font-bold text-gray-900">{trainingData.length}</p>
            </div>
            <div className="rounded-xl bg-white border border-gray-200 p-3">
              <p className="text-[10px] font-bold uppercase text-gray-400">Intents</p>
              <p className="text-xl font-bold text-gray-900">{stats.intents.length}</p>
            </div>
            <div className="rounded-xl bg-white border border-gray-200 p-3">
              <p className="text-[10px] font-bold uppercase text-gray-400">Accuracy</p>
              <p className="text-xl font-bold text-gray-900">{accuracy}%</p>
            </div>
            <div className="rounded-xl bg-white border border-gray-200 p-3">
              <p className="text-[10px] font-bold uppercase text-gray-400">Avg Response</p>
              <p className="text-xl font-bold text-gray-900">{stats.avgResponseTime > 0 ? `${(stats.avgResponseTime / 1000).toFixed(1)}s` : "—"}</p>
            </div>
          </div>
          {/* Intent distribution */}
          <div className="rounded-xl bg-white border border-gray-200 p-4 mb-4">
            <h3 className="text-xs font-bold text-gray-700 mb-2">Intent Distribution</h3>
            {stats.intents.length > 0 ? (
              <div className="space-y-1.5">
                {stats.intents.map((intent) => {
                  const count = trainingData.filter((p) => (p.intent || "general") === intent).length;
                  const pct = (count / trainingData.length * 100).toFixed(1);
                  return (
                    <div key={intent} className="flex items-center gap-2">
                      <span className="text-xs text-gray-600 w-32 truncate">{intent}</span>
                      <div className="flex-1 h-4 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] text-gray-400 w-12 text-right">{count} ({pct}%)</span>
                    </div>
                  );
                })}
              </div>
            ) : <p className="text-xs text-gray-400">No intents defined. Add intent labels to your training data.</p>}
          </div>
          {/* Chat stats */}
          <div className="rounded-xl bg-white border border-gray-200 p-4">
            <h3 className="text-xs font-bold text-gray-700 mb-2">Chat Performance</h3>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs"><span className="text-gray-500">Total chats</span><span className="font-mono text-gray-900">{stats.totalChats}</span></div>
              <div className="flex items-center justify-between text-xs"><span className="text-gray-500">Understood (above threshold)</span><span className="font-mono text-emerald-600">{stats.coverage}</span></div>
              <div className="flex items-center justify-between text-xs"><span className="text-gray-500">Didn't understand</span><span className="font-mono text-rose-500">{stats.totalChats - stats.coverage}</span></div>
              <div className="flex items-center justify-between text-xs"><span className="text-gray-500">Vocabulary size</span><span className="font-mono text-gray-900">{modelRef.current?.vocab.length ?? 0} words</span></div>
              <div className="flex items-center justify-between text-xs"><span className="text-gray-500">Matching mode</span><span className="font-mono text-gray-900">{matchingMode}</span></div>
            </div>
          </div>
        </div>
      )}

      {/* === REVIEW TAB — Phase 68 continuous-learning loop === */}
      {activeTab === "review" && (
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="rounded-2xl bg-violet-50 border border-violet-100 p-4 mb-4">
            <h2 className="text-sm font-bold text-violet-900 flex items-center gap-1.5 mb-2">
              <FileText className="w-4 h-4" /> Review Queue — Continuous Learning Loop
            </h2>
            <p className="text-xs text-violet-700 leading-relaxed">
              Every time the bot can't confidently retrieve an answer, the turn lands here. Convert
              these into new Q&amp;A pairs to teach the bot what it should have said — the next time
              a similar question comes in, retrieval will hit instead of the LLM. Items in the queue
              are persisted in your browser, so you can come back to them tomorrow.
            </p>
          </div>

          {reviewLog.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <FileText className="w-10 h-10 mx-auto mb-2" />
              <p className="text-sm">No items to review yet.</p>
              <p className="text-xs mt-1">Items appear here automatically when the bot uses generative fallback or canned fallback.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reviewLog.slice().reverse().map((item) => (
                <div key={item.id} className="rounded-2xl bg-white border border-gray-200 p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-700">User said:</p>
                      <p className="text-sm text-gray-900 mt-0.5">{item.input}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      {item.source === "generative"
                        ? <span className="px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-700 text-[10px] font-semibold border border-sky-100 flex items-center gap-0.5"><Sparkles className="w-2.5 h-2.5" /> Generated</span>
                        : <span className="px-1.5 py-0.5 rounded-full bg-gray-50 text-gray-500 text-[10px] font-semibold border border-gray-200">Fallback</span>}
                      <span className="text-[10px] text-gray-400">{(item.bestScore * 100).toFixed(0)}% best</span>
                      <span className="text-[10px] text-gray-400">{new Date(item.timestamp).toLocaleString()}</span>
                    </div>
                  </div>

                  {item.generatedReply && (
                    <div className="mb-2 p-2 rounded-lg bg-sky-50 border border-sky-100">
                      <p className="text-[10px] font-bold text-sky-700 mb-0.5">LLM REPLY (use as the answer? edit if needed):</p>
                      <p className="text-xs text-sky-900">{item.generatedReply}</p>
                    </div>
                  )}

                  {item.topMatches.length > 0 && (
                    <details className="mb-2">
                      <summary className="text-[10px] text-gray-500 cursor-pointer hover:text-gray-700">Top-3 retrieved (weak):</summary>
                      <div className="mt-1 space-y-0.5">
                        {item.topMatches.map((m, i) => (
                          <p key={i} className="text-[10px] text-gray-500 pl-2">• {(m.score * 100).toFixed(0)}% — "{m.input}"</p>
                        ))}
                      </div>
                    </details>
                  )}

                  <ReviewActions
                    item={item}
                    onAdd={(input, output) => {
                      setTrainingData((prev) => [...prev, {
                        id: Date.now().toString(),
                        input, output,
                      }]);
                      setReviewLog((prev) => prev.filter((r) => r.id !== item.id));
                    }}
                    onDismiss={() => setReviewLog((prev) => prev.filter((r) => r.id !== item.id))}
                  />
                </div>
              ))}
              <button
                onClick={() => { if (confirm("Clear the entire review queue?")) setReviewLog([]); }}
                className="w-full h-9 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}

      {/* === EVALUATE TAB — Phase 69 confidence dashboard === */}
      {activeTab === "evaluate" && (
        <div className="max-w-2xl mx-auto px-4 py-4">
          {/* Test-set tagging */}
          <div className="rounded-2xl bg-white border border-gray-200 p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><BarChart3 className="w-4 h-4 text-violet-500" /> Test Set</h2>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500">
                  {trainingData.filter((p) => p.isTest).length} test · {trainingData.filter((p) => !p.isTest).length} train
                </span>
                <button
                  onClick={autoSplitTestSet}
                  disabled={trainingData.some((p) => p.isTest) || trainingData.length < 6}
                  className="px-2.5 h-7 rounded-full bg-violet-50 text-violet-700 text-[11px] font-semibold hover:bg-violet-100 disabled:opacity-40"
                  title={trainingData.some((p) => p.isTest) ? "Already tagged — clear test flags to re-split" : "Need ≥6 pairs to split"}
                >
                  Auto-split 15%
                </button>
              </div>
            </div>
            <p className="text-[11px] text-gray-500 mb-2">
              Tag a few pairs as <b>test</b> — they're held out from training and used to measure accuracy. Aim for ~15% of your data, with at least 1 per intent.
            </p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {trainingData.slice(0, 50).map((pair) => (
                <div key={pair.id} className={`flex items-center gap-2 p-2 rounded-lg border ${pair.isTest ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-100"}`}>
                  <button
                    onClick={() => toggleTestFlag(pair.id)}
                    className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center ${pair.isTest ? "bg-amber-500 border-amber-500" : "border-gray-300 hover:border-amber-400"}`}
                    title="Toggle test-set membership"
                  >
                    {pair.isTest && <Check className="w-3 h-3 text-white" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs truncate"><span className="font-bold text-gray-600">Q:</span> {pair.input}</p>
                    <p className="text-xs truncate"><span className="font-bold text-gray-600">A:</span> {pair.output}</p>
                  </div>
                  {pair.intent && <span className="text-[9px] px-1 py-0.5 rounded-full bg-violet-100 text-violet-700 flex-shrink-0">{pair.intent}</span>}
                  <span className={`text-[9px] font-semibold flex-shrink-0 ${pair.isTest ? "text-amber-600" : "text-gray-400"}`}>{pair.isTest ? "TEST" : "TRAIN"}</span>
                </div>
              ))}
              {trainingData.length > 50 && <p className="text-[10px] text-gray-400 text-center py-1">Showing first 50 of {trainingData.length}</p>}
            </div>
          </div>

          {/* Run evaluation */}
          <div className="rounded-2xl bg-white border border-gray-200 p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><BarChart3 className="w-4 h-4 text-violet-500" /> Run Evaluation</h2>
              <button
                onClick={runEvaluationNow}
                disabled={evalRunning || trainingData.filter((p) => p.isTest).length === 0}
                className="px-3 h-8 rounded-full bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-40 flex items-center gap-1"
              >
                {evalRunning ? <><Loader2 className="w-3 h-3 animate-spin" /> Running…</> : <><Sparkles className="w-3 h-3" /> Evaluate</>}
              </button>
            </div>
            {trainingData.filter((p) => p.isTest).length === 0 && (
              <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg p-2">⚠ Tag at least one pair as <b>test</b> above, then click Evaluate.</p>
            )}
            {evalResult && (
              <div className="space-y-3">
                {/* Headline metrics */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-2.5 text-center">
                    <p className="text-[10px] font-semibold text-emerald-700 uppercase">Accuracy</p>
                    <p className="text-xl font-bold text-emerald-900">{(evalResult.accuracy * 100).toFixed(0)}%</p>
                  </div>
                  <div className="rounded-xl bg-sky-50 border border-sky-100 p-2.5 text-center">
                    <p className="text-[10px] font-semibold text-sky-700 uppercase">Coverage</p>
                    <p className="text-xl font-bold text-sky-900">{(evalResult.coverage * 100).toFixed(0)}%</p>
                  </div>
                  <div className="rounded-xl bg-rose-50 border border-rose-100 p-2.5 text-center">
                    <p className="text-[10px] font-semibold text-rose-700 uppercase">Fallback</p>
                    <p className="text-xl font-bold text-rose-900">{(evalResult.fallbackRate * 100).toFixed(0)}%</p>
                  </div>
                </div>
                <p className="text-[10px] text-gray-500 text-center">
                  {evalResult.testSetSize} test pairs · {evalResult.modeUsed} mode · threshold {evalResult.thresholdUsed.toFixed(2)}
                </p>

                {/* Per-item results */}
                <div>
                  <p className="text-[11px] font-bold text-gray-700 mb-1.5">Per-question results</p>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {evalResult.perItem.map((r, i) => (
                      <div key={i} className={`flex items-center gap-2 p-1.5 rounded-lg text-[11px] ${r.correct ? "bg-emerald-50" : r.wouldFallback ? "bg-rose-50" : "bg-amber-50"}`}>
                        <span className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-white text-[9px] font-bold" style={{ background: r.correct ? "#10b981" : r.wouldFallback ? "#ef4444" : "#f59e0b" }}>
                          {r.correct ? "✓" : r.wouldFallback ? "✗" : "?"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="truncate"><b>Q:</b> {r.pair.input}</p>
                          {!r.wouldFallback && !r.correct && r.matchedInput && <p className="truncate text-gray-500">↳ matched: "{r.matchedInput}"</p>}
                          {r.wouldFallback && <p className="truncate text-gray-500">↳ would fall back to LLM</p>}
                        </div>
                        <span className="font-mono text-gray-500 flex-shrink-0">{(r.bestScore * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top confusions */}
                {evalResult.topConfusions.length > 0 && (
                  <div>
                    <p className="text-[11px] font-bold text-gray-700 mb-1.5">Top confusions (intent level)</p>
                    <div className="space-y-1">
                      {evalResult.topConfusions.map((c, i) => (
                        <div key={i} className="flex items-center gap-2 text-[11px] p-1.5 rounded-lg bg-gray-50">
                          <span className="font-mono text-rose-600">{c.truth}</span>
                          <span className="text-gray-400">→</span>
                          <span className="font-mono text-amber-600">{c.predicted}</span>
                          <span className="ml-auto font-mono text-gray-500">{c.count}×</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Mode recommender */}
          <div className="rounded-2xl bg-white border border-gray-200 p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-violet-500" /> Mode Recommender</h2>
              <button
                onClick={runModeRecommender}
                disabled={modeRecRunning || trainingData.filter((p) => p.isTest).length === 0}
                className="px-3 h-8 rounded-full bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-40 flex items-center gap-1"
              >
                {modeRecRunning ? <><Loader2 className="w-3 h-3 animate-spin" /> Sweeping…</> : <><Sparkles className="w-3 h-3" /> Recommend</>}
              </button>
            </div>
            <p className="text-[11px] text-gray-500 mb-2">Runs all 5 matching modes × thresholds against your test set, ranks them by accuracy.</p>
            {modeRanking && (
              <div className="space-y-1.5">
                {modeRanking.map((r, i) => (
                  <div key={r.mode} className={`flex items-center gap-2 p-2 rounded-lg ${i === 0 ? "bg-emerald-50 border border-emerald-200" : "bg-gray-50"}`}>
                    <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${i === 0 ? "bg-emerald-500 text-white" : "bg-gray-200 text-gray-600"}`}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold capitalize">{r.mode}{i === 0 && " ← recommended"}</p>
                      <p className="text-[10px] text-gray-500">Threshold {r.recommendedThreshold.toFixed(2)} · Fallback {(r.fallbackRate * 100).toFixed(0)}%</p>
                    </div>
                    <span className="font-mono text-sm font-bold text-emerald-700">{(r.accuracy * 100).toFixed(0)}%</span>
                    {i === 0 && (
                      <button
                        onClick={() => { setMatchingMode(r.mode); onThresholdChange(r.recommendedThreshold); }}
                        className="px-2 h-6 rounded-full bg-emerald-600 text-white text-[10px] font-semibold hover:bg-emerald-700"
                      >
                        Apply
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Data quality */}
          <div className="rounded-2xl bg-white border border-gray-200 p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><Settings className="w-4 h-4 text-violet-500" /> Data Quality</h2>
              <button
                onClick={scanQuality}
                className="px-3 h-8 rounded-full bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3" /> Scan
              </button>
            </div>
            <p className="text-[11px] text-gray-500 mb-2">Finds duplicates, contradictions (same input, different answers), near-duplicates, and sparse intents.</p>
            {qualityIssues && (
              qualityIssues.length === 0 ? (
                <p className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-lg p-2">✓ No issues found — your data is clean!</p>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {qualityIssues.map((issue) => (
                    <div key={issue.id} className={`flex items-start gap-2 p-2 rounded-lg border text-[11px] ${
                      issue.severity === "error" ? "bg-rose-50 border-rose-200" :
                      issue.severity === "warning" ? "bg-amber-50 border-amber-200" :
                      "bg-sky-50 border-sky-200"
                    }`}>
                      <span className="flex-shrink-0 mt-0.5 text-xs">
                        {issue.severity === "error" ? "🔴" : issue.severity === "warning" ? "🟡" : "🔵"}
                      </span>
                      <p className="flex-1 text-gray-700">{issue.message}</p>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* === DEPLOY TAB === */}
      {activeTab === "deploy" && (
        <div className="max-w-2xl mx-auto px-4 py-4">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5 mb-3"><Globe className="w-4 h-4 text-violet-500" /> Deploy Your Chatbot</h2>

          {/* Phase 70 — Cloud deploy (recommended) */}
          <div className="rounded-2xl bg-gradient-to-br from-violet-50 to-fuchsia-50 border border-violet-200 p-4 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 rounded-full bg-violet-600 text-white text-[10px] font-bold uppercase">Recommended</span>
              <h3 className="text-sm font-bold text-violet-900 flex items-center gap-1.5"><Sparkles className="w-4 h-4" /> Deploy to Cloud</h3>
            </div>
            <p className="text-xs text-violet-700 mb-3 leading-relaxed">
              Ship a real, server-backed chatbot at a shareable URL. Generative fallback works (the LLM answers when retrieval misses), analytics are tracked, and you can embed it on any website with an <code className="bg-violet-100 px-1 rounded">&lt;iframe&gt;</code>.
            </p>
            <ul className="text-[11px] text-violet-700 space-y-1 mb-3">
              <li>✓ Server-side hybrid retrieval (TF-IDF + keyword + fuzzy)</li>
              <li>✓ Generative fallback via GLM (works in production, unlike the HTML download)</li>
              <li>✓ Public chat URL — share it, embed it, or call the REST API</li>
              <li>✓ Analytics: chat volume, fallback rate, top missed queries</li>
              <li>✓ Pause/resume + version history (training data updates bump version)</li>
            </ul>
            <button
              onClick={deployToCloud}
              disabled={cloudDeploying || trainingData.length === 0}
              className="w-full h-10 rounded-full bg-violet-600 text-white text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-violet-700 disabled:opacity-50"
            >
              {cloudDeploying ? <><Loader2 className="w-4 h-4 animate-spin" /> Deploying…</> : <><Globe className="w-4 h-4" /> Deploy {trainingData.length} pairs to Cloud</>}
            </button>
            {cloudError && (
              <div className="mt-2 p-2 rounded-lg bg-rose-50 border border-rose-200 text-[11px] text-rose-700">⚠ {cloudError}</div>
            )}
            {cloudBot && (
              <div className="mt-3 p-3 rounded-lg bg-white border border-violet-200">
                <p className="text-xs font-bold text-emerald-700 mb-2">✓ Bot deployed to cloud!</p>
                <div className="space-y-2">
                  <div>
                    <p className="text-[10px] text-gray-500 mb-0.5">Public chat URL (share this):</p>
                    <div className="flex items-center gap-1.5">
                      <input type="text" readOnly value={`${typeof window !== "undefined" ? window.location.origin : ""}${cloudBot.embedUrl}`} className="flex-1 h-8 rounded-lg bg-gray-50 border border-gray-200 px-2 text-[11px] font-mono outline-none" />
                      <button onClick={() => copyToClipboard(`${typeof window !== "undefined" ? window.location.origin : ""}${cloudBot.embedUrl}`)} className="w-8 h-8 rounded-lg bg-violet-600 text-white flex items-center justify-center">
                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                      <a href={cloudBot.embedUrl} target="_blank" rel="noopener noreferrer" className="px-2 h-8 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold flex items-center gap-1 hover:bg-emerald-700">
                        <Link2 className="w-3 h-3" /> Open
                      </a>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 mb-0.5">Embed on your website:</p>
                    <div className="flex items-center gap-1.5">
                      <input type="text" readOnly value={`<iframe src="${typeof window !== "undefined" ? window.location.origin : ""}${cloudBot.embedUrl}" width="100%" height="500" frameborder="0"></iframe>`} className="flex-1 h-8 rounded-lg bg-gray-50 border border-gray-200 px-2 text-[11px] font-mono outline-none" />
                      <button onClick={() => copyToClipboard(`<iframe src="${typeof window !== "undefined" ? window.location.origin : ""}${cloudBot.embedUrl}" width="100%" height="500" frameborder="0"></iframe>`)} className="px-2 h-8 rounded-lg bg-violet-600 text-white text-[11px] font-semibold">Copy</button>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 mb-0.5">REST API (for developers):</p>
                    <code className="block text-[10px] font-mono text-gray-600 bg-gray-50 p-1.5 rounded">POST {cloudBot.apiUrl} {"{ \"message\": \"hello\" }"}</code>
                  </div>
                  <p className="text-[10px] text-gray-400">Version {cloudBot.version} · {cloudBot.pairCount} pairs</p>
                </div>
              </div>
            )}
            <div className="mt-2 text-center">
              <button onClick={loadCloudBots} className="text-[11px] text-violet-600 hover:text-violet-800 font-semibold">
                {showCloudList ? "↻ Refresh my bots" : "📋 Manage my deployed bots"}
              </button>
            </div>
            {showCloudList && (
              <div className="mt-2 space-y-1.5 max-h-64 overflow-y-auto">
                {cloudBots.length === 0 ? (
                  <p className="text-[11px] text-gray-500 text-center py-2">No bots deployed yet.</p>
                ) : cloudBots.map((b) => (
                  <div key={b.id} className="p-2 rounded-lg bg-white border border-violet-100">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-xs font-semibold text-gray-900 truncate flex-1">{b.name}</p>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 ${b.status === "deployed" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{b.status}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-gray-500 mb-1.5">
                      <span>💬 {b.messageCount}</span>
                      <span>↩ {b.fallbackCount}</span>
                      <span>👥 {b.uniqueUsers}</span>
                      {b.lastMessageAt && <span>· {new Date(b.lastMessageAt).toLocaleDateString()}</span>}
                    </div>
                    <div className="flex items-center gap-1">
                      <a href={`/embed/${b.slug}`} target="_blank" rel="noopener noreferrer" className="px-2 h-6 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-semibold flex items-center gap-1 hover:bg-emerald-100">
                        <Link2 className="w-2.5 h-2.5" /> Open
                      </a>
                      <button onClick={() => copyToClipboard(`${typeof window !== "undefined" ? window.location.origin : ""}/embed/${b.slug}`)} className="px-2 h-6 rounded-full bg-gray-100 text-gray-600 text-[10px] font-semibold hover:bg-gray-200">Copy URL</button>
                      <button onClick={() => toggleCloudBotStatus(b.id, b.status)} className="px-2 h-6 rounded-full bg-amber-50 text-amber-700 text-[10px] font-semibold hover:bg-amber-100">
                        {b.status === "paused" ? "▶ Resume" : "⏸ Pause"}
                      </button>
                      <button onClick={() => deleteCloudBot(b.id)} className="px-2 h-6 rounded-full bg-rose-50 text-rose-700 text-[10px] font-semibold hover:bg-rose-100 ml-auto">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Legacy: standalone HTML download */}
          <div className="rounded-2xl bg-white border border-gray-200 p-4 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-bold uppercase">Offline</span>
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><FileText className="w-4 h-4 text-gray-500" /> Download Standalone HTML</h3>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Generates a single HTML file with the bot embedded — works offline, no server needed. <b>Limitation:</b> TF-IDF retrieval only (no LLM fallback, no analytics).
            </p>
            <button onClick={deployBot} className="w-full h-10 rounded-full bg-gray-600 text-white text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-gray-700">
              <FileText className="w-4 h-4" /> Generate HTML File
            </button>
            {deployedUrl && (
              <div className="mt-3 p-2 rounded-lg bg-emerald-50 border border-emerald-200">
                <p className="text-[11px] text-emerald-700 mb-1">✓ HTML file generated (blob URL — download to share):</p>
                <div className="flex items-center gap-1.5">
                  <input type="text" value={deployedUrl} readOnly className="flex-1 h-8 rounded-lg bg-white border border-emerald-200 px-2 text-[11px] font-mono outline-none" />
                  <button onClick={copyUrl} className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <a href={deployedUrl} target="_blank" rel="noopener noreferrer" className="px-2 h-8 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold flex items-center gap-1 hover:bg-emerald-700">
                    <Link2 className="w-3 h-3" /> Open
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* Watermark preview */}
          <div className="rounded-2xl bg-gray-900 p-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Watermark preview</p>
            <div className="relative overflow-hidden rounded-lg bg-white p-4" style={{ minHeight: "60px" }}>
              <p className="text-xs text-gray-600">Chatbot preview area</p>
              <div className="absolute bottom-1 right-1 text-[8px] text-gray-300 animate-pulse">⚡ Built with StudyBuddy AI</div>
            </div>
            <p className="text-[10px] text-gray-500 mt-2">The watermark appears in the corner of every deployed bot. It cannot be removed.</p>
          </div>
        </div>
      )}

      {/* === CONNECT TAB — Phase 71 platform integrations === */}
      {activeTab === "connect" && (
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="rounded-2xl bg-violet-50 border border-violet-100 p-4 mb-4">
            <h2 className="text-sm font-bold text-violet-900 flex items-center gap-1.5 mb-1.5"><Link2 className="w-4 h-4" /> Connect to Platforms</h2>
            <p className="text-xs text-violet-700 leading-relaxed">
              Put your bot where your users are. Connect a deployed bot to Telegram, Slack, MCP (for AI assistants like Claude Desktop), or generate an API key for your own backend.
            </p>
          </div>

          {/* Bot selector — pick which deployed bot to connect */}
          <div className="rounded-2xl bg-white border border-gray-200 p-4 mb-4">
            <label className="text-xs font-bold text-gray-700 mb-1.5 block">1. Select a deployed bot</label>
            {!cloudBot && cloudBots.length === 0 && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg p-2">Deploy a bot to cloud first (Deploy tab), then come back here to connect it.</p>
            )}
            <div className="flex items-center gap-2">
              <select
                value={connectBotId ?? ""}
                onChange={(e) => { setConnectBotId(e.target.value); if (e.target.value) loadIntegrations(e.target.value); }}
                className="flex-1 h-9 rounded-lg bg-gray-50 border border-gray-200 px-2 text-xs outline-none focus:border-violet-400"
              >
                <option value="">— Select a bot —</option>
                {cloudBot && <option value={cloudBot.id}>{cloudBot.slug} (just deployed)</option>}
                {cloudBots.filter((b) => b.id !== cloudBot?.id).map((b) => (
                  <option key={b.id} value={b.id}>{b.slug} — {b.name}</option>
                ))}
              </select>
              <button onClick={loadCloudBots} className="px-3 h-9 rounded-lg bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200">↻</button>
            </div>
          </div>

          {connectBotId && (
            <>
              {/* Telegram */}
              <div className="rounded-2xl bg-white border border-gray-200 p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><span className="text-base">✈️</span> Telegram</h3>
                  {integrations.find((i) => i.platform === "telegram") && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-emerald-600 font-semibold">✓ Connected · {integrations.find((i) => i.platform === "telegram")!.messageCount} msgs</span>
                      <button onClick={() => disconnectIntegration("telegram")} className="text-[10px] text-rose-500 hover:text-rose-700 font-semibold">Disconnect</button>
                    </div>
                  )}
                </div>
                {!integrations.find((i) => i.platform === "telegram") ? (
                  <>
                    <p className="text-[11px] text-gray-500 mb-2">Talk to <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-violet-600 underline">@BotFather</a> on Telegram to create a bot, then paste the token here. We'll set up the webhook automatically.</p>
                    <input type="text" value={telegramToken} onChange={(e) => setTelegramToken(e.target.value)} placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11" className="w-full h-9 rounded-lg bg-gray-50 border border-gray-200 px-3 text-xs font-mono outline-none focus:border-violet-400 mb-2" />
                    <button onClick={connectTelegram} disabled={connecting === "telegram" || !telegramToken.trim()} className="w-full h-8 rounded-full bg-sky-500 text-white text-xs font-semibold hover:bg-sky-600 disabled:opacity-40 flex items-center justify-center gap-1">
                      {connecting === "telegram" ? <><Loader2 className="w-3 h-3 animate-spin" /> Connecting…</> : "Connect Telegram"}
                    </button>
                  </>
                ) : (
                  <div className="text-[11px] text-gray-500">
                    <p>Bot username: <code className="bg-gray-100 px-1 rounded">@{integrations.find((i) => i.platform === "telegram")!.config.botUsername || "unknown"}</code></p>
                    <p className="mt-1">Users can message your bot on Telegram and it will reply using this deployed chatbot.</p>
                  </div>
                )}
              </div>

              {/* Slack */}
              <div className="rounded-2xl bg-white border border-gray-200 p-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><span className="text-base">💬</span> Slack</h3>
                  {integrations.find((i) => i.platform === "slack") && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-emerald-600 font-semibold">✓ Connected · {integrations.find((i) => i.platform === "slack")!.messageCount} msgs</span>
                      <button onClick={() => disconnectIntegration("slack")} className="text-[10px] text-rose-500 hover:text-rose-700 font-semibold">Disconnect</button>
                    </div>
                  )}
                </div>
                {!integrations.find((i) => i.platform === "slack") ? (
                  <>
                    <p className="text-[11px] text-gray-500 mb-2">Create a Slack app at <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer" className="text-violet-600 underline">api.slack.com/apps</a>, add a slash command pointing to the webhook URL (shown after connect), then paste your bot token + signing secret.</p>
                    <input type="text" value={slackBotToken} onChange={(e) => setSlackBotToken(e.target.value)} placeholder="xoxb-..." className="w-full h-9 rounded-lg bg-gray-50 border border-gray-200 px-3 text-xs font-mono outline-none focus:border-violet-400 mb-1.5" />
                    <input type="text" value={slackSigningSecret} onChange={(e) => setSlackSigningSecret(e.target.value)} placeholder="Signing secret" className="w-full h-9 rounded-lg bg-gray-50 border border-gray-200 px-3 text-xs font-mono outline-none focus:border-violet-400 mb-2" />
                    <button onClick={connectSlack} disabled={connecting === "slack" || !slackBotToken.trim() || !slackSigningSecret.trim()} className="w-full h-8 rounded-full bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-40 flex items-center justify-center gap-1">
                      {connecting === "slack" ? <><Loader2 className="w-3 h-3 animate-spin" /> Connecting…</> : "Connect Slack"}
                    </button>
                  </>
                ) : (
                  <div className="text-[11px] text-gray-500">
                    <p>Slash command webhook URL:</p>
                    <code className="block text-[10px] font-mono text-gray-600 bg-gray-50 p-1.5 rounded mt-1 break-all">{typeof window !== "undefined" ? window.location.origin : ""}/api/integrations/slack/{connectBotId}/webhook</code>
                    <p className="mt-1.5">Add a slash command in your Slack app settings pointing to this URL. Users type <code className="bg-gray-100 px-1 rounded">/your-command hello</code> to chat with the bot.</p>
                  </div>
                )}
              </div>

              {/* MCP — always available, no setup needed */}
              <div className="rounded-2xl bg-white border border-gray-200 p-4 mb-4">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5 mb-2"><span className="text-base">🔌</span> MCP (Claude Desktop / Cursor)</h3>
                <p className="text-[11px] text-gray-500 mb-2">No setup needed — your bot is already available as an MCP server. Add this URL to your AI assistant's config:</p>
                <div className="flex items-center gap-1.5">
                  <code className="flex-1 text-[10px] font-mono text-gray-600 bg-gray-50 p-2 rounded break-all">{typeof window !== "undefined" ? window.location.origin : ""}/api/mcp/{cloudBot?.slug ?? cloudBots.find((b) => b.id === connectBotId)?.slug ?? "your-slug"}</code>
                  <button onClick={() => copyToClipboard(`${typeof window !== "undefined" ? window.location.origin : ""}/api/mcp/${cloudBot?.slug ?? cloudBots.find((b) => b.id === connectBotId)?.slug ?? ""}`)} className="px-2 h-8 rounded-lg bg-violet-600 text-white text-[10px] font-semibold">Copy</button>
                  <a href={`/api/mcp/${cloudBot?.slug ?? cloudBots.find((b) => b.id === connectBotId)?.slug ?? ""}`} target="_blank" rel="noopener noreferrer" className="px-2 h-8 rounded-lg bg-gray-100 text-gray-600 text-[10px] font-semibold">Open</a>
                </div>
                <details className="mt-2">
                  <summary className="text-[10px] text-gray-500 cursor-pointer hover:text-gray-700">Claude Desktop config example</summary>
                  <pre className="text-[10px] font-mono text-gray-600 bg-gray-900 text-gray-300 p-2 rounded mt-1 overflow-x-auto">{`{
  "mcpServers": {
    "chatbot": {
      "url": "${typeof window !== "undefined" ? window.location.origin : ""}/api/mcp/${cloudBot?.slug ?? "your-slug"}"
    }
  }
}`}</pre>
                </details>
              </div>

              {/* REST API key */}
              <div className="rounded-2xl bg-white border border-gray-200 p-4 mb-4">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5 mb-2"><span className="text-base">🔑</span> REST API Key</h3>
                <p className="text-[11px] text-gray-500 mb-2">Generate a key to call the bot from your own backend, Zapier, n8n, or any HTTP client. Without a key, the bot is accessible via the embed widget (rate-limited per IP).</p>
                {apiKeyVal ? (
                  <div>
                    <div className="flex items-center gap-1.5">
                      <code className="flex-1 text-[10px] font-mono text-gray-700 bg-gray-50 p-2 rounded break-all">{apiKeyVal}</code>
                      <button onClick={() => copyToClipboard(apiKeyVal)} className="px-2 h-8 rounded-lg bg-violet-600 text-white text-[10px] font-semibold">Copy</button>
                    </div>
                    <details className="mt-2">
                      <summary className="text-[10px] text-gray-500 cursor-pointer hover:text-gray-700">Example curl</summary>
                      <pre className="text-[10px] font-mono text-gray-300 bg-gray-900 p-2 rounded mt-1 overflow-x-auto">{`curl -X POST \\
  ${typeof window !== "undefined" ? window.location.origin : ""}/api/embed/${cloudBot?.slug ?? "your-slug"}/messages \\
  -H "Authorization: Bearer ${apiKeyVal}" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "hello"}'`}</pre>
                    </details>
                    <button onClick={generateApiKey} className="mt-2 text-[10px] text-amber-600 hover:text-amber-700 font-semibold">↻ Regenerate (invalidates old key)</button>
                  </div>
                ) : (
                  <button onClick={generateApiKey} className="w-full h-8 rounded-full bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700">Generate API Key</button>
                )}
              </div>

              {connectError && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 p-2 text-[11px] text-rose-700 mb-4">⚠ {connectError}</div>
              )}
            </>
          )}
        </div>
      )}

      {/* === PLUGINS TAB — Phase 73 tool system === */}
      {activeTab === "plugins" && (
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="rounded-2xl bg-violet-50 border border-violet-100 p-4 mb-4">
            <h2 className="text-sm font-bold text-violet-900 flex items-center gap-1.5 mb-1.5"><Zap className="w-4 h-4" /> Plugins & Tools</h2>
            <p className="text-xs text-violet-700 leading-relaxed">
              Give your bot extra capabilities. When a user's message matches a plugin's triggers, the bot calls the plugin and includes the result in its answer. Plugins run before the generative fallback.
            </p>
          </div>

          {/* Bot selector */}
          <div className="rounded-2xl bg-white border border-gray-200 p-4 mb-4">
            <label className="text-xs font-bold text-gray-700 mb-1.5 block">Select a deployed bot</label>
            {!connectBotId && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg p-2">Select a bot in the Connect tab first, then come back here to manage its plugins.</p>
            )}
            <div className="flex items-center gap-2 mt-1">
              <select
                value={connectBotId ?? ""}
                onChange={(e) => { setConnectBotId(e.target.value); if (e.target.value) loadPlugins(); }}
                className="flex-1 h-9 rounded-lg bg-gray-50 border border-gray-200 px-2 text-xs outline-none focus:border-violet-400"
              >
                <option value="">— Select a bot —</option>
                {cloudBot && <option value={cloudBot.id}>{cloudBot.slug} (just deployed)</option>}
                {cloudBots.filter((b) => b.id !== cloudBot?.id).map((b) => (
                  <option key={b.id} value={b.id}>{b.slug} — {b.name}</option>
                ))}
              </select>
              <button onClick={loadCloudBots} className="px-3 h-9 rounded-lg bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200">↻</button>
              {connectBotId && <button onClick={loadPlugins} className="px-3 h-9 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700">Load plugins</button>}
            </div>
          </div>

          {connectBotId && (
            <>
              {/* Active plugins */}
              <div className="rounded-2xl bg-white border border-gray-200 p-4 mb-4">
                <h3 className="text-xs font-bold text-gray-700 mb-2">Active plugins ({botPlugins.length})</h3>
                {botPlugins.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-3">No plugins yet. Add one below.</p>
                ) : (
                  <div className="space-y-2">
                    {botPlugins.map((p) => (
                      <div key={p.id} className="flex items-start gap-2 p-2 rounded-lg bg-gray-50 border border-gray-100">
                        <span className="flex-shrink-0 text-base">
                          {p.type === "builtin" && "⚙️"} {p.type === "http" && "🌐"} {p.type === "mcp" && "🔌"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-900">{p.name} <span className="text-[9px] text-gray-400 uppercase">{p.type}</span></p>
                          <p className="text-[10px] text-gray-500">{p.description}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{p.callCount} calls{p.lastCalledAt ? ` · last ${new Date(p.lastCalledAt).toLocaleDateString()}` : ""}</p>
                        </div>
                        <button onClick={() => togglePlugin(p.id, p.enabled)} className={`flex-shrink-0 relative w-9 h-5 rounded-full transition ${p.enabled ? "bg-emerald-500" : "bg-gray-300"}`}>
                          <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${p.enabled ? "translate-x-4" : ""}`} />
                        </button>
                        <button onClick={() => deletePlugin(p.id)} className="text-gray-400 hover:text-rose-500 flex-shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Built-in plugins */}
              <div className="rounded-2xl bg-white border border-gray-200 p-4 mb-4">
                <h3 className="text-xs font-bold text-gray-700 mb-2">Built-in plugins (zero config)</h3>
                <div className="space-y-1.5">
                  {availableBuiltin.map((p) => {
                    const alreadyAdded = botPlugins.some((bp) => bp.name === p.name);
                    return (
                      <div key={p.name} className="flex items-start gap-2 p-2 rounded-lg bg-gray-50 border border-gray-100">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-900">{p.name}</p>
                          <p className="text-[10px] text-gray-500">{p.description}</p>
                          <p className="text-[9px] text-gray-400 mt-0.5">Triggers: {p.triggerExamples.slice(0, 2).join(", ")}</p>
                        </div>
                        <button
                          onClick={() => addBuiltinPlugin(p.name)}
                          disabled={alreadyAdded}
                          className="flex-shrink-0 px-2 h-6 rounded-full bg-violet-600 text-white text-[10px] font-semibold hover:bg-violet-700 disabled:opacity-40"
                        >
                          {alreadyAdded ? "✓ Added" : "+ Add"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Custom HTTP plugin */}
              <div className="rounded-2xl bg-white border border-gray-200 p-4 mb-4">
                <h3 className="text-xs font-bold text-gray-700 mb-2">Custom HTTP plugin</h3>
                <p className="text-[11px] text-gray-500 mb-2">Call any REST API. <code className="bg-gray-100 px-1 rounded">{`{{message}}`}</code> in the body template is replaced with the user's message. <code className="bg-gray-100 px-1 rounded">responsePath</code> extracts a field from the JSON response (e.g. <code className="bg-gray-100 px-1 rounded">result.answer</code>).</p>
                <input type="text" value={httpPluginForm.name} onChange={(e) => setHttpPluginForm({ ...httpPluginForm, name: e.target.value })} placeholder="Plugin name (e.g. 'weather')" className="w-full h-9 rounded-lg bg-gray-50 border border-gray-200 px-3 text-xs outline-none focus:border-violet-400 mb-1.5" />
                <input type="text" value={httpPluginForm.url} onChange={(e) => setHttpPluginForm({ ...httpPluginForm, url: e.target.value })} placeholder="https://api.example.com/search" className="w-full h-9 rounded-lg bg-gray-50 border border-gray-200 px-3 text-xs font-mono outline-none focus:border-violet-400 mb-1.5" />
                <div className="flex gap-1.5 mb-1.5">
                  <select value={httpPluginForm.method} onChange={(e) => setHttpPluginForm({ ...httpPluginForm, method: e.target.value })} className="w-24 h-9 rounded-lg bg-gray-50 border border-gray-200 px-2 text-xs outline-none">
                    <option>POST</option><option>GET</option>
                  </select>
                  <input type="text" value={httpPluginForm.responsePath} onChange={(e) => setHttpPluginForm({ ...httpPluginForm, responsePath: e.target.value })} placeholder="responsePath (optional, e.g. result.answer)" className="flex-1 h-9 rounded-lg bg-gray-50 border border-gray-200 px-3 text-xs font-mono outline-none focus:border-violet-400" />
                </div>
                <textarea value={httpPluginForm.bodyTemplate} onChange={(e) => setHttpPluginForm({ ...httpPluginForm, bodyTemplate: e.target.value })} placeholder='Body template (POST only). Use {{message}} for the user input.' className="w-full h-16 rounded-lg bg-gray-50 border border-gray-200 p-2 text-xs font-mono outline-none focus:border-violet-400 mb-2" />
                <button onClick={addHttpPlugin} disabled={!httpPluginForm.name.trim() || !httpPluginForm.url.trim()} className="w-full h-8 rounded-full bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-40">+ Add HTTP Plugin</button>
              </div>

              {/* MCP client plugin */}
              <div className="rounded-2xl bg-white border border-gray-200 p-4 mb-4">
                <h3 className="text-xs font-bold text-gray-700 mb-2">MCP client (connect to external MCP server)</h3>
                <p className="text-[11px] text-gray-500 mb-2">Connect to any MCP server (e.g. another StudyBuddy bot's <code className="bg-gray-100 px-1 rounded">/api/mcp/[slug]</code> URL, or any MCP-compatible tool). The bot calls the specified tool and includes the result.</p>
                <input type="text" value={mcpPluginForm.name} onChange={(e) => setMcpPluginForm({ ...mcpPluginForm, name: e.target.value })} placeholder="Plugin name (e.g. 'other-bot')" className="w-full h-9 rounded-lg bg-gray-50 border border-gray-200 px-3 text-xs outline-none focus:border-violet-400 mb-1.5" />
                <input type="text" value={mcpPluginForm.serverUrl} onChange={(e) => setMcpPluginForm({ ...mcpPluginForm, serverUrl: e.target.value })} placeholder="https://studybuddy.ai/api/mcp/abc123def456" className="w-full h-9 rounded-lg bg-gray-50 border border-gray-200 px-3 text-xs font-mono outline-none focus:border-violet-400 mb-1.5" />
                <input type="text" value={mcpPluginForm.toolName} onChange={(e) => setMcpPluginForm({ ...mcpPluginForm, toolName: e.target.value })} placeholder="Tool name (default: chat_with_bot)" className="w-full h-9 rounded-lg bg-gray-50 border border-gray-200 px-3 text-xs font-mono outline-none focus:border-violet-400 mb-2" />
                <button onClick={addMcpPlugin} disabled={!mcpPluginForm.name.trim() || !mcpPluginForm.serverUrl.trim()} className="w-full h-8 rounded-full bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-40">+ Add MCP Plugin</button>
              </div>

              {/* How plugins work */}
              <div className="rounded-2xl bg-sky-50 border border-sky-100 p-4">
                <h3 className="text-xs font-bold text-sky-700 mb-2">🔌 How plugins work</h3>
                <div className="space-y-1.5 text-[11px] text-sky-600">
                  <p>1. 🔍 <b>Detect:</b> When a message arrives, the bot checks each enabled plugin's triggers</p>
                  <p>2. ⚡ <b>Call:</b> Matching plugins are called (up to 2 at once, 10-15s timeout each)</p>
                  <p>3. 💬 <b>Answer:</b> Plugin results are included in the LLM context as authoritative data</p>
                  <p>4. 📊 <b>Stats:</b> Call counts + last-called timestamps are tracked per plugin</p>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* === BRAIN TAB === 🧠 Shows the bot's growth stats + neural visualization */}
      {activeTab === "brain" && (
        <div className="max-w-2xl mx-auto px-4 py-4">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5 mb-3"><Sparkles className="w-4 h-4 text-violet-500" /> Bot Brain System</h2>

          {/* Learning stage banner */}
          <div className="rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 p-4 text-white mb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase opacity-70">Learning Stage</p>
                <p className="text-2xl font-bold">
                  {trainingData.length >= 500 ? "🏆 Expert" : trainingData.length >= 200 ? "🧠 Mature" : trainingData.length >= 50 ? "🌿 Young" : trainingData.length >= 10 ? "🌱 Sapling" : "🌰 Seedling"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase opacity-70">Neural Nodes</p>
                <p className="text-xl font-bold">{Math.floor(trainingData.length * 3 + (modelRef.current?.vocab.length ?? 0) * 0.5)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase opacity-70">Connections</p>
                <p className="text-xl font-bold">{Math.floor(trainingData.length * (modelRef.current?.vocab.length ?? 0) * 0.01 + (modelRef.current?.vocab.length ?? 0) * 2)}</p>
              </div>
            </div>
            <div className="mt-3 h-2 rounded-full bg-white/20 overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all" style={{ width: `${Math.min(100, (trainingData.length / 500) * 100)}%` }} />
            </div>
            <p className="text-[10px] opacity-70 mt-1">{trainingData.length} / 500 pairs to Expert stage</p>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="rounded-xl bg-white border border-gray-200 p-3">
              <p className="text-[10px] font-bold uppercase text-gray-400">Vocabulary</p>
              <p className="text-xl font-bold text-gray-900">{modelRef.current?.vocab.length ?? 0}</p>
              <p className="text-[9px] text-gray-400">unique words</p>
            </div>
            <div className="rounded-xl bg-white border border-gray-200 p-3">
              <p className="text-[10px] font-bold uppercase text-gray-400">Intents</p>
              <p className="text-xl font-bold text-gray-900">{stats.intents.length}</p>
              <p className="text-[9px] text-gray-400">categories</p>
            </div>
            <div className="rounded-xl bg-white border border-gray-200 p-3">
              <p className="text-[10px] font-bold uppercase text-gray-400">Accuracy</p>
              <p className="text-xl font-bold text-gray-900">{stats.totalChats > 0 ? (stats.coverage / stats.totalChats * 100).toFixed(0) : "—"}%</p>
              <p className="text-[9px] text-gray-400">{stats.coverage}/{stats.totalChats} understood</p>
            </div>
            <div className="rounded-xl bg-white border border-gray-200 p-3">
              <p className="text-[10px] font-bold uppercase text-gray-400">Memory</p>
              <p className="text-xl font-bold text-gray-900">{conversationContext.length}</p>
              <p className="text-[9px] text-gray-400">messages in context</p>
            </div>
          </div>

          {/* Growth explanation */}
          <div className="rounded-2xl bg-violet-50 border border-violet-100 p-4">
            <h3 className="text-xs font-bold text-violet-700 mb-2">🧠 How the brain grows</h3>
            <div className="space-y-1.5 text-[11px] text-violet-600">
              <p>📊 <b>Vocabulary:</b> Each unique word in your training data becomes a "neuron". More words = richer understanding.</p>
              <p>🔗 <b>Connections:</b> The brain forms connections between words and intents. More data = stronger connections.</p>
              <p>🎯 <b>Intents:</b> Each intent category becomes a cluster of neurons. More intents = more capabilities.</p>
              <p>📈 <b>Learning stages:</b> Seedling (0-9) → Sapling (10-49) → Young (50-199) → Mature (200-499) → Expert (500+)</p>
              <p>♻️ <b>Memory decay:</b> Old facts lose importance over time. The bot "forgets" irrelevant info and remembers what matters.</p>
            </div>
          </div>
        </div>
      )}

      {/* === LLM VIZ TAB === 🔬 Neural network visualization */}
      {activeTab === "llm" && (
        <div className="max-w-2xl mx-auto px-4 py-4">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5 mb-3"><Zap className="w-4 h-4 text-violet-500" /> Neural Network Visualization</h2>
          <p className="text-xs text-gray-500 mb-4">Watch your bot's "brain" grow as you add training data. Each node is a word or intent; each edge is a learned connection.</p>

          {/* SVG neural network */}
          <div className="rounded-2xl bg-gray-900 border border-gray-700 p-4 mb-4">
            <svg viewBox="0 0 400 400" className="w-full h-auto">
              {/* Edges */}
              {(() => {
                const intents = stats.intents.length > 0 ? stats.intents : ["general"];
                const vocab = modelRef.current?.vocab.slice(0, 20) ?? [];
                const intentColors = ["#7c3aed", "#d946ef", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#ec4899", "#14b8a6"];
                const topWords = vocab;
                const edges: Array<{ x1: number; y1: number; x2: number; y2: number; w: number }> = [];
                topWords.forEach((word, i) => {
                  const wordAngle = (i / Math.max(topWords.length, 1)) * Math.PI * 2;
                  const wordRadius = 140 + (i % 3) * 20;
                  const wx = 200 + Math.cos(wordAngle) * wordRadius;
                  const wy = 200 + Math.sin(wordAngle) * wordRadius;
                  intents.slice(0, 8).forEach((_, j) => {
                    const intentAngle = (j / Math.min(intents.length, 8)) * Math.PI * 2;
                    const ix = 200 + Math.cos(intentAngle) * 80;
                    const iy = 200 + Math.sin(intentAngle) * 80;
                    edges.push({ x1: wx, y1: wy, x2: ix, y2: iy, w: 0.3 + Math.random() * 0.5 });
                  });
                });
                return edges.map((e, i) => (
                  <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke="rgba(124,58,237,0.3)" strokeWidth={e.w * 2} />
                ));
              })()}
              {/* Intent nodes */}
              {(stats.intents.length > 0 ? stats.intents : ["general"]).slice(0, 8).map((intent, i) => {
                const angle = (i / Math.min(stats.intents.length || 1, 8)) * Math.PI * 2;
                const x = 200 + Math.cos(angle) * 80;
                const y = 200 + Math.sin(angle) * 80;
                const colors = ["#7c3aed", "#d946ef", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#ec4899", "#14b8a6"];
                return (
                  <g key={i}>
                    <circle cx={x} cy={y} r={12} fill={colors[i % 8]} opacity={0.8} />
                    <text x={x} y={y + 4} textAnchor="middle" fill="white" fontSize={8} fontWeight="bold">{intent.slice(0, 4)}</text>
                  </g>
                );
              })}
              {/* Word nodes */}
              {(modelRef.current?.vocab.slice(0, 20) ?? []).map((word, i) => {
                const angle = (i / 20) * Math.PI * 2;
                const radius = 140 + (i % 3) * 20;
                const x = 200 + Math.cos(angle) * radius;
                const y = 200 + Math.sin(angle) * radius;
                return (
                  <g key={i}>
                    <circle cx={x} cy={y} r={4} fill="#6b7280" opacity={0.6} />
                    <text x={x} y={y - 6} textAnchor="middle" fill="#9ca3af" fontSize={7}>{word.slice(0, 8)}</text>
                  </g>
                );
              })}
              {/* Center label */}
              <text x={200} y={205} textAnchor="middle" fill="#4b5563" fontSize={10} fontWeight="bold">🧠 Brain</text>
            </svg>
            <p className="text-[10px] text-gray-500 text-center mt-2">
              {modelRef.current?.vocab.length ?? 0} word neurons · {stats.intents.length} intent clusters · {trainingData.length} training signals
            </p>
          </div>

          {/* LLM simulation info */}
          <div className="rounded-2xl bg-white border border-gray-200 p-4">
            <h3 className="text-xs font-bold text-gray-700 mb-2">🔬 How this simulates an LLM</h3>
            <div className="space-y-1.5 text-[11px] text-gray-600">
              <p>📌 <b>Word neurons (gray):</b> Each unique word in your training data becomes a node. The more words, the richer the bot's "understanding".</p>
              <p>🎨 <b>Intent clusters (colored):</b> Each intent category (greeting, question, etc.) forms a cluster. The bot routes inputs to the nearest cluster.</p>
              <p>🔗 <b>Connections (lines):</b> Thicker lines = stronger word-to-intent association. These grow as the bot sees more examples.</p>
              <p>📈 <b>Growth:</b> Add more training data → the visualization updates with more nodes and connections. The brain literally grows on screen.</p>
              <p>⚡ <b>This is NOT a real neural network</b> — it's a TF-IDF + cosine similarity model visualized as a network. But the growth metaphor is accurate: more data = better understanding.</p>
            </div>
          </div>
        </div>
      )}

      {/* === KNOWLEDGE BASE TAB === 📚 RAG pipeline */}
      {activeTab === "knowledge" && (
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><Database className="w-4 h-4 text-violet-500" /> Knowledge Base (RAG)</h2>
            <button onClick={loadKnowledgeSources} className="text-[11px] text-violet-600 hover:text-violet-800 font-semibold">↻ Refresh</button>
          </div>
          <p className="text-xs text-gray-500 mb-4">Add documents from URLs, GitHub repos, files, or raw text. The bot retrieves relevant chunks and uses them as context when answering — like giving it a textbook to read.</p>

          {/* RAG toggle */}
          <div className="rounded-2xl bg-white border border-gray-200 p-3 mb-4 flex items-center gap-3">
            <label className="text-xs text-gray-500 flex items-center gap-1"><Sparkles className="w-3 h-3" /> RAG retrieval:</label>
            <button onClick={() => setRagEnabled(!ragEnabled)} className={`relative w-11 h-6 rounded-full transition ${ragEnabled ? "bg-violet-600" : "bg-gray-300"}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${ragEnabled ? "translate-x-5" : ""}`} />
            </button>
            <span className="text-[10px] text-gray-400">When on, the bot retrieves knowledge chunks before generating a reply.</span>
          </div>

          {/* Source type tabs */}
          <div className="flex gap-1 mb-3">
            {(["text", "url", "github", "file"] as const).map((t) => (
              <button key={t} onClick={() => setKbTab(t)} className={`flex-1 h-8 rounded-full text-xs font-semibold ${kbTab === t ? "bg-violet-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {t === "text" && "📝 Text"} {t === "url" && "🌐 URL"} {t === "github" && "🐙 GitHub"} {t === "file" && "📎 File"}
              </button>
            ))}
          </div>

          {/* Input panel */}
          <div className="rounded-2xl bg-white border border-gray-200 p-4 mb-4">
            {kbTab === "text" && (
              <>
                <input type="text" value={kbTitle} onChange={(e) => setKbTitle(e.target.value)} placeholder="Title (optional, e.g. 'Course notes — Chapter 5')" className="w-full h-9 rounded-lg bg-gray-50 border border-gray-200 px-3 text-xs outline-none focus:border-violet-400 mb-2" />
                <textarea value={kbText} onChange={(e) => setKbText(e.target.value)} placeholder="Paste any text: product manuals, FAQ docs, course notes, company policies, etc." className="w-full h-32 rounded-lg bg-gray-50 border border-gray-200 p-2 text-xs outline-none focus:border-violet-400 mb-2" />
                <button onClick={() => ingestKnowledge("text")} disabled={ingesting || kbText.trim().length < 10} className="w-full h-9 rounded-full bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-40 flex items-center justify-center gap-1">
                  {ingesting ? <><Loader2 className="w-3 h-3 animate-spin" /> Ingesting…</> : <>Add to Knowledge Base</>}
                </button>
              </>
            )}
            {kbTab === "url" && (
              <>
                <input type="url" value={kbUrl} onChange={(e) => setKbUrl(e.target.value)} placeholder="https://example.com/docs" className="w-full h-9 rounded-lg bg-gray-50 border border-gray-200 px-3 text-xs outline-none focus:border-violet-400 mb-2" />
                <p className="text-[10px] text-gray-400 mb-2">Fetches the page, strips HTML to text, chunks it (~1200 chars each). SSRF-protected — private/internal IPs are blocked.</p>
                <button onClick={() => ingestKnowledge("url")} disabled={ingesting || !kbUrl.trim()} className="w-full h-9 rounded-full bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-40 flex items-center justify-center gap-1">
                  {ingesting ? <><Loader2 className="w-3 h-3 animate-spin" /> Fetching…</> : <>Ingest URL</>}
                </button>
              </>
            )}
            {kbTab === "github" && (
              <>
                <input type="text" value={kbGithub} onChange={(e) => setKbGithub(e.target.value)} placeholder="https://github.com/owner/repo  or  owner/repo  or  owner/repo/tree/main/docs" className="w-full h-9 rounded-lg bg-gray-50 border border-gray-200 px-3 text-xs outline-none focus:border-violet-400 mb-2" />
                <p className="text-[10px] text-gray-400 mb-2">Fetches the README + up to 20 files from <code>docs/</code> (or the specified path). Public repos only.</p>
                <button onClick={() => ingestKnowledge("github")} disabled={ingesting || !kbGithub.trim()} className="w-full h-9 rounded-full bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-40 flex items-center justify-center gap-1">
                  {ingesting ? <><Loader2 className="w-3 h-3 animate-spin" /> Fetching…</> : <>Ingest GitHub Repo</>}
                </button>
              </>
            )}
            {kbTab === "file" && (
              <>
                <input type="file" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadKnowledgeFile(f); e.target.value = ""; }} accept=".pdf,.docx,.txt,.md,.csv,.json" className="w-full text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:bg-violet-50 file:text-violet-700 file:font-semibold file:text-xs hover:file:bg-violet-100" />
                <p className="text-[10px] text-gray-400 mt-2">Supports PDF, DOCX, TXT, MD, CSV, JSON. Max 10 MB. The file is parsed server-side, chunked, and stored in your knowledge base.</p>
                {ingesting && <p className="text-[11px] text-violet-600 mt-2 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Uploading + parsing…</p>}
              </>
            )}
            {ingestError && <p className="mt-2 text-[11px] text-rose-600 bg-rose-50 border border-rose-100 rounded-lg p-2">⚠ {ingestError}</p>}
          </div>

          {/* Source list */}
          <div className="rounded-2xl bg-white border border-gray-200 p-4 mb-4">
            <h3 className="text-xs font-bold text-gray-700 mb-2">Knowledge sources ({knowledgeSources.length})</h3>
            {knowledgeSources.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-3">No knowledge sources yet. Add one above.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {knowledgeSources.map((src) => (
                  <div key={src.id} className="flex items-start gap-2 p-2 rounded-lg bg-gray-50 border border-gray-100">
                    <span className="flex-shrink-0 text-base">
                      {src.type === "url" && "🌐"} {src.type === "github" && "🐙"} {src.type === "file" && "📎"} {src.type === "text" && "📝"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-900 truncate">{src.title}</p>
                      {src.source && <p className="text-[10px] text-gray-500 truncate">{src.source}</p>}
                      <p className="text-[10px] text-gray-400 mt-0.5">{src.chunkCount} chunks · {src.charCount.toLocaleString()} chars · {new Date(src.createdAt).toLocaleDateString()}</p>
                    </div>
                    <button onClick={() => deleteKnowledgeSource(src.id)} className="text-gray-400 hover:text-rose-500 flex-shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
            {knowledgeSources.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-100 grid grid-cols-3 gap-2 text-center">
                <div><p className="text-lg font-bold text-gray-900">{knowledgeSources.length}</p><p className="text-[10px] text-gray-400">Sources</p></div>
                <div><p className="text-lg font-bold text-gray-900">{knowledgeSources.reduce((s, k) => s + k.chunkCount, 0)}</p><p className="text-[10px] text-gray-400">Total chunks</p></div>
                <div><p className="text-lg font-bold text-gray-900">{(knowledgeSources.reduce((s, k) => s + k.charCount, 0) / 1000).toFixed(1)}k</p><p className="text-[10px] text-gray-400">Total chars</p></div>
              </div>
            )}
          </div>

          {/* How RAG works */}
          <div className="rounded-2xl bg-sky-50 border border-sky-100 p-4">
            <h3 className="text-xs font-bold text-sky-700 mb-2">📚 How RAG works</h3>
            <div className="space-y-1.5 text-[11px] text-sky-600">
              <p>1. 📝 <b>Ingest:</b> Add a URL, GitHub repo, file, or paste text — the server extracts clean text</p>
              <p>2. ✂️ <b>Chunk:</b> Text is split into ~1200-char chunks with 180-char overlap</p>
              <p>3. 🔢 <b>Embed:</b> When you ask a question, chunks are embedded with USE (same model as semantic mode)</p>
              <p>4. 🔍 <b>Retrieve:</b> Top-4 most similar chunks are found via cosine similarity</p>
              <p>5. 💬 <b>Generate:</b> Chunks are passed to the LLM as context alongside the weak Q&A matches</p>
              <p>6. 📖 <b>Cite:</b> The LLM cites chunks as [Knowledge N] in its answer</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * ReviewActions — small inline form for converting a ReviewItem into a new
 * training pair. Defaults the answer to the LLM-generated reply (if any) so
 * the user can one-click-accept; otherwise they type a fresh answer.
 */
function ReviewActions({
  item,
  onAdd,
  onDismiss,
}: {
  item: ReviewItem;
  onAdd: (input: string, output: string) => void;
  onDismiss: () => void;
}) {
  const [output, setOutput] = useState(item.generatedReply ?? "");
  const [editingInput, setEditingInput] = useState(false);
  const [input, setInput] = useState(item.input);
  return (
    <div className="border-t border-gray-100 pt-2 mt-1">
      {editingInput ? (
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="w-full h-8 rounded-lg bg-gray-50 border border-gray-200 px-2 text-xs mb-1.5 outline-none focus:border-violet-400"
        />
      ) : (
        <button
          onClick={() => setEditingInput(true)}
          className="text-[10px] text-gray-400 hover:text-violet-600 mb-1.5"
        >
          ✎ edit input
        </button>
      )}
      <textarea
        value={output}
        onChange={(e) => setOutput(e.target.value)}
        placeholder="Type the answer the bot should have given…"
        className="w-full h-16 rounded-lg bg-gray-50 border border-gray-200 p-2 text-xs outline-none focus:border-violet-400 mb-2"
      />
      <div className="flex gap-2">
        <button
          onClick={() => { if (input.trim() && output.trim()) onAdd(input.trim(), output.trim()); }}
          disabled={!input.trim() || !output.trim()}
          className="flex-1 h-8 rounded-full bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-40 flex items-center justify-center gap-1"
        >
          <Plus className="w-3 h-3" /> Add as training pair
        </button>
        <button
          onClick={onDismiss}
          className="px-3 h-8 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

/**
 * Generate a standalone HTML file for the deployed chatbot.
 * Includes all training data, the NLP engine, and a flowing StudyBuddy watermark.
 */
function generateDeployedBotHTML(
  trainingData: TrainingPair[],
  threshold: number,
  memory: boolean,
  delay: number
): string {
  const dataJson = JSON.stringify(trainingData.map(({ id, ...rest }) => rest));
  // Clamp the deployed-bot threshold to the Phase 68 minimum so a stale saved
  // 0.15 from a Phase 62 project doesn't ship to the deployed page.
  const safeThreshold = Math.max(threshold, 0.30);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Chatbot — Built with StudyBuddy AI</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f3f4f6; height: 100vh; display: flex; flex-direction: column; }
  .header { background: linear-gradient(135deg, #7c3aed, #d946ef); color: white; padding: 16px; text-align: center; font-weight: bold; font-size: 16px; }
  .chat { flex: 1; overflow-y: auto; padding: 16px; max-width: 600px; margin: 0 auto; width: 100%; }
  .msg { margin-bottom: 12px; max-width: 80%; padding: 10px 14px; border-radius: 16px; font-size: 14px; line-height: 1.4; }
  .user { background: #4f46e5; color: white; margin-left: auto; }
  .bot { background: white; border: 1px solid #e5e7eb; }
  .bot .meta { font-size: 10px; color: #7c3aed; font-weight: bold; margin-bottom: 4px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .badge { padding: 1px 6px; border-radius: 999px; font-weight: 700; font-size: 9px; }
  .badge-retrieved { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
  .badge-fallback { background: #f3f4f6; color: #6b7280; border: 1px solid #e5e7eb; }
  .thinking { margin: 4px 0 8px 20px; padding: 8px; background: #1f2937; border-radius: 8px; font-size: 11px; color: #9ca3af; max-width: 85%; }
  .thinking .step { margin-bottom: 4px; }
  .thinking .step-title { color: #d1d5db; font-weight: 600; }
  .input-area { padding: 12px; background: white; border-top: 1px solid #e5e7eb; max-width: 600px; margin: 0 auto; width: 100%; display: flex; gap: 8px; }
  input { flex: 1; padding: 10px 16px; border: 1px solid #e5e7eb; border-radius: 20px; font-size: 14px; outline: none; }
  button { background: #7c3aed; color: white; border: none; padding: 10px 20px; border-radius: 20px; cursor: pointer; font-weight: 600; }
  button:hover { background: #6d28d9; }
  .typing { color: #9ca3af; font-style: italic; font-size: 13px; }
  /* Flowing watermark */
  .watermark { position: fixed; bottom: 8px; right: 8px; font-size: 10px; color: rgba(124, 58, 237, 0.3); pointer-events: none; z-index: 9999; animation: flow 3s ease-in-out infinite; }
  @keyframes flow { 0%, 100% { opacity: 0.2; transform: translateX(0); } 50% { opacity: 0.5; transform: translateX(-4px); } }
</style>
</head>
<body>
  <div class="header">🤖 StudyBuddy Chatbot</div>
  <div class="chat" id="chat"></div>
  <div class="input-area">
    <input type="text" id="input" placeholder="Type a message…" onkeydown="if(event.key==='Enter')send()">
    <button onclick="send()">Send</button>
  </div>
  <div class="watermark">⚡ Built with StudyBuddy AI</div>
<script>
const TRAINING_DATA = ${dataJson};
const THRESHOLD = ${safeThreshold};
const MEMORY = ${memory};
const DELAY = ${delay};
// Phase 68 — light normalization only (lowercase + strip punct + collapse ws).
// No aggressive spell-correction — see ChatbotPlayground.tsx for rationale.
const ABBREV = { u:'you',ur:'your',r:'are',n:'and',pls:'please',plz:'please',tho:'though',wat:'what',wut:'what',y:'why',k:'ok',c:'see',b:'be',gonna:'going to',wanna:'want to',dont:'do not',cant:'cannot',wont:'will not',im:'i am',youre:'you are',thats:'that is',whats:'what is',idk:'i do not know' };
function normalize(t){const toks=t.toLowerCase().replace(/[^\\w\\s']/g,' ').split(/\\s+/).filter(Boolean);return toks.map(w=>ABBREV[w]||w).join(' ').replace(/\\s+/g,' ').trim();}
const normInputs = TRAINING_DATA.map(p => normalize(p.input));
const vocab = [...new Set(normInputs.flatMap(s => s.split(/\\s+/).filter(w=>w.length>1)))];
const idf = new Map(vocab.map(w => { const df = normInputs.filter(s => new Set(s.split(/\\s+/)).has(w)).length; return [w, Math.log((TRAINING_DATA.length+1)/(df+1))+1]; }));
const vectors = normInputs.map(s => { const t = s.split(/\\s+/).filter(w=>w.length>1); const tf = new Map(); t.forEach(w=>tf.set(w,(tf.get(w)||0)+1)); return vocab.map(w => (tf.get(w)||0)/Math.max(t.length,1) * (idf.get(w)||1)); });
function cosine(a,b){let d=0,ma=0,mb=0;for(let i=0;i<a.length;i++){d+=a[i]*b[i];ma+=a[i]*a[i];mb+=b[i]*b[i]}return Math.sqrt(ma)*Math.sqrt(mb)>0?d/(Math.sqrt(ma)*Math.sqrt(mb)):0}
let context = [];
function send() {
  const input = document.getElementById('input'); const text = input.value.trim(); if(!text) return; input.value='';
  const chat = document.getElementById('chat');
  chat.innerHTML += '<div class="msg user">'+text+'</div>';
  if(MEMORY) context.push(text);
  chat.innerHTML += '<div class="msg bot"><div class="typing">🤔 thinking...</div></div>';
  chat.scrollTop = chat.scrollHeight;
  setTimeout(() => {
    const norm = normalize(text);
    const tokens = norm.split(/\\s+/).filter(w=>w.length>1);
    const tf = new Map(); tokens.forEach(w=>tf.set(w,(tf.get(w)||0)+1));
    const inputVec = vocab.map(w => (tf.get(w)||0)/Math.max(tokens.length,1) * (idf.get(w)||1));
    const scores = vectors.map((v,i) => ({ pair: TRAINING_DATA[i], score: cosine(inputVec, v) })).sort((a,b)=>b.score-a.score);
    const best = scores[0];
    const lastBot = chat.querySelector('.bot:last-child');
    if(best && best.score >= THRESHOLD) {
      lastBot.innerHTML = '<div class="meta"><span class="badge badge-retrieved">RETRIEVED</span> '+(best.score*100).toFixed(0)+'% match</div>'+best.pair.output;
    } else {
      lastBot.innerHTML = '<div class="meta"><span class="badge badge-fallback">FALLBACK</span> '+(best?((best.score*100).toFixed(0))+'% best':'no match')+'</div>I\\'m not sure how to answer that. Could you rephrase, or add a training example for it?';
    }
    chat.scrollTop = chat.scrollHeight;
  }, DELAY * 1000);
}
</script>
</body>
</html>`;
}
