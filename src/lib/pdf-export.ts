/**
 * PDF Notes Export — Phase 45
 *
 * Uses pdf-lib (pure JS, no native deps) to compile a study set or topic's
 * lesson content + flashcards + MCQs into a printable PDF.
 *
 * Output structure:
 *   1. Cover page — title + subject + topic + card count + date
 *   2. Lesson page — topic's lesson content (markdown stripped to text)
 *   3. Flashcard pages — one card per row, front/back side-by-side or stacked
 *   4. MCQ pages — question + 4 options + correct answer + explanation
 *
 * Layout is intentionally minimal: A4 portrait, 1.5cm margins, 12pt body text,
 * no fancy fonts. This ensures compatibility and small file size.
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Card } from "@prisma/client";

const PAGE_WIDTH = 595.28; // A4 width in pt
const PAGE_HEIGHT = 841.89; // A4 height in pt
const MARGIN = 42; // ~1.5cm
const BODY_FONT_SIZE = 11;
const HEADING_FONT_SIZE = 18;
const SUBHEADING_FONT_SIZE = 13;
const SMALL_FONT_SIZE = 9;
const LINE_HEIGHT = 14;

type RGB = ReturnType<typeof rgb>;

const COLOR_INDIGO = rgb(0.27, 0.27, 0.85);
const COLOR_GRAY = rgb(0.4, 0.4, 0.4);
const COLOR_BLACK = rgb(0, 0, 0);
const COLOR_LIGHT = rgb(0.97, 0.97, 0.97);

function wrapText(text: string, font: any, fontSize: number, maxWidth: number): string[] {
  // Word-wrap to fit `maxWidth`. Returns an array of lines.
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const trial = current ? current + " " + w : w;
    const width = font.widthOfTextAtSize(trial, fontSize);
    if (width > maxWidth && current) {
      lines.push(current);
      current = w;
    } else {
      current = trial;
    }
  }
  if (current) lines.push(current);
  return lines;
}

type PDFBuildContext = {
  doc: PDFDocument;
  font: any;
  boldFont: any;
  currentPage: any;
  y: number;
  pageCount: number;
};

function newPage(ctx: PDFBuildContext) {
  ctx.currentPage = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  ctx.y = PAGE_HEIGHT - MARGIN;
  ctx.pageCount++;
}

function ensureSpace(ctx: PDFBuildContext, needed: number) {
  if (ctx.y - needed < MARGIN) newPage(ctx);
}

function drawText(
  ctx: PDFBuildContext,
  text: string,
  opts: { size?: number; color?: RGB; bold?: boolean; indent?: number; wrap?: boolean } = {}
) {
  const size = opts.size ?? BODY_FONT_SIZE;
  const color = opts.color ?? COLOR_BLACK;
  const font = opts.bold ? ctx.boldFont : ctx.font;
  const indent = opts.indent ?? 0;
  const wrap = opts.wrap ?? true;
  const maxWidth = PAGE_WIDTH - 2 * MARGIN - indent;

  if (!wrap) {
    ensureSpace(ctx, size);
    ctx.currentPage.drawText(text, { x: MARGIN + indent, y: ctx.y - size, size, font, color });
    ctx.y -= size + 2;
    return;
  }
  const lines = wrapText(text, font, size, maxWidth);
  for (const line of lines) {
    ensureSpace(ctx, size + 2);
    ctx.currentPage.drawText(line, { x: MARGIN + indent, y: ctx.y - size, size, font, color });
    ctx.y -= size + 2;
  }
}

function drawHr(ctx: PDFBuildContext) {
  ensureSpace(ctx, 8);
  ctx.currentPage.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE_WIDTH - MARGIN, y: ctx.y },
    thickness: 0.5,
    color: COLOR_GRAY,
  });
  ctx.y -= 8;
}

/**
 * Build a PDF for a study set with flashcards/MCQs.
 */
