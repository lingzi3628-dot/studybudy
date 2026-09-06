/**
 * Shared utilities for knowledge ingestion — Phase 74.1
 *
 * Pure functions that are safe to import from both server and client.
 * Extracted from rag-engine.ts (which has browser-only lazy imports)
 * and knowledge-ingest.ts (which imports node:dns) so the HuggingFace
 * integration can use them without pulling in browser or Node-only deps.
 */

export type IngestionResult = {
  title: string;
  source: string | null;
  contentText: string;
  chunks: Array<{ index: number; text: string }>;
  charCount: number;
  chunkCount: number;
};

/**
 * Chunk text into ~1200-char pieces with 180-char overlap.
 * Paragraph-aware: tries to break at sentence boundaries.
 * (Mirrors chunkText from rag-engine.ts — kept in sync.)
 */
export function chunkText(text: string, size = 1200, overlap = 180): string[] {
  if (!text || text.length <= size) return text ? [text] : [];

  const chunks: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  let current = "";

  for (const sentence of sentences) {
    // If adding this sentence would exceed the size, save the current chunk
    // and start a new one with the overlap from the end of the current chunk.
    if (current.length + sentence.length > size && current.length > 0) {
      chunks.push(current.trim());
      // Start the next chunk with the last `overlap` chars of the current chunk.
      const tail = current.slice(-overlap);
      current = tail + " " + sentence;
    } else {
      current = current ? current + " " + sentence : sentence;
    }
  }

  if (current.trim()) chunks.push(current.trim());

  return chunks;
}
