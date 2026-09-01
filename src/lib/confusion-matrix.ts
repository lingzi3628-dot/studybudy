/**
 * Confusion Matrix — Phase 57 (MLBuddy 2.0)
 *
 * Pure evaluation metrics for classification models: the confusion
 * matrix itself, per-class precision/recall/F1, overall accuracy,
 * macro-F1, and a ranked list of the most frequent confusions.
 *
 * Convention: matrix[truth][predicted] — rows are the true class,
 * columns are what the model said (sklearn convention).
 */

export function computeConfusionMatrix(
  truth: number[],
  pred: number[],
  numClasses: number
): number[][] {
  if (truth.length !== pred.length) {
    throw new Error(`length mismatch: ${truth.length} truth vs ${pred.length} predictions`);
  }
  const matrix: number[][] = Array.from({ length: numClasses }, () =>
    new Array(numClasses).fill(0)
  );
  for (let i = 0; i < truth.length; i++) {
    const t = truth[i];
    const p = pred[i];
    if (!Number.isInteger(t) || t < 0 || t >= numClasses) {
      throw new Error(`truth label out of range at ${i}: ${t}`);
    }
    if (!Number.isInteger(p) || p < 0 || p >= numClasses) {
      throw new Error(`predicted label out of range at ${i}: ${p}`);
    }
    matrix[t][p] += 1;
  }
  return matrix;
}

export type ClassMetrics = {
  class: number;
  precision: number; // 0-1
  recall: number;    // 0-1
  f1: number;        // 0-1
  support: number;   // true instances of this class
};

export type MatrixSummary = {
  accuracy: number;
  macroF1: number;
  perClass: ClassMetrics[];
  correct: number;
  total: number;
};

function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

export function summarizeMatrix(matrix: number[][]): MatrixSummary {
  const numClasses = matrix.length;
  let correct = 0;
  let total = 0;
  const perClass: ClassMetrics[] = [];

  for (let c = 0; c < numClasses; c++) {
    const tp = matrix[c][c] || 0;
    let predictedTotal = 0; // column sum
    let support = 0; // row sum
    for (let r = 0; r < numClasses; r++) {
      predictedTotal += matrix[r][c] || 0;
      support += matrix[c][r] || 0;
    }
    const precision = safeDiv(tp, predictedTotal);
    const recall = safeDiv(tp, support);
    perClass.push({
      class: c,
      precision,
      recall,
      f1: safeDiv(2 * precision * recall, precision + recall),
      support,
    });
    correct += tp;
    total += support;
  }

  const macroF1 = total === 0 ? 0 : perClass.reduce((s, c) => s + c.f1, 0) / numClasses;
  return {
    accuracy: total === 0 ? 0 : correct / total,
    macroF1,
    perClass,
    correct,
    total,
  };
}

export type Confusion = {
  truth: number;
  predicted: number;
  count: number;
  /** count / row total — how much of the true class is misrouted here */
  rate: number;
};

/**
 * The k largest off-diagonal cells, most frequent first. Useful for the
 * "what does my model get wrong?" panel.
 */
export function topConfusions(matrix: number[][], k = 5): Confusion[] {
  const out: Confusion[] = [];
  for (let t = 0; t < matrix.length; t++) {
    const rowTotal = matrix[t].reduce((s, v) => s + v, 0);
    for (let p = 0; p < matrix.length; p++) {
      if (p === t) continue;
      const count = matrix[t][p];
      if (count > 0) out.push({ truth: t, predicted: p, count, rate: safeDiv(count, rowTotal) });
    }
  }
  out.sort((a, b) => b.count - a.count || a.truth - b.truth || a.predicted - b.predicted);
  return out.slice(0, k);
}
