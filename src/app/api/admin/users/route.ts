import { NextRequest, NextResponse } from "next/server";
import { requireAdminJwt as requireAdmin, logAdminActionViaJwt as logAdminAction } from "@/lib/admin-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/admin/users?q=&plan=&role=&page=1&pageSize=20
 * List users with search + filter + pagination.
 */
export async function GET(req: NextRequest) {
  await requireAdmin();
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const plan = url.searchParams.get("plan");
  const role = url.searchParams.get("role");
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? 20)));

  const where: any = {};
  if (q) {
    where.OR = [
      { email: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
      { clerkUserId: { contains: q, mode: "insensitive" } },
    ];
  }
  if (plan && plan !== "all") where.plan = plan;
  if (role && role !== "all") where.role = role;

  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        email: true,
        name: true,
        phoneNumber: true,
        plan: true,
        role: true,
        banned: true,
        createdAt: true,
        lastActive: true,
        grade: true,
        encryptedApiKey: true,
        _count: {
          select: { studySets: true, attempts: true, aiCallLogs: true },
        },
      },
    }),
    db.user.count({ where }),
  ]);

  return NextResponse.json({
    users: users.map((u) => ({
      ...u,
      hasApiKey: Boolean(u.encryptedApiKey),
      encryptedApiKey: undefined, // never expose the key
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
}
