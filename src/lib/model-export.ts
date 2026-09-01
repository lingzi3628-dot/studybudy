/**
 * Model Export — Phase 57 (MLBuddy 2.0)
 *
 * Two artifacts generated from a trained playground model:
 *
 *   1. kerasPythonFromSpec() — the equivalent Keras training script, so
 *      the learner can take the browser model to a real Python
 *      environment. Mirrors buildModel() in ml-engine.ts layer-for-layer.
 *
 *   2. buildModelCard() — a one-page markdown model card (architecture,
 *      dataset, training config, metrics, intended use, limitations)
 *      following the "model card" reporting pattern.
 */

import type { ModelSpec, LayerSpec } from "./ml-engine";

// ---------------------------------------------------------------------
// Keras code generation
// ---------------------------------------------------------------------

const ACTIVATION_PY: Record<string, string> = {
  relu: "relu",
  sigmoid: "sigmoid",
  tanh: "tanh",
  softmax: "softmax",
  linear: "linear",
};

const LOSS_PY: Record<string, string> = {
  meanSquaredError: "mse",
  binaryCrossentropy: "binary_crossentropy",
  categoricalCrossentropy: "categorical_crossentropy",
};

const METRICS_PY: Record<string, string> = {
  accuracy: "accuracy",
  mse: "mse",
};

function pyStr(s: string): string {
  return `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

/** Python tuple form of a shape: [28, 28, 1] → "(28, 28, 1)" */
function pyShape(shape: number[]): string {
  return `(${shape.join(", ")})`;
}

function layerToPython(layer: LayerSpec, isFirst: boolean): string[] {
  const inputShape = isFirst && layer.inputShape ? `, input_shape=${pyShape(layer.inputShape)}` : "";
  switch (layer.type) {
    case "dense":
      return [
        `    Dense(${layer.units ?? 1}, activation=${pyStr(ACTIVATION_PY[layer.activation ?? "linear"] ?? layer.activation ?? "linear")}${inputShape}),`,
      ];
    case "dropout":
      return [`    Dropout(${layer.rate ?? 0.5}),`];
    case "flatten":
      return [`    Flatten(${isFirst && layer.inputShape ? `input_shape=${pyShape(layer.inputShape)}` : ""}),`];
    case "conv2d":
      return [
        `    Conv2D(${layer.filters ?? 32}, (${layer.kernelSize ?? 3}, ${layer.kernelSize ?? 3}), activation=${pyStr(ACTIVATION_PY[layer.activation ?? "relu"] ?? layer.activation ?? "relu")}${inputShape}),`,
      ];
    case "maxPooling2d":
      return [`    MaxPooling2D((${layer.poolSize ?? 2}, ${layer.poolSize ?? 2})),`];
    default:
      return [];
  }
}

export type KerasExportOptions = {
  modelName: string;
  taskType: "classification" | "regression";
  classNames?: string[];
  featureNames?: string[];
  epochs: number;
  batchSize: number;
};

/**
 * Generate a runnable Keras training script equivalent to the TF.js
 * model spec. The learner fills in the data-loading section.
 */
export function kerasPythonFromSpec(spec: ModelSpec, opts: KerasExportOptions): string {
  const first = spec.layers[0];
  const inputShape = first?.inputShape;
  const lossPy = LOSS_PY[spec.loss] ?? spec.loss;
  const metricsPy = (spec.metrics ?? []).map((m) => METRICS_PY[m] ?? pyStr(m));

  const lines: string[] = [];
  lines.push(`"""`);
  lines.push(`${opts.modelName} — exported from StudyBuddy MLBuddy (TensorFlow.js playground).`);
  lines.push(`Task: ${opts.taskType}.`);
  lines.push(`Re-train this exact architecture in Python with real data.`);
  lines.push(`"""`);
  lines.push(`import numpy as np`);
  lines.push(`from tensorflow import keras`);
  lines.push(`from tensorflow.keras import layers`);
  lines.push(``);
  lines.push(`# ------------------------------------------------------------------`);
  lines.push(`# 1. Data — replace with your own arrays.`);
  if (opts.featureNames && opts.featureNames.length > 0) {
    lines.push(`#    Features (order matters):`);
    for (const f of opts.featureNames) lines.push(`#      - ${f}`);
  }
  if (opts.classNames && opts.classNames.length > 0) {
    lines.push(`#    Classes (one-hot index → label): ${opts.classNames.map((c) => pyStr(c)).join(", ")}`);
  }
  lines.push(`# ------------------------------------------------------------------`);
  lines.push(`# x_train = np.load("x_train.npy")  # shape: (samples, ${inputShape ? pyShape(inputShape) : "features"})`);
  lines.push(`# y_train = np.load("y_train.npy")`);
  lines.push(`# x_val, y_val = ..., ...`);
  lines.push(``);
  lines.push(`model = keras.Sequential([`);
  for (let i = 0; i < spec.layers.length; i++) {
    lines.push(...layerToPython(spec.layers[i], i === 0));
  }
  lines.push(`])`);
  lines.push(``);
  lines.push(`model.compile(`);
  lines.push(`    optimizer=keras.optimizers.${spec.optimizer.charAt(0).toUpperCase() + spec.optimizer.slice(1)}(learning_rate=${spec.learningRate}),`);
  lines.push(`    loss=${pyStr(lossPy)},`);
  lines.push(`    metrics=[${metricsPy.map((m) => (/^[a-z_]+$/.test(m) ? pyStr(m) : m)).join(", ")}],`);
  lines.push(`)`);
  lines.push(``);
  lines.push(`model.summary()`);
  lines.push(``);
  lines.push(`history = model.fit(`);
  lines.push(`    x_train, y_train,`);
  lines.push(`    validation_data=(x_val, y_val),`);
  lines.push(`    epochs=${Math.max(1, Math.round(opts.epochs))},`);
  lines.push(`    batch_size=${Math.max(1, Math.round(opts.batchSize))},`);
  lines.push(`)`);
  lines.push(``);
  lines.push(`# Evaluate + save`);
  lines.push(`# print(model.evaluate(x_val, y_val))`);
  lines.push(`model.save("${opts.modelName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "model"}.keras")`);
  lines.push(``);
  return lines.join("\n");
}

