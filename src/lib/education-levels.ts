/**
 * Education Levels + Grade Verification Quiz — Phase 79
 *
 * Defines the education level hierarchy:
 *   1. Lower Primary (Grade 1-3)
 *   2. Upper Primary (Grade 4-8 / CBC Grade 4-6)
 *   3. Junior Secondary (Grade 7-9 / CBC Junior School)
 *   4. Senior School / High School (Form 1-4 / CBC Senior School)
 *   5. University / College
 *   6. TVET (CDACC / Vocational)
 *
 * Each level has:
 *   - A verification quiz (1 simple question appropriate for that level)
 *   - Grade/band options
 *   - Track-appropriate onboarding content
 *
 * The quiz prevents users from claiming a level they're not in.
 * If they fail, they're told "we detected you're not from this level"
 * and sent back to choose the correct level.
 */

// === Education Levels ===

export type EducationLevel =
  | "lower_primary"
  | "upper_primary"
  | "junior_secondary"
  | "senior_school"
  | "university"
  | "tvet";

export type LevelConfig = {
  id: EducationLevel;
  label: string;
  description: string;
  icon: string; // emoji for simplicity in data
  grades: string[];
  track: string; // maps to existing track system
  quizQuestion: {
    question: string;
    options: string[];
    correctIndex: number;
    hint?: string;
  };
};

export const EDUCATION_LEVELS: LevelConfig[] = [
  {
    id: "lower_primary",
    label: "Lower Primary",
    description: "Grade 1, 2, or 3 — early learning",
    icon: "🌱",
    grades: ["Grade 1", "Grade 2", "Grade 3"],
    track: "k12",
    quizQuestion: {
      question: "What is 2 + 3?",
      options: ["4", "5", "6", "10"],
      correctIndex: 1,
      hint: "Count on your fingers: 2 fingers + 3 more",
    },
  },
  {
    id: "upper_primary",
    label: "Upper Primary",
    description: "Grade 4, 5, 6, 7, or 8",
    icon: "🌿",
    grades: ["Grade 4", "Grade 5", "Grade 6", "Grade 7", "Grade 8"],
    track: "k12",
    quizQuestion: {
      question: "What is 7 × 8?",
      options: ["54", "56", "64", "48"],
      correctIndex: 1,
      hint: "Think of the 7 times table",
    },
  },
  {
    id: "junior_secondary",
    label: "Junior Secondary",
    description: "Grade 9 (CBC Junior School) or Form 1-2",
    icon: "📚",
    grades: ["Grade 9", "Form 1", "Form 2"],
    track: "k12",
    quizQuestion: {
      question: "What is the chemical symbol for water?",
      options: ["H2", "O2", "H2O", "CO2"],
      correctIndex: 2,
      hint: "Two hydrogen atoms and one oxygen atom",
    },
  },
  {
    id: "senior_school",
    label: "Senior School / High School",
    description: "Form 3, Form 4, or CBC Senior School",
    icon: "🎓",
    grades: ["Form 3", "Form 4", "Senior School Year 1", "Senior School Year 2", "Senior School Year 3"],
    track: "k12",
    quizQuestion: {
      question: "Who wrote the novel 'The River Between'?",
      options: ["Chinua Achebe", "Ngugi wa Thiong'o", "Wole Soyinka", "Meja Mwangi"],
      correctIndex: 1,
      hint: "A famous Kenyan author",
    },
  },
  {
    id: "university",
    label: "University / College",
    description: "Undergraduate or postgraduate student",
    icon: "🏛️",
    grades: ["Year 1", "Year 2", "Year 3", "Year 4", "Year 5+", "Postgraduate"],
    track: "mixed", // user picks their course → determines track
    quizQuestion: {
      question: "What does 'GDP' stand for in economics?",
      options: [
        "General Domestic Product",
        "Gross Domestic Product",
        "Global Development Plan",
        "Government Debt Percentage",
      ],
      correctIndex: 1,
      hint: "It measures the total value of goods and services in a country",
    },
  },
  {
    id: "tvet",
    label: "TVET / Vocational Training",
    description: "CDACC, artisan, or vocational training",
    icon: "🔧",
    grades: ["CDACC Level 4", "CDACC Level 5", "CDACC Level 6", "Artisan", "Vocational Student", "Trainer"],
    track: "tvet",
    quizQuestion: {
      question: "What tool is used to measure electrical current?",
      options: ["Voltmeter", "Ammeter", "Thermometer", "Micrometer"],
      correctIndex: 1,
      hint: "It measures 'amps' (amperes)",
    },
  },
];

