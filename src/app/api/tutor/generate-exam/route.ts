import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { callAI, type ChatMessage } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/tutor/generate-exam
 *
 * Body: {
 *   topic: string,
 *   numQuestions: number,   // 5-40 (capped at 40)
 *   numPages: number,       // 1-10
 *   gradeLevel?: string,
 *   examType?: string,      // "mcq" | "short_answer" | "mixed" | "kcse_style"
 *   difficulty?: string,
 * }
 *
 * KCSE-style exams have sections:
 *   Section A: short questions (2-4 marks each)
 *   Section B: long questions (10-15 marks each, may include diagrams)
 *
 * For large exams, generates in batches.
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
  const numQuestions = Math.min(40, Math.max(5, Number(body?.numQuestions) || 10));
  const numPages = Math.min(10, Math.max(1, Number(body?.numPages) || 2));
  const gradeLevel = (body?.gradeLevel ?? "").toString().trim() || "General";
  const examType = (body?.examType ?? "mixed").toString();
  const difficulty = (body?.difficulty ?? "medium").toString();

  if (!topic) {
    return NextResponse.json({ error: "Topic is required" }, { status: 400 });
  }

  // Determine section structure based on exam type
  // KCSE-style: Section A (short, 2-4 marks) + Section B (long, 10 marks, with diagrams)
  // Mixed/MCQ: single section with uniform marks
  const isKCSE = examType === "kcse_style" || (gradeLevel.toLowerCase().includes("form") && examType === "mixed");

  let sections: Array<{ name: string; instructions: string; questionCount: number; marksPerQuestion: string; questionType: string }> = [];

  if (isKCSE) {
    // KCSE-style: ~60% Section A (short), ~40% Section B (long)
    const sectionACount = Math.ceil(numQuestions * 0.6);
    const sectionBCount = numQuestions - sectionACount;
    sections = [
      {
        name: "SECTION A",
        instructions: "Answer ALL questions in this section. Show all working.",
        questionCount: sectionACount,
        marksPerQuestion: "3-4",
        questionType: "short_answer",
      },
      {
        name: "SECTION B",
        instructions: "Answer ALL questions in this section. Show all working. Some questions may require diagrams.",
        questionCount: sectionBCount,
        marksPerQuestion: "10-15",
        questionType: "long_answer",
      },
    ];
  } else {
    // Single section
    sections = [{
      name: "QUESTIONS",
      instructions: "Answer ALL questions.",
      questionCount: numQuestions,
      marksPerQuestion: examType === "mcq" ? "1" : "2-5",
      questionType: examType === "mcq" ? "mcq" : "short_answer",
    }];
  }

  // Generate questions for each section
  const allSections: Array<{ name: string; instructions: string; questions: any[] }> = [];
  let questionNumber = 1;

  for (const section of sections) {
    const sectionQuestions: any[] = [];
    const batchSize = section.questionCount > 10 ? 8 : section.questionCount;
    const numBatches = Math.ceil(section.questionCount / batchSize);

    for (let batch = 0; batch < numBatches; batch++) {
      const thisBatchSize = Math.min(batchSize, section.questionCount - batch * batchSize);

      const prompt = buildPrompt(topic, gradeLevel, difficulty, section, thisBatchSize, questionNumber);

      const messages: ChatMessage[] = [
        { role: "system", content: prompt },
        { role: "user", content: `Generate ${thisBatchSize} questions on "${topic}" for ${gradeLevel} students. Questions numbered ${questionNumber} to ${questionNumber + thisBatchSize - 1}.` },
      ];

      try {
        const reply = await callAI(messages, null, { userId: user.id, route: "/api/tutor/generate-exam" });
        let cleaned = reply.trim();
        if (cleaned.startsWith("```")) {
          cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
        }
        const firstBrace = cleaned.indexOf("{");
        const lastBrace = cleaned.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1) {
          const parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
          if (Array.isArray(parsed.questions)) {
            sectionQuestions.push(...parsed.questions);
            questionNumber += parsed.questions.length;
          }
        }
      } catch (batchErr: any) {
        console.error(`[generate-exam] ${section.name} batch ${batch + 1} failed:`, batchErr?.message);
      }
    }

    allSections.push({
      name: section.name,
      instructions: section.instructions,
      questions: sectionQuestions,
    });
  }

  // Check if we got any questions
  const totalQuestions = allSections.reduce((s, sec) => s + sec.questions.length, 0);
  if (totalQuestions === 0) {
    return NextResponse.json(
      { error: "AI couldn't generate any questions. Try fewer questions or a simpler topic." },
      { status: 500 }
    );
  }

  const totalMarks = allSections.reduce((s, sec) =>
    s + sec.questions.reduce((qs, q) => qs + (q.marks ?? 1), 0), 0
  );

  const exam = {
    title: `${topic} — ${gradeLevel} Exam`,
    subtitle: `${gradeLevel} · ${difficulty} · ${totalQuestions} questions · ${totalMarks} marks`,
    sections: allSections,
    totalMarks,
    instructions: isKCSE
      ? "This exam has two sections. Answer ALL questions in both sections. Show all working."
      : "Answer ALL questions. Show all working.",
  };

  const html = buildExamHTML(exam, topic, gradeLevel, user.name ?? "Student");

  return NextResponse.json({
    ok: true,
    exam,
    html,
    summary: {
      topic,
      questionCount: totalQuestions,
      totalMarks,
      gradeLevel,
      difficulty,
      examType,
      sections: allSections.map(s => ({ name: s.name, count: s.questions.length })),
    },
  });
}

