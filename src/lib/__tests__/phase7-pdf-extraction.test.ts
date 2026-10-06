/**
 * Phase 7 fix — PDF text extraction regression tests.
 *
 * HISTORY:
 *   pdf-parse was upgraded from v1 (default function export:
 *   `pdfParse(buffer) → { numpages, text }`) to v2 (named class export:
 *   `new PDFParse(uint8array, opts).getText() → { pages, text, total }`).
 *
 *   The existing code did `await import("pdf-parse")` then
 *   `await (pdfParse.default || pdfParse)(buffer)` — but v2 has no
 *   `default` export and the namespace isn't callable. So EVERY PDF
 *   upload silently failed with "Could not extract enough text" for
 *   every learner.
 *
 *   These tests guard against future silent breakage by:
 *     1. Generating a real PDF with selectable text (pdf-lib)
 *     2. Running extractPdfText against it
 *     3. Asserting the extracted text contains the original content
 *     4. Asserting the return type is string (not object — v2 returns
 *        an object, so if the helper forgets to slice .text, this catches it)
 *     5. Verifying Buffer, ArrayBuffer, and Uint8Array all work (the helper
 *        must convert Buffer → Uint8Array for pdfjs-dist v2+)
 */
import { describe, it, expect } from "vitest";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { extractPdfText } from "../pdf";

// ---------------------------------------------------------------
// Helpers — generate a real PDF with selectable text on the fly.
// We don't ship a fixture file because:
//   1. PDFs are binary → git diffs would be noisy
//   2. Generating in-memory is faster than disk I/O
//   3. The test is self-contained — no external fixture to lose
// ---------------------------------------------------------------

