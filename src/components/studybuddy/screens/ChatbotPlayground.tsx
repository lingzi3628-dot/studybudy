"use client";

/**
 * ChatbotPlayground — Phase 61d
 *
 * Train a simple chatbot on custom conversation data and watch it "think"
 * as it responds. Uses a bag-of-words + cosine similarity model that
 * runs entirely in the browser — no server, no API key.
 *
 * Features:
 *   - Training data editor: add Q&A pairs (user says X → bot replies Y)
 *   - Train button: builds the TF-IDF matrix + similarity index
 *   - Chat interface: type a message → bot finds the best matching training
 *     pair and replies. Shows the "thinking" process:
 *     1. Tokenize input
 *     2. Compute TF-IDF vector
 *     3. Compare against all training examples (cosine similarity)
 *     4. Show top-3 matches with scores
 *     5. Pick the best match → reply
 *   - Confidence threshold: if best match is below threshold, bot says
 *     "I don't understand" (configurable)
 *   - Save/load: persist training data as a Project
 *
 * The model is intentionally simple (no neural network) so users can
 * SEE how it works — every step is visualized. This is the "watch them
 * think" feature.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import {
  ChevronLeft, Send, Brain, Plus, Trash2, Loader2, Save,
  Sparkles, MessageCircle, Zap, Eye,
} from "lucide-react";
import { useApp } from "../store";

// === Types ===
type TrainingPair = { id: string; input: string; output: string };
type ChatMessage = { role: "user" | "bot"; text: string; thinking?: ThinkingStep[] };
type ThinkingStep = { step: string; detail: string; data?: any };

// === Simple NLP (bag-of-words + TF-IDF + cosine similarity) ===
// All in-browser, no dependencies.

function tokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

function buildVocab(pairs: TrainingPair[]): string[] {
  const set = new Set<string>();
  for (const p of pairs) {
    for (const w of tokenize(p.input)) set.add(w);
  }
  return Array.from(set);
}

function tfidfVector(text: string, vocab: string[], idf: Map<string, number>): number[] {
  const tokens = tokenize(text);
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);

  return vocab.map((word) => {
    const termFreq = (tf.get(word) ?? 0) / Math.max(tokens.length, 1);
    const inverseDocFreq = idf.get(word) ?? 1;
    return termFreq * inverseDocFreq;
  });
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
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom > 0 ? dot / denom : 0;
}

// === Component ===

const STARTER_DATA: TrainingPair[] = [
  { id: "1", input: "hello", output: "Hi there! How can I help you today?" },
  { id: "2", input: "hi", output: "Hello! What would you like to know?" },
  { id: "3", input: "how are you", output: "I'm doing great, thanks for asking! How about you?" },
  { id: "4", input: "what is your name", output: "I'm a chatbot trained by you! I learn from the Q&A pairs you give me." },
  { id: "5", input: "what can you do", output: "I can answer questions based on my training data. Add more Q&A pairs to make me smarter!" },
  { id: "6", input: "thank you", output: "You're welcome! Happy to help." },
  { id: "7", input: "bye", output: "Goodbye! Come back soon." },
  { id: "8", input: "help", output: "I can help with anything I've been trained on. Try asking me a question!" },
];

export function ChatbotPlayground() {
  const { setScreen } = useApp();
  const [trainingData, setTrainingData] = useState<TrainingPair[]>(STARTER_DATA);
  const [newInput, setNewInput] = useState("");
  const [newOutput, setNewOutput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isTraining, setIsTraining] = useState(false);
  const [isTrained, setIsTrained] = useState(false);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.15);
  const [activeTab, setActiveTab] = useState<"train" | "chat">("train");

  // Trained model state
  const modelRef = useRef<{
    vocab: string[];
    idf: Map<string, number>;
    vectors: number[][];
    pairs: TrainingPair[];
  } | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Add a training pair
  const addPair = () => {
    if (!newInput.trim() || !newOutput.trim()) return;
    setTrainingData((prev) => [...prev, {
      id: Date.now().toString(),
      input: newInput.trim(),
      output: newOutput.trim(),
    }]);
    setNewInput("");
    setNewOutput("");
    setIsTrained(false); // need to retrain
  };

  // Remove a training pair
  const removePair = (id: string) => {
    setTrainingData((prev) => prev.filter((p) => p.id !== id));
    setIsTrained(false);
  };

  // Train the model
  const train = useCallback(async () => {
    setIsTraining(true);
    // Simulate a brief training delay for UX (the actual compute is instant)
    await new Promise((r) => setTimeout(r, 800));

    const vocab = buildVocab(trainingData);
    const idf = computeIDF(trainingData, vocab);
    const vectors = trainingData.map((p) => tfidfVector(p.input, vocab, idf));

    modelRef.current = { vocab, idf, vectors, pairs: trainingData };
    setIsTrained(true);
    setIsTraining(false);
  }, [trainingData]);

  // Send a message to the chatbot
  const sendMessage = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || !modelRef.current) return;

    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", text }]);

    // Simulate thinking delay
    await new Promise((r) => setTimeout(r, 400));

    const model = modelRef.current;
    const thinkingSteps: ThinkingStep[] = [];

    // Step 1: Tokenize
    const tokens = tokenize(text);
    thinkingSteps.push({
      step: "1. Tokenize input",
      detail: `Split "${text}" into ${tokens.length} tokens`,
      data: tokens,
    });

    // Step 2: Compute TF-IDF vector
    const inputVector = tfidfVector(text, model.vocab, model.idf);
    const nonZero = inputVector.filter((v) => v > 0).length;
    thinkingSteps.push({
      step: "2. Compute TF-IDF vector",
      detail: `${model.vocab.length}-dimensional vector, ${nonZero} non-zero terms`,
    });

    // Step 3: Compare against all training examples
    const scores = model.vectors.map((v, i) => ({
      pair: model.pairs[i],
      score: cosineSim(inputVector, v),
      index: i,
    }));
    scores.sort((a, b) => b.score - a.score);
    const top3 = scores.slice(0, 3);

    thinkingSteps.push({
      step: "3. Compare against training data",
      detail: `Computed cosine similarity against ${model.vectors.length} training examples`,
      data: top3.map((s) => ({
        input: s.pair.input,
        score: s.score.toFixed(4),
        output: s.pair.output.slice(0, 50),
      })),
    });

    // Step 4: Pick the best match
    const best = scores[0];
    if (best.score >= confidenceThreshold) {
      thinkingSteps.push({
        step: "4. Select best match",
        detail: `Best: "${best.pair.input}" (score: ${best.score.toFixed(4)} ≥ threshold ${confidenceThreshold})`,
      });
      setChatMessages((prev) => [...prev, {
        role: "bot",
        text: best.pair.output,
        thinking: thinkingSteps,
      }]);
    } else {
      thinkingSteps.push({
        step: "4. No confident match",
        detail: `Best score ${best.score.toFixed(4)} < threshold ${confidenceThreshold}. Saying "I don't understand."`,
      });
      setChatMessages((prev) => [...prev, {
        role: "bot",
        text: "I'm sorry, I don't understand that yet. Add more training data to help me learn!",
        thinking: thinkingSteps,
      }]);
    }
  }, [chatInput, confidenceThreshold]);

  // Save training data as a Project
  const saveProject = async () => {
    try {
      const data = JSON.stringify(trainingData, null, 2);
      const r = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buddyId: "ml",
          title: "Chatbot training data",
          description: `${trainingData.length} Q&A pairs, threshold ${confidenceThreshold}`,
          tags: ["chatbot", "nlp", "tfidf"],
          files: [{
            path: "training_data.json",
            language: "json",
            content: data,
            isEntry: true,
          }],
        }),
      });
      if (r.ok) {
        const d = await r.json();
        alert(`✓ Saved! Find it in My Projects as "${d.project.title}".`);
      }
    } catch (e: any) {
      alert(`Save failed: ${e?.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 h-14 flex items-center gap-3 sticky top-0 z-20">
        <button onClick={() => setScreen("home")} className="text-gray-500 hover:text-gray-900">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <Brain className="w-5 h-5 text-violet-500 flex-shrink-0" />
        <h1 className="text-sm font-bold text-gray-900 flex-1">Chatbot Playground</h1>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
          isTrained ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"
        }`}>
          {isTrained ? "● Trained" : "○ Not trained"}
        </span>
        <button
          onClick={saveProject}
          className="px-3 h-9 rounded-full bg-violet-600 text-white text-xs font-semibold flex items-center gap-1 hover:bg-violet-700"
        >
          <Save className="w-3.5 h-3.5" /> Save
        </button>
      </header>

      {/* Tab switcher */}
      <div className="flex border-b border-gray-200 bg-white">
        <button
          onClick={() => setActiveTab("train")}
          className={`flex-1 py-2.5 text-sm font-semibold border-b-2 transition ${
            activeTab === "train" ? "border-violet-600 text-violet-600" : "border-transparent text-gray-500"
          }`}
        >
          🎓 Train ({trainingData.length} pairs)
        </button>
        <button
          onClick={() => setActiveTab("chat")}
          disabled={!isTrained}
          className={`flex-1 py-2.5 text-sm font-semibold border-b-2 transition ${
            activeTab === "chat" ? "border-violet-600 text-violet-600" : "border-transparent text-gray-500"
          } disabled:opacity-40`}
        >
          💬 Chat
        </button>
      </div>

      {/* Train tab */}
      {activeTab === "train" && (
        <div className="max-w-2xl mx-auto px-4 py-4">
          {/* Add new pair */}
          <div className="rounded-2xl bg-white border border-gray-200 p-4 mb-4">
            <h2 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-violet-500" /> Add training example
            </h2>
            <p className="text-xs text-gray-500 mb-3">Teach the bot: when user says X → reply Y</p>
            <input
              type="text"
              value={newInput}
              onChange={(e) => setNewInput(e.target.value)}
              placeholder="User says... (e.g. 'what is photosynthesis')"
              className="w-full h-10 rounded-lg bg-gray-50 border border-gray-200 px-3 text-sm outline-none focus:border-violet-400 mb-2"
            />
            <input
              type="text"
              value={newOutput}
              onChange={(e) => setNewOutput(e.target.value)}
              placeholder="Bot replies... (e.g. 'Photosynthesis is how plants make food from sunlight')"
              className="w-full h-10 rounded-lg bg-gray-50 border border-gray-200 px-3 text-sm outline-none focus:border-violet-400 mb-2"
              onKeyDown={(e) => { if (e.key === "Enter") addPair(); }}
            />
            <button
              onClick={addPair}
              disabled={!newInput.trim() || !newOutput.trim()}
              className="px-4 h-9 rounded-full bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-40 flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>

          {/* Training data list */}
          <div className="rounded-2xl bg-white border border-gray-200 p-4 mb-4">
            <h2 className="text-sm font-bold text-gray-900 mb-2">Training data ({trainingData.length} pairs)</h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {trainingData.map((pair) => (
                <div key={pair.id} className="flex items-start gap-2 p-2 rounded-lg bg-gray-50 border border-gray-100">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs"><span className="font-bold text-gray-600">Q:</span> {pair.input}</p>
                    <p className="text-xs mt-0.5"><span className="font-bold text-gray-600">A:</span> {pair.output}</p>
                  </div>
                  <button
                    onClick={() => removePair(pair.id)}
                    className="text-gray-400 hover:text-rose-500 flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Settings + Train button */}
          <div className="rounded-2xl bg-white border border-gray-200 p-4 mb-4">
            <h2 className="text-sm font-bold text-gray-900 mb-2">Settings</h2>
            <div className="flex items-center gap-3 mb-3">
              <label className="text-xs text-gray-500 w-32">Confidence threshold:</label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={confidenceThreshold}
                onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
                className="flex-1"
              />
              <span className="text-xs font-mono text-gray-700 w-10">{confidenceThreshold.toFixed(2)}</span>
            </div>
            <p className="text-[10px] text-gray-400 mb-3">
              Lower = bot answers more freely (may be wrong). Higher = bot only answers when confident (may say "I don't understand" more often).
            </p>
            <button
              onClick={train}
              disabled={isTraining || trainingData.length === 0}
              className="w-full h-10 rounded-full bg-violet-600 text-white text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-violet-700 disabled:opacity-50"
            >
              {isTraining ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Training…</>
              ) : (
                <><Brain className="w-4 h-4" /> Train Chatbot</>
              )}
            </button>
            {isTrained && (
              <p className="text-xs text-emerald-600 text-center mt-2">
                ✓ Trained! Vocab: {modelRef.current?.vocab.length ?? 0} words. Switch to Chat to test.
              </p>
            )}
          </div>

          {/* How it works */}
          <div className="rounded-2xl bg-violet-50 border border-violet-100 p-4">
            <h3 className="text-xs font-bold text-violet-700 mb-1.5 flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" /> How the "thinking" works
            </h3>
            <p className="text-[11px] text-violet-600 leading-relaxed">
              When you chat, the bot: (1) tokenizes your input, (2) computes a TF-IDF vector,
              (3) compares it against all training examples using cosine similarity, (4) picks
              the best match above the confidence threshold. Every step is shown in the chat
              so you can see exactly how it "thinks".
            </p>
          </div>
        </div>
      )}

      {/* Chat tab */}
      {activeTab === "chat" && (
        <div className="max-w-2xl mx-auto px-4 py-4 flex flex-col" style={{ minHeight: "calc(100vh - 120px)" }}>
          {/* Chat messages */}
          <div className="flex-1 overflow-y-auto space-y-3 pb-4">
            {chatMessages.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <MessageCircle className="w-10 h-10 mx-auto mb-2" />
                <p className="text-sm">Start chatting with your bot!</p>
                <p className="text-xs mt-1">The thinking process will appear below each reply.</p>
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i}>
                {/* Message bubble */}
                <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                    msg.role === "user"
                      ? "bg-indigo-600 text-white"
                      : "bg-white border border-gray-200 text-gray-900"
                  }`}>
                    {msg.role === "bot" && (
                      <div className="flex items-center gap-1 mb-1 text-[10px] text-violet-500 font-bold">
                        <Brain className="w-3 h-3" /> BOT
                      </div>
                    )}
                    {msg.text}
                  </div>
                </div>

                {/* Thinking process (bot only) */}
                {msg.thinking && (
                  <div className="mt-1.5 ml-4 rounded-xl bg-gray-900 border border-gray-700 p-2.5 max-w-[90%]">
                    <p className="text-[10px] font-bold text-gray-400 uppercase mb-1.5 flex items-center gap-1">
                      <Zap className="w-3 h-3 text-amber-400" /> Thinking process
                    </p>
                    {msg.thinking.map((step, j) => (
                      <div key={j} className="mb-1.5 last:mb-0">
                        <p className="text-[11px] font-semibold text-gray-300">{step.step}</p>
                        <p className="text-[10px] text-gray-500">{step.detail}</p>
                        {step.data && Array.isArray(step.data) && step.data.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {step.data.slice(0, 5).map((item: any, k: number) => (
                              <p key={k} className="text-[10px] font-mono text-gray-600 pl-2">
                                {typeof item === "string" ? item : JSON.stringify(item)}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Chat input */}
          <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder="Type a message…"
              className="flex-1 h-10 rounded-full bg-white border border-gray-200 px-4 text-sm outline-none focus:border-violet-400"
            />
            <button
              onClick={sendMessage}
              disabled={!chatInput.trim()}
              className="w-10 h-10 rounded-full bg-violet-600 text-white flex items-center justify-center disabled:opacity-40 hover:bg-violet-700"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