function buildPrompt(
  topic: string,
  gradeLevel: string,
  difficulty: string,
  section: any,
  count: number,
  startNum: number
): string {
  const isLongAnswer = section.questionType === "long_answer";

  return `You are an expert exam creator for Kenyan students (CBC/KCSE curriculum).

Create ${count} ${difficulty} questions for ${section.name} on: "${topic}"
Grade level: ${gradeLevel}
Question type: ${section.questionType}
Marks per question: ${section.marksPerQuestion}
Questions numbered: ${startNum} to ${startNum + count - 1}

RULES:
- Questions must be accurate, educational, and appropriate for ${gradeLevel}
- ${isLongAnswer
    ? "These are LONG-answer questions worth 10-15 marks each. They should require detailed working, multiple steps, and may involve diagrams or graphs."
    : section.questionType === "mcq"
    ? "Each question has 4 options (A, B, C, D) with one correct answer (correctIndex 0-3)."
    : "These are short-answer questions worth 2-4 marks each."
}
- For math/science questions that involve diagrams, graphs, or geometric constructions, include a "diagram" field with a mathgraph JSON spec (same format as the AI Tutor graph engine). The diagram should illustrate what the student needs to draw or solve.
- Include the expected answer and marks allocation
- For KCSE-style: Section A questions are worth 3-4 marks, Section B questions are worth 10-15 marks

Return ONLY valid JSON (no markdown, no code blocks):
{"questions":[
  ${isLongAnswer
    ? '{"type":"long_answer","number":' + startNum + ',"question":"...","answer":"Detailed solution with steps...","marks":10,"diagram":{"type":"function","expr":"x^2","title":"Graph of y=x²","xRange":[-5,5],"yRange":[-5,25]}}'
    : section.questionType === "mcq"
    ? '{"type":"mcq","number":' + startNum + ',"question":"...","options":["A) ...","B) ...","C) ...","D) ..."],"correctIndex":0,"marks":1,"explanation":"..."}'
    : '{"type":"short_answer","number":' + startNum + ',"question":"...","answer":"...","marks":3}'
  }
]}`;
}

/**
 * Build a full HTML document for the exam with StudyBuddy branding.
 */
