import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * POST /api/extract/file
 * Body: multipart/form-data with field "file"
 *
 * - PDF: extracts text via pdf-parse (dynamic import, wrapped in try/catch)
 * - Text/.txt/.md/.csv: reads as UTF-8
 * - Image: returns friendly 415 error
 *
 * All wrapped in outer try/catch so it never returns a bare 500.
 */
export async function POST(req: NextRequest) {
  try {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json(
        { error: "Expected multipart/form-data with a 'file' field" },
        { status: 400 }
      );
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing 'file' field" },
        { status: 400 }
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_BYTES / 1024 / 1024} MB)` },
        { status: 413 }
      );
    }

    const mimeType = file.type || "application/octet-stream";
    const name = file.name.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());

    // PDF
    if (mimeType === "application/pdf" || name.endsWith(".pdf")) {
      try {
        const { extractPdfText } = await import("@/lib/pdf");
        const text = await extractPdfText(buffer);
        if (!text.trim()) {
          return NextResponse.json(
            { error: "No selectable text found in PDF. It may be a scanned image — try Paste Text instead." },
            { status: 422 }
          );
        }
        return NextResponse.json({ text, filename: file.name, fileSize: file.size, mimeType });
      } catch (pdfError: any) {
        return NextResponse.json(
          { error: `PDF extraction failed: ${pdfError?.message ?? "unknown error"}. Try pasting the text manually.` },
          { status: 422 }
        );
      }
    }

    // Plain text
    if (
      mimeType.startsWith("text/") ||
      name.endsWith(".txt") || name.endsWith(".md") ||
      name.endsWith(".markdown") || name.endsWith(".csv")
    ) {
      const text = buffer.toString("utf-8").slice(0, 30_000);
      return NextResponse.json({ text, filename: file.name, fileSize: file.size, mimeType });
    }

    // Image
    if (mimeType.startsWith("image/") || name.match(/\.(png|jpg|jpeg|gif|webp)$/)) {
      return NextResponse.json(
        { error: "Image OCR not yet supported — please upload a PDF, a .txt file, or paste the text manually." },
        { status: 415 }
      );
    }

    return NextResponse.json(
      { error: `Unsupported file type: ${mimeType || name}. Use PDF, .txt, .md, or paste text manually.` },
      { status: 415 }
    );
  } catch (e: any) {
    console.error("File extraction error:", e?.message ?? e);
    return NextResponse.json(
      { error: `Failed to process file: ${e?.message ?? "unknown error"}` },
      { status: 500 }
    );
  }
}
