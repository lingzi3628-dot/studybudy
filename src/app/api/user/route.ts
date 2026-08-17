import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/** GET /api/user — current user record */
export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({ user });
}

/** POST /api/user — update profile (name, grade, subjects, ambitions, learningLanguage) */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({}));
  const { name, grade, subjects, ambitions, learningLanguage } = body as {
    name?: string;
    grade?: string;
    subjects?: string[];
    ambitions?: string[];
    learningLanguage?: string;
  };

  const data: Record<string, unknown> = {};
  if (typeof name === "string") data.name = name;
  if (typeof grade === "string") data.grade = grade;
  if (Array.isArray(subjects)) data.subjects = subjects;
  if (Array.isArray(ambitions)) data.ambitions = ambitions;
  if (typeof learningLanguage === "string") data.learningLanguage = learningLanguage;

  const updated = await db.user.update({
    where: { id: user.id },
    data,
  });

  return NextResponse.json({
    user: {
      ...updated,
      plan: updated.plan === "pro" ? "pro" : "free",
    },
  });
}
