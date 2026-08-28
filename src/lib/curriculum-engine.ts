/**
 * Kenya CBC Curriculum Engine — Phase 41
 *
 * Sources:
 *   - KICD (Kenya Institute of Curriculum Development) — https://kicd.ac.ke/cbc-materials/
 *   - Kenya CBC curriculum designs (Grades 1-12 + PP1/PP2)
 *   - KICD curriculum designs for each grade level
 *   - Kenya Education Sector Support Programme (KESSP)
 *   - Competency Based Assessment (CBA) guidelines
 *   - KCSE/KPSEA/KJSEA syllabus documents
 *
 * Structure:
 *   - Pre-Primary (PP1, PP2)
 *   - Lower Primary (Grade 1-3)
 *   - Upper Primary (Grade 4-6)
 *   - Junior School (Grade 7-9 / KJSEA)
 *   - Senior School (Grade 10-12 / Form 1-4 equivalent)
 *
 * The engine provides:
 *   1. getCurriculumForGrade(grade) → subjects + topics for that grade
 *   2. getTopicContext(grade, subject, topic) → detailed learning outcomes
 *   3. isWithinCurriculum(grade, subject, topic) → checks if a topic is in the curriculum
 *   4. buildCurriculumContext(user) → system prompt suffix for the AI tutor
 *      that grounds the AI within the student's curriculum — the AI should
 *      NEVER go outside the curriculum topics for the student's grade level.
 */

// =====================================================================
// KENYA CBC CURRICULUM DATA
// =====================================================================

export type CurriculumSubject = {
  name: string;
  topics: Array<{
    name: string;
    strand?: string; // curriculum strand
    subStrand?: string; // sub-strand
    learningOutcomes?: string[];
    contentMarkdown?: string;
  }>;
};

export type CurriculumGrade = {
  name: string;
  level: "pre-primary" | "lower-primary" | "upper-primary" | "junior-school" | "senior-school";
  subjects: CurriculumSubject[];
};

// =====================================================================
// FULL CBC CURRICULUM — Grades 1-12 + PP1/PP2
// Based on KICD curriculum designs
// =====================================================================

