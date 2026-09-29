"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Heart,
  Loader2,
  AlertCircle,
  RefreshCw,
  BookOpen,
  Target,
  Lightbulb,
  Sigma,
  Pencil,
  Layers,
  ListChecks,
  Bot,
  Send,
  Plus,
  Sparkles,
  Check,
  Map as MapIcon,
  Coins,
  Trophy,
  Flame,
  Timer,
  Music,
  FileText,
  Palette,
  FileDown,
  Gamepad2,
  ShoppingBag,
  Volume2,
} from "lucide-react";
import { useApp } from "../store";
import { api, type Card } from "../api";
import {
  StudyRoomHeader,
  AITeacherCard,
  ToolsWorkbench,
  BulletinBoard,
  DailyGoalsChecklist,
  Bookshelf,
  GroupStudySection,
} from "../study-room/StudyRoomSections";
import {
  FocusTimerModal,
  NotesModal,
  MusicPlayerModal,
  CustomizationModal,
  ReportCardModal,
  DailyReviewModal,
  MiniGamesModal,
} from "../study-room/StudyRoomModals";
import { ThemedBackground } from "../study-room/ThemedBackground";
import { VirtualPet } from "../study-room/VirtualPet";
import { RoomShopModal, SoundMixer } from "../study-room/RoomShop";
import { useCelebration } from "../useCelebration";
import { IntakeFlow } from "./IntakeFlow";

type Lesson = {
  introduction?: string;
  keyConcepts?: { title: string; explanation: string }[];
  examples?: { title: string; problem: string; steps: string[]; answer: string }[];
  formulas?: string[];
  summary?: string;
};

type TopicDetail = Awaited<ReturnType<typeof api.getTopic>>;

type PracticeTab = "flashcards" | "quiz" | "solver";
type ChatMsg = { role: "user" | "assistant"; content: string; image?: string; attachments?: any[] };
type WorkStroke = { d: string; color: string; width: number };

const COLLAPSE_KEYS = ["intro", "concepts", "examples", "formulas", "summary"] as const;
type CollapseKey = (typeof COLLAPSE_KEYS)[number];

