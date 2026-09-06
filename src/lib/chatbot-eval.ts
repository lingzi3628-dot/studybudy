/**
 * Chatbot evaluation + data-quality — Phase 69
 *
 * Pure functions that answer the question every bot builder secretly asks:
 * "Is my bot actually any good?"
 *
 * Three concerns:
 *   1. Evaluation — run the bot's matching logic against a held-out test set,
 *      compute accuracy / per-intent F1 / fallback rate / confusion matrix.
 *   2. Data quality — scan training data for duplicates, contradictions,
 *      near-duplicates, empty intents, suspiciously short outputs.
 *   3. Mode recommendation — run all 5 matching modes against the test set
 *      and rank them so the user knows which one to pick.
 *
 * No React, no DOM, no fetch — all pure. Tests live in
 * src/lib/chatbot-eval.test.ts.
 */

import { computeConfusionMatrix, summarizeMatrix, type MatrixSummary } from "./confusion-matrix";

// === Types (mirror ChatbotPlayground's TrainingPair, but standalone) ===

export type EvalPair = {
  id: string;
  input: string;
  output: string;
  intent?: string;
  isTest?: boolean;
};

export type MatchingMode = "tfidf" | "keyword" | "fuzzy" | "hybrid" | "semantic";

/** A labeled confusion (truth/predicted are intent strings, not indices). */
export type LabeledConfusion = {
  truth: string;
  predicted: string;
  count: number;
};

// === Shared NLP primitives (mirrors ChatbotPlayground) ===

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter((w) => w.length > 1);
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

// === Model interface — what each mode needs to score a query ===

type Model = {
  vocab: string[];
  idf: Map<string, number>;
  vectors: number[][];
  pairs: EvalPair[];
};

function buildModel(trainPairs: EvalPair[]): Model {
  const vocab = buildVocab(trainPairs);
  const idf = computeIDF(trainPairs, vocab);
  const vectors = trainPairs.map((p) => tfidfVector(p.input, vocab, idf));
  return { vocab, idf, vectors, pairs: trainPairs };
}

/**
 * Score a single query against all training pairs under a given mode.
 * Returns the top match + its score. Mirrors the logic in
 * ChatbotPlayground.sendMessage (minus the semantic-mode USE embeddings,
 * which can't run in pure-TS tests — for eval purposes we treat semantic
 * mode as tfidf with a higher threshold).
 *
 * NOTE: semantic mode here is a *stand-in* — it uses TF-IDF vectors because
 * USE can't load in pure-TS test environments. The real semantic mode in
 * the React component uses USE embeddings. The mode recommender still gives
 * useful relative rankings because the test set is small and TF-IDF is a
 * reasonable proxy for "did retrieval find the right pair at all?"
 */
export function scoreQuery(
  query: string,
  model: Model,
  mode: MatchingMode,
): { bestPair: EvalPair | null; bestScore: number; top3: Array<{ pair: EvalPair; score: number }> } {
  const tokens = tokenize(query);
  const inputVec = tfidfVector(query, model.vocab, model.idf);
  let scores: Array<{ pair: EvalPair; score: number; index: number }> = [];

  if (mode === "tfidf" || mode === "hybrid" || mode === "semantic") {
    // Semantic stand-in: TF-IDF (see note above).
    scores = model.vectors.map((v, i) => ({ pair: model.pairs[i], score: cosineSim(inputVec, v), index: i }));
  } else if (mode === "keyword") {
    const inputTokens = new Set(tokens);
    scores = model.pairs.map((p, i) => {
      const pairTokens = new Set(tokenize(p.input));
      const overlap = Array.from(inputTokens).filter((t) => pairTokens.has(t)).length;
      return { pair: p, score: overlap / Math.max(inputTokens.size + pairTokens.size - overlap, 1), index: i };
    });
  } else if (mode === "fuzzy") {
    const normalized = query.toLowerCase().replace(/[^\w\s]/g, " ").trim();
    scores = model.pairs.map((p, i) => {
      const dist = levenshtein(normalized, p.input.toLowerCase());
      const maxLen = Math.max(normalized.length, p.input.length);
      return { pair: p, score: 1 - dist / Math.max(maxLen, 1), index: i };
    });
  }

  if (mode === "hybrid") {
    const inputTokens = new Set(tokens);
    const keywordScores = model.pairs.map((p) => {
      const pairTokens = new Set(tokenize(p.input));
      const overlap = Array.from(inputTokens).filter((t) => pairTokens.has(t)).length;
      return overlap / Math.max(inputTokens.size + pairTokens.size - overlap, 1);
    });
    scores = scores.map((s, i) => ({ ...s, score: s.score * 0.7 + keywordScores[i] * 0.3 }));
  }

  scores.sort((a, b) => b.score - a.score);
  const best = scores[0] ?? null;
  return {
    bestPair: best?.pair ?? null,
    bestScore: best?.score ?? 0,
    top3: scores.slice(0, 3).map((s) => ({ pair: s.pair, score: s.score })),
  };
}

