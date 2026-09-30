/**
 * Education catalog — single source of truth for tracks, grades, subjects,
 * and courses. Used by:
 *   - Onboarding screen (registration)
 *   - Profile screen (grade/course switching)
 *   - Admin Explore tab (project targeting)
 *   - /api/explore (filtering by user's track/grade/course)
 *   - /api/admin/course-switch-requests (review)
 *
 * Rules:
 *   - K-12 and secondary users: switch GRADES freely. No track switching after registration.
 *   - University/college/tvet users: pick a COURSE at registration. Course changes
 *     require admin review (CourseSwitchRequest).
 *   - Each course is isolated: a Medicine student should never see Machine Learning
 *     resources, even within the same university track.
 */

export type Track = {
  id: string;
  label: string;
  emoji: string;
  // Who can register on this track?
  allowGradeSwitch: boolean;  // K-12 + secondary: true (switch grades freely)
  requiresCourse: boolean;    // university/college/tvet: true (must pick a course)
  grades: string[];           // for K-12/secondary
  // Subjects shown when uploading explore projects for this track
  // (For university tracks, subjects depend on the chosen course — see COURSES below.)
  subjects: string[];
};

// ============================================================
// TRACKS
// ============================================================

export const TRACKS: Track[] = [
  {
    id: "k12",
    label: "K-12 School (CBC)",
    emoji: "📚",
    allowGradeSwitch: true,
    requiresCourse: false,
    grades: ["PP1", "PP2", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"],
    subjects: ["Mathematics", "English", "Kiswahili", "Science", "Social Studies", "Coding", "Chinese", "Life Skills", "Business", "CRE", "Islamic", "Music", "Art"],
  },
  {
    id: "secondary",
    label: "Secondary (8-4-4)",
    emoji: "🏫",
    allowGradeSwitch: true,
    requiresCourse: false,
    grades: ["Form 1", "Form 2", "Form 3", "Form 4"],
    subjects: ["Mathematics", "Physics", "Chemistry", "Biology", "English", "Kiswahili", "History", "Geography", "CRE", "Computer Studies", "Business Studies", "Agriculture", "Aviation"],
  },
  {
    id: "university",
    label: "University",
    emoji: "🎓",
    allowGradeSwitch: false,
    requiresCourse: true,
    grades: [],  // university users don't pick a "grade"
    subjects: [],  // subjects depend on course
  },
  {
    id: "college",
    label: "College / Tertiary",
    emoji: "🏛️",
    allowGradeSwitch: false,
    requiresCourse: true,
    grades: [],
    subjects: [],
  },
  {
    id: "tvet",
    label: "TVET (CDACC)",
    emoji: "🔧",
    allowGradeSwitch: false,
    requiresCourse: true,
    grades: [],
    subjects: [],
  },
];

export function getTrack(id: string): Track | undefined {
  return TRACKS.find(t => t.id === id);
}

// ============================================================
// COURSES — for university / college / TVET
// Organized by category. Each course has its own subject list
// (so a Medicine student sees Anatomy, Physiology — not Machine Learning).
// ============================================================

export type Course = {
  id: string;          // slug e.g. "bachelor-of-medicine"
  name: string;        // "Bachelor of Medicine & Surgery"
  track: "university" | "college" | "tvet";
  category: string;    // "Health Sciences", "Business", "Engineering", etc.
  subjects: string[];
};

// Helper to make course entries tersely
function c(
  name: string,
  track: "university" | "college" | "tvet",
  category: string,
  subjects: string[]
): Course {
  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    name,
    track,
    category,
    subjects,
  };
}

// ============================================================
// UNIVERSITY COURSES (Bachelor's, Master's, PhD)
// ============================================================

const HEALTH_SUBJECTS = ["Anatomy", "Physiology", "Biochemistry", "Pathology", "Pharmacology", "Microbiology", "Clinical Medicine", "Public Health"];
const ENGINEERING_SUBJECTS = ["Mathematics", "Physics", "Mechanics", "Thermodynamics", "Electrical Circuits", "Materials Science", "Engineering Drawing", "Project Management"];
const BUSINESS_SUBJECTS = ["Accounting", "Finance", "Marketing", "Management", "Economics", "Business Law", "Statistics", "Entrepreneurship"];
const COMPUTING_SUBJECTS = ["Programming", "Data Structures", "Algorithms", "Databases", "Web Development", "Software Engineering", "Machine Learning", "Computer Networks", "Operating Systems", "Cybersecurity"];

