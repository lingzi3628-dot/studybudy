/**
 * MLBuddy — SHIPPED in Phase 50, upgraded in Phase 57 / MLBuddy 2.0
 * (see ROADMAP.md).
 *
 * Audience: ML learners, researchers, AI engineers.
 * Specialty: train models in-browser with TensorFlow.js, visualize
 * training, evaluate metrics, save/export trained models.
 *
 * Phase 50 shipped: MLPlayground screen with TensorFlow.js, XOR/Iris/
 *   housing demos, architecture editor, loss-curve visualizer, model save.
 * Phase 57 shipped (MLBuddy 2.0):
 *   - Synthetic Digits (MNIST-style) CNN demo + draw-a-digit inference pad
 *   - Confusion matrix + per-class precision/recall/F1 on held-out data
 *   - CSV upload/paste: dtype profiling, feature/target picker,
 *     imputation + one-hot + z-score normalization, train/test split
 *   - Notebook ↔ Playground bridge (table → training, Keras → notebook)
 *   - Model export: TFJS model.json + weights.bin, Keras model.py,
 *     one-page model card
 */

import type { Buddy, BuddySuggestion } from "./types";
import { MATHGRAPH_INSTRUCTIONS } from "./study";

const SUGGESTIONS: BuddySuggestion[] = [
  { icon: "🧠", text: "Train a 2-layer neural network on XOR and visualize the decision boundary", category: "Beginner" },
  { icon: "🔢", text: "Build a MNIST digit classifier with TensorFlow.js", category: "Project" },
  { icon: "📉", text: "Explain gradient descent with a visualization", category: "Theory" },
  { icon: "🎯", text: "What's the bias-variance tradeoff? Show me with a curve", category: "Theory" },
  { icon: "🔗", text: "Explain how backpropagation works step-by-step", category: "Theory" },
  { icon: "🖼️", text: "What is a CNN? Why does it work for images?", category: "Deep Learning" },
  { icon: "🔁", text: "How do RNNs handle sequences? Show me a simple character-level model", category: "Deep Learning" },
  { icon: "🌳", text: "When should I use a random forest vs a neural network?", category: "Models" },
  { icon: "⚖️", text: "What's the difference between L1 and L2 regularization?", category: "Training" },
  { icon: "🤖", text: "Explain the transformer architecture with a diagram", category: "Deep Learning" },
];

export const mlBuddy: Buddy = {
  id: "ml",
  displayName: "MLBuddy",
  tagline: "Train, visualize, evaluate models",
  description: "In-browser machine learning playground powered by TensorFlow.js. Train CNNs on MNIST-style digits, upload your own CSV, watch the loss curve drop, read a real confusion matrix, draw your own digits for inference, and export models as TFJS JSON, Keras Python, and a model card.",
  emoji: "🧠",
  accentGradient: "from-violet-500 to-fuchsia-500",
  accentText: "text-violet-600",
  phase: 57,
  plan: "premium",
  capabilities: [
    "ml_train", "notebook", "python_run", "js_run",
    "graph_drawing", "concept_maps", "step_by_step",
    "project_save",
  ],
  knowledgeBases: [
    "Hands-On Machine Learning (Géron)",
    "Deep Learning (Goodfellow)",
    "Stanford CS231n notes",
    "TensorFlow.js docs",
    "Distill.pub articles",
    "Papers With Code",
  ],
  suggestions: SUGGESTIONS,

  buildSystemPrompt: (ctx) => {
    const dataSaverHint = ctx.dataSaver
      ? `\nDATA SAVER MODE is ON. Show the model code first, then a 1-line summary. Skip long theory digressions.\n`
      : ``;

    return `You are MLBuddy, a senior machine learning engineer helping learners understand and build ML models. You work in a TensorFlow.js environment running in the browser — no Python, no GPU server, no API keys.

WORKING STYLE:
- Lead with code that runs in the browser. Default to TensorFlow.js (tf.tensor, tf.layers.dense, tf.model.fit) for examples.
- For theoretical questions, ALWAYS pair the math with a small visualizable example (e.g. "gradient descent" → show 5 iterations of w approaching the minimum).
- When explaining architectures, draw a diagram using the mathgraph "network" type — nodes for layers, edges for data flow.
- For evaluation metrics, show the confusion matrix and the precision/recall/F1 numbers.
- Use the right amount of theory for the user's grade: secondary school → intuition first; university → math + intuition.

TENSORFLOW.JS CODE FORMAT:
Wrap runnable JS in a fenced block tagged "javascript":
\`\`\`javascript
import * as tf from '@tensorflow/tfjs';

const model = tf.sequential();
model.add(tf.layers.dense({ units: 8, inputShape: [2], activation: 'relu' }));
model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));
model.compile({ optimizer: 'adam', loss: 'binaryCrossentropy', metrics: ['accuracy'] });
\`\`\`

${MATHGRAPH_INSTRUCTIONS}

AVAILABLE DEMO DATASETS (loaded in the playground):
- XOR (4 points, classic non-linearly-separable problem)
- Synthetic Digits (MNIST-style: 800 procedurally drawn 28x28 digits, CNN demo with a draw-your-own-digit pad)
- Iris (150 rows, 4 features → 3 species)
- Housing regression (synthetic, 200 rows)
- User-uploaded CSV (dtype profiling, feature/target picker, train/test split)

User's grade level: ${ctx.userGrade ?? "not set"}. For younger students, lead with intuition and visuals. For university, include the math.${dataSaverHint}
`;
  },
};
