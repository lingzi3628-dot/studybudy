"use client";

/**
 * DrawingStudio — Phase G6 (Interactive Drawing Workspace)
 *
 * Turns the drawing task from a simple canvas into a 3-tab learning activity
 * (same pattern as Graph Lab + Quiz Lab):
 *
 *   1. Draw — full-screen canvas with colors, brush sizes, hint, clear
 *   2. Review — shows the AI's feedback on the submitted drawing
 *   3. Redo — start fresh with the same task
 *
 * The canvas uses pointer events (works on touch + mouse). The drawing is
 * submitted as a JPEG to the AI for review — same pipeline as before, just
 * in the workspace panel instead of inline in chat.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Pencil, Trash2, Upload, Bot, Target, RotateCcw, Eye, Lightbulb,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

type DrawingStudioProps = {
  spec: {
    title: string;
    prompt: string;
    hint?: string;
    expectedKeywords?: string[];
  };
  onSubmitDrawing?: (imageDataUrl: string) => void;
  onAskTutor?: (context: string) => void;
};

type Tab = "draw" | "review" | "redo";

// ============================================================
// Component
// ============================================================

export function DrawingStudio({ spec, onSubmitDrawing, onAskTutor }: DrawingStudioProps) {
  const [tab, setTab] = useState<Tab>("draw");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [color, setColor] = useState("#1f2937");
  const [brushSize, setBrushSize] = useState(3);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [submittedImage, setSubmittedImage] = useState<string | null>(null);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = 400 * 2;
    ctx.scale(2, 2);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, 400);
  }, [tab]);

  const getPos = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (e: React.PointerEvent) => {
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    setDrawing(true);
    lastPos.current = getPos(e);
  };

  const draw = (e: React.PointerEvent) => {
    if (!drawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !lastPos.current) return;
    const pos = getPos(e);
    ctx.strokeStyle = color;
    ctx.lineWidth = brushSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPos.current = pos;
    setHasDrawn(true);
  };

  const endDraw = (e: React.PointerEvent) => {
    e.preventDefault();
    setDrawing(false);
    lastPos.current = null;
  };

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, 400);
    setHasDrawn(false);
  }, []);

  const submit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn) return;
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    setSubmittedImage(dataUrl);
    onSubmitDrawing?.(dataUrl);
    setTab("review");
  }, [hasDrawn, onSubmitDrawing]);

  const startRedo = useCallback(() => {
    setSubmittedImage(null);
    setHasDrawn(false);
    setTab("draw");
  }, []);

  // ---- Ask Tutor ----
  const askTutor = useCallback((action: string) => {
    const ctxStr = `[Looking at drawing task "${spec.title}" in my workspace. Prompt: "${spec.prompt}"${spec.expectedKeywords ? `. Expected: ${spec.expectedKeywords.join(", ")}` : ""}.${submittedImage ? " I have submitted my drawing for review." : ""}]\n\n`;
    onAskTutor?.(ctxStr + `Please ${action}.`);
  }, [spec, submittedImage, onAskTutor]);

  const COLORS = ["#1f2937", "#dc2626", "#2563eb", "#16a34a", "#ca8a04", "#7c3aed"];
  const BRUSH_SIZES = [2, 4, 8];

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Activity objective */}
      <div className="px-4 py-2 bg-violet-50 border-b border-violet-100 flex-shrink-0">
        <div className="flex items-start gap-2">
          <Target className="w-3.5 h-3.5 text-violet-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-[10px] font-bold uppercase text-violet-600">Activity</p>
            <p className="text-xs text-gray-700 leading-snug">{spec.prompt}</p>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 bg-gray-50 flex-shrink-0" role="tablist">
        <button
          onClick={() => setTab("draw")}
          role="tab"
          aria-selected={tab === "draw"}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold transition ${
            tab === "draw" ? "text-violet-600 border-b-2 border-violet-600 bg-white" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Pencil className="w-3 h-3" /> Draw
        </button>
        <button
          onClick={() => submittedImage && setTab("review")}
          role="tab"
          aria-selected={tab === "review"}
          disabled={!submittedImage}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold transition ${
            tab === "review" ? "text-violet-600 border-b-2 border-violet-600 bg-white" : "text-gray-500 hover:text-gray-700"
          } ${!submittedImage ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <Eye className="w-3 h-3" /> Review
        </button>
        <button
          onClick={() => submittedImage && startRedo()}
          role="tab"
          aria-selected={tab === "redo"}
          disabled={!submittedImage}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold transition ${
            tab === "redo" ? "text-violet-600 border-b-2 border-violet-600 bg-white" : "text-gray-500 hover:text-gray-700"
          } ${!submittedImage ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <RotateCcw className="w-3 h-3" /> Redo
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-4 min-h-0" role="tabpanel">

        {/* ---- Draw tab ---- */}
        {tab === "draw" && (
          <div className="space-y-3">
            {/* Hint */}
            {spec.hint && (
              <div>
                <button
                  onClick={() => setShowHint(!showHint)}
                  className="flex items-center gap-1 text-xs text-violet-600 font-semibold"
                >
                  <Lightbulb className="w-3 h-3" /> {showHint ? "Hide hint" : "Show hint"}
                </button>
                {showHint && (
                  <div className="mt-1 p-2 rounded-lg bg-amber-50 border border-amber-200">
                    <p className="text-xs text-amber-800">{spec.hint}</p>
                  </div>
                )}
              </div>
            )}

            {/* Canvas */}
            <div className="rounded-xl overflow-hidden border-2 border-gray-300 bg-white">
              <canvas
                ref={canvasRef}
                onPointerDown={startDraw}
                onPointerMove={draw}
                onPointerUp={endDraw}
                onPointerLeave={endDraw}
                className="block w-full touch-none cursor-crosshair"
                style={{ height: "400px" }}
              />
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Colors */}
              <div className="flex items-center gap-1" role="radiogroup" aria-label="Brush color">
                {COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`w-6 h-6 rounded-full border-2 transition ${color === c ? "border-gray-900 scale-110" : "border-gray-300"}`}
                    style={{ backgroundColor: c }}
                    aria-label={`Color ${c}`}
                    aria-checked={color === c}
                    role="radio"
                  />
                ))}
              </div>
              {/* Brush sizes */}
              <div className="flex items-center gap-1" role="radiogroup" aria-label="Brush size">
                {BRUSH_SIZES.map(s => (
                  <button
                    key={s}
                    onClick={() => setBrushSize(s)}
                    className={`w-7 h-7 rounded-full border-2 flex items-center justify-center ${brushSize === s ? "border-violet-500 bg-violet-100" : "border-gray-300"}`}
                    aria-label={`Brush size ${s}`}
                    aria-checked={brushSize === s}
                    role="radio"
                  >
                    <span className="rounded-full bg-gray-700" style={{ width: s, height: s }} />
                  </button>
                ))}
              </div>
              {/* Clear */}
              <button
                onClick={clearCanvas}
                className="ml-auto px-3 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold flex items-center gap-1"
                aria-label="Clear canvas"
              >
                <Trash2 className="w-3 h-3" /> Clear
              </button>
            </div>

            {/* Submit */}
            <button
              onClick={submit}
              disabled={!hasDrawn}
              className="w-full h-11 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-sm font-bold transition flex items-center justify-center gap-1.5"
            >
              <Upload className="w-4 h-4" /> {hasDrawn ? "Submit Drawing for Review" : "Draw something first…"}
            </button>
          </div>
        )}

        {/* ---- Review tab ---- */}
        {tab === "review" && submittedImage && (
          <div className="space-y-3">
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={submittedImage} alt="Your drawing" className="w-full" />
            </div>

            <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-3">
              <p className="text-xs font-semibold text-indigo-800">
                ✅ Drawing submitted! Check the chat for your tutor's feedback.
              </p>
              <p className="text-[10px] text-indigo-600 mt-0.5">
                Your drawing has been sent to the AI tutor. The feedback appears in the conversation on the left.
              </p>
            </div>

            {/* Expected keywords checklist */}
            {spec.expectedKeywords && spec.expectedKeywords.length > 0 && (
              <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
                <p className="text-[10px] font-bold uppercase text-gray-500 mb-1.5">Your drawing should include:</p>
                <div className="flex flex-wrap gap-1.5">
                  {spec.expectedKeywords.map((kw, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-full bg-white border border-gray-200 text-[10px] text-gray-600">
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Ask Tutor */}
            {onAskTutor && (
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => askTutor("give me specific feedback on my drawing")}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-violet-50 text-violet-700 text-[10px] font-semibold hover:bg-violet-100 transition"
                >
                  <Bot className="w-3 h-3" /> Ask for feedback
                </button>
                <button
                  onClick={() => askTutor("show me how to draw this correctly")}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-violet-50 text-violet-700 text-[10px] font-semibold hover:bg-violet-100 transition"
                >
                  <Bot className="w-3 h-3" /> Show correct drawing
                </button>
              </div>
            )}

            {/* Redo button */}
            <button
              onClick={startRedo}
              className="w-full h-10 rounded-full bg-gray-100 text-gray-700 font-semibold text-sm hover:bg-gray-200 transition flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4" /> Start Over
            </button>
          </div>
        )}

        {/* ---- Redo tab (same as draw, but with a "starting fresh" banner) ---- */}
        {tab === "redo" && (
          <div className="space-y-3">
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
              <p className="text-xs font-semibold text-amber-800">Starting fresh! Your previous drawing was not saved.</p>
            </div>
            {/* Same canvas as Draw tab — useEffect reinitializes on tab change */}
            <div className="rounded-xl overflow-hidden border-2 border-gray-300 bg-white">
              <canvas
                ref={canvasRef}
                onPointerDown={startDraw}
                onPointerMove={draw}
                onPointerUp={endDraw}
                onPointerLeave={endDraw}
                className="block w-full touch-none cursor-crosshair"
                style={{ height: "400px" }}
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1" role="radiogroup" aria-label="Brush color">
                {COLORS.map(c => (
                  <button key={c} onClick={() => setColor(c)} className={`w-6 h-6 rounded-full border-2 transition ${color === c ? "border-gray-900 scale-110" : "border-gray-300"}`} style={{ backgroundColor: c }} aria-label={`Color ${c}`} role="radio" aria-checked={color === c} />
                ))}
              </div>
              <div className="flex items-center gap-1" role="radiogroup" aria-label="Brush size">
                {BRUSH_SIZES.map(s => (
                  <button key={s} onClick={() => setBrushSize(s)} className={`w-7 h-7 rounded-full border-2 flex items-center justify-center ${brushSize === s ? "border-violet-500 bg-violet-100" : "border-gray-300"}`} aria-label={`Brush size ${s}`} role="radio" aria-checked={brushSize === s}>
                    <span className="rounded-full bg-gray-700" style={{ width: s, height: s }} />
                  </button>
                ))}
              </div>
              <button onClick={clearCanvas} className="ml-auto px-3 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold flex items-center gap-1" aria-label="Clear canvas">
                <Trash2 className="w-3 h-3" /> Clear
              </button>
            </div>
            <button onClick={submit} disabled={!hasDrawn} className="w-full h-11 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-sm font-bold transition flex items-center justify-center gap-1.5">
              <Upload className="w-4 h-4" /> {hasDrawn ? "Submit Drawing" : "Draw something first…"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