export const UNIVERSITY_COURSES: Course[] = [
  // Health Sciences
  c("Bachelor of Medicine & Surgery", "university", "Health Sciences", HEALTH_SUBJECTS),
  c("Bachelor of Nursing", "university", "Health Sciences", HEALTH_SUBJECTS),
  c("Bachelor of Pharmacy", "university", "Health Sciences", HEALTH_SUBJECTS),
  c("Bachelor of Dental Surgery", "university", "Health Sciences", HEALTH_SUBJECTS),
  c("Bachelor of Public Health", "university", "Health Sciences", HEALTH_SUBJECTS),
  c("Bachelor of Clinical Medicine", "university", "Health Sciences", HEALTH_SUBJECTS),
  // Engineering
  c("Bachelor of Civil Engineering", "university", "Engineering", ENGINEERING_SUBJECTS),
  c("Bachelor of Mechanical Engineering", "university", "Engineering", ENGINEERING_SUBJECTS),
  c("Bachelor of Electrical Engineering", "university", "Engineering", ENGINEERING_SUBJECTS),
  c("Bachelor of Mechatronic Engineering", "university", "Engineering", ENGINEERING_SUBJECTS),
  c("Bachelor of Chemical Engineering", "university", "Engineering", ENGINEERING_SUBJECTS),
  c("Bachelor of Aerospace Engineering", "university", "Engineering", ENGINEERING_SUBJECTS),
  c("Bachelor of Biomedical Engineering", "university", "Engineering", ENGINEERING_SUBJECTS),
  c("Bachelor of Agricultural Engineering", "university", "Engineering", ENGINEERING_SUBJECTS),
  // Computing & Tech
  c("Bachelor of Computer Science", "university", "Computing", COMPUTING_SUBJECTS),
  c("Bachelor of Software Engineering", "university", "Computing", COMPUTING_SUBJECTS),
  c("Bachelor of Information Technology", "university", "Computing", COMPUTING_SUBJECTS),
  c("Bachelor of Data Science", "university", "Computing", COMPUTING_SUBJECTS),
  c("Bachelor of Cyber Security", "university", "Computing", COMPUTING_SUBJECTS),
  c("Bachelor of Artificial Intelligence", "university", "Computing", COMPUTING_SUBJECTS),
  c("Bachelor of Computer Engineering", "university", "Computing", COMPUTING_SUBJECTS),
  c("Bachelor of Network Engineering", "university", "Computing", COMPUTING_SUBJECTS),
  // Business
  c("Bachelor of Commerce", "university", "Business", BUSINESS_SUBJECTS),
  c("Bachelor of Business Administration", "university", "Business", BUSINESS_SUBJECTS),
  c("Bachelor of Economics", "university", "Business", BUSINESS_SUBJECTS),
  c("Bachelor of Finance", "university", "Business", BUSINESS_SUBJECTS),
  c("Bachelor of Accounting", "university", "Business", BUSINESS_SUBJECTS),
  c("Bachelor of Marketing", "university", "Business", BUSINESS_SUBJECTS),
  c("Bachelor of Human Resource Management", "university", "Business", BUSINESS_SUBJECTS),
  c("Bachelor of Supply Chain Management", "university", "Business", BUSINESS_SUBJECTS),
  c("Bachelor of Actuarial Science", "university", "Business", BUSINESS_SUBJECTS),
  // Law
  c("Bachelor of Laws (LLB)", "university", "Law", ["Constitutional Law", "Criminal Law", "Contract Law", "Tort Law", "Property Law", "International Law", "Family Law", "Commercial Law"]),
  // Education
  c("Bachelor of Education (Arts)", "university", "Education", ["Education Foundations", "Psychology", "Teaching Methods", "Curriculum Development"]),
  c("Bachelor of Education (Science)", "university", "Education", ["Education Foundations", "Mathematics", "Physics", "Chemistry", "Biology", "Teaching Methods"]),
  c("Bachelor of Education (ECE)", "university", "Education", ["Child Development", "ECE Curriculum", "Play-Based Learning", "Assessment"]),
  // Sciences
  c("Bachelor of Science (Mathematics)", "university", "Sciences", ["Pure Math", "Applied Math", "Statistics", "Linear Algebra", "Calculus"]),
  c("Bachelor of Science (Physics)", "university", "Sciences", ["Mechanics", "Quantum Physics", "Electromagnetism", "Thermodynamics"]),
  c("Bachelor of Science (Chemistry)", "university", "Sciences", ["Organic", "Inorganic", "Physical", "Analytical"]),
  c("Bachelor of Science (Biology)", "university", "Sciences", ["Cell Biology", "Genetics", "Ecology", "Microbiology"]),
  c("Bachelor of Science (Statistics)", "university", "Sciences", ["Probability", "Inference", "Regression", "Biostatistics"]),
  c("Bachelor of Environmental Science", "university", "Sciences", ["Ecology", "Climate", "Conservation", "Pollution", "GIS"]),
  // Agriculture
  c("Bachelor of Agriculture", "university", "Agriculture", ["Crop Science", "Soil Science", "Animal Production", "Agricultural Economics"]),
  c("Bachelor of Agribusiness", "university", "Agriculture", ["Agriculture", "Business", "Marketing", "Supply Chain"]),
  c("Bachelor of Horticulture", "university", "Agriculture", ["Plant Propagation", "Greenhouse", "Pest Management", "Post-Harvest"]),
  // Arts & Social Sciences
  c("Bachelor of Arts (Communication)", "university", "Arts & Social Sciences", ["Journalism", "Public Relations", "Media Studies", "Broadcasting"]),
  c("Bachelor of Arts (Psychology)", "university", "Arts & Social Sciences", ["Cognitive", "Developmental", "Social", "Abnormal"]),
  c("Bachelor of Arts (Sociology)", "university", "Arts & Social Sciences", ["Social Theory", "Research Methods", "Demography", "Deviance"]),
  c("Bachelor of Arts (Political Science)", "university", "Arts & Social Sciences", ["Political Theory", "Comparative Politics", "International Relations", "Public Administration"]),
  c("Bachelor of Social Work", "university", "Arts & Social Sciences", ["Social Welfare", "Counseling", "Community Development", "Case Management"]),
  // Hospitality & Tourism
  c("Bachelor of Hospitality Management", "university", "Hospitality", ["Food Production", "Front Office", "Housekeeping", "Food & Beverage Service"]),
  c("Bachelor of Tourism Management", "university", "Hospitality", ["Tour Operations", "Travel Agency", "Tourism Economics", "Heritage"]),
  // Architecture & Design
  c("Bachelor of Architecture", "university", "Architecture & Design", ["Design", "Building Tech", "History of Architecture", "Urban Planning"]),
  c("Bachelor of Interior Design", "university", "Architecture & Design", ["Space Planning", "Materials", "Lighting", "Color Theory"]),
  // Journalism / Media
  c("Bachelor of Journalism & Mass Communication", "university", "Media", ["Reporting", "Editing", "Broadcasting", "Media Law", "Photojournalism"]),
];

