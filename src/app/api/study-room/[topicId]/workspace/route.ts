import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

type Stroke = { d: string; color: string; width: number };
const emptyProgress = { drawingsSaved: 0, workChecks: 0 };

export async function GET(_req: NextRequest, { params }: { params: Promise<{ topicId: string }> }) {
  const user = await getCurrentUser();
  const { topicId } = await params;
  const room = await db.studyRoomState.findUnique({
    where: { userId_topicId: { userId: user.id, topicId } },
    select: { workspaceDrawing: true, workspaceProgress: true },
  });
  if (!room) return NextResponse.json({ error: "Study Room not found." }, { status: 404 });
  return NextResponse.json({
    strokes: Array.isArray(room.workspaceDrawing) ? room.workspaceDrawing : [],
    progress: { ...emptyProgress, ...(room.workspaceProgress as object || {}) },
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ topicId: string }> }) {
  const user = await getCurrentUser();
  const { topicId } = await params;
  const room = await db.studyRoomState.findUnique({
    where: { userId_topicId: { userId: user.id, topicId } },
    select: { workspaceProgress: true },
  });
  if (!room) return NextResponse.json({ error: "Study Room not found." }, { status: 404 });
  const body = await req.json().catch(() => ({})) as { strokes?: Stroke[]; event?: "drawing_saved" | "work_checked" | "clear_computer_task" | "set_computer_task"; computerTask?: { title?: string; reason?: string; benefit?: string; workspace?: string } };
  const nextProgress: Record<string, any> = { ...emptyProgress, ...(room.workspaceProgress as object || {}) };
  if (body.event === "drawing_saved") nextProgress.drawingsSaved += 1;
  if (body.event === "work_checked") nextProgress.workChecks += 1;
  if (body.event === "clear_computer_task") delete nextProgress.computerTask;
  if (body.event === "set_computer_task" && body.computerTask) {
    const task = body.computerTask;
    if (!["design", "code", "modeling", "simulation", "data"].includes(task.workspace || "") || ![task.title, task.reason, task.benefit].every((value) => typeof value === "string" && value.trim())) {
      return NextResponse.json({ error: "Invalid computer activity." }, { status: 400 });
    }
    nextProgress.computerTask = { title: task.title!.trim().slice(0, 80), reason: task.reason!.trim().slice(0, 240), benefit: task.benefit!.trim().slice(0, 240), workspace: task.workspace, startedAt: new Date().toISOString() };
  }

  const data: { workspaceProgress: typeof nextProgress; workspaceDrawing?: Stroke[] } = { workspaceProgress: nextProgress };
  if (body.strokes !== undefined) {
    if (!Array.isArray(body.strokes) || body.strokes.length > 180) {
      return NextResponse.json({ error: "The drawing is too large to save." }, { status: 400 });
    }
    const strokes: Stroke[] = [];
    for (const stroke of body.strokes) {
      if (typeof stroke?.d !== "string" || stroke.d.length > 3_000 || !/^[MLA0-9.,\s-]+$/.test(stroke.d)) continue;
      const color = typeof stroke.color === "string" && /^#[0-9a-fA-F]{6}$/.test(stroke.color) ? stroke.color : "#30334A";
      const width = Math.max(1, Math.min(16, Number(stroke.width) || 3));
      strokes.push({ d: stroke.d, color, width });
    }
    const bytes = JSON.stringify(strokes).length;
    if (bytes > 240_000) return NextResponse.json({ error: "The drawing is too large to save." }, { status: 413 });
    data.workspaceDrawing = strokes;
  }
  const saved = await db.studyRoomState.update({
    where: { userId_topicId: { userId: user.id, topicId } },
    data,
    select: { workspaceProgress: true },
  });
  return NextResponse.json({ ok: true, progress: { ...emptyProgress, ...(saved.workspaceProgress as object || {}) } });
}
