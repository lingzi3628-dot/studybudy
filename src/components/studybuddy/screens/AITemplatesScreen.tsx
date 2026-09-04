"use client";

/**
 * AITemplatesScreen — Phase 61e
 *
 * A gallery of pre-built AI/ML project templates that users can fork
 * and start from. Each template includes starter code + training data
 * + instructions, saved as a Project when the user clicks "Use template".
 *
 * Templates cover:
 *   - Sentiment analyzer (TF-IDF + logistic regression)
 *   - Image classifier (TensorFlow.js CNN)
 *   - Text summarizer (extractive)
 *   - Recommendation engine (collaborative filtering)
 *   - Spam detector (Naive Bayes)
 *   - Price predictor (linear regression)
 *   - Chatbot (TF-IDF + cosine similarity — links to ChatbotPlayground)
 *   - Clustering (K-means on Iris)
 *   - Anomaly detector (Z-score based)
 *   - Language detector (character n-grams)
 *
 * Each template is self-contained — all code runs in the browser via
 * Pyodide or TensorFlow.js. No server, no API key needed.
 */

import { useState } from "react";
import {
  ChevronLeft, Sparkles, Loader2, Check, Code2, Brain, Database,
  MessageCircle, TrendingUp, Shield, ShoppingBag, Mail, Globe,
} from "lucide-react";
import { useApp } from "../store";

type Template = {
  id: string;
  title: string;
  emoji: string;
  icon: any;
  category: "ml" | "ai" | "data";
  buddyId: string;
  screen: string;  // which screen to open after forking
  description: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  tags: string[];
  accent: string;
  files: Array<{ path: string; language: string; content: string; isEntry?: boolean }>;
};

