"use client";

/**
 * MLPlaygroundScreen — Phase 50
 *
 * Interactive ML training playground powered by TensorFlow.js.
 *
 * Features:
 *   - Pick a pre-loaded demo dataset (XOR, Iris, Housing)
 *   - View + edit the model architecture (layers, activations, optimizer)
 *   - Train with real-time loss curve + accuracy display
 *   - See the decision boundary for 2D classification problems (XOR, etc.)
 *   - Save the trained model as a Project file (model.json + weights.bin)
 *
 * The TF.js library (~1.2MB) is lazy-loaded via dynamic import in
 * ml-engine.ts, so the main bundle doesn't grow.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import {
  ChevronLeft, Play, Loader2, Square, Save, Brain, Target,
  TrendingDown, Layers, Database, Sparkles, Download,
} from "lucide-react";
import { useApp } from "../store";
import {
  DEMOS, getDemoById, buildModel, trainModel, predict, modelToJSON, disposeModel,
  type DemoDataset, type ModelSpec, type LayerSpec,
} from "@/lib/ml-engine";

type TrainingState = "idle" | "building" | "training" | "done" | "error";

type EpochLog = {
  epoch: number;
  loss: number;
  acc?: number;
  val_loss?: number;
  val_acc?: number;
};

export function MLPlaygroundScreen() {
  const { setScreen, activeProjectId, setActiveProjectId } = useApp() as any;
  const [selectedDemoId, setSelectedDemoId] = useState<string>("xor");
  const [modelSpec, setModelSpec] = useState<ModelSpec>(DEMOS[0].modelSpec);
  const [trainingState, setTrainingState] = useState<TrainingState>("idle");
  const [epochLogs, setEpochLogs] = useState<EpochLog[]>([]);
  const [epochs, setEpochs] = useState(50);
  const [batchSize, setBatchSize] = useState(4);
  const [validationSplit, setValidationSplit] = useState(0.2);
  const [error, setError] = useState<string | null>(null);
  const [modelRef, setModelRef] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [decisionBoundary, setDecisionBoundary] = useState<string | null>(null);

  const demo = getDemoById(selectedDemoId) as DemoDataset;

  // Update model spec when demo changes
  const onDemoChange = (newId: string) => {
    const newDemo = getDemoById(newId);
    if (newDemo) {
      setSelectedDemoId(newId);
      setModelSpec(newDemo.modelSpec);
      setEpochLogs([]);
      setTrainingState("idle");
      setDecisionBoundary(null);
    }
  };

  // Update a layer in the model spec
  const updateLayer = (idx: number, updates: Partial<LayerSpec>) => {
    setModelSpec((prev) => ({
      ...prev,
      layers: prev.layers.map((l, i) => (i === idx ? { ...l, ...updates } : l)),
    }));
  };

  // Add a layer
  const addLayer = () => {
    setModelSpec((prev) => ({
      ...prev,
      layers: [
        ...prev.layers.slice(0, -1),  // all but output
        { type: "dense", units: 16, activation: "relu" },
        ...prev.layers.slice(-1),  // output layer
      ],
    }));
  };

  // Remove a layer (not the first or last)
  const removeLayer = (idx: number) => {
    if (idx === 0 || idx === modelSpec.layers.length - 1) return;
    setModelSpec((prev) => ({
      ...prev,
      layers: prev.layers.filter((_, i) => i !== idx),
    }));
  };

  // Train the model
  const train = useCallback(async () => {
    setTrainingState("building");
    setError(null);
    setEpochLogs([]);

    try {
      // Build the model
      const model = await buildModel(modelSpec);
      setModelRef(model);
      disposeModel(modelRef);  // dispose any previous model

      // Generate the data
      const data = await demo.generateData();
      const tf = await import("@tensorflow/tfjs");
      const xs = tf.tensor2d(data.xs);
      const ys = tf.tensor2d(data.ys);

      setTrainingState("training");

      // Train with callbacks
      const result = await trainModel(model, xs, ys, epochs, batchSize, validationSplit, {
        onEpochEnd: (epoch, logs) => {
          setEpochLogs((prev) => [...prev, {
            epoch: epoch + 1,
            loss: logs.loss,
            acc: logs.acc,
            val_loss: logs.val_loss,
            val_acc: logs.val_acc,
          }]);
        },
      });

      // For 2D classification (XOR), draw the decision boundary
      if (demo.inputShape.length === 1 && demo.inputShape[0] === 2) {
        await drawDecisionBoundary(model);
      }

      setTrainingState("done");

      // Clean up tensors
      xs.dispose();
      ys.dispose();
    } catch (e: any) {
      setError(e?.message ?? "Training failed");
      setTrainingState("error");
    }
  }, [modelSpec, demo, epochs, batchSize, validationSplit, modelRef]);

  // Draw the decision boundary for a 2D classifier
  const drawDecisionBoundary = async (model: any) => {
    try {
      const tf = await import("@tensorflow/tfjs");
      const resolution = 50;
      const grid: number[][] = [];
      for (let x = 0; x <= resolution; x++) {
        for (let y = 0; y <= resolution; y++) {
          // Map grid coords to [-1, 1] range for both axes
          const px = (x / resolution) * 2 - 1;
          const py = (y / resolution) * 2 - 1;
          // For XOR we use 0..1 range
          grid.push([x / resolution, y / resolution]);
        }
      }
      const predictions = await predict(model, grid);
      const classes = predictions.predictedClasses;

      // Draw to a canvas
      const canvas = document.createElement("canvas");
      canvas.width = resolution;
      canvas.height = resolution;
      const ctx = canvas.getContext("2d")!;
      const imageData = ctx.createImageData(resolution, resolution);

      for (let i = 0; i < classes.length; i++) {
        const c = classes[i];
        // class 0 = blue, class 1 = red
        imageData.data[i * 4] = c === 0 ? 59 : 239;      // R
        imageData.data[i * 4 + 1] = c === 0 ? 130 : 68;  // G
        imageData.data[i * 4 + 2] = c === 0 ? 246 : 68;  // B
        imageData.data[i * 4 + 3] = 180;                 // alpha
      }
      ctx.putImageData(imageData, 0, 0);
      setDecisionBoundary(canvas.toDataURL());
    } catch (e) {
      console.warn("Failed to draw decision boundary:", e);
    }
  };

  // Save the trained model as a Project
  const saveModel = useCallback(async () => {
    if (!modelRef) return;
    setSaving(true);
    setError(null);
    try {
      const artifact = await modelToJSON(modelRef);
      const modelJson = JSON.stringify(artifact, null, 2);
      const files = [
        { path: "model.json", language: "json", content: modelJson, isEntry: true },
        {
          path: "README.md",
          language: "markdown",
          content: `# ${demo.name} Model\n\nTrained with MLBuddy (Phase 50) using TensorFlow.js.\n\n## Architecture\n\n${modelSpec.layers.map((l, i) => `- Layer ${i + 1}: ${l.type} (${l.units ?? l.filters ?? ""} units, ${l.activation ?? ""})`).join("\\n")}\n\n## Training\n- Epochs: ${epochs}\n- Optimizer: ${modelSpec.optimizer} (lr=${modelSpec.learningRate})\n- Final loss: ${epochLogs[epochLogs.length - 1]?.loss.toFixed(4) ?? "N/A"}\n- Final accuracy: ${epochLogs[epochLogs.length - 1]?.acc?.toFixed(4) ?? "N/A"}\n`,
        },
      ];

      if (activeProjectId && !activeProjectId.startsWith("temp-")) {
        const r = await fetch(`/api/projects/${activeProjectId}/files`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ files }),
        });
        if (!r.ok) throw new Error(`Save failed: HTTP ${r.status}`);
      } else {
        const r = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            buddyId: "ml",
            title: `${demo.name} model`,
            description: `Trained ML model: ${demo.name}`,
            tags: ["ml", "tensorflow", demo.id],
            files,
          }),
        });
        if (!r.ok) throw new Error(`Create failed: HTTP ${r.status}`);
        const d = await r.json();
        setActiveProjectId(d.project.id);
      }
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2000);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }, [modelRef, demo, modelSpec, epochs, epochLogs, activeProjectId, setActiveProjectId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disposeModel(modelRef);
    };
  }, [modelRef]);

  // Stats for display
  const lastLog = epochLogs[epochLogs.length - 1];
  const bestLoss = epochLogs.length > 0 ? Math.min(...epochLogs.map((l) => l.loss)) : null;
  const bestAcc = epochLogs.length > 0 ? Math.max(...epochLogs.map((l) => l.acc ?? 0)) : null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 h-14 flex items-center gap-3 sticky top-0 z-20">
        <button
          onClick={() => setScreen("projects")}
          aria-label="Back to projects"
          className="text-gray-500 hover:text-gray-900"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <Brain className="w-5 h-5 text-violet-500 flex-shrink-0" />
        <h1 className="text-sm font-bold text-gray-900 flex-1">ML Playground</h1>
        {trainingState === "done" && (
          <button
            onClick={saveModel}
            disabled={saving}
            className="px-3 h-9 rounded-full bg-violet-600 text-white text-xs font-semibold flex items-center gap-1 hover:bg-violet-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save Model
          </button>
        )}
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left column: Dataset + Architecture */}
        <div className="space-y-4">
          {/* Dataset picker */}
          <section className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5 mb-3">
              <Database className="w-4 h-4 text-violet-500" /> Dataset
            </h2>
            <div className="grid grid-cols-1 gap-2">
              {DEMOS.map((d) => (
                <button
                  key={d.id}
                  onClick={() => onDemoChange(d.id)}
                  className={`text-left p-3 rounded-xl border transition ${
                    selectedDemoId === d.id
                      ? "border-violet-500 bg-violet-50"
                      : "border-gray-200 bg-white hover:border-violet-300"
                  }`}
                >
                  <p className="text-sm font-semibold text-gray-900">{d.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{d.description}</p>
                  <p className="text-[10px] text-gray-400 mt-1">
                    {`Input: [${d.inputShape.join(", ")}] · Output: [${d.outputShape.join(", ")}] · Loss: ${d.loss}`}
                  </p>
                </button>
              ))}
            </div>
          </section>

          {/* Model architecture */}
          <section className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-violet-500" /> Architecture
              </h2>
              <button
                onClick={addLayer}
                className="text-xs text-violet-600 font-medium hover:text-violet-700"
              >
                + Layer
              </button>
            </div>
            <div className="space-y-2">
              {modelSpec.layers.map((layer, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 border border-gray-100">
                  <span className="text-[10px] font-bold text-gray-400 w-6">{i + 1}</span>
                  <select
                    value={layer.type}
                    onChange={(e) => updateLayer(i, { type: e.target.value as LayerSpec["type"] })}
                    className="text-xs bg-white border border-gray-200 rounded px-1.5 py-1 outline-none focus:border-violet-400"
                  >
                    <option value="dense">Dense</option>
                    <option value="dropout">Dropout</option>
                  </select>
                  {layer.type === "dense" && (
                    <>
                      <label className="text-[10px] text-gray-500">units:</label>
                      <input
                        type="number"
                        value={layer.units ?? 1}
                        min={1}
                        max={256}
                        onChange={(e) => updateLayer(i, { units: parseInt(e.target.value) || 1 })}
                        className="w-14 text-xs bg-white border border-gray-200 rounded px-1.5 py-1 outline-none focus:border-violet-400"
                      />
                      <select
                        value={layer.activation ?? "linear"}
                        onChange={(e) => updateLayer(i, { activation: e.target.value })}
                        className="text-xs bg-white border border-gray-200 rounded px-1.5 py-1 outline-none focus:border-violet-400"
                      >
                        <option value="relu">ReLU</option>
                        <option value="sigmoid">Sigmoid</option>
                        <option value="tanh">Tanh</option>
                        <option value="softmax">Softmax</option>
                        <option value="linear">Linear</option>
                      </select>
                    </>
                  )}
                  {layer.type === "dropout" && (
                    <>
                      <label className="text-[10px] text-gray-500">rate:</label>
                      <input
                        type="number"
                        value={layer.rate ?? 0.5}
                        min={0}
                        max={1}
                        step={0.1}
                        onChange={(e) => updateLayer(i, { rate: parseFloat(e.target.value) || 0.5 })}
                        className="w-14 text-xs bg-white border border-gray-200 rounded px-1.5 py-1 outline-none focus:border-violet-400"
                      />
                    </>
                  )}
                  {i > 0 && i < modelSpec.layers.length - 1 && (
                    <button
                      onClick={() => removeLayer(i)}
                      className="text-xs text-rose-500 hover:text-rose-700 ml-auto"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Optimizer settings */}
            <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 w-20">Optimizer:</label>
                <select
                  value={modelSpec.optimizer}
                  onChange={(e) => setModelSpec((p) => ({ ...p, optimizer: e.target.value as any }))}
                  className="text-xs bg-white border border-gray-200 rounded px-1.5 py-1 outline-none focus:border-violet-400"
                >
                  <option value="adam">Adam</option>
                  <option value="sgd">SGD</option>
                  <option value="rmsprop">RMSprop</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 w-20">Learning rate:</label>
                <input
                  type="number"
                  value={modelSpec.learningRate}
                  step={0.001}
                  min={0.0001}
                  max={1}
                  onChange={(e) => setModelSpec((p) => ({ ...p, learningRate: parseFloat(e.target.value) || 0.01 }))}
                  className="w-24 text-xs bg-white border border-gray-200 rounded px-1.5 py-1 outline-none focus:border-violet-400"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 w-20">Epochs:</label>
                <input
                  type="number"
                  value={epochs}
                  min={1}
                  max={500}
                  onChange={(e) => setEpochs(parseInt(e.target.value) || 1)}
                  className="w-24 text-xs bg-white border border-gray-200 rounded px-1.5 py-1 outline-none focus:border-violet-400"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 w-20">Batch size:</label>
                <input
                  type="number"
                  value={batchSize}
                  min={1}
                  max={128}
                  onChange={(e) => setBatchSize(parseInt(e.target.value) || 1)}
                  className="w-24 text-xs bg-white border border-gray-200 rounded px-1.5 py-1 outline-none focus:border-violet-400"
                />
              </div>
            </div>

            {/* Train button */}
            <button
              onClick={train}
              disabled={trainingState === "building" || trainingState === "training"}
              className="mt-3 w-full h-10 rounded-full bg-violet-600 text-white text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-violet-700 disabled:opacity-50"
            >
              {trainingState === "building" ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Loading TensorFlow.js…</>
              ) : trainingState === "training" ? (
                <><Square className="w-4 h-4" /> Training… (epoch {epochLogs.length}/{epochs})</>
              ) : (
                <><Play className="w-4 h-4" /> Train Model</>
              )}
            </button>
          </section>
        </div>

        {/* Right column: Training metrics + visualizations */}
        <div className="space-y-4">
          {/* Stats cards */}
          {trainingState === "done" && lastLog && (
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
                <div className="flex items-center gap-1.5 text-violet-600 mb-1">
                  <TrendingDown className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase">Final Loss</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">{lastLog.loss.toFixed(4)}</p>
                <p className="text-[10px] text-gray-500">Best: {bestLoss?.toFixed(4)}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
                <div className="flex items-center gap-1.5 text-emerald-600 mb-1">
                  <Target className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase">{demo.loss.includes("entropy") ? "Accuracy" : "MSE"}</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {lastLog.acc !== undefined
                    ? `${(lastLog.acc * 100).toFixed(1)}%`
                    : lastLog.loss.toFixed(4)}
                </p>
                <p className="text-[10px] text-gray-500">
                  Best: {bestAcc !== null ? `${(bestAcc * 100).toFixed(1)}%` : "N/A"}
                </p>
              </div>
            </div>
          )}

          {/* Loss curve */}
          {epochLogs.length > 0 && (
            <section className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5 mb-3">
                <TrendingDown className="w-4 h-4 text-violet-500" /> Loss Curve
              </h2>
              <LossCurve logs={epochLogs} />
            </section>
          )}

          {/* Decision boundary (2D classifiers only) */}
          {decisionBoundary && (
            <section className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5">
                <Brain className="w-4 h-4 text-violet-500" /> Decision Boundary
              </h2>
              <div className="flex justify-center">
                <img
                  src={decisionBoundary}
                  alt="Decision boundary"
                  className="w-64 h-64 rounded-lg border border-gray-200 image-rendered pixelated"
                  style={{ imageRendering: "pixelated" }}
                />
              </div>
              <p className="text-[10px] text-gray-400 text-center mt-2">
                Blue = class 0, Red = class 1. The network learns to separate the input space.
              </p>
            </section>
          )}

          {/* Epoch log */}
          {epochLogs.length > 0 && (
            <section className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <h2 className="text-sm font-bold text-gray-900 mb-2">Training Log</h2>
              <div className="max-h-48 overflow-y-auto space-y-0.5">
                {epochLogs.slice(-10).map((log) => (
                  <div key={log.epoch} className="text-[10px] font-mono text-gray-600 flex gap-3">
                    <span className="text-gray-400">epoch {log.epoch}</span>
                    <span>loss={log.loss.toFixed(4)}</span>
                    {log.acc !== undefined && <span>acc={log.acc.toFixed(4)}</span>}
                    {log.val_loss !== undefined && <span className="text-violet-500">val_loss={log.val_loss.toFixed(4)}</span>}
                    {log.val_acc !== undefined && <span className="text-emerald-500">val_acc={log.val_acc.toFixed(4)}</span>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Saved indicator */}
          {savedAt && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
              <p className="text-xs font-semibold text-emerald-700">
                ✓ Model saved! Find it in My Projects.
              </p>
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-rose-700">{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Loss curve visualization — a simple SVG line chart.
 * Renders loss + accuracy + val_loss + val_acc as separate lines.
 */
function LossCurve({ logs }: { logs: EpochLog[] }) {
  const width = 400;
  const height = 200;
  const padding = 30;

  if (logs.length === 0) return null;

  // Find min/max for scaling
  const allLoss = logs.map((l) => l.loss);
  const allValLoss = logs.map((l) => l.val_loss).filter(Boolean) as number[];
  const allValues = [...allLoss, ...allValLoss];
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const range = maxVal - minVal || 1;

  const xScale = (i: number) => padding + (i / (logs.length - 1)) * (width - 2 * padding);
  const yScale = (v: number) => height - padding - ((v - minVal) / range) * (height - 2 * padding);

  const lossPath = logs.map((l, i) => `${i === 0 ? "M" : "L"} ${xScale(i)} ${yScale(l.loss)}`).join(" ");
  const valLossPath = logs.map((l, i) => l.val_loss !== undefined ? `${i === 0 ? "M" : "L"} ${xScale(i)} ${yScale(l.val_loss)}` : "").filter(Boolean).join(" ");

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <line key={t} x1={padding} y1={padding + t * (height - 2 * padding)} x2={width - padding} y2={padding + t * (height - 2 * padding)} stroke="#e5e7eb" strokeWidth={0.5} />
      ))}
      {/* Loss line */}
      <path d={lossPath} fill="none" stroke="#7c3aed" strokeWidth={2} />
      {/* Val loss line */}
      {valLossPath && <path d={valLossPath} fill="none" stroke="#10b981" strokeWidth={2} strokeDasharray="4 2" />}
      {/* Axis labels */}
      <text x={padding} y={height - 8} fontSize={9} fill="#9ca3af">Epoch {logs[0].epoch}</text>
      <text x={width - padding} y={height - 8} fontSize={9} fill="#9ca3af" textAnchor="end">Epoch {logs[logs.length - 1].epoch}</text>
      <text x={padding - 8} y={padding + 4} fontSize={9} fill="#9ca3af" textAnchor="end">{maxVal.toFixed(3)}</text>
      <text x={padding - 8} y={height - padding} fontSize={9} fill="#9ca3af" textAnchor="end">{minVal.toFixed(3)}</text>
      {/* Legend */}
      <g transform={`translate(${width - padding - 80}, ${padding})`}>
        <rect width={80} height={28} fill="white" stroke="#e5e7eb" rx={4} />
        <line x1={6} y1={10} x2={16} y2={10} stroke="#7c3aed" strokeWidth={2} />
        <text x={20} y={13} fontSize={9} fill="#4b5563">loss</text>
        <line x1={6} y1={22} x2={16} y2={22} stroke="#10b981" strokeWidth={2} strokeDasharray="4 2" />
        <text x={20} y={25} fontSize={9} fill="#4b5563">val_loss</text>
      </g>
    </svg>
  );
}
