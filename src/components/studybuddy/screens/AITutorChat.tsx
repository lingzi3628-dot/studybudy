"use client";

import { useEffect, useState, useRef, useCallback, type ReactElement } from "react";
import {
  ChevronLeft,
  Send,
  Loader2,
  Sparkles,
  Search,
  Link,
  Trash2,
  Plus,
  MessageSquare,
  X,
  Video,
  Image as ImageIcon,
  Paperclip,
  GitBranch,
  Brain,
  Bot,
  User as UserIcon,
  Copy,
  Check,
  RotateCw,
  Download,
  Code,
  Volume2,
  VolumeX,
  Mic,
  Square,
  Save,
  FileText,
  GraduationCap,
  PanelRightOpen,
  Play,
} from "lucide-react";
import { useApp } from "../store";
import { GraphRenderer, type GraphSpec } from "./GraphRenderers";
import katex from "katex";
import { BuddySwitcher, getStoredBuddyId } from "./BuddySwitcher";
import type { BuddyId } from "@/lib/buddies/types";
import { extractCodeFiles } from "@/lib/code-extract";
import { FractionManipulative } from "./tutor/FractionManipulative";
import { CodePreviewPanel } from "./tutor/CodePreviewPanel";
import { ScienceSimulationPanel } from "./tutor/ScienceSimulationPanel";
import { GraphLab } from "./tutor/GraphLab";
import { QuizLab } from "./tutor/QuizLab";
import { DrawingStudio } from "./tutor/DrawingStudio";
import { FlowchartRenderer } from "./tutor/FlowchartRenderer";
// Phase 7 — 8 critical new plugin panels
import { CompositionEditor } from "./tutor/CompositionEditor";
import { TimelinePanel } from "./tutor/TimelinePanel";
import { GeometryPanel } from "./tutor/GeometryPanel";
import { PhysicsSimPanel } from "./tutor/PhysicsSimPanel";
import { MoleculePanel } from "./tutor/MoleculePanel";
import { FreeBodyPanel } from "./tutor/FreeBodyPanel";
import { FinancialCalculator } from "./tutor/FinancialCalculator";
import { AnatomyPanel } from "./tutor/AnatomyPanel";
// Phase 9 — code playground (Tools Hub integration)
import { CodePlayground } from "./tutor/CodePlayground";
// Phase FC — Flowchart renderer feature flag.
// NEXT_PUBLIC_FLOWCHART_RENDERER_ENABLED controls client-side rendering.
// TUTOR_FLOWCHART_GENERATION_ENABLED (server-side, in context-builder.ts) controls AI prompt.
// Both default to off — old scene/drawing behavior is preserved.
const USE_FLOWCHART_RENDERER = process.env.NEXT_PUBLIC_FLOWCHART_RENDERER_ENABLED === "true";
import {
  isBrowserTTSSupported,
  isBrowserASRSupported,
  browserSpeak,
  stopBrowserSpeech,
  startBrowserListening,
} from "./voice-mode";
import { TutorWorkspaceShell } from "./tutor/TutorWorkspaceShell";

// Phase F8 — Workspace shell feature flag.
// When true, attachments get an "Open in workspace" button that opens them
// in a side panel (desktop) or full-screen tab (mobile) alongside the chat.
// Default: off — old inline-attachment behavior is preserved.
const USE_WORKSPACE = process.env.NEXT_PUBLIC_TUTOR_WORKSPACE === "true";

type Attachment = {
  type: "video" | "image" | "graph" | "conceptmap" | "source" | string;
  url: string | null;
  caption: string;
};

type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
  thinking?: string[]; // Proof Data Engine thinking steps
  proof?: { passed: boolean; curriculumMatch: boolean; readabilityScore: number; factualConfidence: number };
  createdAt: string;
};

type Conversation = {
  id: string;
  title: string;
  updatedAt: string;
  messages?: ChatMsg[];
};

const LAST_TUTOR_CONVERSATION_KEY = "studybuddy.tutor.lastConversationId";
const TUTOR_MODE_STORAGE_KEY = "studybuddy.tutor.learningModes";
type TutorLearningMode = "standard" | "explain" | "practice" | "hint" | "simpler";

function readTutorLearningModes(): Record<string, TutorLearningMode> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(TUTOR_MODE_STORAGE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch { return {}; }
}

function saveTutorLearningMode(key: string, mode: TutorLearningMode) {
  try {
    const modes = readTutorLearningModes();
    modes[key] = mode;
    window.localStorage.setItem(TUTOR_MODE_STORAGE_KEY, JSON.stringify(modes));
  } catch { /* Preference storage is best-effort. */ }
}

type ConceptMapSpec = {
  title?: string;
  nodes: Array<{ id: string; label: string; color?: string }>;
  edges: Array<{ from: string; to: string; label?: string }>;
};

/**
 * AITutorChat — Phase 28+
 *
 * ChatGPT-style persistent AI Tutor:
 * - Conversations saved to DB (never lost on refresh)
 * - Scroll back through past messages
 * - Multiple conversations (like ChatGPT sidebar)
 * - AI can fetch YouTube videos, images, graphs, concept maps
 * - Curriculum context injected per grade level
 * - Markdown rendering (code blocks, lists, tables, links)
 * - SVG-rendered graphs (function plotters) and concept maps (node/edge diagrams)
 * - Copy / retry buttons on AI messages
 */
