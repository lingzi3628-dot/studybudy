import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { parseFormData, extractTextFromFile } from "@/lib/upload-helpers";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/tutor/upload-document
 * Accepts a document file (PDF/DOCX/XLSX/CSV/TXT) and returns extracted text.
 */
export async function POST(req: NextRequest) {
  let user;
  try { user = await getCurrentUser(); }
  catch { return NextResponse.json({ error: "Auth required" }, { status: 401 }); }

  const parsed = await parseFormData(req, {
    maxFileSize: 4 * 1024 * 1024,
    allowedExts: ["pdf", "doc", "docx", "xlsx", "xls", "csv", "txt", "md"],
  });
  if (parsed instanceof NextResponse) return parsed;
  const { file } = parsed;

  // Phase 90 — use shared text extraction helper
  // Phase 7 Stage 1 — extractTextFromFile now returns { text, error }.
  // Surface the actual error (e.g. "password-protected", "corrupted file",
  // "standardFontDataUrl missing") instead of the generic "could not
  // extract enough text" so the user knows what's really wrong.
  const { text: extractedText, error: extractionError } = await extractTextFromFile(file, { maxLength: 100_000 });

  if (extractionError) {
    // Extraction threw — return the real error so the user + logs show
    // what actually happened. Distinguish password-protected PDFs (friendly
    // message) from other errors (technical message).
    const isPasswordProtected = /password/i.test(extractionError);
    return NextResponse.json(
      {
        error: isPasswordProtected
          ? "This PDF is password-protected. Please remove the password and try again."
          : `Could not extract text from this document: ${extractionError}`,
      },
      { status: 422 }
    );
  }

  if (!extractedText || extractedText.length < 10) {
    return NextResponse.json(
      { error: "Could not extract enough text from this document. It might be a scanned PDF (images only) or empty." },
      { status: 422 }
    );
  }

  const preview = extractedText.slice(0, 500) + (extractedText.length > 500 ? "…" : "");

  return NextResponse.json({
    text: extractedText,
    fileName: file.name,
    fileType: file.name.toLowerCase().split(".").pop() || "txt",
    preview,
    charCount: extractedText.length,
  });
}