// === University Courses (searchable) ===

export type UniversityCourse = {
  name: string;
  category: string;
  track: string; // maps to buddy track
};

export const UNIVERSITY_COURSES: UniversityCourse[] = [
  // Engineering & Technology
  { name: "Computer Science", category: "Engineering & Technology", track: "dev" },
  { name: "Software Engineering", category: "Engineering & Technology", track: "dev" },
  { name: "Information Technology", category: "Engineering & Technology", track: "dev" },
  { name: "Data Science", category: "Engineering & Technology", track: "data" },
  { name: "Artificial Intelligence", category: "Engineering & Technology", track: "ml" },
  { name: "Machine Learning", category: "Engineering & Technology", track: "ml" },
  { name: "Cybersecurity", category: "Engineering & Technology", track: "dev" },
  { name: "Electrical Engineering", category: "Engineering & Technology", track: "dev" },
  { name: "Mechanical Engineering", category: "Engineering & Technology", track: "dev" },
  { name: "Civil Engineering", category: "Engineering & Technology", track: "dev" },
  { name: "Chemical Engineering", category: "Engineering & Technology", track: "dev" },
  { name: "Petroleum Engineering", category: "Engineering & Technology", track: "dev" },
  { name: "Aerospace Engineering", category: "Engineering & Technology", track: "dev" },
  { name: "Biomedical Engineering", category: "Engineering & Technology", track: "ml" },
  { name: "Telecommunications Engineering", category: "Engineering & Technology", track: "dev" },
  { name: "Mechatronics Engineering", category: "Engineering & Technology", track: "dev" },

  // Business & Economics
  { name: "Business Administration", category: "Business & Economics", track: "mixed" },
  { name: "Economics", category: "Business & Economics", track: "mixed" },
  { name: "Finance", category: "Business & Economics", track: "mixed" },
  { name: "Accounting", category: "Business & Economics", track: "mixed" },
  { name: "Marketing", category: "Business & Economics", track: "mixed" },
  { name: "Human Resource Management", category: "Business & Economics", track: "mixed" },
  { name: "Supply Chain Management", category: "Business & Economics", track: "mixed" },
  { name: "Project Management", category: "Business & Economics", track: "mixed" },
  { name: "Entrepreneurship", category: "Business & Economics", track: "mixed" },
  { name: "Insurance", category: "Business & Economics", track: "mixed" },
  { name: "Banking and Finance", category: "Business & Economics", track: "mixed" },
  { name: "Actuarial Science", category: "Business & Economics", track: "data" },
  { name: "Statistics", category: "Business & Economics", track: "data" },
  { name: "Commerce", category: "Business & Economics", track: "mixed" },

  // Health Sciences
  { name: "Medicine (MBChB)", category: "Health Sciences", track: "mixed" },
  { name: "Nursing", category: "Health Sciences", track: "mixed" },
  { name: "Pharmacy", category: "Health Sciences", track: "mixed" },
  { name: "Dental Surgery", category: "Health Sciences", track: "mixed" },
  { name: "Public Health", category: "Health Sciences", track: "mixed" },
  { name: "Medical Laboratory Science", category: "Health Sciences", track: "data" },
  { name: "Radiography", category: "Health Sciences", track: "mixed" },
  { name: "Physiotherapy", category: "Health Sciences", track: "mixed" },
  { name: "Nutrition and Dietetics", category: "Health Sciences", track: "mixed" },
  { name: "Veterinary Medicine", category: "Health Sciences", track: "mixed" },
  { name: "Biomedical Science", category: "Health Sciences", track: "ml" },
  { name: "Biochemistry", category: "Health Sciences", track: "ml" },

  // Sciences
  { name: "Mathematics", category: "Sciences", track: "data" },
  { name: "Physics", category: "Sciences", track: "mixed" },
  { name: "Chemistry", category: "Sciences", track: "mixed" },
  { name: "Biology", category: "Sciences", track: "ml" },
  { name: "Microbiology", category: "Sciences", track: "ml" },
  { name: "Environmental Science", category: "Sciences", track: "mixed" },
  { name: "Geology", category: "Sciences", track: "mixed" },
  { name: "Geography", category: "Sciences", track: "mixed" },
  { name: "Astronomy", category: "Sciences", track: "mixed" },
  { name: "Biotechnology", category: "Sciences", track: "ml" },
  { name: "Forensic Science", category: "Sciences", track: "ml" },

  // Arts & Humanities
  { name: "Law (LLB)", category: "Arts & Humanities", track: "mixed" },
  { name: "English Literature", category: "Arts & Humanities", track: "mixed" },
  { name: "History", category: "Arts & Humanities", track: "mixed" },
  { name: "Philosophy", category: "Arts & Humanities", track: "mixed" },
  { name: "Linguistics", category: "Arts & Humanities", track: "mixed" },
  { name: "Kiswahili", category: "Arts & Humanities", track: "mixed" },
  { name: "French", category: "Arts & Humanities", track: "mixed" },
  { name: "German", category: "Arts & Humanities", track: "mixed" },
  { name: "Chinese", category: "Arts & Humanities", track: "mixed" },
  { name: "Arabic", category: "Arts & Humanities", track: "mixed" },
  { name: "Spanish", category: "Arts & Humanities", track: "mixed" },
  { name: "Religious Studies", category: "Arts & Humanities", track: "mixed" },
  { name: "Sociology", category: "Arts & Humanities", track: "mixed" },
  { name: "Psychology", category: "Arts & Humanities", track: "mixed" },
  { name: "Political Science", category: "Arts & Humanities", track: "mixed" },
  { name: "Anthropology", category: "Arts & Humanities", track: "mixed" },
  { name: "Communication & Media Studies", category: "Arts & Humanities", track: "mixed" },
  { name: "Journalism", category: "Arts & Humanities", track: "mixed" },
  { name: "International Relations", category: "Arts & Humanities", track: "mixed" },

  // Education
  { name: "Education (Arts)", category: "Education", track: "mixed" },
  { name: "Education (Science)", category: "Education", track: "mixed" },
  { name: "Early Childhood Education", category: "Education", track: "mixed" },
  { name: "Special Needs Education", category: "Education", track: "mixed" },
  { name: "Physical Education", category: "Education", track: "mixed" },

  // Agriculture
  { name: "Agriculture", category: "Agriculture", track: "mixed" },
  { name: "Horticulture", category: "Agriculture", track: "mixed" },
  { name: "Food Science and Technology", category: "Agriculture", track: "mixed" },
  { name: "Agribusiness Management", category: "Agriculture", track: "mixed" },
  { name: "Aquaculture", category: "Agriculture", track: "mixed" },
  { name: "Animal Science", category: "Agriculture", track: "mixed" },

  // Architecture & Design
  { name: "Architecture", category: "Architecture & Design", track: "dev" },
  { name: "Interior Design", category: "Architecture & Design", track: "dev" },
  { name: "Graphic Design", category: "Architecture & Design", track: "dev" },
  { name: "Fashion Design", category: "Architecture & Design", track: "dev" },
  { name: "Urban Planning", category: "Architecture & Design", track: "dev" },

  // Law & Governance
  { name: "Criminology", category: "Law & Governance", track: "mixed" },
  { name: "Public Administration", category: "Law & Governance", track: "mixed" },
  { name: "Diplomacy & Foreign Relations", category: "Law & Governance", track: "mixed" },

  // Hospitality & Tourism
  { name: "Tourism Management", category: "Hospitality & Tourism", track: "mixed" },
  { name: "Hotel Management", category: "Hospitality & Tourism", track: "mixed" },
  { name: "Culinary Arts", category: "Hospitality & Tourism", track: "mixed" },
  { name: "Travel & Tour Operations", category: "Hospitality & Tourism", track: "mixed" },
];

