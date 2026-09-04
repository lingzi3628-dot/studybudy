"use client";

/**
 * CodeEditor — Phase 48
 *
 * A CodeMirror 6 wrapper that supports multiple languages with proper
 * syntax highlighting. Lazy-loads the language extension on demand so we
 * don't ship all language packages if the user only edits Python.
 *
 * Features:
 *   - Syntax highlighting for python, javascript, typescript, sql, markdown, json, text
 *   - One Dark theme (matches the AI Tutor / Python Runner look)
 *   - Line numbers + active-line highlight
 *   - Auto-resize to fill the parent container
 *   - Tab size 2 (matches the rest of the codebase)
 *   - Read-only mode (for "view only" project previews)
 *
 * Used by:
 *   - DevBuddyScreen (Phase 48) — main editor for code projects
 *   - BackendBuddyScreen (Phase 52) — SQL editor
 *   - WebBuddyScreen (Phase 51) — HTML/CSS/JS editor
 */

import { useEffect, useRef } from "react";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, lineNumbers, highlightActiveLine, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { oneDark } from "@codemirror/theme-one-dark";

// Language extensions — lazy via dynamic import is overkill here since
// each language package is ~10-30KB. We import them statically so they
// tree-shake properly. The total editor bundle is ~150KB gzipped.
import { python } from "@codemirror/lang-python";
import { javascript } from "@codemirror/lang-javascript";
import { sql, PostgreSQL, SQLite, MySQL } from "@codemirror/lang-sql";
import { markdown } from "@codemirror/lang-markdown";
import { json } from "@codemirror/lang-json";

export type CodeLanguage =
  | "python"
  | "javascript"
  | "typescript"
  | "jsx"
  | "tsx"
  | "sql"
  | "markdown"
  | "json"
  | "html"
  | "css"
  | "text";

/**
 * Map a CodeLanguage to its CodeMirror language extension.
 * For languages without a dedicated extension (html, css, text), we fall
 * back to no highlighting — the editor still works as a plain text editor.
 */
function languageExtension(lang: CodeLanguage): Extension[] {
  switch (lang) {
    case "python":
      return [python()];
    case "javascript":
      return [javascript({ jsx: false, typescript: false })];
    case "typescript":
      return [javascript({ jsx: false, typescript: true })];
    case "jsx":
      return [javascript({ jsx: true, typescript: false })];
    case "tsx":
      return [javascript({ jsx: true, typescript: true })];
    case "sql":
      // Default to SQLite — matches our sql.js sandbox (Phase 52)
      return [sql({ dialect: SQLite })];
    case "markdown":
      return [markdown()];
    case "json":
      return [json()];
    case "html":
    case "css":
    case "text":
    default:
      return [];
  }
}

/**
 * Detect the CodeLanguage from a file path's extension.
 * Used by the DevBuddyScreen when opening a file with no stored language.
 */
export function detectLanguageFromPath(path: string): CodeLanguage {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "py": return "python";
    case "js": case "mjs": case "cjs": return "javascript";
    case "ts": return "typescript";
    case "jsx": return "jsx";
    case "tsx": return "tsx";
    case "sql": return "sql";
    case "md": case "markdown": return "markdown";
    case "json": return "json";
    case "html": case "htm": return "html";
    case "css": return "css";
    default: return "text";
  }
}

export function CodeEditor({
  value,
  onChange,
  language = "text",
  readOnly = false,
  placeholder = "",
  minHeight = "200px",
  className = "",
}: {
  value: string;
  onChange?: (newValue: string) => void;
  language?: CodeLanguage;
  readOnly?: boolean;
  placeholder?: string;
  minHeight?: string;
  className?: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  // Keep the onChange ref in sync so we don't re-create the editor on every change
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  // Create the editor once on mount
  useEffect(() => {
    if (!editorRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && onChangeRef.current) {
        onChangeRef.current(update.state.doc.toString());
      }
    });

    const extensions: Extension[] = [
      ...languageExtension(language),
      lineNumbers(),
      highlightActiveLine(),
      history(),
      indentUnit.of("  "),
      EditorState.tabSize.of(2),
      EditorView.lineWrapping,
      oneDark,
      updateListener,
      EditorView.theme({
        "&": {
          fontSize: "13px",
          height: "100%",
          minHeight,
        },
        ".cm-content": {
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          padding: "8px 0",
        },
        ".cm-gutters": {
          backgroundColor: "#1a1a1a",
          border: "none",
        },
        ".cm-activeLineGutter": {
          backgroundColor: "rgba(255,255,255,0.05)",
        },
        "&.cm-focused": {
          outline: "none",
        },
      }),
      EditorState.readOnly.of(readOnly),
      keymap.of(defaultKeymap),
      keymap.of(historyKeymap),
    ];

    const state = EditorState.create({
      doc: value,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // We deliberately only re-create the editor when `language` or `readOnly`
    // changes — not on every `value` change (which would reset the cursor).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, readOnly, minHeight]);

  // When the `value` prop changes from OUTSIDE the editor (e.g. loading a new
  // file), update the editor's document. We compare against the current doc
  // to avoid clobbering the cursor on every keystroke.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== value) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value },
      });
    }
  }, [value]);

  return (
    <div
      ref={editorRef}
      className={`w-full overflow-hidden rounded-lg border border-gray-700 ${className}`}
      style={{ minHeight }}
      aria-label="Code editor"
      role="textbox"
    />
  );
}
