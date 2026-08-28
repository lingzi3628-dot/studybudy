import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { callAI, type ChatMessage } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min for large exams

/**
 * POST /api/tutor/generate-exam
 *
 * Body: {
 *   topic: string,         // what to test on
 *   numQuestions: number,   // 5-50
 *   numPages: number,       // 1-10 (affects layout, not content)
 *   gradeLevel?: string,    // e.g. "Form 4", "Grade 6"
 *   examType?: string,      // "mcq" | "short_answer" | "mixed"
 *   difficulty?: string,    // "easy" | "medium" | "hard"
 * }
 *
 * For large exams (>15 questions), generates in batches to avoid
 * AI response truncation.
 */
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await getCurrentUser();
  } catch (e: any) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const topic = (body?.topic ?? "").toString().trim();
  const numQuestions = Math.min(50, Math.max(5, Number(body?.numQuestions) || 10));
  const numPages = Math.min(10, Math.max(1, Number(body?.numPages) || 2));
  const gradeLevel = (body?.gradeLevel ?? "").toString().trim() || "General";
  const examType = (body?.examType ?? "mixed").toString();
  const difficulty = (body?.difficulty ?? "medium").toString();

  if (!topic) {
    return NextResponse.json({ error: "Topic is required" }, { status: 400 });
  }

  // For large exams (>15 questions), generate in batches to avoid truncation
  const allQuestions: any[] = [];
  const batchSize = numQuestions > 15 ? 10 : numQuestions;
  const numBatches = Math.ceil(numQuestions / batchSize);

  for (let batch = 0; batch < numBatches; batch++) {
    const remaining = numQuestions - batch * batchSize;
    const thisBatchSize = Math.min(batchSize, remaining);
    const startNum = batch * batchSize + 1;

    const systemPrompt = `You are an expert exam creator for Kenyan students (CBC/KCSE/KPSEA curriculum).

Create ${thisBatchSize} ${difficulty} questions (questions ${startNum} to ${startNum + thisBatchSize - 1}) on: "${topic}"
Grade level: ${gradeLevel}
Exam type: ${examType} (mcq = multiple choice only, short_answer = written answers only, mixed = both)

RULES:
- Questions must be accurate and educational
- For MCQ: provide 4 options with one correct answer (correctIndex 0-3)
- For short answer: provide the expected answer and marks
- Include a mix of question types if examType is "mixed" (~60% MCQ, ~40% short answer)
- Each question should be worth 1-5 marks
- Do NOT include an answer key section — just the questions

Return ONLY valid JSON (no markdown, no code blocks):
{"questions":[{"type":"mcq","number":${startNum},"question":"...","options":["A) ...","B) ...","C) ...","D) ..."],"correctIndex":0,"marks":1,"explanation":"..."},{"type":"short_answer","number":${startNum + 1},"question":"...","answer":"...","marks":3}]}`;

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Generate ${thisBatchSize} questions on "${topic}" for ${gradeLevel} students. Questions numbered ${startNum} to ${startNum + thisBatchSize - 1}.` },
    ];

    try {
      const reply = await callAI(messages, null, { userId: user.id, route: "/api/tutor/generate-exam" });
      let cleaned = reply.trim();
      // Strip markdown code blocks
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
      }
      const firstBrace = cleaned.indexOf("{");
      const lastBrace = cleaned.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1) {
        const parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
        if (Array.isArray(parsed.questions)) {
          allQuestions.push(...parsed.questions);
        }
      }
    } catch (batchErr: any) {
      console.error(`[generate-exam] Batch ${batch + 1} failed:`, batchErr?.message);
      // Continue with other batches — partial exam is better than no exam
    }
  }

  if (allQuestions.length === 0) {
    return NextResponse.json(
      { error: "AI couldn't generate any questions. Please try again with fewer questions or a simpler topic." },
      { status: 500 }
    );
  }

  // Build the exam object
  const totalMarks = allQuestions.reduce((s: number, q: any) => s + (q.marks ?? 1), 0);
  const exam = {
    title: `Exam: ${topic}`,
    subtitle: `${gradeLevel} · ${difficulty} · ${allQuestions.length} questions`,
    questions: allQuestions,
    totalMarks,
    instructions: "Answer ALL questions. Write your answers in the spaces provided.",
  };

  // Build the full HTML for the printable exam
  const html = buildExamHTML(exam, topic, gradeLevel, user.name ?? "Student");

  return NextResponse.json({
    ok: true,
    exam,
    html,
    summary: {
      topic,
      questionCount: exam.questions.length,
      totalMarks: exam.totalMarks,
      gradeLevel,
      difficulty,
      examType,
    },
  });
}

/**
 * Build a full HTML document for the exam with StudyBuddy branding.
 * This HTML is displayed in the ExamPanel and can be printed to PDF.
 */
function buildExamHTML(exam: any, topic: string, gradeLevel: string, studentName: string): string {
  const questionsHTML = (exam.questions ?? []).map((q: any, i: number) => {
    if (q.type === "mcq") {
      const optionsHTML = (q.options ?? []).map((opt: string, j: number) => `
        <div class="option">
          <span class="option-letter">${String.fromCharCode(65 + j)}</span>
          <span class="option-text">${escapeHtml(opt)}</span>
        </div>`).join("");
      return `
      <div class="question mcq">
        <div class="q-header">
          <span class="q-number">${q.number ?? i + 1}.</span>
          <span class="q-marks">[${q.marks ?? 1} mark${(q.marks ?? 1) > 1 ? "s" : ""}]</span>
        </div>
        <div class="q-text">${escapeHtml(q.question)}</div>
        <div class="options">${optionsHTML}</div>
        <div class="answer-line">Answer: _______</div>
      </div>`;
    } else {
      return `
      <div class="question short-answer">
        <div class="q-header">
          <span class="q-number">${q.number ?? i + 1}.</span>
          <span class="q-marks">[${q.marks ?? 1} mark${(q.marks ?? 1) > 1 ? "s" : ""}]</span>
        </div>
        <div class="q-text">${escapeHtml(q.question)}</div>
        <div class="answer-lines">
          ${Array.from({ length: Math.min(5, Math.ceil((q.marks ?? 1) / 2) + 1) }, () => '<div class="write-line"></div>').join("")}
        </div>
      </div>`;
    }
  }).join("");

  // Build answer key
  const answerKeyHTML = (exam.questions ?? []).map((q: any, i: number) => {
    if (q.type === "mcq") {
      const correctLetter = String.fromCharCode(65 + (q.correctIndex ?? 0));
      return `<div class="answer-item"><span class="ans-num">${q.number ?? i + 1}.</span> <span class="ans-text">${correctLetter}) ${escapeHtml(q.options?.[q.correctIndex ?? 0] ?? "")}</span>${q.explanation ? ` <span class="ans-expl">— ${escapeHtml(q.explanation)}</span>` : ""}</div>`;
    } else {
      return `<div class="answer-item"><span class="ans-num">${q.number ?? i + 1}.</span> <span class="ans-text">${escapeHtml(q.answer ?? "N/A")}</span></div>`;
    }
  }).join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(exam.title ?? `Exam: ${topic}`)}</title>
<style>
  @page { margin: 1.5cm; size: A4; }
  * { box-sizing: border-box; }
  body { font-family: 'Times New Roman', Georgia, serif; color: #1a1a1a; line-height: 1.6; padding: 0; margin: 0; }

  .exam-header { text-align: center; border-bottom: 3px double #4F46E5; padding-bottom: 16px; margin-bottom: 20px; }
  .exam-logo { font-size: 28px; font-weight: 800; color: #4F46E5; letter-spacing: -0.5px; }
  .exam-logo span { color: #8B5CF6; }
  .exam-subtitle { font-size: 12px; color: #6B7280; margin-top: 4px; }
  .exam-title { font-size: 18px; font-weight: 700; margin-top: 12px; }
  .exam-meta { display: flex; justify-content: space-between; margin-top: 12px; font-size: 11px; }
  .exam-meta div { text-align: left; }
  .student-info { border: 1px solid #D1D5DB; padding: 8px 12px; border-radius: 4px; margin-bottom: 20px; display: flex; gap: 16px; font-size: 11px; }
  .student-info .field { flex: 1; border-bottom: 1px dotted #9CA3AF; padding-bottom: 2px; }

  .instructions { background: #F3F4F6; padding: 8px 12px; border-radius: 4px; font-size: 11px; margin-bottom: 20px; }
  .instructions strong { color: #4F46E5; }

  .question { margin-bottom: 18px; page-break-inside: avoid; }
  .q-header { display: flex; justify-content: space-between; align-items: baseline; }
  .q-number { font-weight: 700; font-size: 13px; color: #4F46E5; }
  .q-marks { font-size: 10px; color: #6B7280; font-style: italic; }
  .q-text { font-size: 13px; margin: 4px 0 8px 16px; }

  .options { margin-left: 20px; }
  .option { display: flex; gap: 8px; padding: 2px 0; font-size: 12px; }
  .option-letter { font-weight: 700; min-width: 16px; color: #4F46E5; }
  .option-text { flex: 1; }
  .answer-line { margin-left: 20px; font-size: 12px; color: #9CA3AF; margin-top: 4px; }

  .answer-lines { margin-left: 20px; margin-top: 8px; }
  .write-line { border-bottom: 1px solid #D1D5DB; height: 24px; margin-bottom: 4px; }

  .page-break { page-break-after: always; }

  .answer-key { page-break-before: always; }
  .answer-key h2 { color: #4F46E5; font-size: 16px; border-bottom: 2px solid #4F46E5; padding-bottom: 4px; }
  .answer-item { font-size: 12px; margin: 6px 0; padding: 4px 8px; background: #F9FAFB; border-radius: 4px; }
  .ans-num { font-weight: 700; color: #4F46E5; margin-right: 8px; }
  .ans-expl { color: #6B7280; font-style: italic; }

  .footer { text-align: center; font-size: 10px; color: #9CA3AF; margin-top: 20px; padding-top: 10px; border-top: 1px solid #E5E7EB; }
  .footer a { color: #4F46E5; text-decoration: none; }

  @media print {
    body { font-size: 11pt; }
    .no-print { display: none !important; }
    .question { page-break-inside: avoid; }
  }
</style>
</head>
<body>
  <div class="exam-header">
    <div class="exam-logo">Study<span>Buddy</span> AI</div>
    <div class="exam-subtitle">Kenya's AI Study Companion · studybuddy.ai</div>
    <div class="exam-title">${escapeHtml(exam.title ?? `Exam: ${topic}`)}</div>
    <div class="exam-subtitle">${escapeHtml(exam.subtitle ?? `${gradeLevel} · ${exam.questions?.length ?? 0} questions`)}</div>
    <div class="exam-meta">
      <div>Date: ${new Date().toLocaleDateString()}</div>
      <div>Total Marks: ${exam.totalMarks ?? 0}</div>
      <div>Time: ${Math.ceil((exam.questions?.length ?? 10) * 1.5)} min</div>
    </div>
  </div>

  <div class="student-info">
    <div class="field">Name: ${escapeHtml(studentName)}</div>
    <div class="field">Grade: ${escapeHtml(gradeLevel)}</div>
    <div class="field">Score: _____ / ${exam.totalMarks ?? 0}</div>
  </div>

  <div class="instructions">
    <strong>Instructions:</strong> ${escapeHtml(exam.instructions ?? "Answer ALL questions. Write your answers in the spaces provided.")}
  </div>

  ${questionsHTML}

  <div class="page-break"></div>

  <div class="answer-key">
    <h2>📝 Answer Key</h2>
    ${answerKeyHTML}
  </div>

  <div class="footer">
    Generated by StudyBuddy AI · ${new Date().toLocaleDateString()} · <a href="https://studybuddy.ai">studybuddy.ai</a>
  </div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return (text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