export function AITutorChat() {
  const setScreen = useApp((s) => s.setScreen);
  const dataSaver = useApp((s) => s.dataSaver);
  const activeTopicId = useApp((s) => s.activeTopicId);
  const openCreate = useApp((s) => s.openCreate);
  const pendingAutoGreeting = useApp((s) => s.pendingAutoGreeting);
  const setPendingAutoGreeting = useApp((s) => s.setPendingAutoGreeting);

  // Phase F8 — Workspace artifact state.
  // AC1: pendingWorkspaceContext is sent as a SEPARATE field in the request body,
  // NOT mixed into the visible learner message. It's cleared after each send.
  const WORKSPACE_LS_KEY = "studybuddy.tutor.workspaceArtifact";
  const WORKSPACE_TABS_LS_KEY = "studybuddy.tutor.workspaceTabs";
  const [pendingWorkspaceContext, setPendingWorkspaceContext] = useState<{
    artifactType: string;
    artifactCaption: string;
    action: string;
  } | null>(null);

  // ====================================================================
  // Phase 8 — Multi-tab workspace state.
  //
  // Replaces the single-artifact `workspaceArtifact` model with an array
  // of open tabs. Each tab is one Attachment (graph, quiz, timeline, etc.)
  // open at the same time. The learner switches between tabs without
  // losing context. Tabs persist to localStorage + (when wired) to the
  // WorkspaceArtifact DB table.
  //
  // Backward compat:
  //   - `workspaceArtifact` (single) is now a DERIVED value = the active
  //     tab. Existing code that reads `workspaceArtifact` still works.
  //   - `setWorkspaceArtifact` now opens/replaces the active tab.
  //   - `openInWorkspace` now opens in a new tab (doesn't replace).
  // ====================================================================
  type WorkspaceTab = {
    id: string;          // unique tab id (uuid-ish, generated client-side)
    artifact: Attachment; // the Attachment being displayed
    persistedId: string | null; // DB WorkspaceArtifact.id once saved (null until then)
    createdAt: number;
  };

  const [workspaceTabs, setWorkspaceTabs] = useState<WorkspaceTab[]>(() => {
    if (typeof window !== "undefined" && USE_WORKSPACE) {
      try {
        const stored = window.localStorage.getItem(WORKSPACE_TABS_LS_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as WorkspaceTab[];
          if (Array.isArray(parsed)) return parsed;
        }
      } catch {}
    }
    return [];
  });
  const [activeTabId, setActiveTabId] = useState<string | null>(() => {
    if (typeof window !== "undefined" && USE_WORKSPACE) {
      try {
        const stored = window.localStorage.getItem(WORKSPACE_TABS_LS_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as WorkspaceTab[];
          if (Array.isArray(parsed) && parsed.length > 0) return parsed[0].id;
        }
      } catch {}
    }
    return null;
  });

  // Persist tabs to localStorage whenever they change.
  useEffect(() => {
    if (typeof window === "undefined" || !USE_WORKSPACE) return;
    try {
      if (workspaceTabs.length > 0) {
        window.localStorage.setItem(WORKSPACE_TABS_LS_KEY, JSON.stringify(workspaceTabs));
      } else {
        window.localStorage.removeItem(WORKSPACE_TABS_LS_KEY);
      }
    } catch {}
  }, [workspaceTabs]);

  // The active tab's artifact (or null). This is the backward-compat shim
  // for existing code that reads `workspaceArtifact` as a single value.
  const activeTab = workspaceTabs.find((t) => t.id === activeTabId) ?? null;
  const workspaceArtifact: Attachment | null = activeTab?.artifact ?? null;

  // Generate a unique tab id (crypto.randomUUID with fallback for old browsers).
  const newTabId = () => {
    try {
      if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    } catch {}
    return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  };

  // Open an attachment in the workspace — opens a NEW tab (Phase 8 multi-tab).
  // Previously this replaced whatever was open. Now it adds a tab.
  // If the same caption (same spec) is already open in a tab, switch to it
  // instead of creating a duplicate.
  const openInWorkspace = useCallback((att: Attachment) => {
    setWorkspaceTabs((prev) => {
      // Phase 9 fix — for code_playground, dedup by TYPE (one playground
      // at a time). If a code_playground tab is already open, REPLACE its
      // content instead of opening a new tab. This prevents the "3
      // playground tabs stacking" issue when the AI emits multiple
      // code_playground fences.
      // For other types, dedup by type + caption (exact match).
      const isSingleton = att.type === "code_playground";
      const existing = isSingleton
        ? prev.find((t) => t.artifact.type === att.type)
        : prev.find((t) => t.artifact.type === att.type && t.artifact.caption === att.caption);

      if (existing) {
        if (isSingleton) {
          // Replace the content but keep the tab id (so the user doesn't
          // lose their tab position).
          setActiveTabId(existing.id);
          return prev.map((t) => t.id === existing.id ? { ...t, artifact: att } : t);
        }
        setActiveTabId(existing.id);
        return prev;
      }
      const tab: WorkspaceTab = {
        id: newTabId(),
        artifact: att,
        persistedId: null,
        createdAt: Date.now(),
      };
      setActiveTabId(tab.id);
      return [...prev, tab];
    });
  }, []);

  // Phase 8 — Persist a new artifact to the DB via /api/artifacts.
  // Called when openInWorkspace opens a tab that hasn't been persisted yet.
  // Best-effort: if the POST fails (network, auth, etc.), the tab still opens
  // locally — we just don't get a persistedId back. The learner can still use
  // the artifact; it just won't survive a page reload from another device.
  const persistArtifactToDB = useCallback(async (tabId: string, att: Attachment) => {
    if (!USE_WORKSPACE) return;
    try {
      // Read activeConversation.id from a ref-like getter to avoid "used before
      // declaration" TS error (activeConversation is declared further down).
      // We use a function ref pattern: the setter updates a mutable closure.
      // Simplest: read from a state ref we maintain alongside.
      // Actually, since this callback is recreated when activeConversation?.id
      // changes (it's in the deps), we can read it via a captured local.
      // But activeConversation is declared AFTER this function in the file.
      // Solution: use a lazy ref that reads the latest value at call time.
      const convId = (window as any).__studybuddyActiveConversationId ?? null;
      // Derive pluginId + title from the attachment.
      // Most attachment types map 1:1 to a plugin ID; for graph we use "graph.bar"
      // as a safe default (the adapter accepts any graph variant).
      const pluginIdMap: Record<string, string> = {
        graph: "graph.bar", quiz: "assessment.quiz", draw_task: "assessment.draw-task",
        conceptmap: "diagram.concept-map", flowchart_v1: "diagram.flowchart",
        manipulative: "math.manipulative", code_project: "code.html",
        science_simulation: "diagram.circuit",
        composition: "writing.composition", timeline: "diagram.timeline",
        geometry: "math.geometry", physics_sim: "science.physics-sim",
        molecule: "science.chemistry-sim", free_body: "diagram.free-body",
        financial: "business.financial", anatomy: "diagram.anatomy",
      };
      const pluginId = pluginIdMap[att.type] ?? "graph.bar";
      let title = att.type;
      let payload: any = null;
      try {
        payload = JSON.parse(att.caption);
        if (payload && typeof payload.title === "string") title = payload.title;
      } catch {
        payload = { caption: att.caption };
      }
      const r = await fetch("/api/artifacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pluginId,
          title: String(title).slice(0, 120),
          artifactType: att.type,
          payload,
          conversationId: convId,
          status: "ready",
        }),
      });
      if (!r.ok) return;
      const d = await r.json();
      if (d.artifact?.id) {
        // Save the persistedId on the tab so future modifications can PUT to it.
        setWorkspaceTabs((prev) => prev.map((t) =>
          t.id === tabId ? { ...t, persistedId: d.artifact.id } : t
        ));
      }
    } catch {
      // Best-effort — failure here is fine. The tab is still open locally.
    }
  }, []);

  // Wrapped version of openInWorkspace that also persists to DB.
  // Used by the auto-open useEffect + the chat notification card click.
  const openInWorkspaceAndPersist = useCallback((att: Attachment) => {
    setWorkspaceTabs((prev) => {
      // Phase 9 fix — code_playground is a singleton (one at a time).
      // If a code_playground is already open, REPLACE its content.
      const isSingleton = att.type === "code_playground";
      const existing = isSingleton
        ? prev.find((t) => t.artifact.type === att.type)
        : prev.find((t) => t.artifact.type === att.type && t.artifact.caption === att.caption);
      if (existing) {
        if (isSingleton) {
          setActiveTabId(existing.id);
          // Replace content, keep tab id + persistedId
          return prev.map((t) => t.id === existing.id ? { ...t, artifact: att } : t);
        }
        setActiveTabId(existing.id);
        return prev;
      }
      const tab: WorkspaceTab = {
        id: newTabId(),
        artifact: att,
        persistedId: null,
        createdAt: Date.now(),
      };
      setActiveTabId(tab.id);
      // Persist in the background (don't block the UI).
      persistArtifactToDB(tab.id, att);
      return [...prev, tab];
    });
  }, [persistArtifactToDB]);

  // Replace the active tab's artifact (used when AI revises an existing
  // artifact — "change Diana to 8" updates the active graph in place
  // instead of opening a new tab).
  const setWorkspaceArtifact = useCallback((att: Attachment | null) => {
    if (att === null) {
      // Closing the active tab → remove it + activate the next one.
      setWorkspaceTabs((prev) => {
        if (!activeTabId) return prev;
        const idx = prev.findIndex((t) => t.id === activeTabId);
        if (idx === -1) return prev;
        const next = [...prev];
        next.splice(idx, 1);
        // Activate the tab that took its place (or the last one).
        const newActive = next[idx]?.id ?? next[next.length - 1]?.id ?? null;
        setActiveTabId(newActive);
        return next;
      });
      return;
    }
    // Replace the active tab's artifact (keep tab id + persistedId).
    setWorkspaceTabs((prev) => prev.map((t) =>
      t.id === activeTabId ? { ...t, artifact: att } : t
    ));
  }, [activeTabId]);

  // Phase 8 — Persist a learner's edit to the active tab's DB artifact.
  // Called when the learner edits an artifact inline (sliders, text, drag).
  // If the tab has a persistedId (from createArtifact), PUT the new payload
  // to /api/artifacts/[id] which creates a new version (Phase 4 service).
  // Best-effort: if the PUT fails, the tab still updates locally.
  const persistTabUpdate = useCallback(async (att: Attachment) => {
    if (!USE_WORKSPACE) return;
    if (!activeTab?.persistedId) return; // not persisted yet — skip
    try {
      let payload: any = null;
      try { payload = JSON.parse(att.caption); } catch { payload = { caption: att.caption }; }
      await fetch(`/api/artifacts/${activeTab.persistedId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload,
          changeSummary: "learner edit",
        }),
      });
    } catch {
      // Best-effort — failure here is fine. The tab is still updated locally.
    }
  }, [activeTab?.persistedId]);

  // Phase 8 — Update the active tab's artifact AND persist to DB.
  // Used by learner-side inline editing (sliders, text, drag) so changes
  // save back to the workspace + DB simultaneously.
  const updateActiveArtifact = useCallback((att: Attachment) => {
    setWorkspaceArtifact(att);
    persistTabUpdate(att);
  }, [setWorkspaceArtifact, persistTabUpdate]);

  // Close a specific tab by id.
  const closeTab = useCallback((tabId: string) => {
    setWorkspaceTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === tabId);
      if (idx === -1) return prev;
      const next = [...prev];
      next.splice(idx, 1);
      // If we're closing the active tab, activate a neighbor.
      if (tabId === activeTabId) {
        const newActive = next[idx]?.id ?? next[next.length - 1]?.id ?? null;
        setActiveTabId(newActive);
      }
      return next;
    });
  }, [activeTabId]);

  // Activate a specific tab.
  const activateTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
  }, []);

  // Phase F9 — Save the current workspace artifact as a Project (uses existing Project model)
  const [savingWorkspace, setSavingWorkspace] = useState(false);
  const saveWorkspaceAsProject = useCallback(async () => {
    if (!workspaceArtifact) return;
    setSavingWorkspace(true);
    try {
      // Create a project with the artifact's JSON spec as a file
      const title = workspaceArtifact.type === "graph" ? "Graph Workspace"
        : workspaceArtifact.type === "quiz" ? "Quiz Workspace"
        : workspaceArtifact.type === "draw_task" ? "Drawing Task"
        : workspaceArtifact.type === "conceptmap" ? "Concept Map"
        : workspaceArtifact.type === "composition" ? "Writing Draft"
        : workspaceArtifact.type === "timeline" ? "Timeline"
        : workspaceArtifact.type === "geometry" ? "Geometry Construction"
        : workspaceArtifact.type === "physics_sim" ? "Physics Simulation"
        : workspaceArtifact.type === "molecule" ? "Molecule Viewer"
        : workspaceArtifact.type === "free_body" ? "Force Diagram"
        : workspaceArtifact.type === "financial" ? "Financial Calculator"
        : workspaceArtifact.type === "anatomy" ? "Anatomy Diagram"
        : workspaceArtifact.type === "code_playground" ? "Code Playground"
        : "Workspace Artifact";
      const fileContent = workspaceArtifact.caption || "";
      const fileName = `${workspaceArtifact.type}.json`;

      const r = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buddyId: "study",
          title: `${title} — ${new Date().toLocaleDateString()}`,
          description: `Saved from AI Tutor workspace on ${new Date().toISOString()}`,
          tags: [workspaceArtifact.type, "workspace"],
          files: [{ path: fileName, language: "json", content: fileContent, isEntry: true }],
        }),
      });
      if (r.ok) {
        const d = await r.json();
        // Briefly show success, then navigate to the project
        if (d.project?.id) {
          useApp.getState().setActiveProjectId(d.project.id);
          useApp.getState().setScreen("projects");
        }
      }
    } catch (e: any) {
      console.error("[workspace] save failed:", e?.message);
    } finally {
      setSavingWorkspace(false);
    }
  }, [workspaceArtifact]);

  // Phase 87 — Auto-send the greeting message when the AI Tutor loads
  // after onboarding (pendingAutoGreeting is set by PostOnboardingPopup)
  useEffect(() => {
    if (pendingAutoGreeting && !busy && messages.length === 0) {
      const greeting = pendingAutoGreeting;
      setPendingAutoGreeting(null);  // clear so it only fires once
      // Small delay to let the component fully mount
      setTimeout(() => send(greeting), 500);
    }
  }, [pendingAutoGreeting]); // eslint-disable-line react-hooks/exhaustive-deps
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const chatSessionRef = useRef(0);

  // Phase 8 — expose activeConversation.id on window so persistArtifactToDB
  // (declared above, before activeConversation is in scope) can read it
  // without a TS "used before declaration" error.
  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).__studybuddyActiveConversationId = activeConversation?.id ?? null;
    }
  }, [activeConversation?.id]);

  // Phase F15 — Auto-open workspace when a new attachment arrives.
  // Watches the last message's attachments. If the last AI message has a
  // workspace-compatible attachment AND the workspace isn't already showing
  // that attachment, auto-open it after 2 seconds. This keeps the chat clean
  // (compact notification card shows briefly) then the workspace opens.
  const WORKSPACE_TYPES_F15 = ["graph", "quiz", "draw_task", "manipulative", "code_project", "science_simulation", "conceptmap", "flowchart_v1",
    // Phase 7 — 8 critical new plugin attachment types
    "composition", "timeline", "geometry", "physics_sim", "molecule", "free_body", "financial", "anatomy",
    // Phase 9 — code playground (Tools Hub integration)
    "code_playground",
  ];
  // Phase 8 — track which workspace_edit patches we've already applied, so
  // we don't re-apply the same patch on every messages change (the useEffect
  // re-runs when messages update, but we only want to apply each patch once).
  const appliedWorkspaceEdits = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!USE_WORKSPACE) return;
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant" && m.attachments?.length);
    if (!lastAssistant?.attachments) return;

    // Phase 8 — Check for workspace_edit FIRST (before opening new tabs).
    // workspace_edit is a PATCH to the active tab, not a new artifact.
    // The AI uses this to write directly into the workspace without opening
    // a new tab. This is the "co-editor" pattern.
    const editAtt = lastAssistant.attachments.find((a) => a.type === "workspace_edit");
    if (editAtt) {
      // Dedup by message id + caption — don't apply the same patch twice.
      const editKey = `${lastAssistant.id}:${editAtt.caption}`;
      if (!appliedWorkspaceEdits.current.has(editKey)) {
        appliedWorkspaceEdits.current.add(editKey);
        try {
          const editSpec = JSON.parse(editAtt.caption);
          // Apply the patch to the active tab.
          // If no tab is active, we can't apply — skip silently.
          // (The AI should only emit workspace_edit when there's an active
          // artifact to edit. If it emits one without an active tab, the
          // patch is lost — but the learner can still see the AI's text
          // reply explaining what it tried to do.)
          if (activeTab && workspaceArtifact) {
            let newCaption: string;
            if (editSpec.op === "replace" && editSpec.spec) {
              newCaption = JSON.stringify(editSpec.spec);
            } else if (editSpec.op === "merge" && editSpec.patch) {
              const currentSpec = JSON.parse(workspaceArtifact.caption);
              const merged = { ...currentSpec, ...editSpec.patch };
              newCaption = JSON.stringify(merged);
            } else {
              throw new Error("Invalid workspace_edit spec");
            }
            // Update the active tab in place (revise-in-place).
            setWorkspaceArtifact({ ...workspaceArtifact, caption: newCaption });
          }
        } catch {
          // Malformed patch — ignore. The AI's text reply still shows.
        }
      }
    }

    // Then check for NEW artifacts to open in tabs.
    const workspaceAtt = lastAssistant.attachments.find((a) => WORKSPACE_TYPES_F15.includes(a.type));
    if (!workspaceAtt) return;
    // Phase 8: openInWorkspace now opens in a NEW tab (multi-tab workspace).
    // It dedupes — if a tab with the same type+caption already exists,
    // it just activates it. So calling it here is safe even if the
    // same artifact is already open.
    const alreadyOpen = workspaceTabs.some(
      (t) => t.artifact.type === workspaceAtt.type && t.artifact.caption === workspaceAtt.caption
    );
    if (alreadyOpen) return;
    const timer = setTimeout(() => {
      openInWorkspaceAndPersist(workspaceAtt);
    }, 1500); // 1.5s delay so the user sees the chat notification card first
    return () => clearTimeout(timer);
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [activityStatus, setActivityStatus] = useState("Waiting for your tutor…");
  const [pendingImage, setPendingImage] = useState<string | null>(null); // base64 data URL for vision
  const [pendingDocument, setPendingDocument] = useState<{ text: string; fileName: string; fileType: string; preview: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  // Phase 84 — course outline upload (separate from generic document upload)
  const outlineInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingOutline, setUploadingOutline] = useState(false);
  // Continuous voice conversation mode (like ChatGPT voice mode)
  const [voiceMode, setVoiceMode] = useState(false);
  const voiceModeRef = useRef(false); // ref version for use inside callbacks
  const [voiceModeState, setVoiceModeState] = useState<"idle" | "listening" | "speaking">("idle");
  const voiceListenerRef = useRef<ReturnType<typeof startBrowserListening> | null>(null);
  // Per-conversation model switcher (Feature #7) + model comparison (Feature #1)
  const [availableBuddies, setAvailableBuddies] = useState<Array<{ modelName: string; displayName: string; emoji: string; canUse: boolean }>>([]);
  const [currentModel, setCurrentModel] = useState<string>("");
  const [userGrade, setUserGrade] = useState<string>("");
  // Phase 84 — track + course awareness for dynamic suggestions + placeholder
  const [userTrack, setUserTrack] = useState<string>("k12");
  const [userCourse, setUserCourse] = useState<string | null>(null);
  // Phase 47 — which buddy is active for this conversation. Read from
  // localStorage on mount so the user's last choice is remembered.
  const [activeBuddyId, setActiveBuddyId] = useState<BuddyId>("study");
  const [learningMode, setLearningMode] = useState<TutorLearningMode>("standard");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [compareBuddies, setCompareBuddies] = useState<string[]>([]);
  const [compareResults, setCompareResults] = useState<any[]>([]);
  const [comparing, setComparing] = useState(false);
  const [preferredIndex, setPreferredIndex] = useState<number | null>(null);
  // Exam generator state
  const [showExamForm, setShowExamForm] = useState(false);
  const [examConfig, setExamConfig] = useState({ topic: "", numQuestions: "10", numPages: "2", gradeLevel: "", examType: "kcse_style", difficulty: "medium" });
  const [generatingExam, setGeneratingExam] = useState(false);
  const [examProgress, setExamProgress] = useState(0);
  const [examResult, setExamResult] = useState<{ html: string; summary: any } | null>(null);
  const [viewingExam, setViewingExam] = useState<string | null>(null); // HTML of exam being viewed

  // Auto-generate exam from chat (triggered by examgen block in AI reply)
  const autoGenerateExam = async (config: any) => {
    setGeneratingExam(true);
    setExamProgress(0);
    // Show a progress message in chat
    const progressMsg: ChatMsg = {
      id: `exam-progress-${Date.now()}`,
      role: "assistant",
      content: `📝 Generating your exam on **${config.topic}**… Please wait while I create ${config.numQuestions} questions.`,
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, progressMsg]);

    // Simulate progress (the actual generation happens server-side)
    const progressInterval = setInterval(() => {
      setExamProgress((p) => Math.min(90, p + Math.random() * 15));
    }, 2000);

    try {
      const r = await fetch("/api/tutor/generate-exam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const d = await r.json();
      clearInterval(progressInterval);
      setExamProgress(100);

      if (!r.ok) throw new Error(d.error ?? "Generation failed");

      // Auto-publish to Exam Hub
      let examHubId: string | null = null;
      try {
        const pubRes = await fetch("/api/admin/exam-papers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            examType: "ai_template",
            title: `${config.topic} — ${config.gradeLevel} Exam (${d.summary.questionCount}Q, ${d.summary.totalMarks}M)`,
            description: `AI-generated exam on ${config.topic} for ${config.gradeLevel}. ${d.summary.questionCount} questions, ${d.summary.totalMarks} marks. Difficulty: ${d.summary.difficulty}.`,
            category: "studybuddy_ai",
            gradeLevel: config.gradeLevel,
            subjectName: config.topic,
            questions: d.exam.questions,
            totalMarks: d.summary.totalMarks,
            durationMin: Math.ceil(d.summary.totalMarks * 1.5),
            isPublished: true,
          }),
        });
        if (pubRes.ok) {
          const pubData = await pubRes.json();
          examHubId = pubData.paper?.id ?? null;
        }
      } catch (pubErr: any) {
        console.error("[autoGenerateExam] publish failed:", pubErr?.message);
      }

      // Show success message with link
      const successMsg: ChatMsg = {
        id: `exam-done-${Date.now()}`,
        role: "assistant",
        content: `✅ Your exam on **${config.topic}** is ready!\n\n📊 **${d.summary.questionCount} questions · ${d.summary.totalMarks} marks · ${config.gradeLevel} · ${config.difficulty}**\n\n🔗 Tap the exam card below to view and download it as a PDF.\n\n📢 I've also published this exam to the **Exam Hub** so other students can try it too!`,
        createdAt: new Date().toISOString(),
      };
      setMessages((m) => [...m, successMsg]);

      setExamResult({ html: d.html, summary: { ...d.summary, examHubId } });
    } catch (e: any) {
      clearInterval(progressInterval);
      setExamProgress(0);
      const errMsg: ChatMsg = {
        id: `exam-err-${Date.now()}`,
        role: "assistant",
        content: `❌ Couldn't generate the exam: ${e?.message ?? "unknown error"}. Try with fewer questions.`,
        createdAt: new Date().toISOString(),
      };
      setMessages((m) => [...m, errMsg]);
    } finally {
      setGeneratingExam(false);
      setTimeout(() => setExamProgress(0), 1000);
    }
  };
  const [loading, setLoading] = useState(true);
  const [showSidebar, setShowSidebar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Voice mode state
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load conversation list
  const loadConversations = useCallback(async () => {
    try {
      const r = await fetch("/api/tutor/conversations", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Could not load chat history");
      const nextConversations = d.conversations ?? [];
      setConversations(nextConversations);

      // Restore the last chat after refresh or when the tutor screen remounts.
      const savedId = window.localStorage.getItem(LAST_TUTOR_CONVERSATION_KEY);
      const restoreId = savedId === "__new__" ? null : savedId || nextConversations[0]?.id || null;
      if (!restoreId) setLearningMode(readTutorLearningModes().__new__ ?? "standard");
      if (restoreId) {
        const single = await fetch(`/api/tutor/conversations?id=${encodeURIComponent(restoreId)}`, { cache: "no-store" });
        const saved = await single.json();
        if (single.ok && saved.conversation) {
          setActiveConversation(saved.conversation);
          setLearningMode(readTutorLearningModes()[restoreId] ?? "standard");
          window.localStorage.setItem(LAST_TUTOR_CONVERSATION_KEY, restoreId);
          setMessages((saved.conversation.messages ?? []).map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            attachments: Array.isArray(m.attachments) ? m.attachments : undefined,
            createdAt: m.createdAt,
          })));
          return;
        }
        if (single.status === 404) {
          window.localStorage.removeItem(LAST_TUTOR_CONVERSATION_KEY);
        } else if (!single.ok) {
          throw new Error(saved.error ?? "The last conversation could not be restored. Open Chat History to retry.");
        }
      }
    } catch (e: any) {
      setError(e?.message ?? "Chat history could not be loaded. Your saved chats may still be available when you retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Phase 86.2 — Listen for drawing submissions from DrawTaskRenderer
  // When the user submits a drawing, send it to the AI as an image for review
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { imageDataUrl: string; task: any };
      if (!detail?.imageDataUrl) return;
      const task = detail.task;
      const reviewPrompt = task
        ? `I've drawn my attempt at: "${task.prompt}". Please review my drawing and tell me what I did well and what to improve. ${task.expectedKeywords ? `Check if I included: ${task.expectedKeywords.join(", ")}` : ""} If I made mistakes, offer to show me the correct drawing.`
        : "Please review my drawing and give me feedback.";
      // Phase 86.3 — pass the image directly to send() instead of using
      // setPendingImage (which is async and causes a stale-closure bug where
      // send() reads the OLD pendingImage = null → skips the image entirely)
      send(reviewPrompt, detail.imageDataUrl);
    };
    window.addEventListener("studybuddy:submit-drawing", handler);
    return () => window.removeEventListener("studybuddy:submit-drawing", handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A phone-to-computer handoff without an existing Study Room resumes the
  // tutor conversation and routes directly to the workspace the tutor offered.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("studybuddy.pendingComputerWorkspace");
      const pending = raw ? JSON.parse(raw) : null;
      if (!pending || pending.topicId) return;
      const targets: Record<string, string> = {
        exam: "examHub", code: "codeRunner", web: "webBuilder",
        modeling: "mlPlayground", simulation: "lab", data: "notebook", tvet: "tvetBuddy",
      };
      const target = targets[pending.workspace];
      if (target) {
        window.localStorage.removeItem("studybuddy.pendingComputerWorkspace");
        setScreen(target as any);
      } else if (pending.workspace === "computer") {
        window.localStorage.removeItem("studybuddy.pendingComputerWorkspace");
        setScreen("tutor");
      } else openCreate("room");
    } catch { /* A malformed/stale handoff should not block opening chat. */ }
  }, [openCreate, setScreen]);

  useEffect(() => () => {
    chatSessionRef.current += 1;
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, busy]);

  // Load a conversation's messages
  // Phase 8 — Load past workspace artifacts for a conversation from the DB.
  // Called when the user opens an existing conversation. Fetches all
  // WorkspaceArtifact rows for this conversation + opens the most recent
  // few in tabs so the learner can pick up where they left off.
  const loadWorkspaceTabs = useCallback(async (conversationId: string) => {
    if (!USE_WORKSPACE) return;
    try {
      const r = await fetch(`/api/artifacts?conversationId=${conversationId}&limit=10`, {
        cache: "no-store",
      });
      if (!r.ok) return;
      const d = await r.json();
      const artifacts: any[] = Array.isArray(d.artifacts) ? d.artifacts : [];
      if (artifacts.length === 0) {
        // No persisted artifacts for this conversation — keep whatever's
        // already in localStorage tabs (so the learner doesn't lose their
        // current workspace if they switched conversations briefly).
        return;
      }
      // Convert DB WorkspaceArtifact rows → WorkspaceTab shape.
      // Take the most recent 5 to avoid tab bar overflow.
      const tabs: WorkspaceTab[] = artifacts.slice(0, 5).map((a) => ({
        id: a.id ?? newTabId(),
        artifact: {
          // Map the persisted artifactType back to the Attachment type string.
          type: a.artifactType ?? a.payload?.type ?? "graph",
          url: null,
          caption: typeof a.payload === "string" ? a.payload : JSON.stringify(a.payload ?? {}),
        },
        persistedId: a.id ?? null,
        createdAt: a.createdAt ? new Date(a.createdAt).getTime() : Date.now(),
      }));
      if (tabs.length > 0) {
        setWorkspaceTabs(tabs);
        setActiveTabId(tabs[0].id);
      }
    } catch {
      // Network error or auth failure — don't crash the conversation open.
      // Just leave the existing localStorage tabs in place.
    }
  }, []);

  const openConversation = async (id: string) => {
    try {
      const r = await fetch(`/api/tutor/conversations?id=${id}`, { cache: "no-store" });
      const d = await r.json();
      if (d.conversation) {
        setActiveConversation(d.conversation);
        window.localStorage.setItem(LAST_TUTOR_CONVERSATION_KEY, id);
        setLearningMode(readTutorLearningModes()[id] ?? "standard");
        // Map DB messages to client ChatMsg shape
        const convMessages: ChatMsg[] = (d.conversation.messages ?? []).map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          attachments: Array.isArray(m.attachments) ? m.attachments : undefined,
          createdAt: m.createdAt,
        }));
        setMessages(convMessages);
        // Phase 8 — load past workspace artifacts for this conversation.
        // Best-effort: if the API call fails, we keep whatever's already
        // in localStorage tabs (so the learner doesn't lose their current
        // workspace if there's a transient network error).
        loadWorkspaceTabs(id);
      }
    } catch {}
    setShowSidebar(false);
  };

  // Start a new conversation
  const newConversation = () => {
    chatSessionRef.current += 1;
    setActiveConversation(null);
    setMessages([]);
    // Phase 8 — clear the workspace tabs when starting a new conversation.
    // (We don't persist them — they belonged to the previous conversation.)
    setWorkspaceTabs([]);
    setActiveTabId(null);
    window.localStorage.setItem(LAST_TUTOR_CONVERSATION_KEY, "__new__");
    setLearningMode(readTutorLearningModes().__new__ ?? "standard");
    setError(null);
    setShowUpgrade(false);
    setShowSidebar(false);
  };

  const changeLearningMode = (mode: TutorLearningMode) => {
    setLearningMode(mode);
    saveTutorLearningMode(activeConversation?.id ?? "__new__", mode);
  };

  // Delete a conversation
  const deleteConversation = async (id: string) => {
    if (!confirm("Delete this conversation?")) return;
    await fetch(`/api/tutor/conversations?id=${id}`, { method: "DELETE" });
    if (activeConversation?.id === id) {
      window.localStorage.setItem(LAST_TUTOR_CONVERSATION_KEY, "__new__");
      setActiveConversation(null);
      setMessages([]);
    }
    await loadConversations();
  };

  // Send a message (Phase 52 — streaming via /api/tutor/chat/stream)
  // Phase 86.3 — accept optional overrideImage param so callers (like the
  // drawing canvas submit handler) can pass an image directly without relying
  // on the async setState + stale closure issue.
  // Phase 7 (Stage 1 doc reader) — send documentContext as a SEPARATE field
  // (NOT concatenated into the user message). The server injects it into
  // the system prompt so the AI sees the doc text, but the user's saved
  // message in the DB contains only their actual question — not 30k chars
  // of PDF text. The document shows up as an attachment card in the chat.
  const send = async (text?: string, overrideImage?: string | null) => {
    const q = (text ?? input).trim();
    const img = overrideImage ?? pendingImage;
    const doc = pendingDocument;
    if ((!q && !img && !doc) || busy) return;
    setInput("");
    setPendingImage(null);
    setPendingDocument(null);
    setBusy(true);
    setActivityStatus("Waiting for your tutor…");
    const sessionAtSend = chatSessionRef.current;
    setError(null);
    setShowUpgrade(false);

    // The visible user message is JUST the question (or a default if they
    // attached a doc without typing a question). The doc text is sent
    // separately as `documentContext` so it doesn't pollute the saved
    // chat history.
    const messageText = q || (doc ? `📄 ${doc.fileName}` : img ? "(Image attached)" : "");
    const documentContext = doc ? {
      text: doc.text,
      fileName: doc.fileName,
      fileType: doc.fileType,
    } : undefined;

    const tempUserMsg: ChatMsg = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: messageText,
      // Show the document as an attachment card in the user's bubble.
      // Mirrors how images are shown — `document` type renders a compact
      // file card (filename + char count + "extracted" label).
      attachments: [
        ...(img ? [{ type: "image", url: img, caption: "Uploaded image" }] : []),
        ...(doc ? [{ type: "document", url: null, caption: JSON.stringify({ fileName: doc.fileName, fileType: doc.fileType, charCount: doc.text.length }) }] : []),
      ],
      createdAt: new Date().toISOString(),
    };
    // Live placeholder assistant bubble — updated token-by-token as deltas arrive
    const streamId = `stream-${Date.now()}`;
    const liveMsg: ChatMsg = {
      id: streamId,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, tempUserMsg, liveMsg]);

    // Hide in-progress / completed <thinking> blocks while streaming
    const liveDisplay = (acc: string): string => {
      const open = acc.indexOf("<thinking>");
      let visible = acc;
      if (open !== -1) {
        const close = acc.indexOf("</thinking>");
        if (close !== -1) visible = (acc.slice(0, open) + acc.slice(close + 11)).replace(/^\s+/, "");
        else visible = acc.slice(0, open);
      }
      // Keep the model's drawing specification out of the chat bubble while it
      // streams; the validated visual appears as an attachment when complete.
      const visualOpen = visible.search(/```\s*(?:mathgraph|conceptmap|examgen)\b/i);
      if (visualOpen !== -1) {
        const visualClose = visible.indexOf("```", visible.indexOf("\n", visualOpen) + 1);
        if (visualClose === -1) visible = visible.slice(0, visualOpen);
        else visible = (visible.slice(0, visualOpen) + visible.slice(visualClose + 3)).trim();
      }
      const workspaceOpen = visible.search(/```computer_workspace\b/i);
      if (workspaceOpen !== -1) visible = visible.slice(0, workspaceOpen).trim();
      return visible;
    };

    const requestBody = JSON.stringify({
      conversationId: activeConversation?.id ?? null,
      studyRoomTopicId: activeTopicId ?? undefined,
      message: messageText,
      image: img,
      // Phase 7 (Stage 1 doc reader) — extracted document text sent as a
      // SEPARATE field (not concatenated into `message`). The server injects
      // this into the system prompt so the AI sees the doc, but the saved
      // user message in DB only contains `messageText` (the actual question).
      documentContext,
      // Phase 45: keep replies short + skip image-search in Data Saver mode
      dataSaver,
      // Phase 47: route to the right buddy prompt builder
      buddyId: activeBuddyId,
      learningMode,
      clientPlatform: "web",
      // AC1: Workspace context sent as a SEPARATE field — not in the visible message.
      // The server uses this to give the AI context about what the learner is looking at.
      // The visible ChatMessage saved to DB contains only messageText (the learner's actual question).
      workspaceContext: pendingWorkspaceContext ?? undefined,
    });

    // AC1: Clear the pending workspace context after it's been included in the request
    setPendingWorkspaceContext(null);

    const finalizeStreamedMessage = (patch: Partial<ChatMsg>) => {
      setMessages((m) => m.map((msg) => (msg.id === streamId ? { ...msg, ...patch } : msg)));
    };

    try {
      const r = await fetch("/api/tutor/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      });
      const ct = r.headers.get("content-type") ?? "";

      // JSON responses = errors (401 / 402 / 400 / 500) or unexpected fallback
      if (!r.ok || ct.includes("application/json")) {
        const d = await r.json().catch(() => ({} as any));
        setMessages((m) => m.filter((msg) => msg.id !== streamId));
        if (d.needsUpgrade || r.status === 402) {
          setError(d.error ?? "Limit reached");
          setShowUpgrade(true);
          return;
        }
        if (d.ok === false) {
          // Graceful AI errors (e.g. disconnected Study Buddy) → shown as chat message
          const errorMsg: ChatMsg = {
            id: `error-${Date.now()}`,
            role: "assistant",
            content: d.error ?? "AI couldn't respond. Please try another Study Buddy.",
            createdAt: new Date().toISOString(),
          };
          setMessages((m) => [...m, errorMsg]);
          return;
        }
        throw new Error(d.error ?? "Failed");
      }

      // ---- SSE parse loop ----
      const reader = r.body?.getReader();
      if (!reader) throw new Error("Streaming not supported");
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      let gotDone = false;

      const handleEvent = (rawEvent: string) => {
        let eventName = "message";
        const dataLines: string[] = [];
        for (const line of rawEvent.split("\n")) {
          if (line.startsWith("event:")) eventName = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
        }
        if (dataLines.length === 0) return;
        let payload: any;
        try {
          payload = JSON.parse(dataLines.join("\n"));
        } catch {
          return;
        }
        if (eventName === "meta") {
          if (sessionAtSend !== chatSessionRef.current) return;
          if (payload.conversationId) {
            const conversation = { id: payload.conversationId, title: q.slice(0, 50), updatedAt: new Date().toISOString() };
            setActiveConversation((current) => current?.id === conversation.id ? current : conversation);
            window.localStorage.setItem(LAST_TUTOR_CONVERSATION_KEY, payload.conversationId);
            saveTutorLearningMode(payload.conversationId, learningMode);
          }
        } else if (eventName === "delta") {
          if (sessionAtSend !== chatSessionRef.current) return;
          acc += payload.text ?? "";
          finalizeStreamedMessage({ content: liveDisplay(acc) });
        } else if (eventName === "status") {
          if (sessionAtSend === chatSessionRef.current && typeof payload.text === "string") setActivityStatus(payload.text);
        } else if (eventName === "done") {
          if (sessionAtSend !== chatSessionRef.current) return;
          gotDone = true;
          finalizeStreamedMessage({
            id: `ai-${Date.now()}`,
            content: payload.reply ?? liveDisplay(acc),
            attachments: payload.attachments,
            thinking: payload.thinking,
            proof: payload.proof,
          });
          if (payload.examGen) autoGenerateExam(payload.examGen);
          if (!activeConversation && payload.conversationId) {
            setActiveConversation({ id: payload.conversationId, title: q.slice(0, 50), updatedAt: new Date().toISOString() });
            window.localStorage.setItem(LAST_TUTOR_CONVERSATION_KEY, payload.conversationId);
            saveTutorLearningMode(payload.conversationId, learningMode);
          }
        } else if (eventName === "error") {
          if (sessionAtSend !== chatSessionRef.current) return;
          gotDone = true;
          setMessages((m) => {
            const copy = m.filter((msg) => msg.id !== streamId);
            copy.push({
              id: `error-${Date.now()}`,
              role: "assistant",
              content: payload.error ?? "AI couldn't respond. Please try again.",
              createdAt: new Date().toISOString(),
            });
            return copy;
          });
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          if (rawEvent.trim()) handleEvent(rawEvent);
        }
      }

      if (!gotDone && acc.trim()) {
        // Stream ended without a done event — keep what we have
        if (sessionAtSend === chatSessionRef.current) {
          finalizeStreamedMessage({ id: `ai-${Date.now()}`, content: liveDisplay(acc) });
        }
      } else if (!gotDone && !acc.trim()) {
        if (sessionAtSend === chatSessionRef.current) {
          setMessages((m) => m.filter((msg) => msg.id !== streamId));
          setError("AI didn't respond. Please try again.");
        }
      }

      await loadConversations();
    } catch (e: any) {
      // Streaming failed (network / unsupported) — fall back to the classic endpoint
      try {
        if (sessionAtSend !== chatSessionRef.current) return;
        const r = await fetch("/api/tutor/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody,
        });
        const d = await r.json();
        if (sessionAtSend !== chatSessionRef.current) return;
        if (!r.ok) {
          setMessages((m) => m.filter((msg) => msg.id !== streamId));
          if (d.needsUpgrade || r.status === 402) {
            setError(d.error ?? "Limit reached");
            setShowUpgrade(true);
          } else {
            throw new Error(d.error ?? "Failed");
          }
          return;
        }
        if (d.ok === false) {
          setMessages((m) => m.filter((msg) => msg.id !== streamId));
          const errorMsg: ChatMsg = {
            id: `error-${Date.now()}`,
            role: "assistant",
            content: d.error ?? "AI couldn't respond. Please try another Study Buddy.",
            createdAt: new Date().toISOString(),
          };
          setMessages((m) => [...m, errorMsg]);
          return;
        }
        finalizeStreamedMessage({
          id: `ai-${Date.now()}`,
          content: d.reply,
          attachments: d.attachments,
          thinking: d.thinking,
          proof: d.proof,
        });
        if (d.examGen) autoGenerateExam(d.examGen);
        if (!activeConversation) {
          setActiveConversation({ id: d.conversationId, title: q.slice(0, 50), updatedAt: new Date().toISOString() });
          window.localStorage.setItem(LAST_TUTOR_CONVERSATION_KEY, d.conversationId);
          saveTutorLearningMode(d.conversationId, learningMode);
          await loadConversations();
        } else {
          await loadConversations();
        }
      } catch (e2: any) {
        setError(e2?.message ?? "Failed to send message");
        setMessages((m) => m.filter((msg) => msg.id !== streamId && msg.id !== tempUserMsg.id));
      }
    } finally {
      setBusy(false);
      setActivityStatus("Waiting for your tutor…");
      // Phase 87 — Auto-track this study interaction (progressive tracking)
      // Records study time + activity type + awards XP
      const activity = q.toLowerCase().includes("quiz") ? "quiz"
        : q.toLowerCase().includes("exam") ? "exam"
        : q.toLowerCase().includes("draw") ? "drawing"
        : "chat";
      fetch("/api/tutor/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ durationSec: 30, activity, topic: q.slice(0, 100) }),
      }).catch(() => {});
    }
  };

  // Retry last failed message
  const retry = () => {
    // Find last user message
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    // Remove last AI message (if any)
    setMessages((m) => {
      const copy = [...m];
      // If the last message is from the assistant with no content / error, drop it
      if (copy[copy.length - 1]?.role === "assistant" && !copy[copy.length - 1]?.content) {
        copy.pop();
      }
      return copy;
    });
    send(lastUser.content);
  };

  // =====================================================================
  // Continuous voice conversation mode (like ChatGPT voice mode)
  // =====================================================================
  // When voiceMode is ON:
  //   1. We auto-start listening for the user's question
  //   2. When the user stops, we transcribe and auto-send
  //   3. When the AI replies, we speak it back via browser TTS
  //   4. When TTS finishes, we automatically start listening again
  // The cycle continues until the user toggles voiceMode off.

  // Start the voice mode cycle — listen for user's question
  const startVoiceListening = useCallback(() => {
    if (!isBrowserASRSupported()) {
      setError("Voice mode needs Chrome, Edge, or Safari (Firefox doesn't support speech recognition).");
      setVoiceMode(false);
      voiceModeRef.current = false;
      return;
    }
    setVoiceModeState("listening");
    try {
      // Stop any existing listener
      if (voiceListenerRef.current) {
        voiceListenerRef.current.stop();
        voiceListenerRef.current = null;
      }
      const listener = startBrowserListening({
        lang: "en-US",
        continuous: false,
        interimResults: false,
        maxDurationSec: 30,
      });
      voiceListenerRef.current = listener;

      listener.onResult((r) => {
        if (r.isFinal && r.text.trim()) {
          // Stop listener, then send the text via the regular send path
          // which will trigger the AI reply → onReplyFinished → startSpeaking cycle
          setVoiceModeState("speaking");
          setInput(r.text);
          send(r.text);
        }
      });
      listener.onError((e: any) => {
        const err = e?.error;
        if (err === "not-allowed" || err === "service-not-allowed") {
          setError("Microphone access denied. Allow mic permission for voice mode.");
          setVoiceMode(false);
          voiceModeRef.current = false;
        } else if (err === "no-speech") {
          // User didn't speak — just restart listening if voiceMode is still on
          if (voiceModeRef.current) {
            setTimeout(() => startVoiceListening(), 300);
          }
        } else if (err === "aborted" || err === "interrupted") {
          // Normal events in voice mode — ASR gets aborted when user stops,
          // TTS gets interrupted when user starts speaking. Don't show errors.
          // Just restart listening if voice mode is still on.
          if (voiceModeRef.current) {
            setTimeout(() => startVoiceListening(), 200);
          }
        } else {
          console.warn("[voice mode] ASR error:", err ?? "unknown");
          // Don't show error banner for minor voice mode issues — just restart
          if (voiceModeRef.current) {
            setTimeout(() => startVoiceListening(), 500);
          }
        }
      });
      listener.onEnd(() => {
        voiceListenerRef.current = null;
        // If voice mode is still on but we haven't transitioned to speaking,
        // restart listening (handles the "no-speech" silent restart path)
        if (voiceModeRef.current && voiceModeState !== "speaking") {
          setTimeout(() => startVoiceListening(), 200);
        }
      });
    } catch (e: any) {
      console.error("[voice mode] startListening failed:", e?.message);
      setVoiceMode(false);
      voiceModeRef.current = false;
    }
  }, [send, voiceModeState]);

  // Speak the AI reply, then start listening again
  const speakReplyAndContinue = useCallback((text: string) => {
    if (!isBrowserTTSSupported()) {
      console.warn("[voice mode] TTS not supported — skipping speak, going back to listening");
      setTimeout(() => startVoiceListening(), 300);
      return;
    }
    setVoiceModeState("speaking");
    const plainText = text
      .replace(/```[\s\S]*?```/g, " [code block] ")
      .replace(/\$\$[^$]+\$\$/g, " math equation ")
      .replace(/\$([^$]+)\$/g, " $1 ")
      .replace(/[*_`#>|]/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
    if (!plainText) {
      // Empty reply — go straight back to listening
      setTimeout(() => startVoiceListening(), 200);
      return;
    }
    try {
      const { promise } = browserSpeak(plainText, { rate: 1.0, lang: "en-US" });
      promise.then(() => {
        // TTS finished — start listening again if voice mode is still on
        if (voiceModeRef.current) {
          setTimeout(() => startVoiceListening(), 300);
        }
      }).catch((e: any) => {
        // "interrupted" is normal — happens when TTS is cancelled (e.g. user taps stop)
        if (e?.message !== "interrupted" && e?.message !== "aborted") {
          console.warn("[voice mode] TTS error:", e?.message);
        }
        // Go back to listening even on TTS error
        if (voiceModeRef.current) {
          setTimeout(() => startVoiceListening(), 300);
        }
      });
    } catch (e: any) {
      console.warn("[voice mode] browserSpeak failed:", e?.message);
      if (voiceModeRef.current) {
        setTimeout(() => startVoiceListening(), 300);
      }
    }
  }, [startVoiceListening]);

  // Watch for new AI replies while in voice mode → speak them
  useEffect(() => {
    if (!voiceMode) return;
    if (busy) return; // wait for the AI to finish
    if (messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== "assistant") return;
    // Only speak if we haven't already spoken this message
    // (use a data attribute on the message via a ref check)
    // For simplicity, we use a ref to track the last spoken message id
    if (lastSpokenRef.current === lastMsg.id) return;
    lastSpokenRef.current = lastMsg.id;
    speakReplyAndContinue(lastMsg.content);
  }, [messages, voiceMode, busy, speakReplyAndContinue]);

  const lastSpokenRef = useRef<string | null>(null);

  const toggleVoiceMode = () => {
    if (voiceMode) {
      // Turn off — stop listening + stop speaking
      if (voiceListenerRef.current) {
        voiceListenerRef.current.stop();
        voiceListenerRef.current = null;
      }
      stopBrowserSpeech();
      setVoiceMode(false);
      voiceModeRef.current = false;
      setVoiceModeState("idle");
    } else {
      // Turn on — start listening
      setVoiceMode(true);
      voiceModeRef.current = true;
      lastSpokenRef.current = null;
      setTimeout(() => startVoiceListening(), 100);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (voiceListenerRef.current) {
        voiceListenerRef.current.stop();
      }
      stopBrowserSpeech();
    };
  }, []);

  const copyMessage = (msg: ChatMsg) => {
    navigator.clipboard.writeText(msg.content);
    setCopiedId(msg.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Phase 48 — Save an AI reply's code blocks as a new Project.
  // Only called for buddies that support code files (dev, web, backend).
  // Creates the project via POST /api/projects with the extracted files,
  // then routes the user to the DevBuddyScreen (Phase 48) with the new
  // project loaded.
  const handleSaveAsProject = async (msg: ChatMsg) => {
    const files = extractCodeFiles(msg.content);
    if (!files || files.length === 0) return;
    const firstUserMessage = messages.find((m) => m.role === "user");
    const title = (firstUserMessage?.content ?? "Untitled project").slice(0, 80);
    try {
      const r = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buddyId: activeBuddyId === "web" ? "web" : activeBuddyId === "backend" ? "backend" : "dev",
          title,
          description: `Generated by ${activeBuddyId}Buddy in AI Tutor`,
          tags: [activeBuddyId],
          files: files.map((f) => ({
            path: f.path,
            language: f.language,
            content: f.content,
            isEntry: f.isEntry,
          })),
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      // Route to the right editor based on buddyId
      const state = (useApp as any).getState();
      state.setActiveProjectId?.(d.project.id);
      if (activeBuddyId === "dev") {
        state.setScreen("devBuddy");
      } else if (activeBuddyId === "web") {
        state.setScreen("webBuilder");
      } else if (activeBuddyId === "backend") {
        // Phase 55 — BackendBuddy has its own workspace now
        state.setScreen("backendBuddy");
      } else if (activeBuddyId === "ai") {
        state.setScreen("promptPlayground");
      } else {
        state.setScreen("devBuddy");
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to save project");
    }
  };

  // Document upload — extract text from PDF/DOC/DOCX/XLSX/CSV/TXT
  // Cap matches the backend (parseFormData default = 4MB, which is the
  // Vercel serverless body limit). Files between 4–10MB would silently
  // fail at the backend even though the frontend accepted them.
  const MAX_DOC_BYTES = 4 * 1024 * 1024; // 4 MB — matches /api/tutor/upload-document
  const handleDocumentUpload = async (file: File) => {
    if (!file) return;
    if (file.size > MAX_DOC_BYTES) {
      const mb = (file.size / 1024 / 1024).toFixed(1);
      const cap = (MAX_DOC_BYTES / 1024 / 1024).toFixed(0);
      setError(`Document too large (${mb} MB). Max is ${cap} MB — try splitting the PDF or pasting the relevant text.`);
      return;
    }
    setUploadingDoc(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const r = await fetch("/api/tutor/upload-document", {
        method: "POST",
        body: formData,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Upload failed");
      setPendingDocument({
        text: d.text,
        fileName: d.fileName,
        fileType: d.fileType,
        preview: d.preview,
      });
    } catch (e: any) {
      setError(e?.message ?? "Document upload failed");
    } finally {
      setUploadingDoc(false);
    }
  };

  // Phase 84 — Course outline upload (PDF/DOCX → AI parses into CourseKnowledge DB)
  // This makes the AI smarter for the user's specific track + grade + course.
  const handleOutlineUpload = async (file: File) => {
    if (!file) return;
    if (file.size > MAX_DOC_BYTES) {
      const mb = (file.size / 1024 / 1024).toFixed(1);
      setError(`Outline too large (${mb} MB). Max is ${(MAX_DOC_BYTES / 1024 / 1024).toFixed(0)} MB.`);
      return;
    }
    setUploadingOutline(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", file.name.replace(/\.[^/.]+$/, ""));
      formData.append("sourceType", "outline");
      const r = await fetch("/api/tutor/upload-outline", {
        method: "POST",
        body: formData,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Outline upload failed");
      // Notify the user via a system message in the chat
      const msg = d.message || `✓ Outline uploaded and parsed.`;
      const topicCount = d.knowledge?.topicCount || 0;
      setMessages((prev) => [
        ...prev,
        {
          id: `outline-${Date.now()}`,
          role: "assistant" as const,
          content: `${msg}\n\n📚 **Topics extracted:** ${topicCount}\n📎 File: ${file.name}\n\nNow when you ask questions about your course, I'll use this knowledge to give you specific, accurate answers. Try asking "what can you teach me?" to see what I now know!`,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (e: any) {
      setError(e?.message ?? "Outline upload failed");
    } finally {
      setUploadingOutline(false);
    }
  };

  // Load available buddies for per-conversation switching + comparison
  useEffect(() => {
    // Phase 47 — restore the user's last buddy choice from localStorage
    setActiveBuddyId(getStoredBuddyId());

    Promise.all([fetch("/api/user/models"), fetch("/api/auth/me")])
      .then(async ([mRes, meRes]) => {
        if (mRes.ok) {
          const d = await mRes.json();
          setAvailableBuddies(d.models ?? []);
        }
        if (meRes.ok) {
          const me = await meRes.json();
          if (me.authed) setCurrentModel(me.user?.currentModel ?? "study_buddy_free");
          if (me.user?.grade) setUserGrade(me.user.grade);
          // Phase 84 — load track + course for dynamic suggestions + placeholder
          if (me.user?.track) setUserTrack(me.user.track);
          if (me.user?.course) setUserCourse(me.user.course);
          // Phase 51 — if the user has a higher-ed track AND no buddy was previously
          // chosen (localStorage is empty), default to the track's preferred buddy.
          // This makes DevBuddy/DataBuddy/MLBuddy/TVETBuddy the default for higher-ed
          // users without overwriting an explicit prior choice.
          if (me.user?.track && me.user.track !== "k12") {
            const trackToBuddy: Record<string, BuddyId> = {
              dev: "dev",
              data: "data",
              ml: "ml",
              aiapp: "ai",
              tvet: "tvet",
              mixed: "study",  // mixed users get the general StudyBuddy default
            };
            const preferred = trackToBuddy[me.user.track];
            const stored = localStorage.getItem("studybuddy_active_buddy");
            if (preferred && !stored) {
              setActiveBuddyId(preferred);
              try { localStorage.setItem("studybuddy_active_buddy", preferred); } catch { /* ignore */ }
            }
          }
        }
      })
      .catch(() => {});
  }, []);

  // Switch model mid-conversation (Feature #7)
  const switchModel = async (modelName: string) => {
    if (modelName === currentModel) return;
    try {
      const r = await fetch("/api/user/model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelName }),
      });
      if (r.ok) {
        setCurrentModel(modelName);
        setShowModelPicker(false);
      }
    } catch {}
  };

  // Compare models (Feature #1) — send same prompt to 2-5 buddies in parallel
  const runComparison = async () => {
    if (compareBuddies.length < 2 || !input.trim()) return;
    setComparing(true);
    setCompareResults([]);
    setPreferredIndex(null);
    try {
      const r = await fetch("/api/tutor/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: input.trim(),
          modelNames: compareBuddies,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Comparison failed");
      setCompareResults(d.results ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Comparison failed");
    } finally {
      setComparing(false);
    }
  };

  // Handle user preference — saves the winning model as currentModel
  const handlePrefer = async (index: number) => {
    setPreferredIndex(index);
    const winner = compareResults[index];
    if (winner?.modelName && winner.modelName !== currentModel) {
      try {
        await fetch("/api/user/model", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modelName: winner.modelName }),
        });
        setCurrentModel(winner.modelName);
      } catch {}
    }
  };

  // Generate an exam/test via AI
  const generateExam = async () => {
    if (!examConfig.topic.trim() || generatingExam) return;
    setGeneratingExam(true);
    setShowExamForm(false);
    try {
      const r = await fetch("/api/tutor/generate-exam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: examConfig.topic.trim(),
          numQuestions: Number(examConfig.numQuestions),
          numPages: Number(examConfig.numPages),
          gradeLevel: examConfig.gradeLevel || "General",
          examType: examConfig.examType,
          difficulty: examConfig.difficulty,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Generation failed");
      setExamResult({ html: d.html, summary: d.summary });
      // Also show a chat message about the exam
      const aiMsg: ChatMsg = {
        id: `exam-${Date.now()}`,
        role: "assistant",
        content: `📝 I've created an exam on **${d.summary.topic}** with ${d.summary.questionCount} questions (${d.summary.totalMarks} marks) for ${d.summary.gradeLevel} students. Click the exam card below to view, download, or print it!`,
        createdAt: new Date().toISOString(),
      };
      setMessages((m) => [...m, aiMsg]);
    } catch (e: any) {
      // Show the error as a chat message (not a red banner)
      const errMsg: ChatMsg = {
        id: `exam-err-${Date.now()}`,
        role: "assistant",
        content: `❌ Couldn't generate the exam: ${e?.message ?? "unknown error"}. Try with fewer questions (e.g. 10) or a simpler topic.`,
        createdAt: new Date().toISOString(),
      };
      setMessages((m) => [...m, errMsg]);
    } finally {
      setGeneratingExam(false);
    }
  };

  const currentBuddy = availableBuddies.find((b) => b.modelName === currentModel);

  // Voice mode — start recording
  // Uses browser Web Speech API (webkitSpeechRecognition) as primary path
  // — completely free, no API key, no network call.
  // Falls back to MediaRecorder + /api/tutor/asr (server-side) if the
  // browser doesn't support SpeechRecognition (e.g. Firefox).
  const browserASRRef = useRef<ReturnType<typeof startBrowserListening> | null>(null);

  const startRecording = async () => {
    setError(null);

    // PRIORITY 1: Browser-based ASR (Web Speech API — completely free)
    if (isBrowserASRSupported()) {
      try {
        const listener = startBrowserListening({
          lang: "en-US",
          continuous: false,
          interimResults: false,
          maxDurationSec: 30,
        });
        browserASRRef.current = listener;
        setRecording(true);

        listener.onResult((r) => {
          if (r.isFinal && r.text.trim()) {
            setInput(r.text);
            // Auto-send the transcribed text
            send(r.text);
          }
        });
        listener.onError((e: any) => {
          console.error("[tutor] browser ASR error:", e?.error ?? e);
          const err = e?.error;
          if (err === "not-allowed" || err === "service-not-allowed") {
            setError("Microphone access denied. Allow mic permission to use voice mode.");
          } else if (err === "no-speech") {
            setError("Didn't hear anything — try speaking louder or closer to the mic");
          } else {
            setError("Voice recognition error: " + (err ?? "unknown"));
          }
          setRecording(false);
          browserASRRef.current = null;
        });
        listener.onEnd(() => {
          setRecording(false);
          browserASRRef.current = null;
        });
        return;
      } catch (e: any) {
        console.warn("[tutor] browser ASR setup failed, falling back to server:", e?.message);
        // Fall through to MediaRecorder fallback below
      }
    }

    // FALLBACK: Server-side ASR via MediaRecorder + /api/tutor/asr
    // (Used on Firefox and browsers without SpeechRecognition)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        // Stop the audio tracks (releases the mic indicator)
        stream.getTracks().forEach((t) => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        if (audioBlob.size < 1000) {
          setError("Recording too short — try speaking for longer");
          return;
        }
        // Transcribe via ASR endpoint
        setTranscribing(true);
        try {
          // Convert to base64
          const arrayBuffer = await audioBlob.arrayBuffer();
          const base64 = btoa(
            new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
          );
          const r = await fetch("/api/tutor/asr", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audioBase64: base64 }),
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error ?? "Transcription failed");
          if (d.text) {
            setInput(d.text);
            // Auto-send the transcribed text
            send(d.text);
          }
        } catch (e: any) {
          setError(e?.message ?? "Voice transcription failed");
        } finally {
          setTranscribing(false);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (e: any) {
      setError("Microphone access denied. Allow mic permission to use voice mode.");
    }
  };

  const stopRecording = () => {
    // Stop browser ASR listener if active
    if (browserASRRef.current) {
      browserASRRef.current.stop();
      browserASRRef.current = null;
    }
    // Stop MediaRecorder if active
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  };

  // Map the user's stored grade (e.g. "Grade 1", "Form 2", "Grade 10") to the
  // recommendation category bands shown in the empty-state grid. Each grade only
  // sees its own band + a small set of grade-agnostic "tool" categories.
  const gradeToRecommendationBands = (grade: string): string[] => {
    const g = (grade || "").trim();
    if (!g) return ["General", "Step-by-Step", "Vision"];
    const lower = g.toLowerCase();
    const numMatch = lower.match(/(?:grade|form|pp)\s*(\d+)/i);
    const num = numMatch ? parseInt(numMatch[1], 10) : NaN;
    // Pre-primary / lower primary (PP1, PP2, Grade 1–3)
    if (/^pp[12]/i.test(g) || (/^grade\s*[1-3]$/i.test(g))) {
      return ["Grade 1-3", "General", "Vision"];
    }
    // Upper primary (Grade 4–6)
    if (/^grade\s*[4-6]$/i.test(g)) {
      return ["Grade 4-6", "General", "Step-by-Step", "Vision"];
    }
    // Junior school (Grade 7–9)
    if (/^grade\s*[7-9]$/i.test(g)) {
      return ["Grade 7-9", "General", "Step-by-Step", "Vision", "Spreadsheets"];
    }
    // Senior school — Form 1-4 or CBE aliases Grade 10-13
    if (/^form\s*[1-4]$/i.test(g) || /^grade\s*1[0-3]$/i.test(g)) {
      return ["Form 1-4", "General", "Step-by-Step", "Vision", "Spreadsheets", "Database"];
    }
    // University
    if (/university|college|undergrad|grad/i.test(g) || (!Number.isNaN(num) && num >= 14)) {
      return ["University", "General", "Step-by-Step", "Vision", "Spreadsheets", "Database"];
    }
    // Unknown — fallback to safe universal set
    return ["General", "Step-by-Step", "Vision"];
  };

  const allSuggestedQuestions = [
    // Grade 1-3 — early years
    { icon: "🍎", text: "Make a pictogram: 8 apples, 5 bananas, 10 oranges (🍎 = 2 fruits each)", category: "Grade 1-3" },
    { icon: "✋", text: "Tally the votes: Red 8, Blue 12, Green 5, Yellow 3", category: "Grade 1-3" },
    // Grade 4-6 — upper junior
    { icon: "🟦", text: "Sort shapes: Carroll diagram (is red? is square?)", category: "Grade 4-6" },
    { icon: "⭕", text: "Show a Venn diagram of sets A, B, and C with their intersection", category: "Grade 4-6" },
    { icon: "📊", text: "Make a bar chart of class scores: Math 85, English 72, Science 90, History 68", category: "Grade 4-6" },
    // Grade 7-9 — lower secondary
    { icon: "📈", text: "Plot these data points: (0,0) (1,5) (2,10) (3,15) and draw a line of best fit", category: "Grade 7-9" },
    { icon: "🌿", text: "Make a stem-and-leaf plot of: 23 25 28 31 32 35 38 42 45 48", category: "Grade 7-9" },
    { icon: "📦", text: "Draw a box plot comparing class A and class B test scores", category: "Grade 7-9" },
    { icon: "📋", text: "Two-way table: gender × sport preference (15M/3F football, 5M/18F netball, 8M/6F tennis)", category: "Grade 7-9" },
    // Form 1-4 — high school
    { icon: "➖", text: "Draw -2 ≤ x ≤ 3 on a number line", category: "Form 1-4" },
    { icon: "🌳", text: "Make a probability tree diagram for two coin flips", category: "Form 1-4" },
    { icon: "📐", text: "Draw triangle ABC with vertices at (0,0), (4,0), (2,3) — label sides", category: "Form 1-4" },
    { icon: "🔁", text: "Reflect triangle ABC with vertices (1,1), (3,1), (2,3) across the y-axis", category: "Form 1-4" },
    { icon: "⭕", text: "Show me sin and cos on the unit circle for angle 60°", category: "Form 1-4" },
    { icon: "📈", text: "Cumulative frequency (ogive) from bins: 0-10 (3), 10-20 (7), 20-30 (12), 30-40 (5)", category: "Form 1-4" },
    { icon: "🧮", text: "Solve x² + 5x + 6 = 0 using the quadratic formula", category: "Form 1-4" },
    // Step-by-Step
    { icon: "📝", text: "Solve 2x + 5 = 15 step by step, showing your work", category: "Step-by-Step" },
    { icon: "📝", text: "Show me how to solve 3x - 7 = 14 step by step", category: "Step-by-Step" },
    // Vision
    { icon: "📷", text: "Upload a photo of my homework using the 📎 button and ask 'help me solve this'", category: "Vision" },
    // Spreadsheets
    { icon: "📊", text: "Build me an Excel worksheet for food capacity: maize flour 50kg, beans 20kg, rice 15kg, cooking oil 5L", category: "Spreadsheets" },
    { icon: "💰", text: "Build a payment schedule spreadsheet for 3 employees with hours, rate, gross, tax, net", category: "Spreadsheets" },
    { icon: "📅", text: "Build a class attendance register spreadsheet for 5 students Mon-Fri", category: "Spreadsheets" },
    { icon: "🎒", text: "Build a grade book spreadsheet for 3 students in Math, English, Science with averages", category: "Spreadsheets" },
    // Database
    { icon: "🏦", text: "Build a simple database schema for a school with Students, Classes, Teachers", category: "Database" },
    { icon: "📚", text: "Design a database schema for a library: Books, Authors, Borrowers, Loans", category: "Database" },
    { icon: "🛒", text: "Design a store database schema: Customers, Products, Orders, Order Items", category: "Database" },
    // University
    { icon: "🌀", text: "Draw a slope field for dy/dx = x - y", category: "University" },
    { icon: "🧲", text: "Draw a vector field for F(x,y) = (-y, x) — a rotation field", category: "University" },
    { icon: "🔢", text: "Plot z₁ = 2 + i and z₂ = -1 + 1.5i on an Argand diagram", category: "University" },
    { icon: "🧊", text: "Plot point P(2, 1, 3) in 3D coordinate space", category: "University" },
    { icon: "🪢", text: "Draw a trefoil knot diagram", category: "University" },
    // General
    { icon: "🥧", text: "Draw a pie chart of budget: Rent 40%, Food 25%, Transport 15%, Savings 20%", category: "General" },
    { icon: "➡️", text: "Draw vectors F1 = (3,4) and F2 = (-2,1) on a coordinate plane", category: "General" },
    { icon: "🧠", text: "Make a concept map of the human digestive system", category: "General" },
    { icon: "🔷", text: "Make a hexagon tessellation pattern", category: "General" },
    { icon: "⛰️", text: "Draw a contour map showing a hill with 3 elevation levels", category: "General" },
  ];

  // Phase 84 — Dynamic suggestions based on user's track + course + grade.
  // For K-12/secondary: use the grade-band filter (existing behavior).
  // For university/college/tvet: show course-aware suggestions (or generic if no course).
  // For dev tracks: show dev-focused suggestions.
  const allowedBands = gradeToRecommendationBands(userGrade);
  let suggestedQuestions: typeof allSuggestedQuestions;

  if (userTrack === "university" || userTrack === "college" || userTrack === "tvet"
      || (userTrack === "mixed" && userCourse)) {
    // Higher-ed user — show course-specific suggestions + general capabilities
    // (also handles legacy "mixed" users who have a course set)
    const courseLabel = userCourse || "your course";
    suggestedQuestions = [
      // Course-specific (dynamically generated from user's track+course)
      { icon: "📚", text: `What topics does ${courseLabel} cover?`, category: "Course" },
      { icon: "🎯", text: `Explain the key concepts I need to master in ${courseLabel}`, category: "Course" },
      { icon: "📝", text: `Give me practice questions for ${courseLabel}`, category: "Course" },
      { icon: "🎓", text: `Upload my course outline (🎓 button) so you can give me specific answers`, category: "Course" },
      // General capabilities (always useful)
      { icon: "📊", text: "Draw a bar chart comparing 5 categories", category: "General" },
      { icon: "🧠", text: "Make a concept map of the main ideas in my field", category: "General" },
      { icon: "📷", text: "Upload a photo of my notes using the 📎 button and ask 'help me understand this'", category: "Vision" },
      { icon: "💡", text: "Explain a complex topic in my field using a simple analogy", category: "General" },
    ];
  } else if (userTrack === "dev" || userTrack === "data" || userTrack === "ml" || userTrack === "web" || userTrack === "backend" || userTrack === "server") {
    // Dev tracks
    suggestedQuestions = [
      { icon: "💻", text: "Show me a Python example I can run", category: "Code" },
      { icon: "🧪", text: "Help me debug an error in my code", category: "Code" },
      { icon: "📊", text: "Draw a chart visualizing some sample data", category: "General" },
      { icon: "🧠", text: "Make a concept map of how a key concept works", category: "General" },
    ];
  } else {
    // K-12 / secondary — use the existing grade-band-filtered suggestions
    suggestedQuestions = allSuggestedQuestions.filter((q) => allowedBands.includes(q.category));
  }

  // Exam viewer panel — full screen, shows the generated exam HTML
  if (viewingExam) {
    return (
      <div className="fixed inset-0 z-[100] bg-white flex flex-col">
        <header className="sticky top-0 z-30 bg-white border-b border-gray-200 flex-shrink-0 no-print">
          <div className="flex items-center justify-between h-14 px-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewingExam(null)}
                className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                <FileText className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900 leading-tight">StudyBuddy Exam</p>
                <p className="text-[10px] text-gray-500 leading-tight">View · Download PDF</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  // Open the exam HTML in a new tab — user can print/save as PDF there
                  // This ensures the full multi-page content prints correctly (not just the iframe)
                  const blob = new Blob([viewingExam], { type: "text/html;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  window.open(url, "_blank");
                  // Clean up after 10 seconds
                  setTimeout(() => URL.revokeObjectURL(url), 10000);
                }}
                className="px-3 h-8 rounded-full bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 flex items-center gap-1"
              >
                📄 Download PDF
              </button>
              <a
                href="https://studybuddy.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 h-8 rounded-full bg-violet-50 text-violet-700 text-xs font-semibold hover:bg-violet-100 flex items-center gap-1"
              >
                StudyBuddy ↗
              </a>
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto bg-gray-100">
          <div className="max-w-[800px] mx-auto bg-white shadow-lg my-4 min-h-[600px]">
            <iframe
              srcDoc={viewingExam}
              className="w-full border-none"
              title="StudyBuddy Exam"
              style={{ minHeight: "80vh", height: "100%" }}
            />
          </div>
        </div>
        <div className="flex-shrink-0 bg-white border-t border-gray-200 p-3">
          <div className="max-w-[800px] mx-auto flex items-center justify-between">
            <p className="text-xs text-gray-500">
              📖 Read the exam · Tap "📄 Download PDF" to open it in a new tab → Ctrl+P → "Save as PDF"
            </p>
            <button
              onClick={() => setViewingExam(null)}
              className="px-4 h-8 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200"
            >
              ← Back to Chat
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${USE_WORKSPACE && workspaceTabs.length > 0 ? "h-screen overflow-hidden" : "min-h-screen"} bg-gray-50 flex flex-col`}>
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setScreen("home")}
              aria-label="Back"
              className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 leading-tight">AI Tutor</p>
              <p className="text-[10px] text-gray-500 leading-tight">
                {activeConversation ? activeConversation.title : "New chat"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Phase 84 — BuddySwitcher REMOVED.
                The buddy is now auto-selected from the user's education track
                at registration time (k12 → StudyBuddy, university → StudyBuddy,
                dev → DevBuddy, etc.). Users don't need to manually pick —
                the AI knows who they are from their profile. */}
            {/* Phase 84 — Static buddy badge (no dropdown).
                The buddy is auto-selected from the user's track at registration.
                Showing the badge tells the user who they're talking to without
                letting them switch — the AI knows who they are. */}
            <div className="h-8 px-3 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold flex items-center gap-1.5">
              <span className="text-sm">{currentBuddy?.emoji ?? "🤖"}</span>
              <span className="hidden sm:inline">{currentBuddy?.displayName ?? "AI Tutor"}</span>
            </div>
            {/* Model comparison button (Feature #1) — hidden in Data Saver mode (Phase 45) */}
            {!dataSaver && (
              <button
                onClick={() => setShowCompare(!showCompare)}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition ${
                  showCompare ? "bg-violet-600 text-white" : "bg-violet-50 text-violet-700 hover:bg-violet-100"
                }`}
                title={dataSaver ? "Disabled in Data Saver mode" : "Compare multiple Study Buddies side-by-side"}
              >
                <GitBranch className="w-4 h-4" />
              </button>
            )}
            {/* Exam generator button */}
            <button
              onClick={() => setShowExamForm(!showExamForm)}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition ${
                showExamForm ? "bg-amber-500 text-white" : "bg-amber-50 text-amber-700 hover:bg-amber-100"
              }`}
              title="Generate a printable exam/test"
            >
              <FileText className="w-4 h-4" />
            </button>
            {/* Voice mode toggle */}
            <button
              onClick={toggleVoiceMode}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition ${
                voiceMode
                  ? voiceModeState === "listening"
                    ? "bg-rose-500 text-white animate-pulse"
                    : "bg-emerald-500 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
              title={voiceMode ? "Voice mode is ON — tap to turn off" : "Start voice conversation (speak + listen)"}
            >
              <Mic className="w-4 h-4" />
            </button>
            <button
              onClick={newConversation}
              className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 flex items-center justify-center"
              title="New chat"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 flex items-center justify-center"
              title="Chat history"
            >
              <MessageSquare className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 relative overflow-hidden">
        {/* Sidebar — conversation history */}
        {showSidebar && (
          <>
            <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setShowSidebar(false)} />
            <div className="absolute left-0 top-0 bottom-0 w-72 bg-white border-r border-gray-200 z-50 overflow-y-auto">
              <div className="p-3 flex items-center justify-between border-b border-gray-100">
                <p className="text-xs font-bold uppercase text-gray-500">Chat History</p>
                <button onClick={() => setShowSidebar(false)} className="text-gray-400">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={newConversation}
                className="w-full p-3 flex items-center gap-2 hover:bg-indigo-50 text-indigo-600 text-sm font-semibold border-b border-gray-100"
              >
                <Plus className="w-4 h-4" /> New chat
              </button>
              {loading ? (
                <div className="p-4 flex justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                </div>
              ) : conversations.length === 0 ? (
                <p className="p-4 text-xs text-gray-400 text-center">No conversations yet.</p>
              ) : (
                conversations.map((conv) => (
                  <div key={conv.id} className="flex items-center group border-b border-gray-50">
                    <button
                      onClick={() => openConversation(conv.id)}
                      className={`flex-1 p-3 text-left text-xs hover:bg-gray-50 transition ${
                        activeConversation?.id === conv.id ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-gray-700"
                      }`}
                    >
                      <p className="truncate">{conv.title}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {new Date(conv.updatedAt).toLocaleDateString()}
                      </p>
                    </button>
                    <button
                      onClick={() => deleteConversation(conv.id)}
                      className="p-2 text-gray-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* Chat area — shrinks when workspace is open (Phase F8).
            overflow-hidden so messages scroll inside instead of pushing layout down */}
        <div className={`flex flex-col w-full overflow-hidden ${USE_WORKSPACE && workspaceTabs.length > 0 ? "md:flex-1 md:max-w-[58%]" : "flex-1 max-w-3xl mx-auto"}`}>
          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
            role="log"
            aria-live="polite"
            aria-label="AI Tutor conversation"
            aria-atomic="false"
          >
            {messages.length === 0 && !busy ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mb-4">
                  <Bot className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-lg font-bold text-gray-900">AI Tutor</h2>
                <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
                  {userTrack === "university" || userTrack === "college" || userTrack === "tvet" || (userTrack === "mixed" && userCourse) ? (
                    <>Ask anything about <span className="text-indigo-600 font-medium">{userCourse || "your course"}</span> — I can fetch videos, draw graphs, build concept maps, and read your notes. Your chat history is saved automatically.</>
                  ) : userTrack === "dev" || userTrack === "data" || userTrack === "ml" || userTrack === "web" || userTrack === "backend" || userTrack === "server" ? (
                    <>Ask anything about coding — I can run Python/JS, draw charts, build concept maps, and help you debug. Your chat history is saved automatically.</>
                  ) : (
                    <>Ask anything — I can <span className="text-indigo-600 font-medium">fetch videos</span>,{" "}
                      <span className="text-emerald-600 font-medium">draw 16 kinds of graphs</span> (scatter, bar, pie, Venn, slope fields, stem-leaf, 3D solids, knots & more),{" "}
                      <span className="text-violet-600 font-medium">build concept maps</span>, and{" "}
                      <span className="text-amber-600 font-medium">render any custom SVG drawing</span>. Your chat history is saved automatically.</>
                  )}
                </p>
                <div className="mt-6 max-w-xl mx-auto">
                  {/* Phase 84 — dynamic context label */}
                  {(() => {
                    const isCourseAware = userTrack === "university" || userTrack === "college" || userTrack === "tvet" || (userTrack === "mixed" && userCourse);
                    const ctxLabel = isCourseAware
                      ? (userCourse ? `${userCourse}` : userTrack)
                      : userGrade
                        ? userGrade
                        : null;
                    return ctxLabel ? (
                      <p className="text-[11px] font-medium text-indigo-600 mb-2 text-center">
                        Showing suggestions for {ctxLabel}
                      </p>
                    ) : null;
                  })()}
                  {suggestedQuestions.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {suggestedQuestions.map((q) => (
                        <button
                          key={q.text}
                          onClick={() => send(q.text)}
                          className="px-3 py-2.5 rounded-xl bg-white border border-gray-200 text-left hover:border-indigo-300 hover:bg-indigo-50/40 transition flex items-start gap-2"
                        >
                          <span className="text-lg">{q.icon}</span>
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-gray-700">{q.text}</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">{q.category}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 text-center">
                      Set your grade in Profile to see tailored suggestions.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              messages.map((msg, i) => (
                <MessageBubble
                  key={msg.id || i}
                  msg={msg}
                  onCopy={() => copyMessage(msg)}
                  onOpenWorkspace={(attachment) => {
                    try {
                      const offer = JSON.parse(attachment.caption);
                      // Phase 9 fix — save the offer + the user's ORIGINAL request
                      // so the Web Builder can auto-send it as the first message.
                      // We look back through messages to find the user message that
                      // triggered this workspace offer.
                      let userRequest = "";
                      for (let i = messages.length - 1; i >= 0; i--) {
                        if (messages[i].role === "user") {
                          userRequest = messages[i].content;
                          break;
                        }
                      }
                      localStorage.setItem("studybuddy.pendingComputerWorkspace", JSON.stringify({
                        ...offer,
                        topicId: activeTopicId,
                        userRequest, // the learner's original prompt (e.g. "build a funny meme site")
                      }));

                      // Phase 9 fix — route to the RIGHT workspace screen
                      // based on the offer's `workspace` field. Previously
                      // this always went to StudyRoom, but the Web Builder,
                      // Dev Buddy, etc. have their own dedicated screens.
                      const ws = offer?.workspace;
                      if (ws === "web") {
                        setScreen("webBuilder");
                        return;
                      } else if (ws === "code") {
                        setScreen("devBuddy");
                        return;
                      } else if (ws === "backend") {
                        setScreen("backendBuddy");
                        return;
                      } else if (ws === "modeling" || ws === "simulation") {
                        setScreen("devBuddy");
                        return;
                      }
                      // Default: StudyRoom (which has its own computer workspace)
                      if (activeTopicId) setScreen("study");
                      else openCreate("room");
                    } catch {
                      // Fallback: try the old behavior
                      if (activeTopicId) setScreen("study");
                      else openCreate("room");
                    }
                  }}
                  onOpenInWorkspacePanel={USE_WORKSPACE ? openInWorkspace : undefined}
                  onRetry={msg.role === "user" && i === messages.length - 1 ? retry : undefined}
                  copied={copiedId === msg.id}
                  // Phase 48 — pass the "save as project" callback ONLY when the
                  // active buddy supports code files. The MessageBubble renders
                  // the button conditionally on whether the reply contains code.
                  onSaveAsProject={
                    ["dev", "web", "backend"].includes(activeBuddyId) && msg.role === "assistant"
                      ? () => handleSaveAsProject(msg)
                      : undefined
                  }
                  onAttachmentChange={(attIdx, newCaption) => {
                    // Update the attachment's caption (which contains the JSON spec)
                    setMessages((prev) =>
                      prev.map((m, idx) => {
                        if (idx !== i) return m;
                        if (!m.attachments) return m;
                        return {
                          ...m,
                          attachments: m.attachments.map((a, ai) =>
                            ai === attIdx ? { ...a, caption: newCaption } : a
                          ),
                        };
                      })
                    );
                  }}
                />
              ))
            )}
            {busy && (
              <div className="flex justify-start">
                <div className="flex gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 text-sm">
                    <div className="flex items-center gap-2 text-gray-500">
                      <Loader2 className="w-4 h-4 animate-spin" /> Thinking…
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">{activityStatus}</p>
                  </div>
                </div>
              </div>
            )}
            {error && !showUpgrade && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between">
                <span>{error}</span>
                <button onClick={retry} className="text-rose-600 hover:text-rose-800 underline font-semibold">
                  Retry
                </button>
              </div>
            )}
            {showUpgrade && (
              <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 p-4 text-center">
                <span className="text-3xl">🥲</span>
                <p className="mt-2 text-sm font-semibold text-gray-900">{error}</p>
                <button
                  onClick={() => setScreen("premium")}
                  className="mt-3 px-6 h-10 rounded-full bg-indigo-600 text-white font-semibold text-sm shadow-md hover:bg-indigo-700"
                >
                  Upgrade Now →
                </button>
              </div>
            )}
          </div>

          {/* Exam generator form — shown when showExamForm is true */}
          {showExamForm && (
            <div className="flex-shrink-0 px-3 py-3 bg-gradient-to-r from-amber-50 to-orange-50 border-t border-amber-200 space-y-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-600" />
                <p className="text-xs font-bold text-amber-700">📝 Exam Generator — create a printable test on any topic</p>
              </div>
              <input
                type="text"
                value={examConfig.topic}
                onChange={(e) => setExamConfig({ ...examConfig, topic: e.target.value })}
                placeholder="What topic? (e.g. Photosynthesis, Algebra, Kenyan History)"
                className="w-full px-3 py-1.5 rounded-lg border border-amber-200 text-sm outline-none focus:border-amber-400 bg-white"
              />
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-semibold text-gray-600">Questions</label>
                  <input type="number" min={5} max={40} value={examConfig.numQuestions}
                    onChange={(e) => setExamConfig({ ...examConfig, numQuestions: e.target.value })}
                    className="w-full px-2 py-1 rounded-lg border border-amber-200 text-sm bg-white" />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-600">Pages</label>
                  <input type="number" min={1} max={10} value={examConfig.numPages}
                    onChange={(e) => setExamConfig({ ...examConfig, numPages: e.target.value })}
                    className="w-full px-2 py-1 rounded-lg border border-amber-200 text-sm bg-white" />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-600">Grade</label>
                  <input type="text" value={examConfig.gradeLevel}
                    onChange={(e) => setExamConfig({ ...examConfig, gradeLevel: e.target.value })}
                    placeholder="Form 4"
                    className="w-full px-2 py-1 rounded-lg border border-amber-200 text-sm bg-white" />
                </div>
              </div>
              <div className="flex gap-2">
                <select value={examConfig.examType}
                  onChange={(e) => setExamConfig({ ...examConfig, examType: e.target.value })}
                  className="px-2 py-1 rounded-lg border border-amber-200 text-xs bg-white">
                  <option value="kcse_style">KCSE Style (Section A + B)</option>
                  <option value="mixed">Mixed (MCQ + Short Answer)</option>
                  <option value="mcq">MCQ only</option>
                  <option value="short_answer">Short Answer only</option>
                </select>
                <select value={examConfig.difficulty}
                  onChange={(e) => setExamConfig({ ...examConfig, difficulty: e.target.value })}
                  className="px-2 py-1 rounded-lg border border-amber-200 text-xs bg-white">
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
              <button
                onClick={generateExam}
                disabled={generatingExam || !examConfig.topic.trim()}
                className="w-full h-9 rounded-full bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {generatingExam ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating exam…</> : <>📝 Generate Exam</>}
              </button>
            </div>
          )}

          {/* Exam generation progress bar */}
          {generatingExam && (
            <div className="flex-shrink-0 px-3 py-3 bg-gradient-to-r from-amber-50 to-orange-50 border-t border-amber-200">
              <div className="flex items-center gap-2 mb-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                <p className="text-xs font-semibold text-amber-700">📝 Generating exam… {Math.round(examProgress)}%</p>
              </div>
              <div className="h-2 bg-amber-100 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${examProgress}%` }} />
              </div>
            </div>
          )}

          {/* Exam result card — shown when examResult is set */}
          {examResult && (
            <div className="flex-shrink-0 px-3 py-3 bg-gradient-to-r from-emerald-50 to-teal-50 border-t border-emerald-200">
              <div className="rounded-xl bg-white border-2 border-emerald-300 p-4 shadow-md">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-900">📝 Exam Ready!</p>
                    <p className="text-[11px] text-gray-500">
                      {examResult.summary?.questionCount} questions · {examResult.summary?.totalMarks} marks · {examResult.summary?.gradeLevel} · {examResult.summary?.difficulty}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-gray-600 mb-3">
                  Topic: <strong>{examResult.summary?.topic}</strong> — Click below to view, print, or download the exam. You can print it at the nearest cyber café.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setViewingExam(examResult.html)}
                    className="flex-1 h-9 rounded-full bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 flex items-center justify-center gap-1"
                  >
                    <FileText className="w-3.5 h-3.5" /> Open Exam
                  </button>
                  <button
                    onClick={() => setExamResult(null)}
                    className="px-3 h-9 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Model comparison panel — shown when showCompare is true */}
          {showCompare && (
            <div className="flex-shrink-0 px-3 py-3 bg-gradient-to-r from-violet-50 to-indigo-50 border-t border-violet-200 space-y-2">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-violet-600" />
                <p className="text-xs font-bold text-violet-700">Model Comparison — pick 2-5 buddies, ask a question, see all answers side-by-side</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {availableBuddies.filter(b => b.canUse).map((buddy) => {
                  const selected = compareBuddies.includes(buddy.modelName);
                  return (
                    <button
                      key={buddy.modelName}
                      onClick={() => {
                        if (selected) {
                          setCompareBuddies(compareBuddies.filter(b => b !== buddy.modelName));
                        } else if (compareBuddies.length < 5) {
                          setCompareBuddies([...compareBuddies, buddy.modelName]);
                        }
                      }}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold transition ${
                        selected ? "bg-violet-600 text-white" : "bg-white text-gray-600 hover:bg-violet-100"
                      }`}
                    >
                      {buddy.emoji} {buddy.displayName} {selected && "✓"}
                    </button>
                  );
                })}
              </div>
              {compareBuddies.length >= 2 && (
                <button
                  onClick={runComparison}
                  disabled={comparing || !input.trim()}
                  className="w-full h-9 rounded-full bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {comparing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Comparing {compareBuddies.length} models…</> : <>⚡ Compare {compareBuddies.length} models with: "{input.slice(0, 40)}{input.length > 40 ? "…" : ""}"</>}
                </button>
              )}
              {compareResults.length > 0 && (
                <div className="mt-2 space-y-2">
                  {/* Two-column side-by-side layout for exactly 2 results */}
                  {compareResults.length === 2 && (
                    <div className="grid grid-cols-2 gap-2">
                      {compareResults.map((r, i) => (
                        <CompareCard key={i} result={r} onPrefer={() => handlePrefer(i)} />
                      ))}
                    </div>
                  )}
                  {/* Stacked layout for 3-5 results */}
                  {compareResults.length > 2 && (
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {compareResults.map((r, i) => (
                        <CompareCard key={i} result={r} onPrefer={() => handlePrefer(i)} />
                      ))}
                    </div>
                  )}
                  {preferredIndex !== null && (
                    <div className="text-center text-xs text-emerald-600 font-semibold py-1">
                      ✓ You preferred {compareResults[preferredIndex]?.displayName} {compareResults[preferredIndex]?.emoji} — we'll remember this for future questions!
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Voice mode banner — shown when voiceMode is ON */}
          {voiceMode && (
            <div className="flex-shrink-0 px-3 py-2 bg-gradient-to-r from-violet-50 to-indigo-50 border-t border-violet-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  voiceModeState === "listening" ? "bg-rose-500 animate-pulse" :
                  voiceModeState === "speaking" ? "bg-emerald-500 animate-pulse" :
                  "bg-gray-400"
                }`} />
                <p className="text-xs font-semibold text-violet-700">
                  {voiceModeState === "listening" ? "🔴 Listening… speak your question" :
                   voiceModeState === "speaking" ? "🟢 AI is speaking…" :
                   "Voice conversation mode — tap mic to turn off"}
                </p>
              </div>
              <button
                onClick={toggleVoiceMode}
                className="text-xs px-3 py-1 rounded-full bg-violet-600 text-white font-semibold hover:bg-violet-700"
              >
                Stop voice mode
              </button>
            </div>
          )}

          {/* Input bar */}
          <div className="flex-shrink-0 border-t border-gray-200 bg-white p-3 pb-safe">
            <div className="max-w-3xl mx-auto mb-2 flex items-center gap-2">
              <label htmlFor="tutor-learning-mode" className="text-[11px] font-medium text-gray-500">Tutor mode</label>
              <select
                id="tutor-learning-mode"
                value={learningMode}
                onChange={(e) => changeLearningMode(e.target.value as TutorLearningMode)}
                disabled={busy}
                className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-700 outline-none focus:ring-2 focus:ring-indigo-200"
              >
                <option value="standard">Standard</option>
                <option value="explain">Explain step by step</option>
                <option value="practice">Practice with me</option>
                <option value="hint">Give me hints</option>
                <option value="simpler">Use simpler language</option>
              </select>
              <span className="hidden sm:inline text-[10px] text-gray-400">Saved for this chat</span>
            </div>
            {/* Pending image preview */}
            {pendingImage && (
              <div className="mb-2 flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pendingImage} alt="Pending upload" className="w-12 h-12 rounded object-cover" />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-emerald-700">Image ready to send</p>
                  <p className="text-[10px] text-emerald-600">Vision AI will analyze this with your question</p>
                </div>
                <button onClick={() => setPendingImage(null)} className="text-emerald-700 hover:text-rose-600" title="Remove image">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            {/* Pending document preview */}
            {(pendingDocument || uploadingDoc) && (
              <div className="mb-2 flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center text-xl flex-shrink-0">
                  {uploadingDoc ? <Loader2 className="w-5 h-5 animate-spin text-amber-600" /> : "📄"}
                </div>
                <div className="flex-1 min-w-0">
                  {uploadingDoc ? (
                    <>
                      <p className="text-xs font-semibold text-amber-700">Extracting text…</p>
                      <p className="text-[10px] text-amber-600">Reading document contents</p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-semibold text-amber-800 truncate">{pendingDocument?.fileName}</p>
                      <p className="text-[10px] text-amber-600 truncate">
                        {pendingDocument?.fileType.toUpperCase()} · {pendingDocument?.text.length.toLocaleString()} chars extracted
                      </p>
                    </>
                  )}
                </div>
                {pendingDocument && (
                  <button onClick={() => setPendingDocument(null)} className="text-amber-700 hover:text-rose-600" title="Remove document">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              className="flex items-center gap-2 max-w-3xl mx-auto"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder={userTrack === "university" || userTrack === "college" || userTrack === "tvet" || (userTrack === "mixed" && userCourse)
                  ? `Ask about ${userCourse || "your course"}… (try 'what can you teach?' or 'explain a key concept')`
                  : userTrack === "dev" || userTrack === "data" || userTrack === "ml" || userTrack === "web" || userTrack === "backend" || userTrack === "server"
                    ? "Ask anything about coding… (try 'show me a Python example' or 'debug this error')"
                    : "Ask anything… (try 'plot (0,0) (1,5) (2,10)' or '📷 upload a photo of your homework' or 'draw a 3D cube')"
                }
                className="flex-1 px-4 py-2.5 rounded-full bg-gray-100 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-indigo-200"
                disabled={busy}
              />
              {/* Image upload button (vision) */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (f.size > 10 * 1024 * 1024) {
                    setError("Image too large (max 10MB)");
                    return;
                  }
                  // Phase 88 — compress image client-side before sending.
                  // Vercel's body limit is 4.5MB. A 4MB image becomes ~5.3MB
                  // as base64 which exceeds the limit → 413 error.
                  // We resize to max 1024x1024 + compress to JPEG quality 0.7
                  // which keeps the file under ~500KB (well under the limit).
                  const reader = new FileReader();
                  reader.onload = () => {
                    const img = new Image();
                    img.onload = () => {
                      const canvas = document.createElement("canvas");
                      const maxDim = 1024;
                      let { width, height } = img;
                      if (width > maxDim || height > maxDim) {
                        if (width > height) {
                          height = Math.round((height / width) * maxDim);
                          width = maxDim;
                        } else {
                          width = Math.round((width / height) * maxDim);
                          height = maxDim;
                        }
                      }
                      canvas.width = width;
                      canvas.height = height;
                      const ctx = canvas.getContext("2d");
                      if (!ctx) { setPendingImage(reader.result as string); return; }
                      ctx.drawImage(img, 0, 0, width, height);
                      // Compress to JPEG (much smaller than PNG)
                      const compressed = canvas.toDataURL("image/jpeg", 0.7);
                      setPendingImage(compressed);
                    };
                    img.src = reader.result as string;
                  };
                  reader.readAsDataURL(f);
                  e.target.value = "";
                }}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                title="Upload an image (photo of homework, textbook page, diagram)"
                className={`w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-50 transition flex-shrink-0 ${
                  pendingImage
                    ? "bg-emerald-500 text-white hover:bg-emerald-600"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                <Paperclip className="w-4 h-4" />
              </button>
              {/* Document upload button (PDF/DOC/DOCX/XLSX/CSV) */}
              <input
                ref={docInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.xlsx,.xls,.csv,.txt,.md"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleDocumentUpload(f);
                  e.target.value = "";
                }}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => docInputRef.current?.click()}
                disabled={busy || uploadingDoc}
                title="Upload a document (PDF, DOC, DOCX, XLSX, CSV, TXT)"
                className={`w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-50 transition flex-shrink-0 ${
                  pendingDocument
                    ? "bg-amber-500 text-white hover:bg-amber-600"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {uploadingDoc ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              </button>
              {/* Phase 84 — Upload Course Outline button (PDF/DOCX → AI parses into course knowledge) */}
              <input
                ref={outlineInputRef}
                type="file"
                accept=".pdf,.docx,.doc,.txt"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleOutlineUpload(f);
                  e.target.value = "";
                }}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => outlineInputRef.current?.click()}
                disabled={busy || uploadingOutline}
                title="Upload your course outline / syllabus (PDF, DOCX) — AI learns your course topics"
                className={`w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-50 transition flex-shrink-0 ${
                  uploadingOutline
                    ? "bg-violet-500 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {uploadingOutline ? <Loader2 className="w-4 h-4 animate-spin" /> : <GraduationCap className="w-4 h-4" />}
              </button>
              <button
                type="submit"
                disabled={busy || (!input.trim() && !pendingImage && !pendingDocument)}
                className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center disabled:opacity-50 hover:bg-indigo-700 transition flex-shrink-0"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
              {/* Voice mic button */}
              <button
                type="button"
                onClick={recording ? stopRecording : startRecording}
                disabled={busy || transcribing}
                title={recording ? "Stop recording" : "Speak your question"}
                className={`w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-50 transition flex-shrink-0 ${
                  recording
                    ? "bg-rose-500 text-white animate-pulse hover:bg-rose-600"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {transcribing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : recording ? (
                  <Square className="w-4 h-4" fill="white" />
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </button>
            </form>
            <p className="text-[10px] text-gray-400 text-center mt-1.5">
              {recording
                ? "🔴 Listening… tap ◼ to stop and send"
                : transcribing
                ? "Transcribing your voice…"
                : "🎤 Voice mode is free (browser-based, no API key) · 📊 21 graph types · 🔢 LaTeX math · ✋ draggable concept maps"}
            </p>
          </div>
        </div>

        {/* Phase F8 — Workspace panel (side-by-side with chat on desktop, full-screen on mobile).
            Only renders when USE_WORKSPACE is true AND an artifact has been opened.
            Sits inside the flex-1 container as a sibling of the chat area. */}
        {USE_WORKSPACE && workspaceTabs.length > 0 && (
          <div className="fixed inset-0 z-50 md:relative md:z-auto md:flex-1 md:flex-shrink-0 md:w-[42%] flex flex-col bg-gray-50 border-l border-gray-200">
            {/* Mobile: tab to switch back to chat + Ask AI */}
            <div className="md:hidden flex items-center justify-between px-4 py-2.5 bg-white border-b border-gray-200 flex-shrink-0">
              <button
                onClick={() => setWorkspaceArtifact(null)}
                className="flex items-center gap-1 text-xs font-semibold text-indigo-600"
              >
                <ChevronLeft className="w-4 h-4" /> Back to chat
              </button>
              <button
                onClick={() => {
                  if (!workspaceArtifact) return;
                  let ctx = `[Looking at my workspace: ${workspaceArtifact.type}]\n\n`;
                  try { ctx = `[Looking at my workspace: ${workspaceArtifact.caption.slice(0, 300)}…]\n\n`; } catch {}
                  setInput(ctx);
                  setWorkspaceArtifact(null); // close workspace so the input is visible
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 text-[10px] font-semibold"
              >
                <Bot className="w-3 h-3" /> Ask AI about this
              </button>
            </div>
            {/* Phase 8 — Tab bar (only shows when 2+ tabs open) */}
            {workspaceTabs.length > 1 && (
              <div className="flex items-center gap-0.5 px-2 py-1 bg-gray-50 border-b border-gray-200 overflow-x-auto flex-shrink-0">
                {workspaceTabs.map((tab) => {
                  const isActive = tab.id === activeTabId;
                  const titleText = (() => {
                    try {
                      const spec = JSON.parse(tab.artifact.caption);
                      return spec.title || tab.artifact.type;
                    } catch {
                      return tab.artifact.type;
                    }
                  })();
                  const icon = tab.artifact.type === "graph" ? "📊"
                    : tab.artifact.type === "quiz" ? "📝"
                    : tab.artifact.type === "draw_task" ? "✏️"
                    : tab.artifact.type === "conceptmap" ? "🧠"
                    : tab.artifact.type === "composition" ? "✍️"
                    : tab.artifact.type === "timeline" ? "📅"
                    : tab.artifact.type === "geometry" ? "📐"
                    : tab.artifact.type === "physics_sim" ? "🔬"
                    : tab.artifact.type === "molecule" ? "🧪"
                    : tab.artifact.type === "free_body" ? "➡️"
                    : tab.artifact.type === "financial" ? "💰"
                    : tab.artifact.type === "anatomy" ? "🫀"
                    : tab.artifact.type === "flowchart_v1" ? "🔀"
                    : tab.artifact.type === "manipulative" ? "🥭"
                    : tab.artifact.type === "code_project" ? "💻"
                    : tab.artifact.type === "science_simulation" ? "🔌"
                    : "📦";
                  return (
                    <button
                      key={tab.id}
                      onClick={() => activateTab(tab.id)}
                      className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition flex-shrink-0 ${
                        isActive
                          ? "bg-white text-gray-900 shadow-sm border border-gray-200"
                          : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                      }`}
                      title={titleText}
                    >
                      <span>{icon}</span>
                      <span className="max-w-[80px] truncate">{titleText}</span>
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          closeTab(tab.id);
                        }}
                        className="ml-0.5 w-4 h-4 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-200 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition"
                        title="Close tab"
                      >
                        <X className="w-3 h-3" />
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {/* Workspace header */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-gray-200 flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-semibold text-gray-900 truncate">
                  {workspaceArtifact?.type === "graph" ? "📊 Graph Workspace"
                    : workspaceArtifact?.type === "quiz" ? "📝 Quiz Workspace"
                    : workspaceArtifact?.type === "draw_task" ? "✏️ Drawing Workspace"
                    : workspaceArtifact?.type === "conceptmap" ? "🧠 Concept Map Workspace"
                    : workspaceArtifact?.type === "composition" ? "✍️ Writing Draft"
                    : workspaceArtifact?.type === "timeline" ? "📅 Timeline"
                    : workspaceArtifact?.type === "geometry" ? "📐 Geometry Construction"
                    : workspaceArtifact?.type === "physics_sim" ? "🔬 Physics Simulation"
                    : workspaceArtifact?.type === "molecule" ? "🧪 Molecule Viewer"
                    : workspaceArtifact?.type === "free_body" ? "➡️ Force Diagram"
                    : workspaceArtifact?.type === "financial" ? "💰 Financial Calculator"
                    : workspaceArtifact?.type === "anatomy" ? "🫀 Anatomy Diagram"
                    : workspaceArtifact?.type === "code_playground" ? "💻 Code Playground"
                    : "Workspace"}
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {/* AC1: "Ask AI about this" — opens a contextual menu instead of putting raw JSON in the input.
                    The workspace context is sent as a SEPARATE field (workspaceContext) in the request body,
                    NOT mixed into the visible learner message. */}
                <button
                  onClick={() => {
                    if (!workspaceArtifact) return;
                    // Build a bounded workspace context (sent as separate field, not in the message text)
                    const wsCtx = {
                      artifactType: workspaceArtifact.type,
                      artifactCaption: workspaceArtifact.caption.slice(0, 2000), // bounded
                      action: "inspect" as const,
                    };
                    setPendingWorkspaceContext(wsCtx);
                    // Set a SHORT visible prompt (not raw JSON)
                    const typeLabel = workspaceArtifact.type === "graph" ? "this graph"
                      : workspaceArtifact.type === "quiz" ? "this quiz"
                      : workspaceArtifact.type === "draw_task" ? "this drawing task"
                      : workspaceArtifact.type === "conceptmap" ? "this concept map"
                      : workspaceArtifact.type === "manipulative" ? "this math activity"
                      : workspaceArtifact.type === "code_project" ? "this code project"
                      : workspaceArtifact.type === "flowchart_v1" ? "this flowchart"
                      : workspaceArtifact.type === "composition" ? "this writing draft"
                      : workspaceArtifact.type === "timeline" ? "this timeline"
                      : workspaceArtifact.type === "geometry" ? "this construction"
                      : workspaceArtifact.type === "physics_sim" ? "this simulation"
                      : workspaceArtifact.type === "molecule" ? "this molecule"
                      : workspaceArtifact.type === "free_body" ? "this force diagram"
                      : workspaceArtifact.type === "financial" ? "this calculation"
                      : workspaceArtifact.type === "anatomy" ? "this anatomy diagram"
                      : workspaceArtifact.type === "code_playground" ? "this code playground"
                      : "this workspace artifact";
                    setInput(`Explain ${typeLabel}.`);
                    // Focus the input so the user can edit the question
                    setTimeout(() => {
                      const inputEl = document.querySelector('input[placeholder*="Ask"]') as HTMLInputElement;
                      if (inputEl) {
                        inputEl.focus();
                        inputEl.select(); // select all so user can type their own question
                      }
                    }, 50);
                  }}
                  className="hidden md:flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 text-[10px] font-semibold hover:bg-violet-100 transition"
                  title="Ask the AI about what's in your workspace"
                >
                  <Bot className="w-3 h-3" /> Ask AI
                </button>
                {/* Phase F9 — Save workspace as Project */}
                <button
                  onClick={saveWorkspaceAsProject}
                  disabled={savingWorkspace}
                  className="hidden md:flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-semibold hover:bg-indigo-100 transition disabled:opacity-50"
                  title="Save this artifact to your projects"
                >
                  {savingWorkspace ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  Save
                </button>
                <button
                  onClick={() => {
                    // Phase 8: Close the active tab. If it was the last one,
                    // the workspace panel closes entirely.
                    if (activeTabId) closeTab(activeTabId);
                  }}
                  className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 flex-shrink-0"
                  title="Close workspace"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {/* Workspace content — uses GraphLab/QuizLab for supported types, AttachmentRenderer for others */}
            <div className="flex-1 overflow-auto min-h-0">
              {(() => {
                // Phase 8 — workspaceArtifact is now the ACTIVE tab's artifact.
                // When no tab is active (shouldn't happen since the panel only
                // renders when workspaceTabs.length > 0, but TS can't know that),
                // show a placeholder.
                if (!workspaceArtifact) {
                  return (
                    <div className="p-4 text-center text-sm text-gray-400">
                      No artifact selected. Open one from the chat.
                    </div>
                  );
                }
                // Phase G4 — Route bar graphs to GraphLab (interactive)
                if (workspaceArtifact.type === "graph" || workspaceArtifact.type === "conceptmap") {
                  try {
                    const spec = JSON.parse(workspaceArtifact.caption);
                    if (spec.type === "bar") {
                      return (
                        <GraphLab
                          spec={spec}
                          onAskTutor={(ctx) => { setInput(ctx); }}
                          onSave={(newSpec) => {
                            setWorkspaceArtifact({
                              ...workspaceArtifact,
                              caption: JSON.stringify(newSpec),
                            });
                          }}
                        />
                      );
                    }
                  } catch {}
                }
                // Phase G5 — Route quizzes to QuizLab (interactive)
                if (workspaceArtifact.type === "quiz") {
                  try {
                    const spec = JSON.parse(workspaceArtifact.caption);
                    if (spec.questions && Array.isArray(spec.questions)) {
                      return (
                        <QuizLab
                          spec={spec}
                          onAskTutor={(ctx) => { setInput(ctx); }}
                        />
                      );
                    }
                  } catch {}
                }
                // Phase G6 — Route drawing tasks to DrawingStudio (interactive)
                if (workspaceArtifact.type === "draw_task") {
                  try {
                    const spec = JSON.parse(workspaceArtifact.caption);
                    if (spec.prompt) {
                      return (
                        <DrawingStudio
                          spec={spec}
                          onSubmitDrawing={(imageDataUrl) => {
                            const event = new CustomEvent("studybuddy:submit-drawing", {
                              detail: { imageDataUrl, task: spec },
                            });
                            window.dispatchEvent(event);
                          }}
                          onAskTutor={(ctx) => { setInput(ctx); }}
                        />
                      );
                    }
                  } catch {}
                }
                // Phase FC — Route flowcharts to FlowchartRenderer (lazy-loaded, view-only)
                if (workspaceArtifact.type === "flowchart_v1") {
                  try {
                    const spec = JSON.parse(workspaceArtifact.caption);
                    return (
                      <div className="p-4">
                        <div className="mb-3 px-4 py-2 bg-indigo-50 rounded-lg">
                          <p className="text-[10px] font-bold uppercase text-indigo-600">Activity</p>
                          <p className="text-xs text-gray-700">
                            Explore this flowchart in the workspace.
                          </p>
                        </div>
                        <FlowchartRenderer spec={spec} />
                      </div>
                    );
                  } catch {}
                }
                // Phase 7 — Route the 8 critical new plugin artifacts to their
                // dedicated panels. Each branch adapts the adapter's payload
                // shape into what the existing panel component expects.
                if (workspaceArtifact.type === "composition") {
                  try {
                    const spec = JSON.parse(workspaceArtifact.caption);
                    // Adapter produces { sections: [{heading, body}] }.
                    // CompositionEditor expects a flat text blob — flatten
                    // sections into "Heading\nbody\n\nHeading\nbody...".
                    const text = Array.isArray(spec.sections)
                      ? spec.sections.map((s: any) =>
                          s?.heading ? `${s.heading}\n\n${s.body ?? ""}` : (s?.body ?? "")
                        ).join("\n\n---\n\n")
                      : (spec?.content || spec?.prompt || "");
                    const editorSpec = { ...spec, content: text };
                    return (
                      <div className="p-4">
                        <div className="mb-3 px-4 py-2 bg-purple-50 rounded-lg">
                          <p className="text-[10px] font-bold uppercase text-purple-600">Writing</p>
                          <p className="text-xs text-gray-700">
                            Read and edit the draft below. Use "Save" to keep your changes.
                          </p>
                        </div>
                        <CompositionEditor spec={editorSpec} onSave={(newText) => {
                          // Phase 8 — update active tab + persist to DB.
                          updateActiveArtifact({
                            ...workspaceArtifact,
                            caption: JSON.stringify({ ...spec, content: newText }),
                          });
                        }} />
                      </div>
                    );
                  } catch {}
                }
                if (workspaceArtifact.type === "timeline") {
                  try {
                    const spec = JSON.parse(workspaceArtifact.caption);
                    return (
                      <div className="p-4">
                        <div className="mb-3 px-4 py-2 bg-amber-50 rounded-lg">
                          <p className="text-[10px] font-bold uppercase text-amber-600">Timeline</p>
                          <p className="text-xs text-gray-700">
                            Events are shown in chronological order. Click "Edit events" to add, remove, or change them.
                          </p>
                        </div>
                        <TimelinePanel
                          spec={spec}
                          onChange={(newSpec) => {
                            updateActiveArtifact({
                              ...workspaceArtifact,
                              caption: JSON.stringify(newSpec),
                            });
                          }}
                        />
                      </div>
                    );
                  } catch {}
                }
                if (workspaceArtifact.type === "geometry") {
                  try {
                    const spec = JSON.parse(workspaceArtifact.caption);
                    return (
                      <div className="p-4">
                        <div className="mb-3 px-4 py-2 bg-emerald-50 rounded-lg">
                          <p className="text-[10px] font-bold uppercase text-emerald-600">Construction</p>
                          <p className="text-xs text-gray-700">
                            Shapes are drawn on a coordinate grid.
                          </p>
                        </div>
                        <GeometryPanel spec={spec} />
                      </div>
                    );
                  } catch {}
                }
                if (workspaceArtifact.type === "physics_sim") {
                  try {
                    const spec = JSON.parse(workspaceArtifact.caption);
                    // Adapter produces { simType, parameters: {...} }.
                    // PhysicsSimPanel expects flat fields (length, gravity,
                    // initialAngle, etc.). Flatten parameters into the spec.
                    const flatSpec = { ...spec, ...(spec.parameters || {}) };
                    return (
                      <div className="p-4">
                        <div className="mb-3 px-4 py-2 bg-blue-50 rounded-lg">
                          <p className="text-[10px] font-bold uppercase text-blue-600">Simulation</p>
                          <p className="text-xs text-gray-700">
                            Press Play to run the simulation. Adjust sliders to explore — changes save automatically.
                          </p>
                        </div>
                        <PhysicsSimPanel
                          spec={flatSpec}
                          onChange={(newSpec) => {
                            // Phase 8 round 3 — persist learner's slider edits
                            // back to the active workspace tab + DB.
                            updateActiveArtifact({
                              ...workspaceArtifact,
                              caption: JSON.stringify(newSpec),
                            });
                          }}
                        />
                      </div>
                    );
                  } catch {}
                }
                if (workspaceArtifact.type === "molecule") {
                  try {
                    const spec = JSON.parse(workspaceArtifact.caption);
                    return (
                      <div className="p-4">
                        <div className="mb-3 px-4 py-2 bg-pink-50 rounded-lg">
                          <p className="text-[10px] font-bold uppercase text-pink-600">Molecule</p>
                          <p className="text-xs text-gray-700">
                            Atoms and bonds are shown below. Reactions appear when present.
                          </p>
                        </div>
                        <MoleculePanel spec={spec} />
                      </div>
                    );
                  } catch {}
                }
                if (workspaceArtifact.type === "free_body") {
                  try {
                    const spec = JSON.parse(workspaceArtifact.caption);
                    // Adapter produces { body: "string description", forces: [...] }.
                    // FreeBodyPanel expects body to be an object with kind/
                    // x/y/w/h. Convert the string into a labeled rect body.
                    const panelSpec = {
                      ...spec,
                      body: typeof spec.body === "string"
                        ? { kind: "rect", x: 150, y: 100, w: 100, h: 60, label: spec.body }
                        : spec.body,
                    };
                    return (
                      <div className="p-4">
                        <div className="mb-3 px-4 py-2 bg-red-50 rounded-lg">
                          <p className="text-[10px] font-bold uppercase text-red-600">Force Diagram</p>
                          <p className="text-xs text-gray-700">
                            Force vectors are drawn from the centre of the body.
                          </p>
                        </div>
                        <FreeBodyPanel spec={panelSpec} />
                      </div>
                    );
                  } catch {}
                }
                if (workspaceArtifact.type === "financial") {
                  try {
                    const spec = JSON.parse(workspaceArtifact.caption);
                    // Adapter produces { calcType, parameters: {...}, result: {...} }.
                    // FinancialCalculator expects flat fields + uses these
                    // calcType values: "compound" | "simple" | "npv" | "breakeven".
                    // Map adapter's calcType to the panel's calcType.
                    const calcTypeMap: Record<string, string> = {
                      compound_interest: "compound",
                      simple_interest: "simple",
                      npv: "npv",
                      break_even: "breakeven",
                      breakeven: "breakeven",
                    };
                    const p = spec.parameters || {};
                    const flatSpec = {
                      calcType: calcTypeMap[spec.calcType] || "npv",
                      principal: p.initialInvestment ?? p.principal ?? 10000,
                      rate: p.discountRate != null ? p.discountRate * 100
                        : (p.rate ?? 12),
                      periods: Array.isArray(p.cashFlows) ? p.cashFlows.length
                        : (p.periods ?? 5),
                      cashFlows: Array.isArray(p.cashFlows) ? p.cashFlows
                        : [-10000, 3000, 4000, 4000, 5000],
                    };
                    return (
                      <div className="p-4">
                        <div className="mb-3 px-4 py-2 bg-green-50 rounded-lg">
                          <p className="text-[10px] font-bold uppercase text-green-600">Calculator</p>
                          <p className="text-xs text-gray-700">
                            Adjust the inputs and the result updates instantly. Changes save automatically.
                          </p>
                        </div>
                        <FinancialCalculator
                          spec={flatSpec}
                          onChange={(newSpec) => {
                            // Phase 8 round 3 — persist learner's input edits
                            // back to the active workspace tab + DB.
                            updateActiveArtifact({
                              ...workspaceArtifact,
                              caption: JSON.stringify(newSpec),
                            });
                          }}
                        />
                      </div>
                    );
                  } catch {}
                }
                if (workspaceArtifact.type === "anatomy") {
                  try {
                    const spec = JSON.parse(workspaceArtifact.caption);
                    return (
                      <div className="p-4">
                        <div className="mb-3 px-4 py-2 bg-rose-50 rounded-lg">
                          <p className="text-[10px] font-bold uppercase text-rose-600">Anatomy</p>
                          <p className="text-xs text-gray-700">
                            Hover or tap each label to see its description.
                          </p>
                        </div>
                        <AnatomyPanel spec={spec} />
                      </div>
                    );
                  } catch {}
                }
                // Phase 9 — Code playground (Tools Hub integration).
                // Lets learners write + run Python/JS in the workspace.
                // Code runs on Tools Hub infrastructure (when enabled by admin),
                // never on Study Buddy's server.
                if (workspaceArtifact.type === "code_playground") {
                  let spec: any = null;
                  try { spec = JSON.parse(workspaceArtifact.caption); } catch { spec = {}; }
                  return (
                    <div className="h-full flex flex-col">
                      <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-200 flex-shrink-0">
                        <p className="text-[10px] font-bold uppercase text-emerald-600">Code Playground</p>
                        <p className="text-xs text-gray-700">
                          Write code + click Run (or Ctrl+Enter). Code runs on Tools Hub sandbox.
                        </p>
                      </div>
                      <div className="flex-1 min-h-0">
                        <CodePlayground
                          spec={spec}
                          onChange={(newSpec) => {
                            updateActiveArtifact({
                              ...workspaceArtifact,
                              caption: JSON.stringify(newSpec),
                            });
                          }}
                        />
                      </div>
                    </div>
                  );
                }
                // Fall through to regular renderer for non-bar graphs + other types
                return (
                  <div className="p-4">
                    <AttachmentRenderer
                      attachment={workspaceArtifact}
                      onSpecChange={undefined}
                      onOpenWorkspace={undefined}
                      onOpenInWorkspacePanel={undefined}
                    />
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MessageBubble({
  msg,
  onCopy,
  onRetry,
  copied,
  onAttachmentChange,
  onOpenWorkspace,
  onOpenInWorkspacePanel,
  // Phase 48 — callback to save the AI's code blocks as a Project.
  // Only passed when the active buddy supports code files (dev, web, backend).
  onSaveAsProject,
}: {
  msg: ChatMsg;
  onCopy: () => void;
  onRetry?: () => void;
  copied: boolean;
  onAttachmentChange?: (attIdx: number, newCaption: string) => void;
  onOpenWorkspace?: (attachment: Attachment) => void;
  /** Phase F8 — opens the attachment in the workspace panel (side-by-side with chat) */
  onOpenInWorkspacePanel?: (attachment: Attachment) => void;
  onSaveAsProject?: (fileCount: number) => void;
}) {
  const isUser = msg.role === "user";
  const [speaking, setSpeaking] = useState(false);

  // Clean up browser speech when component unmounts
  useEffect(() => {
    return () => {
      if (speaking) stopBrowserSpeech();
    };
  }, [speaking]);

  const speak = async () => {
    // If already speaking, stop
    if (speaking) {
      stopBrowserSpeech();
      setSpeaking(false);
      return;
    }

    // Strip markdown + LaTeX + attachments for TTS (we only speak the prose)
    const plainText = msg.content
      .replace(/```[\s\S]*?```/g, " [code block] ")
      .replace(/\$\$[^$]+\$\$/g, " math equation ")
      .replace(/\$([^$]+)\$/g, " $1 ")
      .replace(/[*_`#>|]/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\s+/g, " ")
      .trim();

    if (!plainText) return;

    setSpeaking(true);

    // PRIORITY 1: Browser-based TTS (completely free, no API key, no server)
    if (isBrowserTTSSupported()) {
      try {
        const { promise } = browserSpeak(plainText, { rate: 1.0, lang: "en-US" });
        await promise;
        setSpeaking(false);
        return;
      } catch (e: any) {
        console.warn("[tutor] browser TTS failed, falling back to server:", e?.message);
        setSpeaking(false);
        // Fall through to server fallback below
      }
    }

    // FALLBACK: Server-side TTS via z-ai-web-dev-sdk
    // (only used if browser doesn't support speechSynthesis — very rare)
    try {
      const chunks: string[] = [];
      let remaining = plainText;
      while (remaining.length > 1000) {
        const cut = remaining.lastIndexOf(".", 1000);
        chunks.push(remaining.slice(0, cut > 0 ? cut + 1 : 1000));
        remaining = remaining.slice(cut > 0 ? cut + 1 : 1000);
      }
      chunks.push(remaining);

      const firstChunk = chunks[0];
      const r = await fetch("/api/tutor/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: firstChunk, voice: "tongtong", speed: 1.0 }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? "TTS failed");
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => {
        setSpeaking(false);
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        setSpeaking(false);
        URL.revokeObjectURL(url);
      };
      await audio.play();
    } catch (e: any) {
      console.error("[tutor] TTS error:", e?.message);
      // Can't setError here — MessageBubble is a child component.
      // The browser TTS path is the primary; this only runs if browser
      // doesn't support speechSynthesis (rare) AND server is also broken.
      alert(e?.message ?? "Voice playback failed");
      setSpeaking(false);
    }
  };

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} group`}>
      <div className={`max-w-[85%] ${isUser ? "" : "flex gap-2 w-full sm:max-w-[85%]"}`}>
        {!isUser && (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center flex-shrink-0">
            <Bot className="w-4 h-4 text-white" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div
            className={`rounded-2xl px-4 py-3 text-sm ${
              isUser
                ? "bg-indigo-600 text-white rounded-br-sm"
                : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm"
            }`}
          >
            <MarkdownContent content={msg.content} isUser={isUser} />
          </div>

          {/* Attachments */}
          {msg.attachments && msg.attachments.length > 0 && (
            <div className="mt-2 space-y-3">
              {msg.attachments.map((att, i) => (
                <AttachmentRenderer
                  key={i}
                  attachment={att}
                  onOpenWorkspace={onOpenWorkspace}
                  onOpenInWorkspacePanel={onOpenInWorkspacePanel}
                  onSpecChange={onAttachmentChange ? (newSpec: any) => onAttachmentChange(i, JSON.stringify(newSpec)) : undefined}
                />
              ))}
            </div>
          )}

          {/* Keep internal validation steps out of the learner-facing chat. */}

          {/* Action buttons on AI messages */}
          {!isUser && (
            <div className="flex items-center gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition">
              <button
                onClick={onCopy}
                className="px-2 py-1 rounded-md hover:bg-gray-100 text-gray-500 text-[10px] flex items-center gap-1"
                title="Copy"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                onClick={speak}
                className={`px-2 py-1 rounded-md hover:bg-gray-100 text-[10px] flex items-center gap-1 ${
                  speaking ? "text-indigo-600 font-semibold" : "text-gray-500"
                }`}
                title={speaking ? "Stop speaking" : "Listen to this reply"}
              >
                {speaking ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                {speaking ? "Stop" : "Listen"}
              </button>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="px-2 py-1 rounded-md hover:bg-gray-100 text-gray-500 text-[10px] flex items-center gap-1"
                  title="Regenerate"
                >
                  <RotateCw className="w-3 h-3" /> Retry
                </button>
              )}
              {/* Phase 9 — Tools Hub quick actions. These call the Tools Hub
                  API endpoints (when enabled by admin). Each button sends a
                  request to the corresponding tool + injects the result into
                  the chat as a new user message with context. */}
              <ToolsHubQuickActions msgContent={msg.content} />
              {/* Phase 48 — Save AI-generated code as a Project. Only shown when
                  the active buddy supports code files AND the reply contains
                  extractable code blocks. The parent component computes the
                  file count once per render and passes it as onSaveAsProject. */}
              {onSaveAsProject && (() => {
                // Single regex pass — cheap, no memoization needed.
                const files = extractCodeFiles(msg.content);
                if (!files || files.length === 0) return null;
                return (
                  <button
                    onClick={() => onSaveAsProject(files.length)}
                    className="px-2 py-1 rounded-md hover:bg-emerald-50 text-emerald-700 text-[10px] flex items-center gap-1 font-medium"
                    title={`Save ${files.length} file${files.length === 1 ? "" : "s"} as an editable project`}
                  >
                    <Save className="w-3 h-3" /> Save as project ({files.length})
                  </button>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AttachmentRenderer({ attachment, onSpecChange, onOpenWorkspace, onOpenInWorkspacePanel }: { attachment: Attachment; onSpecChange?: (newSpec: any) => void; onOpenWorkspace?: (attachment: Attachment) => void; onOpenInWorkspacePanel?: (attachment: Attachment) => void }) {
  // Phase F8 — Small "Open in workspace" button shown on workspace-compatible attachments.
  // Only renders when the feature flag is on (onOpenInWorkspacePanel is passed).
  const WorkspaceButton = () => onOpenInWorkspacePanel ? (
    <button
      onClick={() => onOpenInWorkspacePanel(attachment)}
      className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 transition"
      title="Open in workspace panel"
    >
      <PanelRightOpen className="w-3 h-3" /> Open in workspace
    </button>
  ) : null;

  // Phase F15 — When workspace mode is ON, interactive attachments (graph, quiz,
  // draw_task, manipulative, code_project, science_simulation, conceptmap) render
  // as a COMPACT notification card in the chat instead of the full interactive UI.
  // The full UI opens in the workspace panel. This keeps the chat clean — only
  // text + small notification cards flow through the conversation.
  const WORKSPACE_TYPES = ["graph", "quiz", "draw_task", "manipulative", "code_project", "science_simulation", "conceptmap",
    // Phase 7 — 8 critical new plugin attachment types
    "composition", "timeline", "geometry", "physics_sim", "molecule", "free_body", "financial", "anatomy",
    // Phase 9 — code playground (Tools Hub integration)
    "code_playground",
  ];
  if (onOpenInWorkspacePanel && WORKSPACE_TYPES.includes(attachment.type)) {
    // Auto-open the workspace panel after a short delay
    // (the useEffect in the parent handles the actual auto-open — here we just
    // render the compact card + trigger the open)
    const typeLabel = attachment.type === "graph" ? "📊 Graph"
      : attachment.type === "quiz" ? "📝 Quiz"
      : attachment.type === "draw_task" ? "✏️ Drawing Task"
      : attachment.type === "conceptmap" ? "🧠 Concept Map"
      : attachment.type === "manipulative" ? "🥭 Math Activity"
      : attachment.type === "code_project" ? "💻 Code Project"
      : attachment.type === "science_simulation" ? "🔌 Circuit Simulation"
      : attachment.type === "composition" ? "✍️ Writing Draft"
      : attachment.type === "timeline" ? "📅 Timeline"
      : attachment.type === "geometry" ? "📐 Construction"
      : attachment.type === "physics_sim" ? "🔬 Simulation"
      : attachment.type === "molecule" ? "🧪 Molecule"
      : attachment.type === "free_body" ? "➡️ Force Diagram"
      : attachment.type === "financial" ? "💰 Calculator"
      : attachment.type === "anatomy" ? "🫀 Anatomy Diagram"
      : attachment.type === "code_playground" ? "💻 Code Playground"
      : "📦 Activity";

    // Extract a title from the spec if possible
    let activityTitle = "";
    try {
      const spec = JSON.parse(attachment.caption);
      activityTitle = spec.title || spec.instruction?.slice(0, 60) || "";
    } catch {}

    return (
      <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 mt-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{typeLabel.split(" ")[0]}</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-gray-900">
              {typeLabel.split(" ").slice(1).join(" ")} ready
            </p>
            {activityTitle && (
              <p className="text-[10px] text-gray-500 truncate">{activityTitle}</p>
            )}
          </div>
          <button
            onClick={() => onOpenInWorkspacePanel(attachment)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-indigo-600 text-white text-[10px] font-semibold hover:bg-indigo-700 transition flex-shrink-0"
          >
            <PanelRightOpen className="w-3 h-3" /> Open
          </button>
        </div>
        <p className="text-[9px] text-gray-400 mt-1.5">Opening in workspace…</p>
      </div>
    );
  }
  if (attachment.type === "computer_workspace") {
    let offer: any = null;
    try { offer = JSON.parse(attachment.caption); } catch {}
    if (!offer) return null;
    return (
      <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
        <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-600">Optional computer activity</p>
        <h3 className="mt-1 text-sm font-bold text-gray-900">{offer.title}</h3>
        <p className="mt-2 text-xs leading-5 text-gray-700">{offer.reason}</p>
        <p className="mt-1 text-xs font-semibold leading-5 text-indigo-800">On a computer: {offer.benefit}</p>
        <button onClick={() => onOpenWorkspace?.(attachment)} className="mt-3 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-700">Set up the full computer workspace</button>
      </div>
    );
  }
  if (attachment.type === "source" && attachment.url) {
    return (
      <div className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 flex items-start gap-2">
        <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-700">Source</span>
        <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="min-w-0 text-xs text-sky-800 hover:underline break-words">
          {attachment.caption || attachment.url} ↗
        </a>
      </div>
    );
  }

  if (attachment.type === "video" && attachment.url) {
    const ytMatch = attachment.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    const videoId = ytMatch?.[1];
    return (
      <div className="rounded-xl overflow-hidden border border-gray-200 bg-white">
        <div className="px-3 pt-2 pb-1 flex items-center gap-1.5">
          <Video className="w-3.5 h-3.5 text-rose-500" />
          <span className="text-[10px] font-bold uppercase text-rose-500">Video</span>
        </div>
        {videoId ? (
          <div className="aspect-video bg-black">
            <iframe
              src={`https://www.youtube.com/embed/${videoId}`}
              className="w-full h-full"
              allowFullScreen
              title={attachment.caption}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            />
          </div>
        ) : (
          <div className="p-3">
            <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline">
              {attachment.caption} →
            </a>
          </div>
        )}
        <p className="text-[11px] text-gray-600 px-3 pb-2 pt-1">{attachment.caption}</p>
      </div>
    );
  }

  if (attachment.type === "image" && attachment.url) {
    return (
      <div className="rounded-xl overflow-hidden border border-gray-200 bg-white">
        <div className="px-3 pt-2 pb-1 flex items-center gap-1.5">
          <ImageIcon className="w-3.5 h-3.5 text-emerald-500" />
          <span className="text-[10px] font-bold uppercase text-emerald-500">Image</span>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={attachment.url} alt={attachment.caption} className="w-full max-h-80 object-contain bg-gray-50" />
        <p className="text-[11px] text-gray-600 px-3 py-2">{attachment.caption}</p>
      </div>
    );
  }

  // Phase 7 (Stage 1 doc reader) — render an uploaded document as a file card.
  // The `caption` field carries { fileName, fileType, charCount } as JSON.
  // The full extracted text is NOT shown here — it's too long for a chat
  // bubble. The user sees the filename + size; the AI sees the full text
  // via the system prompt.
  if (attachment.type === "document") {
    let meta: { fileName?: string; fileType?: string; charCount?: number } = {};
    try { meta = JSON.parse(attachment.caption); } catch {}
    const fileName = meta.fileName || "document";
    const fileType = (meta.fileType || "").toUpperCase();
    const charCount = meta.charCount ?? 0;
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3">
        <div className="flex items-center gap-1.5 mb-1">
          <FileText className="w-3.5 h-3.5 text-amber-600" />
          <span className="text-[10px] font-bold uppercase text-amber-600">Document</span>
        </div>
        <p className="text-sm font-semibold text-gray-900 truncate">{fileName}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          {fileType}{fileType ? " · " : ""}{charCount.toLocaleString()} chars extracted
        </p>
      </div>
    );
  }

  if (attachment.type === "graph") {
    let spec: GraphSpec | null = null;
    try {
      spec = JSON.parse(attachment.caption);
    } catch {
      spec = null;
    }
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <GitBranch className="w-3.5 h-3.5 text-indigo-500" />
            <span className="text-[10px] font-bold uppercase text-indigo-500">{spec?.type === "scene" ? "Drawing" : "Graph"}</span>
          </div>
          <div className="flex items-center gap-2">
            {spec && <DownloadGraphButton spec={spec} fileName={`graph-${spec.type ?? "custom"}.svg`} />}
            <WorkspaceButton />
          </div>
        </div>
        {spec ? <GraphRenderer spec={spec} onSpecChange={onSpecChange} /> : <p className="text-xs text-gray-600">{attachment.caption}</p>}
      </div>
    );
  }

  if (attachment.type === "conceptmap") {
    let spec: ConceptMapSpec | null = null;
    try {
      spec = JSON.parse(attachment.caption);
    } catch {
      spec = null;
    }
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Brain className="w-3.5 h-3.5 text-violet-500" />
            <span className="text-[10px] font-bold uppercase text-violet-500">Concept Map</span>
          </div>
          <div className="flex gap-2 items-center">
            {spec && <FlashcardsFromConceptMapButton spec={spec} />}
            {spec && <DownloadGraphButton spec={{ ...spec, type: "network" }} fileName="concept-map.svg" />}
            <WorkspaceButton />
          </div>
        </div>
        {spec ? (
          // Route concept maps through the unified graph renderer (network type)
          <GraphRenderer spec={{ ...spec, type: "network" }} onSpecChange={onSpecChange} />
        ) : (
          <p className="text-xs text-gray-600">{attachment.caption}</p>
        )}
      </div>
    );
  }

  // Phase 86 — In-chat interactive quiz
  if (attachment.type === "quiz") {
    let quizSpec: any = null;
    try { quizSpec = JSON.parse(attachment.caption); } catch { return null; }
    if (!quizSpec || !Array.isArray(quizSpec.questions)) return null;
    return (
      <div>
        {onOpenInWorkspacePanel && (
          <div className="flex justify-end mb-1">
            <WorkspaceButton />
          </div>
        )}
        <QuizRenderer quiz={quizSpec} />
      </div>
    );
  }

  // Phase 86.2 — Draw task (user draws on canvas, AI reviews)
  if (attachment.type === "draw_task") {
    let drawSpec: any = null;
    try { drawSpec = JSON.parse(attachment.caption); } catch { return null; }
    if (!drawSpec || !drawSpec.prompt) return null;
    return (
      <div>
        {onOpenInWorkspacePanel && (
          <div className="flex justify-end mb-1">
            <WorkspaceButton />
          </div>
        )}
        <DrawTaskRenderer task={drawSpec} onSubmit={(imageDataUrl) => {
      // Send the drawing as an image attachment to the AI for review
      // The send() function will include it as a vision input
      const event = new CustomEvent("studybuddy:submit-drawing", { detail: { imageDataUrl, task: drawSpec } });
      window.dispatchEvent(event);
    }} />
      </div>
    );
  }

  // Phase F10 — Math manipulative (fraction division, drag-and-drop)
  if (attachment.type === "manipulative") {
    let manipSpec: any = null;
    try { manipSpec = JSON.parse(attachment.caption); } catch { return null; }
    if (!manipSpec || !manipSpec.totalCount || !manipSpec.basketCount) return null;
    return (
      <div>
        {onOpenInWorkspacePanel && (
          <div className="flex justify-end mb-1">
            <WorkspaceButton />
          </div>
        )}
        <FractionManipulative spec={manipSpec} />
      </div>
    );
  }

  // Phase F11 — Code project (HTML/CSS/JS live preview)
  if (attachment.type === "code_project") {
    let codeSpec: any = null;
    try { codeSpec = JSON.parse(attachment.caption); } catch { return null; }
    if (!codeSpec || !codeSpec.files) return null;
    return (
      <div>
        {onOpenInWorkspacePanel && (
          <div className="flex justify-end mb-1">
            <WorkspaceButton />
          </div>
        )}
        <CodePreviewPanel spec={codeSpec} />
      </div>
    );
  }

  // Phase F14 — Science simulation (circuit builder)
  if (attachment.type === "science_simulation") {
    let simSpec: any = null;
    try { simSpec = JSON.parse(attachment.caption); } catch { return null; }
    if (!simSpec || !simSpec.circuit) return null;
    return (
      <div>
        {onOpenInWorkspacePanel && (
          <div className="flex justify-end mb-1">
            <WorkspaceButton />
          </div>
        )}
        <ScienceSimulationPanel spec={simSpec} />
      </div>
    );
  }

  // Phase FC — Flowchart (semantic plan → deterministic layout → SVG)
  // Uses the lazy-loaded FlowchartRenderer which dynamically imports
  // the validator + compiler + SVG renderer only when needed.
  if (attachment.type === "flowchart_v1") {
    let fcSpec: any = null;
    try { fcSpec = JSON.parse(attachment.caption); } catch { return null; }
    return (
      <div>
        {onOpenInWorkspacePanel && (
          <div className="flex justify-end mb-1">
            <WorkspaceButton />
          </div>
        )}
        <FlowchartRenderer spec={fcSpec} compact={!!onOpenInWorkspacePanel} />
      </div>
    );
  }

  // Phase 7 — Inline renderers for the 8 critical new plugin attachment
  // types. These show a COMPACT preview in the chat. The full interactive
  // panel opens in the workspace (handled by the WORKSPACE_TYPES dispatch
  // above).
  if (["composition", "timeline", "geometry", "physics_sim", "molecule", "free_body", "financial", "anatomy", "code_playground"].includes(attachment.type)) {
    let spec: any = null;
    try { spec = JSON.parse(attachment.caption); } catch { return null; }
    if (!spec) return null;

    // Static class strings so Tailwind's compiler picks them up. Constructing
    // class names dynamically (e.g. `border-${accent}-200`) does NOT work with
    // Tailwind v3 — the compiler only sees literal strings in the source.
    const STYLE_BY_TYPE: Record<string, { icon: string; label: string; cardClass: string; labelClass: string }> = {
      composition: { icon: "✍️", label: "Writing Draft", cardClass: "rounded-xl border border-purple-200 bg-purple-50/40 p-3", labelClass: "text-[10px] font-bold uppercase text-purple-600" },
      timeline: { icon: "📅", label: "Timeline", cardClass: "rounded-xl border border-amber-200 bg-amber-50/40 p-3", labelClass: "text-[10px] font-bold uppercase text-amber-600" },
      geometry: { icon: "📐", label: "Construction", cardClass: "rounded-xl border border-emerald-200 bg-emerald-50/40 p-3", labelClass: "text-[10px] font-bold uppercase text-emerald-600" },
      physics_sim: { icon: "🔬", label: "Simulation", cardClass: "rounded-xl border border-blue-200 bg-blue-50/40 p-3", labelClass: "text-[10px] font-bold uppercase text-blue-600" },
      molecule: { icon: "🧪", label: "Molecule", cardClass: "rounded-xl border border-pink-200 bg-pink-50/40 p-3", labelClass: "text-[10px] font-bold uppercase text-pink-600" },
      free_body: { icon: "➡️", label: "Force Diagram", cardClass: "rounded-xl border border-red-200 bg-red-50/40 p-3", labelClass: "text-[10px] font-bold uppercase text-red-600" },
      financial: { icon: "💰", label: "Calculation", cardClass: "rounded-xl border border-green-200 bg-green-50/40 p-3", labelClass: "text-[10px] font-bold uppercase text-green-600" },
      anatomy: { icon: "🫀", label: "Anatomy Diagram", cardClass: "rounded-xl border border-rose-200 bg-rose-50/40 p-3", labelClass: "text-[10px] font-bold uppercase text-rose-600" },
      code_playground: { icon: "💻", label: "Code Playground", cardClass: "rounded-xl border border-emerald-200 bg-emerald-50/40 p-3", labelClass: "text-[10px] font-bold uppercase text-emerald-600" },
    };
    const style = STYLE_BY_TYPE[attachment.type];

    // Summarize the spec for the compact card
    let summary = "";
    if (attachment.type === "composition" && Array.isArray(spec.sections)) {
      summary = `${spec.sections.length} section${spec.sections.length === 1 ? "" : "s"} • ${spec.type || "essay"}`;
    } else if (attachment.type === "timeline" && Array.isArray(spec.events)) {
      summary = `${spec.events.length} event${spec.events.length === 1 ? "" : "s"} • ${spec.events[0]?.date ?? ""} → ${spec.events[spec.events.length - 1]?.date ?? ""}`;
    } else if (attachment.type === "geometry" && Array.isArray(spec.shapes)) {
      summary = `${spec.shapes.length} shape${spec.shapes.length === 1 ? "" : "s"}`;
    } else if (attachment.type === "physics_sim") {
      summary = `${(spec.simType || "").replace(/_/g, " ")}`;
    } else if (attachment.type === "molecule") {
      summary = spec.formula || (Array.isArray(spec.atoms) ? `${spec.atoms.length} atoms` : "Reaction");
    } else if (attachment.type === "free_body" && Array.isArray(spec.forces)) {
      summary = `${spec.forces.length} force${spec.forces.length === 1 ? "" : "s"} • ${spec.body || "object"}`;
    } else if (attachment.type === "financial") {
      summary = `${(spec.calcType || "").replace(/_/g, " ")}`;
    } else if (attachment.type === "anatomy" && Array.isArray(spec.labels)) {
      summary = `${spec.labels.length} label${spec.labels.length === 1 ? "" : "s"} • ${spec.system || "body"}`;
    } else if (attachment.type === "code_playground") {
      const lang = spec.language || spec.lang || "python";
      const lines = (spec.code || spec.content || "").split("\n").filter((l: string) => l.trim()).length;
      summary = `${lang} • ${lines} line${lines === 1 ? "" : "s"}`;
    }

    return (
      <div>
        {onOpenInWorkspacePanel && (
          <div className="flex justify-end mb-1">
            <WorkspaceButton />
          </div>
        )}
        <div className={style.cardClass}>
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-base">{style.icon}</span>
            <span className={style.labelClass}>{style.label}</span>
          </div>
          <p className="text-sm font-semibold text-gray-900 truncate">
            {spec.title || style.label}
          </p>
          {summary && <p className="text-xs text-gray-500 mt-0.5">{summary}</p>}
        </div>
      </div>
    );
  }

  return null;
}

// =====================================================================
// DrawTaskRenderer — Phase 86.2
// Renders an interactive canvas where the user draws, then submits the
// drawing as an image to the AI for review.
// =====================================================================
function DrawTaskRenderer({ task, onSubmit }: { task: any; onSubmit: (imageDataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [color, setColor] = useState("#1f2937");
  const [brushSize, setBrushSize] = useState(3);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Set canvas size to match displayed size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;  // retina
    canvas.height = 400 * 2;
    ctx.scale(2, 2);
    // White background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, 400);
  }, []);

  const getPos = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDraw = (e: React.PointerEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    setDrawing(true);
    lastPos.current = getPos(e);
  };

  const draw = (e: React.PointerEvent) => {
    if (!drawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
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

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, 400);
    setHasDrawn(false);
  };

  const submit = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn) return;
    // Convert canvas to PNG data URL
    // Phase 88 — compress to JPEG (PNG is too large for Vercel's 4.5MB limit)
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    onSubmit(dataUrl);
  };

  return (
    <div className="rounded-2xl border-2 border-violet-200 bg-violet-50/50 p-4 mt-2">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">✏️</span>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-gray-900">{task.title || "Drawing Task"}</h3>
        </div>
      </div>
      <p className="text-sm text-gray-700 mb-2">{task.prompt}</p>
      {task.hint && (
        <button onClick={() => setShowHint(!showHint)} className="text-xs text-violet-600 font-semibold mb-2">
          {showHint ? "Hide hint" : "💡 Show hint"}
        </button>
      )}
      {showHint && task.hint && (
        <div className="mb-2 p-2 rounded-lg bg-amber-50 border border-amber-200">
          <p className="text-xs text-amber-800">{task.hint}</p>
        </div>
      )}

      {/* Drawing canvas */}
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
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          {["#1f2937", "#dc2626", "#2563eb", "#16a34a", "#ca8a04", "#7c3aed"].map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-6 h-6 rounded-full border-2 ${color === c ? "border-gray-900 scale-110" : "border-gray-300"} transition`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <div className="flex items-center gap-1">
          {[2, 4, 8].map(s => (
            <button
              key={s}
              onClick={() => setBrushSize(s)}
              className={`w-7 h-7 rounded-full border-2 flex items-center justify-center ${brushSize === s ? "border-violet-500 bg-violet-100" : "border-gray-300"}`}
            >
              <span className="rounded-full bg-gray-700" style={{ width: s, height: s }} />
            </button>
          ))}
        </div>
        <button
          onClick={clearCanvas}
          className="ml-auto px-3 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold"
        >
          🗑 Clear
        </button>
      </div>

      <button
        onClick={submit}
        disabled={!hasDrawn}
        className="mt-3 w-full h-11 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white text-sm font-bold transition"
      >
        {hasDrawn ? "📤 Submit Drawing for Review" : "Draw something first…"}
      </button>
    </div>
  );
}

// =====================================================================
// QuizRenderer — Phase 86
// Interactive MCQ quiz that renders inline in the chat.
// User picks options, clicks Submit, sees score + correct answers + explanations.
// =====================================================================
function QuizRenderer({ quiz }: { quiz: any }) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);

  const questions = quiz.questions || [];
  const totalQ = questions.length;

  const score = submitted ? questions.reduce((acc: number, q: any) => {
    return acc + (answers[q.id] === q.correctIndex ? 1 : 0);
  }, 0) : 0;

  const allAnswered = questions.every((q: any) => answers[q.id] !== undefined);

  const handleSubmit = () => {
    if (!allAnswered) return;
    setSubmitted(true);
    // Phase 88.6 — Track quiz score for progress
    const s = questions.reduce((acc: number, q: any) => acc + (answers[q.id] === q.correctIndex ? 1 : 0), 0);
    fetch("/api/tutor/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        durationSec: 60,
        activity: "quiz",
        quizScore: s,
        quizTotal: totalQ,
        topic: quiz.title || "Quiz",
      }),
    }).catch(() => {});
  };

  const handleReset = () => {
    setAnswers({});
    setSubmitted(false);
  };

  return (
    <div className="rounded-2xl border-2 border-indigo-200 bg-indigo-50/50 p-4 mt-2">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">📝</span>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-gray-900">{quiz.title || "Quick Quiz"}</h3>
          <p className="text-xs text-gray-500">{totalQ} question{totalQ !== 1 ? "s" : ""}</p>
        </div>
        {submitted && (
          <div className={`px-3 py-1.5 rounded-full text-xs font-bold ${
            score === totalQ ? "bg-emerald-500 text-white"
              : score >= totalQ * 0.5 ? "bg-amber-500 text-white"
              : "bg-rose-500 text-white"
          }`}>
            {score} / {totalQ} ({Math.round((score / totalQ) * 100)}%)
          </div>
        )}
      </div>

      <div className="space-y-4">
        {questions.map((q: any, idx: number) => {
          const userAnswer = answers[q.id];
          const isCorrect = submitted && userAnswer === q.correctIndex;
          return (
            <div key={q.id || idx} className="bg-white rounded-xl p-3 border border-gray-200">
              <p className="text-sm font-semibold text-gray-900 mb-2">
                <span className="text-indigo-600">Q{idx + 1}.</span> {q.question}
              </p>
              <div className="space-y-1.5">
                {(q.options || []).map((opt: string, optIdx: number) => {
                  const isPicked = userAnswer === optIdx;
                  const isCorrectAnswer = submitted && optIdx === q.correctIndex;
                  const isWrongPick = submitted && isPicked && !isCorrectAnswer;
                  return (
                    <button
                      key={optIdx}
                      disabled={submitted}
                      onClick={() => !submitted && setAnswers(prev => ({ ...prev, [q.id]: optIdx }))}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm border transition flex items-center gap-2 ${
                        submitted
                          ? isCorrectAnswer
                            ? "bg-emerald-50 border-emerald-400 text-emerald-900 font-semibold"
                            : isWrongPick
                              ? "bg-rose-50 border-rose-400 text-rose-900"
                              : "bg-gray-50 border-gray-200 text-gray-500"
                          : isPicked
                            ? "bg-indigo-100 border-indigo-400 text-indigo-900 font-semibold"
                            : "bg-gray-50 border-gray-200 text-gray-700 hover:border-indigo-300"
                      }`}
                    >
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                        submitted
                          ? isCorrectAnswer
                            ? "bg-emerald-500 text-white"
                            : isWrongPick
                              ? "bg-rose-500 text-white"
                              : "bg-gray-300 text-gray-600"
                          : isPicked
                            ? "bg-indigo-500 text-white"
                            : "bg-gray-200 text-gray-600"
                      }`}>
                        {String.fromCharCode(65 + optIdx)}
                      </span>
                      <span className="flex-1">{opt}</span>
                      {submitted && isCorrectAnswer && <span className="text-emerald-600 text-xs">✓</span>}
                      {submitted && isWrongPick && <span className="text-rose-600 text-xs">✗</span>}
                    </button>
                  );
                })}
              </div>
              {submitted && q.explanation && (
                <div className="mt-2 p-2 rounded-lg bg-blue-50 border border-blue-200">
                  <p className="text-xs text-blue-800">
                    <span className="font-bold">💡 Explanation:</span> {q.explanation}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!submitted ? (
        <button
          onClick={handleSubmit}
          disabled={!allAnswered}
          className="mt-4 w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:bg-gray-300 text-white text-sm font-bold transition"
        >
          {allAnswered ? "Submit Quiz" : `Answer all questions (${Object.keys(answers).length}/${totalQ})`}
        </button>
      ) : (
        <div className="mt-4 space-y-2">
          <div className={`rounded-xl p-3 text-center ${
            score === totalQ ? "bg-emerald-100 text-emerald-800"
              : score >= totalQ * 0.5 ? "bg-amber-100 text-amber-800"
              : "bg-rose-100 text-rose-800"
          }`}>
            <p className="text-lg font-bold">
              {score === totalQ ? "🎉 Perfect!" : score >= totalQ * 0.5 ? "👍 Good job!" : "📚 Keep practicing!"}
            </p>
            <p className="text-sm">You scored {score} out of {totalQ} ({Math.round((score / totalQ) * 100)}%)</p>
          </div>
          <button
            onClick={handleReset}
            className="w-full h-10 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold"
          >
            ↻ Try Again
          </button>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// Markdown Renderer — handles code blocks, lists, bold/italic, links
// =====================================================================
function MarkdownContent({ content, isUser }: { content: string; isUser: boolean }) {
  // Split content into blocks: code blocks vs. inline content
  const blocks: Array<{ type: "code" | "text"; lang?: string; content: string }> = [];
  const codeBlockRegex = /```(\w+)?\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      blocks.push({ type: "text", content: content.slice(lastIndex, match.index) });
    }
    blocks.push({
      type: "code",
      lang: match[1] || "text",
      content: match[2].trim(),
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    blocks.push({ type: "text", content: content.slice(lastIndex) });
  }
  // If no blocks were created (no code blocks), use the entire content as text
  if (blocks.length === 0) {
    blocks.push({ type: "text", content });
  }

  return (
    <div className="space-y-2">
      {blocks.map((block, i) => {
        if (block.type === "code") {
          // Skip mathgraph/conceptmap code blocks — they are rendered as attachments
          if (block.lang === "mathgraph" || block.lang === "conceptmap" || block.lang === "examgen") return null;
          // Also skip JSON / text blocks that look like graph specs (since the
          // server has parsed them into attachments already). Check if the
          // block content starts with `{"type": "..."` where type is one of
          // our known graph types.
          const graphTypeMatch = block.content.match(/^\{\s*"type"\s*:\s*"(\w+)"/);
          const KNOWN_GRAPH_TYPES = new Set([
            "function", "scatter", "bar", "histogram", "pie", "venn",
            "numberline", "tree", "network", "vector", "polygon", "boxplot",
            "slopefield", "stemleaf", "frequency_polygon", "freeform",
            "argand", "contour", "vectorfield", "tessellation", "knot",
            "pictogram", "tally", "carroll", "ogive", "unitcircle",
            "transform", "axes3d", "twoway", "erdiagram", "csv", "steps", "scene",
          ]);
          if (
            (block.lang === "json" || block.lang === "text" || block.lang === "") &&
            graphTypeMatch && KNOWN_GRAPH_TYPES.has(graphTypeMatch[1])
          ) {
            return null;
          }
          return <CodeBlock key={i} code={block.content} lang={block.lang} />;
        }
        return <TextBlock key={i} content={block.content} isUser={isUser} />;
      })}
    </div>
  );
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<{ stdout?: string; stderr?: string; exitCode?: number | null; unsupported?: boolean } | null>(null);
  const [showOutput, setShowOutput] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Phase 9 — Run button for Python + JavaScript code blocks.
  // Calls /api/tools/sandbox which routes to Tools Hub when enabled.
  // When Tools Hub is disabled, returns `unsupported: true` and the
  // learner sees a friendly "code execution not available" message.
  const runCode = async () => {
    const normalizedLang = (lang ?? "").toLowerCase().trim();
    const language: "python" | "javascript" | null =
      normalizedLang === "python" || normalizedLang === "py" ? "python" :
      normalizedLang === "javascript" || normalizedLang === "js" ? "javascript" :
      null;
    if (!language) return; // Run button only shows for python/js

    setRunning(true);
    setOutput(null);
    setShowOutput(true);
    try {
      const r = await fetch("/api/tools/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, code }),
      });
      const d = await r.json();
      if (!r.ok) {
        setOutput({ stderr: d.error ?? "Run failed", unsupported: true });
      } else {
        setOutput({
          stdout: d.stdout,
          stderr: d.stderr,
          exitCode: d.exitCode,
          unsupported: d.unsupported,
        });
      }
    } catch (e: any) {
      setOutput({ stderr: `Network error: ${e?.message ?? e}`, unsupported: true });
    } finally {
      setRunning(false);
    }
  };

  const normalizedLang = (lang ?? "").toLowerCase().trim();
  const canRun = normalizedLang === "python" || normalizedLang === "py" ||
                  normalizedLang === "javascript" || normalizedLang === "js";

  return (
    <div className="relative rounded-lg bg-gray-900 text-gray-100 p-3 my-2 overflow-x-auto">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase text-gray-400 font-mono">{lang}</span>
        <div className="flex items-center gap-1.5">
          {/* Phase 9 — Run button (only for Python + JavaScript) */}
          {canRun && (
            <button
              onClick={runCode}
              disabled={running}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition"
              title="Run this code in the sandbox"
            >
              {running ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Play className="w-2.5 h-2.5" />}
              {running ? "Running…" : "Run"}
            </button>
          )}
          <button onClick={copy} className="text-gray-400 hover:text-white">
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          </button>
        </div>
      </div>
      <pre className="text-xs font-mono whitespace-pre-wrap break-words leading-relaxed">{code}</pre>
      {/* Phase 9 — Output panel (collapsible) */}
      {showOutput && output && (
        <div className="mt-2 pt-2 border-t border-gray-700">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase text-gray-400 font-mono">Output</span>
            <button
              onClick={() => setShowOutput(false)}
              className="text-gray-400 hover:text-white"
              title="Hide output"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          {output.unsupported ? (
            <div className="text-xs text-amber-400 bg-amber-900/20 border border-amber-700/40 rounded p-2">
              {output.stderr || "Code execution is not available right now."}
            </div>
          ) : (
            <div className="space-y-1">
              {output.stdout && (
                <pre className="text-xs font-mono text-emerald-300 bg-black/30 rounded p-2 whitespace-pre-wrap break-words">{output.stdout}</pre>
              )}
              {output.stderr && (
                <pre className="text-xs font-mono text-red-300 bg-black/30 rounded p-2 whitespace-pre-wrap break-words">{output.stderr}</pre>
              )}
              {!output.stdout && !output.stderr && (
                <pre className="text-xs font-mono text-gray-500 italic">(no output)</pre>
              )}
              {typeof output.exitCode === "number" && (
                <div className="text-[10px] text-gray-500">Exit code: {output.exitCode}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TextBlock({ content, isUser }: { content: string; isUser: boolean }) {
  // Render line-by-line with markdown inline formatting
  const lines = content.split("\n");
  const elements: ReactElement[] = [];
  let listBuffer: Array<{ type: "ul" | "ol"; items: string[] }> = [];
  let currentList: { type: "ul" | "ol"; items: string[] } | null = null;

  const flushList = () => {
    if (listBuffer.length > 0) {
      // Combine all consecutive lists of same type
      const ulItems: string[] = [];
      const olItems: string[] = [];
      for (const l of listBuffer) {
        if (l.type === "ul") ulItems.push(...l.items);
        else olItems.push(...l.items);
      }
      if (ulItems.length > 0) {
        elements.push(
          <ul key={`ul-${elements.length}`} className="list-disc pl-5 my-1 space-y-0.5">
            {ulItems.map((it, i) => (
              <li key={i} dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(it, isUser) }} />
            ))}
          </ul>
        );
      }
      if (olItems.length > 0) {
        elements.push(
          <ol key={`ol-${elements.length}`} className="list-decimal pl-5 my-1 space-y-0.5">
            {olItems.map((it, i) => (
              <li key={i} dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(it, isUser) }} />
            ))}
          </ol>
        );
      }
      listBuffer = [];
    }
    currentList = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Unordered list item: "- " or "* "
    const ulMatch = line.match(/^\s*[-*]\s+(.*)/);
    if (ulMatch) {
      currentList = { type: "ul", items: [ulMatch[1]] };
      listBuffer.push(currentList);
      continue;
    }
    // Ordered list item: "1. "
    const olMatch = line.match(/^\s*\d+\.\s+(.*)/);
    if (olMatch) {
      currentList = { type: "ol", items: [olMatch[1]] };
      listBuffer.push(currentList);
      continue;
    }
    // Empty line — flush list
    if (line.trim() === "") {
      flushList();
      continue;
    }
    // Regular paragraph
    flushList();
    elements.push(
      <p
        key={`p-${i}`}
        className="leading-relaxed"
        dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(line, isUser) }}
      />
    );
  }
  flushList();

  return <div className="space-y-1">{elements}</div>;
}

function renderInlineMarkdown(line: string, isUser: boolean): string {
  // Escape HTML FIRST so LaTeX commands like \frac don't get HTML-escaped
  // (well, \ stays as \, but < and > are escaped which is what we want for
  // safety). KaTeX will receive the LaTeX source as-is.
  let html = line
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Helper: try to render a LaTeX string to HTML via KaTeX.
  // Falls back to a styled code span if parsing fails (so users see the
  // raw source instead of nothing).
  const renderLatex = (latex: string, displayMode: boolean): string => {
    try {
      return katex.renderToString(latex, {
        displayMode,
        throwOnError: false,
        output: "html",
        // Trust the AI's LaTeX — we're already in dangerouslySetInnerHTML context
        trust: true,
        strict: false,
      });
    } catch (e: any) {
      // Fallback: styled span with the raw LaTeX visible
      const escaped = latex.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return `<code style="background:${isUser ? "rgba(255,255,255,0.2)" : "#f3f4f6"};padding:2px 4px;border-radius:4px;font-family:monospace;font-size:0.85em;">${escaped}</code>`;
    }
  };

  // Block math $$...$$ first (longer pattern matches first)
  html = html.replace(/\$\$([\s\S]+?)\$\$/g, (_, latex) => {
    const rendered = renderLatex(latex, true);
    return `<div style="text-align:center;margin:6px 0;overflow-x:auto;">${rendered}</div>`;
  });

  // Inline math $...$ (single-line, no $ inside)
  html = html.replace(
    /\$([^\$\n]+?)\$/g,
    (_, latex) => renderLatex(latex, false)
  );

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // Inline code
  html = html.replace(
    /`([^`]+)`/g,
    `<code style="background:${isUser ? "rgba(255,255,255,0.2)" : "#f3f4f6"};padding:2px 4px;border-radius:4px;font-family:monospace;font-size:0.85em;">$1</code>`
  );
  // Links [text](url)
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    `<a href="$2" target="_blank" rel="noopener" style="color:${isUser ? "#bfdbfe" : "#4F46E5"};text-decoration:underline;">$1</a>`
  );
  return html || "&nbsp;";
}

// =====================================================================
// DownloadGraphButton — renders the GraphRenderer to an SVG string, then
// downloads it as an .svg file. Also offers a PNG download via canvas
// conversion (the SVG is rendered to a canvas then exported as PNG).
// =====================================================================
function DownloadGraphButton({ spec, fileName }: { spec: any; fileName: string }) {
  const [open, setOpen] = useState(false);

  const downloadSVG = (e: React.MouseEvent) => {
    // Find the nearest SVG element rendered by GraphRenderer
    // (the button is in the same attachment card as the SVG)
    const card = (e.target as HTMLElement)?.closest(".rounded-xl");
    const svgEl = card?.querySelector("svg") as SVGSVGElement | null;
    if (!svgEl) return;

    // Serialize the SVG
    const serializer = new XMLSerializer();
    let svgStr = serializer.serializeToString(svgEl);
    // Ensure XML declaration + namespace
    if (!svgStr.startsWith("<?xml")) {
      svgStr = `<?xml version="1.0" encoding="UTF-8"?>\n` + svgStr;
    }
    // Add xmlns if missing
    if (!/xmlns=/.test(svgStr)) {
      svgStr = svgStr.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    // Trigger download
    const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName.endsWith(".svg") ? fileName : `${fileName}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setOpen(false);
  };

  const downloadPNG = (e: React.MouseEvent) => {
    const card = (e.target as HTMLElement)?.closest(".rounded-xl");
    const svgEl = card?.querySelector("svg") as SVGSVGElement | null;
    if (!svgEl) return;

    const serializer = new XMLSerializer();
    let svgStr = serializer.serializeToString(svgEl);
    if (!/xmlns=/.test(svgStr)) {
      svgStr = svgStr.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    // Get viewBox dimensions
    const viewBox = svgEl.getAttribute("viewBox")?.split(/[\s,]+/) ?? ["0", "0", "480", "360"];
    const w = parseInt(viewBox[2] ?? "480", 10);
    const h = parseInt(viewBox[3] ?? "360", 10);

    // Render SVG to an Image, then to a canvas, then to PNG
    const img = new Image();
    const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w * 2; // 2x for retina
      canvas.height = h * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);

      canvas.toBlob((pngBlob) => {
        if (!pngBlob) return;
        const pngUrl = URL.createObjectURL(pngBlob);
        const a = document.createElement("a");
        a.href = pngUrl;
        a.download = fileName.replace(/\.svg$/, ".png");
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(pngUrl);
        setOpen(false);
      }, "image/png");
    };
    img.src = url;
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="text-[10px] text-gray-500 hover:text-indigo-600 flex items-center gap-0.5"
        title="Download graph as image"
      >
        <Download className="w-3 h-3" /> Download
      </button>
      {open && (
        <div className="absolute right-0 top-6 z-10 bg-white rounded-lg shadow-lg border border-gray-200 p-1 min-w-[100px]">
          <button
            onClick={downloadSVG}
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 rounded"
          >
            📐 SVG (vector)
          </button>
          <button
            onClick={downloadPNG}
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 rounded"
          >
            🖼️ PNG (image)
          </button>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// FlashcardsFromConceptMapButton — appears on concept map attachments.
// Calls /api/study-sets/from-concept-map to generate a study set of
// flashcards + MCQs directly from the concept map's nodes/edges.
// =====================================================================
function FlashcardsFromConceptMapButton({ spec }: { spec: any }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setScreen = useApp((s) => s.setScreen);
  const dataSaver = useApp((s) => s.dataSaver);
  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/study-sets/from-concept-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conceptMapSpec: spec }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed");
      setDone(true);
      setTimeout(() => {
        // Take the user to the flashcards screen to start studying immediately
        setScreen("flashcards");
      }, 1200);
    } catch (e: any) {
      setError(e?.message ?? "Failed");
      setTimeout(() => setError(null), 4000);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-1">
        <Check className="w-3 h-3" /> Saved!
      </span>
    );
  }

  return (
    <button
      onClick={generate}
      disabled={busy}
      className="text-[10px] text-violet-700 hover:text-violet-900 flex items-center gap-0.5 disabled:opacity-50"
      title="Generate flashcards + MCQs from this concept map"
    >
      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
      {busy ? "Making…" : "Flashcards"}
      {error && <span className="text-rose-500 ml-1">✗</span>}
    </button>
  );
}

// =====================================================================
// CompareCard — shows a model's reply in the comparison panel with a
// "I prefer this" voting button
// =====================================================================
function CompareCard({ result, onPrefer }: { result: any; onPrefer: () => void }) {
  return (
    <div className={`rounded-xl border-2 p-3 transition ${
      result.error
        ? "border-rose-200 bg-rose-50/40"
        : "border-violet-200 bg-white hover:border-violet-300"
    }`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-lg">{result.emoji}</span>
          <span className="text-xs font-bold text-gray-900">{result.displayName}</span>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          {result.latencyMs && <span className="text-gray-500">{result.latencyMs}ms</span>}
          {result.error && <span className="text-rose-500">✗</span>}
        </div>
      </div>
      {result.reply ? (
        <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">{result.reply}</p>
      ) : (
        <p className="text-xs text-rose-500">{result.error ?? "No reply"}</p>
      )}
      {!result.error && result.reply && (
        <button
          onClick={onPrefer}
          className="mt-2 w-full py-1 rounded-full bg-violet-50 text-violet-700 text-[10px] font-semibold hover:bg-violet-100 transition border border-violet-200"
        >
          👍 I prefer this one
        </button>
      )}
    </div>
  );
}

// =====================================================================
// ProofBadges — compact proof status without thinking dropdown
// =====================================================================
function ProofBadges({ proof }: { proof: any }) {
  return (
    <div className="mt-1.5 flex gap-1.5 text-[10px]">
      <span className={`px-2 py-0.5 rounded-full ${proof.curriculumMatch ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
        {proof.curriculumMatch ? "✓ Curriculum" : "⚠ Out of curriculum"}
      </span>
      <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
        Facts: {proof.factualConfidence}%
      </span>
      <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
        Readability: {proof.readabilityScore}%
      </span>
    </div>
  );
}

// =====================================================================
// TopicCardsBar — Phase 88.4 (Netflix-style animated sliding cards)
// Explore projects slide in from the right, pause, then slide out.
// Like Netflix autoplay trailers. NO hardcoded content — all dynamic
// from /api/explore (filtered by user's track+course).
// =====================================================================
function TopicCardsBar() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/explore");
        if (r.ok) {
          const d = await r.json();
          setProjects((d.projects || []).slice(0, 10));
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  // Phase 88.4 — Netflix-style auto-scroll animation
  // Cards slide slowly from right to left. Pauses on hover.
  useEffect(() => {
    if (paused || projects.length === 0) return;
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;

    let raf: number;
    let lastTime = performance.now();

    const animate = (now: number) => {
      const dt = now - lastTime;
      lastTime = now;
      // Scroll speed: 30px per second
      scrollContainer.scrollLeft += (dt / 1000) * 30;
      // If we've scrolled past the end, loop back to start
      if (scrollContainer.scrollLeft >= scrollContainer.scrollWidth - scrollContainer.clientWidth - 1) {
        scrollContainer.scrollLeft = 0;
      }
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [paused, projects]);

  if (loading || projects.length === 0) return null;

  return (
    <div
      className="flex-shrink-0 border-b border-gray-200 bg-gradient-to-r from-indigo-50 via-white to-violet-50 py-2 overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex items-center gap-1.5 px-4 mb-1.5">
        <span className="text-sm">🧭</span>
        <p className="text-[10px] font-bold uppercase text-indigo-600 tracking-wide">Explore Projects</p>
        <span className="text-[9px] text-gray-400 ml-1">Hover to pause</span>
      </div>
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto no-scrollbar px-4"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {projects.map((p) => (
          <a
            key={p.id}
            href={p.projectUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 w-44 rounded-xl overflow-hidden border border-gray-200 bg-white hover:border-indigo-400 hover:shadow-md transition group"
          >
            {p.thumbnailUrl ? (
              <div className="relative w-full h-20 overflow-hidden">
                <img
                  src={p.thumbnailUrl}
                  alt={p.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                {p.isFeatured && (
                  <span className="absolute top-1 left-1 text-[8px] font-bold bg-amber-400 text-amber-900 px-1.5 py-0.5 rounded-full">
                    ⭐ FEATURED
                  </span>
                )}
              </div>
            ) : (
              <div className="w-full h-20 bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center">
                <span className="text-2xl opacity-40">🧭</span>
              </div>
            )}
            <div className="p-2">
              <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wide truncate">
                {p.category || "Project"}
              </p>
              <p className="text-xs font-semibold text-gray-900 line-clamp-2 leading-tight mt-0.5">
                {p.title}
              </p>
              <p className="text-[9px] text-gray-400 mt-1 truncate">
                {p.subject} · {p.viewCount} views
              </p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Phase 9 — ToolsHubQuickActions
// Shows buttons for each Tools Hub tool (Image Gen, Web Search, URL
// Extract) on AI messages. When clicked, calls the corresponding
// /api/tools/* endpoint + dispatches a CustomEvent with the result
// so the parent chat component can inject it as context.
// Each button gracefully handles "unsupported" (tool disabled) by
// showing a brief tooltip.
// ============================================================
function ToolsHubQuickActions({ msgContent }: { msgContent: string }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const callTool = async (tool: string, body: Record<string, unknown>, label: string) => {
    setLoading(tool);
    setError(null);
    try {
      const r = await fetch(`/api/tools/${tool}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (d.unsupported) {
        setError(`${label} is not enabled. Ask an admin to turn it on in Tools Hub settings.`);
        setTimeout(() => setError(null), 4000);
        return;
      }
      if (!r.ok) {
        setError(d.error ?? `${label} failed`);
        setTimeout(() => setError(null), 4000);
        return;
      }
      // Dispatch a custom event with the result — the parent chat listens
      // for this and injects the result as context for the next AI message.
      window.dispatchEvent(new CustomEvent("studybuddy:tool-result", {
        detail: { tool, data: d, sourceContent: msgContent },
      }));
    } catch (e: any) {
      setError(`Network error: ${e?.message ?? e}`);
      setTimeout(() => setError(null), 4000);
    } finally {
      setLoading(null);
    }
  };

  // Extract URLs from the AI reply for the "Extract URL" button
  const urls = (msgContent.match(/https?:\/\/[^\s)<>"']+/g) ?? []).slice(0, 1);

  return (
    <>
      <button
        onClick={() => callTool("image", {
          prompt: `Create an educational illustration for: ${msgContent.slice(0, 200)}`,
          size: "1024x1024",
          style: "educational",
        }, "Image generation")}
        disabled={loading !== null}
        className="px-2 py-1 rounded-md hover:bg-purple-50 text-purple-600 text-[10px] flex items-center gap-1 disabled:opacity-50"
        title="Generate an illustration for this topic (Tools Hub)"
      >
        {loading === "image-gen" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
        Image
      </button>
      <button
        onClick={() => callTool("search", {
          query: msgContent.slice(0, 200),
          num: 5,
        }, "Web search")}
        disabled={loading !== null}
        className="px-2 py-1 rounded-md hover:bg-blue-50 text-blue-600 text-[10px] flex items-center gap-1 disabled:opacity-50"
        title="Search the web for more info on this topic (Tools Hub)"
      >
        {loading === "search" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
        Search
      </button>
      {urls.length > 0 && (
        <button
          onClick={() => callTool("reader", { url: urls[0] }, "URL extractor")}
          disabled={loading !== null}
          className="px-2 py-1 rounded-md hover:bg-emerald-50 text-emerald-600 text-[10px] flex items-center gap-1 disabled:opacity-50"
          title={`Extract clean text from: ${urls[0].slice(0, 60)}...`}
        >
          {loading === "web-reader" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link className="w-3 h-3" />}
          Extract
        </button>
      )}
      {error && (
        <span className="text-[10px] text-amber-600 px-1">{error}</span>
      )}
    </>
  );
}
