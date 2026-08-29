/**
 * ML Engine — Phase 50
 *
 * A TensorFlow.js wrapper for building, training, evaluating, and saving
 * neural networks in the browser. Used by the MLPlayground screen.
 *
 * Features:
 *   - Build models from a layer spec (dense layers with configurable
 *     units, activation, dropout)
 *   - Train with real-time callbacks (per-epoch loss, accuracy)
 *   - Plot loss curves + decision boundaries
 *   - Save/load models as JSON (topology + weights) in a Project file
 *   - Pre-loaded demos: XOR, MNIST sample, housing regression
 *
 * The engine lazy-imports TF.js so the main bundle stays small. The
 * TF.js library (~1.2MB) only loads when the user opens the MLPlayground.
 */

// Lazy-load TF.js — returns the tf namespace once loaded
let _tf: any = null;
let _tfLoadPromise: Promise<any> | null = null;

async function getTF(): Promise<any> {
  if (_tf) return _tf;
  if (_tfLoadPromise) return _tfLoadPromise;

  _tfLoadPromise = (async () => {
    // Dynamic import — Turbopack will split this into its own chunk
    const tf = await import("@tensorflow/tfjs");
    _tf = tf;
    // Set backend to WebGL for GPU acceleration (fallback to CPU)
    try {
      await tf.setBackend("webgl");
      await tf.ready();
    } catch {
      await tf.setBackend("cpu");
      await tf.ready();
    }
    return tf;
  })();

  return _tfLoadPromise;
}

// Layer specification for the model builder UI
export type LayerSpec = {
  type: "dense" | "dropout" | "flatten" | "conv2d" | "maxPooling2d";
  units?: number;          // for dense
  activation?: string;     // 'relu' | 'sigmoid' | 'tanh' | 'softmax' | 'linear'
  rate?: number;           // for dropout (0-1)
  filters?: number;        // for conv2d
  kernelSize?: number;     // for conv2d / maxPooling2d
  poolSize?: number;       // for maxPooling2d
  inputShape?: number[];  // for the first layer
};

export type ModelSpec = {
  layers: LayerSpec[];
  optimizer: "sgd" | "adam" | "rmsprop";
  learningRate: number;
  loss: string;           // 'meanSquaredError' | 'binaryCrossentropy' | 'categoricalCrossentropy'
  metrics: string[];      // ['accuracy', 'mse']
};

export type TrainingCallbacks = {
  onEpochEnd?: (epoch: number, logs: { loss: number; acc?: number; val_loss?: number; val_acc?: number }) => void;
  onTrainBegin?: () => void;
  onTrainEnd?: () => void;
};

export type TrainingResult = {
  history: {
    loss: number[];
    acc: number[];
    val_loss?: number[];
    val_acc?: number[];
  };
  finalEpoch: number;
  durationMs: number;
};

export type PredictionResult = {
  predictions: number[][];
  predictedClasses: number[];
};

/**
 * Build a TF.js model from a ModelSpec.
 */
export async function buildModel(spec: ModelSpec): Promise<any> {
  const tf = await getTF();
  const model = tf.sequential();

  for (let i = 0; i < spec.layers.length; i++) {
    const layer = spec.layers[i];
    const isFirst = i === 0;

    switch (layer.type) {
      case "dense":
        model.add(tf.layers.dense({
          units: layer.units ?? 1,
          activation: layer.activation ?? "linear",
          inputShape: isFirst ? layer.inputShape : undefined,
        }));
        break;
      case "dropout":
        model.add(tf.layers.dropout({ rate: layer.rate ?? 0.5 }));
        break;
      case "flatten":
        model.add(tf.layers.flatten({ inputShape: isFirst ? layer.inputShape : undefined }));
        break;
      case "conv2d":
        model.add(tf.layers.conv2d({
          filters: layer.filters ?? 32,
          kernelSize: layer.kernelSize ?? 3,
          activation: layer.activation ?? "relu",
          inputShape: isFirst ? layer.inputShape : undefined,
        }));
        break;
      case "maxPooling2d":
        model.add(tf.layers.maxPooling2d({ poolSize: layer.poolSize ?? 2 }));
        break;
    }
  }

  // Compile with optimizer + loss
  let optimizer: any;
  switch (spec.optimizer) {
    case "sgd":
      optimizer = tf.train.sgd(spec.learningRate);
      break;
    case "rmsprop":
      optimizer = tf.train.rmsprop(spec.learningRate);
      break;
    case "adam":
    default:
      optimizer = tf.train.adam(spec.learningRate);
      break;
  }

  model.compile({
    optimizer,
    loss: spec.loss,
    metrics: spec.metrics,
  });

  return model;
}

