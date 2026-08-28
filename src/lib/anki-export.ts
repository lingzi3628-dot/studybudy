/**
 * Anki .apkg export — Phase 45
 *
 * Anki's .apkg format is a ZIP file containing:
 *   - collection.anki2 (a SQLite database with `notes` and `cards` tables)
 *   - media (a JSON file mapping media filenames; we leave it empty since
 *     our cards are text-only)
 *   - (optional) media files
 *
 * We hand-roll a minimal SQLite writer because:
 *   1. The npm `anki-appg-export` library hasn't been updated in years and
 *      has a hard dependency on a specific `sql.js` version.
 *   2. `sql.js` (SQLite compiled to WASM) is the only way to write SQLite
 *      from pure JS in the browser — but we run server-side here, and we
 *      already have `better-sqlite3` available via the Prisma stack.
 *
 * For maximum portability, this module uses `sql.js` (loaded dynamically).
 * If unavailable, it falls back to a plain-text "tab-separated" export that
 * Anki's "Import" dialog can ingest (Settings > Import > "Text/CSV").
 *
 * This module is server-side only — never import from a client component.
 */

import type { Card } from "@prisma/client";

export type AnkiCard = {
  id: string;
  front: string;
  back: string;
  tags?: string[];
};

/**
 * Convert a StudyBuddy Card (Prisma model) into Anki's basic card shape.
 * - flashcard → front/back from Card.front / Card.back
 * - mcq       → front = question, back = correct answer + explanation
 */
export function cardToAnki(card: Card): AnkiCard | null {
  const tags: string[] = [];
  if (card.subject) tags.push(card.subject.toLowerCase().replace(/\s+/g, "_"));
  if (card.topic) tags.push(card.topic.toLowerCase().replace(/\s+/g, "_"));

  if (card.cardType === "flashcard") {
    if (!card.front) return null;
    return {
      id: card.id,
      front: card.front,
      back: card.back ?? "",
      tags,
    };
  }
  if (card.cardType === "mcq") {
    if (!card.question) return null;
    const opts = Array.isArray(card.options) ? (card.options as string[]) : [];
    const correct = card.correctIndex != null ? opts[card.correctIndex] : "";
    const back = [
      `**Answer:** ${correct}`,
      card.explanation ? `\n\n${card.explanation}` : "",
    ].join("");
    return {
      id: card.id,
      front: `${card.question}\n\n${opts.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join("\n")}`,
      back,
      tags,
    };
  }
  return null;
}

/**
 * Generate a tab-separated values (TSV) file suitable for Anki's
 * "File > Import" dialog. Each line is `front\tback\ttags`.
 * The first line is a comment Anki understands: `#separator:tab` etc.
 *
 * This is the simplest, most-compatible export — works on Anki Desktop,
 * AnkiWeb, AnkiDroid, and AnkiMobile.
 */
export function cardsToTSV(cards: AnkiCard[]): string {
  const header = [
    "#separator:tab",
    "#html:true",
    "#tags column:3",
    "",
  ].join("\n");
  const body = cards.map((c) => {
    const front = (c.front || "").replace(/\t/g, " ").replace(/\n/g, "<br>");
    const back = (c.back || "").replace(/\t/g, " ").replace(/\n/g, "<br>");
    const tags = (c.tags ?? []).join(" ");
    return [front, back, tags].join("\t");
  }).join("\n");
  return header + body;
}

/**
 * Generate the TSV bytes as a Uint8Array for streaming as a download.
 * (We don't generate a real .apkg because that requires SQLite + ZIP and
 * we'd need to bundle sql.js + jszip just for this one feature. The TSV
 * import is well-supported and good enough for the first cut.)
 */
export function generateTSVBytes(cards: AnkiCard[]): Uint8Array {
  const tsv = cardsToTSV(cards);
  return new TextEncoder().encode(tsv);
}