export function StudyRoom() {
  const { activeTopicId, setScreen, setActiveTopicId, setActiveConceptMapId, openCreate } = useApp();

  const [topicData, setTopicData] = useState<TopicDetail | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [lessonLoading, setLessonLoading] = useState(false);
  const [lessonError, setLessonError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<CollapseKey>>(new Set(["concepts", "examples", "formulas"]));
  const [favorite, setFavorite] = useState(false);

  const [practiceTab, setPracticeTab] = useState<PracticeTab>("flashcards");
  const [practiceCards, setPracticeCards] = useState<Card[]>([]);
  const [practiceLoading, setPracticeLoading] = useState(false);
  const [practiceError, setPracticeError] = useState<string | null>(null);
  const [generatingCards, setGeneratingCards] = useState(false);
  const [genStatus, setGenStatus] = useState<string | null>(null);

  // concept map state
  const [existingConceptMap, setExistingConceptMap] = useState<{ id: string; title: string } | null>(null);
  const [conceptMapSettings, setConceptMapSettings] = useState<{ tokenCost: number; enabled: boolean } | null>(null);

  // flashcard practice state
  const [fcIdx, setFcIdx] = useState(0);
  const [fcFlipped, setFcFlipped] = useState(false);
  const [fcSubmitting, setFcSubmitting] = useState(false);

  // quiz state
  const [quizIdx, setQuizIdx] = useState(0);
  const [quizSelected, setQuizSelected] = useState<number | null>(null);
  const [quizSubmitting, setQuizSubmitting] = useState(false);
  const [quizCorrect, setQuizCorrect] = useState(0);
  const [quizDone, setQuizDone] = useState(false);

  // solver state
  const [problem, setProblem] = useState("");
  const [solution, setSolution] = useState<Awaited<ReturnType<typeof api.solveStepByStep>> | null>(null);
  const [solving, setSolving] = useState(false);
  const [solverError, setSolverError] = useState<string | null>(null);

  // tutor chat state
  const [tutorOpen, setTutorOpen] = useState(false);

  // Phase 12b — extended room state + modal management
  const [roomData, setRoomData] = useState<any>(null);
  const [showFocusTimer, setShowFocusTimer] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showMusic, setShowMusic] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showDailyReview, setShowDailyReview] = useState(false);
  const [showMiniGames, setShowMiniGames] = useState(false);
  // Phase 15 — visual overhaul
  const [showShop, setShowShop] = useState(false);
  const [showSoundMixer, setShowSoundMixer] = useState(false);
  const [coinBalance, setCoinBalance] = useState(0);
  const [viewingMaterial, setViewingMaterial] = useState<{ title: string; text: string } | null>(null);
  const celebration = useCelebration();
  // Phase 16 — intake flow
  const [showIntake, setShowIntake] = useState(false);
  const [workStrokes, setWorkStrokes] = useState<WorkStroke[]>([]);
  const [workTool, setWorkTool] = useState<"pen" | "line" | "circle">("pen");
  const [workColor, setWorkColor] = useState("#30334a");
  const [workSaving, setWorkSaving] = useState(false);
  const [workChecks, setWorkChecks] = useState(0);
  const [computerTask, setComputerTask] = useState<any>(null);
  const workStrokeRef = useRef<{ tool: "pen" | "line" | "circle"; start: { x: number; y: number }; points: { x: number; y: number }[]; color: string } | null>(null);
  const workSvgRef = useRef<SVGSVGElement>(null);

  // Fetch Phase 12b extended room data
  useEffect(() => {
    if (!activeTopicId) return;
    fetch(`/api/study-room/${activeTopicId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d) {
          setRoomData(d);
          // Phase 16: check intake status
          if (d.room && d.room.intakeCompleted === false) {
            setShowIntake(true);
          } else {
            setShowIntake(false);
          }
        }
      })
      .catch(() => {});
    // Fetch Phase 15 balances for coin display in shop
    fetch("/api/user/balances")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d && typeof d.coins === "number") setCoinBalance(d.coins); })
      .catch(() => {});
  }, [activeTopicId]);

  useEffect(() => {
    if (!activeTopicId) return;
    let active = true;
    fetch(`/api/study-room/${activeTopicId}/workspace`)
      .then((r) => r.ok ? r.json() : null)
      .then(async (d) => {
        if (!active || !d) return;
        setWorkStrokes(Array.isArray(d.strokes) ? d.strokes : []);
        setWorkChecks(Number(d.progress?.workChecks) || 0);
        let pending: any = null;
        try {
          const raw = window.localStorage.getItem("studybuddy.pendingComputerWorkspace");
          const parsed = raw ? JSON.parse(raw) : null;
          if (parsed && (!parsed.topicId || parsed.topicId === activeTopicId)) pending = parsed;
        } catch {}
        if (pending) {
          const saved = await fetch(`/api/study-room/${activeTopicId}/workspace`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: "set_computer_task", computerTask: pending }) }).catch(() => null);
          if (saved?.ok) window.localStorage.removeItem("studybuddy.pendingComputerWorkspace");
        }
        if (active) setComputerTask(pending || d.progress?.computerTask || null);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [activeTopicId]);

  const handleToolClick = (tool: string) => {
    switch (tool) {
      case "graph": setScreen("graph"); break;
      case "flashcards": setScreen("flashcards"); break;
      case "quiz": setScreen("quiz"); break;
      case "conceptMap":
        if (existingConceptMap) {
          (useApp.getState() as any).setActiveConceptMapId(existingConceptMap.id);
          setScreen("conceptMap");
        } else {
          (useApp.getState() as any).setActiveConceptMapId(null);
          setScreen("conceptMap");
        }
        break;
      case "whiteboard": setScreen("graph"); break;
      case "focus": setShowFocusTimer(true); break;
      case "notes": setShowNotes(true); break;
      case "music": setShowMusic(true); break;
      case "games": setShowMiniGames(true); break;
      case "classroom": setScreen("classroom"); break;
    }
  };

  const updateDailyGoals = async (tasks: any[]) => {
    try {
      await fetch("/api/daily-goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks }),
      });
      // Refresh room data
      if (activeTopicId) {
        const r = await fetch(`/api/study-room/${activeTopicId}`);
        const d = await r.json();
        if (r.ok) setRoomData(d);
      }
    } catch {}
  };

  const openResource = (resource: any) => {
    if ((resource._count?.cards ?? 0) > 0) {
      (useApp.getState() as any).setActiveStudySetId(resource.id);
      setScreen("flashcards");
      return;
    }
    fetch(`/api/study-sets/${resource.id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.studySet) setViewingMaterial({ title: d.studySet.title, text: d.studySet.sourceText ?? "No extracted source text is available." }); })
      .catch(() => {});
  };
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatConversationId, setChatConversationId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatActivity, setChatActivity] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeTopicId) return;
    let mounted = true;
    const restore = async () => {
      const savedId = window.localStorage.getItem(`studybuddy-room-chat.${activeTopicId}`);
      if (!savedId) { setChatMessages([]); setChatConversationId(null); return; }
      try {
        const response = await fetch(`/api/tutor/conversations?id=${encodeURIComponent(savedId)}`);
        const data = await response.json();
        if (!mounted || !response.ok || !data.conversation) return;
        setChatConversationId(data.conversation.id);
        setChatMessages((data.conversation.messages || []).filter((m: any) => m.role === "user" || m.role === "assistant").map((m: any) => ({ role: m.role, content: m.content })));
      } catch {}
    };
    void restore();
    return () => { mounted = false; };
  }, [activeTopicId]);

  // ===== Load topic + lesson on mount =====
  useEffect(() => {
    if (!activeTopicId) {
      setScreen("home");
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const td = await api.getTopic(activeTopicId);
        if (!mounted) return;
        setTopicData(td);
      } catch (e: any) {
        if (!mounted) return;
        setLessonError(e?.message ?? "Failed to load topic");
      }
    })();
    return () => {
      mounted = false;
    };
  }, [activeTopicId, setScreen]);

  // Load lesson
  useEffect(() => {
    if (!activeTopicId) return;
    let mounted = true;
    (async () => {
      setLessonLoading(true);
      setLessonError(null);
      try {
        const r = await api.getTopicLesson(activeTopicId, { level: "beginner" });
        if (!mounted) return;
        setLesson(r.lesson);
      } catch (e: any) {
        if (!mounted) return;
        setLessonError(e?.message ?? "Failed to load lesson");
      } finally {
        if (mounted) setLessonLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [activeTopicId]);

  // Load practice cards
  const loadPractice = async () => {
    if (!activeTopicId) return;
    setPracticeLoading(true);
    setPracticeError(null);
    try {
      const r = await api.getTopicPractice(activeTopicId, 20);
      setPracticeCards(r.cards);
      setFcIdx(0);
      setFcFlipped(false);
      setQuizIdx(0);
      setQuizSelected(null);
      setQuizCorrect(0);
      setQuizDone(false);
    } catch (e: any) {
      setPracticeError(e?.message ?? "Failed to load practice");
    } finally {
      setPracticeLoading(false);
    }
  };

  useEffect(() => {
    if (activeTopicId) loadPractice();
  }, [activeTopicId]);

  // Concept map: fetch settings + check if a public map exists for this topic
  useEffect(() => {
    fetch("/api/concept-maps/settings")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d) setConceptMapSettings({ tokenCost: d.tokenCost ?? 300, enabled: d.enabled ?? true });
      })
      .catch(() => {});

    if (!activeTopicId || !topicData?.topic?.name) return;
    // Look up public concept maps matching this topic name
    fetch(`/api/concept-maps`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d) return;
        const matches = [...(d.maps ?? []), ...(d.publicMaps ?? [])].filter((m: any) =>
          m.title?.toLowerCase().includes(topicData.topic.name.toLowerCase())
        );
        if (matches.length > 0) {
          setExistingConceptMap({ id: matches[0].id, title: matches[0].title });
        }
      })
      .catch(() => {});
  }, [activeTopicId, topicData?.topic?.name]);

  const generateOrViewConceptMap = () => {
    if (existingConceptMap) {
      setActiveConceptMapId(existingConceptMap.id);
      setScreen("conceptMap");
    } else {
      // Open the create-new flow — the ConceptMapScreen will pre-fill the topic
      setActiveConceptMapId(null);
      setScreen("conceptMap");
    }
  };

  // chat auto-scroll
  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chatMessages, chatBusy]);

  if (!activeTopicId) return null;

  // Phase 16: show IntakeFlow if intake not completed
  if (showIntake && activeTopicId) {
    return (
      <IntakeFlow
        topicId={activeTopicId}
        topicName={topicData?.topic?.name ?? roomData?.topic?.name ?? "this topic"}
        onRedirectToClassroom={(sessionId) => {
          (useApp.getState() as any).setActiveClassroomSessionId(sessionId);
          setScreen("classroom");
        }}
      />
    );
  }

  const topic = topicData?.topic;
  const masteryPct = topicData ? Math.round(topicData.mastery.level * 100) : 0;
  const isMath = topic ? /math|algebra|geometry|calculus|trigonometry|statistics|graph|equation/i.test(topic.subject + " " + topic.name) : false;
  const isLanguage = topic ? /language|english|kiswahili|swahili|chinese|french|spanish|arabic|greeting|vocabulary/i.test(topic.subject + " " + topic.name) : false;

  const flashcards = practiceCards.filter((c) => c.cardType === "flashcard");
  const mcqs = practiceCards.filter((c) => c.cardType === "mcq");

  // ===== Handlers =====
  const toggleCollapse = (k: CollapseKey) => {
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const regenerateLesson = async () => {
    if (!activeTopicId) return;
    setLessonLoading(true);
    setLessonError(null);
    try {
      const r = await api.getTopicLesson(activeTopicId, { level: "beginner", regenerate: true });
      setLesson(r.lesson);
    } catch (e: any) {
      setLessonError(e?.message ?? "Failed to regenerate");
    } finally {
      setLessonLoading(false);
    }
  };

  // Flashcard submit
  const submitFlashcard = async (quality: 0 | 5) => {
    if (!flashcards[fcIdx] || fcSubmitting) return;
    setFcSubmitting(true);
    try {
      await api.submitReview({ cardId: flashcards[fcIdx].id, quality });
      if (fcIdx + 1 < flashcards.length) {
        setFcIdx((i) => i + 1);
        setFcFlipped(false);
      } else {
        // restart loop for demo
        setFcIdx(0);
        setFcFlipped(false);
      }
    } catch (e: any) {
      setPracticeError(e?.message ?? "Submit failed");
    } finally {
      setFcSubmitting(false);
    }
  };

  // Quiz select
  const handleQuizSelect = (i: number) => {
    if (quizSelected !== null || quizSubmitting) return;
    setQuizSelected(i);
    const correct = i === mcqs[quizIdx].correctIndex;
    if (correct) setQuizCorrect((c) => c + 1);
    setQuizSubmitting(true);
    api
      .recordAttempt({
        cardId: mcqs[quizIdx].id,
        selectedIndex: i,
        isCorrect: correct,
      })
      .catch(() => {})
      .finally(() => setQuizSubmitting(false));
  };

  const nextQuiz = () => {
    if (quizIdx + 1 < mcqs.length) {
      setQuizIdx((i) => i + 1);
      setQuizSelected(null);
    } else {
      setQuizDone(true);
    }
  };

  // Solver
  const solve = async () => {
    if (!problem.trim() || solving) return;
    setSolving(true);
    setSolverError(null);
    setSolution(null);
    try {
      const r = await api.solveStepByStep(activeTopicId!, problem);
      setSolution(r);
    } catch (e: any) {
      setSolverError(e?.message ?? "Solver failed");
    } finally {
      setSolving(false);
    }
  };

  // Tutor chat
  const sendChat = async (text?: string, image?: string) => {
    const q = (text ?? chatInput).trim();
    if ((!q && !image) || chatBusy || !activeTopicId) return;
    setChatInput(""); setChatBusy(true); setChatError(null); setChatActivity("Connecting to your room tutor…");
    const next: ChatMsg[] = [...chatMessages, { role: "user", content: q || "Please check my drawing.", ...(image ? { image } : {}) }];
    setChatMessages([...next, { role: "assistant", content: "" }]);
    try {
      const response = await fetch("/api/tutor/chat/stream", {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ message: q || "Please check my drawing.", conversationId: chatConversationId, studyRoomTopicId: activeTopicId, clientPlatform: "web", ...(image ? { image } : {}) }),
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "The room tutor could not review this yet.");
      }
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let streamed = ""; let final: any = null; let nextConversationId = chatConversationId;
      const consume = (raw: string) => {
        let event = "message"; const rows: string[] = [];
        for (const line of raw.split("\n")) { if (line.startsWith("event:")) event = line.slice(6).trim(); else if (line.startsWith("data:")) rows.push(line.slice(5).trim()); }
        if (!rows.length) return;
        let payload: any; try { payload = JSON.parse(rows.join("\n")); } catch { return; }
        if (event === "meta") nextConversationId = payload.conversationId || nextConversationId;
        else if (event === "status") setChatActivity(payload.text || "Your tutor is working…");
        else if (event === "delta") { streamed += payload.text || ""; setChatMessages([...next, { role: "assistant", content: streamed.replace(/<thinking>[\s\S]*?(?:<\/thinking>|$)/gi, "").replace(/```computer_workspace[\s\S]*(?:```|$)/gi, "").replace(/```(?:mathgraph|conceptmap|examgen)[\s\S]*(?:```|$)/gi, "").trim() }]); }
        else if (event === "done") final = payload;
        else if (event === "error") throw new Error(payload.error || "The tutor could not answer.");
      };
      while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); let index = buffer.indexOf("\n\n"); while (index >= 0) { const raw = buffer.slice(0, index); buffer = buffer.slice(index + 2); if (raw.trim()) consume(raw); index = buffer.indexOf("\n\n"); } }
      if (!final) throw new Error("The tutor stream ended before the review was saved.");
      nextConversationId = final.conversationId || nextConversationId;
      if (nextConversationId) { setChatConversationId(nextConversationId); window.localStorage.setItem(`studybuddy-room-chat.${activeTopicId}`, nextConversationId); }
      setChatMessages([...next, { role: "assistant", content: final.reply || streamed || "I could not read enough detail to check this work. Try a clearer drawing or add a question.", attachments: Array.isArray(final.attachments) ? final.attachments : [] }]);
    } catch (e: any) { setChatError(e?.message ?? "Tutor failed"); setChatMessages(next); }
    finally { setChatBusy(false); setChatActivity(""); }
  };

  const workPoint = (event: React.PointerEvent<SVGSVGElement>) => {
    const svg = event.currentTarget; const bounds = svg.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1000, (event.clientX - bounds.left) / bounds.width * 1000)), y: Math.max(0, Math.min(560, (event.clientY - bounds.top) / bounds.height * 560)) };
  };
  const beginWorkStroke = (event: React.PointerEvent<SVGSVGElement>) => {
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    const point = workPoint(event); workStrokeRef.current = { tool: workTool, start: point, points: [point], color: workColor };
    if (workTool === "pen") setWorkStrokes((strokes) => [...strokes, { d: `M${point.x.toFixed(1)} ${point.y.toFixed(1)}`, color: workColor, width: 4 }]);
  };
  const moveWorkStroke = (event: React.PointerEvent<SVGSVGElement>) => {
    const current = workStrokeRef.current; if (!current) return;
    current.points.push(workPoint(event));
    if (current.tool === "pen") setWorkStrokes((strokes) => [...strokes.slice(0, -1), { d: current.points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" "), color: current.color, width: 4 }]);
  };
  const saveWorkStrokes = async (strokes: WorkStroke[]) => {
    setWorkSaving(true);
    try { const response = await fetch(`/api/study-room/${activeTopicId}/workspace`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ strokes }) }); if (!response.ok) throw new Error("Could not save your drawing."); }
    catch (error) { setChatError(error instanceof Error ? error.message : "Could not save your drawing."); }
    finally { setWorkSaving(false); }
  };
  const endWorkStroke = (event: React.PointerEvent<SVGSVGElement>) => {
    const current = workStrokeRef.current; if (!current) return; const end = workPoint(event); let d = "";
    if (current.tool === "pen") d = current.points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
    else if (current.tool === "line") d = `M${current.start.x} ${current.start.y} L${end.x} ${end.y}`;
    else { const radius = Math.max(2, Math.hypot(end.x - current.start.x, end.y - current.start.y)); d = `M${current.start.x} ${current.start.y-radius} A${radius} ${radius} 0 1 0 ${current.start.x} ${current.start.y+radius} A${radius} ${radius} 0 1 0 ${current.start.x} ${current.start.y-radius}`; }
    workStrokeRef.current = null;
    const next = [...workStrokes.slice(0, current.tool === "pen" ? -1 : workStrokes.length), { d, color: current.color, width: 4 }].filter((stroke) => stroke.d);
    setWorkStrokes(next); void saveWorkStrokes(next);
  };
  const clearWorkBoard = () => { setWorkStrokes([]); void saveWorkStrokes([]); };
  const checkWorkBoard = async () => {
    if (!workStrokes.length || workSaving) return;
    setWorkSaving(true); setChatError(null);
    try {
      const paths = workStrokes.map((stroke) => `<path d="${stroke.d}" fill="none" stroke="${stroke.color}" stroke-width="${stroke.width}" stroke-linecap="round" stroke-linejoin="round"/>`).join("");
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="560" viewBox="0 0 1000 560"><rect width="1000" height="560" fill="#ffffff"/>${paths}</svg>`;
      const response = await fetch(`/api/study-room/${activeTopicId}/drawing-image`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ svg }) });
      const data = await response.json(); if (!response.ok || !data.image) throw new Error(data.error || "Could not prepare the drawing for the tutor.");
      const checkResponse = await fetch(`/api/study-room/${activeTopicId}/workspace`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: "work_checked" }) });
      if (!checkResponse.ok) throw new Error("The drawing was ready, but its room progress could not be saved.");
      const checkData = await checkResponse.json(); setWorkChecks(Number(checkData.progress?.workChecks) || workChecks);
      setTutorOpen(true);
      await sendChat(`Check my work for ${topic?.name || "this lesson"}. Tell me what is correct, identify any error you can see, and show me what to do next.`, data.image);
    } catch (error) { setChatError(error instanceof Error ? error.message : "The tutor could not review this drawing."); setTutorOpen(true); }
    finally { setWorkSaving(false); }
  };

  // Generate practice cards on the fly when none exist
  const generatePracticeCards = async () => {
    if (!activeTopicId || !topic || generatingCards) return;
    setGeneratingCards(true);
    setGenStatus(null);
    try {
      // Step 1: Generate via AI (not saved yet)
      setGenStatus("Generating cards with AI…");
      const gen = await api.generateCards({
        text: `Topic: ${topic.name}. Subject: ${topic.subject}. Generate study cards covering the key concepts of ${topic.name}.`,
        numFlashcards: 5,
        numMCQs: 5,
        subject: topic.subject,
        topic: topic.name,
      });
      // Step 2: Save as a study set linked to this topic
      setGenStatus("Saving to database…");
      const cardsToSave = [
        ...gen.flashcards.map((c) => ({
          cardType: "flashcard" as const,
          front: c.front,
          back: c.back,
          question: null,
          options: null,
          correctIndex: null,
          explanation: null,
        })),
        ...gen.mcqs.map((c) => ({
          cardType: "mcq" as const,
          front: null,
          back: null,
          question: c.question,
          options: c.options,
          correctIndex: c.correct_index,
          explanation: c.explanation,
        })),
      ];
      // We need to pass topicId — but the /api/study-sets POST doesn't accept it yet.
      // For we'll save via /api/study-sets and then patch each card's topicId via the practice endpoint.
      const res = await api.createStudySet({
        title: `${topic.name} practice`,
        sourceType: "text",
        sourceText: `Practice set for ${topic.name}`,
        subject: topic.subject,
        topic: topic.name,
        generate: false,
        cards: cardsToSave,
      });
      // Update each card's topicId via a follow-up — for now, the practice endpoint
      // will find them via subject+topic string match, which works.
      void res;
      setGenStatus(`Generated ${cardsToSave.length} cards!`);
      setTimeout(() => setGenStatus(null), 3000);
      await loadPractice();
    } catch (e: any) {
      setGenStatus(`Failed: ${e?.message ?? "Unknown error"}`);
    } finally {
      setGeneratingCards(false);
    }
  };

  // ===== Render =====
  if (!topicData) {
    return (
      <div className="min-h-screen max-w-3xl mx-auto flex items-center justify-center text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span className="ml-2 text-sm">Loading study room…</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen max-w-7xl mx-auto relative bg-slate-50/50">
      {/* Phase 15 — themed animated background */}
      <ThemedBackground theme={roomData?.room?.roomTheme ?? "cozy_library"} />
      {/* Phase 12b — Immersive cover banner */}
      {roomData?.room && (
        <StudyRoomHeader
          room={roomData.room}
          analytics={roomData.analytics}
          gamification={roomData.gamification}
          onStartReview={() => setShowDailyReview(true)}
          onCustomize={() => setShowCustomize(true)}
          onReport={() => setShowReport(true)}
          onNotifications={() => setShowDailyReview(true)}
        />
      )}

      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="px-4 h-14 flex items-center justify-between">
          <button
            onClick={() => {
              setActiveTopicId(null);
              setScreen("home");
            }}
            aria-label="Back"
            className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-700"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0 px-3">
            <p className="text-[11px] uppercase tracking-wide text-gray-500 truncate">{topic?.subject}</p>
            <h1 className="text-base font-bold text-gray-900 truncate">{topic?.name}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => openCreate("room")} className="h-9 px-3 rounded-full bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-semibold flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Add material</span>
            </button>
            <button onClick={() => setScreen("classroom")} className="h-9 px-3 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 text-xs font-semibold flex items-center gap-1.5">
              <BookOpen className="w-4 h-4" /> <span className="hidden sm:inline">Start lesson</span>
            </button>
            <button
              onClick={() => setFavorite((f) => !f)}
              aria-label="Favorite"
              className={`w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center ${favorite ? "text-rose-500" : "text-gray-400"}`}
            >
              <Heart className={`w-5 h-5 ${favorite ? "fill-rose-500" : ""}`} />
            </button>
          </div>
        </div>
        {/* mastery bar */}
        <div className="px-4 pb-2">
          <div className="flex items-center justify-between text-[11px] mb-0.5">
            <span className="text-gray-500">
              {masteryPct >= 80 ? "Mastered" : masteryPct >= 60 ? "Getting there" : masteryPct > 0 ? "Needs work" : "Just started"} · {topicData.mastery.totalAttempts} attempts
            </span>
            <span className="font-semibold text-gray-900">{masteryPct}%</span>
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                masteryPct >= 80 ? "bg-emerald-500" : masteryPct >= 60 ? "bg-amber-500" : "bg-indigo-600"
              }`}
              style={{ width: `${masteryPct}%` }}
            />
          </div>
        </div>
      </header>

      {computerTask && (
        <section className="mx-4 mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 md:mx-6">
          <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-600">Continue your computer activity</p>
          <h2 className="mt-1 text-sm font-bold text-gray-900">{computerTask.title}</h2>
          <p className="mt-2 text-xs leading-5 text-gray-700">{computerTask.reason}</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-indigo-800">Why this workspace helps: {computerTask.benefit}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => {
              if (computerTask.workspace === "exam") setScreen("examHub");
              else if (computerTask.workspace === "code") setScreen("codeRunner");
              else if (computerTask.workspace === "web") setScreen("webBuilder");
              else if (computerTask.workspace === "modeling") setScreen("mlPlayground");
              else if (computerTask.workspace === "simulation") setScreen("lab");
              else if (computerTask.workspace === "data") setScreen("notebook");
              else if (computerTask.workspace === "tvet") setScreen("tvetBuddy");
              else if (computerTask.workspace === "computer") setTutorOpen(true);
              else if (computerTask.workspace === "study") window.scrollTo({ top: 0, behavior: "smooth" });
              else document.getElementById("study-room-work-board")?.scrollIntoView({ behavior: "smooth", block: "center" });
            }} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-700">Open activity workspace</button>
            <button onClick={async () => {
              const response = await fetch(`/api/study-room/${activeTopicId}/workspace`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: "clear_computer_task" }) });
              if (response.ok) setComputerTask(null);
            }} className="rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-xs font-semibold text-gray-600">Dismiss</button>
          </div>
        </section>
      )}

      <div className="px-4 py-5 md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)] md:items-start md:gap-6 lg:gap-8 md:pb-32">
        {/* LEFT COLUMN — Lesson + Interactive tools */}
        <div className="space-y-4">
          {/* Lesson */}
          <section className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-indigo-600" /> Lesson
              </h2>
              <button
                onClick={regenerateLesson}
                disabled={lessonLoading}
                className="text-[11px] font-medium text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-full flex items-center gap-1 disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${lessonLoading ? "animate-spin" : ""}`} />
                Regenerate
              </button>
            </div>

            {lessonLoading && !lesson && (
              <div className="py-8 flex flex-col items-center text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin" />
                <p className="mt-2 text-xs">AI is writing the lesson…</p>
              </div>
            )}

            {lessonError && !lessonLoading && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{lessonError}</span>
              </div>
            )}

            {lesson && !lessonLoading && (
              <div className="space-y-2">
                {/* Intro */}
                <LessonSection
                  open={!collapsed.has("intro")}
                  onToggle={() => toggleCollapse("intro")}
                  icon={Sparkles}
                  color="bg-indigo-50 text-indigo-600"
                  title="Introduction"
                >
                  <p className="text-sm text-gray-700 leading-relaxed">{lesson.introduction ?? "—"}</p>
                </LessonSection>

                {/* Key Concepts */}
                {lesson.keyConcepts && lesson.keyConcepts.length > 0 && (
                  <LessonSection
                    open={!collapsed.has("concepts")}
                    onToggle={() => toggleCollapse("concepts")}
                    icon={Target}
                    color="bg-emerald-50 text-emerald-600"
                    title={`Key Concepts (${lesson.keyConcepts.length})`}
                  >
                    <div className="space-y-2">
                      {lesson.keyConcepts.map((c, i) => (
                        <div key={i} className="rounded-xl bg-gray-50 p-2.5">
                          <p className="text-xs font-semibold text-gray-900">{c.title}</p>
                          <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{c.explanation}</p>
                        </div>
                      ))}
                    </div>
                  </LessonSection>
                )}

                {/* Formulas (math) */}
                {isMath && lesson.formulas && lesson.formulas.length > 0 && (
                  <LessonSection
                    open={!collapsed.has("formulas")}
                    onToggle={() => toggleCollapse("formulas")}
                    icon={Sigma}
                    color="bg-violet-50 text-violet-600"
                    title="Key Formulas"
                  >
                    <div className="space-y-1.5">
                      {lesson.formulas.map((f, i) => (
                        <div key={i} className="p-2 rounded-lg bg-violet-50 text-violet-800 text-sm font-mono text-center">
                          {f}
                        </div>
                      ))}
                    </div>
                  </LessonSection>
                )}

                {/* Examples */}
                {lesson.examples && lesson.examples.length > 0 && (
                  <LessonSection
                    open={!collapsed.has("examples")}
                    onToggle={() => toggleCollapse("examples")}
                    icon={Lightbulb}
                    color="bg-amber-50 text-amber-600"
                    title={`Worked Examples (${lesson.examples.length})`}
                  >
                    <div className="space-y-2">
                      {lesson.examples.map((ex, i) => (
                        <div key={i} className="rounded-xl bg-gray-50 p-2.5">
                          <p className="text-xs font-semibold text-gray-900">{ex.title}</p>
                          <p className="text-xs text-gray-600 mt-0.5">{ex.problem}</p>
                          <ol className="mt-1.5 space-y-1">
                            {ex.steps.map((s, j) => (
                              <li key={j} className="text-xs text-gray-700 flex gap-2">
                                <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold flex-shrink-0">
                                  {j + 1}
                                </span>
                                <span>{s}</span>
                              </li>
                            ))}
                          </ol>
                          {ex.answer && (
                            <p className="mt-1.5 text-xs font-semibold text-emerald-700">
                              Answer: {ex.answer}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </LessonSection>
                )}

                {/* Summary */}
                <LessonSection
                  open={!collapsed.has("summary")}
                  onToggle={() => toggleCollapse("summary")}
                  icon={Check}
                  color="bg-emerald-50 text-emerald-600"
                  title="Summary"
                >
                  <p className="text-sm text-gray-700 leading-relaxed">{lesson.summary ?? "—"}</p>
                </LessonSection>
              </div>
            )}
          </section>

          <section id="study-room-work-board" className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5"><Pencil className="w-4 h-4 text-indigo-600" /> My work board</h2>
                <p className="text-[11px] text-gray-500 mt-1">Try the question yourself. Your drawing saves in this room.</p>
              </div>
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-semibold text-indigo-700">{workChecks} checks sent</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {(["pen", "line", "circle"] as const).map((tool) => <button key={tool} onClick={() => setWorkTool(tool)} className={`rounded-full px-3 py-1.5 text-[11px] font-semibold ${workTool === tool ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-indigo-50"}`}>{tool === "pen" ? "Pen" : tool === "line" ? "Straight line" : "Circle"}</button>)}
              {(["#30334a", "#6657e8", "#d85757", "#25856b", "#e39b31"] as const).map((color) => <button key={color} onClick={() => setWorkColor(color)} aria-label={`Choose ${color}`} className={`w-6 h-6 rounded-full border-2 ${workColor === color ? "border-indigo-400 scale-110" : "border-white shadow"}`} style={{ backgroundColor: color }} />)}
              <button onClick={() => { const next = workStrokes.slice(0, -1); setWorkStrokes(next); void saveWorkStrokes(next); }} disabled={!workStrokes.length || workSaving} className="ml-auto rounded-full border border-gray-200 px-3 py-1.5 text-[11px] font-semibold text-gray-600 disabled:opacity-40">Undo</button>
              <button onClick={clearWorkBoard} disabled={!workStrokes.length || workSaving} className="rounded-full border border-gray-200 px-3 py-1.5 text-[11px] font-semibold text-rose-600 disabled:opacity-40">Clear</button>
            </div>
            <svg ref={workSvgRef} viewBox="0 0 1000 560" preserveAspectRatio="none" className="w-full aspect-[16/9] max-h-[420px] rounded-xl border border-gray-200 bg-white touch-none select-none cursor-crosshair" onPointerDown={beginWorkStroke} onPointerMove={moveWorkStroke} onPointerUp={endWorkStroke} onPointerCancel={endWorkStroke}>
              <rect width="1000" height="560" fill="white" />
              <path d={Array.from({ length: 20 }, (_, i) => `M${i * 50} 0V560`).join(" ") + " " + Array.from({ length: 12 }, (_, i) => `M0 ${i * 50}H1000`).join(" ")} stroke="#edf0f6" strokeWidth="1" />
              {workStrokes.map((stroke, index) => <path key={index} d={stroke.d} fill="none" stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" />)}
            </svg>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={checkWorkBoard} disabled={!workStrokes.length || workSaving} className="h-10 px-4 rounded-full bg-indigo-600 text-white text-xs font-semibold flex items-center gap-2 hover:bg-indigo-700 disabled:opacity-50">{workSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Check my work</button>
              <button onClick={() => { setTutorOpen(true); void sendChat("I am stuck. Give me one small hint for the current lesson, then wait for me to try."); }} disabled={chatBusy} className="h-10 px-4 rounded-full bg-amber-50 text-amber-800 text-xs font-semibold flex items-center gap-2 hover:bg-amber-100"><Lightbulb className="w-4 h-4" /> I’m stuck</button>
              <span className="self-center text-[10px] text-gray-500">{workSaving ? "Saving to this room…" : "Saved to this room"}</span>
            </div>
          </section>

          {/* Interactive tools (math only — graph inline) */}
          {isMath && (
            <section className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-3">
                <Pencil className="w-4 h-4 text-sky-600" /> Interactive Graph
              </h2>
              <p className="text-xs text-gray-500 mb-2">
                Tap below to draw an equation related to this topic. Opens the full Graph Explorer.
              </p>
              <button
                onClick={() => setScreen("graph")}
                className="w-full h-10 rounded-full bg-sky-50 text-sky-700 font-semibold text-sm hover:bg-sky-100 flex items-center justify-center gap-1.5"
              >
                <Pencil className="w-4 h-4" /> Open Graph Explorer
              </button>
            </section>
          )}

          {/* Related topics */}
          {topicData.relatedTopics.length > 0 && (
            <section className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 mb-3">
                <ChevronRight className="w-4 h-4 text-indigo-600" /> Related Topics
              </h2>
              <div className="space-y-1.5">
                {topicData.relatedTopics.map((t) => (
                  <button
                    key={t.id}
                    onClick={async () => {
                      setActiveTopicId(t.id);
                      setScreen("study");
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-indigo-50/40 text-left"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">{t.name}</p>
                      <p className="text-[11px] text-gray-500">{t.subject}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* RIGHT COLUMN — Practice + Tutor */}
        <div className="mt-6 md:mt-0 space-y-4 md:sticky md:top-24 md:max-h-[calc(100vh-7rem)] md:overflow-y-auto md:pb-4">
          {/* Phase 12b — AI Teacher quick card */}
          {roomData?.room && (
            <AITeacherCard
              room={roomData.room}
              onAsk={() => setTutorOpen(true)}
              onStartReview={() => setShowDailyReview(true)}
              onOpenChat={() => setTutorOpen(true)}
            />
          )}

          {/* Phase 12b — Daily Goals checklist */}
          {roomData?.dailyGoals?.tasks?.length > 0 && (
            <DailyGoalsChecklist
              goals={roomData.dailyGoals}
              onUpdate={updateDailyGoals}
            />
          )}

          {/* Phase 15 — Virtual Pet */}
          {roomData?.room && (
            <div className="flex justify-center py-2">
              <VirtualPet
                pet={roomData.room.petInfo ?? null}
                onFeed={async () => {
                  try {
                    const r = await fetch("/api/pets/feed", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ userPetId: roomData.room.petInfo?.id }),
                    });
                    if (r.ok) celebration.sparkles();
                  } catch {}
                }}
                isIdle={false}
              />
            </div>
          )}

          {/* Phase 15 — Customize + Sound Mixer buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => setShowShop(true)}
              className="flex-1 h-9 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold hover:bg-amber-200 flex items-center justify-center gap-1"
            >
              <ShoppingBag className="w-3.5 h-3.5" /> Shop
            </button>
            <button
              onClick={() => setShowSoundMixer(true)}
              className="flex-1 h-9 rounded-full bg-purple-100 text-purple-700 text-xs font-semibold hover:bg-purple-200 flex items-center justify-center gap-1"
            >
              <Volume2 className="w-3.5 h-3.5" /> Sound
            </button>
          </div>

          {/* Phase 12b — Tools Workbench */}
          <ToolsWorkbench onTool={handleToolClick} />

          {/* Phase 12b — Bulletin Board */}
          {roomData?.analytics && roomData?.gamification && (
            <BulletinBoard
              analytics={roomData.analytics}
              gamification={roomData.gamification}
              onReport={() => setShowReport(true)}
            />
          )}

          {/* Source materials now live in the room and ground generated lessons. */}
          <section className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5"><Layers className="w-4 h-4 text-indigo-600" /> Study materials</h2>
                <p className="mt-1 text-xs text-gray-500">Add notes, PDFs, or Word documents. Lessons and check-in questions use these sources.</p>
              </div>
              <button onClick={() => openCreate("room")} className="shrink-0 px-3 py-2 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold hover:bg-indigo-100">+ Add</button>
            </div>
            {roomData?.resources?.studySets?.length ? (
              <div className="space-y-2">
                {roomData.resources.studySets.map((resource: any) => (
                  <button key={resource.id} onClick={() => openResource(resource)} className="w-full flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3 text-left hover:bg-indigo-50/60">
                    <span className="w-9 h-9 rounded-xl bg-white text-indigo-600 flex items-center justify-center"><FileText className="w-4 h-4" /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-gray-900">{resource.title}</span><span className="block text-[10px] text-gray-500">{resource.sourceType?.toUpperCase() || "NOTES"} · {resource._count?.cards ?? 0} practice items</span></span>
                  </button>
                ))}
              </div>
            ) : (
              <button onClick={() => openCreate("room")} className="w-full rounded-xl border border-dashed border-indigo-200 bg-indigo-50/50 p-4 text-center text-xs font-semibold text-indigo-700">Add the first source material to this room</button>
            )}
          </section>

          {/* Phase 12b — Bookshelf of concept maps */}
          {roomData?.resources?.conceptMaps?.length > 0 && (
            <Bookshelf
              title="Concept Maps"
              resources={roomData.resources.conceptMaps}
              onOpen={(r) => {
                (useApp.getState() as any).setActiveConceptMapId(r.id);
                setScreen("conceptMap");
              }}
              emptyText="No concept maps yet"
              icon={MapIcon}
            />
          )}

          {/* Phase 12b — Study Groups */}
          {roomData?.studyGroups?.length > 0 && (
            <GroupStudySection
              groups={roomData.studyGroups}
              onOpenGroup={(g: any) => {
                // Phase 46 — open the StudyGroupScreen with the selected group
                (useApp.getState() as any).setActiveStudyGroupId(g?.id ?? null);
                setScreen("studyGroup");
              }}
            />
          )}

          {/* Concept Map section */}
          {conceptMapSettings?.enabled && (
            <section className="rounded-2xl bg-gradient-to-br from-fuchsia-50 to-violet-50 border border-fuchsia-200 p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-9 h-9 rounded-full bg-gradient-to-br from-fuchsia-500 to-violet-600 text-white flex items-center justify-center flex-shrink-0">
                    <MapIcon className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">Concept Map</p>
                    <p className="text-[11px] text-gray-500 truncate">
                      {existingConceptMap
                        ? "A map exists for this topic"
                        : `Visual map of key concepts${conceptMapSettings.tokenCost ? ` · ${conceptMapSettings.tokenCost} tokens` : ""}`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={generateOrViewConceptMap}
                  className={`flex-shrink-0 px-3 h-9 rounded-full text-xs font-semibold flex items-center gap-1 ${
                    existingConceptMap
                      ? "bg-white text-fuchsia-700 hover:bg-fuchsia-100"
                      : "bg-fuchsia-600 text-white hover:bg-fuchsia-700"
                  }`}
                >
                  {existingConceptMap ? (
                    <>View Map <ChevronRight className="w-3 h-3" /></>
                  ) : (
                    <><MapIcon className="w-3 h-3" /> Generate</>
                  )}
                </button>
              </div>
            </section>
          )}

          {/* Practice Zone */}
          <section className="rounded-2xl bg-white border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-900">Practice Zone</h2>
              {topicData.mastery.dueCount > 0 && (
                <span className="text-[10px] font-semibold uppercase tracking-wide bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
                  {topicData.mastery.dueCount} due
                </span>
              )}
            </div>

            {/* Tab switcher — show solver only for math */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-gray-100 rounded-xl text-[11px] font-medium mb-4">
              <button
                onClick={() => setPracticeTab("flashcards")}
                className={`flex flex-col items-center gap-0.5 py-2 rounded-lg transition ${practiceTab === "flashcards" ? "bg-white shadow text-indigo-600" : "text-gray-500"}`}
              >
                <Layers className="w-4 h-4" /> Flashcards
              </button>
              <button
                onClick={() => setPracticeTab("quiz")}
                className={`flex flex-col items-center gap-0.5 py-2 rounded-lg transition ${practiceTab === "quiz" ? "bg-white shadow text-indigo-600" : "text-gray-500"}`}
              >
                <ListChecks className="w-4 h-4" /> Quiz
              </button>
              <button
                onClick={() => setPracticeTab("solver")}
                disabled={!isMath}
                className={`flex flex-col items-center gap-0.5 py-2 rounded-lg transition ${practiceTab === "solver" ? "bg-white shadow text-indigo-600" : "text-gray-500"} ${!isMath ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                <Sigma className="w-4 h-4" /> Solver
              </button>
            </div>

            {practiceLoading && (
              <div className="py-6 flex items-center justify-center text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="ml-2 text-xs">Loading practice…</span>
              </div>
            )}

            {practiceError && (
              <div className="p-2 rounded-lg bg-rose-50 text-rose-700 text-xs">{practiceError}</div>
            )}

            {/* Empty state — no cards yet */}
            {!practiceLoading && practiceCards.length === 0 && (
              <div className="py-6 text-center">
                <div className="w-12 h-12 mx-auto rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Plus className="w-6 h-6" />
                </div>
                <p className="mt-2 text-sm font-medium text-gray-900">No practice cards yet</p>
                <p className="mt-0.5 text-xs text-gray-500">Generate AI cards for this topic to start practicing.</p>
                <button
                  onClick={generatePracticeCards}
                  disabled={generatingCards}
                  className="mt-3 inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-indigo-600 text-white text-sm font-semibold shadow-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  {generatingCards ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {generatingCards ? "Generating…" : "Generate 5 flashcards + 5 MCQs"}
                </button>
                {genStatus && <p className="mt-2 text-xs text-gray-600">{genStatus}</p>}
              </div>
            )}

            {/* Flashcards practice */}
            {!practiceLoading && practiceTab === "flashcards" && flashcards.length > 0 && (
              <div>
                <div className="flex items-center justify-between text-[11px] text-gray-500 mb-2">
                  <span>{fcIdx + 1} / {flashcards.length}</span>
                  <span>Tap card to flip</span>
                </div>
                <button
                  onClick={() => setFcFlipped((f) => !f)}
                  className="flip-card w-full h-56 text-left"
                  aria-label="Flip card"
                >
                  <div className={`flip-card-inner ${fcFlipped ? "is-flipped" : ""}`}>
                    <div className="flip-card-face rounded-3xl bg-white border border-gray-100 shadow-md p-4 flex flex-col items-center justify-center text-center">
                      <span className="text-[10px] uppercase tracking-wider text-indigo-600 font-semibold">Question</span>
                      <p className="mt-2 text-base font-semibold text-gray-900">{flashcards[fcIdx].front}</p>
                    </div>
                    <div className="flip-card-face flip-card-back rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-500 text-white shadow-md p-4 flex flex-col items-center justify-center text-center">
                      <span className="text-[10px] uppercase tracking-wider opacity-80 font-semibold">Answer</span>
                      <p className="mt-2 text-base font-bold">{flashcards[fcIdx].back}</p>
                    </div>
                  </div>
                </button>
                {fcFlipped && (
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <button
                      onClick={() => submitFlashcard(0)}
                      disabled={fcSubmitting}
                      className="h-10 rounded-full bg-amber-500 text-white text-sm font-semibold shadow hover:bg-amber-600 disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      Still learning
                    </button>
                    <button
                      onClick={() => submitFlashcard(5)}
                      disabled={fcSubmitting}
                      className="h-10 rounded-full bg-emerald-500 text-white text-sm font-semibold shadow hover:bg-emerald-600 disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" /> I knew it
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Quiz practice */}
            {!practiceLoading && practiceTab === "quiz" && mcqs.length > 0 && !quizDone && (
              <div>
                <div className="text-[11px] text-gray-500 mb-2">Question {quizIdx + 1} / {mcqs.length} · Correct: {quizCorrect}</div>
                <p className="text-sm font-medium text-gray-900 mb-3">{mcqs[quizIdx].question}</p>
                <div className="space-y-1.5">
                  {mcqs[quizIdx].options?.map((opt, i) => {
                    const isSel = quizSelected === i;
                    const isAns = i === mcqs[quizIdx].correctIndex;
                    let cls = "border-gray-200 bg-white hover:border-indigo-300";
                    if (quizSelected !== null) {
                      if (isAns) cls = "border-emerald-500 bg-emerald-50 text-emerald-700";
                      else if (isSel) cls = "border-rose-500 bg-rose-50 text-rose-700";
                      else cls = "opacity-60";
                    }
                    return (
                      <button
                        key={i}
                        onClick={() => handleQuizSelect(i)}
                        disabled={quizSelected !== null}
                        className={`w-full flex items-center gap-2 p-2.5 rounded-xl border-2 text-xs font-medium transition ${cls}`}
                      >
                        <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold">
                          {String.fromCharCode(65 + i)}
                        </span>
                        {opt}
                      </button>
                    );
                  })}
                </div>
                {quizSelected !== null && mcqs[quizIdx].explanation && (
                  <div className="mt-2 p-2.5 rounded-xl bg-indigo-50 text-indigo-700 text-xs">
                    {mcqs[quizIdx].explanation}
                  </div>
                )}
                {quizSelected !== null && (
                  <button
                    onClick={nextQuiz}
                    className="mt-2 w-full h-10 rounded-full bg-indigo-600 text-white text-sm font-semibold shadow hover:bg-indigo-700"
                  >
                    {quizIdx + 1 < mcqs.length ? "Next Question" : "Finish Quiz"}
                  </button>
                )}
              </div>
            )}

            {practiceTab === "quiz" && quizDone && (
              <div className="py-6 text-center">
                <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <Check className="w-6 h-6" />
                </div>
                <p className="mt-2 text-sm font-semibold text-gray-900">Quiz complete!</p>
                <p className="text-xs text-gray-500">Score: {quizCorrect} / {mcqs.length}</p>
                <button
                  onClick={() => {
                    setQuizIdx(0);
                    setQuizSelected(null);
                    setQuizCorrect(0);
                    setQuizDone(false);
                  }}
                  className="mt-3 h-10 px-4 rounded-full bg-white border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Solver (math) */}
            {practiceTab === "solver" && isMath && (
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Type a math problem</label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    value={problem}
                    onChange={(e) => setProblem(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && solve()}
                    placeholder="e.g. Solve 2x + 5 = 15"
                    className="flex-1 p-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  />
                  <button
                    onClick={solve}
                    disabled={solving || !problem.trim()}
                    className="px-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold flex items-center gap-1 hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {solving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Solve
                  </button>
                </div>
                {solverError && (
                  <div className="mt-2 p-2 rounded-lg bg-rose-50 text-rose-700 text-xs">{solverError}</div>
                )}
                {solution && (
                  <div className="mt-3 space-y-2">
                    {solution.steps.map((s, i) => (
                      <div key={i} className="rounded-xl bg-gray-50 p-2.5">
                        <p className="text-xs text-gray-700">{s.explanation}</p>
                        <p className="mt-1 text-sm font-mono text-indigo-700">{s.expression}</p>
                      </div>
                    ))}
                    {solution.finalAnswer && (
                      <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                        <p className="text-[11px] uppercase font-semibold text-emerald-700">Final Answer</p>
                        <p className="text-sm font-bold text-emerald-900 mt-0.5">{solution.finalAnswer}</p>
                        {solution.check && (
                          <p className="mt-1 text-xs text-emerald-700 italic">{solution.check}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {practiceTab === "solver" && !isMath && (
              <div className="py-6 text-center text-xs text-gray-500">
                Step-by-step solver is only available for math topics.
              </div>
            )}
          </section>

          {tutorOpen && createPortal(
              <section className="fixed bottom-4 right-4 z-50 w-[min(390px,calc(100vw-2rem))] h-[min(620px,78vh)] rounded-3xl bg-white border border-gray-200 shadow-2xl overflow-hidden flex flex-col">
                <header className="shrink-0 px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-white">
                  <div className="flex items-center gap-2"><span className="w-9 h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center"><Bot className="w-5 h-5" /></span><div><h2 className="text-sm font-semibold text-gray-900">Room tutor</h2><p className="text-[10px] text-gray-500">Here with your {topic?.name} lesson</p></div></div>
                  <button onClick={() => setTutorOpen(false)} aria-label="Close tutor" className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500"><X className="w-4 h-4" /></button>
                </header>
              <div className="min-h-0 flex-1 flex flex-col">
                <div ref={chatScrollRef} className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50">
                  {chatMessages.length === 0 && (
                    <p className="text-xs text-gray-500 text-center py-2">
                      Ask anything about {topic?.name} — the tutor already knows the topic context.
                    </p>
                  )}
                  {chatMessages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs whitespace-pre-wrap break-words ${
                        m.role === "user"
                          ? "bg-indigo-600 text-white"
                          : "bg-white border border-gray-200 text-gray-900 shadow-sm"
                      }`}>
                        {m.image && <img src={m.image} alt="Your drawing for tutor review" className="mb-2 max-h-40 w-full rounded-lg bg-white object-contain" />}
                        {m.content}
                        {m.role === "assistant" && m.attachments?.filter((attachment: any) => attachment.type === "computer_workspace").map((attachment: any, index: number) => {
                          let offer: any;
                          try { offer = JSON.parse(attachment.caption); } catch { return null; }
                          return <div key={index} className="mt-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
                            <p className="font-semibold text-indigo-800">{offer.title}</p>
                            <p className="mt-1 text-gray-700">{offer.reason}</p>
                            <p className="mt-1 font-medium text-indigo-800">{offer.benefit}</p>
                            <button onClick={async () => {
                              const saved = await fetch(`/api/study-room/${activeTopicId}/workspace`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: "set_computer_task", computerTask: offer }) });
                              if (!saved.ok) { setChatError("Could not save this activity to your Study Room."); return; }
                              setComputerTask({ ...offer, startedAt: new Date().toISOString() });
                              if (offer.workspace === "exam") setScreen("examHub");
                              else if (offer.workspace === "code") setScreen("codeRunner");
                              else if (offer.workspace === "web") setScreen("webBuilder");
                              else if (offer.workspace === "modeling") setScreen("mlPlayground");
                              else if (offer.workspace === "simulation") setScreen("lab");
                              else if (offer.workspace === "data") setScreen("notebook");
                              else if (offer.workspace === "tvet") setScreen("tvetBuddy");
                              else if (offer.workspace === "computer") setTutorOpen(true);
                              else if (offer.workspace === "study") window.scrollTo({ top: 0, behavior: "smooth" });
                              else document.getElementById("study-room-work-board")?.scrollIntoView({ behavior: "smooth", block: "center" });
                            }} className="mt-2 rounded-lg bg-indigo-600 px-3 py-2 text-white font-semibold">Open activity workspace</button>
                          </div>;
                        })}
                      </div>
                    </div>
                  ))}
                  {chatBusy && (
                    <div className="flex justify-start">
                      <div className="rounded-2xl px-3 py-2 bg-white border border-gray-200 shadow-sm">
                        <span className="flex items-center gap-2 text-[11px] text-gray-600"><Loader2 className="w-3 h-3 animate-spin text-indigo-600" />{chatActivity || "Tutor is working…"}</span>
                      </div>
                    </div>
                  )}
                  {chatError && (
                    <p className="text-xs text-rose-600 text-center">{chatError}</p>
                  )}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendChat();
                  }}
                  className="p-2 border-t border-gray-100 flex items-end gap-1.5"
                >
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendChat();
                      }
                    }}
                    placeholder={`Ask about ${topic?.name}…`}
                    className="flex-1 p-2 rounded-full border border-gray-200 text-xs outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  />
                  <button
                    type="submit"
                    disabled={chatBusy || !chatInput.trim()}
                    className="w-9 h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow hover:bg-indigo-700 disabled:opacity-50 flex-shrink-0"
                  >
                    {chatBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  </button>
                </form>
              </div>
              </section>,
              document.body
          )}
        </div>
      </div>

      {/* Mobile exit button (bottom-right) */}
      <button
        onClick={() => {
          setActiveTopicId(null);
          setScreen("home");
        }}
        className="md:hidden fixed bottom-4 left-4 z-20 w-12 h-12 rounded-full bg-white border border-gray-200 shadow-md flex items-center justify-center text-gray-700"
        aria-label="Exit Study Room"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Phase 12b — Floating action buttons (bottom-left on desktop) */}
      <div className="hidden md:flex fixed bottom-4 left-4 z-20 flex-col gap-2">
        <button
          onClick={() => setShowFocusTimer(true)}
          className="w-11 h-11 rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 flex items-center justify-center"
          title="Focus Timer"
        >
          <Timer className="w-5 h-5" />
        </button>
        <button
          onClick={() => setShowMusic(true)}
          className="w-11 h-11 rounded-full bg-purple-600 text-white shadow-lg hover:bg-purple-700 flex items-center justify-center"
          title="Study Music"
        >
          <Music className="w-5 h-5" />
        </button>
        <button
          onClick={() => setShowNotes(true)}
          className="w-11 h-11 rounded-full bg-violet-600 text-white shadow-lg hover:bg-violet-700 flex items-center justify-center"
          title="Notes"
        >
          <FileText className="w-5 h-5" />
        </button>
      </div>

      {/* Room tools stay tucked to the left on phones; the tutor floats on the right. */}
      <div className="md:hidden fixed bottom-20 left-4 z-20 flex flex-col gap-2">
        <button
          onClick={() => setShowFocusTimer(true)}
          className="w-10 h-10 rounded-full bg-indigo-600 text-white shadow-lg flex items-center justify-center"
        >
          <Timer className="w-4 h-4" />
        </button>
        <button
          onClick={() => setShowMusic(true)}
          className="w-10 h-10 rounded-full bg-purple-600 text-white shadow-lg flex items-center justify-center"
        >
          <Music className="w-4 h-4" />
        </button>
        <button
          onClick={() => setShowNotes(true)}
          className="w-10 h-10 rounded-full bg-violet-600 text-white shadow-lg flex items-center justify-center"
        >
          <FileText className="w-4 h-4" />
        </button>
      </div>
      <button onClick={() => setTutorOpen(true)} aria-label="Open room tutor" title="Ask your room tutor" className="fixed bottom-4 right-4 z-40 flex h-14 items-center gap-2 rounded-full bg-indigo-600 px-4 text-white shadow-xl hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-200">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15"><Bot className="h-5 w-5" /></span><span className="text-xs font-semibold">Room tutor</span>
      </button>

      {/* Phase 12b — All modals */}
      {showFocusTimer && activeTopicId && (
        <FocusTimerModal
          open={showFocusTimer}
          onClose={() => setShowFocusTimer(false)}
          topicId={activeTopicId}
          room={roomData?.room}
        />
      )}
      {showNotes && activeTopicId && (
        <NotesModal
          open={showNotes}
          onClose={() => setShowNotes(false)}
          topicId={activeTopicId}
          room={roomData?.room}
        />
      )}
      {showMusic && (
        <MusicPlayerModal
          open={showMusic}
          onClose={() => setShowMusic(false)}
        />
      )}
      {showCustomize && activeTopicId && (
        <CustomizationModal
          open={showCustomize}
          onClose={() => setShowCustomize(false)}
          topicId={activeTopicId}
          room={roomData?.room}
        />
      )}
      {showReport && activeTopicId && (
        <ReportCardModal
          open={showReport}
          onClose={() => setShowReport(false)}
          topicId={activeTopicId}
          room={roomData?.room}
        />
      )}
      {showDailyReview && activeTopicId && (
        <DailyReviewModal
          open={showDailyReview}
          onClose={() => setShowDailyReview(false)}
          topicId={activeTopicId}
          room={roomData?.room}
          onComplete={() => {
            // Refresh room data after review completion
            if (activeTopicId) {
              fetch(`/api/study-room/${activeTopicId}`)
                .then((r) => r.ok ? r.json() : null)
                .then((d) => { if (d) setRoomData(d); })
                .catch(() => {});
            }
          }}
        />
      )}
      {showMiniGames && activeTopicId && (
        <MiniGamesModal
          open={showMiniGames}
          onClose={() => setShowMiniGames(false)}
          topicId={activeTopicId}
          room={roomData?.room}
        />
      )}

      {/* Phase 15 — Room Shop + Sound Mixer */}
      {showShop && activeTopicId && (
        <RoomShopModal
          open={showShop}
          onClose={() => setShowShop(false)}
          topicId={activeTopicId}
          coinBalance={coinBalance}
          onPurchased={async () => {
            setShowShop(false);
            // Refresh room data + balances
            if (activeTopicId) {
              const r = await fetch(`/api/study-room/${activeTopicId}`);
              const d = await r.json();
              if (r.ok) setRoomData(d);
            }
            const br = await fetch("/api/user/balances");
            const bd = await br.json();
            if (br.ok && typeof bd.coins === "number") setCoinBalance(bd.coins);
          }}
        />
      )}
      {showSoundMixer && (
        <SoundMixer
          open={showSoundMixer}
          onClose={() => setShowSoundMixer(false)}
          soundSettings={roomData?.room?.soundSettings ?? { fireplace: 0, rain: 0, birds: 0, lofi: 0, pages: 0 }}
          onUpdate={async (settings: any) => {
            if (activeTopicId) {
              await fetch(`/api/study-room/${activeTopicId}/sound-settings`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(settings),
              });
            }
          }}
        />
      )}
      {viewingMaterial && (
        <div className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onClick={() => setViewingMaterial(null)}>
          <section className="w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <header className="flex items-center justify-between border-b border-gray-100 px-5 py-4"><div><p className="text-[10px] uppercase tracking-wide text-indigo-600">Study source</p><h2 className="text-base font-bold text-gray-900">{viewingMaterial.title}</h2></div><button onClick={() => setViewingMaterial(null)} aria-label="Close source" className="rounded-full p-2 text-gray-500 hover:bg-gray-100"><X className="h-4 w-4" /></button></header>
            <div className="max-h-[65vh] overflow-y-auto whitespace-pre-wrap px-5 py-4 text-sm leading-6 text-gray-700">{viewingMaterial.text}</div>
          </section>
        </div>
      )}
    </div>
  );
}

function LessonSection({
  open,
  onToggle,
  icon: Icon,
  color,
  title,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border ${open ? "border-gray-200" : "border-transparent"}`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 p-2 hover:bg-gray-50 rounded-xl"
      >
        <span className={`w-6 h-6 rounded-full flex items-center justify-center ${color}`}>
          <Icon className="w-3.5 h-3.5" />
        </span>
        <span className="text-xs font-semibold text-gray-900 flex-1 text-left">{title}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-2 pb-2 pt-1">{children}</div>}
    </div>
  );
}
