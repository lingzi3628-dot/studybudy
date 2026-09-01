import { describe, it, expect } from "vitest";
import {
  parseCsv,
  toCsv,
  inferDtype,
  profileColumns,
  buildTabularDataset,
  recommendModelSpec,
} from "./csv-dataset";

const IRIS_CSV = `sepal_length,sepal_width,species
5.1,3.5,setosa
6.4,3.2,versicolor
6.7,3.1,virginica
5.0,3.6,setosa
6.5,2.8,versicolor`;

const TITANIC_LIKE = `age,fare,sex,survived
22,7.25,male,0
38,71.28,female,1
26,7.92,female,1
35,53.1,male,0
,8.05,male,0
54,51.87,female,1
2,21.08,female,0
27,11.13,male,1
14,30.07,female,1
4,16.7,male,0
58,26.55,female,1
20,8.05,male,0
39,31.28,female,1
,7.88,male,0
33,7.9,male,
`;

describe("parseCsv", () => {
  it("parses simple CSV with header", () => {
    const t = parseCsv(IRIS_CSV);
    expect(t.headers).toEqual(["sepal_length", "sepal_width", "species"]);
    expect(t.rows).toHaveLength(5);
    expect(t.rows[0]).toEqual(["5.1", "3.5", "setosa"]);
  });

  it("handles quoted fields with commas and escaped quotes", () => {
    const t = parseCsv(`name,note
"Smith, John","said ""hi"" loudly"
"Lee",plain`);
    expect(t.rows[0]).toEqual(["Smith, John", 'said "hi" loudly']);
    expect(t.rows[1]).toEqual(["Lee", "plain"]);
  });

  it("handles CRLF line endings and a trailing newline", () => {
    const t = parseCsv("a,b\r\n1,2\r\n3,4\r\n");
    expect(t.rows).toEqual([["1", "2"], ["3", "4"]]);
  });

  it("pads short rows and names blank headers", () => {
    const t = parseCsv("a,,c\n1,2\n");
    expect(t.headers).toEqual(["a", "column_2", "c"]);
    expect(t.rows[0]).toEqual(["1", "2", ""]);
  });

  it("returns empty table for blank input", () => {
    expect(parseCsv("").rows).toEqual([]);
    expect(parseCsv("   \n  \n").headers).toEqual([]);
  });
});

describe("toCsv", () => {
  it("roundtrips through parseCsv", () => {
    const headers = ["x", "y", "label"];
    const rows: Array<Array<string | number | null>> = [
      [1.5, 2, "a,b"],
      [null, 3, 'say "hi"'],
    ];
    const csv = toCsv(headers, rows);
    const t = parseCsv(csv);
    expect(t.headers).toEqual(headers);
    expect(t.rows[0]).toEqual(["1.5", "2", "a,b"]);
    expect(t.rows[1][2]).toBe('say "hi"');
  });

  it("serializes null/undefined as empty cells", () => {
    const csv = toCsv(["a", "b"], [[undefined, null]]);
    expect(csv).toBe("a,b\n,");
  });
});

describe("inferDtype", () => {
  it("detects numbers, booleans, strings, and empty columns", () => {
    expect(inferDtype(["1", "2.5", "-3e2"])).toBe("number");
    expect(inferDtype(["true", "no", "Y"])).toBe("boolean");
    expect(inferDtype(["setosa", "virginica"])).toBe("string");
    expect(inferDtype(["", ""])).toBe("empty");
  });

  it("treats mixed content as string", () => {
    expect(inferDtype(["1", "abc"])).toBe("string");
  });
});

describe("profileColumns", () => {
  it("reports dtype, missing, unique, and numeric stats", () => {
    const t = parseCsv(`v,name
1,a
2,
3,a`);
    const [v, name] = profileColumns(t);
    expect(v.dtype).toBe("number");
    expect(v.missing).toBe(0);
    expect(v.min).toBe(1);
    expect(v.max).toBe(3);
    expect(v.mean).toBeCloseTo(2);
    expect(name.dtype).toBe("string");
    expect(name.missing).toBe(1);
    expect(name.unique).toBe(1);
  });
});

