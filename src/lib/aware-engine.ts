/**
 * Aware Engine — Phase 22e
 *
 * Adapts how the AI teaches based on the student's grade level:
 *   - Grade 1-3: Very simple language, short sentences, lots of examples,
 *     uses analogies a child can understand, parent-assist prompts
 *   - Grade 4-6: Simple language with some technical terms introduced
 *   - Form 1-2: Intermediate, more detail, exam-focused
 *   - Form 3-4: Advanced, full technical vocabulary, exam prep
 *
 * The engine generates a "teaching profile" that gets injected into the
 * AI's system prompt so it knows HOW to teach this specific student.
 *
 * Also includes:
 *   - Parent-assist mode for young grades (sends parent prompts to help)
 *   - Pop-up lesson/quiz recommendations based on progress
 *   - Break timer logic (25 min study → 5 min break)
 */

export type GradeLevel = "early_childhood" | "lower_primary" | "upper_primary" | "lower_secondary" | "upper_secondary";

export type TeachingProfile = {
  level: GradeLevel;
  levelLabel: string;
  maxSentenceLength: number;     // words
  vocabularyLevel: string;       // 'very_simple' | 'simple' | 'intermediate' | 'advanced'
  useAnalogies: boolean;          // use child-friendly analogies
  useParentAssist: boolean;       // show parent prompts
  studySessionMin: number;        // max study session length
  breakMin: number;               // break length
  popUpQuizInterval: number;     // minutes between pop-up quizzes
  explanationDepth: string;       // 'brief' | 'moderate' | 'detailed'
  systemPromptSuffix: string;    // appended to AI system prompt
  parentPrompts: string[];       // prompts shown to parent for young grades
};

/**
 * Classifies a grade name into a level.
 */
export function classifyGrade(gradeName: string): GradeLevel {
  const g = gradeName.toLowerCase();
  if (/kindergarten|pp1|pp2|grade 1|grade 2|grade 3/.test(g)) {
    return "early_childhood";
  }
  if (/grade 4|grade 5|grade 6/.test(g)) {
    return "lower_primary";
  }
  if (/grade 7|grade 8/.test(g)) {
    return "upper_primary";
  }
  if (/form 1|form 2/.test(g)) {
    return "lower_secondary";
  }
  return "upper_secondary"; // Form 3-4, university, etc.
}

/**
 * Builds a teaching profile for a student based on their grade.
 */
export function buildTeachingProfile(gradeName: string): TeachingProfile {
  const level = classifyGrade(gradeName);

  switch (level) {
    case "early_childhood":
      return {
        level,
        levelLabel: "Early Childhood (Grade 1-3)",
        maxSentenceLength: 8,
        vocabularyLevel: "very_simple",
        useAnalogies: true,
        useParentAssist: true,
        studySessionMin: 25,
        breakMin: 5,
        popUpQuizInterval: 10,
        explanationDepth: "brief",
        systemPromptSuffix: `
CRITICAL — TEACHING A YOUNG CHILD (Grade 1-3):
- Use VERY simple words. Short sentences (max 8 words).
- Use lots of pictures, colors, and animals in examples.
- Use analogies: "A line is like a piece of string pulled tight."
- Encourage constantly: "Great job!", "You can do it!", "Well done!"
- Never use big words without explaining them.
- If the child seems confused, simplify even more.
- Ask the parent to help: "Parent, can you show your child a straight line in the room?"
- Keep lessons under 5 minutes of reading.
- Use songs, rhymes, and games where possible.
- Always end with: "You did great today! See you tomorrow!"`,
        parentPrompts: [
          "Sit with your child and read the lesson together.",
          "Help your child find examples in your home (e.g. 'Can you see a straight line?').",
          "Praise your child after each correct answer.",
          "Take a break every 25 minutes — let them play for 5 minutes.",
          "If your child is tired, stop and come back tomorrow.",
        ],
      };

    case "lower_primary":
      return {
        level,
        levelLabel: "Lower Primary (Grade 4-6)",
        maxSentenceLength: 12,
        vocabularyLevel: "simple",
        useAnalogies: true,
        useParentAssist: false,
        studySessionMin: 30,
        breakMin: 5,
        popUpQuizInterval: 15,
        explanationDepth: "moderate",
        systemPromptSuffix: `
TEACHING A LOWER PRIMARY STUDENT (Grade 4-6):
- Use simple words. Short sentences (max 12 words).
- Use examples from daily life.
- Introduce new words gently and explain them.
- Be encouraging: "Good try!", "Almost there!", "You're getting it!"
- Keep lessons under 10 minutes of reading.
- Use numbered steps for activities.
- Ask check-in questions: "Do you understand? Let's try one together."`,
        parentPrompts: [],
      };

    case "upper_primary":
      return {
        level,
        levelLabel: "Upper Primary (Grade 7-8)",
        maxSentenceLength: 15,
        vocabularyLevel: "intermediate",
        useAnalogies: false,
        useParentAssist: false,
        studySessionMin: 35,
        breakMin: 5,
        popUpQuizInterval: 20,
        explanationDepth: "moderate",
        systemPromptSuffix: `
TEACHING AN UPPER PRIMARY STUDENT (Grade 7-8):
- Use clear, intermediate language.
- Introduce subject-specific vocabulary.
- Be encouraging but not childish.
- Connect topics to real-world applications.
- Keep lessons focused and structured.`,
        parentPrompts: [],
      };

    case "lower_secondary":
      return {
        level,
        levelLabel: "Lower Secondary (Form 1-2)",
        maxSentenceLength: 20,
        vocabularyLevel: "intermediate",
        useAnalogies: false,
        useParentAssist: false,
        studySessionMin: 40,
        breakMin: 5,
        popUpQuizInterval: 25,
        explanationDepth: "detailed",
        systemPromptSuffix: `
TEACHING A LOWER SECONDARY STUDENT (Form 1-2):
- Use intermediate to advanced language.
- Introduce exam-style vocabulary.
- Be direct and structured.
- Connect to KCSE exam expectations.
- Provide detailed explanations with examples.`,
        parentPrompts: [],
      };

    case "upper_secondary":
      return {
        level,
        levelLabel: "Upper Secondary (Form 3-4)",
        maxSentenceLength: 25,
        vocabularyLevel: "advanced",
        useAnalogies: false,
        useParentAssist: false,
        studySessionMin: 45,
        breakMin: 10,
        popUpQuizInterval: 30,
        explanationDepth: "detailed",
        systemPromptSuffix: `
TEACHING AN UPPER SECONDARY STUDENT (Form 3-4):
- Use full advanced language and technical vocabulary.
- Focus on KCSE exam preparation.
- Provide detailed, comprehensive explanations.
- Include past-paper style questions.
- Be direct and exam-focused.`,
        parentPrompts: [],
      };
  }
}

