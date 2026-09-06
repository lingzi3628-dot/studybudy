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

  // === Phase 73.4 — Additional packs ===

  // More programming
  {
    id: "c-programming",
    name: "C Programming Basics",
    description: "C syntax, pointers, memory management, structs, and standard library. For systems programming tutor bots.",
    category: "programming",
    icon: "C",
    sources: [
      "C (programming language)", "Pointer (computer programming)",
      "Memory management", "Struct (C programming language)",
      "Standard library", "Malloc", "Array (data structure)",
      "Function (computer programming)", "Compiler", "Debugging",
    ],
    estimatedChars: 42_000,
  },
  {
    id: "java-programming",
    name: "Java Programming Basics",
    description: "Java syntax, OOP, collections, exceptions, and JVM fundamentals.",
    category: "programming",
    icon: "J",
    sources: [
      "Java (programming language)", "Object-oriented programming",
      "Class (computer programming)", "Inheritance (object-oriented programming)",
      "Polymorphism (computer science)", "Java collections framework",
      "Exception handling", "Java virtual machine",
      "Garbage collection (computer science)", "Multithreading (computer architecture)",
    ],
    estimatedChars: 45_000,
  },
  {
    id: "sql-basics",
    name: "SQL & Databases",
    description: "SQL queries, joins, normalization, indexes, and database design concepts.",
    category: "programming",
    icon: "DB",
    sources: [
      "SQL", "Database", "Join (SQL)", "Database normalization",
      "Index (database)", "Primary key", "Foreign key",
      "ACID", "Transaction (database)", "NoSQL",
    ],
    estimatedChars: 38_000,
  },
  {
    id: "html-css",
    name: "HTML & CSS Basics",
    description: "HTML elements, CSS selectors, flexbox, grid, responsive design. For frontend tutor bots.",
    category: "programming",
    icon: "#",
    sources: [
      "HTML", "CSS", "HTML element", "CSS selector",
      "Flexbox", "CSS grid layout", "Responsive web design",
      "Media query", "Box model", "Semantic HTML",
    ],
    estimatedChars: 35_000,
  },

  // More science
  {
    id: "astronomy",
    name: "Astronomy & Space",
    description: "Solar system, stars, galaxies, black holes, and space exploration.",
    category: "science",
    icon: "*",
    sources: [
      "Solar System", "Sun", "Moon", "Planet",
      "Star", "Galaxy", "Black hole", "Big Bang",
      "Space exploration", "NASA", "International Space Station",
      "Light-year",
    ],
    estimatedChars: 50_000,
  },
  {
    id: "earth-science",
    name: "Earth Science",
    description: "Geology, weather, climate, oceans, and natural disasters.",
    category: "science",
    icon: "E",
    sources: [
      "Earth", "Geology", "Plate tectonics", "Earthquake",
      "Volcano", "Weather", "Climate", "Ocean",
      "Atmosphere of Earth", "Global warming", "Water cycle",
    ],
    estimatedChars: 48_000,
  },

  // More education
  {
    id: "english-literature",
    name: "English Literature Guide",
    description: "Literary devices, genres, famous authors, and analysis techniques.",
    category: "languages",
    icon: "L",
    sources: [
      "Literature", "Literary device", "Metaphor", "Simile",
      "Irony", "Foreshadowing", "Poetry", "William Shakespeare",
      "Novel", "Short story", "Theme (narrative)",
    ],
    estimatedChars: 40_000,
  },
  {
    id: "civics-government",
    name: "Civics & Government",
    description: "Democracy, constitutions, branches of government, and公民 rights.",
    category: "education",
    icon: "G",
    sources: [
      "Democracy", "Constitution", "Separation of powers",
      "Executive (government)", "Legislature", "Judiciary",
      "Human rights", "Election", "Political party",
      "Citizenship", "Rule of law",
    ],
    estimatedChars: 42_000,
  },
  {
    id: "business-studies",
    name: "Business Studies",
    description: "Business organization, management, marketing, and finance fundamentals.",
    category: "general",
    icon: "B",
    sources: [
      "Business", "Management", "Marketing mix",
      "Business organization", "Limited liability company",
      "Partnership", "Sole proprietorship", "Balance sheet",
      "Income statement", "Cash flow", "Business plan",
    ],
    estimatedChars: 44_000,
  },

  // More general
  {
    id: "world-capitals",
    name: "World Capitals & Countries",
    description: "Capital cities, country flags, currencies, and basic facts for all major nations.",
    category: "general",
    icon: "W",
    sources: [
      "List of national capitals", "List of countries by population",
      "List of currencies", "Africa", "Europe",
      "Asia", "North America", "South America",
      "Oceania", "United Nations",
    ],
    estimatedChars: 38_000,
  },
  {
    id: "inventions-discoveries",
    name: "Famous Inventions & Discoveries",
    description: "Key inventions, their inventors, and how they changed the world.",
    category: "general",
    icon: "I",
    sources: [
      "Printing press", "Steam engine", "Telephone",
      "Light bulb", "Airplane", "Automobile",
      "Computer", "Internet", "World Wide Web",
      "Vaccine", "Penicillin", "Electricity",
    ],
    estimatedChars: 40_000,
  },
  {
    id: "health-nutrition",
    name: "Health & Nutrition",
    description: "Balanced diet, vitamins, exercise, common diseases, and healthy living.",
    category: "science",
    icon: "H",
    sources: [
      "Nutrition", "Vitamin", "Protein (nutrient)",
      "Carbohydrate", "Fat", "Dietary fiber",
      "Physical exercise", "Obesity", "Diabetes",
      "Hypertension", "Immune system", "Sleep",
    ],
    estimatedChars: 45_000,
  },

  // === Phase 74 — Conversational Q&A packs ===
  // These use URLs to raw text files (GitHub raw, Hugging Face, etc.) instead
  // of Wikipedia articles. The ingestion pipeline fetches each URL, extracts
  // text, and chunks it. Perfect for conversational + factual Q&A bots.

  {
    id: "conversational-smalltalk",
    name: "Conversational Small Talk",
    description: "Greetings, emotions, jokes, compliments, and casual conversation patterns. Makes the bot feel more human in everyday chat.",
    category: "general",
    icon: "C",
    sources: [
      "https://raw.githubusercontent.com/gunthercox/chatterbot-corpus/master/chatterbot_corpus/data/english/greetings.yml",
      "https://raw.githubusercontent.com/gunthercox/chatterbot-corpus/master/chatterbot_corpus/data/english/emotion.yml",
      "https://raw.githubusercontent.com/gunthercox/chatterbot-corpus/master/chatterbot_corpus/data/english/compliment.yml",
      "https://raw.githubusercontent.com/gunthercox/chatterbot-corpus/master/chatterbot_corpus/data/english/jokes.yml",
      "https://raw.githubusercontent.com/gunthercox/chatterbot-corpus/master/chatterbot_corpus/data/english/trivia.yml",
    ],
    estimatedChars: 15_000,
  },
  {
    id: "conversational-food",
    name: "Food & Cooking Conversation",
    description: "Food preferences, recipes, restaurant recommendations, and cooking conversation patterns.",
    category: "general",
    icon: "F",
    sources: [
      "https://raw.githubusercontent.com/gunthercox/chatterbot-corpus/master/chatterbot_corpus/data/english/food.yml",
      "https://raw.githubusercontent.com/gunthercox/chatterbot-corpus/master/chatterbot_corpus/data/english/cooking.yml",
    ],
    estimatedChars: 8_000,
  },
  {
    id: "conversational-health",
    name: "Health & Medical Q&A",
    description: "Common health questions from MedQuAD-style sources. For health info bots (not a substitute for professional advice).",
    category: "science",
    icon: "M",
    sources: [
      "https://en.wikipedia.org/wiki/Medicine",
      "https://en.wikipedia.org/wiki/Disease",
      "https://en.wikipedia.org/wiki/Symptom",
      "https://en.wikipedia.org/wiki/First_aid",
      "https://en.wikipedia.org/wiki/Nutrition",
      "https://en.wikipedia.org/wiki/Physical_exercise",
    ],
    estimatedChars: 35_000,
  },
  {
    id: "science-qa-elementary",
    name: "Elementary Science Q&A",
    description: "Science facts and reasoning questions aligned with elementary/primary school curriculum.",
    category: "education",
    icon: "S",
    sources: [
      "https://en.wikipedia.org/wiki/Science",
      "https://en.wikipedia.org/wiki/Scientific_method",
      "https://en.wikipedia.org/wiki/Experiment",
      "https://en.wikipedia.org/wiki/Observation",
      "https://en.wikipedia.org/wiki/Hypothesis",
      "https://en.wikipedia.org/wiki/Matter",
      "https://en.wikipedia.org/wiki/Energy",
      "https://en.wikipedia.org/wiki/Force",
      "https://en.wikipedia.org/wiki/Motion_(physics)",
      "https://en.wikipedia.org/wiki/Light",
    ],
    estimatedChars: 40_000,
  },
  {
    id: "math-qa-secondary",
    name: "Secondary Math Q&A",
    description: "Algebra, geometry, and statistics concepts with worked examples. For secondary school math bots.",
    category: "education",
    icon: "M",
    sources: [
      "https://en.wikipedia.org/wiki/Algebra",
      "https://en.wikipedia.org/wiki/Geometry",
      "https://en.wikipedia.org/wiki/Trigonometry",
      "https://en.wikipedia.org/wiki/Calculus",
      "https://en.wikipedia.org/wiki/Statistics",
      "https://en.wikipedia.org/wiki/Probability",
      "https://en.wikipedia.org/wiki/Equation",
      "https://en.wikipedia.org/wiki/Function_(mathematics)",
      "https://en.wikipedia.org/wiki/Graph_of_a_function",
      "https://en.wikipedia.org/wiki/Mathematical_proof",
    ],
    estimatedChars: 45_000,
  },
  {
    id: "programming-qa-stackoverflow",
    name: "Programming Q&A (Stack Overflow style)",
    description: "Common programming questions and answers covering Python, JavaScript, SQL, and general concepts.",
    category: "programming",
    icon: "P",
    sources: [
      "https://en.wikipedia.org/wiki/Programming_language",
      "https://en.wikipedia.org/wiki/Debugging",
      "https://en.wikipedia.org/wiki/Software_bug",
      "https://en.wikipedia.org/wiki/Version_control",
      "https://en.wikipedia.org/wiki/Algorithm",
      "https://en.wikipedia.org/wiki/Data_structure",
      "https://en.wikipedia.org/wiki/Regular_expression",
      "https://en.wikipedia.org/wiki/API",
      "https://en.wikipedia.org/wiki/Unit_testing",
      "https://en.wikipedia.org/wiki/Design_pattern",
    ],
    estimatedChars: 38_000,
  },
  {
    id: "languages-translation",
    name: "Language & Translation Guide",
    description: "Translation concepts, language families, and multilingual communication patterns.",
    category: "languages",
    icon: "T",
    sources: [
      "https://en.wikipedia.org/wiki/Translation",
      "https://en.wikipedia.org/wiki/Language",
      "https://en.wikipedia.org/wiki/Linguistics",
      "https://en.wikipedia.org/wiki/Phonetics",
      "https://en.wikipedia.org/wiki/Semantics",
      "https://en.wikipedia.org/wiki/Pragmatics",
      "https://en.wikipedia.org/wiki/Language_acquisition",
      "https://en.wikipedia.org/wiki/Multilingualism",
    ],
    estimatedChars: 35_000,
  },
  {
    id: "history-qa-world",
    name: "World History Q&A",
    description: "Key historical events, figures, and timelines from ancient civilizations to modern era.",
    category: "history",
    icon: "H",
    sources: [
      "https://en.wikipedia.org/wiki/History_of_the_world",
      "https://en.wikipedia.org/wiki/Ancient_history",
      "https://en.wikipedia.org/wiki/Middle_Ages",
      "https://en.wikipedia.org/wiki/Early_modern_period",
      "https://en.wikipedia.org/wiki/Modern_history",
      "https://en.wikipedia.org/wiki/Industrial_Revolution",
      "https://en.wikipedia.org/wiki/Information_Age",
    ],
    estimatedChars: 50_000,
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