describe("buildTabularDataset", () => {
  it("builds a one-hot classification dataset from a string target", () => {
    const t = parseCsv(
      "f1,f2,species\n" +
        Array.from({ length: 30 }, (_, i) => `${i},${i * 2},${["a", "b", "c"][i % 3]}`).join("\n")
    );
    const ds = buildTabularDataset(t, { target: "species", testSplit: 0.2, seed: 1 });
    expect(ds.isClassification).toBe(true);
    expect(ds.classNames).toEqual(["a", "b", "c"]);
    expect(ds.featureCount).toBe(2);
    expect(ds.trainYs[0]).toHaveLength(3);
    expect(ds.trainYs[0].reduce((s, v) => s + v, 0)).toBe(1);
    expect(ds.loss).toBe("categoricalCrossentropy");
    // split sanity
    expect(ds.trainXs.length + ds.testXs.length).toBe(30);
    expect(ds.testXs.length).toBeGreaterThan(0);
  });

  it("regresses on a continuous target with MSE", () => {
    const rows = Array.from({ length: 30 }, (_, i) => `${i},${i * 1.5 + 0.3}`);
    const t = parseCsv("x,y\n" + rows.join("\n"));
    const ds = buildTabularDataset(t, { target: "y", testSplit: 0.2 });
    expect(ds.isClassification).toBe(false);
    expect(ds.classNames).toBeUndefined();
    expect(ds.loss).toBe("meanSquaredError");
    expect(ds.outputShape).toEqual([1]);
  });

  it("z-score normalizes numeric features and stores the params", () => {
    const rows = Array.from({ length: 20 }, (_, i) => `${i * 10},${i % 2}`);
    const t = parseCsv("big,label\n" + rows.join("\n"));
    const ds = buildTabularDataset(t, { target: "label", normalize: true, testSplit: 0.2 });
    const colIdx = ds.featureNames.indexOf("big");
    const all = [...ds.trainXs, ...ds.testXs].map((r) => r[colIdx]);
    const mean = all.reduce((s, v) => s + v, 0) / all.length;
    expect(mean).toBeCloseTo(0, 5);
    expect(ds.normalization).not.toBeNull();
  });

  it("skips normalization when asked", () => {
    const rows = Array.from({ length: 20 }, (_, i) => `${i * 10},${i % 2}`);
    const t = parseCsv("big,label\n" + rows.join("\n"));
    const ds = buildTabularDataset(t, { target: "label", normalize: false, testSplit: 0.2 });
    expect(ds.normalization).toBeNull();
  });

  it("one-hot encodes categorical features and drops high-cardinality ones", () => {
    const rows = Array.from({ length: 24 }, (_, i) =>
      `${["red", "green", "blue"][i % 3]},u${i},${i % 2}`
    );
    const t = parseCsv("color,high_card,label\n" + rows.join("\n"));
    const ds = buildTabularDataset(t, { target: "label", testSplit: 0.2 });
    expect(ds.featureNames.filter((f) => f.startsWith("color="))).toEqual([
      "color=blue",
      "color=green",
      "color=red",
    ]);
    expect(ds.droppedFeatures).toContainEqual(
      expect.objectContaining({ name: "high_card" })
    );
  });

  it("imputes missing numeric feature values with the column mean", () => {
    const ds = buildTabularDataset(parseCsv(TITANIC_LIKE), { target: "survived", testSplit: 0.2, seed: 3 });
    expect(ds.featureCount).toBe(4); // age, fare, sex=female, sex=male
    expect(ds.featureNames).toContain("sex=female");
    // No NaNs anywhere
    for (const row of [...ds.trainXs, ...ds.testXs]) {
      for (const v of row) expect(Number.isNaN(v)).toBe(false);
    }
    // Rows with missing age are NOT dropped (only missing targets are)
    expect(ds.rowCount + ds.droppedRows).toBe(15);
    expect(ds.droppedRows).toBe(1); // the row missing `survived`
  });

  it("is deterministic for a given seed", () => {
    const t = parseCsv(TITANIC_LIKE);
    const a = buildTabularDataset(t, { target: "survived", seed: 9, testSplit: 0.25 });
    const b = buildTabularDataset(t, { target: "survived", seed: 9, testSplit: 0.25 });
    expect(a.trainXs).toEqual(b.trainXs);
    expect(a.testXs).toEqual(b.testXs);
  });

  it("throws on unknown target or tiny tables", () => {
    const t = parseCsv(IRIS_CSV);
    expect(() => buildTabularDataset(t, { target: "nope" })).toThrow(/not found/);
    const tiny = parseCsv("a,b\n1,0\n2,1\n");
    expect(() => buildTabularDataset(tiny, { target: "b" })).toThrow(/10 rows/);
  });

  it("throws when only the target column exists", () => {
    const t = parseCsv("a\n1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n");
    expect(() => buildTabularDataset(t, { target: "a" })).toThrow(/No usable feature/);
  });
});

describe("recommendModelSpec", () => {
  it("sizes the head to the class count for classification", () => {
    const t = parseCsv(
      "f1,f2,species\n" +
        Array.from({ length: 30 }, (_, i) => `${i},${i * 2},${["a", "b", "c"][i % 3]}`).join("\n")
    );
    const ds = buildTabularDataset(t, { target: "species", testSplit: 0.2 });
    const spec = recommendModelSpec(ds);
    const head = spec.layers[spec.layers.length - 1];
    expect(head.units).toBe(3);
    expect(head.activation).toBe("softmax");
    expect(spec.loss).toBe("categoricalCrossentropy");
  });

  it("uses a linear head for regression", () => {
    const rows = Array.from({ length: 30 }, (_, i) => `${i},${i * 1.5}`);
    const t = parseCsv("x,y\n" + rows.join("\n"));
    const ds = buildTabularDataset(t, { target: "y", testSplit: 0.2 });
    const spec = recommendModelSpec(ds);
    const head = spec.layers[spec.layers.length - 1];
    expect(head.activation).toBe("linear");
    expect(spec.loss).toBe("meanSquaredError");
  });
});