const TEMPLATES: Template[] = [
  {
    id: "sentiment",
    title: "Sentiment Analyzer",
    emoji: "😊",
    icon: Brain,
    category: "ml",
    buddyId: "ml",
    screen: "mlPlayground",
    description: "Classify text as positive/negative using TF-IDF + logistic regression. Train on movie reviews, test on your own text.",
    difficulty: "Beginner",
    tags: ["NLP", "classification", "TF-IDF"],
    accent: "from-violet-500 to-fuchsia-500",
    files: [
      {
        path: "README.md",
        language: "markdown",
        isEntry: true,
        content: `# Sentiment Analyzer

Classify text as positive or negative using TF-IDF + cosine similarity.

## How it works
1. Tokenize each review into words
2. Build a vocabulary from all reviews
3. Compute TF-IDF vectors for each review
4. For a new text, compute its TF-IDF vector
5. Find the most similar positive and negative reviews
6. Classify based on which side has higher average similarity

## Run
Open the ML Playground and load this project. The training data is in \`training_data.json\`.`,
      },
      {
        path: "training_data.json",
        language: "json",
        content: JSON.stringify([
          { text: "I love this product, it's amazing!", label: "positive" },
          { text: "Terrible quality, would not recommend.", label: "negative" },
          { text: "Best purchase I've ever made.", label: "positive" },
          { text: "Waste of money, broke after one day.", label: "negative" },
          { text: "Fantastic service and fast delivery.", label: "positive" },
          { text: "Horrible experience, never again.", label: "negative" },
          { text: "Exceeded my expectations, wonderful!", label: "positive" },
          { text: "Disappointing, poor build quality.", label: "negative" },
          { text: "Highly recommend, great value.", label: "positive" },
          { text: "Awful, stopped working immediately.", label: "negative" },
        ], null, 2),
      },
    ],
  },
  {
    id: "chatbot",
    title: "Custom Chatbot",
    emoji: "🤖",
    icon: MessageCircle,
    category: "ai",
    buddyId: "ml",
    screen: "chatbotPlayground",
    description: "Build a chatbot from Q&A pairs. Watch it think as it matches your input using TF-IDF + cosine similarity. Perfect for FAQs.",
    difficulty: "Beginner",
    tags: ["NLP", "chatbot", "TF-IDF"],
    accent: "from-fuchsia-500 to-purple-600",
    files: [
      {
        path: "README.md",
        language: "markdown",
        isEntry: true,
        content: `# Custom Chatbot

Train a chatbot on your own Q&A data and watch it think!

## Steps
1. Open the Chatbot Playground
2. Add your Q&A pairs (when user says X → bot replies Y)
3. Click "Train"
4. Switch to Chat tab and start talking

The bot shows its full thinking process: tokenization → TF-IDF → cosine similarity → best match selection.`,
      },
    ],
  },
  {
    id: "image-classifier",
    title: "Image Classifier (CNN)",
    emoji: "🖼️",
    icon: Brain,
    category: "ml",
    buddyId: "ml",
    screen: "mlPlayground",
    description: "Build a convolutional neural network to classify images. Uses TensorFlow.js with a synthetic digit dataset (MNIST-like).",
    difficulty: "Intermediate",
    tags: ["CNN", "TensorFlow.js", "computer-vision"],
    accent: "from-violet-500 to-indigo-500",
    files: [
      {
        path: "README.md",
        language: "markdown",
        isEntry: true,
        content: `# Image Classifier (CNN)

Build a CNN to classify synthetic digit images using TensorFlow.js.

## Architecture
- Conv2D(32, 3x3) + ReLU
- MaxPooling2D(2x2)
- Conv2D(64, 3x3) + ReLU
- MaxPooling2D(2x2)
- Flatten
- Dense(128, ReLU)
- Dense(10, Softmax)

## Run
Open the ML Playground, select the "synthetic-digits" demo dataset, and train.`,
      },
    ],
  },
  {
    id: "spam-detector",
    title: "Spam Detector",
    emoji: "🛡️",
    icon: Shield,
    category: "ml",
    buddyId: "ml",
    screen: "mlPlayground",
    description: "Detect spam messages using Naive Bayes classification. Train on labeled SMS data, test on new messages.",
    difficulty: "Beginner",
    tags: ["NLP", "Naive Bayes", "classification"],
    accent: "from-rose-500 to-red-500",
    files: [
      {
        path: "training_data.json",
        language: "json",
        isEntry: true,
        content: JSON.stringify([
          { text: "WINNER! You have won a $1000 prize. Reply NOW to claim.", label: "spam" },
          { text: "Hey, are we still on for dinner tonight?", label: "ham" },
          { text: "URGENT: Your bank account has been suspended. Click here.", label: "spam" },
          { text: "Thanks for the birthday wishes!", label: "ham" },
          { text: "FREE entry in our weekly lottery. Text WIN to 8888.", label: "spam" },
          { text: "I'll be home by 6pm, can you start dinner?", label: "ham" },
          { text: "Congratulations! You've been selected for a free iPhone.", label: "spam" },
          { text: "The meeting has been moved to 3pm tomorrow.", label: "ham" },
        ], null, 2),
      },
    ],
  },
  {
    id: "price-predictor",
    title: "Price Predictor",
    emoji: "💰",
    icon: TrendingUp,
    category: "ml",
    buddyId: "ml",
    screen: "mlPlayground",
    description: "Predict house prices from square footage + bedrooms using linear regression. Includes synthetic training data.",
    difficulty: "Beginner",
    tags: ["regression", "linear", "prediction"],
    accent: "from-emerald-500 to-teal-500",
    files: [
      {
        path: "README.md",
        language: "markdown",
        isEntry: true,
        content: `# Price Predictor

Predict house prices using linear regression.

## Features
- Square footage (normalized)
- Number of bedrooms (normalized)

## Run
Open the ML Playground and select the "housing" demo dataset.
The model uses 2 hidden layers + 1 output layer (linear activation).`,
      },
    ],
  },
  {
    id: "recommender",
    title: "Recommendation Engine",
    emoji: "🎯",
    icon: ShoppingBag,
    category: "ai",
    buddyId: "ml",
    screen: "mlPlayground",
    description: "Build a collaborative filtering recommender. Given user ratings, predict what a user will like next. Like Netflix/Amazon.",
    difficulty: "Intermediate",
    tags: ["collaborative-filtering", "recommendation", "matrix"],
    accent: "from-amber-500 to-orange-500",
    files: [
      {
        path: "README.md",
        language: "markdown",
        isEntry: true,
        content: `# Recommendation Engine

Build a collaborative filtering recommendation system.

## How it works
1. Users rate items (1-5 stars)
2. Build a user-item rating matrix
3. For a target user, find similar users (cosine similarity on rating vectors)
4. Recommend items that similar users liked but the target user hasn't rated

## Data
The training data is a JSON array of { user, item, rating } objects.`,
      },
      {
        path: "ratings.json",
        language: "json",
        content: JSON.stringify([
          { user: "A", item: "Movie 1", rating: 5 },
          { user: "A", item: "Movie 2", rating: 3 },
          { user: "A", item: "Movie 3", rating: 4 },
          { user: "B", item: "Movie 1", rating: 4 },
          { user: "B", item: "Movie 2", rating: 5 },
          { user: "B", item: "Movie 4", rating: 2 },
          { user: "C", item: "Movie 2", rating: 4 },
          { user: "C", item: "Movie 3", rating: 5 },
          { user: "C", item: "Movie 4", rating: 3 },
        ], null, 2),
      },
    ],
  },
  {
    id: "clustering",
    title: "K-Means Clustering",
    emoji: "🔮",
    icon: Database,
    category: "ml",
    buddyId: "ml",
    screen: "mlPlayground",
    description: "Group data points into clusters using K-Means. Visualize how the algorithm iteratively finds cluster centers.",
    difficulty: "Beginner",
    tags: ["unsupervised", "clustering", "K-means"],
    accent: "from-sky-500 to-cyan-500",
    files: [
      {
        path: "README.md",
        language: "markdown",
        isEntry: true,
        content: `# K-Means Clustering

Group iris flowers into 3 species using K-Means clustering.

## How it works
1. Pick K random points as cluster centers
2. Assign each data point to the nearest center
3. Update centers to the mean of assigned points
4. Repeat until centers stop moving

## Run
Open the ML Playground, load the Iris dataset, and build a model
with 3 output classes (softmax). The decision boundary shows the clusters.`,
      },
    ],
  },
  {
    id: "anomaly",
    title: "Anomaly Detector",
    emoji: "⚠️",
    icon: Shield,
    category: "ai",
    buddyId: "ml",
    screen: "mlPlayground",
    description: "Detect anomalies in data using Z-score analysis. Flag values that are more than 2 standard deviations from the mean.",
    difficulty: "Beginner",
    tags: ["anomaly-detection", "statistics", "Z-score"],
    accent: "from-rose-500 to-pink-500",
    files: [
      {
        path: "README.md",
        language: "markdown",
        isEntry: true,
        content: `# Anomaly Detector

Detect outliers in a dataset using Z-score analysis.

## How it works
1. Compute the mean and standard deviation of the data
2. For each data point, compute Z = (x - mean) / std
3. If |Z| > 2, flag as an anomaly (95% confidence)

## Use cases
- Fraud detection in transactions
- Network intrusion detection
- Manufacturing quality control
- Server health monitoring`,
      },
    ],
  },
  {
    id: "summarizer",
    title: "Text Summarizer",
    emoji: "📝",
    icon: Code2,
    category: "ai",
    buddyId: "ai",
    screen: "promptPlayground",
    description: "Build an extractive text summarizer that picks the most important sentences from a document using TF-IDF scoring.",
    difficulty: "Intermediate",
    tags: ["NLP", "summarization", "extractive"],
    accent: "from-indigo-500 to-violet-500",
    files: [
      {
        path: "README.md",
        language: "markdown",
        isEntry: true,
        content: `# Text Summarizer (Extractive)

Summarize a document by extracting the most important sentences.

## How it works
1. Split the document into sentences
2. Tokenize each sentence and compute TF-IDF
3. Score each sentence by summing the TF-IDF values of its words
4. Pick the top-N highest-scoring sentences as the summary

## Run
Use the Prompt Playground to test with different documents.
Paste a long text and ask the AI to summarize it.`,
      },
    ],
  },
  {
    id: "language-detector",
    title: "Language Detector",
    emoji: "🌍",
    icon: Globe,
    category: "ml",
    buddyId: "ml",
    screen: "mlPlayground",
    description: "Detect the language of a text using character n-gram frequencies. Train on sample texts in English, Swahili, French.",
    difficulty: "Advanced",
    tags: ["NLP", "n-grams", "classification"],
    accent: "from-teal-500 to-emerald-500",
    files: [
      {
        path: "README.md",
        language: "markdown",
        isEntry: true,
        content: `# Language Detector

Detect the language of a text using character n-gram analysis.

## How it works
1. For each training language, compute character trigram frequencies
2. For a new text, compute its trigram frequency profile
3. Compare against each language profile (cosine similarity)
4. Pick the language with the highest similarity

## Training data
Add sample texts in different languages to the training data file.`,
      },
      {
        path: "training_data.json",
        language: "json",
        content: JSON.stringify([
          { text: "The quick brown fox jumps over the lazy dog.", lang: "English" },
          { text: "Hello, how are you today? I am fine, thank you.", lang: "English" },
          { text: "Jambo, habari yako? Nina njema sana, asante.", lang: "Swahili" },
          { text: "Ninapenda kusoma vitabu sokoni.", lang: "Swahili" },
          { text: "Bonjour, comment allez-vous? Je vais bien, merci.", lang: "French" },
          { text: "Le chat noir dort sur le canapé rouge.", lang: "French" },
        ], null, 2),
      },
    ],
  },
];

