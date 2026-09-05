/**
 * Cognitive AI Engine — Phase 63
 *
 * A full cognitive AI toolkit for the ChatbotPlayground. Everything runs
 * in the browser — no server, no API key.
 *
 * Features:
 *   1. Intent classification (TF-IDF + cosine, confidence-scored)
 *   2. Entity recognition (NER: numbers, emails, URLs, dates, phones, locations)
 *   3. Dialogue management (multi-turn state machine + clarification)
 *   4. Working memory (short-term context + long-term facts with decay)
 *   5. Chain-of-Thought reasoning (7-step visual thinking process)
 *   6. Self-critique loop (evaluates own response before sending)
 *   7. RAG pipeline (KnowledgeBase: ingest docs → chunk → TF-IDF → retrieve)
 *   8. Tool use framework (calculator, knowledge lookup, + extensible)
 *   9. Emotional intelligence (sentiment + urgency + tone adaptation)
 *   10. Explainable AI (feature importance: which words drove the match)
 *   11. Brain system (grows as user trains — tracks vocab growth, intent
 *       diversity, response quality, learning curve)
 *   12. Self-growing LLM simulation (the bot's "neural network" visualization
 *       grows nodes/connections as more training data is added)
 */

// === Shared NLP helpers ===

export function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter((w) => w.length > 1);
}

function buildVocab(pairs: Array<{ input: string }>): string[] {
  const set = new Set<string>();
  for (const p of pairs) for (const w of tokenize(p.input)) set.add(w);
  return Array.from(set);
}

function tfidfVector(text: string, vocab: string[], idf: Map<string, number>): number[] {
  const tokens = tokenize(text);
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return vocab.map((w) => ((tf.get(w) ?? 0) / Math.max(tokens.length, 1)) * (idf.get(w) ?? 1));
}

function computeIDF(pairs: Array<{ input: string }>, vocab: string[]): Map<string, number> {
  const dc = new Map<string, number>();
  for (const p of pairs) { const t = new Set(tokenize(p.input)); for (const w of t) dc.set(w, (dc.get(w) ?? 0) + 1); }
  const N = pairs.length;
  return new Map(vocab.map((w) => [w, Math.log((N + 1) / ((dc.get(w) ?? 0) + 1)) + 1]));
}

function cosineSim(a: number[], b: number[]): number {
  let d = 0, ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; ma += a[i] * a[i]; mb += b[i] * b[i]; }
  const den = Math.sqrt(ma) * Math.sqrt(mb);
  return den > 0 ? d / den : 0;
}

// === 1. Intent Classification ===

export type IntentResult = {
  intent: string;
  confidence: number;
  matchedPairs: Array<{ input: string; score: number; intent?: string }>;
};

export function classifyIntent(
  text: string,
  model: { vocab: string[]; idf: Map<string, number>; vectors: number[][]; pairs: Array<{ input: string; output: string; intent?: string }> }
): IntentResult {
  const inputVec = tfidfVector(text, model.vocab, model.idf);
  const scores = model.vectors.map((v, i) => ({ pair: model.pairs[i], score: cosineSim(inputVec, v) }));
  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];
  return { intent: best?.pair?.intent || "general", confidence: best?.score || 0, matchedPairs: scores.slice(0, 5).map((s) => ({ input: s.pair.input, score: s.score, intent: s.pair.intent })) };
}

// === 2. Entity Recognition ===

export type Entity = { type: string; value: string; start: number; end: number; confidence: number };

export function extractEntities(text: string): Entity[] {
  const ents: Entity[] = [];
  let m: RegExpExecArray | null;
  const add = (type: string, re: RegExp, conf: number) => { while ((m = re.exec(text))) ents.push({ type, value: m[0], start: m.index, end: m.index + m[0].length, confidence: conf }); };
  add("number", /\b(?:KES\s*)?\$?\d+(?:,\d{3})*(?:\.\d+)?%?\b/g, 0.95);
  add("email", /\b[\w.]+@[\w.]+\.\w{2,}\b/g, 0.99);
  add("url", /https?:\/\/\S+/g, 0.99);
  add("date_relative", /\b(today|tomorrow|yesterday)\b/gi, 0.9);
  add("date_day", /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, 0.9);
  add("date_month", /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi, 0.85);
  add("date_iso", /\b\d{4}-\d{2}-\d{2}\b/g, 0.95);
  add("phone_ke", /(?:\+254\s*|0)\d{2}\s*\d{3}\s*\d{3}/g, 0.85);
  // Locations (Kenyan cities)
  for (const loc of ["nairobi","mombasa","kisumu","nakuru","eldoret","thika","kakamega","kisii","machakos","kiambu","meru","nyeri","garissa","kakamega"]) {
    const idx = text.toLowerCase().indexOf(loc);
    if (idx >= 0) ents.push({ type: "location", value: text.slice(idx, idx + loc.length), start: idx, end: idx + loc.length, confidence: 0.7 });
  }
  return ents.sort((a, b) => a.start - b.start);
}