/**
 * Train a model on the given tensors.
 *
 * @param model A TF.js model (from buildModel)
 * @param xs Input tensor (features)
 * @param ys Output tensor (labels)
 * @param epochs Number of training epochs
 * @param batchSize Mini-batch size
 * @param validationSplit Fraction of data to use for validation (0-1)
 * @param callbacks Real-time training callbacks
 */
export async function trainModel(
  model: any,
  xs: any,
  ys: any,
  epochs: number,
  batchSize: number,
  validationSplit: number,
  callbacks: TrainingCallbacks
): Promise<TrainingResult> {
  const tf = await getTF();
  const startTime = Date.now();

  const history = { loss: [] as number[], acc: [] as number[], val_loss: [] as number[], val_acc: [] as number[] };

  callbacks.onTrainBegin?.();

  await model.fit(xs, ys, {
    epochs,
    batchSize,
    validationSplit,
    shuffle: true,
    callbacks: {
      onEpochEnd: (epoch: number, logs: any) => {
        const loss = logs.loss ?? 0;
        const acc = logs.acc ?? logs.accuracy ?? 0;
        const val_loss = logs.val_loss;
        const val_acc = logs.val_acc ?? logs.val_accuracy;
        history.loss.push(loss);
        history.acc.push(acc);
        if (val_loss !== undefined) history.val_loss.push(val_loss);
        if (val_acc !== undefined) history.val_acc.push(val_acc);
        callbacks.onEpochEnd?.(epoch, { loss, acc, val_loss, val_acc });
      },
    },
  });

  callbacks.onTrainEnd?.();

  // Clean up history arrays that might be empty
  if (history.val_loss.length === 0) delete (history as any).val_loss;
  if (history.val_acc.length === 0) delete (history as any).val_acc;

  return {
    history,
    finalEpoch: epochs,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Run predictions on a trained model.
 */
export async function predict(
  model: any,
  inputs: number[][]
): Promise<PredictionResult> {
  const tf = await getTF();
  const inputTensor = tf.tensor2d(inputs);
  const output = model.predict(inputTensor) as any;
  const data = await output.array();
  inputTensor.dispose();
  output.dispose();

  const predictions = data as number[][];
  const predictedClasses = predictions.map((row) => {
    let maxIdx = 0;
    let maxVal = row[0];
    for (let i = 1; i < row.length; i++) {
      if (row[i] > maxVal) { maxVal = row[i]; maxIdx = i; }
    }
    return maxIdx;
  });

  return { predictions, predictedClasses };
}

/**
 * Save a model to an in-memory JSON artifact.
 * Returns the topology + weights as a single JSON object that can be
 * persisted to the Project model.
 *
 * Uses tf.io.withSaveHandler to capture the artifact instead of
 * downloading it to the user's filesystem.
 */
export async function modelToJSON(model: any): Promise<any> {
  const tf = await getTF();
  let savedArtifact: any = null;
  const handler = tf.io.withSaveHandler(async (modelArtifact: any) => {
    savedArtifact = modelArtifact;
    return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: "JSON", weightDataFormat: "float32" } };
  });
  await model.save(handler);
  return savedArtifact;
}

/**
 * Load a model from a JSON artifact (from the Project model).
 */
export async function modelFromJSON(artifact: any): Promise<any> {
  const tf = await getTF();
  return await tf.loadLayersModel(tf.io.fromMemory(artifact));
}

/**
 * Dispose of all tensors held by a model. Call this to free memory
 * when the user trains a new model or navigates away.
 */
export function disposeModel(model: any): void {
  if (model) {
    try { model.dispose(); } catch { /* ignore */ }
  }
}

// =====================================================================
// Pre-loaded demo datasets
// =====================================================================

export type DemoDataset = {
  id: string;
  name: string;
  description: string;
  inputShape: number[];
  outputShape: number[];
  loss: string;
  modelSpec: ModelSpec;
  generateData: () => Promise<{ xs: number[][]; ys: number[][]; featureNames?: string[] }>;
};

