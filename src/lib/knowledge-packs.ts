/**
 * Knowledge Pack Catalog — Phase 73.2
 *
 * Curated collections of public-domain / openly-licensed content that users
 * can add to their bot's knowledge base with one click. Each pack specifies
 * a list of sources (Wikipedia article titles or URLs) that get fetched +
 * chunked + stored when the user clicks "Add".
 *
 * Packs are organized by category. Education packs are aligned with common
 * curriculum topics (KCSE/IGCSE/CBSE). Programming packs pull from official
 * docs. General-knowledge packs pull from Wikipedia.
 *
 * The catalog is a static array — no DB needed. Adding a pack creates a
 * BotKnowledgeSource via the /api/knowledge-sources/pack endpoint.
 */

export type KnowledgePack = {
  id: string;
  name: string;
  description: string;
  category: "education" | "programming" | "science" | "history" | "languages" | "general";
  icon: string;
  /** Sources: Wikipedia article titles (fetched via REST API) or full URLs. */
  sources: string[];
  /** Estimated total chars (for the UI badge). */
  estimatedChars: number;
};

export const KNOWLEDGE_PACKS: KnowledgePack[] = [
  // === Education — Science ===
  {
    id: "kcse-biology",
    name: "Biology Essentials",
    description: "Cell biology, genetics, evolution, ecology, human anatomy — Wikipedia articles aligned with secondary school biology.",
    category: "education",
    icon: "🧬",
    sources: [
      "Cell (biology)", "DNA", "Genetics", "Evolution", "Ecology",
      "Photosynthesis", "Cellular respiration", "Mitosis", "Meiosis",
      "Human digestive system", "Circulatory system", "Nervous system",
    ],
    estimatedChars: 60_000,
  },
  {
    id: "kcse-chemistry",
    name: "Chemistry Essentials",
    description: "Atomic structure, periodic table, chemical bonding, reactions, acids & bases, organic chemistry fundamentals.",
    category: "education",
    icon: "⚗️",
    sources: [
      "Atom", "Periodic table", "Chemical bond", "Chemical reaction",
      "Acid", "Base (chemistry)", "Organic chemistry", "Stoichiometry",
      "Oxidation-reduction", "Catalyst", "Mole (unit)", "pH",
    ],
    estimatedChars: 55_000,
  },
  {
    id: "kcse-physics",
    name: "Physics Essentials",
    description: "Mechanics, electricity, waves, thermodynamics, modern physics — core concepts for secondary school physics.",
    category: "education",
    icon: "🔭",
    sources: [
      "Classical mechanics", "Newton's laws of motion", "Energy",
      "Electricity", "Magnetism", "Electromagnetic wave",
      "Thermodynamics", "Wave", "Light", "Quantum mechanics",
      "Relativity", "Force",
    ],
    estimatedChars: 58_000,
  },
  {
    id: "kcse-mathematics",
    name: "Mathematics Essentials",
    description: "Algebra, geometry, calculus, statistics, trigonometry — foundational math concepts.",
    category: "education",
    icon: "📐",
    sources: [
      "Algebra", "Geometry", "Calculus", "Trigonometry", "Statistics",
      "Probability", "Linear equation", "Quadratic equation",
      "Pythagorean theorem", "Derivative", "Integral",
    ],
    estimatedChars: 50_000,
  },

  // === Education — Humanities ===
  {
    id: "world-history",
    name: "World History Overview",
    description: "Key events, civilizations, and periods from ancient to modern history.",
    category: "history",
    icon: "📜",
    sources: [
      "Ancient Egypt", "Roman Empire", "Middle Ages", "Renaissance",
      "Industrial Revolution", "World War I", "World War II",
      "Cold War", "Colonialism", "Independence movements",
      "French Revolution", "American Revolution",
    ],
    estimatedChars: 65_000,
  },
  {
    id: "african-history",
    name: "African History",
    description: "Pre-colonial civilizations, colonial era, independence movements, and post-colonial Africa.",
    category: "history",
    icon: "🌍",
    sources: [
      "Kingdom of Kush", "Mali Empire", "Songhai Empire",
      "Kingdom of Aksum", "Great Zimbabwe", "Scramble for Africa",
      "Decolonisation of Africa", "Pan-Africanism",
      "African Union", "Trans-Saharan trade",
    ],
    estimatedChars: 45_000,
  },
  {
    id: "world-geography",
    name: "World Geography",
    description: "Continents, countries, capitals, rivers, mountains, and climate zones.",
    category: "education",
    icon: "🗺️",
    sources: [
      "Continent", "Africa", "Asia", "Europe", "North America",
      "South America", "Oceania", "Antarctica",
      "Nile", "Amazon River", "Sahara", "Himalayas",
    ],
    estimatedChars: 40_000,
  },

  // === Programming ===
  {
    id: "python-basics",
    name: "Python Programming Basics",
    description: "Python syntax, data types, functions, loops, classes, and common patterns. Great for coding tutor bots.",
    category: "programming",
    icon: "🐍",
    sources: [
      "Python (programming language)", "Python syntax and semantics",
      "List (abstract data type)", "Dictionary (data structure)",
      "Function (computer programming)", "Class (computer programming)",
      "Loop (programming)", "Exception handling",
      "Module (programming)", "File handling",
    ],
    estimatedChars: 45_000,
  },
  {
    id: "javascript-basics",
    name: "JavaScript Programming Basics",
    description: "JS syntax, DOM, events, async/await, ES6+ features. For web development tutor bots.",
    category: "programming",
    icon: "💛",
    sources: [
      "JavaScript", "Document Object Model", "JSON",
      "Asynchronous JavaScript", "Promise (JavaScript)",
      "Arrow function", "React (JavaScript library)",
      "Node.js", "HTTP cookie", "Web API",
    ],
    estimatedChars: 42_000,
  },
  {
    id: "web-development",
    name: "Web Development Fundamentals",
    description: "HTML, CSS, HTTP, REST APIs, and web architecture concepts.",
    category: "programming",
    icon: "🌐",
    sources: [
      "HTML", "CSS", "HTTP", "Representational state transfer",
      "Web API", "Web server", "Frontend and backend",
      "SQL", "Database", "Authentication",
    ],
    estimatedChars: 38_000,
  },

  // === Science ===
  {
    id: "general-science",
    name: "General Science Facts",
    description: "Scientific method, key discoveries, famous scientists, and fundamental laws of nature.",
    category: "science",
    icon: "🔬",
    sources: [
      "Scientific method", "Theory", "Hypothesis",
      "Albert Einstein", "Isaac Newton", "Charles Darwin",
      "Marie Curie", "Niels Bohr", "Galileo Galilei",
      "Big Bang", "Periodic table", "Speed of light",
    ],
    estimatedChars: 50_000,
  },
  {
    id: "human-body",
    name: "Human Body & Health",
    description: "Anatomy, body systems, common diseases, nutrition, and first aid basics.",
    category: "science",
    icon: "🫀",
    sources: [
      "Human body", "Human heart", "Human brain", "Human eye",
      "Human ear", "Immune system", "Endocrine system",
      "Respiratory system", "Skeletal system", "Muscular system",
      "Nutrition", "First aid",
    ],
    estimatedChars: 55_000,
  },

  // === Languages ===
  {
    id: "english-grammar",
    name: "English Grammar Guide",
    description: "Parts of speech, tenses, sentence structure, punctuation, and common writing rules.",
    category: "languages",
    icon: "📖",
    sources: [
      "English grammar", "Part of speech", "Noun", "Verb",
      "Adjective", "Adverb", "Tense", "Sentence (linguistics)",
      "Punctuation", "Syntax", "Phonology", "Morphology (linguistics)",
    ],
    estimatedChars: 40_000,
  },
  {
    id: "swahili-basics",
    name: "Swahili Language Basics",
    description: "Swahili grammar, common phrases, vocabulary, and East African culture.",
    category: "languages",
    icon: "🗣️",
    sources: [
      "Swahili language", "Bantu languages", "East Africa",
      "Tanzania", "Kenya", "Uganda",
      "Luganda", "Kikuyu language", "Hausa language",
      "Zulu language", "Amharic", "Yoruba language",
    ],
    estimatedChars: 35_000,
  },

  // === General Knowledge ===
  {
    id: "general-knowledge",
    name: "General Knowledge Mix",
    description: "A broad mix of encyclopedic facts — countries, famous people, inventions, and cultural references.",
    category: "general",
    icon: "🧠",
    sources: [
      "Earth", "Solar System", "Sun", "Moon",
      "Water", "Fire", "Air", "Photosynthesis",
      "Internet", "Computer", "Telephone", "Printing press",
    ],
    estimatedChars: 35_000,
  },
  {
    id: "business-basics",
    name: "Business & Economics Basics",
    description: "Economics fundamentals, business types, marketing, accounting, and entrepreneurship.",
    category: "general",
    icon: "💼",
    sources: [
      "Economics", "Microeconomics", "Macroeconomics",
      "Supply and demand", "Business", "Entrepreneurship",
      "Marketing", "Accounting", "Gross domestic product",
      "Inflation", "Interest rate", "Stock market",
    ],
    estimatedChars: 48_000,
  },
];

// === Helpers ===

export function getPacksByCategory(): Record<string, KnowledgePack[]> {
  const grouped: Record<string, KnowledgePack[]> = {};
  for (const pack of KNOWLEDGE_PACKS) {
    if (!grouped[pack.category]) grouped[pack.category] = [];
    grouped[pack.category].push(pack);
  }
  return grouped;
}

export function getPackById(id: string): KnowledgePack | undefined {
  return KNOWLEDGE_PACKS.find((p) => p.id === id);
}

export const PACK_CATEGORIES: Array<{ id: string; label: string; icon: string }> = [
  { id: "education", label: "Education", icon: "🎓" },
  { id: "programming", label: "Programming", icon: "💻" },
  { id: "science", label: "Science", icon: "🔬" },
  { id: "history", label: "History", icon: "📜" },
  { id: "languages", label: "Languages", icon: "📖" },
  { id: "general", label: "General", icon: "🧠" },
];
