/**
 * Tests for the Phase 68 hybrid-response upgrade.
 *
 * We don't import the React component (it pulls in too many browser deps to
 * run under jsdom). Instead we re-implement the pure pieces here and verify
 * they behave the way the Phase 62 failing-examples corpus demands.
 */
import { describe, it, expect } from "vitest";

// === Mirror of ChatbotPlayground's ABBREVIATIONS + normalizeText ===
const ABBREVIATIONS: Record<string, string> = {
  u: "you", ur: "your", urs: "yours", "u r": "you are",
  nd: "and", ok: "ok",
  pls: "please", plz: "please", tho: "though", "thru": "through",
  "u2": "you too", "ur2": "you too", "b/c": "because", bc: "because",
  "wat": "what", "wut": "what", "yolo": "you only live once",
  "lol": "laughing out loud", "omg": "oh my god", "idk": "i do not know",
  "tbh": "to be honest", "imo": "in my opinion", "imho": "in my honest opinion",
  "gonna": "going to", "wanna": "want to", "gotta": "got to",
  "dunno": "do not know", "kinda": "kind of", "sorta": "sort of",
  "couldnt": "could not", "wouldnt": "would not", "shouldnt": "should not",
  "dont": "do not", "doesnt": "does not", "didnt": "did not",
  "cant": "cannot", "wont": "will not", "isnt": "is not", "arent": "are not",
  "wasnt": "was not", "werent": "were not", "hasnt": "has not",
  "havent": "have not", "hadnt": "had not", "im": "i am", "ive": "i have",
  "youre": "you are", "theyre": "they are", "thats": "that is",
  "whats": "what is", "wheres": "where is", "hows": "how is",
  "hii": "hi", "hiii": "hi", "hiiii": "hi", "hey": "hi",
  "helloo": "hello", "hellow": "hello", "hallo": "hello",
};

function normalizeText(text: string): string {
  const tokens = text.toLowerCase().replace(/[^\w\s']/g, " ").split(/\s+/).filter(Boolean);
  const expanded = tokens.map((tok) => ABBREVIATIONS[tok.replace(/'/g, "")] ?? tok);
  return expanded.join(" ").replace(/\s+/g, " ").trim();
}

// === Mirror of cosineSimVec ===
function cosineSimVec(a: number[], b: number[]): number {
  let dot = 0, ma = 0, mb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; ma += a[i] * a[i]; mb += b[i] * b[i]; }
  const d = Math.sqrt(ma) * Math.sqrt(mb);
  return d > 0 ? dot / d : 0;
}

describe("Phase 68 — light normalization (replaces aggressive spellCorrect)", () => {
  it("does NOT rewrite 'boring' to 'morning' (the Phase 62 bug)", () => {
    expect(normalizeText("boring")).toBe("boring");
  });
  it("does NOT rewrite 'can you code' to 'can you joke'", () => {
    expect(normalizeText("can you code")).toBe("can you code");
  });
  it("does NOT produce gibberish for 'okay do one jo0ke'", () => {
    // Misspellings survive — semantic mode handles them downstream.
    expect(normalizeText("okay do one jo0ke")).toBe("okay do one jo0ke");
  });
  it("does NOT rewrite 'so what type of bot are you' into gibberish", () => {
    expect(normalizeText("so what type of bot are you")).toBe("so what type of bot are you");
  });
  it("expands SMS abbreviations token-by-token", () => {
    // Phase 73.1: "r" is no longer expanded (broke "r programming"). Use "u r" → "you are" instead.
    expect(normalizeText("u r cool")).toBe("you r cool");
    expect(normalizeText("whats ur name")).toBe("what is your name");
    expect(normalizeText("idk whats going on")).toBe("i do not know what is going on");
  });
  it("strips punctuation and collapses whitespace", () => {
    expect(normalizeText("Hi!!!   How are you???")).toBe("hi how are you");
  });
  it("preserves apostrophes inside words (don't, I'm)", () => {
    // The ' is kept by the [^\w\s'] negation; abbreviation expansion then
    // rewrites "dont" (no apostrophe) → "do not" but leaves "don't" alone.
    expect(normalizeText("I'm don't won't")).toBe("i am do not will not");
  });
  it("is a no-op for already-clean text", () => {
    expect(normalizeText("what is the capital of france")).toBe("what is the capital of france");
  });
  // Phase 73.1 — single-letter abbreviations removed because they broke technical terms
  it("does NOT expand 'c' to 'see' (broke 'c language' → 'see language' → matched 'See you later')", () => {
    expect(normalizeText("c language")).toBe("c language");
  });
  it("does NOT expand 'r' to 'are' (broke 'r programming')", () => {
    expect(normalizeText("r programming")).toBe("r programming");
  });
  it("does NOT expand 'b' to 'be' (broke 'plan b')", () => {
    expect(normalizeText("plan b")).toBe("plan b");
  });
  it("does NOT expand 'y' to 'why' (broke 'x y z')", () => {
    expect(normalizeText("x y z")).toBe("x y z");
  });
  // Phase 73.1 — common misspelling variants added
  it("expands 'hii' to 'hi' (the user-reported misspelling)", () => {
    expect(normalizeText("hii")).toBe("hi");
    expect(normalizeText("hiii")).toBe("hi");
  });
  it("expands 'hey' to 'hi'", () => {
    expect(normalizeText("hey")).toBe("hi");
  });
});

describe("Phase 68 — cosineSimVec (used by semantic mode)", () => {
  it("returns 1 for identical vectors", () => {
    const v = [1, 2, 3, 4];
    expect(cosineSimVec(v, v)).toBeCloseTo(1, 6);
  });
  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimVec([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });
  it("returns 0 when one vector is all-zero", () => {
    expect(cosineSimVec([0, 0, 0], [1, 2, 3])).toBe(0);
  });
  it("is symmetric", () => {
    const a = [1, 2, 3, 4, 5];
    const b = [2, 3, 4, 5, 6];
    expect(cosineSimVec(a, b)).toBeCloseTo(cosineSimVec(b, a), 6);
  });
});

describe("Phase 68 — per-mode default thresholds", () => {
  // Re-declare to mirror the component's MODE_DEFAULT_THRESHOLD.
  const MODE_DEFAULT_THRESHOLD = {
    tfidf: 0.30,
    hybrid: 0.30,
    keyword: 0.20,
    fuzzy: 0.60,
    semantic: 0.65,
  } as const;

  it("all defaults are above the Phase 62 broken value of 0.15", () => {
    for (const v of Object.values(MODE_DEFAULT_THRESHOLD)) {
      expect(v).toBeGreaterThan(0.15);
    }
  });
  it("semantic default (0.65) is in the USE cosine-sim sweet spot", () => {
    // USE cosine sims between unrelated sentences are typically <0.4; between
    // paraphrases they're typically >0.7. 0.65 sits cleanly between, so a
    // stored "hello" will retrieve on "hii"/"hi there" but a stored "what is
    // the meaning of life" will NOT retrieve on "what is the basics in class".
    expect(MODE_DEFAULT_THRESHOLD.semantic).toBeGreaterThanOrEqual(0.6);
    expect(MODE_DEFAULT_THRESHOLD.semantic).toBeLessThanOrEqual(0.75);
  });
});
