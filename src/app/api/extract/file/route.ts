import { NextRequest, NextResponse } from "next/server";
import { extractPdfText } from "@/lib/pdf";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * POST /api/extract/file
 * Body: multipart/form-data with field "file"
 *
 * - PDF: extracts text via pdf-parse
 * - Plain text (.txt, .md): reads as UTF-8
 * - Image (.png, .jpg, .jpeg): returns friendly error per spec
 *        ("Image OCR not yet supported — please upload a PDF or paste the text manually")
 *
 * Returns: { text, filename, fileSize, mimeType }
 */
export async function POST(req: NextRequest) {
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

  try {
    const buffer = Buffer.from(await file.arrayBuffer());

    // PDF
    if (
      mimeType === "application/pdf" ||
      name.endsWith(".pdf")
    ) {
      const text = await extractPdfText(buffer);
      if (!text.trim()) {
        return NextResponse.json(
          { error: "No selectable text found in PDF. It may be a scanned image — try Paste Text instead." },
          { status: 422 }
        );
      }
      return NextResponse.json({
        text,
        filename: file.name,
        fileSize: file.size,
        mimeType,
      });
    }

    // Plain text / markdown
    if (
      mimeType.startsWith("text/") ||
      name.endsWith(".txt") ||
      name.endsWith(".md") ||
      name.endsWith(".markdown") ||
      name.endsWith(".csv")
    ) {
      const text = buffer.toString("utf-8").slice(0, 30_000);
      return NextResponse.json({
        text,
        filename: file.name,
        fileSize: file.size,
        mimeType,
      });
    }

    // Image — OCR not implemented per Phase 3 spec
    if (
      mimeType.startsWith("image/") ||
      name.endsWith(".png") ||
      name.endsWith(".jpg") ||
      name.endsWith(".jpeg") ||
      name.endsWith(".gif") ||
      name.endsWith(".webp")
    ) {
      return NextResponse.json(
        {
          error:
            "Image OCR not yet supported — please upload a PDF, a .txt file, or paste the text manually.",
        },
        { status: 415 }
      );
    }

    return NextResponse.json(
      {
        error: `Unsupported file type: ${mimeType || name}. Use PDF, .txt, .md, or paste text manually.`,
      },
      { status: 415 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: "Failed to extract text", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