function buildExamHTML(exam: any, topic: string, gradeLevel: string, studentName: string): string {
  const sectionsHTML = (exam.sections ?? []).map((section: any) => {
    const questionsHTML = (section.questions ?? []).map((q: any, i: number) => {
      const qNum = q.number ?? i + 1;
      const marks = q.marks ?? 1;
      const isMCQ = q.type === "mcq";
      const isLong = q.type === "long_answer";

      let qHTML = `
      <div class="question ${isLong ? "long-answer" : isMCQ ? "mcq" : "short-answer"}">
        <div class="q-header">
          <span class="q-number">${qNum}.</span>
          <span class="q-marks">[${marks} mark${marks > 1 ? "s" : ""}]</span>
        </div>
        <div class="q-text">${escapeHtml(q.question)}</div>`;

      if (isMCQ) {
        const optionsHTML = (q.options ?? []).map((opt: string, j: number) => `
          <div class="option">
            <span class="option-letter">${String.fromCharCode(65 + j)}</span>
            <span class="option-text">${escapeHtml(opt)}</span>
          </div>`).join("");
        qHTML += `<div class="options">${optionsHTML}</div>
          <div class="answer-line">Answer: _______</div>`;
      } else {
        // For short/long answer: add writing lines
        const numLines = isLong ? Math.max(6, Math.ceil(marks / 1.5)) : Math.min(4, Math.ceil(marks / 1) + 1);
        qHTML += `<div class="answer-lines">`;
        for (let l = 0; l < numLines; l++) qHTML += '<div class="write-line"></div>';
        qHTML += `</div>`;

        // If there's a diagram spec, add a note
        if (q.diagram) {
          qHTML += `<div class="diagram-note">📊 A diagram has been generated for this question — it will appear in the answer key.</div>`;
        }
      }

      qHTML += `</div>`;
      return qHTML;
    }).join("");

    return `
    <div class="exam-section">
      <h2 class="section-title">${escapeHtml(section.name)}</h2>
      <p class="section-instructions">${escapeHtml(section.instructions)}</p>
      ${questionsHTML}
    </div>`;
  }).join("");

  // Build answer key
  const answerKeyHTML = (exam.sections ?? []).map((section: any) => {
    const answersHTML = (section.questions ?? []).map((q: any, i: number) => {
      const qNum = q.number ?? i + 1;
      if (q.type === "mcq") {
        const correctLetter = String.fromCharCode(65 + (q.correctIndex ?? 0));
        return `<div class="answer-item"><span class="ans-num">${qNum}.</span> <span class="ans-text"><strong>${correctLetter})</strong> ${escapeHtml(q.options?.[q.correctIndex ?? 0] ?? "")}</span>${q.explanation ? ` <span class="ans-expl">— ${escapeHtml(q.explanation)}</span>` : ""}</div>`;
      } else {
        let answerHTML = `<div class="answer-item"><span class="ans-num">${qNum}.</span> <span class="ans-text">${escapeHtml(q.answer ?? "N/A")}</span></div>`;
        if (q.diagram) {
          answerHTML += `<div class="answer-diagram"><strong>Diagram:</strong> ${escapeHtml(JSON.stringify(q.diagram).slice(0, 200))}…</div>`;
        }
        return answerHTML;
      }
    }).join("");
    return `<div class="answer-section"><h3>${escapeHtml(section.name)} — Answer Key</h3>${answersHTML}</div>`;
  }).join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(exam.title)}</title>
