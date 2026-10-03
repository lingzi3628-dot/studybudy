import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getIngestionJob, listIngestionJobs } from "@/lib/tutor/ingestion-jobs";

export const runtime = "nodejs";

/**
 * GET /api/ingestion-jobs          — list user's recent jobs
 * GET /api/ingestion-jobs/[id]     — get a single job by ID
 */
export async function GET(req: NextRequest, { params }: { params?: Promise<{ id: string }> }) {
  let user;
  try { user = await getCurrentUser(); }
  catch { return NextResponse.json({ error: "Auth required" }, { status: 401 }); }

  // If params has an id, return a single job
  if (params) {
    const { id } = await params;
    const job = await getIngestionJob(user.id, id);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    return NextResponse.json({ job });
  }

  // Otherwise list recent jobs
  const jobs = await listIngestionJobs(user.id, 20);
  return NextResponse.json({ jobs });
}
