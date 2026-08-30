/**
 * Frontend API client. All fetch helpers live here.
 */

export type Card = {
  id: string;
  setId: string;
  cardType: "flashcard" | "mcq";
  front: string | null;
  back: string | null;
  question: string | null;
  options: string[] | null;
  correctIndex: number | null;
  explanation: string | null;
  subject: string | null;
  topic: string | null;
  createdAt: string;
};

export type StudySet = {
  id: string;
  title: string;
  sourceType: string;
  sourceText?: string;
  subject: string | null;
  topic: string | null;
  createdAt: string;
  cards?: Card[];
};

export type StudySetSummary = {
  id: string;
  title: string;
  sourceType: string;
  subject: string | null;
  topic: string | null;
  createdAt: string;
  cardCount: number;
};

export type Progress = {
  user: { name: string | null; email: string | null; plan: "free" | "pro" };
  xp: number;
  level: number;
  streak: number;
  dueCount: number;
  mastery: {
    subject: string;
    mastery: number;
    topics: {
      topic: string;
      mastery: number;
      totalAttempts: number;
      correctAttempts: number;
    }[];
  }[];
  weakAreas: {
    subject: string;
    topic: string;
    mastery: number;
    totalAttempts: number;
    correctAttempts: number;
  }[];
  recentAttempts: {
    id: string;
    cardId: string;
    isCorrect: boolean | null;
    selectedIndex: number | null;
    createdAt: string;
    card: {
      subject: string | null;
      topic: string | null;
      front: string | null;
      question: string | null;
    };
  }[];
  badges: { label: string; icon: string; earned: boolean }[];
  totalAttempts: number;
  correctAttempts: number;
};

export type SearchResult = {
  query: string;
  summary: string;
  keyPoints: string[];
  relatedTopics: string[];
  sampleQuestion: {
    question: string;
    options: string[];
    correct_index: number;
    explanation: string;
  } | null;
  tokenBalance?: number;
  remaining?: number | null;
};

export type GraphResult = {
  equation: string;
  type: string;
  slope: number | null;
  yIntercept: number | null;
  vertex: { x: number; y: number } | null;
  samplePoints: { x: number; y: number }[];
  explanation: string;
};

export type Translation = {
  original: string;
  targetLanguage: string;
  translation: string;
  pronunciation: string;
};

export type LearningPath = {
  id: string;
  skill: string;
  level: string;
  goal: string | null;
  roadmap: { weeks?: any[] };
  lessons: {
    id: string;
    title: string;
    content: string | null;
    orderIndex: number;
    completed: boolean;
  }[];
};

async function err(res: Response) {
  const txt = await res.text();
  let msg: string;
  try {
    const j = JSON.parse(txt);
    msg = j.error || j.detail || JSON.stringify(j);
  } catch {
    msg = txt;
  }
  throw new Error(`${res.status}: ${msg}`);
}

