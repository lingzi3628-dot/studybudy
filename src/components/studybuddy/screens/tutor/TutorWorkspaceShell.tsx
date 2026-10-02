"use client";

/**
 * TutorWorkspaceShell — Phase F8 (Workspace Shell)
 *
 * Layout component that splits the AI Tutor screen into:
 *   - Conversation panel (left, contains the chat)
 *   - Workspace panel (right, contains the current activity)
 *
 * Desktop (md+): both panels side by side, resizable via a drag divider.
 *   The workspace can be collapsed (conversation takes full width).
 * Mobile: tabbed — user switches between "Chat" and "Workspace" tabs.
 *
 * This is a PURE LAYOUT component. It contains zero business logic:
 *   - The conversation content is passed as `conversationContent`
 *   - The workspace content is passed as `workspaceContent`
 *   - The caller decides what to render in each panel
 *
 * Safety:
 *   - Feature-flagged via NEXT_PUBLIC_TUTOR_WORKSPACE (default: off)
 *   - When flag is off, AITutorChat renders without this shell (old behavior)
 *   - No changes to attachment formats, AI prompts, or streaming protocol
 *
 * Usage:
 *   <TutorWorkspaceShell
 *     conversationContent={<MessageList + Composer />}
 *     workspaceContent={<GraphRenderer spec={...} />}
 *     workspaceTitle="Fractions Bar Chart"
 *     onClearWorkspace={() => setWorkspaceArtifact(null)}
 *   />
 */

import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import {
  PanelRightClose, PanelRightOpen, X, MessageSquare, Wrench,
} from "lucide-react";

// ============================================================
// Types
// ============================================================

export interface TutorWorkspaceShellProps {
  /** Content for the conversation panel (message list + composer) */
  conversationContent: ReactNode;
  /** Content for the workspace panel (the current activity). null = workspace closed */
  workspaceContent: ReactNode | null;
  /** Title shown in the workspace header (e.g. "Fractions Bar Chart") */
  workspaceTitle?: string;
  /** Called when the user closes the workspace panel */
  onClearWorkspace?: () => void;
}

// ============================================================
// Component
// ============================================================

export function TutorWorkspaceShell({
  conversationContent,
  workspaceContent,
  workspaceTitle = "Workspace",
  onClearWorkspace,
}: TutorWorkspaceShellProps) {
  // Mobile: which tab is active
  const [mobileTab, setMobileTab] = useState<"chat" | "workspace">("chat");

  // Desktop: panel width as percentage (conversation width). Workspace gets the rest.
  const [conversationPct, setConversationPct] = useState(55);
  const [isDragging, setIsDragging] = useState(false);

  // Whether the workspace is open (has content)
  const workspaceOpen = workspaceContent !== null;

  // When workspace content changes, switch mobile tab to workspace so the user sees it
  useEffect(() => {
    if (workspaceContent !== null) {
      setMobileTab("workspace");
    }
  }, [workspaceContent]);

  // ---- Drag-to-resize (desktop) ----
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = (x / rect.width) * 100;
      // Clamp: conversation can't be less than 25% or more than 80%
      setConversationPct(Math.min(80, Math.max(25, pct)));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    // Prevent text selection while dragging
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
    };
  }, [isDragging]);

  // ============================================================
  // Render
  // ============================================================

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full"
    >
      {/* ---- Mobile: tab switcher (only visible on < md) ---- */}
      {workspaceOpen && (
        <div className="md:hidden flex border-b border-gray-200 bg-white flex-shrink-0">
          <button
            onClick={() => setMobileTab("chat")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition ${
              mobileTab === "chat"
                ? "text-indigo-600 border-b-2 border-indigo-600"
                : "text-gray-500"
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" /> Chat
          </button>
          <button
            onClick={() => setMobileTab("workspace")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition ${
              mobileTab === "workspace"
                ? "text-indigo-600 border-b-2 border-indigo-600"
                : "text-gray-500"
            }`}
          >
            <Wrench className="w-3.5 h-3.5" /> Workspace
          </button>
        </div>
      )}

      {/* ---- Main content area ---- */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Conversation panel */}
        <div
          className={`${
            workspaceOpen
              ? `md:flex ${mobileTab === "chat" ? "flex" : "hidden"} md:flex`
              : "flex w-full"
          } flex-col min-h-0`}
          style={workspaceOpen ? { width: `${conversationPct}%` } : { width: "100%" }}
        >
          {conversationContent}
        </div>

        {/* Drag divider (desktop only, only when workspace is open) */}
        {workspaceOpen && (
          <div
            className="hidden md:flex w-1.5 cursor-col-resize bg-gray-200 hover:bg-indigo-400 transition-colors flex-shrink-0 relative group"
            onMouseDown={handleMouseDown}
          >
            <div className="absolute inset-y-0 -left-1 -right-1" />
          </div>
        )}

        {/* Workspace panel */}
        {workspaceOpen && (
          <div
            className={`${
              mobileTab === "workspace" ? "flex" : "hidden md:flex"
            } flex-col min-h-0 border-l border-gray-200 bg-gray-50`}
            style={{ width: `${100 - conversationPct}%` }}
          >
            {/* Workspace header */}
            <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-gray-200 flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Wrench className="w-3.5 h-3.5 text-indigo-500 flex-shrink-0" />
                <span className="text-xs font-semibold text-gray-900 truncate">
                  {workspaceTitle}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {/* Collapse workspace (desktop) */}
                <button
                  onClick={onClearWorkspace}
                  className="hidden md:flex p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition"
                  title="Close workspace"
                >
                  <PanelRightClose className="w-4 h-4" />
                </button>
                {/* Close workspace (mobile) */}
                <button
                  onClick={onClearWorkspace}
                  className="md:hidden p-1 text-gray-400 hover:text-gray-600"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Workspace content (scrollable) */}
            <div className="flex-1 overflow-auto min-h-0">
              {workspaceContent}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
