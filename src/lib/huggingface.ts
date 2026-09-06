/**
 * Hugging Face dataset integration — Phase 74.1
 *
 * Lets users search millions of HF datasets and ingest them into their
 * bot's knowledge base. The pipeline:
 *   1. Search HF datasets by keyword (via the HF Hub API)
 *   2. Fetch the dataset's file list + download the first data file
 *   3. Clean the data (dedupe, remove empty, normalize whitespace)
 *   4. Convert to Q&A pairs (if it has input/output columns) or text chunks
 *   5. Return as an IngestionResult (same shape as other knowledge sources)
 *
 * HF API docs: https://huggingface.co/docs/hub/api
 * No API key needed for public datasets (anonymous access works).
 */

import { chunkText, type IngestionResult } from "./knowledge-ingest-utils";

// === Types ===

export type HFDataset = {
  id: string;          // e.g. "squad" or "openai_humaneval"
  author: string;
  description: string;
  downloads: number;
  likes: number;
  tags: string[];
  lastModified: string;
};

export type HFSearchResult = {
  datasets: HFDataset[];
  total: number;
};

// === Constants ===

const HF_API = "https://huggingface.co/api";
const MAX_DATASET_CHARS = 200_000; // cap at ~40 pages of text
const MAX_ROWS = 500; // cap rows extracted from a dataset

// === Search datasets ===

/**
 * Search HF datasets by keyword. Returns up to 20 results.
 * Uses the public HF Hub API — no API key needed.
 */
