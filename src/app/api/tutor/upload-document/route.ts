import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { writeFile, readFile, unlink, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { execSync } from "child_process";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/tutor/upload-document
 *
 * Accepts multipart/form-data with:
 *   file: PDF/DOC/DOCX/XLSX/CSV/TXT file (max 10MB)
 *
 * Extracts text from the document:
 *   - PDF: pdftotext (fast) → fallback to pdf-parse npm package
 *   - DOC/DOCX: mammoth (npm) for DOCX, LibreOffice for DOC
 *   - XLSX/XLS: xlsx (npm) — extracts all sheets as text
 *   - CSV/TXT: read directly
 *
 * Returns { text, fileName, fileSize, fileType, preview }
 * The extracted text is then included in the AI conversation context
 * by the client (sent as part of the message to /api/tutor/chat).
 */
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await getCurrentUser();
  } catch (e: any) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  // 10MB limit
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 413 });
  }

  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const allowedExts = ["pdf", "doc", "docx", "xlsx", "xls", "csv", "txt", "md"];
  if (!allowedExts.includes(ext)) {
    return NextResponse.json(
      { error: `Unsupported file type: .${ext}. Supported: PDF, DOC, DOCX, XLSX, XLS, CSV, TXT, MD` },
      { status: 400 }
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let extractedText = "";
  let fileType = ext;

  try {
    if (ext === "pdf") {
      // Try pdftotext first (fast, high quality)
      try {
        const tmpDir = "/tmp/doc-uploads";
        if (!existsSync(tmpDir)) await mkdir(tmpDir, { recursive: true });
        const tmpPdf = path.join(tmpDir, `doc-${Date.now()}.pdf`);
        const tmpTxt = path.join(tmpDir, `doc-${Date.now()}.txt`);
        await writeFile(tmpPdf, buffer);
        execSync(`pdftotext -layout ${tmpPdf} ${tmpTxt}`, { timeout: 30000, stdio: "pipe" });
        if (existsSync(tmpTxt)) {
          extractedText = (await readFile(tmpTxt, "utf-8")).trim();
          await unlink(tmpPdf).catch(() => {});
          await unlink(tmpTxt).catch(() => {});
        }
      } catch (pdftotextErr) {
        // Fallback to pdf-parse npm package
        try {
          const pdfParseModule = await import("pdf-parse");
          const pdfParse = (pdfParseModule as any).default ?? pdfParseModule;
          const data = await pdfParse(buffer);
          extractedText = (data?.text ?? "").trim();
        } catch (pdfParseErr: any) {
          console.error("[upload-document] pdf-parse failed:", pdfParseErr?.message);
        }
      }
    } else if (ext === "docx") {
      // Use mammoth for DOCX → text
      try {
        const mammoth = (await import("mammoth")).default;
        const result = await mammoth.extractRawText({ buffer });
        extractedText = (result?.value ?? "").trim();
      } catch (mammothErr: any) {
        console.error("[upload-document] mammoth failed:", mammothErr?.message);
      }
    } else if (ext === "doc") {
      // DOC (old format) → LibreOffice converts to txt
      try {
        const tmpDir = "/tmp/doc-uploads";
        if (!existsSync(tmpDir)) await mkdir(tmpDir, { recursive: true });
        const tmpFile = path.join(tmpDir, `doc-${Date.now()}.doc`);
        await writeFile(tmpFile, buffer);
        execSync(`libreoffice --headless --convert-to txt:Text --outdir ${tmpDir} ${tmpFile}`, {
          timeout: 30000,
          stdio: "pipe",
        });
        const txtFile = tmpFile.replace(/\.doc$/, ".txt");
        if (existsSync(txtFile)) {
          extractedText = (await readFile(txtFile, "utf-8")).trim();
          await unlink(tmpFile).catch(() => {});
          await unlink(txtFile).catch(() => {});
        }
      } catch (docErr: any) {
        console.error("[upload-document] DOC conversion failed:", docErr?.message);
      }
    } else if (ext === "xlsx" || ext === "xls") {
      // Phase 89 — Use exceljs (replaces vulnerable xlsx package)
      try {
        const ExcelJS = (await import("exceljs")).default;
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer as any);
        const sheets: string[] = [];
        workbook.eachSheet((sheet: any) => {
          const rows: string[] = [];
          sheet.eachRow((row: any) => {
            const vals = row.values as any[];
            const cells = vals.slice(1).map((v: any) => v instanceof Object ? (v.text || v.result || JSON.stringify(v)) : String(v ?? ""));
            rows.push(cells.join("\t"));
          });
          sheets.push(`=== Sheet: ${sheet.name} ===\n${rows.join("\n")}`);
        });
        extractedText = sheets.join("\n\n").trim();
      } catch (xlsxErr: any) {
        console.error("[upload-document] xlsx parsing failed:", xlsxErr?.message);
      }
    } else if (ext === "csv" || ext === "txt" || ext === "md") {
      // Read directly as text
      extractedText = buffer.toString("utf-8").trim();
    }

    if (!extractedText || extractedText.length < 10) {
      return NextResponse.json(
        { error: "Could not extract enough text from this document. It might be a scanned PDF (images only) or empty." },
        { status: 422 }
      );
    }

    // Build a preview (first 500 chars)
    const preview = extractedText.slice(0, 500) + (extractedText.length > 500 ? "…" : "");

    // Truncate to 12000 chars for AI context (to stay within token limits)
    const truncatedText = extractedText.slice(0, 12000);

    return NextResponse.json({
      ok: true,
      text: truncatedText,
      fileName: file.name,
      fileSize: file.size,
      fileType,
      preview,
      fullLength: extractedText.length,
      truncated: extractedText.length > 12000,
    });
  } catch (e: any) {
    console.error("[upload-document] error:", e?.message);
    return NextResponse.json(
      { error: "Failed to process document: " + (e?.message ?? "unknown error") },
      { status: 500 }
    );
  }
}