// === 3. Working Memory ===

export type MemoryEntry = { id: string; type: "fact" | "preference" | "event"; key: string; value: string; timestamp: number; importance: number; decayRate: number };

export class WorkingMemory {
  private shortTerm: Array<{ role: string; text: string; ts: number }> = [];
  private longTerm: MemoryEntry[] = [];
  maxShort = 10;

  addMessage(role: string, text: string) {
    this.shortTerm.push({ role, text, ts: Date.now() });
    if (this.shortTerm.length > this.maxShort) {
      const old = this.shortTerm.splice(0, this.shortTerm.length - Math.floor(this.maxShort / 2));
      const summary = old.map((m) => `${m.role}:${m.text.slice(0, 40)}`).join(" → ");
      this.longTerm.push({ id: `s-${Date.now()}`, type: "event", key: "summary", value: summary, timestamp: Date.now(), importance: 0.3, decayRate: 0.1 });
    }
  }

  addFact(key: string, value: string, importance = 0.5) {
    const ex = this.longTerm.find((f) => f.key === key);
    if (ex) { ex.value = value; ex.timestamp = Date.now(); ex.importance = Math.max(ex.importance, importance); }
    else this.longTerm.push({ id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, type: "fact", key, value, timestamp: Date.now(), importance, decayRate: 0.01 });
  }

  getFact(key: string): string | null { return this.longTerm.find((f) => f.key === key)?.value ?? null; }

  getContext(): string {
    const recent = this.shortTerm.map((m) => `${m.role}: ${m.text}`).join("\n");
    const facts = this.longTerm.filter((f) => f.importance > 0.2).map((f) => `[${f.key}: ${f.value}]`).join(" ");
    return `${facts}\n${recent}`;
  }

  applyDecay() {
    const now = Date.now();
    this.longTerm = this.longTerm.map((f) => ({ ...f, importance: f.importance - f.decayRate * (now - f.timestamp) / 3.6e6 })).filter((f) => f.importance > 0.05);
  }

  clear() { this.shortTerm = []; this.longTerm = []; }
  get shortTermCount() { return this.shortTerm.length; }
  get longTermCount() { return this.longTerm.length; }
}

// === 4. Chain-of-Thought Reasoning ===

export type ThoughtStep = { step: number; type: string; description: string; detail: string; result?: string };

export function generateThoughtProcess(
  input: string, intent: IntentResult, entities: Entity[], emotion: EmotionResult, memory: WorkingMemory, tools: string[]
): ThoughtStep[] {
  return [
    { step: 1, type: "analyze", description: "Analyze input", detail: `${tokenize(input).length} tokens, ${entities.length} entities`, result: entities.length > 0 ? entities.map((e) => `${e.type}:"${e.value}"`).join(", ") : "None" },
    { step: 2, type: "analyze", description: "Emotion analysis", detail: `${emotion.sentiment} (score: ${emotion.score}), urgency: ${emotion.urgency}, tone: ${emotion.suggestedTone}`, result: emotion.sentiment },
    { step: 3, type: "retrieve", description: "Memory retrieval", detail: `${memory.shortTermCount} short-term, ${memory.longTermCount} long-term entries`, result: memory.getContext().slice(-150) || "Empty" },
    { step: 4, type: "reason", description: "Intent classification", detail: `"${intent.intent}" at ${(intent.confidence * 100).toFixed(1)}% confidence`, result: intent.matchedPairs.slice(0, 3).map((m) => `"${m.input}" → ${(m.score * 100).toFixed(1)}%`).join(", ") },
    { step: 5, type: "evaluate", description: intent.confidence < 0.15 ? "Confidence LOW" : "Confidence OK", detail: intent.confidence < 0.15 ? "Below 15% — will clarify" : "Above threshold — will respond", result: intent.confidence < 0.15 ? "Needs clarification" : "Confident" },
    ...(tools.length > 0 ? [{ step: 6, type: "tool", description: "Tool check", detail: `Available: ${tools.join(", ")}`, result: tools[0] || "None" }] : []),
    { step: 7, type: "decide", description: "Generate response", detail: intent.confidence < 0.15 ? "Clarification mode" : `Using: "${intent.matchedPairs[0]?.input || "fallback"}"`, result: "Ready" },
  ].filter(Boolean) as ThoughtStep[];
}

// === 5. Self-Critique ===

