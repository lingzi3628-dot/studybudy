"use client";

/**
 * MLPlaygroundScreen — Phase 50, upgraded in Phase 57 (MLBuddy 2.0)
 *
 * Interactive ML training playground powered by TensorFlow.js.
 *
 * Phase 50:
 *   - Pre-loaded demo datasets (XOR, Iris, Housing) + architecture editor
 *   - Real-time loss curve, decision boundary for 2D problems
 *   - Save the trained model as a Project file (model.json + README)
 *
 * Phase 57 (MLBuddy 2.0):
 *   - Synthetic Digits (MNIST-style) CNN demo with a draw-your-own-digit
 *     inference pad (canvas → 28×28 MNIST-style normalization → predict)
 *   - Confusion matrix + per-class precision/recall/F1 on a held-out set
 *   - CSV dataset upload/paste: dtype profiling, feature/target picking,
 *     mean imputation, one-hot encoding, z-score normalization, train/test
 *     split, and a recommended starter architecture
 *   - Export: downloadable TFJS model.json + weights.bin, equivalent
 *     Keras Python script, one-page model card, and "Send to Notebook"
 *     (Notebook ↔ Playground bridge)
 */

import { useEffect, useState, useCallback, useRef } from "react";
import {
  ChevronLeft, Play, Loader2, Square, Save, Brain, Target,
  TrendingDown, Layers, Database, Sparkles, Download, Upload,
  Eraser, PencilLine, FileCode2, FileText, Send, Grid3x3,
} from "lucide-react";
import { useApp } from "../store";
import {
  DEMOS, getDemoById, buildModel, trainModel, predict, modelToJSON, disposeModel,
  predictFromFlat, modelToDownloadArtifact, argmaxRow,
  type DemoDataset, type ModelSpec, type LayerSpec,
} from "@/lib/ml-engine";
import {
  computeConfusionMatrix, summarizeMatrix, type MatrixSummary,
} from "@/lib/confusion-matrix";
import {
  parseCsv, profileColumns, buildTabularDataset, recommendModelSpec,
  type CsvTable, type ColumnProfile, type TabularDataset,
} from "@/lib/csv-dataset";
import { kerasPythonFromSpec, buildModelCard } from "@/lib/model-export";
import { centerResizeTo28, digitToAscii, DIGIT_CLASS_NAMES } from "@/lib/mnist-data";

type TrainingState = "idle" | "building" | "training" | "done" | "error";

type EpochLog = {
  epoch: number;
  loss: number;
  acc?: number;
  val_loss?: number;
  val_acc?: number;
};

type EvalResult = {
  matrix: number[][];
  summary: MatrixSummary;
  classNames?: string[];
  heldOut: boolean;
  evalXs: number[][];
  truth: number[];
  predicted: number[];
};

type TrainInfo = {
  datasetName: string;
  rowCount: number;
  epochs: number;
  batchSize: number;
  finalLoss?: number;
  finalAccuracy?: number;
  isClassification: boolean;
};

