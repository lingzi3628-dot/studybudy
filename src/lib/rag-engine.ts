/**
 * rag-engine.ts — Phase 56 (AIBuddy / DataBuddy %%rag cells)
 *
 * In-browser RAG: chunk → embed (TensorFlow.js Universal Sentence Encoder,
 * ~25MB model, lazy-loaded ONCE on first use) → cosine top-k → answer with
 * citations via /api/ai/playground.
 *
 * ZERO server cost for retrieval: embeddings run locally in the browser.
 * Only the final answer call hits the API (feature key "playground").
 *
 * The pure functions (chunkText, cosineSimilarity, topK, buildRagContext,
 * RAGDOCS_MARKER handling) are unit-tested; embedTexts/answerQuestion need
 * a browser (tfjs + network) and are thin wrappers around them.
 */

// ---------- pure: chunking ----------

/**
 * Split text into overlapping chunks (default ~1200 chars ≈ 300 tokens,
 * 180 char overlap ≈ 15%). Splits on paragraph breaks where possible and
 * never mid-sentence when a sentence boundary is near the cut point.
 */
export function chunkText(text: string, size = 1200, overlap = 180): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];

  const paragraphs = clean.split(/\n\s*\n/);
  const chunks: string[] = [];
  let buf = "";

  const pushBuf = () => {
    const t = buf.trim();
    if (t) chunks.push(t);
    buf = "";
  };

  for (const para of paragraphs) {
    const candidate = buf ? `${buf}\n\n${para}` : para;
    if (candidate.length <= size) {
      buf = candidate;
      continue;
    }
    // Paragraph itself doesn't fit: flush buf (keeping overlap tail), then
    // hard-split the paragraph on sentence boundaries.
    if (buf) {
      pushBuf();
      buf = lastWords(buf, overlap); // seed next chunk with overlap
    }
    let rest = para;
    while (rest.length > size) {
      // Try to cut at a sentence end within the last 40% of the window.
      const window = rest.slice(0, size);
      const sentenceCut = Math.max(window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! "));
      const cut = sentenceCut > size * 0.6 ? sentenceCut + 1 : size;
      chunks.push(rest.slice(0, cut).trim());
      rest = rest.slice(Math.max(0, cut - overlap));
    }
    buf = rest;
  }
  pushBuf();
  return chunks.filter((c) => c.length > 0);
}

/** Keep the last ~`maxChars` characters on a word boundary (overlap seed). */
function lastWords(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s;
  const slice = s.slice(-maxChars);
  const space = slice.indexOf(" ");
  return space === -1 ? slice : slice.slice(space + 1);
}

// ---------- pure: vector math ----------

/** Cosine similarity between two equal-length vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export type RagChunk = { index: number; text: string; score: number };

/**
 * Rank chunks by cosine similarity to the query vector; returns top-k with
 * their original indices (used as citation ids).
 */
export function topK(queryVec: number[], chunkVecs: number[][], k: number): RagChunk[] {
  const scored = chunkVecs.map((v, i) => ({ index: i, text: "", score: cosineSimilarity(queryVec, v) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(1, k));
}

/** Attach chunk texts to scored results (mutates copies, keeps order). */
export function withTexts(scored: RagChunk[], chunks: string[]): RagChunk[] {
  return scored.map((s) => (chunks[s.index] !== undefined ? { ...s, text: chunks[s.index] } : s));
}

// ---------- pure: corpus handling + citations ----------

/**
 * Notebook markdown cells starting with this marker hold the RAG corpus.
 * Convention keeps the .ipynb schema unchanged (Phase 49 compatibility):
 *   %%ragdocs
 *   <paste any text here>
 */
export const RAGDOCS_MARKER = "%%ragdocs";

export function isRagDocsCell(source: string): boolean {
  return source.trimStart().startsWith(RAGDOCS_MARKER);
}

/** Extract the payload from a %%ragdocs cell (everything after the marker line). */
export function ragDocsPayload(source: string): string {
  if (!isRagDocsCell(source)) return "";
  return source.replace(/^\s*%%ragdocs[^\n]*\n?/, "").trim();
}

export const RAG_SYSTEM_PROMPT =
  "You are a retrieval-based study assistant. Answer ONLY using the numbered chunks provided. " +
  "Cite every claim with the chunk id in brackets like [chunk 3]. " +
  "If the chunks do not contain the answer, reply exactly: \"The documents don't cover that.\"";

/** Build the retrieval-augmented user prompt with labeled chunks. */
export function buildRagContext(question: string, retrieved: RagChunk[]): string {
  const context = retrieved.map((c) => `[chunk ${c.index}] (similarity ${c.score.toFixed(2)})\n${c.text}`).join("\n\n");
  return `Document chunks:\n\n${context}\n\nQuestion: ${question}`;
}

/** Extract [chunk N] citations from an answer (deduped, order preserved). */
export function extractCitations(answer: string): number[] {
  const seen: number[] = [];
  const re = /\[chunk\s+(\d+)\]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(answer)) !== null) {
    const n = Number(m[1]);
    if (!seen.includes(n)) seen.push(n);
  }
  return seen;
}

// ---------- impure (browser): embeddings ----------

type UseModel = { embed: (texts: string[]) => Promise<import("@tensorflow/tfjs").Tensor2D> };
let useModel: UseModel | null = null;
let useLoading: Promise<UseModel> | null = null;

/**
 * Lazy-load TF.js + the Universal Sentence Encoder model (~25MB, cached by
 * the browser afterwards). Uses dynamic imports so the deps never touch the
 * initial bundle. Exported for NotebookScreen's loading indicator.
 */
export async function ensureEmbedder(): Promise<UseModel> {
  if (useModel) return useModel;
  if (useLoading) return useLoading;
  useLoading = (async () => {
    const tf = await import("@tensorflow/tfjs");
    try {
      await tf.setBackend("webgl");
    } catch {
      await tf.setBackend("cpu");
    }
    await tf.ready();
    const use = await import("@tensorflow-models/universal-sentence-encoder");
    const model = await use.load();
    useModel = {
      async embed(texts: string[]) {
        return model.embed(texts) as unknown as import("@tensorflow/tfjs").Tensor2D;
      },
    };
    return useModel;
  })();
  return useLoading;
}

/** Embed texts → plain number[][] (releases the tensor). */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const model = await ensureEmbedder();
  const tensor = await model.embed(texts);
  const data = tensor.arraySync() as number[][];
  tensor.dispose();
  return data;
}

// ---------- impure (browser): answer call ----------

export type RagAnswer = { answer: string; citations: number[]; durationMs: number };

/** Retrieve → answer via /api/ai/playground → parse [chunk N] citations. */
export async function answerQuestion(question: string, chunks: string[], topKCount = 4): Promise<RagAnswer & { retrieved: RagChunk[] }> {
  const started = Date.now();
  const [queryVec] = await embedTexts([question]);
  const chunkVecs = await embedTexts(chunks);
  const retrieved = withTexts(topK(queryVec, chunkVecs, topKCount), chunks);

  const res = await fetch("/api/ai/playground", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ systemPrompt: RAG_SYSTEM_PROMPT, userPrompt: buildRagContext(question, retrieved), temperature: 0.2 }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `RAG answer call failed: HTTP ${res.status}`);

  const answer: string = data.output ?? "";
  return {
    answer,
    citations: extractCitations(answer),
    durationMs: Date.now() - started,
    retrieved,
  };
}