/**
 * Generates a pop-up recommendation based on the student's current state.
 * Used by the study room to pop up mini-lessons, quizzes, or breaks.
 */
export type PopUpRecommendation = {
  type: "break" | "mini_quiz" | "flashcard_review" | "summary" | "encouragement";
  title: string;
  body: string;
  action?: string; // button label
};

export function generatePopUp(
  profile: TeachingProfile,
  minutesStudied: number,
  topicsCompleted: number
): PopUpRecommendation | null {
  // Break time
  if (minutesStudied >= profile.studySessionMin) {
    return {
      type: "break",
      title: profile.level === "early_childhood" ? "🎮 Play time!" : "☕ Break time!",
      body: profile.level === "early_childhood"
        ? "You've been learning for a while! Let's take a 5-minute break. Go play, stretch, or get a snack!"
        : `You've studied for ${profile.studySessionMin} minutes. Take a ${profile.breakMin}-minute break to rest your brain.`,
      action: "Take a break",
    };
  }

  // Pop-up quiz (every N minutes)
  if (minutesStudied > 0 && minutesStudied % profile.popUpQuizInterval === 0) {
    return {
      type: "mini_quiz",
      title: "⚡ Quick check!",
      body: profile.level === "early_childhood"
        ? "Let's see what you remember! Can you answer a quick question?"
        : "Quick pop quiz — let's see what you've learned so far!",
      action: "Take quick quiz",
    };
  }

  // Encouragement after completing a topic
  if (topicsCompleted > 0 && topicsCompleted % 3 === 0) {
    return {
      type: "encouragement",
      title: "🌟 Amazing!",
      body: profile.level === "early_childhood"
        ? "You've completed 3 topics! You're so smart! Keep going!"
        : `You've completed ${topicsCompleted} topics! Great progress — you're building real knowledge.`,
      action: "Continue",
    };
  }

  return null;
}

/**
 * Simplifies a text for young grades.
 * Used when rendering curriculum content for Grade 1-3 students.
 */
export function simplifyText(text: string, profile: TeachingProfile): string {
  if (profile.level !== "early_childhood" && profile.level !== "lower_primary") {
    return text; // no simplification needed for older grades
  }

  // Split into sentences and shorten/ simplify
  const sentences = text.split(/(?<=[.!?])\s+/);
  const simplified = sentences.map((s) => {
    const words = s.split(/\s+/);
    if (words.length > profile.maxSentenceLength) {
      // Take the first N words + add a period
      return words.slice(0, profile.maxSentenceLength).join(" ") + ".";
    }
    return s;
  });

  return simplified.join(" ");
}
