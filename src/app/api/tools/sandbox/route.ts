import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { runCode } from "@/lib/code-sandbox";

export const runtime = "nodejs";
export const maxDuration = 35; // matches the 30s Tools Hub timeout + 5s buffer

/**
 * POST /api/tools/sandbox
 *
 * Frontend-facing proxy for code execution. The frontend (workspace code
 * panels, AI Tutor code blocks) calls this with { language, code }.
 *
 * This route is a thin wrapper around runCode() — it:
 *   1. Authenticates the user (no anonymous code execution)
 *   2. Validates the language + code shape
 *   3. Caps code size (10k chars — prevents abuse)
 *   4. Delegates to runCode(), which:
 *      - If local kill switch is ON → routes to Tools Hub if enabled
 *      - If local kill switch is OFF → runs locally (legacy)
 *      - If neither → returns `unsupported`
 *
 * The response shape matches CodeResult so the frontend can render
 * stdout/stderr/exitCode uniformly.
 */
export async function POST(req: NextRequest) {
  let user;
  try { user = await getCurrentUser(); }
  catch { return NextResponse.json({ error: "Auth required" }, { status: 401 }); }

  const body = await req.json().catch(() => ({}));
  const language = (body?.language ?? "").toString().toLowerCase().trim();
  const code = (body?.code ?? "").toString();

  if (!code) {
    return NextResponse.json({ error: "Code is required" }, { status: 400 });
  }
  if (code.length > 10_000) {
    return NextResponse.json({ error: "Code too long (max 10,000 characters)" }, { status: 413 });
  }

  const lang = language === "python" || language === "py" ? "python"
    : language === "javascript" || language === "js" ? "javascript"
    : null;
  if (!lang) {
    return NextResponse.json(
      { error: `Unsupported language: ${language}. Use "python" or "javascript".` },
      { status: 400 },
    );
  }

  const result = await runCode(lang, code);

  return NextResponse.json({
    language: result.language,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    timedOut: result.timedOut,
    unsupported: result.unsupported ?? false,
    // Hide internals: never expose whether Tools Hub was used.
    // The frontend just sees "ran successfully" or "not available".
  });
}