// ============================================================
// COLLEGE COURSES (Diploma, Certificate)
// ============================================================

export const COLLEGE_COURSES: Course[] = [
  // ICM/AIBE/ABE-style Diplomas
  c("Diploma in Business Management", "college", "Business", BUSINESS_SUBJECTS),
  c("Diploma in Accounting", "college", "Business", BUSINESS_SUBJECTS),
  c("Diploma in Marketing", "college", "Business", BUSINESS_SUBJECTS),
  c("Diploma in Human Resource Management", "college", "Business", BUSINESS_SUBJECTS),
  c("Diploma in Supply Chain Management", "college", "Business", BUSINESS_SUBJECTS),
  c("Diploma in Project Management", "college", "Business", BUSINESS_SUBJECTS),
  // Computing
  c("Diploma in Information Technology", "college", "Computing", COMPUTING_SUBJECTS),
  c("Diploma in Computer Science", "college", "Computing", COMPUTING_SUBJECTS),
  c("Diploma in Cyber Security", "college", "Computing", COMPUTING_SUBJECTS),
  c("Diploma in Web Development", "college", "Computing", COMPUTING_SUBJECTS),
  c("Diploma in Software Engineering", "college", "Computing", COMPUTING_SUBJECTS),
  c("Diploma in Data Science", "college", "Computing", COMPUTING_SUBJECTS),
  // Engineering
  c("Diploma in Electrical Engineering", "college", "Engineering", ENGINEERING_SUBJECTS),
  c("Diploma in Mechanical Engineering", "college", "Engineering", ENGINEERING_SUBJECTS),
  c("Diploma in Civil Engineering", "college", "Engineering", ENGINEERING_SUBJECTS),
  c("Diploma in Building Construction", "college", "Engineering", ENGINEERING_SUBJECTS),
  // Health
  c("Diploma in Nursing", "college", "Health Sciences", HEALTH_SUBJECTS),
  c("Diploma in Clinical Medicine", "college", "Health Sciences", HEALTH_SUBJECTS),
  c("Diploma in Pharmacy", "college", "Health Sciences", HEALTH_SUBJECTS),
  c("Diploma in Medical Laboratory", "college", "Health Sciences", HEALTH_SUBJECTS),
  c("Diploma in Public Health", "college", "Health Sciences", HEALTH_SUBJECTS),
  // Hospitality
  c("Diploma in Hospitality Management", "college", "Hospitality", ["Food Production", "Front Office", "Housekeeping", "Food & Beverage Service"]),
  c("Diploma in Food & Beverage", "college", "Hospitality", ["Food Production", "Bakery", "Pastry", "Service"]),
  c("Diploma in Travel & Tourism", "college", "Hospitality", ["Tour Operations", "Travel Agency", "Tourism Economics"]),
  // Education
  c("Diploma in Education (Primary)", "college", "Education", ["Education Foundations", "Curriculum", "Teaching Methods"]),
  c("Diploma in Early Childhood Education", "college", "Education", ["Child Development", "ECE Curriculum", "Play-Based Learning"]),
  // Media
  c("Diploma in Journalism & Mass Communication", "college", "Media", ["Reporting", "Editing", "Broadcasting", "Media Law"]),
  c("Diploma in Film & Video Production", "college", "Media", ["Cinematography", "Editing", "Sound Design", "Directing"]),
  // Agriculture
  c("Diploma in Agriculture", "college", "Agriculture", ["Crop Science", "Animal Production", "Agricultural Economics"]),
  // Social Work
  c("Diploma in Social Work & Community Development", "college", "Social Sciences", ["Social Welfare", "Counseling", "Community Development"]),
  // Beauty & Cosmetology
  c("Diploma in Beauty Therapy", "college", "Beauty & Cosmetology", ["Skincare", "Makeup", "Manicure", "Salon Management"]),
  c("Diploma in Hairdressing", "college", "Beauty & Cosmetology", ["Hair Cutting", "Coloring", "Styling", "Salon Management"]),
];