export const KENYA_CBC_CURRICULUM: Record<string, CurriculumGrade> = {
  // ================================================================
  // PRE-PRIMARY (PP1 & PP2)
  // ================================================================
  "PP1": {
    name: "Pre-Primary 1",
    level: "pre-primary",
    subjects: [
      {
        name: "Activity Areas",
        topics: [
          { name: "Language Activities", strand: "Communication", subStrand: "Listening & Speaking", learningOutcomes: ["Listen attentively", "Respond to simple instructions", "Express needs using words"] },
          { name: "Mathematical Activities", strand: "Mathematics", subStrand: "Numbers", learningOutcomes: ["Count 1-10", "Recognize numbers 1-5", "Match quantities to numbers"] },
          { name: "Environmental Activities", strand: "Environmental", subStrand: "My Family", learningOutcomes: ["Name family members", "Describe roles in the family"] },
          { name: "Psychomotor & Creative Activities", strand: "Creative", subStrand: "Art & Craft", learningOutcomes: ["Draw and colour shapes", "Use materials to create simple crafts"] },
          { name: "Religious Activities", strand: "Religious", subStrand: "Creation", learningOutcomes: ["Appreciate God's creation", "Name things God created"] },
          { name: "Pastoral Instruction", strand: "Social", subStrand: "Relationships", learningOutcomes: ["Share with others", "Greet and interact politely"] },
        ],
      },
    ],
  },
  "PP2": {
    name: "Pre-Primary 2",
    level: "pre-primary",
    subjects: [
      {
        name: "Activity Areas",
        topics: [
          { name: "Language Activities", strand: "Communication", subStrand: "Reading & Writing", learningOutcomes: ["Read simple words", "Write own name", "Identify sounds of letters"] },
          { name: "Mathematical Activities", strand: "Mathematics", subStrand: "Numbers", learningOutcomes: ["Count 1-20", "Add and subtract within 10", "Recognize patterns"] },
          { name: "Environmental Activities", strand: "Environmental", subStrand: "My School", learningOutcomes: ["Name things in school", "Follow school rules"] },
          { name: "Psychomotor & Creative Activities", strand: "Creative", subStrand: "Music & Movement", learningOutcomes: ["Sing simple songs", "Move to rhythm"] },
        ],
      },
    ],
  },

  // ================================================================
  // LOWER PRIMARY (Grade 1-3)
  // ================================================================
  "Grade 1": {
    name: "Grade 1",
    level: "lower-primary",
    subjects: [
      {
        name: "English",
        topics: [
          { name: "Listening & Speaking", strand: "Language Activities", learningOutcomes: ["Listen to and follow instructions", "Pronounce sounds correctly", "Answer WH-questions"] },
          { name: "Reading", strand: "Language Activities", learningOutcomes: ["Recognize letter sounds a-z", "Blend sounds to read 3-letter words", "Read sight words"] },
          { name: "Writing", strand: "Language Activities", learningOutcomes: ["Form letters correctly", "Write own name", "Copy words"] },
          { name: "Grammar", strand: "Language Use", learningOutcomes: ["Use nouns (people, places, things)", "Use pronouns (I, you, he, she)", "Form simple sentences"] },
        ],
      },
      {
        name: "Kiswahili",
        topics: [
          { name: "Kusikiliza na Kuzungumza", strand: "Shughuli za Lugha", learningOutcomes: ["Kusikiliza na kufata maelekezo", "Kujitambulisha kwa Kiswahili", "Kujibu maswali rahisi"] },
          { name: "Kusoma", strand: "Shughuli za Lugha", learningOutcomes: ["Kutambua sauti za herufi", "Kusoma maneno mafupi", "Kusoma sentensi fupi"] },
          { name: "Kuandika", strand: "Shughuli za Lugha", learningOutcomes: ["Kuandika herufi", "Kuandika jina lake", "Kukopa maneno"] },
        ],
      },
      {
        name: "Mathematics",
        topics: [
          { name: "Numbers", strand: "Numbers", subStrand: "Counting", learningOutcomes: ["Count 1-50", "Read and write numbers 1-20", "Order numbers 1-20"] },
          { name: "Addition", strand: "Numbers", subStrand: "Operations", learningOutcomes: ["Add within 10 using objects", "Solve word problems involving addition within 10"] },
          { name: "Subtraction", strand: "Numbers", subStrand: "Operations", learningOutcomes: ["Subtract within 10 using objects", "Solve word problems involving subtraction within 10"] },
          { name: "Measurement", strand: "Measurement", subStrand: "Length", learningOutcomes: ["Compare length (longer, shorter)", "Measure using non-standard units"] },
          { name: "Geometry", strand: "Geometry", subStrand: "Shapes", learningOutcomes: ["Identify 2D shapes (circle, square, triangle, rectangle)", "Sort shapes"] },
        ],
      },
      {
        name: "Environmental Activities",
        topics: [
          { name: "My Family", strand: "Social Environment", learningOutcomes: ["Name family members", "Describe relationships in the family", "Identify roles of family members"] },
          { name: "My School", strand: "Social Environment", learningOutcomes: ["Name parts of the school", "Identify school rules", "Describe activities done in school"] },
          { name: "My Body", strand: "Health Education", learningOutcomes: ["Name parts of the body", "Describe functions of body parts", "Practice personal hygiene"] },
          { name: "Plants & Animals", strand: "Natural Environment", learningOutcomes: ["Identify common plants", "Identify common animals", "Classify plants and animals"] },
        ],
      },
      {
        name: "Creative Activities",
        topics: [
          { name: "Art & Craft", strand: "Creative Arts", learningOutcomes: ["Draw and colour", "Make simple crafts using local materials", "Appreciate own and others' work"] },
          { name: "Music", strand: "Creative Arts", learningOutcomes: ["Sing simple songs", "Clap rhythms", "Use body percussion"] },
          { name: "Physical Education", strand: "Psychomotor", learningOutcomes: ["Perform basic locomotor movements", "Play simple games", "Maintain body balance"] },
        ],
      },
      {
        name: "Religious Education",
        topics: [
          { name: "Creation", strand: "Christian/Islamic/Hindu CRE", learningOutcomes: ["Appreciate God's creation", "Name things God created", "Care for creation"] },
          { name: "The Bible/Quran", strand: "Scripture", learningOutcomes: ["Identify holy books", "Name key figures in the scriptures"] },
        ],
      },
    ],
  },
  "Grade 2": {
    name: "Grade 2",
    level: "lower-primary",
    subjects: [
      {
        name: "English",
        topics: [
          { name: "Listening & Speaking", strand: "Language Activities", learningOutcomes: ["Follow longer instructions", "Participate in conversations", "Retell stories"] },
          { name: "Reading", strand: "Language Activities", learningOutcomes: ["Read consonant-vowel-consonant words", "Read short sentences", "Read simple stories"] },
          { name: "Writing", strand: "Language Activities", learningOutcomes: ["Write simple sentences", "Punctuate sentences (capital, full stop)", "Write short compositions"] },
          { name: "Grammar", strand: "Language Use", learningOutcomes: ["Use articles (a, an, the)", "Use present tense", "Form plurals"] },
        ],
      },
      {
        name: "Kiswahili",
        topics: [
          { name: "Kusikiliza na Kuzungumza", strand: "Shughuli za Lugha", learningOutcomes: ["Kushiriki mazungumzo", "Kusimulia hadithi fupi"] },
          { name: "Kusoma", strand: "Shughuli za Lugha", learningOutcomes: ["Kusoma maneno ya masafa", "Kusoma sentensi ndefu"] },
          { name: "Kuandika", strand: "Shughuli za Lugha", learningOutcomes: ["Kuandika sentensi fupi", "Kutumia alama za uakifishi"] },
        ],
      },
      {
        name: "Mathematics",
        topics: [
          { name: "Numbers", strand: "Numbers", subStrand: "Counting", learningOutcomes: ["Count 1-100", "Read and write numbers 1-100", "Identify place value (tens, ones)"] },
          { name: "Addition & Subtraction", strand: "Numbers", subStrand: "Operations", learningOutcomes: ["Add within 20", "Subtract within 20", "Solve word problems within 20"] },
          { name: "Fractions", strand: "Numbers", subStrand: "Fractions", learningOutcomes: ["Identify half and quarter", "Shade fractions of shapes"] },
          { name: "Measurement", strand: "Measurement", learningOutcomes: ["Measure length using standard units (cm)", "Tell time (o'clock, half past)", "Identify Kenyan currency"] },
          { name: "Geometry", strand: "Geometry", learningOutcomes: ["Identify 3D shapes (cube, sphere)", "Make patterns using shapes"] },
        ],
      },
      {
        name: "Environmental Activities",
        topics: [
          { name: "My Community", strand: "Social Environment", learningOutcomes: ["Name community helpers", "Describe community services"] },
          { name: "Weather & Seasons", strand: "Natural Environment", learningOutcomes: ["Name types of weather", "Describe seasons in Kenya"] },
          { name: "Health & Nutrition", strand: "Health Education", learningOutcomes: ["Identify healthy foods", "Practice good eating habits"] },
          { name: "Matter & Energy", strand: "Science", learningOutcomes: ["Identify states of matter (solid, liquid, gas)", "Describe properties of materials"] },
        ],
      },
      {
        name: "Creative Activities",
        topics: [
          { name: "Art & Craft", strand: "Creative Arts", learningOutcomes: ["Use different techniques (drawing, painting, modelling)", "Create patterns"] },
          { name: "Music", strand: "Creative Arts", learningOutcomes: ["Sing in groups", "Identify pitch (high, low)"] },
        ],
      },
    ],
  },
  "Grade 3": {
    name: "Grade 3",
    level: "lower-primary",
    subjects: [
      {
        name: "English",
        topics: [
          { name: "Reading Comprehension", strand: "Language Activities", learningOutcomes: ["Read and understand short passages", "Answer comprehension questions", "Identify main ideas"] },
          { name: "Writing", strand: "Language Activities", learningOutcomes: ["Write descriptive compositions", "Use punctuation correctly", "Write letters and invitations"] },
          { name: "Grammar", strand: "Language Use", learningOutcomes: ["Use past and future tense", "Use adjectives", "Use conjunctions (and, but, because)"] },
        ],
      },
      {
        name: "Kiswahili",
        topics: [
          { name: "Ufahamu", strand: "Lugha", learningOutcomes: ["Kusoma na kuelewa makala fupi", "Kujibu maswali ya ufahamu"] },
          { name: "Sarufi", strand: "Lugha", learningOutcomes: ["Kutumia vivumishi", "Kutumia viunganishi"] },
        ],
      },
      {
        name: "Mathematics",
        topics: [
          { name: "Numbers", strand: "Numbers", learningOutcomes: ["Count 1-1000", "Place value (hundreds, tens, ones)", "Odd and even numbers"] },
          { name: "Addition & Subtraction", strand: "Numbers", learningOutcomes: ["Add within 100", "Subtract within 100", "Solve 2-step word problems"] },
          { name: "Multiplication", strand: "Numbers", learningOutcomes: ["Multiply by 2, 5, 10", "Use multiplication in word problems"] },
          { name: "Division", strand: "Numbers", learningOutcomes: ["Divide by 2, 5", "Share equally"] },
          { name: "Measurement", strand: "Measurement", learningOutcomes: ["Measure mass (kg, g)", "Measure capacity (litres)", "Add and subtract money"] },
        ],
      },
      {
        name: "Environmental Activities",
        topics: [
          { name: "Maps & Direction", strand: "Social Environment", learningOutcomes: ["Read simple maps", "Identify cardinal directions"] },
          { name: "Living Things", strand: "Science", learningOutcomes: ["Classify living and non-living things", "Describe characteristics of living things"] },
          { name: "Energy & Force", strand: "Science", learningOutcomes: ["Identify sources of energy", "Describe push and pull forces"] },
        ],
      },
    ],
  },

  // ================================================================
  // UPPER PRIMARY (Grade 4-6)
  // ================================================================
  "Grade 4": {
    name: "Grade 4",
    level: "upper-primary",
    subjects: [
      {
        name: "English",
        topics: [
          { name: "Reading Comprehension", strand: "Language Activities", learningOutcomes: ["Read longer passages", "Make predictions", "Identify cause and effect"] },
          { name: "Writing", strand: "Language Activities", learningOutcomes: ["Write narrative compositions", "Write informal letters", "Use paragraphs"] },
          { name: "Grammar", strand: "Language Use", learningOutcomes: ["Use prepositions", "Use adverbs", "Identify subject and predicate"] },
        ],
      },
      {
        name: "Kiswahili",
        topics: [
          { name: "Ufahamu", strand: "Lugha", learningOutcomes: ["Kuelewa maudhui ya makala", "Kuchambua hoja"] },
          { name: "Sarufi", strand: "Lugha", learningOutcomes: ["Aina za maneno (nomino, vihisishi)", "Nyambula"] },
        ],
      },
      {
        name: "Mathematics",
        topics: [
          { name: "Whole Numbers", strand: "Numbers", learningOutcomes: ["Read and write numbers up to 10,000", "Round off numbers", "Factors and multiples"] },
          { name: "Operations", strand: "Numbers", learningOutcomes: ["Multiply 2-digit by 1-digit", "Divide 2-digit by 1-digit", "Long division"] },
          { name: "Fractions", strand: "Numbers", learningOutcomes: ["Equivalent fractions", "Add and subtract fractions with same denominator", "Mixed numbers"] },
          { name: "Decimals", strand: "Numbers", learningOutcomes: ["Read and write decimals up to 2 places", "Convert fractions to decimals"] },
          { name: "Geometry", strand: "Geometry", learningOutcomes: ["Identify angles (right, acute, obtuse)", "Measure angles using protractor"] },
          { name: "Data Handling", strand: "Data Handling", learningOutcomes: ["Collect and organize data", "Draw bar graphs", "Interpret pictographs"] },
        ],
      },
      {
        name: "Science & Technology",
        topics: [
          { name: "Living Things", strand: "Living Things", learningOutcomes: ["Plant structures and functions", "Animal classification", "Human digestive system"] },
          { name: "Matter", strand: "Matter", learningOutcomes: ["States of matter", "Changes of state", "Properties of materials"] },
          { name: "Energy", strand: "Energy", learningOutcomes: ["Sources of light", "Sources of heat", "Sound energy"] },
          { name: "Earth & Space", strand: "Earth & Space", learningOutcomes: ["Solar system", "Day and night", "Phases of the moon"] },
        ],
      },
      {
        name: "Social Studies",
        topics: [
          { name: "Kenya", strand: "Geography", learningOutcomes: ["Locate Kenya on a map", "Identify counties of Kenya", "Describe physical features"] },
          { name: "People & Culture", strand: "Social Studies", learningOutcomes: ["Identify communities in Kenya", "Describe cultural practices"] },
        ],
      },
      {
        name: "Christian Religious Education",
        topics: [
          { name: "Creation", strand: "CRE", learningOutcomes: ["The story of creation", "Responsibility for creation"] },
          { name: "Bible Characters", strand: "CRE", learningOutcomes: ["Abraham", "Moses", "David"] },
        ],
      },
      {
        name: "Creative Arts",
        topics: [
          { name: "Art & Craft", strand: "Creative Arts", learningOutcomes: ["Drawing techniques", "Colour theory", "3D modelling"] },
        ],
      },
    ],
  },
  "Grade 5": {
    name: "Grade 5",
    level: "upper-primary",
    subjects: [
      {
        name: "Mathematics",
        topics: [
          { name: "Whole Numbers", strand: "Numbers", learningOutcomes: ["Numbers up to 1,000,000", "Roman numerals", "Square numbers"] },
          { name: "Fractions & Decimals", strand: "Numbers", learningOutcomes: ["Add/subtract unlike fractions", "Multiply fractions", "Percentages"] },
          { name: "Geometry", strand: "Geometry", learningOutcomes: ["Construct triangles", "Properties of quadrilaterals", "Nets of 3D shapes"] },
          { name: "Measurement", strand: "Measurement", learningOutcomes: ["Area of rectangles and squares", "Volume of cubes", "Speed, distance, time"] },
          { name: "Data Handling", strand: "Data Handling", learningOutcomes: ["Mean, median, mode", "Line graphs", "Probability"] },
        ],
      },
      {
        name: "Science & Technology",
        topics: [
          { name: "Human Body Systems", strand: "Living Things", learningOutcomes: ["Respiratory system", "Circulatory system", "Skeletal system"] },
          { name: "Materials & Matter", strand: "Matter", learningOutcomes: ["Mixtures and separation", "Physical and chemical changes"] },
          { name: "Energy & Machines", strand: "Energy", learningOutcomes: ["Electric circuits", "Simple machines", "Levers"] },
        ],
      },
      {
        name: "Social Studies",
        topics: [
          { name: "Kenyan Government", strand: "Civics", learningOutcomes: ["Arms of government", "Rights and responsibilities", "Democracy"] },
          { name: "Economic Activities", strand: "Economics", learningOutcomes: ["Agriculture in Kenya", "Tourism", "Trade"] },
        ],
      },
    ],
  },
  "Grade 6": {
    name: "Grade 6",
    level: "upper-primary",
    subjects: [
      {
        name: "Mathematics",
        topics: [
          { name: "Numbers", strand: "Numbers", learningOutcomes: ["Largest numbers up to 10,000,000", "HCF and LCM", "Ratios and proportions"] },
          { name: "Algebra", strand: "Algebra", learningOutcomes: ["Simple equations", "Forming and solving equations"] },
          { name: "Geometry", strand: "Geometry", learningOutcomes: ["Pythagoras theorem (introduction)", "Circle properties", "Bearings and distances"] },
          { name: "Commercial Arithmetic", strand: "Money", learningOutcomes: ["Profit and loss", "Simple interest", "Hire purchase", "Bills and invoices"] },
        ],
      },
      {
        name: "Science & Technology",
        topics: [
          { name: "Human Reproduction", strand: "Living Things", learningOutcomes: ["Reproductive system", "Changes in adolescence", "HIV/AIDS awareness"] },
          { name: "Environment", strand: "Environment", learningOutcomes: ["Ecosystems", "Food chains and webs", "Conservation"] },
          { name: "Technology", strand: "Technology", learningOutcomes: ["Information communication technology", "Internet safety"] },
        ],
      },
      {
        name: "Social Studies",
        topics: [
          { name: "East Africa", strand: "Geography", learningOutcomes: ["Countries of East Africa", "Physical features", "Climate"] },
          { name: "National Integration", strand: "Civics", learningOutcomes: ["National values", "Cohesion and inclusion"] },
        ],
      },
    ],
  },

  // ================================================================
  // JUNIOR SCHOOL (Grade 7-9)
  // ================================================================
  "Grade 7": {
    name: "Grade 7",
    level: "junior-school",
    subjects: [
      {
        name: "Mathematics",
        topics: [
          { name: "Numbers", strand: "Numbers", learningOutcomes: ["Divisibility tests", "Squares and square roots", "GCD and LCM"] },
          { name: "Fractions & Decimals", strand: "Numbers", learningOutcomes: ["Operations with fractions", "Recurring decimals", "Standard form"] },
          { name: "Algebra", strand: "Algebra", learningOutcomes: ["Algebraic expressions", "Linear equations in one unknown", "Simplifying expressions"] },
          { name: "Geometry", strand: "Geometry", learningOutcomes: ["Geometric constructions", "Angles in triangles and polygons", "Pythagoras theorem"] },
          { name: "Data Handling", strand: "Data Handling", learningOutcomes: ["Frequency distribution tables", "Bar graphs and pie charts", "Measures of central tendency"] },
        ],
      },
      {
        name: "Integrated Science",
        topics: [
          { name: "Scientific Investigation", strand: "Scientific Skills", learningOutcomes: ["Scientific method", "Laboratory safety", "Measuring instruments"] },
          { name: "Matter", strand: "Chemistry", learningOutcomes: ["Structure of matter", "Atoms and molecules", "Elements and compounds", "Periodic table introduction"] },
          { name: "Living Things", strand: "Biology", learningOutcomes: ["Classification of living organisms", "Cells and cell theory", "Human body systems (digestion, respiration)"] },
          { name: "Force & Energy", strand: "Physics", learningOutcomes: ["Types of forces", "Work and energy", "Simple machines"] },
          { name: "Earth & Environment", strand: "Earth Science", learningOutcomes: ["Rock cycle", "Weather and climate", "Environmental conservation"] },
        ],
      },
      {
        name: "English",
        topics: [
          { name: "Comprehension & Literature", strand: "Language", learningOutcomes: ["Reading longer texts", "Literary devices (simile, metaphor, personification)", "Analyzing characters"] },
          { name: "Writing", strand: "Language", learningOutcomes: ["Expository essays", "Argumentative writing", "Formal letters"] },
          { name: "Grammar", strand: "Language", learningOutcomes: ["Direct and indirect speech", "Active and passive voice", "Conditionals"] },
        ],
      },
      {
        name: "Kiswahili",
        topics: [
          { name: "Ufahamu na Fasihi", strand: "Lugha", learningOutcomes: ["Kuelewa maandishi", "Fasihi simulizi", "Methali na nahau"] },
          { name: "Sarufi", strand: "Lugha", learningOutcomes: ["Aina za maneno", "Nyambula", "Viunganishi"] },
        ],
      },
      {
        name: "Social Studies",
        topics: [
          { name: "African History", strand: "History", learningOutcomes: ["Early civilizations in Africa", "Colonial period in Kenya", "Mau Mau uprising"] },
          { name: "Government & Governance", strand: "Civics", learningOutcomes: ["Kenyan constitution", "Devolved government", "Human rights"] },
        ],
      },
      {
        name: "Pre-Tech Studies",
        topics: [
          { name: "Agriculture", strand: "Agriculture", learningOutcomes: ["Crop production", "Soil management", "Animal husbandry"] },
          { name: "Computer Studies", strand: "Technology", learningOutcomes: ["Computer hardware", "Software types", "Internet and email"] },
        ],
      },
    ],
  },
  "Grade 8": {
    name: "Grade 8",
    level: "junior-school",
    subjects: [
      {
        name: "Mathematics",
        topics: [
          { name: "Numbers", strand: "Numbers", learningOutcomes: ["Integers (positive and negative)", "Rational numbers", "Indices and powers"] },
          { name: "Algebra", strand: "Algebra", learningOutcomes: ["Linear equations in two unknowns", "Factorization", "Algebraic fractions"] },
          { name: "Geometry", strand: "Geometry", learningOutcomes: ["Circle theorems", "Similar and congruent figures", "Transformations (reflection, rotation, translation)"] },
          { name: "Trigonometry", strand: "Trigonometry", learningOutcomes: ["Sine, cosine, tangent", "Angles of elevation and depression", "Bearings"] },
          { name: "Statistics", strand: "Data Handling", learningOutcomes: ["Histograms", "Cumulative frequency", "Probability (simple events)"] },
        ],
      },
      {
        name: "Integrated Science",
        topics: [
          { name: "Chemistry", strand: "Chemistry", learningOutcomes: ["Chemical reactions", "Acids, bases and salts", "pH scale"] },
          { name: "Biology", strand: "Biology", learningOutcomes: ["Photosynthesis", "Respiration", "Transport in plants and animals", "Excretion"] },
          { name: "Physics", strand: "Physics", learningOutcomes: ["Electricity and magnetism", "Light (reflection, refraction)", "Heat transfer"] },
          { name: "Earth Science", strand: "Earth Science", learningOutcomes: ["Tectonic plates", "Volcanoes and earthquakes", "Atmosphere"] },
        ],
      },
      {
        name: "English",
        topics: [
          { name: "Literature", strand: "Language", learningOutcomes: ["Set books analysis", "Poetry analysis", "Drama"] },
          { name: "Writing", strand: "Language", learningOutcomes: ["Creative writing", "Report writing", "Review writing"] },
        ],
      },
      {
        name: "Social Studies",
        topics: [
          { name: "World History", strand: "History", learningOutcomes: ["World wars", "Cold War", "Independence movements in Africa"] },
          { name: "Economic Geography", strand: "Geography", learningOutcomes: ["Natural resources", "Trade and development", "Globalization"] },
        ],
      },
    ],
  },
  "Grade 9": {
    name: "Grade 9",
    level: "junior-school",
    subjects: [
      {
        name: "Mathematics",
        topics: [
          { name: "Numbers", strand: "Numbers", learningOutcomes: ["Surds and irrational numbers", "Standard form and significant figures", "Compound interest"] },
          { name: "Algebra", strand: "Algebra", learningOutcomes: ["Quadratic equations", "Simultaneous equations", "Inequalities", "Graphs of functions"] },
          { name: "Geometry & Trigonometry", strand: "Geometry", learningOutcomes: ["Area and volume of complex shapes", "Trigonometric ratios", "Coordinate geometry"] },
          { name: "Statistics & Probability", strand: "Data Handling", learningOutcomes: ["Standard deviation", "Tree diagrams", "Mutually exclusive and independent events"] },
        ],
      },
      {
        name: "Integrated Science",
        topics: [
          { name: "Chemistry", strand: "Chemistry", learningOutcomes: ["Periodic table", "Chemical bonding", "Electrolysis", "Organic chemistry introduction"] },
          { name: "Biology", strand: "Biology", learningOutcomes: ["Genetics and inheritance", "Evolution", "Ecology and ecosystems", "Human reproduction"] },
          { name: "Physics", strand: "Physics", learningOutcomes: ["Waves (sound, light)", "Electromagnetic spectrum", "Nuclear physics introduction"] },
        ],
      },
      {
        name: "English",
        topics: [
          { name: "Set Books", strand: "Literature", learningOutcomes: ["Analyze prescribed texts", "Identify themes and styles", "Write critical essays"] },
          { name: "Oral Literature", strand: "Literature", learningOutcomes: ["Types of oral literature", "Functions of oral literature"] },
        ],
      },
    ],
  },

  // ================================================================
  // SENIOR SCHOOL (Form 1-4 / Grade 10-12)
  // ================================================================
  "Form 1": {
    name: "Form 1",
    level: "senior-school",
    subjects: [
      {
        name: "Mathematics",
        topics: [
          { name: "Numbers", strand: "Numbers", learningOutcomes: ["Integers", "Factors and multiples", "Fractions and decimals", "Squares and square roots", "Number sequences"] },
          { name: "Algebra", strand: "Algebra", learningOutcomes: ["Algebraic expressions", "Linear equations", "Inequalities", "Graphs of linear functions"] },
          { name: "Geometry", strand: "Geometry", learningOutcomes: ["Geometric constructions", "Angles and polygons", "Area and perimeter"] },
          { name: "Statistics", strand: "Statistics", learningOutcomes: ["Data collection and presentation", "Measures of central tendency", "Frequency distributions"] },
          { name: "Commercial Arithmetic", strand: "Money", learningOutcomes: ["Profit, loss, discount", "Commission and hire purchase", "Simple and compound interest"] },
        ],
      },
      {
        name: "Biology",
        topics: [
          { name: "Introduction to Biology", strand: "Scientific Skills", learningOutcomes: ["Definition and branches of biology", "Scientific method", "Laboratory safety"] },
          { name: "Cell Biology", strand: "Cell & Tissues", learningOutcomes: ["Cell structure and function", "Cell organelles", "Cell division (mitosis, meiosis)"] },
          { name: "Classification of Living Things", strand: "Classification", learningOutcomes: ["Kingdoms of living organisms", "Binomial nomenclature"] },
          { name: "Nutrition", strand: "Nutrition", learningOutcomes: ["Modes of nutrition", "Photosynthesis", "Human digestive system"] },
          { name: "Respiration", strand: "Respiration", learningOutcomes: ["Aerobic and anaerobic respiration", "Respiratory system in humans"] },
        ],
      },
      {
        name: "Chemistry",
        topics: [
          { name: "Introduction to Chemistry", strand: "Introduction", learningOutcomes: ["Role of chemistry in society", "Laboratory apparatus and safety"] },
          { name: "Simple Classification of Substances", strand: "Matter", learningOutcomes: ["Mixtures and pure substances", "Methods of separation", "Physical and chemical changes"] },
          { name: "Acids, Bases & Indicators", strand: "Acids & Bases", learningOutcomes: ["Common acids and bases", "pH scale", "Indicators"] },
          { name: "Air & Combustion", strand: "Air", learningOutcomes: ["Composition of air", "Oxygen and combustion", "Rusting"] },
          { name: "Water & Hydrogen", strand: "Water", learningOutcomes: ["Properties of water", "Reaction of metals with water", "Hydrogen preparation"] },
        ],
      },
      {
        name: "Physics",
        topics: [
          { name: "Introduction to Physics", strand: "Introduction", learningOutcomes: ["Branches of physics", "Laboratory safety", "Measuring instruments"] },
          { name: "Force", strand: "Force", learningOutcomes: ["Types of forces", "Mass and weight", "Gravity and friction"] },
          { name: "Motion", strand: "Motion", learningOutcomes: ["Distance, displacement, speed, velocity", "Acceleration", "Equations of motion"] },
          { name: "Work, Energy & Power", strand: "Energy", learningOutcomes: ["Forms of energy", "Work done", "Power and efficiency"] },
          { name: "Machines", strand: "Machines", learningOutcomes: ["Simple machines (lever, pulley, inclined plane)", "Mechanical advantage"] },
        ],
      },
      {
        name: "English",
        topics: [
          { name: "Comprehension", strand: "Language", learningOutcomes: ["Reading and understanding passages", "Vocabulary in context"] },
          { name: "Grammar", strand: "Language", learningOutcomes: ["Parts of speech review", "Sentence construction", "Tenses"] },
          { name: "Literature", strand: "Literature", learningOutcomes: ["Introduction to literary genres", "Oral literature", "Poetry"] },
        ],
      },
      {
        name: "Kiswahili",
        topics: [
          { name: "Sarufi", strand: "Lugha", learningOutcomes: ["Aina za nomino", "Nyambula", "Viunganishi"] },
          { name: "Fasihi", strand: "Fasihi", learningOutcomes: ["Fasihi simulizi", "Methali", "Nahau"] },
        ],
      },
      {
        name: "Geography",
        topics: [
          { name: "Physical Geography", strand: "Physical", learningOutcomes: ["Earth and the solar system", "Weather and climate", "Rocks and minerals"] },
          { name: "Human Geography", strand: "Human", learningOutcomes: ["Population", "Settlements"] },
        ],
      },
      {
        name: "History & Government",
        topics: [
          { name: "Introduction to History", strand: "History", learningOutcomes: ["Meaning and importance of history", "Sources of history"] },
          { name: "Early Man", strand: "Pre-colonial", learningOutcomes: ["Origin of man", "Stone Age periods"] },
          { name: "Kenyan Constitution", strand: "Government", learningOutcomes: ["Making of the constitution", "Rights and freedoms"] },
        ],
      },
    ],
  },
  "Form 2": {
    name: "Form 2",
    level: "senior-school",
    subjects: [
      {
        name: "Mathematics",
        topics: [
          { name: "Numbers", strand: "Numbers", learningOutcomes: ["Cubes and cube roots", "Indices and logarithms", "Equations of lines"] },
          { name: "Algebra", strand: "Algebra", learningOutcomes: ["Factorization of quadratic expressions", "Simultaneous equations", "Inequalities in one variable"] },
          { name: "Geometry", strand: "Geometry", learningOutcomes: ["Similar and congruent triangles", "Pythagoras theorem", "Trigonometric ratios (sin, cos, tan)"] },
          { name: "Statistics", strand: "Statistics", learningOutcomes: ["Mean, median, mode of grouped data", "Cumulative frequency"] },
          { name: "Commercial Arithmetic", strand: "Money", learningOutcomes: ["Compound interest", "Appreciation and depreciation", "Hire purchase"] },
        ],
      },
      {
        name: "Biology",
        topics: [
          { name: "Transport in Plants & Animals", strand: "Transport", learningOutcomes: ["Transport in plants (xylem, phloem)", "Human circulatory system", "Blood composition"] },
          { name: "Gaseous Exchange", strand: "Gaseous Exchange", learningOutcomes: ["Gaseous exchange in plants", "Human respiratory system", "Breathing mechanism"] },
          { name: "Excretion", strand: "Excretion", learningOutcomes: ["Excretion in plants", "Human urinary system", "Skin as an excretory organ"] },
          { name: "Reproduction", strand: "Reproduction", learningOutcomes: ["Asexual reproduction", "Sexual reproduction in plants", "Human reproductive system"] },
        ],
      },
      {
        name: "Chemistry",
        topics: [
          { name: "Structure of the Atom", strand: "Atomic Structure", learningOutcomes: ["Sub-atomic particles", "Atomic number and mass number", "Electronic configuration"] },
          { name: "Periodic Table", strand: "Periodic Table", learningOutcomes: ["Periodic law", "Groups and periods", "Trends in the periodic table"] },
          { name: "Chemical Bonds", strand: "Bonding", learningOutcomes: ["Ionic bonds", "Covalent bonds", "Metallic bonds"] },
          { name: "Salts", strand: "Salts", learningOutcomes: ["Types of salts", "Preparation of salts", "Solubility of salts"] },
        ],
      },
      {
        name: "Physics",
        topics: [
          { name: "Light", strand: "Light", learningOutcomes: ["Reflection of light", "Refraction of light", "Lenses and optical instruments"] },
          { name: "Electricity", strand: "Electricity", learningOutcomes: ["Electric current", "Ohm's law", "Series and parallel circuits"] },
          { name: "Magnetism", strand: "Magnetism", learningOutcomes: ["Properties of magnets", "Magnetic fields", "Electromagnetism"] },
          { name: "Heat", strand: "Heat", learningOutcomes: ["Thermal expansion", "Heat transfer (conduction, convection, radiation)"] },
        ],
      },
    ],
  },
  "Form 3": {
    name: "Form 3",
    level: "senior-school",
    subjects: [
      {
        name: "Mathematics",
        topics: [
          { name: "Algebra", strand: "Algebra", learningOutcomes: ["Quadratic equations", "Graphs of quadratic functions", "Inequalities in two variables"] },
          { name: "Trigonometry", strand: "Trigonometry", learningOutcomes: ["Sine and cosine rules", "Trigonometric identities", "Angles of elevation and depression"] },
          { name: "Geometry", strand: "Geometry", learningOutcomes: ["Circle theorems", "Longitudes and latitudes", "Bearings and distances"] },
          { name: "Statistics", strand: "Statistics", learningOutcomes: ["Probability of combined events", "Tree diagrams", "Standard deviation"] },
          { name: "Vectors", strand: "Vectors", learningOutcomes: ["Vector addition and subtraction", "Position vectors", "Magnitude of vectors"] },
        ],
      },
      {
        name: "Biology",
        topics: [
          { name: "Ecology", strand: "Ecology", learningOutcomes: ["Ecosystems", "Food chains and webs", "Population ecology", "Environmental conservation"] },
          { name: "Genetics", strand: "Genetics", learningOutcomes: ["Mendel's laws", "Monohybrid and dihybrid crosses", "Sex determination"] },
          { name: "Evolution", strand: "Evolution", learningOutcomes: ["Theories of evolution", "Evidence of evolution", "Natural selection"] },
          { name: "Response & Coordination", strand: "Coordination", learningOutcomes: ["Nervous system", "Endocrine system", "Sense organs"] },
        ],
      },
      {
        name: "Chemistry",
        topics: [
          { name: "Moles & Stoichiometry", strand: "Moles", learningOutcomes: ["Mole concept", "Molar solutions", "Volumetric analysis (titration)"] },
          { name: "Organic Chemistry", strand: "Organic", learningOutcomes: ["Hydrocarbons (alkanes, alkenes, alkynes)", "Alcohols", "Carboxylic acids"] },
          { name: "Electrochemistry", strand: "Electrochemistry", learningOutcomes: ["Electrolysis", "Electrochemical cells", "Electroplating"] },
          { name: "Energy Changes", strand: "Thermochemistry", learningOutcomes: ["Exothermic and endothermic reactions", "Bond energies"] },
        ],
      },
      {
        name: "Physics",
        topics: [
          { name: "Waves", strand: "Waves", learningOutcomes: ["Wave properties", "Sound waves", "Electromagnetic spectrum"] },
          { name: "Electromagnetism", strand: "Electromagnetism", learningOutcomes: ["Electromagnetic induction", "Transformers", "AC circuits"] },
          { name: "Electronics", strand: "Electronics", learningOutcomes: ["Semiconductors", "Diodes and transistors", "Logic gates"] },
          { name: "Nuclear Physics", strand: "Nuclear", learningOutcomes: ["Radioactivity", "Nuclear fission and fusion", "Half-life"] },
        ],
      },
    ],
  },
  "Form 4": {
    name: "Form 4",
    level: "senior-school",
    subjects: [
      {
        name: "Mathematics",
        topics: [
          { name: "Matrices & Determinants", strand: "Matrices", learningOutcomes: ["Matrix operations", "Determinants 2×2 and 3×3", "Inverse of a matrix"] },
          { name: "Differentiation", strand: "Calculus", learningOutcomes: ["Limits", "Derivatives of polynomials", "Application of differentiation (rate of change, maxima/minima)"] },
          { name: "Integration", strand: "Calculus", learningOutcomes: ["Indefinite integrals", "Definite integrals", "Area under a curve"] },
          { name: "Probability", strand: "Probability", learningOutcomes: ["Conditional probability", "Bayes' theorem (introduction)", "Permutations and combinations"] },
          { name: "Statistics", strand: "Statistics", learningOutcomes: ["Normal distribution", "Hypothesis testing (introduction)", "Correlation and regression"] },
        ],
      },
      {
        name: "Biology",
        topics: [
          { name: "Plant & Animal Responses", strand: "Responses", learningOutcomes: ["Tropisms in plants", "Nervous coordination", "Homeostasis"] },
          { name: "Human Health & Diseases", strand: "Health", learningOutcomes: ["Immunity", "Common diseases (malaria, typhoid, HIV/AIDS)", "Drug abuse"] },
          { name: "Conservation", strand: "Conservation", learningOutcomes: ["Wildlife conservation", "Endangered species", "Sustainable development"] },
        ],
      },
      {
        name: "Chemistry",
        topics: [
          { name: "Rates of Reaction", strand: "Kinetics", learningOutcomes: ["Factors affecting reaction rates", "Collision theory", "Catalysts"] },
          { name: "Equilibrium", strand: "Equilibrium", learningOutcomes: ["Le Chatelier's principle", "Equilibrium constant"] },
          { name: "Analytical Chemistry", strand: "Analysis", learningOutcomes: ["Qualitative analysis (cation, anion tests)", "Flame tests"] },
        ],
      },
      {
        name: "Physics",
        topics: [
          { name: "Fluid Mechanics", strand: "Fluids", learningOutcomes: ["Pressure in fluids", "Archimedes' principle", "Bernoulli's principle"] },
          { name: "Optical Instruments", strand: "Optics", learningOutcomes: ["Microscope", "Telescope", "Camera"] },
          { name: "Photoelectric Effect", strand: "Modern Physics", learningOutcomes: ["Photoelectric effect", "Wave-particle duality"] },
        ],
      },
    ],
  },
};