<style>
  @page { margin: 1.5cm; size: A4; }
  * { box-sizing: border-box; }
  body { font-family: 'Times New Roman', Georgia, serif; color: #1a1a1a; line-height: 1.6; padding: 0; margin: 0; }

  .exam-header { text-align: center; border-bottom: 3px double #4F46E5; padding-bottom: 16px; margin-bottom: 20px; page-break-after: avoid; }
  .logo { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 6px; }
  .logo svg { width: 32px; height: 32px; }
  .logo-text { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
  .logo-text .indigo { color: #4F46E5; }
  .logo-text .violet { color: #8B5CF6; }
  .exam-subtitle { font-size: 11px; color: #6B7280; margin-top: 2px; }
  .exam-title { font-size: 18px; font-weight: 700; margin-top: 14px; }
  .exam-meta { display: flex; justify-content: space-between; margin-top: 12px; font-size: 11px; border: 1px solid #D1D5DB; border-radius: 4px; padding: 8px 12px; }
  .exam-meta div { text-align: center; }
  .exam-meta strong { display: block; color: #4F46E5; font-size: 13px; }

  .student-info { border: 1px solid #D1D5DB; padding: 8px 12px; border-radius: 4px; margin-bottom: 20px; display: flex; gap: 16px; font-size: 11px; page-break-after: avoid; }
  .student-info .field { flex: 1; border-bottom: 1px dotted #9CA3AF; padding-bottom: 2px; }

  .instructions { background: #F3F4F6; padding: 8px 12px; border-radius: 4px; font-size: 11px; margin-bottom: 20px; page-break-after: avoid; }
  .instructions strong { color: #4F46E5; }

  .exam-section { page-break-inside: auto; margin-bottom: 24px; }
  .section-title { color: #4F46E5; font-size: 15px; border-bottom: 2px solid #4F46E5; padding-bottom: 4px; margin-bottom: 12px; page-break-after: avoid; }
  .section-instructions { font-size: 11px; color: #6B7280; font-style: italic; margin-bottom: 12px; }

  .question { margin-bottom: 18px; page-break-inside: avoid; }
  .question.long-answer { min-height: 200px; }
  .q-header { display: flex; justify-content: space-between; align-items: baseline; }
  .q-number { font-weight: 700; font-size: 13px; color: #4F46E5; }
  .q-marks { font-size: 10px; color: #6B7280; font-style: italic; }
  .q-text { font-size: 13px; margin: 4px 0 8px 16px; }

  .options { margin-left: 20px; }
  .option { display: flex; gap: 8px; padding: 2px 0; font-size: 12px; }
  .option-letter { font-weight: 700; min-width: 16px; color: #4F46E5; }
  .answer-line { margin-left: 20px; font-size: 12px; color: #9CA3AF; margin-top: 4px; }

  .answer-lines { margin-left: 20px; margin-top: 8px; }
  .write-line { border-bottom: 1px solid #D1D5DB; height: 28px; margin-bottom: 4px; }

  .diagram-note { margin-left: 20px; font-size: 10px; color: #8B5CF6; font-style: italic; margin-top: 4px; }

  .page-break { page-break-after: always; }

  .answer-key { page-break-before: always; }
  .answer-key h2 { color: #4F46E5; font-size: 16px; border-bottom: 2px solid #4F46E5; padding-bottom: 4px; }
  .answer-section { margin-bottom: 16px; }
  .answer-section h3 { font-size: 13px; color: #4F46E5; margin-bottom: 8px; }
  .answer-item { font-size: 11px; margin: 6px 0; padding: 4px 8px; background: #F9FAFB; border-radius: 4px; }
  .ans-num { font-weight: 700; color: #4F46E5; margin-right: 8px; }
  .ans-expl { color: #6B7280; font-style: italic; }
  .answer-diagram { font-size: 10px; color: #8B5CF6; margin: 4px 0 4px 20px; }

  .footer { text-align: center; font-size: 10px; color: #9CA3AF; margin-top: 20px; padding-top: 10px; border-top: 1px solid #E5E7EB; }
  .footer a { color: #4F46E5; text-decoration: none; }

  @media print {
    body { font-size: 11pt; }
    .no-print { display: none !important; }
    .question { page-break-inside: avoid; }
    .exam-section { page-break-inside: auto; }
  }
</style>
</head>
<body>
  <div class="exam-header">
    <div class="logo">
      <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="8" fill="url(#grad)"/>
        <path d="M8 20 L8 12 L16 8 L24 12 L24 20 L16 24 Z" stroke="white" stroke-width="2" fill="none" stroke-linejoin="round"/>
        <circle cx="16" cy="16" r="3" fill="white"/>
        <defs>
          <linearGradient id="grad" x1="0" y1="0" x2="32" y2="32">
            <stop stop-color="#4F46E5"/>
            <stop offset="1" stop-color="#8B5CF6"/>
          </linearGradient>
        </defs>
      </svg>
      <span class="logo-text"><span class="indigo">Study</span><span class="violet">Buddy</span> AI</span>
    </div>
    <div class="exam-subtitle">Kenya's AI Study Companion · studybuddy.ai</div>
    <div class="exam-title">${escapeHtml(exam.title)}</div>
    <div class="exam-subtitle">${escapeHtml(exam.subtitle)}</div>
    <div class="exam-meta">
      <div><strong>${new Date().toLocaleDateString()}</strong>Date</div>
      <div><strong>${exam.totalMarks ?? 0}</strong>Total Marks</div>
      <div><strong>${Math.ceil((exam.totalMarks ?? 0) * 1.5)} min</strong>Time</div>
    </div>
  </div>

  <div class="student-info">
    <div class="field">Name: ${escapeHtml(studentName)}</div>
    <div class="field">Grade: ${escapeHtml(gradeLevel)}</div>
    <div class="field">Score: _____ / ${exam.totalMarks ?? 0}</div>
  </div>

  <div class="instructions">
    <strong>Instructions:</strong> ${escapeHtml(exam.instructions)}
  </div>

  ${sectionsHTML}

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
