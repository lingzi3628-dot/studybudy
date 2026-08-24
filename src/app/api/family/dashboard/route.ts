import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getFamilyChild, getFamilyByParent } from "@/lib/family-auth";

export const runtime = "nodejs";

/**
 * GET /api/family/dashboard
 *
 * Returns the current user's family context. The user can be either:
 *   - A Family Parent (created via /api/family/register) — returns
 *     { isFamilyParent: true, family, children: [...] }
 *   - A Family Child (logged in via /api/family/login) — returns
 *     { isFamilyChild: true, child, family }
 *   - Neither — returns { isFamilyMember: false }
 *
 * Used by the client to decide whether to show family UI.
 */
export async function GET() {
  const { getCurrentUser } = await import("@/lib/auth");
  let user;
  try {
    user = await getCurrentUser();
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Authentication required" },
      { status: (e as any)?.status ?? 401 }
    );
  }

  // Check if this user is a family CHILD first
  const child = await getFamilyChild(user.id);
  if (child) {
    const family = await db.family.findUnique({
      where: { id: child.familyId },
    });
    return NextResponse.json({
      isFamilyMember: true,
      isFamilyChild: true,
      isFamilyParent: false,
      child: {
        id: child.id,
        username: child.username,
        displayName: child.displayName,
        gradeLevel: child.gradeLevel,
        avatarEmoji: child.avatarEmoji,
        familyId: child.familyId,
      },
      family: family
        ? {
            id: family.id,
            displayName: family.displayName,
            parentEmail: family.parentEmail,
          }
        : null,
    });
  }

  // Check if this user is a family PARENT
  const family = await getFamilyByParent(user.id);
  if (family) {
    const children = await db.familyChild.findMany({
      where: { familyId: family.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        username: true,
        displayName: true,
        gradeLevel: true,
        avatarEmoji: true,
        lastLogin: true,
        createdAt: true,
      },
    });
    return NextResponse.json({
      isFamilyMember: true,
      isFamilyChild: false,
      isFamilyParent: true,
      family: {
        id: family.id,
        displayName: family.displayName,
        parentEmail: family.parentEmail,
        createdAt: family.createdAt,
      },
      children,
    });
  }

  // Not a family member
  return NextResponse.json({ isFamilyMember: false });
}