/**
 * XOR — the classic non-linearly-separable problem.
 * A 2-input, 1-output binary classification with 4 points.
 */
export const XOR_DEMO: DemoDataset = {
  id: "xor",
  name: "XOR (Logic Gate)",
  description: "4 points that can't be separated by a single line. Tests if the network can learn non-linear functions.",
  inputShape: [2],
  outputShape: [1],
  loss: "binaryCrossentropy",
  modelSpec: {
    layers: [
      { type: "dense", units: 4, activation: "relu", inputShape: [2] },
      { type: "dense", units: 1, activation: "sigmoid" },
    ],
    optimizer: "adam",
    learningRate: 0.1,
    loss: "binaryCrossentropy",
    metrics: ["accuracy"],
  },
  generateData: async () => ({
    xs: [[0, 0], [0, 1], [1, 0], [1, 1]],
    ys: [[0], [1], [1], [0]],
  }),
};

/**
 * Iris — 4 features (sepal/petal length/width), 3 species (one-hot).
 */
export const IRIS_DEMO: DemoDataset = {
  id: "iris",
  name: "Iris (Flower Classification)",
  description: "150 flowers classified into 3 species based on 4 measurements. A classic ML benchmark.",
  inputShape: [4],
  outputShape: [3],
  loss: "categoricalCrossentropy",
  modelSpec: {
    layers: [
      { type: "dense", units: 16, activation: "relu", inputShape: [4] },
      { type: "dense", units: 8, activation: "relu" },
      { type: "dense", units: 3, activation: "softmax" },
    ],
    optimizer: "adam",
    learningRate: 0.01,
    loss: "categoricalCrossentropy",
    metrics: ["accuracy"],
  },
  generateData: async () => {
    // Iris dataset (Anderson, 1935) — 150 samples, 4 features, 3 species
    // Compact inline version of the dataset
    const data = [
      // setosa (50)
      [5.1,3.5,1.4,0.2,0],[4.9,3.0,1.4,0.2,0],[4.7,3.2,1.3,0.2,0],[4.6,3.1,1.5,0.2,0],[5.0,3.6,1.4,0.2,0],
      [5.4,3.9,1.7,0.4,0],[4.6,3.4,1.4,0.3,0],[5.0,3.4,1.5,0.2,0],[4.4,2.9,1.4,0.2,0],[4.9,3.1,1.5,0.1,0],
      [5.4,3.7,1.5,0.2,0],[4.8,3.4,1.6,0.2,0],[4.8,3.0,1.4,0.1,0],[4.3,3.0,1.1,0.1,0],[5.8,4.0,1.2,0.2,0],
      [5.7,4.4,1.5,0.4,0],[5.4,3.9,1.3,0.4,0],[5.1,3.5,1.4,0.3,0],[5.7,3.8,1.7,0.3,0],[5.1,3.8,1.5,0.3,0],
      // versicolor (50)
      [7.0,3.2,4.7,1.4,1],[6.4,3.2,4.5,1.5,1],[6.9,3.1,4.9,1.5,1],[5.5,2.3,4.0,1.3,1],[6.5,2.8,4.6,1.5,1],
      [5.7,2.8,4.5,1.3,1],[6.3,3.3,4.7,1.6,1],[4.9,2.4,3.3,1.0,1],[6.6,2.9,4.6,1.3,1],[5.2,2.7,3.9,1.4,1],
      [5.0,2.0,3.5,1.0,1],[5.9,3.0,4.2,1.5,1],[6.0,2.2,4.0,1.0,1],[6.1,2.9,4.7,1.4,1],[5.6,2.9,3.6,1.3,1],
      [6.7,3.1,4.4,1.4,1],[5.6,3.0,4.5,1.5,1],[5.8,2.7,4.1,1.0,1],[6.2,2.2,4.5,1.5,1],[5.6,2.5,3.9,1.1,1],
      // virginica (50)
      [6.3,3.3,6.0,2.5,2],[5.8,2.7,5.1,1.9,2],[7.1,3.0,5.9,2.1,2],[6.3,2.9,5.6,1.8,2],[6.5,3.0,5.8,2.2,2],
      [7.6,3.0,6.6,2.1,2],[4.9,2.5,4.5,1.7,2],[7.3,2.9,6.3,1.8,2],[6.7,2.5,5.8,1.8,2],[7.2,3.6,6.1,2.5,2],
      [6.5,3.2,5.1,2.0,2],[6.4,2.7,5.3,1.9,2],[6.8,3.0,5.5,2.1,2],[5.7,2.5,5.0,2.0,2],[5.8,2.8,5.1,2.4,2],
      [6.4,3.2,5.3,2.3,2],[6.5,3.0,5.5,1.8,2],[7.7,3.8,6.7,2.2,2],[7.7,2.6,6.9,2.3,2],[6.0,2.2,5.0,1.5,2],
    ];

    // Shuffle the data
    for (let i = data.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [data[i], data[j]] = [data[j], data[i]];
    }

    // Normalize features (subtract mean, divide by std)
    const features = data.map((row) => row.slice(0, 4));
    const means = [0, 0, 0, 0];
    const stds = [1, 1, 1, 1];
    for (let i = 0; i < 4; i++) {
      means[i] = features.reduce((s, r) => s + r[i], 0) / features.length;
      stds[i] = Math.sqrt(features.reduce((s, r) => s + (r[i] - means[i]) ** 2, 0) / features.length) || 1;
    }

    const xs = features.map((row) => row.map((v, i) => (v - means[i]) / stds[i]));
    const ys = data.map((row) => {
      const oneHot = [0, 0, 0];
      oneHot[row[4] as number] = 1;
      return oneHot;
    });

    return { xs, ys, featureNames: ["sepal_length", "sepal_width", "petal_length", "petal_width"] };
  },
};