const CATEGORIES = [
  { id: "all", label: "All", emoji: "🌐" },
  { id: "ml", label: "Machine Learning", emoji: "🧠" },
  { id: "ai", label: "AI Apps", emoji: "🤖" },
  { id: "data", label: "Data Science", emoji: "📊" },
];

export function AITemplatesScreen() {
  const { setScreen } = useApp();
  const [filter, setFilter] = useState("all");
  const [creating, setCreating] = useState<string | null>(null);

  const templates = filter === "all"
    ? TEMPLATES
    : TEMPLATES.filter((t) => t.category === filter);

  const useTemplate = async (template: Template) => {
    setCreating(template.id);
    try {
      // Create a project with the template's files
      const r = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buddyId: template.buddyId,
          title: template.title,
          description: template.description,
          tags: [...template.tags, "template"],
          files: template.files,
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();

      // Route to the right screen
      const state = (useApp as any).getState();
      state.setActiveProjectId?.(d.project.id);
      setScreen(template.screen as any);
    } catch (e: any) {
      alert(`Failed to create project: ${e?.message}`);
      setCreating(null);
    }
  };

  return (
    <div className="md:px-8 md:py-6">
      <div className="max-w-md mx-auto px-4 pt-4 pb-28 md:max-w-5xl md:px-0 md:pb-8">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => setScreen("home")} className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-violet-500" /> AI Templates
            </h1>
            <p className="text-xs text-gray-500">
              Start from a pre-built AI/ML project. Fork it, customize it, make it yours.
            </p>
          </div>
        </div>

        {/* Category filters */}
        <div className="flex gap-1.5 mb-4 overflow-x-auto no-scrollbar">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setFilter(c.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                filter === c.id ? "bg-violet-600 text-white" : "bg-white border border-gray-200 text-gray-700 hover:border-violet-300"
              }`}
            >
              {c.emoji} {c.label}
            </button>
          ))}
        </div>

        {/* Template grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {templates.map((t) => {
            const Icon = t.icon;
            return (
              <div
                key={t.id}
                className="rounded-2xl bg-white border border-gray-200 shadow-sm hover:shadow-md transition overflow-hidden"
              >
                <div className={`h-2 bg-gradient-to-r ${t.accent}`} />
                <div className="p-4">
                  {/* Icon + title */}
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${t.accent} flex items-center justify-center text-xl flex-shrink-0`}>
                      {t.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900">{t.title}</p>
                      <p className="text-[10px] text-gray-500">
                        {t.difficulty} · {t.files.length} {t.files.length === 1 ? "file" : "files"}
                      </p>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-gray-600 leading-relaxed mb-2 line-clamp-3">{t.description}</p>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1 mb-3">
                    {t.tags.map((tag) => (
                      <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                        {tag}
                      </span>
                    ))}
                  </div>

                  {/* Use button */}
                  <button
                    onClick={() => useTemplate(t)}
                    disabled={creating === t.id}
                    className="w-full h-9 rounded-full bg-violet-600 text-white text-xs font-semibold flex items-center justify-center gap-1 hover:bg-violet-700 disabled:opacity-50 transition"
                  >
                    {creating === t.id ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating…</>
                    ) : (
                      <><Sparkles className="w-3.5 h-3.5" /> Use this template</>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-gray-400">
          💡 Templates create a new project in your account. Edit the code, add training data, and make it your own.
        </p>
      </div>
    </div>
  );
}