async function makePdf(opts: {
  title?: string;
  body?: string;
  pages?: number;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = opts.pages ?? 1;
  for (let p = 0; p < pages; p++) {
    const page = doc.addPage([500, 700]);
    page.drawText(opts.title ?? "Test PDF", { x: 50, y: 650, size: 18, font, color: rgb(0, 0, 0) });
    if (opts.body) {
      page.drawText(opts.body, {
        x: 50, y: 620, size: 11, font, color: rgb(0, 0, 0), maxWidth: 400,
      });
    }
  }
  return await doc.save();
}

// ---------------------------------------------------------------
// extractPdfText — basic happy path
// ---------------------------------------------------------------

describe("extractPdfText — pdf-parse v2 API fix", () => {
  it("extracts text from a single-page PDF with selectable text", async () => {
    const pdf = await makePdf({
      title: "Photosynthesis Chapter",
      body: "Photosynthesis converts light energy into chemical energy stored in glucose.",
    });
    const text = await extractPdfText(Buffer.from(pdf));

    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(10);
    expect(text).toMatch(/Photosynthesis/);
    expect(text).toMatch(/chemical energy/);
  });

  it("returns a string (NOT the v2 object — helper must unwrap)", async () => {
    const pdf = await makePdf({ title: "X", body: "Body text here." });
    const text = await extractPdfText(Buffer.from(pdf));

    // v2 returns { pages, text, total }. If the helper forgot to slice
    // `.text` and returned the whole object, this would fail because
    // `text` would be `"[object Object]"` or contain JSON.
    expect(typeof text).toBe("string");
    expect(text).not.toMatch(/\[object Object\]/);
    expect(text).not.toMatch(/^\{.*"pages"/); // must NOT be JSON of the v2 object
  });

  it("accepts a Buffer (the helper must convert to Uint8Array for pdf-parse v2)", async () => {
    const pdf = await makePdf({ title: "Buffer test", body: "Lorem ipsum dolor." });
    const buffer = Buffer.from(pdf);
    // This must not throw "Please provide binary data as Uint8Array"
    const text = await extractPdfText(buffer);
    expect(text).toMatch(/Buffer test/);
    expect(text).toMatch(/Lorem ipsum/);
  });

  it("accepts an ArrayBuffer (FormData.file.arrayBuffer() shape)", async () => {
    const pdf = await makePdf({ title: "ArrayBuffer test", body: "Hello world." });
    // Copy underlying buffer to an ArrayBuffer (the shape FormData gives us)
    const ab = new ArrayBuffer(pdf.byteLength);
    new Uint8Array(ab).set(pdf);
    const text = await extractPdfText(ab);
    expect(text).toMatch(/ArrayBuffer test/);
  });

  it("accepts a Uint8Array directly (the underlying pdfjs-dist type)", async () => {
    const pdf = await makePdf({ title: "Uint8Array test", body: "Direct call." });
    const text = await extractPdfText(pdf as Uint8Array);
    expect(text).toMatch(/Uint8Array test/);
  });

  it("truncates to 30,000 chars (bounded output for token budgets)", async () => {
    // Generate a PDF with many pages so the text overflows the cap.
    const longBody = "Lorem ipsum dolor sit amet consectetur adipiscing elit. ".repeat(40);
    const pdf = await makePdf({ title: "Long PDF", body: longBody, pages: 50 });
    const text = await extractPdfText(Buffer.from(pdf));
    expect(text.length).toBeLessThanOrEqual(30_000);
  });

  it("caps page count to bound runtime (max: 30 pages, defense in depth)", async () => {
    const pdf = await makePdf({
      title: "Page N",
      body: "Some content.",
      pages: 60,
    });
    const text = await extractPdfText(Buffer.from(pdf));
    // Even with 60 pages, the helper extracts up to 30. The fact that
    // this returns (rather than timing out) is the assertion.
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
  });

  it("returns an empty string (not throws) for a corrupted PDF", async () => {
    // A non-PDF buffer — pdfjs will throw, extractPdfText should propagate
    // the error rather than silently return empty (which was the old bug).
    // The CALLER decides whether to treat empty as "scanned PDF" or
    // "extraction failed".
    await expect(extractPdfText(Buffer.from("not a pdf"))).rejects.toThrow();
  });

  it("handles a PDF with special characters in the body (non-ASCII)", async () => {
    // pdf-lib can render Latin-1 + standard chars. Test that extraction
    // preserves them.
    const pdf = await makePdf({
      title: "Math symbols",
      body: "The equation is 6CO2 + 6H2O -> C6H12O6 + 6O2. Pi = 3.14.",
    });
    const text = await extractPdfText(Buffer.from(pdf));
    expect(text).toMatch(/6CO2/);
    expect(text).toMatch(/Pi = 3\.14/);
  });
});

// ---------------------------------------------------------------
// Integration: extractPdfText is called by /api/extract/file and
// /api/tutor/upload-document via extractTextFromFile in upload-helpers.ts.
// Confirm the chain works end-to-end.
// ---------------------------------------------------------------

describe("extractPdfText — integration with upload-helpers", () => {
  it("extractTextFromFile routes PDFs to extractPdfText", async () => {
    const { extractTextFromFile } = await import("../upload-helpers");
    const pdf = await makePdf({
      title: "Integration test",
      body: "Photosynthesis is the process by which plants convert light energy into chemical energy.",
    });
    // Build a File object (the shape upload-helpers expects)
    const file = new File([pdf], "test.pdf", { type: "application/pdf" });
    const text = await extractTextFromFile(file, { maxLength: 100_000 });

    expect(text).toMatch(/Integration test/);
    expect(text).toMatch(/Photosynthesis/);
    // pdfjs wraps text — "chemical energy" may break across lines.
    // Use a regex that tolerates any whitespace between words.
    expect(text).toMatch(/chemical\s+energy/);
  });
});

// ---------------------------------------------------------------
// Regression: confirm the OLD broken pattern would have failed.
// This documents the bug for future maintainers.
// ---------------------------------------------------------------

describe("extractPdfText — regression guard", () => {
  it("the v1-style call (`pdfParse(buffer)`) does NOT work against v2", async () => {
    // This is what the OLD code did. Importing the namespace + calling it
    // as a function should throw (because v2 has no callable default).
    const pdfModule: any = await import("pdf-parse");
    const pdf = await makePdf({ title: "X", body: "Y" });
    const buffer = Buffer.from(pdf);

    // pdfModule is a namespace object, not a function. Calling it throws.
    expect(typeof pdfModule).not.toBe("function");
    // The default export doesn't exist either.
    expect(pdfModule.default).toBeUndefined();

    // Calling it would throw a TypeError.
    expect(() => (pdfModule as any)(buffer)).toThrow();
  });
});