export async function searchHFDatasets(query: string, limit = 20): Promise<HFSearchResult> {
  const url = `${HF_API}/datasets?search=${encodeURIComponent(query)}&limit=${limit}&full=true`;
  const r = await fetch(url, {
    headers: { "User-Agent": "StudyBuddy-KnowledgeIngest/1.0" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`HF search failed: HTTP ${r.status}`);
  const data = await r.json() as any[];

  const datasets: HFDataset[] = data.map((d) => ({
    id: d.id || d.name || "unknown",
    author: d.author || (d.id || "").split("/")[0] || "unknown",
    description: d.description || d.cardData?.description || d.tags?.join(", ") || "No description",
    downloads: d.downloads || 0,
    likes: d.likes || 0,
    tags: Array.isArray(d.tags) ? d.tags.slice(0, 5) : [],
    lastModified: d.lastModified || d.createdAt || "",
  }));

  return { datasets, total: datasets.length };
}

// === Fetch dataset files ===

/**
 * List the files in a HF dataset repo.
 * Returns the file paths (we look for .csv, .json, .jsonl, .parquet, .txt files).
 */
export async function listDatasetFiles(datasetId: string): Promise<string[]> {
  const url = `${HF_API}/datasets/${encodeURIComponent(datasetId)}`;
  const r = await fetch(url, {
    headers: { "User-Agent": "StudyBuddy-KnowledgeIngest/1.0" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`Failed to fetch dataset info: HTTP ${r.status}`);
  const data = await r.json();
  // The siblings field lists all files in the repo.
  const siblings = data?.siblings || [];
  return siblings.map((s: any) => s.rfilename).filter((f: string) =>
    /\.(csv|json|jsonl|txt|md|parquet)$/i.test(f)
  );
}

/**
 * Download a file from a HF dataset repo (raw content).
 */
async function downloadDatasetFile(datasetId: string, filename: string): Promise<string> {
  const url = `https://huggingface.co/datasets/${encodeURIComponent(datasetId)}/resolve/main/${filename}`;
  const r = await fetch(url, {
    headers: { "User-Agent": "StudyBuddy-KnowledgeIngest/1.0" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`Failed to download ${filename}: HTTP ${r.status}`);
  return await r.text();
}

// === Data cleaning pipeline ===

/**
 * Clean + lint raw data:
 *   - Remove empty rows
 *   - Deduplicate (case-insensitive)
 *   - Normalize whitespace
 *   - Strip HTML tags (if present)
 *   - Remove control characters
 */
export function cleanText(text: string): string {
  let cleaned = text;
  // Strip HTML tags (some datasets have HTML in text fields)
  cleaned = cleaned.replace(/<[^>]+>/g, " ");
  // Remove control characters (except \n, \t)
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  // Normalize whitespace (collapse multiple spaces, trim lines)
  cleaned = cleaned.split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
  // Collapse multiple newlines
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
}

/**
 * Deduplicate an array of strings (case-insensitive).
 * Preserves first occurrence order.
 */
export function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase().trim();
    if (!seen.has(key) && key.length > 0) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

// === Dataset → Q&A pairs or text chunks ===

/**
 * Parse a JSONL/JSON dataset and extract Q&A pairs or text.
 * Looks for common column names: input/question/q + output/answer/a/response.
 * If no Q&A columns found, treats each row's text fields as document chunks.
 */
export function parseDatasetContent(
  content: string,
  format: "jsonl" | "json" | "csv" | "text",
): { qaPairs: Array<{ input: string; output: string }>; textChunks: string[] } {
  const qaPairs: Array<{ input: string; output: string }> = [];
  const textChunks: string[] = [];

  if (format === "jsonl") {
    const lines = content.split("\n").filter((l) => l.trim());
    for (const line of lines.slice(0, MAX_ROWS)) {
      try {
        const obj = JSON.parse(line);
        const qa = extractQAFromObject(obj);
        if (qa) {
          qaPairs.push(qa);
        } else {
          const text = extractTextFromObject(obj);
          if (text) textChunks.push(text);
        }
      } catch { /* skip malformed lines */ }
    }
  } else if (format === "json") {
    try {
      const data = JSON.parse(content);
      const items = Array.isArray(data) ? data : (data.data || data.records || data.examples || []);
      for (const obj of items.slice(0, MAX_ROWS)) {
        const qa = extractQAFromObject(obj);
        if (qa) {
          qaPairs.push(qa);
        } else {
          const text = extractTextFromObject(obj);
          if (text) textChunks.push(text);
        }
      }
    } catch { /* malformed JSON — treat as text */ }
  } else if (format === "csv") {
    // Simple CSV parse: first row = headers, look for Q&A columns
    const lines = content.split("\n").filter((l) => l.trim());
    if (lines.length < 2) return { qaPairs, textChunks };
    const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim());
    const inputCol = headers.findIndex((h) => /^(input|question|q|prompt|user)$/i.test(h));
    const outputCol = headers.findIndex((h) => /^(output|answer|a|response|reply|bot)$/i.test(h));
    for (const line of lines.slice(1, MAX_ROWS + 1)) {
      const cols = parseCsvLine(line);
      if (inputCol >= 0 && outputCol >= 0 && cols[inputCol] && cols[outputCol]) {
        qaPairs.push({ input: cols[inputCol], output: cols[outputCol] });
      } else {
        const text = cols.join(" ").trim();
        if (text) textChunks.push(text);
      }
    }
  } else {
    // Plain text — just chunk it
    textChunks.push(content);
  }

  // Clean + dedupe
  const cleanedQa = dedupe(qaPairs.map((qa) => `${qa.input}\n${qa.output}`))
    .map((s) => {
      const [input, ...rest] = s.split("\n");
      return { input: cleanText(input), output: cleanText(rest.join("\n")) };
    })
    .filter((qa) => qa.input.length > 2 && qa.output.length > 2);

  const cleanedText = dedupe(textChunks.map(cleanText)).filter((t) => t.length > 10);

  return { qaPairs: cleanedQa, textChunks: cleanedText };
}

/** Try to extract a Q&A pair from a JSON object by looking for common column names. */
function extractQAFromObject(obj: any): { input: string; output: string } | null {
  if (!obj || typeof obj !== "object") return null;
  const inputKeys = ["input", "question", "q", "prompt", "user", "query", "instruction"];
  const outputKeys = ["output", "answer", "a", "response", "reply", "bot", "completion", "target"];

  let input = "";
  let output = "";

  for (const key of inputKeys) {
    if (obj[key] && typeof obj[key] === "string") { input = obj[key]; break; }
  }
  for (const key of outputKeys) {
    if (obj[key] && typeof obj[key] === "string") { output = obj[key]; break; }
  }

  // Handle nested structures (e.g. SQuAD has context + question + answers)
  if (!input && obj.question) input = obj.question;
  if (!output && obj.answers) {
    output = Array.isArray(obj.answers) ? obj.answers.join("; ") : String(obj.answers);
  }

  if (input && output) return { input, output };
  return null;
}

/** Extract text from a JSON object's string fields (for non-Q&A datasets). */
function extractTextFromObject(obj: any): string {
  if (!obj || typeof obj !== "object") return "";
  const parts: string[] = [];
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === "string" && val.length > 20) {
      parts.push(`${key}: ${val}`);
    }
  }
  return parts.join("\n");
}

/** Simple CSV line parser (handles quoted fields). */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += c;
    }
  }
  result.push(current);
  return result.map((s) => s.trim().replace(/^"|"$/g, ""));
}

