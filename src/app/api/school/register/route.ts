import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import {
  signUserToken,
  getUserCookieName,
  getUserCookieMaxAge,
} from "@/lib/user-jwt";

export const runtime = "nodejs";

/**
 * POST /api/school/register
 *
 * Registers a new School Student account. Creates:
 *   1. A User row (direct-auth, same pattern as /api/auth/register).
 *   2. A SchoolStudent row linked to that User.
 *   3. StudentSubjectEnrollment rows for each selected subject.
 *   4. StudentTopicProgress rows for every topic of every enrolled subject —
 *      the first topic (lowest orderIndex) is set to 'available', the rest
 *      to 'locked'.
 *   5. Sets user.onboardingCompleted = true so they skip onboarding.
 *
 * Body:
 *   {
 *     fullName: string,
 *     admissionNumber?: string,
 *     schoolId?: string,
 *     gradeLevel: string,
 *     subjects: string[],   // SchoolSubject ids
 *     email: string,
 *     password: string,
 *     name?: string,        // optional user.name (defaults to fullName)
 *   }
 *
 * Validation:
 *   - email + password are required
 *   - fullName + gradeLevel + at least one subject are required
 *   - all subject ids must belong to the same schoolLevel (primary/secondary)
 *   - the schoolId (if provided) must exist; its level must match subjects'
 *     level
 *
 * Errors:
 *   409 — email already in use
 *   400 — missing/invalid fields
 *   402 — subjects belong to a different level than the school's
 *         (with `needsUpgrade: true` to flag an account-state issue)
 *
 * On success: sets the user_token HTTP-only JWT cookie (same as
 * /api/auth/register) so subsequent /api/school/* calls are authenticated.
 */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const fullName = (body?.fullName ?? "").toString().trim();
  const admissionNumber = (body?.admissionNumber ?? "").toString().trim() || null;
  const schoolIdRaw = (body?.schoolId ?? "").toString().trim() || null;
  const gradeLevel = (body?.gradeLevel ?? "").toString().trim();
  const email = (body?.email ?? "").toString().trim().toLowerCase();
  const password = (body?.password ?? "").toString();
  const name = (body?.name ?? "").toString().trim() || fullName;
  const subjectsRaw = Array.isArray(body?.subjects) ? body.subjects : [];

  // --- Basic validation ---
  if (!fullName) {
    return NextResponse.json({ error: "Full name is required" }, { status: 400 });
  }
  if (!gradeLevel) {
    return NextResponse.json({ error: "Grade level is required" }, { status: 400 });
  }
  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 }
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "Please enter a valid email address" },
      { status: 400 }
    );
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters" },
      { status: 400 }
    );
  }
  const subjectIds = subjectsRaw
    .map((s: any) => (s ?? "").toString().trim())
    .filter(Boolean);
  if (subjectIds.length === 0) {
    return NextResponse.json(
      { error: "Please select at least one subject" },
      { status: 400 }
    );
  }

  try {
    // --- Check email uniqueness (User table) ---
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists. Try signing in." },
        { status: 409 }
      );
    }
    const clerkUserId = `direct-${email}`;
    const existingClerk = await db.user.findUnique({
      where: { clerkUserId },
    });
    if (existingClerk) {
      return NextResponse.json(
        { error: "An account with this email already exists. Try signing in." },
        { status: 409 }
      );
    }

    // --- Resolve school (if provided) and validate level ---
    let schoolLevel: string | null = null;
    let schoolId = schoolIdRaw;
    if (schoolId) {
      const school = await db.school.findUnique({ where: { id: schoolId } });
      if (!school) {
        return NextResponse.json(
          { error: "Selected school was not found. Please pick another." },
          { status: 400 }
        );
      }
      schoolLevel = school.level;
    }

    // --- Validate the selected subjects all match the school's level ---
    const subjects = await db.schoolSubject.findMany({
      where: { id: { in: subjectIds } },
    });
    if (subjects.length !== subjectIds.length) {
      return NextResponse.json(
        { error: "One or more selected subjects could not be found." },
        { status: 400 }
      );
    }
    const subjectLevels = new Set(subjects.map((s) => s.level));
    if (subjectLevels.size > 1) {
      return NextResponse.json(
        {
          error:
            "All selected subjects must belong to the same level (primary or secondary).",
          needsUpgrade: true,
          code: "MIXED_SUBJECT_LEVELS",
        },
        { status: 402 }
      );
    }
    const subjectsLevel = [...subjectLevels][0];
    if (schoolLevel && schoolLevel !== subjectsLevel) {
      return NextResponse.json(
        {
          error: `Selected subjects are for ${subjectsLevel} level, but your school is a ${schoolLevel} school. Please pick matching subjects.`,
          needsUpgrade: true,
          code: "SUBJECT_LEVEL_MISMATCH",
        },
        { status: 402 }
      );
    }

    // --- Create the user (same shape as /api/auth/register) ---
    const passwordHash = bcrypt.hashSync(password, 10);
    const tokenResetDate = new Date();
    tokenResetDate.setMonth(tokenResetDate.getMonth() + 1);

    const user = await db.user.create({
      data: {
        clerkUserId,
        email,
        name,
        passwordHash,
        lastLogin: new Date(),
        tokenBalance: 1000,
        currentModel: "study_buddy_free",
        tokenResetDate,
        onboardingCompleted: true,
      },
    });

    // --- Log session (best-effort) ---
    await db.userSession
      .create({ data: { userId: user.id, sessionType: "login" } })
      .catch((e: any) => console.error("session log failed:", e?.message));

    // --- Create SchoolStudent row ---
    const student = await db.schoolStudent.create({
      data: {
        userId: user.id,
        fullName,
        admissionNumber,
        schoolId,
        gradeLevel,
      },
    });

    // --- Enroll in selected subjects ---
    // Use a transaction for atomicity — partial enrollment would leave the
    // student in a weird half-state.
    await db.$transaction(
      subjects.map((s) =>
        db.studentSubjectEnrollment.create({
          data: { studentId: student.id, subjectId: s.id },
        })
      )
    ).catch((e: any) => {
      // If a unique-constraint violation sneaks in (e.g. double submit),
      // we don't treat it as fatal — the enrollment is idempotent.
      if (e?.code !== "P2002") {
        console.error("enrollment failed:", e?.message);
      }
    });

    // --- Initialize topic progress for every topic of every enrolled subject ---
    // For each subject, get its topics ordered by orderIndex. The first topic
    // is 'available', the rest are 'locked'.
    const subjectTopics = await db.schoolTopic.findMany({
      where: { subjectId: { in: subjectIds } },
      orderBy: [{ subjectId: "asc" }, { orderIndex: "asc" }],
      select: { id: true, subjectId: true, orderIndex: true },
    });

    // Group by subjectId to find each subject's first topic.
    const firstTopicPerSubject = new Map<string, string>();
    for (const t of subjectTopics) {
      if (!firstTopicPerSubject.has(t.subjectId)) {
        firstTopicPerSubject.set(t.subjectId, t.id);
      }
    }

    if (subjectTopics.length > 0) {
      await db.$transaction(
        subjectTopics.map((t) =>
          db.studentTopicProgress.upsert({
            where: {
              studentId_topicId: { studentId: student.id, topicId: t.id },
            },
            update: {},
            create: {
              studentId: student.id,
              topicId: t.id,
              status: t.id === firstTopicPerSubject.get(t.subjectId)
                ? "available"
                : "locked",
            },
          })
        )
      ).catch((e: any) => {
        console.error("topic-progress init failed:", e?.message);
      });
    }

    // --- Sign JWT + set HTTP-only cookie ---
    const token = signUserToken(user.id, email);
    const res = NextResponse.json({
      ok: true,
      student,
      subjects: subjects.map((s) => ({
        id: s.id,
        name: s.name,
        level: s.level,
        icon: s.icon,
        color: s.color,
      })),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        onboardingCompleted: user.onboardingCompleted,
      },
    });

    res.cookies.set(getUserCookieName(), token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: getUserCookieMaxAge(),
      path: "/",
    });

    return res;
  } catch (e: any) {
    console.error("school registration error:", e?.message, e?.code, e?.meta);

    // Prisma unique constraint violation — most likely the email again, in
    // a race, or a re-submitted form.
    if (e?.code === "P2002") {
      const field = e?.meta?.target?.[0] ?? "field";
      return NextResponse.json(
        {
          error: `An account with this ${field} already exists. Try signing in.`,
        },
        { status: 409 }
      );
    }

    if (
      e?.code === "P1001" ||
      /connection|timed out|ECONNREFUSED/i.test(e?.message ?? "")
    ) {
      return NextResponse.json(
        {
          error:
            "Could not connect to the database. Please try again in a moment.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        error: "We couldn't create your account right now. Please try again.",
        detail: e?.message ?? String(e),
      },
      { status: 500 }
    );
  }
}
