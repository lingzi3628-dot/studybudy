/**
 * Server-side PDF text extraction using pdf-parse.
 * Returns the concatenated plain text (truncated to 30k chars).
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  // dynamic import — pdf-parse has top-level Node globals that crash bundlers
  const pdfParse = (await import("pdf-parse")).default;
  const data = await pdfParse(buffer);
  const text = (data?.text ?? "").slice(0, 30_000);
  return text.trim();
}