// ---------------------------------------------------------------------
// Model card
// ---------------------------------------------------------------------

export type ModelCardInput = {
  modelName: string;
  datasetName: string;
  taskType: "classification" | "regression";
  dateISO: string;
  inputShape: number[];
  featureNames?: string[];
  classNames?: string[];
  rowCount: number;
  architecture: string[]; // one line per layer, e.g. "Conv2D(8, 3x3, relu)"
  optimizer: string;
  learningRate: number;
  epochs: number;
  batchSize: number;
  finalLoss?: number;
  finalAccuracy?: number; // 0-1 (classification) — omit for regression
  macroF1?: number;       // 0-1
  topConfusions?: { truth: string; predicted: string; count: number }[];
  testAccuracy?: number;  // held-out accuracy if computed
};

function architectureTable(arch: string[]): string {
  return ["| # | Layer |", "|---|-------|", ...arch.map((l, i) => `| ${i + 1} | ${l} |`)].join("\n");
}

/**
 * One-page markdown model card rendered from training metadata.
 */
export function buildModelCard(input: ModelCardInput): string {
  const lines: string[] = [];
  lines.push(`# Model Card — ${input.modelName}`);
  lines.push(``);
  lines.push(`Trained in-browser with StudyBuddy MLBuddy (TensorFlow.js) on ${input.dateISO}.`);
  lines.push(``);
  lines.push(`## Intended use`);
  lines.push(``);
  lines.push(`- Task: **${input.taskType}**`);
  lines.push(`- Inputs: ${input.featureNames && input.featureNames.length > 0 ? input.featureNames.map((f) => `\`${f}\``).join(", ") : `tensor of shape [${input.inputShape.join(", ")}]`}`);
  if (input.classNames) {
    lines.push(`- Outputs: ${input.classNames.length} classes — ${input.classNames.map((c) => `\`${c}\``).join(", ")}`);
  } else {
    lines.push(`- Outputs: 1 continuous value (regression)`);
  }
  lines.push(``);
  lines.push(`## Training data`);
  lines.push(``);
  lines.push(`- Dataset: **${input.datasetName}** (${input.rowCount} samples)`);
  lines.push(`- Input shape: [${input.inputShape.join(", ")}]`);
  lines.push(``);
  lines.push(`## Architecture`);
  lines.push(``);
  lines.push(architectureTable(input.architecture));
  lines.push(``);
  lines.push(`## Training configuration`);
  lines.push(``);
  lines.push(`| Setting | Value |`);
  lines.push(`|---------|-------|`);
  lines.push(`| Optimizer | ${input.optimizer} |`);
  lines.push(`| Learning rate | ${input.learningRate} |`);
  lines.push(`| Epochs | ${input.epochs} |`);
  lines.push(`| Batch size | ${input.batchSize} |`);
  if (input.finalLoss !== undefined) lines.push(`| Final loss | ${input.finalLoss.toFixed(4)} |`);
  if (input.finalAccuracy !== undefined) lines.push(`| Final accuracy (train) | ${(input.finalAccuracy * 100).toFixed(1)}% |`);
  if (input.testAccuracy !== undefined) lines.push(`| Held-out accuracy | ${(input.testAccuracy * 100).toFixed(1)}% |`);
  if (input.macroF1 !== undefined) lines.push(`| Macro F1 | ${input.macroF1.toFixed(3)} |`);
  lines.push(``);
  if (input.topConfusions && input.topConfusions.length > 0) {
    lines.push(`## Most common confusions`);
    lines.push(``);
    lines.push(`| True | Predicted as | Count |`);
    lines.push(`|------|--------------|-------|`);
    for (const c of input.topConfusions) {
      lines.push(`| ${c.truth} | ${c.predicted} | ${c.count} |`);
    }
    lines.push(``);
  }
  lines.push(`## Limitations`);
  lines.push(``);
  lines.push(`- Trained on a small in-browser dataset — do not deploy to production without re-validating on real, representative data.`);
  if (input.datasetName.includes("Synthetic")) {
    lines.push(`- The dataset is procedurally generated (MNIST-style), not real handwriting — real-world inputs will look different.`);
  }
  lines.push(`- No fairness audit or demographic analysis was performed.`);
  lines.push(``);
  return lines.join("\n");
}