// =====================================================================
// CURRICULUM ENGINE — grounding, validation, context building
// =====================================================================

/**
 * Get the full curriculum for a specific grade.
 */
export function getCurriculumForGrade(grade: string): CurriculumGrade | null {
  return KENYA_CBC_CURRICULUM[grade] ?? null;
}

/**
 * Get all available grades.
 */
export function getAvailableGrades(): string[] {
  return Object.keys(KENYA_CBC_CURRICULUM);
}

/**
 * Check if a topic is within the curriculum for a given grade + subject.
 * Uses fuzzy matching — checks if the topic name appears in any of the
 * curriculum topics for that grade/subject.
 */
export function isWithinCurriculum(grade: string, subject: string, topic: string): boolean {
  const curriculum = getCurriculumForGrade(grade);
  if (!curriculum) return true; // If we don't have the curriculum, allow it

  const subjectData = curriculum.subjects.find((s) =>
    s.name.toLowerCase().includes(subject.toLowerCase()) ||
    subject.toLowerCase().includes(s.name.toLowerCase())
  );
  if (!subjectData) return true; // If we don't have the subject, allow it

  // Check if the topic matches any curriculum topic
  const topicLower = topic.toLowerCase();
  return subjectData.topics.some((t) =>
    t.name.toLowerCase().includes(topicLower) ||
    topicLower.includes(t.name.toLowerCase()) ||
    t.strand?.toLowerCase().includes(topicLower) ||
    topicLower.includes(t.strand?.toLowerCase() ?? "")
  );
}