export async function buildStudySetPDF(opts: {
  title: string;
  subject?: string;
  topic?: string;
  cards: Card[];
  lessonContent?: string | null;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  const ctx: PDFBuildContext = {
    doc,
    font,
    boldFont,
    currentPage: null as any,
    y: 0,
    pageCount: 0,
  };
  newPage(ctx);

  // ---- Cover page ----
  drawText(ctx, opts.title, { size: HEADING_FONT_SIZE, bold: true, color: COLOR_INDIGO, wrap: false });
  ctx.y -= 8;
  if (opts.subject || opts.topic) {
    drawText(ctx, [opts.subject, opts.topic].filter(Boolean).join(" · "), { size: SUBHEADING_FONT_SIZE, color: COLOR_GRAY });
  }
  drawText(ctx, `Generated ${new Date().toLocaleDateString()}`, { size: SMALL_FONT_SIZE, color: COLOR_GRAY });
  drawText(ctx, `${opts.cards.length} cards`, { size: SMALL_FONT_SIZE, color: COLOR_GRAY });
  ctx.y -= 8;
  drawHr(ctx);

  // ---- Lesson content (if provided) ----
  if (opts.lessonContent) {
    drawText(ctx, "Lesson", { size: SUBHEADING_FONT_SIZE, bold: true, color: COLOR_INDIGO });
    ctx.y -= 4;
    // Strip basic markdown for the PDF
    const lesson = opts.lessonContent
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/`(.+?)`/g, "$1")
      .replace(/\[(.+?)\]\(.+?\)/g, "$1");
    drawText(ctx, lesson, { size: BODY_FONT_SIZE });
    ctx.y -= 6;
    drawHr(ctx);
  }

  // ---- Flashcards section ----
  const flashcards = opts.cards.filter((c) => c.cardType === "flashcard");
  const mcqs = opts.cards.filter((c) => c.cardType === "mcq");

  if (flashcards.length > 0) {
    drawText(ctx, `Flashcards (${flashcards.length})`, { size: SUBHEADING_FONT_SIZE, bold: true, color: COLOR_INDIGO });
    ctx.y -= 4;
    for (let i = 0; i < flashcards.length; i++) {
      const c = flashcards[i];
      ensureSpace(ctx, 30);
      drawText(ctx, `Card ${i + 1}`, { size: SMALL_FONT_SIZE, bold: true, color: COLOR_GRAY, wrap: false });
      drawText(ctx, `Front: ${c.front ?? ""}`, { size: BODY_FONT_SIZE, bold: true });
      drawText(ctx, `Back: ${c.back ?? ""}`, { size: BODY_FONT_SIZE, indent: 8 });
      ctx.y -= 4;
      if (i < flashcards.length - 1) drawHr(ctx);
    }
    if (mcqs.length > 0) {
      ctx.y -= 4;
      drawHr(ctx);
    }
  }

  // ---- MCQ section ----
  if (mcqs.length > 0) {
    drawText(ctx, `Multiple Choice Questions (${mcqs.length})`, { size: SUBHEADING_FONT_SIZE, bold: true, color: COLOR_INDIGO });
    ctx.y -= 4;
    for (let i = 0; i < mcqs.length; i++) {
      const c = mcqs[i];
      const opts = Array.isArray(c.options) ? (c.options as string[]) : [];
      const correctIdx = c.correctIndex ?? -1;
      ensureSpace(ctx, 50);
      drawText(ctx, `Q${i + 1}. ${c.question ?? ""}`, { size: BODY_FONT_SIZE, bold: true });
      opts.forEach((opt, j) => {
        const marker = j === correctIdx ? "✓" : "·";
        drawText(ctx, `${marker} ${String.fromCharCode(65 + j)}. ${opt}`, { size: BODY_FONT_SIZE, indent: 16 });
      });
      if (c.explanation) {
        drawText(ctx, `Explanation: ${c.explanation}`, { size: SMALL_FONT_SIZE, color: COLOR_GRAY, indent: 16 });
      }
      ctx.y -= 4;
      if (i < mcqs.length - 1) drawHr(ctx);
    }
  }

  // ---- Footer on each page ----
  const totalPages = ctx.pageCount;
  for (let i = 0; i < doc.getPageCount(); i++) {
    const page = doc.getPage(i);
    page.drawText(`StudyBuddy AI  ·  Page ${i + 1} of ${totalPages}`, {
      x: MARGIN,
      y: MARGIN / 2,
      size: SMALL_FONT_SIZE,
      font,
      color: COLOR_GRAY,
    });
  }

  return doc.save();
}
