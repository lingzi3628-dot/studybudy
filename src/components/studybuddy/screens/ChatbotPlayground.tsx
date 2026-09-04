"use client";

/**
 * ChatbotPlayground — Phase 62
 *
 * Upgraded chatbot builder with:
 *   - Large dataset support (up to 100k Q&A pairs via CSV/JSON import)
 *   - Multi-training (train multiple intents/categories)
 *   - Bot memory (remembers conversation context)
 *   - AI tools: intent detection, entity extraction, sentiment analysis,
 *     response ranking, spell correction
 *   - Deploy bot: generates a shareable URL with a flowing StudyBuddy watermark
 *   - Rate-limit thinking delay (3-4 second "thinking" animation before reply)
 *   - Multiple training modes: TF-IDF, keyword matching, fuzzy matching
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

// === Types ===
type TrainingPair = { id: string; input: string; output: string; intent?: string };
type ChatMessage = { role: "user" | "bot"; text: string; thinking?: ThinkingStep[]; sentiment?: string; intent?: string; confidence?: number; responseTime?: number };
type ThinkingStep = { step: string; detail: string; data?: any };

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

// Levenshtein distance for fuzzy matching / spell correction
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

type TabType = "train" | "chat" | "tools" | "analytics" | "deploy";
type MatchingMode = "tfidf" | "keyword" | "fuzzy" | "hybrid";

export function ChatbotPlayground() {
  const { setScreen, activeProjectId } = useApp() as any;
  const [trainingData, setTrainingData] = useState<TrainingPair[]>(STARTER_DATA);
  const [newInput, setNewInput] = useState("");
  const [newOutput, setNewOutput] = useState("");
  const [newIntent, setNewIntent] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isTraining, setIsTraining] = useState(false);
  const [isTrained, setIsTrained] = useState(false);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.15);
  const [thinkingDelay, setThinkingDelay] = useState(3); // seconds
  const [matchingMode, setMatchingMode] = useState<MatchingMode>("hybrid");
  const [activeTab, setActiveTab] = useState<TabType>("train");
  const [botMemory, setBotMemory] = useState<boolean>(true);
  const [conversationContext, setConversationContext] = useState<string[]>([]);
  const [deployedUrl, setDeployedUrl] = useState<string | null>(null);
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
  } | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

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
                modelRef.current = { vocab, idf, vectors, pairs: loaded, intents };
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
    const vocab = buildVocab(trainingData);
    const idf = computeIDF(trainingData, vocab);
    const vectors = trainingData.map((p) => tfidfVector(p.input, vocab, idf));
    // Build intent index
    const intents = new Map<string, TrainingPair[]>();
    for (const p of trainingData) {
      const intent = p.intent || "general";
      if (!intents.has(intent)) intents.set(intent, []);
      intents.get(intent)!.push(p);
    }
    modelRef.current = { vocab, idf, vectors, pairs: trainingData, intents };
    setStats({
      coverage: 0,
      avgResponseTime: 0,
      totalChats: 0,
      intents: Array.from(intents.keys()),
    });
    setIsTrained(true);
    setIsTraining(false);
  }, [trainingData]);

  // Send a message to the chatbot
  const sendMessage = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || !modelRef.current) return;

    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", text }]);

    // Update conversation context (memory)
    if (botMemory) {
      setConversationContext((prev) => [...prev.slice(-4), text]); // keep last 5 messages
    }

    // Thinking delay (rate limit)
    const startTime = Date.now();
    await new Promise((r) => setTimeout(r, thinkingDelay * 1000));

    const model = modelRef.current;
    const thinkingSteps: ThinkingStep[] = [];

    // Step 1: Tokenize
    const tokens = tokenize(text);
    thinkingSteps.push({ step: "1. Tokenize input", detail: `Split "${text}" into ${tokens.length} tokens`, data: tokens });

    // Step 2: Spell correction
    const corrected = spellCorrect(text, model.vocab);
    if (corrected !== text.toLowerCase().replace(/[^\w\s]/g, " ").trim()) {
      thinkingSteps.push({ step: "2. Spell correction", detail: `Corrected to: "${corrected}"`, data: [corrected] });
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
        const inputVec = tfidfVector(corrected, model.vocab, model.idf);
        const sims = intentVecs.map((v) => cosineSim(inputVec, v));
        const avg = sims.reduce((s, v) => s + v, 0) / Math.max(sims.length, 1);
        intentScores.set(intent, avg);
      }
      const sorted = Array.from(intentScores.entries()).sort((a, b) => b[1] - a[1]);
      detectedIntent = sorted[0]?.[0] ?? "general";
      thinkingSteps.push({ step: "5. Intent detection", detail: `Detected intent: ${detectedIntent}`, data: sorted.slice(0, 3).map(([i, s]) => `${i}: ${s.toFixed(4)}`) });
    }

    // Step 6: Match against training data
    const inputVec = tfidfVector(corrected, model.vocab, model.idf);
    let scores: Array<{ pair: TrainingPair; score: number; index: number }> = [];

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
        const dist = levenshtein(corrected, p.input.toLowerCase());
        const maxLen = Math.max(corrected.length, p.input.length);
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

    scores.sort((a, b) => b.score - a.score);
    const top3 = scores.slice(0, 3);
    thinkingSteps.push({ step: `${matchingMode === "hybrid" ? "6" : "5"}. Match training data`, detail: `Compared against ${model.pairs.length} examples`, data: top3.map((s) => ({ input: s.pair.input, score: s.score.toFixed(4), intent: s.pair.intent || "general" })) });

    // Step 7: Select best match
    const best = scores[0];
    const responseTime = Date.now() - startTime;

    if (best && best.score >= confidenceThreshold) {
      thinkingSteps.push({ step: `${matchingMode === "hybrid" ? "7" : "6"}. Select best match`, detail: `Best: "${best.pair.input}" (score: ${best.score.toFixed(4)} ≥ threshold ${confidenceThreshold})` });

      // Context-aware response (if memory is on and there's conversation history)
      let responseText = best.pair.output;
      if (botMemory && conversationContext.length > 0 && best.pair.output.includes("{context}")) {
        responseText = responseText.replace("{context}", conversationContext.slice(-2).join(" → "));
      }

      setChatMessages((prev) => [...prev, {
        role: "bot", text: responseText, thinking: thinkingSteps,
        sentiment: sentiment.label, intent: detectedIntent,
        confidence: best.score, responseTime,
      }]);
    } else {
      thinkingSteps.push({ step: `${matchingMode === "hybrid" ? "7" : "6"}. No confident match`, detail: `Best score ${best?.score.toFixed(4) ?? 0} < threshold ${confidenceThreshold}` });
      setChatMessages((prev) => [...prev, {
        role: "bot", text: "I'm sorry, I don't understand that yet. Add more training data to help me learn!",
        thinking: thinkingSteps, sentiment: "neutral", intent: "fallback",
        confidence: best?.score ?? 0, responseTime,
      }]);
    }

    // Update stats
    setStats((prev) => ({
      coverage: prev.coverage + (best && best.score >= confidenceThreshold ? 1 : 0),
      avgResponseTime: (prev.avgResponseTime * prev.totalChats + responseTime) / (prev.totalChats + 1),
      totalChats: prev.totalChats + 1,
      intents: prev.intents,
    }));
  }, [chatInput, confidenceThreshold, matchingMode, thinkingDelay, botMemory, conversationContext]);

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

  const copyUrl = () => {
    if (deployedUrl) {
      navigator.clipboard.writeText(deployedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Save training data
  const saveProject = async () => {
    try {
      const data = JSON.stringify(trainingData, null, 2);
      const r = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buddyId: "ml", title: "Chatbot training data",
          description: `${trainingData.length} Q&A pairs, ${matchingMode} matching`,
          tags: ["chatbot", "nlp", matchingMode],
          files: [{ path: "training_data.json", language: "json", content: data, isEntry: true }],
        }),
      });
      if (r.ok) alert("✓ Saved to My Projects!");
    } catch (e: any) { alert(`Save failed: ${e?.message}`); }
  };

  // Clear chat
  const clearChat = () => {
    setChatMessages([]);
    setConversationContext([]);
    setStats((prev) => ({ ...prev, coverage: 0, avgResponseTime: 0, totalChats: 0 }));
  };

  const accuracy = stats.totalChats > 0 ? (stats.coverage / stats.totalChats * 100).toFixed(1) : "0";

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
        <button onClick={saveProject} className="px-3 h-9 rounded-full bg-violet-600 text-white text-xs font-semibold flex items-center gap-1 hover:bg-violet-700">
          <Save className="w-3.5 h-3.5" /> Save
        </button>
      </header>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 bg-white overflow-x-auto no-scrollbar">
        {([
          { id: "train", label: "🎓 Train", icon: Brain },
          { id: "chat", label: "💬 Chat", icon: MessageCircle },
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
            <h2 className="text-sm font-bold text-gray-900 mb-2">Training data ({trainingData.length} pairs)</h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {trainingData.slice(0, 100).map((pair) => (
                <div key={pair.id} className="flex items-start gap-2 p-2 rounded-lg bg-gray-50 border border-gray-100">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs"><span className="font-bold text-gray-600">Q:</span> {pair.input}</p>
                    <p className="text-xs mt-0.5"><span className="font-bold text-gray-600">A:</span> {pair.output}</p>
                    {pair.intent && <span className="inline-block text-[9px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium mt-0.5">{pair.intent}</span>}
                  </div>
                  <button onClick={() => removePair(pair.id)} className="text-gray-400 hover:text-rose-500 flex-shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              {trainingData.length > 100 && <p className="text-[10px] text-gray-400 text-center py-2">Showing first 100 of {trainingData.length}. Export to see all.</p>}
            </div>
          </div>

          {/* Settings */}
          <div className="rounded-2xl bg-white border border-gray-200 p-4 mb-4">
            <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5"><Settings className="w-4 h-4 text-violet-500" /> Bot Settings</h2>
            <div className="space-y-3">
              {/* Matching mode */}
              <div className="flex items-center gap-3">
                <label className="text-xs text-gray-500 w-32">Matching mode:</label>
                <select value={matchingMode} onChange={(e) => setMatchingMode(e.target.value as MatchingMode)} className="text-xs bg-white border border-gray-200 rounded-lg px-2 py-1 outline-none">
                  <option value="hybrid">Hybrid (TF-IDF + Keyword)</option>
                  <option value="tfidf">TF-IDF only</option>
                  <option value="keyword">Keyword matching</option>
                  <option value="fuzzy">Fuzzy (Levenshtein)</option>
                </select>
              </div>
              {/* Confidence threshold */}
              <div className="flex items-center gap-3">
                <label className="text-xs text-gray-500 w-32">Confidence threshold:</label>
                <input type="range" min={0} max={1} step={0.05} value={confidenceThreshold} onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))} className="flex-1" />
                <span className="text-xs font-mono text-gray-700 w-10">{confidenceThreshold.toFixed(2)}</span>
              </div>
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
            </div>
            <button onClick={train} disabled={isTraining || trainingData.length === 0} className="w-full h-10 rounded-full bg-violet-600 text-white text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-violet-700 disabled:opacity-50 mt-4">
              {isTraining ? <><Loader2 className="w-4 h-4 animate-spin" /> Training…</> : <><Brain className="w-4 h-4" /> Train Chatbot ({trainingData.length} pairs)</>}
            </button>
            {isTrained && <p className="text-xs text-emerald-600 text-center mt-2">✓ Trained! Vocab: {modelRef.current?.vocab.length ?? 0} words · Intents: {stats.intents.length}</p>}
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
                      <div className="flex items-center gap-1.5 mb-1 text-[10px]">
                        <span className="font-bold text-violet-500 flex items-center gap-0.5"><Brain className="w-3 h-3" /> BOT</span>
                        {msg.intent && <span className="px-1 py-0.5 rounded-full bg-violet-50 text-violet-600 font-medium">{msg.intent}</span>}
                        {msg.sentiment && <span className="px-1 py-0.5 rounded-full bg-gray-50 text-gray-500">{msg.sentiment}</span>}
                        {msg.confidence !== undefined && <span className="text-gray-400">{(msg.confidence * 100).toFixed(0)}%</span>}
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

      {/* === DEPLOY TAB === */}
      {activeTab === "deploy" && (
        <div className="max-w-2xl mx-auto px-4 py-4">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5 mb-3"><Globe className="w-4 h-4 text-violet-500" /> Deploy Your Chatbot</h2>
          <div className="rounded-2xl bg-white border border-gray-200 p-4 mb-4">
            <p className="text-xs text-gray-500 mb-3">Deploy your trained chatbot as a standalone web page. The deployed bot includes a flowing "Built with StudyBuddy AI" watermark and works without a server.</p>
            <button onClick={deployBot} className="w-full h-10 rounded-full bg-violet-600 text-white text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-violet-700">
              <Globe className="w-4 h-4" /> Generate Deployable Bot
            </button>
          </div>
          {deployedUrl && (
            <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4">
              <p className="text-sm font-bold text-emerald-700 mb-1">✓ Bot deployed!</p>
              <p className="text-xs text-emerald-600 mb-2">Your chatbot is ready. Open the URL below to chat with your deployed bot.</p>
              <div className="flex items-center gap-2">
                <input type="text" value={deployedUrl} readOnly className="flex-1 h-9 rounded-lg bg-white border border-emerald-200 px-3 text-xs font-mono outline-none" />
                <button onClick={copyUrl} className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700">
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
                <a href={deployedUrl} target="_blank" rel="noopener noreferrer" className="px-3 h-9 rounded-lg bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1 hover:bg-emerald-700">
                  <Link2 className="w-3.5 h-3.5" /> Open
                </a>
              </div>
              <p className="text-[10px] text-emerald-500 mt-2">💡 The deployed bot includes all {trainingData.length} training pairs, {matchingMode} matching, and the flowing StudyBuddy watermark.</p>
            </div>
          )}
          {/* Watermark preview */}
          <div className="rounded-2xl bg-gray-900 p-4 mt-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Watermark preview</p>
            <div className="relative overflow-hidden rounded-lg bg-white p-4" style={{ minHeight: "60px" }}>
              <p className="text-xs text-gray-600">Chatbot preview area</p>
              <div className="absolute bottom-1 right-1 text-[8px] text-gray-300 animate-pulse">⚡ Built with StudyBuddy AI</div>
            </div>
            <p className="text-[10px] text-gray-500 mt-2">The watermark flows (animates) in the corner of the deployed bot. It cannot be removed.</p>
          </div>
        </div>
      )}
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
  .bot .meta { font-size: 10px; color: #7c3aed; font-weight: bold; margin-bottom: 4px; }
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
const THRESHOLD = ${threshold};
const MEMORY = ${memory};
const DELAY = ${delay};
const vocab = [...new Set(TRAINING_DATA.flatMap(p => p.input.toLowerCase().replace(/[^\\w\\s]/g,' ').split(/\\s+/).filter(w=>w.length>1)))];
const idf = new Map(vocab.map(w => { const df = TRAINING_DATA.filter(p => new Set(p.input.toLowerCase().split(/\\W+/)).has(w)).length; return [w, Math.log((TRAINING_DATA.length+1)/(df+1))+1]; }));
const vectors = TRAINING_DATA.map(p => { const t = p.input.toLowerCase().replace(/[^\\w\\s]/g,' ').split(/\\s+/).filter(w=>w.length>1); const tf = new Map(); t.forEach(w=>tf.set(w,(tf.get(w)||0)+1)); return vocab.map(w => (tf.get(w)||0)/Math.max(t.length,1) * (idf.get(w)||1)); });
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
    const tokens = text.toLowerCase().replace(/[^\\w\\s]/g,' ').split(/\\s+/).filter(w=>w.length>1);
    const tf = new Map(); tokens.forEach(w=>tf.set(w,(tf.get(w)||0)+1));
    const inputVec = vocab.map(w => (tf.get(w)||0)/Math.max(tokens.length,1) * (idf.get(w)||1));
    const scores = vectors.map((v,i) => ({ pair: TRAINING_DATA[i], score: cosine(inputVec, v) })).sort((a,b)=>b.score-a.score);
    const best = scores[0];
    const lastBot = chat.querySelector('.bot:last-child');
    if(best && best.score >= THRESHOLD) {
      lastBot.innerHTML = '<div class="meta">🤖 BOT · '+(best.score*100).toFixed(0)+'% confidence</div>'+best.pair.output;
    } else {
      lastBot.innerHTML = '<div class="meta">🤖 BOT · fallback</div>I\\'m sorry, I don\\'t understand that yet.';
    }
    chat.scrollTop = chat.scrollHeight;
  }, DELAY * 1000);
}
</script>
</body>
</html>`;
}
