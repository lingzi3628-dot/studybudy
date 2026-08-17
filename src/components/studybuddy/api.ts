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
  getReviewQueue: async () => {
    const r = await fetch("/api/review/queue");
    if (!r.ok) await err(r);
    return r.json() as Promise<{ cards: Card[] }>;
  },

  // progress
  getProgress: async () => {
    const r = await fetch("/api/progress");
    if (!r.ok) await err(r);
    return r.json() as Promise<Progress>;
  },
};