// ============================================================
// TVET (CDACC) — trades / artisan certifications
// ============================================================

export const TVET_COURSES: Course[] = [
  // Engineering Trades
  c("Electrical Installation", "tvet", "Engineering Trades", ["Electrical Circuits", "Wiring", "Safety", "Motor Control", "Domestic Installation"]),
  c("Plumbing", "tvet", "Engineering Trades", ["Pipe Fitting", "Drainage", "Water Systems", "Sanitation"]),
  c("Welding & Fabrication", "tvet", "Engineering Trades", ["Arc Welding", "Gas Welding", "Metal Cutting", "Fabrication"]),
  c("Automotive Mechanics", "tvet", "Engineering Trades", ["Engine Systems", "Transmission", "Brakes", "Electrical Systems", "Diagnosis"]),
  c("Motor Vehicle Mechanics", "tvet", "Engineering Trades", ["Engine Repair", "Suspension", "Steering", "Servicing"]),
  c("Refrigeration & Air Conditioning", "tvet", "Engineering Trades", ["Cooling Systems", "AC Repair", "Refrigerants", "Installation"]),
  c("Carpentry & Joinery", "tvet", "Engineering Trades", ["Wood Joints", "Furniture Making", "Roof Construction", "Finishing"]),
  c("Masonry", "tvet", "Engineering Trades", ["Brickwork", "Plastering", "Concrete", "Tiling"]),
  c("Steel Fabrication", "tvet", "Engineering Trades", ["Metal Cutting", "Welding", "Drawing", "Bending"]),
  // Building & Construction
  c("Building Construction", "tvet", "Building & Construction", ["Foundation", "Walls", "Roofing", "Finishing", "Quantity Surveying"]),
  c("Painting & Decoration", "tvet", "Building & Construction", ["Surface Prep", "Painting", "Wallpaper", "Decorative Finishes"]),
  c("Landscaping", "tvet", "Building & Construction", ["Planting", "Irrigation", "Hardscaping", "Lawn Care"]),
  c("Glazing", "tvet", "Building & Construction", ["Glass Cutting", "Window Installation", "Mirrors", "Aluminum Fitting"]),
  // ICT Technician
  c("ICT Technician", "tvet", "Information & Communication Tech", COMPUTER_FUNDAMENTAL_SUBJECTS()),
  c("Computer Networks", "tvet", "Information & Communication Tech", COMPUTER_FUNDAMENTAL_SUBJECTS()),
  c("Computer Repair & Maintenance", "tvet", "Information & Communication Tech", ["Hardware", "Troubleshooting", "Software Installation", "Networking"]),
  // Hospitality & Food
  c("Food & Beverage Service", "tvet", "Hospitality", ["Restaurant Service", "Bar Service", "Wine", "Customer Care"]),
  c("Food Production", "tvet", "Hospitality", ["Cooking", "Bakery", "Pastry", "Menu Planning"]),
  c("Pastry & Bakery", "tvet", "Hospitality", ["Bread", "Cakes", "Pastries", "Decoration"]),
  c("Front Office Operations", "tvet", "Hospitality", ["Reception", "Reservations", "Guest Relations", "Communication"]),
  c("Housekeeping", "tvet", "Hospitality", ["Room Service", "Cleaning", "Laundry", "Hygiene"]),
  // Fashion & Beauty
  c("Fashion & Design", "tvet", "Fashion & Beauty", ["Pattern Making", "Cutting", "Sewing", "Draping", "Illustration"]),
  c("Garment Making", "tvet", "Fashion & Beauty", ["Cutting", "Sewing", "Finishing", "Repairs"]),
  c("Hairdressing & Beauty Therapy", "tvet", "Fashion & Beauty", ["Hair Styling", "Skin Care", "Makeup", "Manicure"]),
  // Agriculture
  c("Agriculture (Crop Production)", "tvet", "Agriculture", ["Planting", "Pest Control", "Harvesting", "Soil Management"]),
  c("Animal Health & Production", "tvet", "Agriculture", ["Animal Husbandry", "Disease Control", "Breeding", "Feeds"]),
  c("Aquaculture", "tvet", "Agriculture", ["Fish Farming", "Pond Management", "Water Quality", "Fish Health"]),
  c("Apiculture (Bee Keeping)", "tvet", "Agriculture", ["Hive Management", "Honey Harvesting", "Processing", "Marketing"]),
  // Business Studies (TVET)
  c("Business Studies (CDACC)", "tvet", "Business Studies", ["Entrepreneurship", "Bookkeeping", "Marketing", "Communication"]),
  c("Secretarial Studies", "tvet", "Business Studies", ["Office Admin", "Typing", "Shorthand", "Records Management"]),
  c("Storekeeping & Storekeeping", "tvet", "Business Studies", ["Inventory", "Stock Control", "Procurement", "Records"]),
  // Media
  c("Photography & Video Production", "tvet", "Media", ["Camera Operation", "Lighting", "Editing", "Production"]),
  c("Print Journalism", "tvet", "Media", ["Reporting", "Editing", "Layout Design", "Ethics"]),
  // Leather
  c("Leather Technology", "tvet", "Leather & Tannery", ["Leather Tanning", "Leather Goods", "Repair", "Finishing"]),
  c("Shoe Making & Repair", "tvet", "Leather & Tannery", ["Pattern Cutting", "Stitching", "Sole Fixing", "Repair"]),
];