function describeLayers(spec: ModelSpec): string[] {
  return spec.layers.map((l) => {
    switch (l.type) {
      case "dense":
        return `Dense(${l.units ?? 1}, ${l.activation ?? "linear"})`;
      case "dropout":
        return `Dropout(${l.rate ?? 0.5})`;
      case "flatten":
        return "Flatten";
      case "conv2d":
        return `Conv2D(${l.filters ?? 32}, ${l.kernelSize ?? 3}×${l.kernelSize ?? 3}, ${l.activation ?? "relu"})`;
      case "maxPooling2d":
        return `MaxPooling2D(${l.poolSize ?? 2}×${l.poolSize ?? 2})`;
      default:
        return l.type;
    }
  });
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function downloadText(filename: string, content: string, mime = "text/plain") {
  downloadBlob(filename, new Blob([content], { type: `${mime};charset=utf-8` }));
}

export function MLPlaygroundScreen() {
  const { setScreen, activeProjectId, setActiveProjectId, mlBridgeCsv, setMlBridgeCsv, setNotebookBridgeCell } = useApp() as any;
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
  const [exporting, setExporting] = useState(false);

  // Phase 57 — CSV mode
  const [csvActive, setCsvActive] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [csvTable, setCsvTable] = useState<CsvTable | null>(null);
  const [csvProfiles, setCsvProfiles] = useState<ColumnProfile[]>([]);
  const [csvTarget, setCsvTarget] = useState<string>("");
  const [csvFeatures, setCsvFeatures] = useState<Set<string>>(new Set());
  const [csvTestSplit, setCsvTestSplit] = useState(0.2);
  const [csvNormalize, setCsvNormalize] = useState(true);
  const [tabular, setTabular] = useState<TabularDataset | null>(null);

  // Phase 57 — evaluation + digit pad
  const [evalResult, setEvalResult] = useState<EvalResult | null>(null);
  const [selectedCell, setSelectedCell] = useState<{ truth: number; pred: number } | null>(null);
  const [trainInfo, setTrainInfo] = useState<TrainInfo | null>(null);

  const demo = getDemoById(selectedDemoId) as DemoDataset;
  const isConv = !tabular && demo.inputShape.length === 3;
  const numClasses = tabular ? tabular.outputShape[0] : demo.outputShape[0];
  const classNames = tabular?.classNames ?? (demo.id === "digits" ? DIGIT_CLASS_NAMES : undefined);

  // Consume the Notebook → Playground bridge (CSV from a dataframe output)
  useEffect(() => {
    if (mlBridgeCsv) {
      setCsvText(mlBridgeCsv);
      setCsvActive(true);
      setTabular(null);
      setMlBridgeCsv(null);
    }
  }, [mlBridgeCsv, setMlBridgeCsv]);

  // Update model spec when demo changes
  const onDemoChange = (newId: string) => {
    const newDemo = getDemoById(newId);
    if (newDemo) {
      setSelectedDemoId(newId);
      setModelSpec(newDemo.modelSpec);
      setEpochLogs([]);
      setTrainingState("idle");
      setDecisionBoundary(null);
      setEvalResult(null);
      setSelectedCell(null);
      setTabular(null);
      setCsvActive(false);
      if (newDemo.recommendedEpochs) setEpochs(newDemo.recommendedEpochs);
      else setEpochs(50);
      if (newDemo.recommendedBatchSize) setBatchSize(newDemo.recommendedBatchSize);
      else setBatchSize(4);
    }
  };

  const openCsvMode = () => {
    setCsvActive(true);
    setDecisionBoundary(null);
    setEvalResult(null);
    setSelectedCell(null);
  };

  // Analyze the pasted/uploaded CSV
  const analyzeCsv = () => {
    setError(null);
    setTabular(null);
    try {
      const table = parseCsv(csvText);
      if (table.headers.length < 2) throw new Error("Need at least 2 columns (features + target)");
      if (table.rows.length < 10) throw new Error("Need at least 10 data rows to train");
      const profiles = profileColumns(table);
      setCsvTable(table);
      setCsvProfiles(profiles);
      // Guess the last column as target (common convention)
      const guess = table.headers[table.headers.length - 1];
      setCsvTarget(guess);
      setCsvFeatures(new Set(table.headers.filter((h) => h !== guess)));
    } catch (e: any) {
      setCsvTable(null);
      setError(e?.message ?? "Failed to parse CSV");
    }
  };

  const toggleFeature = (name: string) => {
    setCsvFeatures((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // Build the tabular dataset + recommended model
  const useCsvDataset = () => {
    if (!csvTable) return;
    setError(null);
    try {
      const ds = buildTabularDataset(csvTable, {
        target: csvTarget,
        features: [...csvFeatures],
        testSplit: csvTestSplit,
        normalize: csvNormalize,
      });
      setTabular(ds);
      setModelSpec(recommendModelSpec(ds));
      setEpochLogs([]);
      setTrainingState("idle");
      setEvalResult(null);
      setSelectedCell(null);
      setEpochs(ds.isClassification ? 40 : 60);
      setBatchSize(16);
    } catch (e: any) {
      setError(e?.message ?? "Failed to build dataset");
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
    setEvalResult(null);
    setSelectedCell(null);
    setDecisionBoundary(null);

    try {
      // Dispose any previous model BEFORE building the new one
      disposeModel(modelRef);

      // Build the model
      const model = await buildModel(modelSpec);
      setModelRef(model);

      const tf = await import("@tensorflow/tfjs");

      // Resolve data (demo or CSV) + evaluation set
      let xsRows: number[][], ysRows: number[][];
      let evalXs: number[][], evalYs: number[][];
      let heldOut: boolean;
      if (tabular) {
        xsRows = tabular.trainXs;
        ysRows = tabular.trainYs;
        if (tabular.testXs.length >= 5) {
          evalXs = tabular.testXs;
          evalYs = tabular.testYs;
          heldOut = true;
        } else {
          evalXs = tabular.trainXs;
          evalYs = tabular.trainYs;
          heldOut = false;
        }
      } else {
        const data = await demo.generateData();
        xsRows = data.xs;
        ysRows = data.ys;
        if (demo.generateEvalData) {
          const ev = await demo.generateEvalData();
          evalXs = ev.xs;
          evalYs = ev.ys;
          heldOut = true;
        } else {
          evalXs = data.xs;
          evalYs = data.ys;
          heldOut = false;
        }
      }

      const inputShape = tabular ? tabular.inputShape : demo.inputShape;

      setTrainingState("training");

      // Train with callbacks
      const result = await trainModel(
        model,
        isConv
          ? (tf.tensor2d(xsRows) as any).reshape([xsRows.length, ...inputShape])
          : tf.tensor2d(xsRows),
        tf.tensor2d(ysRows),
        epochs,
        batchSize,
        validationSplit,
        {
          onEpochEnd: (epoch, logs) => {
            setEpochLogs((prev) => [...prev, {
              epoch: epoch + 1,
              loss: logs.loss,
              acc: logs.acc,
              val_loss: logs.val_loss,
              val_acc: logs.val_acc,
            }]);
          },
        }
      );

      // For 2D classification (XOR), draw the decision boundary
      if (!tabular && demo.inputShape.length === 1 && demo.inputShape[0] === 2) {
        await drawDecisionBoundary(model);
      }

      // Phase 57 — confusion matrix on the evaluation set
      if (numClasses >= 2) {
        const evalPred = await predictFromFlat(model, evalXs, inputShape);
        const truth = evalYs.map(argmaxRow);
        const matrix = computeConfusionMatrix(truth, evalPred.predictedClasses, numClasses);
        const summary = summarizeMatrix(matrix);
        setEvalResult({
          matrix,
          summary,
          classNames,
          heldOut,
          evalXs,
          truth,
          predicted: evalPred.predictedClasses,
        });
      }

      const lastLog = result.history.loss.length > 0
        ? {
            loss: result.history.loss[result.history.loss.length - 1],
            acc: result.history.acc[result.history.acc.length - 1],
          }
        : undefined;

      setTrainInfo({
        datasetName: tabular ? "My CSV dataset (uploaded)" : demo.name,
        rowCount: tabular ? tabular.rowCount : xsRows.length,
        epochs,
        batchSize,
        finalLoss: lastLog?.loss,
        finalAccuracy: lastLog?.acc,
        isClassification: numClasses >= 2,
      });

      setTrainingState("done");
    } catch (e: any) {
      setError(e?.message ?? "Training failed");
      setTrainingState("error");
    }
  }, [modelSpec, demo, tabular, epochs, batchSize, validationSplit, modelRef, isConv, numClasses, classNames]);

  // Draw the decision boundary for a 2D classifier
  const drawDecisionBoundary = async (model: any) => {
    try {
      const tf = await import("@tensorflow/tfjs");
      const resolution = 50;
      const grid: number[][] = [];
      for (let x = 0; x <= resolution; x++) {
        for (let y = 0; y <= resolution; y++) {
          grid.push([x / resolution, y / resolution]);
        }
      }
      const predictions = await predict(model, grid);
      const classes = predictions.predictedClasses;

      const canvas = document.createElement("canvas");
      canvas.width = resolution;
      canvas.height = resolution;
      const ctx = canvas.getContext("2d")!;
      const imageData = ctx.createImageData(resolution, resolution);

      for (let i = 0; i < classes.length; i++) {
        const c = classes[i];
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
      const datasetName = tabular ? "My CSV dataset" : demo.name;
      const files = [
        { path: "model.json", language: "json", content: modelJson, isEntry: true },
        {
          path: "README.md",
          language: "markdown",
          content: `# ${datasetName} Model\n\nTrained with MLBuddy (Phase 57) using TensorFlow.js.\n\n## Architecture\n\n${modelSpec.layers.map((l, i) => `- Layer ${i + 1}: ${describeLayers(modelSpec)[i]}`).join("\n")}\n\n## Training\n- Dataset: ${datasetName}\n- Epochs: ${epochs}\n- Optimizer: ${modelSpec.optimizer} (lr=${modelSpec.learningRate})\n- Final loss: ${epochLogs[epochLogs.length - 1]?.loss.toFixed(4) ?? "N/A"}\n- Final accuracy: ${epochLogs[epochLogs.length - 1]?.acc?.toFixed(4) ?? "N/A"}${evalResult ? `\n- Held-out accuracy: ${(evalResult.summary.accuracy * 100).toFixed(1)}%\n- Macro F1: ${evalResult.summary.macroF1.toFixed(3)}` : ""}\n`,
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
            title: `${datasetName} model`,
            description: `Trained ML model: ${datasetName}`,
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
  }, [modelRef, demo, tabular, modelSpec, epochs, epochLogs, evalResult, activeProjectId, setActiveProjectId]);

  // Phase 57 — export helpers
  const kerasCode = trainInfo && kerasPythonFromSpec(modelSpec, {
    modelName: tabular ? "tabular_model" : `${demo.id}_model`,
    taskType: trainInfo.isClassification ? "classification" : "regression",
    classNames: tabular ? tabular.classNames : classNames,
    featureNames: tabular ? tabular.featureNames : undefined,
    epochs: trainInfo.epochs,
    batchSize: trainInfo.batchSize,
  });

  const modelCard = trainInfo && buildModelCard({
    modelName: tabular ? "Tabular model" : `${demo.name} model`,
    datasetName: trainInfo.datasetName,
    taskType: trainInfo.isClassification ? "classification" : "regression",
    dateISO: new Date().toISOString().slice(0, 10),
    inputShape: tabular ? tabular.inputShape : demo.inputShape,
    featureNames: tabular ? tabular.featureNames : undefined,
    classNames: tabular ? tabular.classNames : classNames,
    rowCount: trainInfo.rowCount,
    architecture: describeLayers(modelSpec),
    optimizer: modelSpec.optimizer,
    learningRate: modelSpec.learningRate,
    epochs: trainInfo.epochs,
    batchSize: trainInfo.batchSize,
    finalLoss: trainInfo.finalLoss,
    finalAccuracy: trainInfo.finalAccuracy,
    macroF1: evalResult?.summary.macroF1,
    testAccuracy: evalResult?.heldOut ? evalResult.summary.accuracy : undefined,
    topConfusions: evalResult?.summary && classNames
      ? evalResult.matrix
        .flatMap((row, t) => row.map((count, p) => ({ count, truth: t, predicted: p })))
        .filter((c) => c.truth !== c.predicted)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map((c) => ({ truth: classNames[c.truth], predicted: classNames[c.predicted], count: c.count }))
      : [],
  });

  const exportModelFiles = async () => {
    if (!modelRef) return;
    setExporting(true);
    try {
      const { modelJson, weightData } = await modelToDownloadArtifact(modelRef);
      downloadText("model.json", JSON.stringify(modelJson, null, 2), "application/json");
      downloadBlob("weights.bin", new Blob([weightData], { type: "application/octet-stream" }));
    } catch (e: any) {
      setError(e?.message ?? "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const sendToNotebook = () => {
    if (!kerasCode) return;
    setNotebookBridgeCell({
      code: kerasCode,
      label: `Keras training code — ${tabular ? "my CSV dataset" : demo.name}`,
    });
    setScreen("notebook");
  };

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
                    !csvActive && selectedDemoId === d.id
                      ? "border-violet-500 bg-violet-50"
                      : "border-gray-200 bg-white hover:border-violet-300"
                  }`}
                >
                  <p className="text-sm font-semibold text-gray-900">
                    {d.name}
                    {d.id === "digits" && (
                      <span className="ml-2 text-[10px] font-bold text-violet-600 bg-violet-100 rounded-full px-1.5 py-0.5 align-middle">NEW · CNN</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{d.description}</p>
                  <p className="text-[10px] text-gray-400 mt-1">
                    {`Input: [${d.inputShape.join(", ")}] · Output: [${d.outputShape.join(", ")}] · Loss: ${d.loss}`}
                  </p>
                </button>
              ))}

              {/* CSV dataset card */}
              <button
                onClick={openCsvMode}
                className={`text-left p-3 rounded-xl border transition ${
                  csvActive
                    ? "border-violet-500 bg-violet-50"
                    : "border-gray-200 bg-white hover:border-violet-300"
                }`}
              >
                <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5 text-violet-500" />
                  My CSV dataset
                  {tabular && (
                    <span className="ml-1 text-[10px] font-bold text-emerald-600 bg-emerald-100 rounded-full px-1.5 py-0.5">LOADED</span>
                  )}
                  <span className="ml-auto text-[10px] font-bold text-violet-600 bg-violet-100 rounded-full px-1.5 py-0.5">NEW</span>
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Paste or upload a CSV. Columns are profiled automatically, then you pick the target and features.
                </p>
              </button>
            </div>
          </section>

          {/* CSV configuration */}
          {csvActive && (
            <section className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5 mb-3">
                <Upload className="w-4 h-4 text-violet-500" /> CSV dataset
              </h2>

              {!csvTable ? (
                <>
                  <label className="block">
                    <span className="text-[10px] font-semibold text-gray-500 uppercase">Paste CSV (or choose a file)</span>
                    <textarea
                      value={csvText}
                      onChange={(e) => setCsvText(e.target.value)}
                      placeholder={"age,fare,sex,survived\n22,7.25,male,0\n38,71.28,female,1\n..."}
                      rows={6}
                      className="mt-1 w-full text-xs font-mono bg-gray-50 border border-gray-200 rounded-xl p-2.5 outline-none focus:border-violet-400"
                    />
                  </label>
                  <div className="flex items-center gap-2 mt-2">
                    <label className="flex-1">
                      <input
                        type="file"
                        accept=".csv,text/csv,text/plain"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          if (f.size > 2 * 1024 * 1024) {
                            setError("CSV file too large (max 2 MB)");
                            return;
                          }
                          const text = await f.text();
                          setCsvText(text);
                        }}
                        className="text-xs text-gray-500 file:mr-2 file:px-3 file:py-1.5 file:rounded-full file:border-0 file:bg-violet-50 file:text-violet-700 file:text-xs file:font-semibold cursor-pointer"
                      />
                    </label>
                    <button
                      onClick={analyzeCsv}
                      disabled={!csvText.trim()}
                      className="px-4 h-9 rounded-full bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-50 flex-shrink-0"
                    >
                      Analyze
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* Column profile table */}
                  <div className="overflow-x-auto -mx-1 px-1">
                    <table className="text-xs border-collapse w-full">
                      <thead>
                        <tr className="text-[10px] uppercase text-gray-400">
                          <th className="text-left py-1 pr-2">Column</th>
                          <th className="text-left py-1 pr-2">Type</th>
                          <th className="text-right py-1 pr-2">Missing</th>
                          <th className="text-right py-1 pr-2">Unique</th>
                          <th className="text-left py-1">Range</th>
                        </tr>
                      </thead>
                      <tbody>
                        {csvProfiles.map((p) => (
                          <tr key={p.name} className="border-t border-gray-100">
                            <td className="py-1.5 pr-2 font-semibold text-gray-800">{p.name}</td>
                            <td className="py-1.5 pr-2">
                              <span className={`text-[10px] font-bold rounded px-1 py-0.5 ${
                                p.dtype === "number" ? "bg-sky-100 text-sky-700"
                                : p.dtype === "boolean" ? "bg-amber-100 text-amber-700"
                                : p.dtype === "empty" ? "bg-gray-100 text-gray-500"
                                : "bg-fuchsia-100 text-fuchsia-700"
                              }`}>{p.dtype}</span>
                            </td>
                            <td className="py-1.5 pr-2 text-right text-gray-600">{p.missing}</td>
                            <td className="py-1.5 pr-2 text-right text-gray-600">{p.unique}</td>
                            <td className="py-1.5 text-[10px] text-gray-400 truncate max-w-[8rem]">
                              {p.dtype === "number" ? `${p.min?.toFixed(2)} – ${p.max?.toFixed(2)}` : p.samples.join(", ")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Target + features */}
                  <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500 w-24 flex-shrink-0">Target (y):</label>
                      <select
                        value={csvTarget}
                        onChange={(e) => {
                          setCsvTarget(e.target.value);
                          setCsvFeatures((prev) => {
                            const next = new Set(Array.from(csvTable.headers).filter((h) => h !== e.target.value));
                            return next;
                          });
                        }}
                        className="flex-1 text-xs bg-white border border-gray-200 rounded px-1.5 py-1 outline-none focus:border-violet-400"
                      >
                        {csvTable.headers.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Features (X) — tap to toggle:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {csvTable.headers.filter((h) => h !== csvTarget).map((h) => (
                          <button
                            key={h}
                            onClick={() => toggleFeature(h)}
                            className={`text-[11px] rounded-full px-2 py-1 border transition ${
                              csvFeatures.has(h)
                                ? "bg-violet-100 border-violet-300 text-violet-700 font-semibold"
                                : "bg-gray-50 border-gray-200 text-gray-400"
                            }`}
                          >
                            {h}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500">Test split:</label>
                        <input
                          type="number"
                          value={csvTestSplit}
                          min={0}
                          max={0.5}
                          step={0.05}
                          onChange={(e) => setCsvTestSplit(parseFloat(e.target.value) || 0)}
                          className="w-16 text-xs bg-white border border-gray-200 rounded px-1.5 py-1 outline-none focus:border-violet-400"
                        />
                      </div>
                      <label className="flex items-center gap-1.5 text-xs text-gray-600">
                        <input
                          type="checkbox"
                          checked={csvNormalize}
                          onChange={(e) => setCsvNormalize(e.target.checked)}
                          className="accent-violet-600"
                        />
                        Normalize (z-score)
                      </label>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-3">
                    <button
                      onClick={useCsvDataset}
                      className="flex-1 h-9 rounded-full bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700"
                    >
                      Use this dataset
                    </button>
                    <button
                      onClick={() => { setCsvTable(null); setCsvProfiles([]); setTabular(null); }}
                      className="h-9 px-3 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200 flex items-center gap-1"
                    >
                      <Eraser className="w-3.5 h-3.5" /> Reset
                    </button>
                  </div>
                </>
              )}
            </section>
          )}

          {/* Loaded CSV summary */}
          {tabular && (
            <section className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
              <h2 className="text-sm font-bold text-emerald-800 flex items-center gap-1.5 mb-2">
                <Grid3x3 className="w-4 h-4" /> Dataset ready
              </h2>
              <div className="text-xs text-emerald-800 space-y-1">
                <p>{tabular.rowCount} usable rows{tabular.droppedRows > 0 ? ` (${tabular.droppedRows} dropped for missing target)` : ""} · {tabular.featureCount} features</p>
                <p>
                  {tabular.isClassification
                    ? `Classification — ${tabular.classNames?.length} classes: ${tabular.classNames?.join(", ")}`
                    : "Regression — continuous target"}
                </p>
                {tabular.droppedFeatures.map((f) => (
                  <p key={f.name} className="text-amber-700">⚠ Dropped <b>{f.name}</b>: {f.reason}</p>
                ))}
                <p className="text-emerald-600">
                  Train/test split: {tabular.trainXs.length} / {tabular.testXs.length} · A starter architecture was loaded below.
                </p>
              </div>
            </section>
          )}

          {/* Model architecture */}
          <section className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-violet-500" /> Architecture
              </h2>
              {!isConv && (
                <button
                  onClick={addLayer}
                  className="text-xs text-violet-600 font-medium hover:text-violet-700"
                >
                  + Layer
                </button>
              )}
            </div>
            {isConv ? (
              <div className="p-3 rounded-xl bg-violet-50 border border-violet-100">
                <p className="text-xs font-semibold text-violet-800">Convolutional network (fixed for the digits demo)</p>
                <div className="mt-1.5 space-y-0.5">
                  {describeLayers(modelSpec).map((l, i) => (
                    <p key={i} className="text-[11px] font-mono text-violet-700">{i + 1}. {l}</p>
                  ))}
                </div>
              </div>
            ) : (
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
            )}

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

        {/* Right column: Training metrics + evaluation + export */}
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
                  <span className="text-xs font-bold uppercase">{demo.loss.includes("entropy") || tabular?.isClassification ? "Accuracy" : "MSE"}</span>
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

          {/* Phase 57 — Confusion matrix */}
          {evalResult && (
            <section className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                  <Grid3x3 className="w-4 h-4 text-violet-500" /> Confusion Matrix
                </h2>
                <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${
                  evalResult.heldOut ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                }`}>
                  {evalResult.heldOut ? "HELD-OUT SET" : "TRAINING DATA"}
                </span>
              </div>
              <p className="text-[11px] text-gray-500 mb-3">
                Accuracy {(evalResult.summary.accuracy * 100).toFixed(1)}% · Macro F1 {evalResult.summary.macroF1.toFixed(3)} · rows = true class, columns = prediction. Tap a wrong cell to inspect samples.
              </p>
              <ConfusionMatrixView
                matrix={evalResult.matrix}
                classNames={evalResult.classNames}
                selected={selectedCell}
                onSelect={(truth, pred) => setSelectedCell({ truth, pred })}
              />
              <ClassMetricsTable summary={evalResult.summary} classNames={evalResult.classNames} />

              {/* Misclassified sample inspector (digits) */}
              {selectedCell && evalResult.classNames && demo.id === "digits" && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-800 mb-2">
                    True {evalResult.classNames[selectedCell.truth]} → predicted {evalResult.classNames[selectedCell.pred]} · {evalResult.matrix[selectedCell.truth][selectedCell.pred]} sample(s)
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {evalResult.evalXs
                      .map((row, i) => ({ row, i }))
                      .filter(({ i }) => evalResult.truth[i] === selectedCell.truth && evalResult.predicted[i] === selectedCell.pred)
                      .slice(0, 3)
                      .map(({ row, i }) => (
                        <div key={i} className="bg-gray-50 rounded-lg border border-gray-200 p-1">
                          <pre className="text-[4px] leading-[4px] font-mono text-gray-800 overflow-hidden">{digitToAscii(row)}</pre>
                          <p className="text-[9px] text-center text-gray-500 mt-0.5">#{i + 1}</p>
                        </div>
                      ))}
                  </div>
                </div>
              )}
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

          {/* Phase 57 — Draw-a-digit inference pad */}
          {trainingState === "done" && demo.id === "digits" && modelRef && (
            <DigitDrawPad model={modelRef} classNames={DIGIT_CLASS_NAMES} />
          )}

          {/* Phase 57 — Export panel */}
          {trainingState === "done" && modelRef && trainInfo && (
            <section className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5 mb-3">
                <Download className="w-4 h-4 text-violet-500" /> Export
              </h2>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={exportModelFiles}
                  disabled={exporting}
                  className="h-9 rounded-full bg-gray-900 text-white text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-gray-800 disabled:opacity-50"
                >
                  {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  TFJS model (2 files)
                </button>
                <button
                  onClick={() => downloadText("model.py", kerasCode ?? "", "text/x-python")}
                  className="h-9 rounded-full bg-gray-100 text-gray-800 text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-gray-200"
                >
                  <FileCode2 className="w-3.5 h-3.5" /> Keras model.py
                </button>
                <button
                  onClick={() => downloadText("MODEL_CARD.md", modelCard ?? "", "text/markdown")}
                  className="h-9 rounded-full bg-gray-100 text-gray-800 text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-gray-200"
                >
                  <FileText className="w-3.5 h-3.5" /> Model card
                </button>
                <button
                  onClick={sendToNotebook}
                  className="h-9 rounded-full bg-sky-100 text-sky-700 text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-sky-200"
                >
                  <Send className="w-3.5 h-3.5" /> Send to Notebook
                </button>
              </div>
              <p className="text-[10px] text-gray-400 mt-2">
                The Keras script re-creates this exact architecture in Python; the model card documents architecture, metrics and limitations.
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
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <line key={t} x1={padding} y1={padding + t * (height - 2 * padding)} x2={width - padding} y2={padding + t * (height - 2 * padding)} stroke="#e5e7eb" strokeWidth={0.5} />
      ))}
      <path d={lossPath} fill="none" stroke="#7c3aed" strokeWidth={2} />
      {valLossPath && <path d={valLossPath} fill="none" stroke="#10b981" strokeWidth={2} strokeDasharray="4 2" />}
      <text x={padding} y={height - 8} fontSize={9} fill="#9ca3af">Epoch {logs[0].epoch}</text>
      <text x={width - padding} y={height - 8} fontSize={9} fill="#9ca3af" textAnchor="end">Epoch {logs[logs.length - 1].epoch}</text>
      <text x={padding - 8} y={padding + 4} fontSize={9} fill="#9ca3af" textAnchor="end">{maxVal.toFixed(3)}</text>
      <text x={padding - 8} y={height - padding} fontSize={9} fill="#9ca3af" textAnchor="end">{minVal.toFixed(3)}</text>
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

/**
 * Phase 57 — Confusion matrix grid. Diagonal cells glow emerald, errors
 * glow rose; intensity scales with the cell share of its row. Clicking
 * an off-diagonal cell selects it for the sample inspector.
 */
function ConfusionMatrixView({
  matrix, classNames, selected, onSelect,
}: {
  matrix: number[][];
  classNames?: string[];
  selected: { truth: number; pred: number } | null;
  onSelect: (truth: number, pred: number) => void;
}) {
  const n = matrix.length;
  const cell = n <= 5 ? 44 : n <= 8 ? 36 : 30;
  const label = 26;
  const maxPerRow = matrix.map((row) => Math.max(...row, 1));

  const label2 = (i: number) => (classNames?.[i] ?? `C${i}`).slice(0, 4);

  return (
    <div className="overflow-x-auto pb-1">
      <div style={{ width: label + n * cell + 2 }}>
        {/* Top labels = predicted */}
        <div className="flex" style={{ marginLeft: label }}>
          {Array.from({ length: n }, (_, p) => (
            <div key={p} style={{ width: cell }} className="text-[9px] text-center font-semibold text-gray-500 truncate">
              {label2(p)}
            </div>
          ))}
        </div>
        {matrix.map((row, t) => (
          <div key={t} className="flex items-center" style={{ height: cell }}>
            {/* Left labels = true */}
            <div style={{ width: label }} className="text-[9px] text-right pr-1 font-semibold text-gray-500 truncate">
              {label2(t)}
            </div>
            {row.map((count, p) => {
              const intensity = count / maxPerRow[t];
              const diagonal = t === p;
              const isSelected = selected?.truth === t && selected?.pred === p;
              const bg = count === 0
                ? "#f9fafb"
                : diagonal
                  ? `rgba(16,185,129,${0.15 + intensity * 0.75})`
                  : `rgba(244,63,94,${0.12 + intensity * 0.8})`;
              return (
                <button
                  key={p}
                  onClick={() => !diagonal && count > 0 && onSelect(t, p)}
                  title={`${label2(t)} → ${label2(p)}: ${count}`}
                  className="border border-white flex items-center justify-center text-[9px] font-bold transition"
                  style={{
                    width: cell,
                    height: cell,
                    background: bg,
                    color: intensity > 0.45 ? "white" : "#374151",
                    outline: isSelected ? "2px solid #7c3aed" : undefined,
                    cursor: !diagonal && count > 0 ? "pointer" : "default",
                  }}
                >
                  {count || ""}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Phase 57 — per-class precision / recall / F1 table.
 */
function ClassMetricsTable({ summary, classNames }: { summary: MatrixSummary; classNames?: string[] }) {
  const shown = summary.perClass.slice(0, 12);
  return (
    <div className="mt-3 pt-3 border-t border-gray-100 overflow-x-auto">
      <table className="text-[11px] border-collapse w-full">
        <thead>
          <tr className="text-[9px] uppercase text-gray-400">
            <th className="text-left py-1 pr-2">Class</th>
            <th className="text-right py-1 pr-2">Precision</th>
            <th className="text-right py-1 pr-2">Recall</th>
            <th className="text-right py-1 pr-2">F1</th>
            <th className="text-right py-1">Support</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((c) => (
            <tr key={c.class} className="border-t border-gray-50">
              <td className="py-1 pr-2 font-semibold text-gray-700">{classNames?.[c.class] ?? `Class ${c.class}`}</td>
              <td className="py-1 pr-2 text-right text-gray-600">{(c.precision * 100).toFixed(0)}%</td>
              <td className="py-1 pr-2 text-right text-gray-600">{(c.recall * 100).toFixed(0)}%</td>
              <td className="py-1 pr-2 text-right text-gray-600">{c.f1.toFixed(2)}</td>
              <td className="py-1 text-right text-gray-400">{c.support}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {summary.perClass.length > shown.length && (
        <p className="text-[9px] text-gray-400 mt-1">+ {summary.perClass.length - shown.length} more classes…</p>
      )}
    </div>
  );
}

/**
 * Phase 57 — probability bars for a single prediction.
 */
function ProbBars({ probs, classNames }: { probs: number[]; classNames: string[] }) {
  const best = probs.indexOf(Math.max(...probs));
  return (
    <div className="space-y-1 mt-2">
      {probs.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className={`text-[11px] font-mono w-4 ${i === best ? "text-violet-700 font-bold" : "text-gray-400"}`}>
            {classNames[i] ?? i}
          </span>
          <div className="flex-1 h-3.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${i === best ? "bg-violet-500" : "bg-gray-300"}`}
              style={{ width: `${Math.max(2, p * 100)}%` }}
            />
          </div>
          <span className={`text-[10px] w-9 text-right ${i === best ? "text-violet-700 font-bold" : "text-gray-400"}`}>
            {(p * 100).toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Phase 57 — draw-a-digit inference pad. Paint on a 280×280 canvas,
 * normalize to a 28×28 MNIST-style field (crop → scale to 20px box →
 * center-of-mass centering), then run the trained CNN.
 */
function DigitDrawPad({ model, classNames }: { model: any; classNames: string[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [predicting, setPredicting] = useState(false);
  const [result, setResult] = useState<{ probs: number[]; predicted: number } | null>(null);
  const [padError, setPadError] = useState<string | null>(null);

  // Paint the initial black background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current!;
    canvas.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const ctx = canvas.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 22;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const moveDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endDraw = () => {
    drawingRef.current = false;
  };

  const clear = () => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setResult(null);
    setPadError(null);
  };

  const predictDigit = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setPredicting(true);
    setPadError(null);
    try {
      const ctx = canvas.getContext("2d")!;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      // Grayscale (red channel — we paint pure black/white)
      const gray = new Float32Array(canvas.width * canvas.height);
      for (let i = 0; i < gray.length; i++) gray[i] = imageData.data[i * 4] / 255;

      // Check there is ink on the pad
      const ink = gray.reduce((s, v) => s + v, 0);
      if (ink < 10) {
        setPadError("Draw a digit first!");
        return;
      }

      const normalized = centerResizeTo28(gray, canvas.width, canvas.height);

      // Show the normalized 28×28 input
      const preview = previewRef.current;
      if (preview) {
        const pctx = preview.getContext("2d")!;
        const img = pctx.createImageData(28, 28);
        for (let i = 0; i < 784; i++) {
          const v = Math.round(normalized[i] * 255);
          img.data[i * 4] = v;
          img.data[i * 4 + 1] = v;
          img.data[i * 4 + 2] = v;
          img.data[i * 4 + 3] = 255;
        }
        pctx.putImageData(img, 0, 0);
      }

      const out = await predictFromFlat(model, [Array.from(normalized)], [28, 28, 1]);
      setResult({ probs: out.predictions[0], predicted: out.predictedClasses[0] });
    } catch (e: any) {
      setPadError(e?.message ?? "Prediction failed");
    } finally {
      setPredicting(false);
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
      <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5 mb-1">
        <PencilLine className="w-4 h-4 text-violet-500" /> Draw a digit
      </h2>
      <p className="text-[11px] text-gray-500 mb-3">
        The model has never seen YOUR handwriting — draw and test it. Input is normalized to 28×28 exactly like MNIST.
      </p>
      <div className="flex flex-col sm:flex-row gap-4">
        <div>
          <canvas
            ref={canvasRef}
            width={280}
            height={280}
            onPointerDown={startDraw}
            onPointerMove={moveDraw}
            onPointerUp={endDraw}
            onPointerLeave={endDraw}
            className="rounded-xl border-2 border-gray-300 touch-none w-56 h-56 cursor-crosshair bg-black"
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={predictDigit}
              disabled={predicting}
              className="flex-1 h-9 rounded-full bg-violet-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-violet-700 disabled:opacity-50"
            >
              {predicting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Predict
            </button>
            <button
              onClick={clear}
              className="h-9 px-3 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200 flex items-center gap-1"
            >
              <Eraser className="w-3.5 h-3.5" /> Clear
            </button>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          {result ? (
            <>
              <div className="flex items-center gap-3">
                <div className="text-center">
                  <p className="text-4xl font-black text-violet-600">{classNames[result.predicted]}</p>
                  <p className="text-[10px] text-gray-400 uppercase font-bold">Prediction</p>
                </div>
                <div className="text-center">
                  <canvas
                    ref={previewRef}
                    width={28}
                    height={28}
                    className="w-14 h-14 rounded border border-gray-200 bg-black"
                    style={{ imageRendering: "pixelated" }}
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">28×28 in</p>
                </div>
              </div>
              <ProbBars probs={result.probs} classNames={classNames} />
            </>
          ) : (
            <div className="h-full flex items-center justify-center">
              <p className="text-xs text-gray-400 text-center px-4">
                Draw a digit (0-9) on the pad, then hit Predict. The small canvas shows what the network actually sees.
              </p>
            </div>
          )}
          {padError && <p className="text-[11px] text-rose-600 mt-2">{padError}</p>}
        </div>
      </div>
    </section>
  );
}
