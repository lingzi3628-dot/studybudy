import { describe, it, expect } from "vitest";
import { kerasPythonFromSpec, buildModelCard } from "./model-export";
import type { ModelSpec } from "./ml-engine";

const DENSE_SPEC: ModelSpec = {
  layers: [
    { type: "dense", units: 16, activation: "relu", inputShape: [4] },
    { type: "dropout", rate: 0.2 },
    { type: "dense", units: 3, activation: "softmax" },
  ],
  optimizer: "adam",
  learningRate: 0.01,
  loss: "categoricalCrossentropy",
  metrics: ["accuracy"],
};

const CNN_SPEC: ModelSpec = {
  layers: [
    { type: "conv2d", filters: 8, kernelSize: 3, activation: "relu", inputShape: [28, 28, 1] },
    { type: "maxPooling2d", poolSize: 2 },
    { type: "flatten" },
    { type: "dense", units: 32, activation: "relu" },
    { type: "dense", units: 10, activation: "softmax" },
  ],
  optimizer: "adam",
  learningRate: 0.005,
  loss: "categoricalCrossentropy",
  metrics: ["accuracy"],
};

const REG_SPEC: ModelSpec = {
  layers: [
    { type: "dense", units: 8, activation: "relu", inputShape: [2] },
    { type: "dense", units: 1, activation: "linear" },
  ],
  optimizer: "sgd",
  learningRate: 0.05,
  loss: "meanSquaredError",
  metrics: ["mse"],
};

describe("kerasPythonFromSpec", () => {
  it("emits imports and a Sequential with the same layers", () => {
    const py = kerasPythonFromSpec(DENSE_SPEC, {
      modelName: "Iris Net",
      taskType: "classification",
      classNames: ["setosa", "versicolor", "virginica"],
      epochs: 50,
      batchSize: 4,
    });
    expect(py).toContain("from tensorflow import keras");
    expect(py).toContain("keras.Sequential([");
    expect(py).toContain("Dense(16, activation='relu', input_shape=(4))");
    expect(py).toContain("Dropout(0.2)");
    expect(py).toContain("Dense(3, activation='softmax')");
  });

  it("translates the loss and optimizer with the learning rate", () => {
    const py = kerasPythonFromSpec(DENSE_SPEC, {
      modelName: "x",
      taskType: "classification",
      epochs: 10,
      batchSize: 8,
    });
    expect(py).toContain("loss='categorical_crossentropy'");
    expect(py).toContain("keras.optimizers.Adam(learning_rate=0.01)");
    expect(py).toContain("epochs=10");
    expect(py).toContain("batch_size=8");
  });

  it("maps regression specs to mse with SGD", () => {
    const py = kerasPythonFromSpec(REG_SPEC, {
      modelName: "housing",
      taskType: "regression",
      epochs: 30,
      batchSize: 16,
    });
    expect(py).toContain("loss='mse'");
    expect(py).toContain("keras.optimizers.Sgd(learning_rate=0.05)");
    expect(py).toContain("Dense(1, activation='linear')");
  });

  it("renders conv2d / maxpool / flatten for CNNs with the image input shape", () => {
    const py = kerasPythonFromSpec(CNN_SPEC, {
      modelName: "digits",
      taskType: "classification",
      epochs: 8,
      batchSize: 32,
    });
    expect(py).toContain("Conv2D(8, (3, 3), activation='relu', input_shape=(28, 28, 1))");
    expect(py).toContain("MaxPooling2D((2, 2))");
    expect(py).toContain("Flatten()");
  });

  it("escapes quotes in class names and sanitizes the save filename", () => {
    const py = kerasPythonFromSpec(DENSE_SPEC, {
      modelName: "My Great Model!",
      taskType: "classification",
      classNames: ["it's", "b"],
      epochs: 5,
      batchSize: 4,
    });
    expect(py).toContain("'it\\'s'");
    expect(py).toContain('model.save("my_great_model.keras")');
  });

  it("lists feature names as comments in the data section", () => {
    const py = kerasPythonFromSpec(DENSE_SPEC, {
      modelName: "x",
      taskType: "classification",
      featureNames: ["sepal_length", "sepal_width"],
      epochs: 5,
      batchSize: 4,
    });
    expect(py).toContain("#      - sepal_length");
    expect(py).toContain("#      - sepal_width");
  });
});

describe("buildModelCard", () => {
  const base = {
    modelName: "Digit CNN",
    datasetName: "Synthetic Digits (MNIST-style)",
    taskType: "classification" as const,
    dateISO: "2026-09-01",
    inputShape: [28, 28, 1],
    classNames: ["0", "1", "2"],
    rowCount: 800,
    architecture: ["Conv2D(8, 3x3, relu)", "MaxPooling2D(2x2)", "Flatten", "Dense(32, relu)", "Dense(10, softmax)"],
    optimizer: "adam",
    learningRate: 0.005,
    epochs: 8,
    batchSize: 32,
    finalLoss: 0.1234,
    finalAccuracy: 0.95,
    testAccuracy: 0.93,
    macroF1: 0.92,
    topConfusions: [{ truth: "4", predicted: "9", count: 5 }],
  };

  it("includes architecture, training config, and metrics tables", () => {
    const card = buildModelCard(base);
    expect(card).toContain("# Model Card — Digit CNN");
    expect(card).toContain("| Conv2D(8, 3x3, relu) |");
    expect(card).toContain("| Learning rate | 0.005 |");
    expect(card).toContain("Held-out accuracy | 93.0%");
    expect(card).toContain("Macro F1 | 0.920");
    expect(card).toContain("| Final loss | 0.1234 |");
  });

  it("lists class names and the confusion table", () => {
    const card = buildModelCard(base);
    expect(card).toContain("`0`, `1`, `2`");
    expect(card).toContain("| 4 | 9 | 5 |");
    expect(card).toContain("## Most common confusions");
  });

  it("adds a synthetic-data limitation line only for synthetic datasets", () => {
    expect(buildModelCard(base)).toContain("procedurally generated");
    expect(
      buildModelCard({ ...base, datasetName: "Iris" })
    ).not.toContain("procedurally generated");
    expect(buildModelCard({ ...base, datasetName: "Iris" })).toContain("No fairness audit");
  });

  it("omits optional metric lines when not provided", () => {
    const card = buildModelCard({
      modelName: "reg",
      datasetName: "Housing",
      taskType: "regression",
      dateISO: "2026-09-01",
      inputShape: [2],
      rowCount: 200,
      architecture: ["Dense(8, relu)"],
      optimizer: "sgd",
      learningRate: 0.05,
      epochs: 10,
      batchSize: 8,
    });
    expect(card).not.toContain("Held-out accuracy");
    expect(card).not.toContain("Macro F1");
    expect(card).toContain("1 continuous value (regression)");
  });
});
