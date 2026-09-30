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
    track: "university", // Phase 85.3 — university track (not mixed) — routes to HigherEdHome
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
  { name: "Computer Science", category: "Engineering & Technology", track: "university" },
  { name: "Software Engineering", category: "Engineering & Technology", track: "university" },
  { name: "Information Technology", category: "Engineering & Technology", track: "university" },
  { name: "Data Science", category: "Engineering & Technology", track: "university" },
  { name: "Artificial Intelligence", category: "Engineering & Technology", track: "university" },
  { name: "Machine Learning", category: "Engineering & Technology", track: "university" },
  { name: "Cybersecurity", category: "Engineering & Technology", track: "university" },
  { name: "Electrical Engineering", category: "Engineering & Technology", track: "university" },
  { name: "Mechanical Engineering", category: "Engineering & Technology", track: "university" },
  { name: "Civil Engineering", category: "Engineering & Technology", track: "university" },
  { name: "Chemical Engineering", category: "Engineering & Technology", track: "university" },
  { name: "Petroleum Engineering", category: "Engineering & Technology", track: "university" },
  { name: "Aerospace Engineering", category: "Engineering & Technology", track: "university" },
  { name: "Biomedical Engineering", category: "Engineering & Technology", track: "university" },
  { name: "Telecommunications Engineering", category: "Engineering & Technology", track: "university" },
  { name: "Mechatronics Engineering", category: "Engineering & Technology", track: "university" },

  // Business & Economics
  { name: "Business Administration", category: "Business & Economics", track: "university" },
  { name: "Economics", category: "Business & Economics", track: "university" },
  { name: "Finance", category: "Business & Economics", track: "university" },
  { name: "Accounting", category: "Business & Economics", track: "university" },
  { name: "Marketing", category: "Business & Economics", track: "university" },
  { name: "Human Resource Management", category: "Business & Economics", track: "university" },
  { name: "Supply Chain Management", category: "Business & Economics", track: "university" },
  { name: "Project Management", category: "Business & Economics", track: "university" },
  { name: "Entrepreneurship", category: "Business & Economics", track: "university" },
  { name: "Insurance", category: "Business & Economics", track: "university" },
  { name: "Banking and Finance", category: "Business & Economics", track: "university" },
  { name: "Actuarial Science", category: "Business & Economics", track: "university" },
  { name: "Statistics", category: "Business & Economics", track: "university" },
  { name: "Commerce", category: "Business & Economics", track: "university" },

  // Health Sciences
  { name: "Medicine (MBChB)", category: "Health Sciences", track: "university" },
  { name: "Nursing", category: "Health Sciences", track: "university" },
  { name: "Pharmacy", category: "Health Sciences", track: "university" },
  { name: "Dental Surgery", category: "Health Sciences", track: "university" },
  { name: "Public Health", category: "Health Sciences", track: "university" },
  { name: "Medical Laboratory Science", category: "Health Sciences", track: "university" },
  { name: "Radiography", category: "Health Sciences", track: "university" },
  { name: "Physiotherapy", category: "Health Sciences", track: "university" },
  { name: "Nutrition and Dietetics", category: "Health Sciences", track: "university" },
  { name: "Veterinary Medicine", category: "Health Sciences", track: "university" },
  { name: "Biomedical Science", category: "Health Sciences", track: "university" },
  { name: "Biochemistry", category: "Health Sciences", track: "university" },

  // Sciences
  { name: "Mathematics", category: "Sciences", track: "university" },
  { name: "Physics", category: "Sciences", track: "university" },
  { name: "Chemistry", category: "Sciences", track: "university" },
  { name: "Biology", category: "Sciences", track: "university" },
  { name: "Microbiology", category: "Sciences", track: "university" },
  { name: "Environmental Science", category: "Sciences", track: "university" },
  { name: "Geology", category: "Sciences", track: "university" },
  { name: "Geography", category: "Sciences", track: "university" },
  { name: "Astronomy", category: "Sciences", track: "university" },
  { name: "Biotechnology", category: "Sciences", track: "university" },
  { name: "Forensic Science", category: "Sciences", track: "university" },

  // Arts & Humanities
  { name: "Law (LLB)", category: "Arts & Humanities", track: "university" },
  { name: "English Literature", category: "Arts & Humanities", track: "university" },
  { name: "History", category: "Arts & Humanities", track: "university" },
  { name: "Philosophy", category: "Arts & Humanities", track: "university" },
  { name: "Linguistics", category: "Arts & Humanities", track: "university" },
  { name: "Kiswahili", category: "Arts & Humanities", track: "university" },
  { name: "French", category: "Arts & Humanities", track: "university" },
  { name: "German", category: "Arts & Humanities", track: "university" },
  { name: "Chinese", category: "Arts & Humanities", track: "university" },
  { name: "Arabic", category: "Arts & Humanities", track: "university" },
  { name: "Spanish", category: "Arts & Humanities", track: "university" },
  { name: "Religious Studies", category: "Arts & Humanities", track: "university" },
  { name: "Sociology", category: "Arts & Humanities", track: "university" },
  { name: "Psychology", category: "Arts & Humanities", track: "university" },
  { name: "Political Science", category: "Arts & Humanities", track: "university" },
  { name: "Anthropology", category: "Arts & Humanities", track: "university" },
  { name: "Communication & Media Studies", category: "Arts & Humanities", track: "university" },
  { name: "Journalism", category: "Arts & Humanities", track: "university" },
  { name: "International Relations", category: "Arts & Humanities", track: "university" },

  // Education
  { name: "Education (Arts)", category: "Education", track: "university" },
  { name: "Education (Science)", category: "Education", track: "university" },
  { name: "Early Childhood Education", category: "Education", track: "university" },
  { name: "Special Needs Education", category: "Education", track: "university" },
  { name: "Physical Education", category: "Education", track: "university" },

  // Agriculture
  { name: "Agriculture", category: "Agriculture", track: "university" },
  { name: "Horticulture", category: "Agriculture", track: "university" },
  { name: "Food Science and Technology", category: "Agriculture", track: "university" },
  { name: "Agribusiness Management", category: "Agriculture", track: "university" },
  { name: "Aquaculture", category: "Agriculture", track: "university" },
  { name: "Animal Science", category: "Agriculture", track: "university" },

  // Architecture & Design
  { name: "Architecture", category: "Architecture & Design", track: "university" },
  { name: "Interior Design", category: "Architecture & Design", track: "university" },
  { name: "Graphic Design", category: "Architecture & Design", track: "university" },
  { name: "Fashion Design", category: "Architecture & Design", track: "university" },
  { name: "Urban Planning", category: "Architecture & Design", track: "university" },

  // Law & Governance
  { name: "Criminology", category: "Law & Governance", track: "university" },
  { name: "Public Administration", category: "Law & Governance", track: "university" },
  { name: "Diplomacy & Foreign Relations", category: "Law & Governance", track: "university" },

  // Hospitality & Tourism
  { name: "Tourism Management", category: "Hospitality & Tourism", track: "university" },
  { name: "Hotel Management", category: "Hospitality & Tourism", track: "university" },
  { name: "Culinary Arts", category: "Hospitality & Tourism", track: "university" },
  { name: "Travel & Tour Operations", category: "Hospitality & Tourism", track: "university" },
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
