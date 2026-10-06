/**
 * Server-side PDF text extraction.
 *
 * HISTORY:
 *   pdf-parse@2.x changed its API from a default function export
 *   (v1: `pdfParse(buffer)` → `{ numpages, text }`) to a class
 *   (v2: `new PDFParse(uint8array, opts).getText()` → `{ pages, text, total }`).
 *   The v2 class also requires a `Uint8Array` (not a `Buffer`) and pdfjs-dist
 *   throws "Please provide binary data as Uint8Array" if you pass a Buffer.
 *
 *   This silently broke ALL PDF uploads after the package was upgraded —
 *   the previous code's catch block swallowed the error and the caller
 *   returned "Could not extract enough text" for every PDF. Fixed in Phase 7.
 *
 * @param buffer — PDF file contents (Node Buffer or ArrayBuffer)
 * @returns plain text extracted from the PDF (truncated to 30k chars)
 */
export async function extractPdfText(buffer: Buffer | ArrayBuffer): Promise<string> {
  // Dynamic import — pdf-parse is ESM-only in v2 and bundlers choke on it
  // if it's statically imported.
  const pdfParseModule: any = await import("pdf-parse");

  // v2 API: PDFParse is a named class export.
  // (v1 had a default function export — different API entirely.)
  const PDFParse = pdfParseModule.PDFParse ?? pdfParseModule.default;
  if (!PDFParse) {
    throw new Error("pdf-parse did not export PDFParse — package may have been downgraded.");
  }

  // v2 REQUIRES Uint8Array, not Buffer. pdfjs-dist (which pdf-parse v2 wraps)
  // explicitly throws: "Please provide binary data as Uint8Array, rather than Buffer."
  const uint8 =
    buffer instanceof Uint8Array ? buffer :
    buffer instanceof ArrayBuffer ? new Uint8Array(buffer) :
    new Uint8Array(buffer); // Node Buffer is a Uint8Array subclass — copy to be safe

  // Cap at 30 pages to bound runtime. The caller already caps the file
  // upload size; this is a defence-in-depth against malicious PDFs with
  // thousands of empty pages.
  const instance = new PDFParse(uint8, { max: 30 });

  const data = await instance.getText();

  // v2 return shape: { pages: Array<{text, num}>, text: string, total: number }
  // v1 used: { numpages: number, text: string }
  // Prefer the concatenated `text` field (which exists on both shapes);
  // fall back to joining pages[].text if the top-level text is missing.
  const text: string =
    typeof data?.text === "string" ? data.text :
    Array.isArray(data?.pages) ? data.pages.map((p: any) => p?.text ?? "").join("\n\n") :
    "";

  return text.slice(0, 30_000).trim();
}
