"use client";
import { useState, useMemo } from "react";
import { Save, Loader2 } from "lucide-react";

export function CompositionEditor({ spec, onSave }: { spec: any; onSave?: (text: string) => void }) {
  const [text, setText] = useState<string>(spec?.content || spec?.prompt || "");
  const [saving, setSaving] = useState(false);

  const wordCount = useMemo(() => {
    const words = text.trim().split(/\s+/).filter(Boolean);
    return words.length;
  }, [text]);

  const charCount = text.length;
  const paragraphCount = text.split(/\n\s*\n/).filter((p) => p.trim()).length;
  const readingTime = Math.max(1, Math.ceil(wordCount / 200));

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50">
        <div className="flex gap-3 text-[10px] text-gray-500">
          <span><b className="text-gray-700">{wordCount}</b> words</span>
          <span><b className="text-gray-700">{charCount}</b> chars</span>
          <span><b className="text-gray-700">{paragraphCount}</b> paragraphs</span>
          <span>~{readingTime} min read</span>
        </div>
        {onSave && (
          <button
            onClick={() => { setSaving(true); onSave(text); setTimeout(() => setSaving(false), 500); }}
            disabled={saving}
            className="px-3 py-1 rounded-full bg-indigo-600 text-white text-[10px] font-semibold flex items-center gap-1 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Save
          </button>
        )}
      </div>

      {/* Prompt (if provided by AI) */}
      {spec?.prompt && (
        <div className="px-3 py-2 bg-indigo-50 border-b border-indigo-100">
          <p className="text-[10px] font-semibold text-indigo-700 uppercase">Assignment</p>
          <p className="text-xs text-indigo-600 mt-0.5">{spec.prompt}</p>
          {spec.minWords && <p className="text-[10px] text-indigo-400 mt-0.5">Minimum {spec.minWords} words</p>}
        </div>
      )}

      {/* Editor */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Start writing your essay or report here…"
        className="flex-1 w-full p-4 text-sm outline-none resize-none font-serif leading-relaxed"
        style={{ minHeight: "300px" }}
      />

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-gray-200 bg-gray-50 flex justify-between text-[9px] text-gray-400">
        <span>{spec?.format === "report" ? "Report format" : "Essay format"} · Markdown supported</span>
        <span>Auto-saved locally</span>
      </div>
    </div>
  );
}
