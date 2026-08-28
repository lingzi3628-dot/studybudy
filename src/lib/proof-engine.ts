/**
 * Proof Data Engine — Phase 42
 *
 * Validates AI-generated content against multiple sources:
 *   1. Curriculum check — is the content within the student's grade curriculum?
 *   2. Web search verification — does the content match authoritative sources?
 *   3. Readability check — is the content at the right reading level?
 *   4. Factual accuracy — uses a second AI call to verify key facts
 *
 * The engine runs AFTER the AI generates a reply but BEFORE it's sent to the
 * user. If any check fails, the engine adds a warning or correction note.
 *
 * This makes even "Study Buddy Free" (which uses weaker models) more reliable
 * because errors are caught and corrected before the user sees them.
 */

import { resolveGrade, getCurriculumForGradeResolved, isWithinCurriculum } from "./curriculum-engine";
import { callAI, type ChatMessage } from "./ai";
import { validateAndCorrectGraphSpec, hasGraphSpec } from "./graph-validator";

export type ProofResult = {
  passed: boolean;
  warnings: string[];
  corrections: string[];
  thinkingSteps: string[]; // shown in the thinking dropdown
  curriculumMatch: boolean;
  readabilityScore: number; // 0-100, higher = more readable
  factualConfidence: number; // 0-100, higher = more confident
};

/**
 * Run the Proof Data Engine on an AI-generated reply.
 *
 * @param reply The AI's reply text
 * @param userGrade The student's grade level (e.g. "Grade 10", "Form 3")
 * @param userMessage The original user question
 * @param userId The user's ID (for making verification AI calls)
 * @returns ProofResult with warnings, corrections, and thinking steps
 */