export const api = {
  // user
  getUser: async () => {
    const r = await fetch("/api/user");
    if (!r.ok) await err(r);
    return r.json() as Promise<{ user: { id: string; email: string | null; name: string | null; plan: "free" | "pro"; grade: string | null; subjects: string[]; ambitions: string[]; learningLanguage: string } }>;
  },
  updateUser: async (body: {
    name?: string;
    grade?: string;
    track?: string;  // Phase 51 — education track (k12 | dev | data | ml | tvet | mixed)
    subjects?: string[];
    ambitions?: string[];
    learningLanguage?: string;
  }) => {
    const r = await fetch("/api/user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) await err(r);
    return r.json();
  },

  // api key
  setApiKey: async (apiKey: string, baseUrl?: string, model?: string) => {
    const r = await fetch("/api/settings/api-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey, baseUrl, model }),
    });
    if (!r.ok) await err(r);
    return r.json();
  },
  clearApiKey: async () => {
    const r = await fetch("/api/settings/api-key", { method: "DELETE" });
    if (!r.ok) await err(r);
    return r.json();
  },
  hasApiKey: async () => {
    const r = await fetch("/api/settings/api-key");
    if (!r.ok) await err(r);
    return r.json() as Promise<{ hasKey: boolean }>;
  },

  // study sets
  listStudySets: async () => {
    const r = await fetch("/api/study-sets");
    if (!r.ok) await err(r);
    return r.json() as Promise<{ sets: StudySetSummary[] }>;
  },
  getStudySet: async (id: string) => {
    const r = await fetch(`/api/study-sets/${id}`);
    if (!r.ok) await err(r);
    return r.json() as Promise<{ studySet: StudySet & { cards: (Card & { review: any })[] } }>;
  },
  createStudySet: async (body: {
    title: string;
    sourceType?: string;
    sourceText: string;
    subject?: string;
    topic?: string;
    generate?: boolean;
    numFlashcards?: number;
    numMCQs?: number;
    cards?: Array<{
      cardType: "flashcard" | "mcq";
      front?: string | null;
      back?: string | null;
      question?: string | null;
      options?: string[] | null;
      correctIndex?: number | null;
      explanation?: string | null;
    }>;
  }) => {
    const r = await fetch("/api/study-sets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) await err(r);
    return r.json() as Promise<{ studySet: StudySet & { cards: Card[] } }>;
  },
  uploadStudySet: async (formData: FormData) => {
    const r = await fetch("/api/study-sets", {
      method: "POST",
      body: formData,
    });
    if (!r.ok) await err(r);
    return r.json() as Promise<{ studySet: StudySet & { cards: Card[] } }>;
  },
  deleteStudySet: async (id: string) => {
    const r = await fetch(`/api/study-sets/${id}`, { method: "DELETE" });
    if (!r.ok) await err(r);
    return r.json();
  },

  // generate
  generateCards: async (body: {
    text: string;
    numFlashcards?: number;
    numMCQs?: number;
    subject?: string;
    topic?: string;
  }) => {
    const r = await fetch("/api/generate/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) await err(r);
    return r.json() as Promise<{
      flashcards: { front: string; back: string }[];
      mcqs: {
        question: string;
        options: string[];
        correct_index: number;
        explanation: string;
      }[];
    }>;
  },
  generateLearningPath: async (body: { skill: string; level: string; goal?: string }) => {
    const r = await fetch("/api/generate/learning-path", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) await err(r);
    return r.json() as Promise<{ learningPath: LearningPath }>;
  },
  generateGraph: async (equation: string) => {
    const r = await fetch("/api/generate/graph", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ equation }),
    });
    if (!r.ok) await err(r);
    return r.json() as Promise<GraphResult>;
  },

  // search
  search: async (query: string) => {
    const r = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!r.ok) await err(r);
    return r.json() as Promise<SearchResult>;
  },

  // language
  translate: async (text: string, targetLanguage: string) => {
    const r = await fetch("/api/language/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, targetLanguage }),
    });
    if (!r.ok) await err(r);
    return r.json() as Promise<Translation>;
  },

  // attempts + reviews
  recordAttempt: async (body: {
    cardId: string;
    selectedIndex?: number | null;
    isCorrect: boolean;
    responseTimeMs?: number;
  }) => {
    const r = await fetch("/api/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) await err(r);
    return r.json();
  },
  submitReview: async (body: { cardId: string; quality: 0 | 5; selectedIndex?: number | null; responseTimeMs?: number }) => {
    const r = await fetch("/api/review/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) await err(r);
    return r.json();
  },
  getReviewQueue: async (opts?: { bias?: "weak"; topicId?: string; subject?: string; topic?: string; limit?: number }) => {
    const params = new URLSearchParams();
    if (opts?.bias) params.set("bias", opts.bias);
    if (opts?.topicId) params.set("topicId", opts.topicId);
    if (opts?.subject) params.set("subject", opts.subject);
    if (opts?.topic) params.set("topic", opts.topic);
    if (opts?.limit) params.set("limit", String(opts.limit));
    const qs = params.toString();
    const r = await fetch(`/api/review/queue${qs ? `?${qs}` : ""}`);
    if (!r.ok) await err(r);
    return r.json() as Promise<{ cards: Card[] }>;
  },
  // Phase 45: convenience — returns due cards biased to weak topics + the weak topics
  // themselves in a single call. Saves Home from issuing two requests.
  getRecommended: async () => {
    const r = await fetch("/api/review/recommended");
    if (!r.ok) await err(r);
    return r.json() as Promise<{
      cards: Card[];
      weakTopics: Array<{ subject: string; topic: string; mastery: number; dueCardCount: number; totalAttempts: number; correctAttempts: number }>;
    }>;
  },

  // progress
  getProgress: async () => {
    const r = await fetch("/api/progress");
    if (!r.ok) await err(r);
    return r.json() as Promise<Progress>;
  },

  // extract text from uploaded file
  extractFile: async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/extract/file", { method: "POST", body: fd });
    if (!r.ok) await err(r);
    return r.json() as Promise<{
      text: string;
      filename: string;
      fileSize: number;
      mimeType: string;
    }>;
  },

  // AI tutor chat — local history, no DB
  askTutor: async (messages: { role: "user" | "assistant"; content: string }[], question?: string) => {
    const r = await fetch("/api/tutor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, question }),
    });
    if (!r.ok) await err(r);
    return r.json() as Promise<{ reply: string; role: "assistant"; remaining: number }>;
  },

  // save graph + optional cards as study set
  saveGraphAsStudySet: async (body: {
    equation: string;
    explanation?: string;
    subject?: string;
    topic?: string;
    cards?: Array<{
      cardType: "flashcard" | "mcq";
      front?: string | null;
      back?: string | null;
      question?: string | null;
      options?: string[] | null;
      correctIndex?: number | null;
      explanation?: string | null;
    }>;
  }) => {
    const r = await fetch("/api/study-sets/from-graph", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) await err(r);
    return r.json() as Promise<{ studySet: StudySet & { cards: Card[] } }>;
  },

  // ───── Study Room / Topic Deep Dive ─────

  // Upsert topic by (subject, name). Returns { topic: { id, subject, name, description } }.
  upsertTopic: async (body: { name: string; subject?: string; description?: string }) => {
    const r = await fetch("/api/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) await err(r);
    return r.json() as Promise<{
      topic: { id: string; subject: string; name: string; description: string | null; createdAt: string };
    }>;
  },

  // Get topic details: topic + cards + mastery + relatedTopics
  getTopic: async (id: string) => {
    const r = await fetch(`/api/topics/${id}`);
    if (!r.ok) await err(r);
    return r.json() as Promise<{
      topic: {
        id: string;
        subject: string;
        name: string;
        description: string | null;
        createdAt: string;
      };
      cards: Card[];
      mastery: { level: number; totalAttempts: number; correctAttempts: number; dueCount: number };
      relatedTopics: { id: string; subject: string; name: string; description: string | null }[];
    }>;
  },

  // Generate or fetch cached AI lesson for a topic
  getTopicLesson: async (id: string, body: { level?: "beginner" | "intermediate" | "advanced"; regenerate?: boolean }) => {
    const r = await fetch(`/api/topics/${id}/lesson`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) await err(r);
    return r.json() as Promise<{
      lesson: {
        introduction?: string;
        keyConcepts?: { title: string; explanation: string }[];
        examples?: { title: string; problem: string; steps: string[]; answer: string }[];
        formulas?: string[];
        summary?: string;
      };
      level: string;
      cached: boolean;
      remaining?: number;
    }>;
  },

  // Practice cards (due first, then unseen, then seen-not-due)
  getTopicPractice: async (id: string, limit = 20) => {
    const r = await fetch(`/api/topics/${id}/practice?limit=${limit}`);
    if (!r.ok) await err(r);
    return r.json() as Promise<{
      cards: Card[];
      dueCount: number;
      newCount: number;
      totalCards: number;
    }>;
  },

  // Topic-specific tutor chat
  askTopicTutor: async (
    id: string,
    body: { message: string; chatHistory?: { role: "user" | "assistant"; content: string }[] }
  ) => {
    const r = await fetch(`/api/topics/${id}/tutor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) await err(r);
    return r.json() as Promise<{ reply: string; role: "assistant"; remaining: number }>;
  },

  // Step-by-step math problem solver
  solveStepByStep: async (id: string, problem: string) => {
    const r = await fetch(`/api/topics/${id}/solver`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ problem }),
    });
    if (!r.ok) await err(r);
    return r.json() as Promise<{
      problem: string;
      steps: { explanation: string; expression: string }[];
      finalAnswer: string;
      check: string;
      remaining?: number;
    }>;
  },
};