// === Main ingestion function ===

/**
 * Ingest a Hugging Face dataset:
 *   1. List the dataset's files
 *   2. Download the first data file (.jsonl, .json, .csv, .txt)
 *   3. Parse + clean + dedupe
 *   4. Convert to Q&A pairs (if Q&A columns found) or text chunks
 *   5. Return as an IngestionResult
 */
export async function ingestHFDataset(datasetId: string): Promise<IngestionResult & { qaPairs?: Array<{ input: string; output: string }> }> {
  // 1. List files
  const files = await listDatasetFiles(datasetId);
  if (files.length === 0) {
    throw new Error(`No data files found in dataset "${datasetId}". It may be empty or private.`);
  }

  // 2. Find the best data file (prefer .jsonl > .json > .csv > .txt)
  const dataFile =
    files.find((f) => /\.jsonl$/i.test(f)) ||
    files.find((f) => /\.json$/i.test(f)) ||
    files.find((f) => /\.csv$/i.test(f)) ||
    files.find((f) => /\.txt$/i.test(f)) ||
    files.find((f) => /\.md$/i.test(f));

  if (!dataFile) {
    throw new Error(`No supported data file (.jsonl, .json, .csv, .txt) found in "${datasetId}".`);
  }

  // 3. Download the file
  const content = await downloadDatasetFile(datasetId, dataFile);

  // 4. Determine format + parse
  const format = dataFile.endsWith(".jsonl") ? "jsonl" :
                 dataFile.endsWith(".json") ? "json" :
                 dataFile.endsWith(".csv") ? "csv" : "text";

  const { qaPairs, textChunks } = parseDatasetContent(content, format);

  if (qaPairs.length === 0 && textChunks.length === 0) {
    throw new Error(`No usable content extracted from "${dataFile}" in dataset "${datasetId}".`);
  }

  // 5. Build the IngestionResult
  // If we found Q&A pairs, use them as the content text (each pair = one chunk).
  // Otherwise, chunk the text.
  let contentText: string;
  let chunks: Array<{ index: number; text: string }>;

  if (qaPairs.length > 0) {
    contentText = qaPairs
      .map((qa) => `Q: ${qa.input}\nA: ${qa.output}`)
      .join("\n\n")
      .slice(0, MAX_DATASET_CHARS);
    chunks = chunkText(contentText).map((t, i) => ({ index: i, text: t }));
  } else {
    contentText = textChunks.join("\n\n---\n\n").slice(0, MAX_DATASET_CHARS);
    chunks = chunkText(contentText).map((t, i) => ({ index: i, text: t }));
  }

  return {
    title: datasetId,
    source: `Hugging Face dataset (${dataFile}, ${qaPairs.length} Q&A + ${textChunks.length} text chunks)`,
    contentText,
    chunks,
    charCount: contentText.length,
    chunkCount: chunks.length,
    qaPairs: qaPairs.length > 0 ? qaPairs : undefined,
  };
}
