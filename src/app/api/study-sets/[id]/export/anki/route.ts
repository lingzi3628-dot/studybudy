import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { cardToAnki, generateTSVBytes } from "@/lib/anki-export";

export const runtime = "nodejs";

/**
 * GET /api/study-sets/[id]/export/anki
 *
 * Exports all cards in the study set as a tab-separated file (TSV)
 * that Anki's "File > Import" dialog can ingest. The response has
 * Content-Type: text/tab-separated-values and a Content-Disposition
 * attachment header so the browser downloads it as `studyset-<title>.txt`.
 *
 * (We don't generate a real .apkg because that requires SQLite + ZIP
 * libraries bundled just for this one feature; Anki's TSV import is
 * well-supported on Desktop, Web, Android, and iOS.)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  const setId = params.id;

  // Verify the set belongs to the user
  const studySet = await db.studySet.findFirst({
    where: { id: setId, userId: user.id },
    include: { cards: true },
  });
  if (!studySet) {
    return NextResponse.json({ error: "Study set not found" }, { status: 404 });
  }

  const ankiCards = studySet.cards
    .map(cardToAnki)
    .filter((c): c is NonNullable<typeof c> => c !== null);

  if (ankiCards.length === 0) {
    return NextResponse.json({ error: "No cards available to export" }, { status: 400 });
  }

  const bytes = generateTSVBytes(ankiCards);
  const safeTitle = studySet.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 40);

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "text/tab-separated-values; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeTitle || 'studyset'}.txt"`,
      "Cache-Control": "no-store",
    },
  });
}