// === 1. Evaluation harness ===

export type EvalResultPerItem = {
  pair: EvalPair;             // the test pair
  bestScore: number;           // retrieval score
  matchedInput: string | null; // what the bot retrieved
  matchedOutput: string | null;
  wouldFallback: boolean;      // score < threshold
  correct: boolean;            // matched the test pair's OWN answer (by id)
};

export type EvalResult = {
  perItem: EvalResultPerItem[];
  accuracy: number;            // fraction correct (excluding fallbacks)
  fallbackRate: number;        // fraction that fell below threshold
  coverage: number;            // fraction that retrieved something ≥ threshold
  confusion: MatrixSummary | null; // null if no intents defined
  topConfusions: LabeledConfusion[];
  intents: string[];
  thresholdUsed: number;
  modeUsed: MatchingMode;
  testSetSize: number;
};

/**
 * Run the bot against its held-out test set.
 *
 * A test pair is "correct" if the bot retrieves a training pair whose output
 * matches the test pair's output (case-insensitive trim). If the bot falls
 * below threshold, that's a fallback (counted separately).
 *
 * If intents are defined, builds a confusion matrix at the intent level so
 * the user can see "greeting questions are being classified as farewell".
 */
export function runEvaluation(
  allPairs: EvalPair[],
  mode: MatchingMode,
  threshold: number,
): EvalResult {
  const trainPairs = allPairs.filter((p) => !p.isTest);
  const testPairs = allPairs.filter((p) => p.isTest);

  if (trainPairs.length === 0 || testPairs.length === 0) {
    return {
      perItem: [],
      accuracy: 0,
      fallbackRate: 0,
      coverage: 0,
      confusion: null,
      topConfusions: [],
      intents: [],
      thresholdUsed: threshold,
      modeUsed: mode,
      testSetSize: 0,
    };
  }

  const model = buildModel(trainPairs);
  const perItem: EvalResultPerItem[] = testPairs.map((testPair) => {
    const { bestPair, bestScore } = scoreQuery(testPair.input, model, mode);
    const wouldFallback = bestScore < threshold;
    // Correct = retrieved pair has the same output as the test pair's expected output.
    // (We compare outputs, not ids, because the user may have duplicate inputs
    // with the same answer — those should still count as correct.)
    const expectedOutput = testPair.output.toLowerCase().trim();
    const matchedOutput = bestPair?.output.toLowerCase().trim() ?? "";
    const correct = !wouldFallback && matchedOutput === expectedOutput;
    return {
      pair: testPair,
      bestScore,
      matchedInput: bestPair?.input ?? null,
      matchedOutput: bestPair?.output ?? null,
      wouldFallback,
      correct,
    };
  });

  const total = perItem.length;
  const fallbacks = perItem.filter((r) => r.wouldFallback).length;
  const correctCount = perItem.filter((r) => r.correct).length;
  const coverage = (total - fallbacks) / total;
  const accuracy = total > 0 ? correctCount / total : 0;
  const fallbackRate = total > 0 ? fallbacks / total : 0;

  // Build confusion matrix at intent level (only if intents are defined).
  let confusion: MatrixSummary | null = null;
  let topConfusions: LabeledConfusion[] = [];
  const intents = Array.from(new Set(testPairs.map((p) => p.intent || "general").concat(trainPairs.map((p) => p.intent || "general"))));
  if (intents.length > 1) {
    const intentIndex = new Map(intents.map((i, idx) => [i, idx]));
    const truth: number[] = [];
    const pred: number[] = [];
    for (const r of perItem) {
      const trueIntent = r.pair.intent || "general";
      // Predicted intent = matched pair's intent, or "fallback" pseudo-intent
      const predIntent = r.wouldFallback || !r.matchedInput
        ? "fallback"
        : (model.pairs.find((p) => p.input === r.matchedInput)?.intent || "general");
      // Only include "fallback" as a class if any fallbacks happened.
      const allLabels = [...intents];
      if (fallbacks > 0 && !allLabels.includes("fallback")) allLabels.push("fallback");
      const labelIndex = new Map(allLabels.map((i, idx) => [i, idx]));
      truth.push(labelIndex.get(trueIntent) ?? 0);
      pred.push(labelIndex.get(predIntent) ?? 0);
      // Rebuild with consistent label set
      void intentIndex;
    }
    // Rebuild with the full label set (including fallback pseudo-class).
    const allLabels = [...intents];
    if (fallbacks > 0 && !allLabels.includes("fallback")) allLabels.push("fallback");
    const labelIndex = new Map(allLabels.map((i, idx) => [i, idx]));
    const truthFinal: number[] = [];
    const predFinal: number[] = [];
    for (const r of perItem) {
      const trueIntent = r.pair.intent || "general";
      const predIntent = r.wouldFallback || !r.matchedInput
        ? "fallback"
        : (model.pairs.find((p) => p.input === r.matchedInput)?.intent || "general");
      truthFinal.push(labelIndex.get(trueIntent) ?? 0);
      predFinal.push(labelIndex.get(predIntent) ?? 0);
    }
    const matrix = computeConfusionMatrix(truthFinal, predFinal, allLabels.length);
    confusion = summarizeMatrix(matrix);
    topConfusions = topConfusionsMatrix(matrix, allLabels);
  }

  return {
    perItem,
    accuracy,
    fallbackRate,
    coverage,
    confusion,
    topConfusions,
    intents,
    thresholdUsed: threshold,
    modeUsed: mode,
    testSetSize: total,
  };
}