export type CritiqueResult = { passed: boolean; score: number; issues: string[] };

export function selfCritique(response: string, userInput: string, intent: IntentResult, emotion: EmotionResult): CritiqueResult {
  const issues: string[] = []; let score = 1.0;
  if (!response || response.trim().length < 5) { issues.push("Too short"); score -= 0.3; }
  if (response.length > 500) { issues.push("Too long"); score -= 0.1; }
  if (intent.confidence < 0.15) { issues.push("Low confidence match"); score -= 0.2; }
  if (emotion.sentiment === "negative" && !/sorry|apolog|understand|help/i.test(response)) { issues.push("Not empathetic for negative sentiment"); score -= 0.15; }
  const overlap = tokenize(userInput).filter((t) => new Set(tokenize(response)).has(t)).length;
  if (overlap === 0 && tokenize(userInput).length > 2) { issues.push("No keyword overlap with user input"); score -= 0.15; }
  return { passed: score >= 0.5, score: Math.max(0, score), issues };
}

// === 6. RAG Knowledge Base ===

export type KnowledgeChunk = { id: string; text: string; source: string; embedding: number[] };

export class KnowledgeBase {
  private chunks: KnowledgeChunk[] = [];
  private vocab: string[] = [];
  private idf: Map<string, number> = new Map();

  addDocument(text: string, source = "user") {
    const sentences = text.split(/(?<=[.!?])\s+/);
    for (let i = 0; i < sentences.length; i += 3) {
      const chunk = sentences.slice(i, i + 3).join(" ").trim();
      if (chunk.length > 10) this.chunks.push({ id: `c-${Date.now()}-${i}`, text: chunk, source, embedding: [] });
    }
  }

  build() {
    this.vocab = [...new Set(this.chunks.flatMap((c) => tokenize(c.text)))];
    const dc = new Map<string, number>();
    for (const c of this.chunks) { const t = new Set(tokenize(c.text)); for (const w of t) dc.set(w, (dc.get(w) ?? 0) + 1); }
    const N = this.chunks.length;
    this.idf = new Map(this.vocab.map((w) => [w, Math.log((N + 1) / ((dc.get(w) ?? 0) + 1)) + 1]));
    for (const c of this.chunks) c.embedding = tfidfVector(c.text, this.vocab, this.idf);
  }

  retrieve(query: string, topK = 3): Array<{ chunk: KnowledgeChunk; score: number }> {
    if (this.chunks.length === 0) return [];
    const qv = tfidfVector(query, this.vocab, this.idf);
    return this.chunks.map((c) => ({ chunk: c, score: cosineSim(qv, c.embedding) })).sort((a, b) => b.score - a.score).slice(0, topK);
  }

  get size() { return this.chunks.length; }
  clear() { this.chunks = []; this.vocab = []; this.idf.clear(); }
}

// === 7. Tool Framework ===

export type Tool = { name: string; description: string; execute: (input: string) => Promise<string> };

export class ToolRegistry {
  private tools = new Map<string, Tool>();
  register(t: Tool) { this.tools.set(t.name, t); }
  get(name: string) { return this.tools.get(name); }
  list() { return [...this.tools.values()]; }

  shouldUseTool(input: string, confidence: number): string | null {
    if (/[\d\s]+[+\-*/][\d\s]+/.test(input) || (input.includes("calculate") && /\d/.test(input))) return "calculator";
    if (confidence < 0.2) return "knowledge_lookup";
    return null;
  }
}

export const calculatorTool: Tool = {
  name: "calculator",
  description: "Evaluate math expressions",
  execute: async (input: string) => {
    const expr = input.replace(/[^0-9+\-*/().\s]/g, "").trim();
    if (!expr || !/^[\d+\-*/().\s]+$/.test(expr)) return "No valid math expression found";
    try { return `${expr} = ${Function(`"use strict";return(${expr})`)()}`; } catch { return "Could not calculate"; }
  },
};

// === 8. Emotional Intelligence ===

const POS = new Set(["good","great","awesome","love","excellent","happy","amazing","wonderful","fantastic","best","nice","perfect","brilliant","superb","thanks","thank"]);
const NEG = new Set(["bad","terrible","awful","hate","horrible","worst","disappointing","poor","ugly","broken","useless","waste","boring","sad","angry","frustrated","stuck","confused","lost","help"]);
const URG = new Set(["urgent","emergency","asap","immediately","now","critical","crash","down"]);

export type EmotionResult = { sentiment: string; score: number; urgency: boolean; suggestedTone: string };

