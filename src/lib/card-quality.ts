type Flashcard = { front: string; back: string };
type Mcq = { question: string; options: string[]; correct_index: number; explanation?: string };

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

function normalize(value: string): string {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function isPlaceholder(value: string): boolean {
  return /^(question or term|answer or definition|question text|answer text|your question|your answer|n\/a|none|undefined|null)$/i.test(value);
}

/** Reject empty, placeholder, self-answering, and duplicate flashcards before preview/save. */
export function cleanGeneratedFlashcards(input: unknown): { cards: Flashcard[]; rejected: number } {
  const cards: Flashcard[] = [];
  const seen = new Set<string>();
  const rows = Array.isArray(input) ? input : [];

  for (const row of rows) {
    const front = cleanText(row?.front, 300);
    const back = cleanText(row?.back, 1200);
    const key = normalize(front);
    if (
      front.length < 2 || back.length < 2 || isPlaceholder(front) || isPlaceholder(back) ||
      normalize(front) === normalize(back) || !key || seen.has(key)
    ) continue;
    seen.add(key);
    cards.push({ front, back });
  }

  return { cards, rejected: rows.length - cards.length };
}

/** Keep malformed and duplicate options from becoming broken quiz cards. */
export function cleanGeneratedMcqs(input: unknown): { cards: Mcq[]; rejected: number } {
  const cards: Mcq[] = [];
  const seen = new Set<string>();
  const rows = Array.isArray(input) ? input : [];

  for (const row of rows) {
    const question = cleanText(row?.question, 600);
    const options = Array.isArray(row?.options) ? row.options.map((v: unknown) => cleanText(v, 400)) : [];
    const correctIndex = Number(row?.correct_index);
    const explanation = cleanText(row?.explanation, 1200);
    const key = normalize(question);
    if (
      question.length < 5 || isPlaceholder(question) || options.length !== 4 ||
      options.some((option: string) => option.length < 1 || isPlaceholder(option)) ||
      new Set(options.map(normalize)).size !== 4 || !Number.isInteger(correctIndex) ||
      correctIndex < 0 || correctIndex > 3 || seen.has(key)
    ) continue;
    seen.add(key);
    cards.push({ question, options, correct_index: correctIndex, explanation });
  }

  return { cards, rejected: rows.length - cards.length };
}
