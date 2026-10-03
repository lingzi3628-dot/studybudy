import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listIngestionJobs } from "@/lib/tutor/ingestion-jobs";

export const runtime = "nodejs";

/**
 * GET /api/ingestion-jobs — list user's recent ingestion jobs
 */
export async function GET() {
  let user;
  try { user = await getCurrentUser(); }
  catch { return NextResponse.json({ error: "Auth required" }, { status: 401 }); }

  const jobs = await listIngestionJobs(user.id, 20);
  return NextResponse.json({ jobs });
}