// === TVET Trades (searchable) ===

export type TVETTrade = {
  name: string;
  category: string;
  cdaccLevel: string;
};

export const TVET_TRADES: TVETTrade[] = [
  // Electrical & Electronics
  { name: "Electrical Installation", category: "Electrical & Electronics", cdaccLevel: "Level 5" },
  { name: "Electronics Technology", category: "Electrical & Electronics", cdaccLevel: "Level 6" },
  { name: "Solar PV Installation", category: "Electrical & Electronics", cdaccLevel: "Level 4" },
  { name: "Refrigeration & Air Conditioning", category: "Electrical & Electronics", cdaccLevel: "Level 5" },

  // Building & Construction
  { name: "Plumbing", category: "Building & Construction", cdaccLevel: "Level 5" },
  { name: "Masonry", category: "Building & Construction", cdaccLevel: "Level 4" },
  { name: "Carpentry & Joinery", category: "Building & Construction", cdaccLevel: "Level 4" },
  { name: "Painting & Decoration", category: "Building & Construction", cdaccLevel: "Level 4" },
  { name: "Tile & Flooring", category: "Building & Construction", cdaccLevel: "Level 4" },
  { name: "Land Surveying", category: "Building & Construction", cdaccLevel: "Level 6" },

  // Automotive
  { name: "Automotive Mechanics", category: "Automotive", cdaccLevel: "Level 5" },
  { name: "Auto Body Repair", category: "Automotive", cdaccLevel: "Level 4" },
  { name: "Auto Electrical", category: "Automotive", cdaccLevel: "Level 5" },
  { name: "Welding & Fabrication", category: "Automotive", cdaccLevel: "Level 5" },
  { name: "Motorcycle Mechanics", category: "Automotive", cdaccLevel: "Level 4" },

  // ICT
  { name: "ICT Technician", category: "Information Technology", cdaccLevel: "Level 5" },
  { name: "Computer Networks", category: "Information Technology", cdaccLevel: "Level 6" },
  { name: "Web Design", category: "Information Technology", cdaccLevel: "Level 5" },
  { name: "Database Administration", category: "Information Technology", cdaccLevel: "Level 6" },
  { name: "Mobile Phone Repair", category: "Information Technology", cdaccLevel: "Level 4" },

  // Hospitality
  { name: "Food & Beverage Service", category: "Hospitality", cdaccLevel: "Level 4" },
  { name: "Food Production", category: "Hospitality", cdaccLevel: "Level 5" },
  { name: "Baking & Pastry", category: "Hospitality", cdaccLevel: "Level 4" },
  { name: "Housekeeping", category: "Hospitality", cdaccLevel: "Level 4" },
  { name: "Front Office Operations", category: "Hospitality", cdaccLevel: "Level 5" },

  // Fashion & Beauty
  { name: "Fashion & Design", category: "Fashion & Beauty", cdaccLevel: "Level 5" },
  { name: "Hairdressing & Beauty Therapy", category: "Fashion & Beauty", cdaccLevel: "Level 4" },
  { name: "Leather & Tannery", category: "Fashion & Beauty", cdaccLevel: "Level 4" },
  { name: "Textile Production", category: "Fashion & Beauty", cdaccLevel: "Level 5" },

  // Agriculture
  { name: "Agriculture (Crop Production)", category: "Agriculture", cdaccLevel: "Level 5" },
  { name: "Animal Husbandry", category: "Agriculture", cdaccLevel: "Level 5" },
  { name: "Aquaculture", category: "Agriculture", cdaccLevel: "Level 4" },
  { name: "Beekeeping", category: "Agriculture", cdaccLevel: "Level 4" },

  // Business
  { name: "Business Management", category: "Business", cdaccLevel: "Level 6" },
  { name: "Accounting Technician", category: "Business", cdaccLevel: "Level 5" },
  { name: "Supply Chain", category: "Business", cdaccLevel: "Level 5" },
  { name: "Sales & Marketing", category: "Business", cdaccLevel: "Level 5" },

  // Health
  { name: "Community Health", category: "Health", cdaccLevel: "Level 5" },
  { name: "First Aid & Emergency", category: "Health", cdaccLevel: "Level 4" },
  { name: "Pharmacy Technician", category: "Health", cdaccLevel: "Level 6" },
  { name: "Medical Laboratory", category: "Health", cdaccLevel: "Level 6" },

  // Media & Arts
  { name: "Photography", category: "Media & Arts", cdaccLevel: "Level 5" },
  { name: "Graphic Design", category: "Media & Arts", cdaccLevel: "Level 5" },
  { name: "Music Production", category: "Media & Arts", cdaccLevel: "Level 5" },
  { name: "Video Production", category: "Media & Arts", cdaccLevel: "Level 5" },
  { name: "Printing Technology", category: "Media & Arts", cdaccLevel: "Level 5" },
];

// === Helpers ===

export function getLevelById(id: EducationLevel): LevelConfig | undefined {
  return EDUCATION_LEVELS.find((l) => l.id === id);
}

export function searchUniversityCourses(query: string): UniversityCourse[] {
  const q = query.toLowerCase().trim();
  if (!q) return UNIVERSITY_COURSES;
  return UNIVERSITY_COURSES.filter(
    (c) => c.name.toLowerCase().includes(q) || c.category.toLowerCase().includes(q),
  );
}

export function searchTVETTrades(query: string): TVETTrade[] {
  const q = query.toLowerCase().trim();
  if (!q) return TVET_TRADES;
  return TVET_TRADES.filter(
    (t) => t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q),
  );
}

export function getUniversityCourseCategories(): string[] {
  return Array.from(new Set(UNIVERSITY_COURSES.map((c) => c.category)));
}

export function getTVETTradeCategories(): string[] {
  return Array.from(new Set(TVET_TRADES.map((t) => t.category)));
}