/**
 * Build a curriculum context string for the AI tutor system prompt.
 * This grounds the AI within the student's curriculum — the AI should
 * NEVER go outside the curriculum topics for the student's grade level.
 *
 * Returns a system prompt suffix that includes:
 *   - The student's grade level
 *   - All subjects and topics for that grade
 *   - An instruction to stay within the curriculum
 */
export function buildCurriculumContext(grade: string): string {
  const curriculum = getCurriculumForGrade(grade);
  if (!curriculum) return "";

  const subjectLines: string[] = [];
  for (const subject of curriculum.subjects) {
    const topicList = subject.topics.map((t) =>
      `    - ${t.name}${t.strand ? ` (${t.strand}${t.subStrand ? ` → ${t.subStrand}` : ""})` : ""}`
    ).join("\n");
    subjectLines.push(`  ${subject.name}:\n${topicList}`);
  }

  return `\n\nCURRICULUM GROUNDING — Kenya CBC (${curriculum.name}):
The student is in ${curriculum.name} (${curriculum.level}). You MUST stay within the curriculum topics listed below. If a student asks about something outside the curriculum, politely redirect them to the relevant curriculum topic.

SUBJECTS AND TOPICS FOR ${curriculum.name}:
${subjectLines.join("\n")}

RULES:
- Only teach topics listed above for this grade level
- If a student asks about an advanced topic, say "That's a great question, but it's covered in a higher grade. Let me help you with [related curriculum topic] instead."
- If a student asks about a lower-grade topic, briefly review it and connect it to their current curriculum
- Use age-appropriate language for ${curriculum.level} students
- Reference specific learning outcomes from the curriculum when teaching`;

}