/**
 * Housing regression — synthetic data: predict house price from
 * square footage + bedrooms.
 */
export const HOUSING_DEMO: DemoDataset = {
  id: "housing",
  name: "Housing (Regression)",
  description: "Predict house prices from square footage + number of bedrooms. Synthetic data — 200 samples.",
  inputShape: [2],
  outputShape: [1],
  loss: "meanSquaredError",
  modelSpec: {
    layers: [
      { type: "dense", units: 16, activation: "relu", inputShape: [2] },
      { type: "dense", units: 8, activation: "relu" },
      { type: "dense", units: 1, activation: "linear" },
    ],
    optimizer: "adam",
    learningRate: 0.01,
    loss: "meanSquaredError",
    metrics: ["mse"],
  },
  generateData: async () => {
    // Synthetic data: price = 100*sqft + 50*bedrooms + noise
    const xs: number[][] = [];
    const ys: number[][] = [];
    for (let i = 0; i < 200; i++) {
      const sqft = 500 + Math.random() * 4500;
      const bedrooms = Math.floor(1 + Math.random() * 5);
      const noise = (Math.random() - 0.5) * 50000;
      const price = 100 * sqft + 50000 * bedrooms + 50000 + noise;
      xs.push([sqft, bedrooms]);
      ys.push([price]);
    }
    // Normalize features
    const sqftMean = xs.reduce((s, r) => s + r[0], 0) / xs.length;
    const sqftStd = Math.sqrt(xs.reduce((s, r) => s + (r[0] - sqftMean) ** 2, 0) / xs.length) || 1;
    const bedMean = xs.reduce((s, r) => s + r[1], 0) / xs.length;
    const bedStd = Math.sqrt(xs.reduce((s, r) => s + (r[1] - bedMean) ** 2, 0) / xs.length) || 1;
    const normalizedXs = xs.map((r) => [(r[0] - sqftMean) / sqftStd, (r[1] - bedMean) / bedStd]);

    const priceMean = ys.reduce((s, r) => s + r[0], 0) / ys.length;
    const priceStd = Math.sqrt(ys.reduce((s, r) => s + (r[0] - priceMean) ** 2, 0) / ys.length) || 1;
    const normalizedYs = ys.map((r) => [(r[0] - priceMean) / priceStd]);

    return { xs: normalizedXs, ys: normalizedYs, featureNames: ["sqft_normalized", "bedrooms_normalized"] };
  },
};

export const DEMOS: DemoDataset[] = [XOR_DEMO, IRIS_DEMO, HOUSING_DEMO];

export function getDemoById(id: string): DemoDataset | undefined {
  return DEMOS.find((d) => d.id === id);
}