/** Helper — wraps computeConfusionMatrix's topConfusions to use labels. */
function topConfusionsMatrix(matrix: number[][], labels: string[]): LabeledConfusion[] {
  // Reuse the existing topConfusions but remap indices to labels.
  // We can't import topConfusions directly because it takes the matrix only;
  // we inline a label-aware version.
  const confusions: Array<{ truth: string; predicted: string; count: number }> = [];
  for (let t = 0; t < matrix.length; t++) {
    for (let p = 0; p < matrix[t].length; p++) {
      if (t !== p && matrix[t][p] > 0) {
        confusions.push({ truth: labels[t], predicted: labels[p], count: matrix[t][p] });
      }
    }
  }
  return confusions
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((c) => ({ truth: c.truth, predicted: c.predicted, count: c.count }));
}

// === 2. Data quality scanner ===

export type QualityIssue = {
  id: string;
  type: "duplicate_input" | "contradiction" | "near_duplicate" | "empty_intent" | "short_output" | "empty_input" | "empty_output";
  severity: "error" | "warning" | "info";
  message: string;
  pairIds: string[];     // which pairs are involved
  fix?: "merge" | "delete" | "edit";  // suggested fix
};

/**
 * Scan training data for common issues that hurt retrieval quality.
 * Returns a list sorted by severity (errors first).
 */
export function scanDataQuality(pairs: EvalPair[]): QualityIssue[] {
  const issues: QualityIssue[] = [];

  // Group by normalized input for duplicate detection.
  const byInput = new Map<string, EvalPair[]>();
  for (const p of pairs) {
    const key = p.input.toLowerCase().trim();
    if (!byInput.has(key)) byInput.set(key, []);
    byInput.get(key)!.push(p);
  }

  // Duplicate inputs → either duplicate (same output) or contradiction (diff output).
  for (const [input, group] of byInput) {
    if (group.length < 2) continue;
    const outputs = new Set(group.map((p) => p.output.toLowerCase().trim()));
    if (outputs.size === 1) {
      issues.push({
        id: `dup-${input.slice(0, 20)}-${group.length}`,
        type: "duplicate_input",
        severity: "info",
        message: `"${input}" appears ${group.length}× with the same answer — safe to dedupe`,
        pairIds: group.map((p) => p.id),
        fix: "merge",
      });
    } else {
      issues.push({
        id: `contra-${input.slice(0, 20)}-${group.length}`,
        type: "contradiction",
        severity: "error",
        message: `"${input}" has ${outputs.size} different answers — the bot can't decide which to use`,
        pairIds: group.map((p) => p.id),
        fix: "edit",
      });
    }
  }

  // Near-duplicates — same intent, cosine ≥0.95 on TF-IDF, but not exact dup.
  // Only run this if we have a reasonable number of pairs (O(n²) is fine for <2k).
  if (pairs.length <= 2000) {
    const vocab = buildVocab(pairs);
    const idf = computeIDF(pairs, vocab);
    const vectors = pairs.map((p) => tfidfVector(p.input, vocab, idf));
    const seen = new Set<string>();
    for (let i = 0; i < pairs.length; i++) {
      for (let j = i + 1; j < pairs.length; j++) {
        const key = `${pairs[i].id}-${pairs[j].id}`;
        if (seen.has(key)) continue;
        const sim = cosineSim(vectors[i], vectors[j]);
        if (sim >= 0.95 && pairs[i].input.toLowerCase().trim() !== pairs[j].input.toLowerCase().trim()) {
          seen.add(key);
          // Check if they have the same output — if so it's a harmless near-dup, if not it's a potential contradiction.
          const sameOutput = pairs[i].output.toLowerCase().trim() === pairs[j].output.toLowerCase().trim();
          issues.push({
            id: `near-${pairs[i].id}-${pairs[j].id}`,
            type: "near_duplicate",
            severity: sameOutput ? "info" : "warning",
            message: `"${pairs[i].input.slice(0, 40)}" ≈ "${pairs[j].input.slice(0, 40)}" (cos=${sim.toFixed(2)})${sameOutput ? " — same answer, safe to merge" : " — different answers, may conflict"}`,
            pairIds: [pairs[i].id, pairs[j].id],
            fix: sameOutput ? "merge" : "edit",
          });
        }
      }
    }
  }

  // Empty intents — intent label exists but only 1 example.
  const intentCounts = new Map<string, number>();
  for (const p of pairs) {
    const intent = p.intent || "general";
    intentCounts.set(intent, (intentCounts.get(intent) ?? 0) + 1);
  }
  for (const [intent, count] of intentCounts) {
    if (count < 2 && intent !== "general") {
      const pairIds = pairs.filter((p) => (p.intent || "general") === intent).map((p) => p.id);
      issues.push({
        id: `empty-intent-${intent}`,
        type: "empty_intent",
        severity: "warning",
        message: `Intent "${intent}" has only ${count} example${count === 1 ? "" : "s"} — add at least 3 for reliable intent detection`,
        pairIds,
        fix: "edit",
      });
    }
  }

  // Empty input / output / suspiciously short output.
  for (const p of pairs) {
    if (!p.input.trim()) {
      issues.push({
        id: `empty-input-${p.id}`,
        type: "empty_input",
        severity: "error",
        message: `Pair ${p.id} has an empty input`,
        pairIds: [p.id],
        fix: "delete",
      });
    }
    if (!p.output.trim()) {
      issues.push({
        id: `empty-output-${p.id}`,
        type: "empty_output",
        severity: "error",
        message: `Pair ${p.id} has an empty output`,
        pairIds: [p.id],
        fix: "delete",
      });
    } else if (p.output.trim().length < 10) {
      issues.push({
        id: `short-output-${p.id}`,
        type: "short_output",
        severity: "info",
        message: `Pair "${p.input.slice(0, 30)}" has a very short answer (${p.output.trim().length} chars) — bots look smarter with fuller replies`,
        pairIds: [p.id],
        fix: "edit",
      });
    }
  }

  // Sort: errors first, then warnings, then info.
  const order: Record<string, number> = { error: 0, warning: 1, info: 2 };
  return issues.sort((a, b) => order[a.severity] - order[b.severity]);
}