// =====================================================================
// GRADE ALIAS RESOLUTION — CBE (Competency Based Education) uses
// different naming: Grade 10 = Form 1, Grade 11 = Form 2, etc.
// The old 8-4-4 system uses "Form 1-4" for senior school.
// CBE uses "Grade 10-12" for senior school.
// Both systems share the same curriculum content.
// =====================================================================

const GRADE_ALIASES: Record<string, string> = {
  "Grade 10": "Form 1",
  "Grade 11": "Form 2",
  "Grade 12": "Form 3",
  "Grade 13": "Form 4",
  "Form 1": "Form 1",
  "Form 2": "Form 2",
  "Form 3": "Form 3",
  "Form 4": "Form 4",
};

/**
 * Resolve a grade name to the canonical key in KENYA_CBC_CURRICULUM.
 * Handles CBE aliases (Grade 10 → Form 1, etc.) and case variations.
 */
export function resolveGrade(grade: string): string {
  if (!grade) return "Form 1";
  const trimmed = grade.trim();

  // Direct match
  if (KENYA_CBC_CURRICULUM[trimmed]) return trimmed;

  // Case-insensitive match
  const lower = trimmed.toLowerCase();
  for (const key of Object.keys(KENYA_CBC_CURRICULUM)) {
    if (key.toLowerCase() === lower) return key;
  }

  // CBE alias (Grade 10 → Form 1, etc.)
  if (GRADE_ALIASES[trimmed]) return GRADE_ALIASES[trimmed];

  // Try "grade X" → "Grade X"
  const gradeMatch = trimmed.match(/grade\s*(\d+)/i);
  if (gradeMatch) {
    const gradeNum = parseInt(gradeMatch[1]);
    if (gradeNum >= 10 && gradeNum <= 13) {
      const formNum = gradeNum - 9; // Grade 10 = Form 1
      const formKey = `Form ${formNum}`;
      if (KENYA_CBC_CURRICULUM[formKey]) return formKey;
    }
    const gradeKey = `Grade ${gradeNum}`;
    if (KENYA_CBC_CURRICULUM[gradeKey]) return gradeKey;
  }

  // Try "form X" → "Form X"
  const formMatch = trimmed.match(/form\s*(\d+)/i);
  if (formMatch) {
    const formKey = `Form ${formMatch[1]}`;
    if (KENYA_CBC_CURRICULUM[formKey]) return formKey;
  }

  return "Form 1"; // Default fallback
}

/**
 * Get curriculum for a grade — resolves CBE aliases automatically.
 */
export function getCurriculumForGradeResolved(grade: string): CurriculumGrade | null {
  return getCurriculumForGrade(resolveGrade(grade));
}

/**
 * Build curriculum context — resolves CBE aliases automatically.
 */
export function buildCurriculumContextResolved(grade: string): string {
  return buildCurriculumContext(resolveGrade(grade));
}
