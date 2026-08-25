import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getTopicCapacity, getSubjectCapacity } from "@/lib/capacity-engine";

export const runtime = "nodejs";

/**
 * GET /api/curriculum/capacity?topicId=...
 * GET /api/curriculum/capacity?subjectId=...
 *
 * Returns the user's capacity info for a topic or a subject.
 * Used by the UI to show the capacity score + recommendation.
 */
export async function GET(req: NextRequest) {
  let user;
  try {
    user = await getCurrentUser();
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Authentication required" },
      { status: (e as any)?.status ?? 401 }
    );
  }

  const url = new URL(req.url);
  const topicId = url.searchParams.get("topicId");
  const subjectId = url.searchParams.get("subjectId");

  try {
    if (topicId) {
      const capacity = await getTopicCapacity(user.id, topicId);
      return NextResponse.json({ capacity, type: "topic" });
    }
    if (subjectId) {
      const capacity = await getSubjectCapacity(user.id, subjectId);
      return NextResponse.json({ capacity, type: "subject" });
    }
    return NextResponse.json(
      { error: "Either topicId or subjectId is required" },
      { status: 400 }
    );
  } catch (e: any) {
    if (e?.code === "P2021") {
      return NextResponse.json({
        capacity: {
          capacityScore: 0,
          recommendation: "start",
          recommendationText: "Start this topic to begin learning.",
        },
        tablesMissing: true,
      });
    }
    return NextResponse.json(
      { error: "Failed to load capacity", detail: e?.message },
      { status: 500 }
    );
  }
}