function COMPUTER_FUNDAMENTAL_SUBJECTS() {
  return ["Computer Basics", "Office Applications", "Networking Basics", "Hardware", "Operating Systems", "Web Basics", "Programming Basics"];
}

// ============================================================
// ALL COURSES COMBINED + HELPERS
// ============================================================

export const ALL_COURSES: Course[] = [...UNIVERSITY_COURSES, ...COLLEGE_COURSES, ...TVET_COURSES];

export function getCoursesForTrack(track: string): Course[] {
  return ALL_COURSES.filter(c => c.track === track);
}

export function getCourseByName(name: string): Course | undefined {
  return ALL_COURSES.find(c => c.name.toLowerCase() === name.toLowerCase());
}

export function searchCourses(query: string, track?: string): Course[] {
  const q = query.toLowerCase().trim();
  let pool = track ? ALL_COURSES.filter(c => c.track === track) : ALL_COURSES;
  if (!q) return pool;
  return pool.filter(c =>
    c.name.toLowerCase().includes(q) ||
    c.category.toLowerCase().includes(q) ||
    c.subjects.some(s => s.toLowerCase().includes(q))
  );
}

export function getCourseCategories(track: string): string[] {
  const courses = getCoursesForTrack(track);
  return Array.from(new Set(courses.map(c => c.category)));
}

export function getSubjectsForCourse(courseName: string): string[] {
  const course = getCourseByName(courseName);
  return course ? course.subjects : [];
}

// Helper: get subjects for an admin uploading an Explore project.
// For K-12/secondary: returns the track's subjects.
// For university/college/tvet: if course is specified, returns that course's subjects.
// Otherwise, returns a flat list of all subjects for the track (across courses).
export function getSubjectsForTrackOrCourse(track: string, course?: string | null): string[] {
  const trackData = getTrack(track);
  if (trackData && trackData.subjects.length > 0) return trackData.subjects;
  if (course) {
    const subjects = getSubjectsForCourse(course);
    if (subjects.length) return subjects;
  }
  // Fallback: union of all subjects for this track
  const courses = getCoursesForTrack(track);
  return Array.from(new Set(courses.flatMap(c => c.subjects)));
}