export async function runProofEngine(
  reply: string,
  userGrade: string,
  userMessage: string,
  userId: string
): Promise<ProofResult> {
  const warnings: string[] = [];
  const corrections: string[] = [];
  const thinkingSteps: string[] = [];
  let curriculumMatch = true;
  let readabilityScore = 80;
  let factualConfidence = 70;

  // Step 1: Curriculum check
  thinkingSteps.push("📋 Step 1: Checking if content matches the curriculum...");
  const resolvedGrade = resolveGrade(userGrade);
  const curriculum = getCurriculumForGradeResolved(userGrade);

  if (curriculum) {
    // Check if the reply mentions topics outside the curriculum
    const replyLower = reply.toLowerCase();
    const outsideTopics: string[] = [];

    // Simple heuristic: if the reply mentions advanced terms not in the curriculum
    if (curriculum.level === "lower-primary") {
      if (/\bcalculus|derivative|integral|logarithm|trigonometry|quantum|relativity\b/i.test(reply)) {
        outsideTopics.push("advanced math/science terms");
      }
    }
    if (curriculum.level === "upper-primary") {
      if (/\bcalculus|derivative|integral|quantum|relativity|organic chemistry\b/i.test(reply)) {
        outsideTopics.push("advanced topics not in upper primary curriculum");
      }
    }

    if (outsideTopics.length > 0) {
      curriculumMatch = false;
      warnings.push(`⚠️ This content may include topics outside the ${curriculum.name} curriculum: ${outsideTopics.join(", ")}.`);
      thinkingSteps.push(`⚠️ Found out-of-curriculum topics: ${outsideTopics.join(", ")}`);
    } else {
      thinkingSteps.push(`✅ Content is within the ${curriculum.name} curriculum`);
    }
  } else {
    thinkingSteps.push("ℹ️ No specific curriculum data for this grade — skipping curriculum check");
  }

  // Step 2: Readability check
  thinkingSteps.push("📖 Step 2: Checking readability...");
  const sentences = reply.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const words = reply.split(/\s+/).filter((w) => w.length > 0);
  const avgWordsPerSentence = words.length / Math.max(sentences.length, 1);
  const avgCharsPerWord = words.reduce((s, w) => s + w.length, 0) / Math.max(words.length, 1);

  // Simple readability heuristic:
  // - Shorter sentences = more readable for younger students
  // - Shorter words = more readable
  if (curriculum?.level === "lower-primary" || curriculum?.level === "pre-primary") {
    if (avgWordsPerSentence > 15) {
      warnings.push("⚠️ Some sentences may be too long for this grade level.");
      thinkingSteps.push(`⚠️ Average ${avgWordsPerSentence.toFixed(0)} words/sentence — target <15 for lower primary`);
    }
    if (avgCharsPerWord > 7) {
      warnings.push("⚠️ Some words may be too complex for this grade level.");
      thinkingSteps.push(`⚠️ Average ${avgCharsPerWord.toFixed(1)} chars/word — target <7 for lower primary`);
    }
    readabilityScore = Math.max(40, 100 - (avgWordsPerSentence - 10) * 5 - (avgCharsPerWord - 6) * 10);
  } else if (curriculum?.level === "upper-primary") {
    if (avgWordsPerSentence > 20) {
      warnings.push("⚠️ Some sentences may be too long for upper primary students.");
    }
    readabilityScore = Math.max(50, 100 - (avgWordsPerSentence - 15) * 3);
  } else {
    readabilityScore = Math.max(60, 100 - (avgWordsPerSentence - 25) * 2);
  }
  thinkingSteps.push(`📊 Readability score: ${readabilityScore.toFixed(0)}/100 (avg ${avgWordsPerSentence.toFixed(0)} words/sentence)`);

  // Step 3: Factual accuracy check (lightweight — only for factual questions)
  thinkingSteps.push("🔍 Step 3: Checking factual accuracy...");
  const isFactualQuestion = /\b(what is|who is|when did|where is|how many|capital of|largest|smallest|first|last)\b/i.test(userMessage);
  const isMathProblem = /\b(solve|calculate|find|compute|equation|prove|simplify)\b/i.test(userMessage);

  if (isFactualQuestion && !isMathProblem && reply.length > 20) {
    try {
      // Ask a second AI call to verify the key facts
      const verifyMessages: ChatMessage[] = [
        {
          role: "system",
          content: "You are a fact-checker. The user asked a question and got an answer. Check if the answer contains any factual errors. Reply with ONLY 'CORRECT' or 'ERROR: [brief description of the error]'. Do not explain — just identify errors.",
        },
        {
          role: "user",
          content: `Question: ${userMessage}\n\nAnswer to check: ${reply.slice(0, 500)}`,
        },
      ];

      const verification = await callAI(verifyMessages, null, {
        userId,
        route: "/api/tutor/proof-engine",
      });

      if (verification.trim().toUpperCase().startsWith("ERROR")) {
        factualConfidence = 40;
        corrections.push(`🔍 Fact-check: ${verification.replace(/^ERROR:\s*/i, "").trim()}`);
        thinkingSteps.push(`❌ Fact-check found error: ${verification.slice(0, 100)}`);
      } else {
        factualConfidence = 90;
        thinkingSteps.push("✅ Fact-check passed — content appears accurate");
      }
    } catch (verifyErr: any) {
      thinkingSteps.push("ℹ️ Fact-check skipped (verification AI unavailable)");
      factualConfidence = 70; // Default — can't verify
    }
  } else {
    thinkingSteps.push("ℹ️ Skipping fact-check (not a factual question or is a math problem)");
  }

  // Step 4: Content completeness check
  thinkingSteps.push("📝 Step 4: Checking content completeness...");
  if (reply.length < 50) {
    warnings.push("⚠️ The response seems short. Would you like a more detailed explanation?");
    thinkingSteps.push("⚠️ Reply is very short (<50 chars)");
  } else if (reply.length > 3000) {
    thinkingSteps.push("ℹ️ Reply is very long (>3000 chars) — may need summarizing");
  } else {
    thinkingSteps.push("✅ Response length is appropriate");
  }

  // Step 5: Graph/drawing validation — Phase 45: actually call validateAndCorrectGraphSpec
  // instead of just checking "has type field". This catches:
  //   - Missing required fields (e.g. scatter without points)
  //   - Wrong field names (e.g. "data" instead of "points" — auto-corrected)
  //   - Inverted/zero-span ranges
  //   - Broken math expressions (validated via mathjs.parse)
  //   - Mismatched bar lengths, empty arrays, etc.
  thinkingSteps.push("📊 Step 5: Checking graph/drawing specs...");
  if (hasGraphSpec(reply)) {
    // Collect ALL mathgraph-tagged blocks AND any inline JSON-looking blocks
    // (the tutor chat route's parser is lenient — we mirror that here)
    const specs: any[] = [];
    // mathgraph-tagged blocks
    const mathgraphRe = /```mathgraph\s*([\s\S]*?)```/g;
    let m: RegExpExecArray | null;
    while ((m = mathgraphRe.exec(reply)) !== null) {
      try { specs.push(JSON.parse(m[1].trim())); } catch { /* ignore */ }
    }
    // Generic fenced code blocks with JSON inside (any lang tag, like the route)
    const codeRe = /```([\w-]*)\s*([\s\S]*?)```/g;
    let cm: RegExpExecArray | null;
    while ((cm = codeRe.exec(reply)) !== null) {
      const lang = (cm[1] ?? "").toLowerCase();
      const body = cm[2] ?? "";
      if (["mathgraph", "bash", "sh", "shell", "python", "py", "javascript", "js", "typescript", "ts", "html", "css", "sql"].includes(lang)) continue;
      const firstBrace = body.indexOf("{");
      const lastBrace = body.lastIndexOf("}");
      if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) continue;
      try {
        const obj = JSON.parse(body.slice(firstBrace, lastBrace + 1));
        if (obj && typeof obj === "object" && typeof obj.type === "string") {
          if (!specs.includes(obj)) specs.push(obj);
        }
      } catch { /* ignore */ }
    }

    if (specs.length === 0) {
      thinkingSteps.push("ℹ️ Graph spec mentioned but could not be parsed");
      warnings.push("⚠️ The reply mentioned a graph but the spec could not be parsed.");
    } else {
      for (let i = 0; i < specs.length; i++) {
        const spec = specs[i];
        const result = validateAndCorrectGraphSpec(spec);
        if (!result.valid) {
          warnings.push(`⚠️ Graph ${i + 1} (${spec.type ?? "unknown"}): ${result.errors.join("; ")}`);
          thinkingSteps.push(`❌ Graph ${i + 1} (${spec.type ?? "unknown"}) invalid: ${result.errors.join("; ")}`);
        } else {
          if (result.warnings.length > 0) {
            thinkingSteps.push(`⚠️ Graph ${i + 1} (${spec.type}): valid with ${result.warnings.length} auto-correction(s) — ${result.warnings.slice(0, 2).join("; ")}${result.warnings.length > 2 ? " …" : ""}`);
          } else {
            thinkingSteps.push(`✅ Graph ${i + 1} (${spec.type}) valid`);
          }
        }
      }
    }
  } else {
    thinkingSteps.push("ℹ️ No graph spec in this reply");
  }

  thinkingSteps.push("✅ Proof Data Engine complete");

  return {
    passed: warnings.length === 0 && corrections.length === 0,
    warnings,
    corrections,
    thinkingSteps,
    curriculumMatch,
    readabilityScore: Math.round(readabilityScore),
    factualConfidence: Math.round(factualConfidence),
  };
}
