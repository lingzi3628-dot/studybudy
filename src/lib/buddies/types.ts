/**
 * Buddy type system — Phase 47 Foundation
 *
 * A "Buddy" is a specialized AI persona with:
 *   - A unique id (used in the URL, persisted in DB, sent to /api/tutor/chat)
 *   - A display name + emoji + accent color (for the UI)
 *   - A system-prompt builder function (receives user context, returns the prompt)
 *   - A list of capabilities (sandbox types, graph types, tools) — used by the
 *     UI to show/hide buttons and by the chat route to gate which features
 *     are available
 *   - A list of suggestion prompts (shown in the AI Tutor empty state)
 *   - A list of curriculum/knowledge bases the buddy is grounded in
 *
 * Buddies registered so far: Study (1), Dev (48), Data (49), ML (50).
 * Still stubs — full systems per ROADMAP.md: Web (54), Backend (55),
 * Server (58), TVET (59). An AIBuddy (AI app-dev track) is planned for 56.
 */

/**
 * The user-facing metadata for a buddy. Used by /api/buddies to render
 * the picker UI without exposing the system prompt.
 */
export type BuddyMetadata = {
  /** Stable unique id, persisted in DB and sent to /api/tutor/chat. */
  id: BuddyId;
  /** Human-readable name shown in the UI. */
  displayName: string;
  /** Short tagline shown under the name. */
  tagline: string;
  /** Long description shown in the picker card. */
  description: string;
  /** Single-emoji icon for compact UI. */
  emoji: string;
  /** Tailwind color class (e.g. "from-indigo-500 to-violet-500") for gradients. */
  accentGradient: string;
  /** Tailwind text/border color class for chips and pills. */
  accentText: string;
  /** Phase number when this buddy was added (for changelog display). */
  phase: number;
  /** "free" | "premium" — gates whether free users can switch to this buddy. */
  plan: "free" | "premium";
  /** Which sandbox runtimes this buddy can invoke (controls UI button visibility). */
  capabilities: BuddyCapability[];
  /** Which curriculum/knowledge bases ground this buddy (e.g. "Kenya CBC"). */
  knowledgeBases: string[];
  /** Suggestion prompts shown in the AI Tutor empty state for this buddy. */
  suggestions: BuddySuggestion[];
};

/**
 * The full buddy definition — includes the system-prompt builder that only
 * the backend uses (never exposed via the API).
 */
export type Buddy = BuddyMetadata & {
  /**
   * Build the system prompt for this buddy.
   * Receives the user context (grade, language, current model) and the
   * dynamic context (search results, curriculum content, data-saver flag)
   * and returns the full system prompt string.
   *
   * This indirection lets each buddy inject its own domain knowledge,
   * capability instructions, and tone without touching the chat route.
   */
  buildSystemPrompt: (ctx: BuddyPromptContext) => string;
};

export type BuddyId =
  | "study"
  | "dev"
  | "data"
  | "ml"
  | "ai"
  | "web"
  | "backend"
  | "server"
  | "tvet";

export type BuddyCapability =
  | "graph_drawing"     // mathgraph JSON spec → SVG renderer (Phase 31)
  | "concept_maps"      // network graph (Phase 31)
  | "step_by_step"      // steps JSON spec (Phase 31)
  | "image_search"      // web image search
  | "video_search"      // web video search
  | "vision"            // image input via GLM-4V
  | "voice"             // browser TTS + ASR
  | "exam_generation"   // examgen JSON spec (Phase 40)
  | "python_run"        // Pyodide sandbox (Phase 46 / 48)
  | "js_run"            // QuickJS sandbox (Phase 48)
  | "go_run"            // Go compile sandbox (Phase 48)
  | "sql_run"           // sql.js sandbox (Phase 55)
  | "shell_run"         // Simulated shell (Phase 58)
  | "ml_train"          // TensorFlow.js (Phase 50)
  | "notebook"          // Jupyter-style cells (Phase 49)
  | "web_preview"       // Iframe live preview (Phase 54)
  | "api_test"          // Built-in HTTP client (Phase 55)
  | "tvet_sim"          // TVET-specific simulators (Phase 59)
  | "project_save"      // Can save its output as a Project
  | "code_files"        // Multi-file project editor (Phase 48+)
  | "deploy"            // Deploy generated sites (Phase 54)
  | "document_upload";  // PDF/DOC/XLSX upload (Phase 37)

export type BuddySuggestion = {
  /** Emoji shown in the suggestion card. */
  icon: string;
  /** The prompt text the user can tap to send. */
  text: string;
  /** Optional category label (e.g. "Beginner", "Advanced"). */
  category?: string;
};

/**
 * Context passed to Buddy.buildSystemPrompt(). The chat route assembles
 * this from the user, the message, and any dynamic data (search results,
 * curriculum content). Each buddy decides which fields it actually uses.
 */
export type BuddyPromptContext = {
  /** The user's saved grade (e.g. "Grade 7", "Form 2", "University"). May be null. */
  userGrade: string | null;
  /** The user's preferred language of instruction (e.g. "English", "Kiswahili"). */
  languageOfInstruction: string;
  /** The user's current model name (e.g. "study_buddy_free"). */
  currentModel: string;
  /** The user's original message. */
  userMessage: string;
  /** True if Data Saver mode is on (Phase 45) — reply should be concise. */
  dataSaver: boolean;
  /** Pre-fetched web search context (from /api/tutor/chat route). May be empty. */
  searchContext: string;
  /** Pre-fetched K-12 curriculum context (from curriculum-engine.ts). May be empty. */
  curriculumContext: string;
  /** Pre-fetched admin-uploaded curriculum content (from DB). May be empty. */
  dbCurriculumContext: string;
  /** The teaching-profile suffix from buildTeachingProfile() (Phase 41). */
  teachingProfileSuffix: string;
  /** True if the user uploaded an image (vision path). */
  hasImage: boolean;
  /** The grade band the user belongs to (from gradeToRecommendationBands in AITutorChat). */
  gradeBand?: string;
};
