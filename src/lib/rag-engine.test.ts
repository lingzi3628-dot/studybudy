/**
 * rag-engine tests — Phase 56
 *
 * Covers the pure RAG primitives that the %%rag notebook cells rely on:
 * chunking, vector math, corpus marker handling, context building, and
 * citation extraction. (embedTexts/answerQuestion are browser/network-bound
 * and excluded.)
 *
 * Run: npx vitest run src/lib/rag-engine.test.ts
 */
import { describe, it, expect } from "vitest";
import {
  chunkText,
  cosineSimilarity,
  topK,
  withTexts,
  RAGDOCS_MARKER,
  isRagDocsCell,
  ragDocsPayload,
  buildRagContext,
  extractCitations,
  RAG_SYSTEM_PROMPT,
} from "./rag-engine";

describe("chunkText", () => {
  it("returns the whole text as one chunk when small", () => {
    expect(chunkText("hello world")).toEqual(["hello world"]);
  });

  it("returns [] for empty input", () => {
    expect(chunkText("   ")).toEqual([]);
  });

  it("splits long text into multiple chunks with overlap", () => {
    const paras = Array.from({ length: 20 }, (_, i) => `Paragraph ${i} ${"word ".repeat(40)}`);
    const text = paras.join("\n\n");
    const chunks = chunkText(text, 600, 100);
    expect(chunks.length).toBeGreaterThan(2);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(620);
  });

  it("hard-splits a single huge paragraph at sentence boundaries", () => {
    const sentences = Array.from({ length: 30 }, (_, i) => `This is sentence number ${i} about an interesting topic.`).join(" ");
    const chunks = chunkText(sentences, 300, 50);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length > 0)).toBe(true);
  });

  it("never splits mid-sentence when a sentence end is near the cut", () => {
    const s = `${"A sentence here. ".repeat(30)}The final sentence ends properly.`;
    const chunks = chunkText(s, 250, 40);
    expect(chunks[0].endsWith(".") || chunks[0].endsWith("!") || chunks[0].endsWith("?")).toBe(true);
  });
});

describe("cosineSimilarity + topK", () => {
  it("identical vectors → 1, orthogonal → 0", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("zero vectors are handled (no NaN)", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it("topK returns the k most similar in descending order", () => {
    const q = [1, 0, 0];
    const vecs = [
      [0, 1, 0],  // unrelated
      [0.9, 0.1, 0],  // very similar
      [-1, 0, 0],  // opposite
      [0.8, 0.2, 0],  // similar
    ];
    const top = topK(q, vecs, 2);
    expect(top.length).toBe(2);
    expect(top[0].index).toBe(1);
    expect(top[1].index).toBe(3);
    expect(top[0].score).toBeGreaterThanOrEqual(top[1].score);
  });

  it("withTexts attaches chunk text by original index", () => {
    const chunks = ["alpha", "beta", "gamma"];
    const scored = [{ index: 2, text: "", score: 0.9 }, { index: 0, text: "", score: 0.5 }];
    const withT = withTexts(scored, chunks);
    expect(withT[0].text).toBe("gamma");
    expect(withT[1].text).toBe("alpha");
  });
});

describe("%%ragdocs corpus cells", () => {
  it("detects marker cells (leading whitespace tolerated)", () => {
    expect(isRagDocsCell(`${RAGDOCS_MARKER}\nsome text`)).toBe(true);
    expect(isRagDocsCell(`  ${RAGDOCS_MARKER}\ntext`)).toBe(true);
    expect(isRagDocsCell("# normal markdown")).toBe(false);
  });

  it("payload is everything after the marker line", () => {
    expect(ragDocsPayload(`${RAGDOCS_MARKER}\n\nLINE1\n\nLINE2`)).toBe("LINE1\n\nLINE2");
    expect(ragDocsPayload("no marker")).toBe("");
  });

  it("empty payload is allowed", () => {
    expect(ragDocsPayload(`${RAGDOCS_MARKER}`)).toBe("");
  });
});

describe("buildRagContext + extractCitations", () => {
  it("labels chunks with ids and similarity scores", () => {
    const ctx = buildRagContext("What is RAG?", [
      { index: 0, text: "RAG = retrieval-augmented generation.", score: 0.91 },
      { index: 4, text: "Chunk size matters.", score: 0.72 },
    ]);
    expect(ctx).toContain("[chunk 0] (similarity 0.91)");
    expect(ctx).toContain("[chunk 4] (similarity 0.72)");
    expect(ctx).toContain("Question: What is RAG?");
  });

  it("extracts deduped citations in order of first appearance", () => {
    expect(extractCitations("A [chunk 3] then [chunk 1] then again [chunk 3].")).toEqual([3, 1]);
    expect(extractCitations("no citations here")).toEqual([]);
    expect(extractCitations("[chunk 12] alone")).toEqual([12]);
  });

  it("the system prompt forces citations and out-of-scope honesty", () => {
    expect(RAG_SYSTEM_PROMPT).toContain("Cite");
    expect(RAG_SYSTEM_PROMPT).toContain("don't cover");
  });
});
