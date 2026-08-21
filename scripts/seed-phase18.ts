/**
 * Seed Phase 18: schools, subjects, topics, sample questions.
 * Run with: bun run scripts/seed-phase18.ts
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

// 1. Schools
const schools = [
  { name: "Oljororok Secondary School", level: "secondary", county: "Nakuru" },
  { name: "Nairobi Primary School", level: "primary", county: "Nairobi" },
  { name: "Alliance High School", level: "secondary", county: "Kiambu" },
  { name: "Mangu High School", level: "secondary", county: "Kiambu" },
  { name: "Jamhuri Primary School", level: "primary", county: "Nairobi" },
];
for (const s of schools) {
  const existing = await p.school.findFirst({ where: { name: s.name } });
  if (!existing) {
    await p.school.create({ data: s });
    console.log(`  ✓ School: ${s.name}`);
  }
}

// 2. Subjects
const secondarySubjects = [
  { name: "Mathematics", level: "secondary", icon: "🔢", color: "#6366F1" },
  { name: "English", level: "secondary", icon: "📝", color: "#8B5CF6" },
  { name: "Kiswahili", level: "secondary", icon: "🗣️", color: "#F59E0B" },
  { name: "Chemistry", level: "secondary", icon: "🧪", color: "#10B981" },
  { name: "Biology", level: "secondary", icon: "🧬", color: "#06B6D4" },
  { name: "Physics", level: "secondary", icon: "⚛️", color: "#3B82F6" },
  { name: "Geography", level: "secondary", icon: "🌍", color: "#84CC16" },
  { name: "History", level: "secondary", icon: "📜", color: "#EF4444" },
  { name: "CRE", level: "secondary", icon: "✝️", color: "#A855F7" },
  { name: "Business Studies", level: "secondary", icon: "💼", color: "#64748B" },
];
const primarySubjects = [
  { name: "Mathematics", level: "primary", icon: "🔢", color: "#6366F1" },
  { name: "English", level: "primary", icon: "📝", color: "#8B5CF6" },
  { name: "Kiswahili", level: "primary", icon: "🗣️", color: "#F59E0B" },
  { name: "Science", level: "primary", icon: "🔬", color: "#10B981" },
  { name: "Social Studies", level: "primary", icon: "🌍", color: "#84CC16" },
  { name: "CRE", level: "primary", icon: "✝️", color: "#A855F7" },
];
for (const s of [...secondarySubjects, ...primarySubjects]) {
  const existing = await p.schoolSubject.findFirst({ where: { name: s.name, level: s.level } });
  if (!existing) {
    await p.schoolSubject.create({ data: s });
    console.log(`  ✓ Subject: ${s.icon} ${s.name} (${s.level})`);
  }
}

// 3. Topics for Mathematics (secondary)
const mathSub = await p.schoolSubject.findFirst({ where: { name: "Mathematics", level: "secondary" } });
if (mathSub) {
  const topics = [
    { name: "Algebra: Linear Equations", orderIndex: 0, badgeIcon: "🏅", questionCount: 10, timeLimitMinutes: 10 },
    { name: "Fractions & Decimals", orderIndex: 1, badgeIcon: "🥈", questionCount: 10, timeLimitMinutes: 10 },
    { name: "Geometry: Triangles", orderIndex: 2, badgeIcon: "🥉", questionCount: 10, timeLimitMinutes: 10 },
    { name: "Statistics: Mean & Mode", orderIndex: 3, badgeIcon: "🎖️", questionCount: 10, timeLimitMinutes: 10 },
    { name: "Trigonometry Basics", orderIndex: 4, badgeIcon: "🏆", questionCount: 10, timeLimitMinutes: 10 },
  ];
  for (const t of topics) {
    const existing = await p.schoolTopic.findFirst({ where: { subjectId: mathSub.id, name: t.name } });
    if (!existing) {
      const topic = await p.schoolTopic.create({ data: { ...t, subjectId: mathSub.id } });
      console.log(`  ✓ Topic: ${t.badgeIcon} ${t.name}`);
      // Insert 5 sample questions for first topic
      if (t.orderIndex === 0) {
        const questions = [
          { questionText: "Solve: 2x + 5 = 13. What is x?", options: ["3", "4", "5", "6"], correctIndex: 1, explanation: "2x = 13-5 = 8, so x = 4" },
          { questionText: "If 3x - 7 = 14, what is x?", options: ["5", "6", "7", "8"], correctIndex: 2, explanation: "3x = 14+7 = 21, so x = 7" },
          { questionText: "Solve: x/4 = 9. What is x?", options: ["36", "13", "5", "27"], correctIndex: 0, explanation: "x = 9 × 4 = 36" },
          { questionText: "If 5x = 35, what is x?", options: ["5", "6", "7", "8"], correctIndex: 2, explanation: "x = 35/5 = 7" },
          { questionText: "Solve: 2(x + 3) = 14. What is x?", options: ["3", "4", "5", "7"], correctIndex: 1, explanation: "2x + 6 = 14 → 2x = 8 → x = 4" },
        ];
        for (const q of questions) {
          await p.schoolQuestion.create({ data: { ...q, topicId: topic.id } });
        }
        console.log(`    ✓ 5 questions seeded for "${t.name}"`);
      }
    }
  }
}

// 4. Topics for Mathematics (primary)
const mathPri = await p.schoolSubject.findFirst({ where: { name: "Mathematics", level: "primary" } });
if (mathPri) {
  const topics = [
    { name: "Counting 1-100", orderIndex: 0, badgeIcon: "🌟", questionCount: 5, timeLimitMinutes: 5 },
    { name: "Addition & Subtraction", orderIndex: 1, badgeIcon: "⭐", questionCount: 5, timeLimitMinutes: 5 },
    { name: "Multiplication Tables", orderIndex: 2, badgeIcon: "🎖️", questionCount: 5, timeLimitMinutes: 5 },
    { name: "Fractions Basics", orderIndex: 3, badgeIcon: "🏆", questionCount: 5, timeLimitMinutes: 5 },
  ];
  for (const t of topics) {
    const existing = await p.schoolTopic.findFirst({ where: { subjectId: mathPri.id, name: t.name } });
    if (!existing) {
      const topic = await p.schoolTopic.create({ data: { ...t, subjectId: mathPri.id } });
      console.log(`  ✓ Topic: ${t.badgeIcon} ${t.name} (primary)`);
      if (t.orderIndex === 0) {
        const questions = [
          { questionText: "What comes after 7?", options: ["6", "8", "9", "10"], correctIndex: 1, explanation: "7 + 1 = 8" },
          { questionText: "What is 5 + 3?", options: ["7", "8", "9", "10"], correctIndex: 1, explanation: "5 + 3 = 8" },
          { questionText: "What is 10 - 4?", options: ["5", "6", "7", "8"], correctIndex: 1, explanation: "10 - 4 = 6" },
          { questionText: "Count: 1, 2, 3, __. What's next?", options: ["5", "4", "6", "7"], correctIndex: 1, explanation: "After 3 comes 4" },
          { questionText: "What is 2 + 2?", options: ["3", "4", "5", "6"], correctIndex: 1, explanation: "2 + 2 = 4" },
        ];
        for (const q of questions) {
          await p.schoolQuestion.create({ data: { ...q, topicId: topic.id } });
        }
        console.log(`    ✓ 5 questions seeded for "${t.name}"`);
      }
    }
  }
}

// 5. Topics for English (both levels)
for (const level of ["primary", "secondary"] as const) {
  const eng = await p.schoolSubject.findFirst({ where: { name: "English", level } });
  if (eng) {
    const topics = level === "primary"
      ? [
          { name: "Nouns", orderIndex: 0, badgeIcon: "🌟", questionCount: 5, timeLimitMinutes: 5 },
          { name: "Verbs", orderIndex: 1, badgeIcon: "⭐", questionCount: 5, timeLimitMinutes: 5 },
          { name: "Adjectives", orderIndex: 2, badgeIcon: "🏆", questionCount: 5, timeLimitMinutes: 5 },
        ]
      : [
          { name: "Parts of Speech", orderIndex: 0, badgeIcon: "🏅", questionCount: 10, timeLimitMinutes: 10 },
          { name: "Tenses", orderIndex: 1, badgeIcon: "🥈", questionCount: 10, timeLimitMinutes: 10 },
          { name: "Comprehension Skills", orderIndex: 2, badgeIcon: "🥉", questionCount: 10, timeLimitMinutes: 10 },
        ];
    for (const t of topics) {
      const existing = await p.schoolTopic.findFirst({ where: { subjectId: eng.id, name: t.name } });
      if (!existing) {
        const topic = await p.schoolTopic.create({ data: { ...t, subjectId: eng.id } });
        console.log(`  ✓ Topic: ${t.badgeIcon} ${t.name} (${level})`);
        if (t.orderIndex === 0) {
          const questions = level === "primary"
            ? [
                { questionText: "Which word is a noun? 'She runs fast.'", options: ["She", "runs", "fast", "none"], correctIndex: 0, explanation: "'She' is a noun (a person)" },
                { questionText: "What is a noun?", options: ["An action word", "A naming word", "A describing word", "A joining word"], correctIndex: 1, explanation: "A noun names a person, place, or thing" },
                { questionText: "Which is a noun? 'The cat sat.'", options: ["The", "cat", "sat", "none"], correctIndex: 1, explanation: "'cat' is a noun (an animal)" },
                { questionText: "Pick the noun: 'Big house'", options: ["Big", "house", "both", "neither"], correctIndex: 1, explanation: "'house' is a noun (a thing)" },
                { questionText: "Which is NOT a noun?", options: ["book", "run", "table", "school"], correctIndex: 1, explanation: "'run' is a verb, not a noun" },
              ]
            : [
                { questionText: "Identify the noun: 'The students passed the exam.'", options: ["students", "passed", "the", "exam"], correctIndex: 0, explanation: "'students' is a noun (plural)" },
                { questionText: "What part of speech is 'quickly'?", options: ["Noun", "Verb", "Adverb", "Adjective"], correctIndex: 2, explanation: "'quickly' describes a verb → adverb" },
                { questionText: "Which is a pronoun?", options: ["table", "she", "blue", "run"], correctIndex: 1, explanation: "'she' replaces a noun → pronoun" },
                { questionText: "'Beautiful' is what part of speech?", options: ["Noun", "Adjective", "Verb", "Adverb"], correctIndex: 1, explanation: "Describes a noun → adjective" },
                { questionText: "Pick the verb: 'The boy kicked the ball.'", options: ["boy", "kicked", "the", "ball"], correctIndex: 1, explanation: "'kicked' is the action → verb" },
              ];
          for (const q of questions) {
            await p.schoolQuestion.create({ data: { ...q, topicId: topic.id } });
          }
          console.log(`    ✓ ${questions.length} questions seeded for "${t.name}"`);
        }
      }
    }
  }
}

console.log("\n✓ Phase 18 seed complete");
await p.$disconnect();