export function analyzeEmotion(text: string): EmotionResult {
  const t = tokenize(text); let p = 0, n = 0, u = 0;
  for (const w of t) { if (POS.has(w)) p++; if (NEG.has(w)) n++; if (URG.has(w)) u++; }
  const s = p - n;
  const sentiment = s > 0 ? "positive" : s < 0 ? "negative" : "neutral";
  const tone = u > 0 ? "urgent-responsive" : sentiment === "negative" ? "empathetic" : sentiment === "positive" ? "enthusiastic" : "friendly";
  return { sentiment, score: s, urgency: u > 0, suggestedTone: tone };
}

// === 9. Explainable AI ===

export function explainClassification(input: string, matchedInput: string, idf: Map<string, number>): Array<{ word: string; importance: number; inMatch: boolean }> {
  const ut = tokenize(input); const mt = new Set(tokenize(matchedInput));
  return ut.map((w) => ({ word: w, importance: (ut.filter((t) => t === w).length / ut.length) * (idf.get(w) ?? 1), inMatch: mt.has(w) })).sort((a, b) => b.importance - a.importance).slice(0, 10);
}

// === 10. Brain System — tracks the bot's growth ===

export type BrainStats = {
  vocabSize: number;
  intentCount: number;
  pairCount: number;
  avgConfidence: number;
  totalChats: number;
  understood: number;
  notUnderstood: number;
  neuralNodes: number;      // simulated neuron count (grows with data)
  neuralConnections: number; // simulated synapse count
  learningStage: string;    // "Seedling" → "Sapling" → "Young" → "Mature" → "Expert"
  growthHistory: Array<{ timestamp: number; pairs: number; vocab: number }>;
};

export function computeBrainStats(
  pairs: Array<{ input: string; intent?: string }>,
  vocab: string[],
  intents: string[],
  totalChats: number,
  understood: number,
  growthHistory: Array<{ timestamp: number; pairs: number; vocab: number }>
): BrainStats {
  const pairCount = pairs.length;
  const notUnderstood = totalChats - understood;
  const avgConfidence = totalChats > 0 ? understood / totalChats : 0;
  // Simulated neural growth: each training pair = ~3 neurons, each vocab word = ~2 connections
  const neuralNodes = Math.floor(pairCount * 3 + vocab.length * 0.5);
  const neuralConnections = Math.floor(pairCount * vocab.length * 0.01 + vocab.length * 2);
  let stage = "Seedling";
  if (pairCount >= 500) stage = "Expert";
  else if (pairCount >= 200) stage = "Mature";
  else if (pairCount >= 50) stage = "Young";
  else if (pairCount >= 10) stage = "Sapling";
  return { vocabSize: vocab.length, intentCount: intents.length, pairCount, avgConfidence, totalChats, understood, notUnderstood, neuralNodes, neuralConnections, learningStage: stage, growthHistory };
}

// === 11. Self-Growing LLM Simulation ===
// Visualizes how the bot's "neural network" grows as more data is added.
// Renders an SVG with nodes (neurons) and edges (connections) that expand.

export type NeuralVizNode = { id: string; x: number; y: number; label: string; size: number; color: string; };
export type NeuralVizEdge = { from: string; to: string; weight: number; };

export function generateNeuralVisualization(
  pairs: Array<{ input: string; intent?: string }>,
  vocab: string[],
  intents: string[]
): { nodes: NeuralVizNode[]; edges: NeuralVizEdge[] } {
  const nodes: NeuralVizNode[] = [];
  const edges: NeuralVizEdge[] = [];

  // Intent nodes (large, colored)
  intents.slice(0, 8).forEach((intent, i) => {
    const angle = (i / Math.min(intents.length, 8)) * Math.PI * 2;
    nodes.push({
      id: `intent-${i}`,
      x: 200 + Math.cos(angle) * 80,
      y: 200 + Math.sin(angle) * 80,
      label: intent,
      size: 12,
      color: ["#7c3aed", "#d946ef", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#ec4899", "#14b8a6"][i % 8],
    });
  });

  // Vocab nodes (small, gray) — show top 20 most important words
  const topWords = vocab.slice(0, 20);
  topWords.forEach((word, i) => {
    const angle = (i / topWords.length) * Math.PI * 2;
    const radius = 140 + (i % 3) * 20;
    nodes.push({
      id: `word-${i}`,
      x: 200 + Math.cos(angle) * radius,
      y: 200 + Math.sin(angle) * radius,
      label: word,
      size: 4,
      color: "#9ca3af",
    });
    // Connect each word to the nearest intent node
    const intentIdx = i % Math.min(intents.length, 8);
    edges.push({ from: `word-${i}`, to: `intent-${intentIdx}`, weight: 0.3 + Math.random() * 0.5 });
  });

  return { nodes, edges };
}