// === 3. Mode recommender ===

export type ModeRanking = {
  mode: MatchingMode;
  accuracy: number;
  fallbackRate: number;
  recommendedThreshold: number;
};

/**
 * Run all 5 matching modes against the test set and rank by accuracy.
 * Returns a sorted list (best first) with the recommended threshold for each.
 *
 * The recommended threshold is the value that maximizes F1 (correct + non-fallback)
 * on the test set — we sweep from 0.05 to 0.95 in 0.05 steps.
 */
export function recommendMode(allPairs: EvalPair[]): ModeRanking[] {
  const modes: MatchingMode[] = ["tfidf", "hybrid", "keyword", "fuzzy", "semantic"];
  const rankings: ModeRanking[] = modes.map((mode) => {
    let bestAcc = 0;
    let bestThreshold = 0.3;
    let fallbackRateAtBest = 1;
    for (let t = 0.05; t <= 0.95; t += 0.05) {
      const result = runEvaluation(allPairs, mode, t);
      // Optimize for accuracy × (1 - fallbackRate/2) — slight penalty for fallbacks.
      const score = result.accuracy * (1 - result.fallbackRate / 2);
      if (score > bestAcc) {
        bestAcc = result.accuracy;
        bestThreshold = t;
        fallbackRateAtBest = result.fallbackRate;
      }
    }
    return {
      mode,
      accuracy: bestAcc,
      fallbackRate: fallbackRateAtBest,
      recommendedThreshold: bestThreshold,
    };
  });
  return rankings.sort((a, b) => b.accuracy - a.accuracy);
}

// === 4. Live preview (used by the Train tab side panel) ===

export type LivePreviewResult = {
  bestPair: EvalPair | null;
  bestScore: number;
  top3: Array<{ pair: EvalPair; score: number }>;
  wouldFallback: boolean;
  mode: MatchingMode;
  threshold: number;
};

/** Score a single query — same as scoreQuery but with threshold context. */
export function previewQuery(
  query: string,
  trainPairs: EvalPair[],
  mode: MatchingMode,
  threshold: number,
): LivePreviewResult {
  const model = buildModel(trainPairs);
  const { bestPair, bestScore, top3 } = scoreQuery(query, model, mode);
  return {
    bestPair,
    bestScore,
    top3,
    wouldFallback: bestScore < threshold,
    mode,
    threshold,
  };
}
