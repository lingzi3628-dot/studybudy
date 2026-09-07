"use client";

import { useState, useEffect } from "react";
import {
  BookOpen, Brain, MessageCircle, Database, Zap, Globe, BarChart3,
  FileText, Link2, Sparkles, Settings, Bot, Upload, Search, Code,
  CheckCircle2, AlertCircle, Lightbulb, ArrowRight, Terminal,
  GitBranch, FileCode, Server, Cpu, Layers, Workflow, Eye,
  ChevronDown, BookMarked, Rocket, Plug, Shield, Clock,
} from "lucide-react";

/**
 * /chatbot-docs — Comprehensive documentation for the Chatbot Builder.
 *
 * Covers every feature: training, matching modes, knowledge base (URL,
 * GitHub, file, text, packs, HuggingFace), RAG, plugins, evaluation,
 * review queue, deployment, platform integrations, brain tab, code sandbox.
 *
 * Single-page layout with a sticky table of contents. Uses lucide icons
 * (no emojis). Designed to be the "everything you need to know" guide.
 */

type Section = {
  id: string;
  title: string;
  icon: any;
};

const SECTIONS: Section[] = [
  { id: "getting-started", title: "Getting Started", icon: Rocket },
  { id: "training", title: "Training Your Bot", icon: Brain },
  { id: "matching-modes", title: "Matching Modes", icon: Layers },
  { id: "chat", title: "Chatting with Your Bot", icon: MessageCircle },
  { id: "knowledge-base", title: "Knowledge Base (RAG)", icon: Database },
  { id: "huggingface", title: "Hugging Face Datasets", icon: Database },
  { id: "plugins", title: "Plugins & Tools", icon: Zap },
  { id: "code-sandbox", title: "Code Sandbox", icon: Code },
  { id: "evaluate", title: "Evaluation & Testing", icon: BarChart3 },
  { id: "review", title: "Review Queue", icon: FileText },
  { id: "deploy", title: "Deployment", icon: Globe },
  { id: "connect", title: "Platform Integrations", icon: Link2 },
  { id: "brain", title: "Brain System", icon: Sparkles },
  { id: "security", title: "Security & Privacy", icon: Shield },
  { id: "faq", title: "FAQ & Troubleshooting", icon: Lightbulb },
];

export default function ChatbotDocsPage() {
  const [activeSection, setActiveSection] = useState("getting-started");
  const [mobileTocOpen, setMobileTocOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      for (const section of SECTIONS) {
        const el = document.getElementById(section.id);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 120 && rect.bottom >= 120) {
            setActiveSection(section.id);
            break;
          }
        }
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMobileTocOpen(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => window.history.back()} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600">
            <ArrowRight className="w-4 h-4 rotate-180" />
          </button>
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-sm font-bold text-gray-900 flex-1">Chatbot Builder Documentation</h1>
          <span className="text-[10px] text-gray-400 hidden sm:block">Complete guide to building, training, and deploying AI chatbots</span>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 flex gap-6">
        {/* Table of Contents — sticky sidebar */}
        <aside className="hidden lg:block w-56 flex-shrink-0">
          <div className="sticky top-20 space-y-0.5">
            <p className="text-[10px] font-bold uppercase text-gray-400 mb-2 px-2">Contents</p>
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  onClick={() => scrollTo(s.id)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition text-left ${
                    activeSection === s.id ? "bg-violet-50 text-violet-700" : "text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{s.title}</span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Mobile TOC toggle */}
        <button
          onClick={() => setMobileTocOpen(!mobileTocOpen)}
          className="lg:hidden fixed bottom-4 right-4 z-40 w-12 h-12 rounded-full bg-violet-600 text-white shadow-lg flex items-center justify-center"
        >
          <BookMarked className="w-5 h-5" />
        </button>
        {mobileTocOpen && (
          <div className="lg:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setMobileTocOpen(false)}>
            <div className="absolute right-0 top-0 bottom-0 w-64 bg-white p-4 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <p className="text-[10px] font-bold uppercase text-gray-400 mb-2">Contents</p>
              {SECTIONS.map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.id}
                    onClick={() => scrollTo(s.id)}
                    className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs font-medium text-left ${
                      activeSection === s.id ? "bg-violet-50 text-violet-700" : "text-gray-500"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {s.title}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0 max-w-3xl">
          {/* Hero */}
          <div className="rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 p-6 text-white mb-6">
            <h2 className="text-2xl font-bold mb-2">Build, Train & Deploy AI Chatbots</h2>
            <p className="text-sm opacity-90 leading-relaxed">
              A complete guide to the StudyBuddy Chatbot Builder — from adding your first Q&A pair to deploying
              a bot on Telegram, Slack, your website, and Claude Desktop. No coding required.
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              <span className="px-2.5 py-1 rounded-full bg-white/20 text-xs font-semibold">Hybrid Retrieval</span>
              <span className="px-2.5 py-1 rounded-full bg-white/20 text-xs font-semibold">RAG</span>
              <span className="px-2.5 py-1 rounded-full bg-white/20 text-xs font-semibold">Generative Fallback</span>
              <span className="px-2.5 py-1 rounded-full bg-white/20 text-xs font-semibold">Plugins</span>
              <span className="px-2.5 py-1 rounded-full bg-white/20 text-xs font-semibold">MCP</span>
              <span className="px-2.5 py-1 rounded-full bg-white/20 text-xs font-semibold">Code Sandbox</span>
            </div>
          </div>

          {/* === GETTING STARTED === */}
          <Section id="getting-started" title="Getting Started" icon={Rocket}>
            <p>
              The Chatbot Builder is a complete platform for creating AI-powered chatbots. You add training data
              (Q&A pairs), optionally connect knowledge sources (documents, URLs, GitHub repos, Hugging Face datasets),
              configure how the bot matches and responds, then deploy it to the web, Telegram, Slack, or any platform
              via REST API.
            </p>
            <p>
              The bot uses a <b>hybrid retrieval + generative</b> architecture. When a user sends a message, the bot
              first tries to find a matching Q&A pair from your training data. If the match score is high enough
              (above your threshold), it returns the stored answer. If not, it falls back to an AI language model
              (GLM) to generate a new answer — optionally using knowledge from your documents (RAG) and plugin
              results (calculator, web search, code execution) as context.
            </p>
            <Callout type="info" title="The 5-minute quickstart">
              <ol className="list-decimal list-inside space-y-1 mt-1">
                <li>Open the Chatbot Builder (ML Buddy)</li>
                <li>Go to the <b>Train</b> tab — your starter data is already there (8 Q&A pairs)</li>
                <li>Click the <b>Chat</b> tab and type "hello" — the bot will respond</li>
                <li>Add more Q&A pairs in the Train tab to make it smarter</li>
                <li>Go to <b>Knowledge</b> tab to add documents for RAG</li>
                <li>Go to <b>Deploy</b> tab to ship your bot to a public URL</li>
              </ol>
            </Callout>
            <h4>Architecture Overview</h4>
            <CodeBlock>{`User Message
    │
    ▼
┌─────────────────────────────────┐
│  1. Normalize Text              │  lowercase, expand abbreviations,
│     (u→you, dont→do not, etc.)  │  strip punctuation
└──────────────┬──────────────────┘
               │
    ┌──────────▼──────────┐
    │  2. Plugin Detection │  calculator, web search,
    │     (if enabled)     │  datetime, code runner
    └──────────┬──────────┘
               │
    ┌──────────▼──────────┐
    │  3. Q&A Retrieval    │  TF-IDF / keyword / fuzzy /
    │     (training data)  │  hybrid / semantic (USE)
    └──────────┬──────────┘
               │
         Score ≥ threshold?
         ┌───────┴───────┐
        YES              NO
         │                │
    ┌────▼────┐   ┌───────▼───────┐
    │ Return  │   │ 4. RAG        │  retrieve knowledge
    │ stored  │   │    Retrieval  │  chunks from documents
    │ answer  │   └───────┬───────┘
    └─────────┘           │
                ┌────────▼────────┐
                │ 5. Generative    │  GLM LLM with:
                │    Fallback      │  - plugin results
                │                  │  - RAG chunks
                │                  │  - weak Q&A matches
                │                  │  - conversation history
                └────────┬────────┘
                         │
                    ┌────▼────┐
                    │ Return  │
                    │ answer  │
                    └─────────┘`}</CodeBlock>
          </Section>

          {/* === TRAINING === */}
          <Section id="training" title="Training Your Bot" icon={Brain}>
            <p>
              The <b>Train</b> tab is where you add Q&A pairs — the core knowledge your bot uses to answer questions.
              Each pair has an <b>input</b> (what the user says) and an <b>output</b> (what the bot replies). You can
              also tag pairs with an <b>intent</b> (a category like "greeting", "science_question", "farewell") which
              helps the bot understand what the conversation is about.
            </p>
            <h4>Adding Training Data</h4>
            <p>There are 5 ways to add training data:</p>
            <FeatureGrid features={[
              { icon: FileCode, title: "Manual Entry", desc: "Type Q&A pairs one at a time in the Add Training Example form." },
              { icon: Upload, title: "Import CSV/JSON", desc: "Paste CSV (input,output,intent) or JSON array to bulk-import pairs." },
              { icon: Sparkles, title: "AI Generate", desc: "Describe a topic and the AI generates up to 50 Q&A pairs automatically." },
              { icon: Database, title: "Data Lab", desc: "Use the Data Lab to dump content, augment data, and manage training sets." },
              { icon: Search, title: "Hugging Face", desc: "Ingest HF datasets with Q&A columns — they auto-add as training pairs." },
            ]} />
            <h4>Test Set Tagging</h4>
            <p>
              You can tag certain Q&A pairs as <b>test</b> pairs (toggle the TEST badge in the training list). Test
              pairs are <b>held out</b> from training — the bot never sees them during matching. They're used by the
              Evaluate tab to measure accuracy. Aim for about 15% of your data as test pairs, with at least 1 per intent.
            </p>
            <Callout type="tip" title="Best Practice">
              Add at least 3-5 examples per intent. The more variations of the same question you add, the better the
              bot handles different phrasings. For example, for a "greeting" intent: "hello", "hi", "hey", "good morning",
              "how are you".
            </Callout>
            <h4>Auto-Train</h4>
            <p>
              The bot auto-trains whenever you add, edit, or import training data. You'll see a "Training..." spinner,
              then a green "Trained" badge in the header. No need to click a Train button — though you can force a
              retrain if needed.
            </p>
          </Section>

          {/* === MATCHING MODES === */}
          <Section id="matching-modes" title="Matching Modes" icon={Layers}>
            <p>
              When a user sends a message, the bot compares it against all training pairs using one of 5 matching
              modes. Each mode has different strengths — the right choice depends on your data.
            </p>
            <FeatureGrid features={[
              { icon: Layers, title: "TF-IDF", desc: "Term Frequency-Inverse Document Frequency. Matches by shared words, weighted by how rare each word is. Fast, good for keyword-heavy data." },
              { icon: Layers, title: "Keyword", desc: "Simple word-overlap matching (Jaccard similarity). Fastest, but ignores word importance." },
              { icon: Layers, title: "Fuzzy", desc: "Levenshtein distance — matches by edit distance. Handles typos but slow on large datasets." },
              { icon: Layers, title: "Hybrid (Recommended)", desc: "Combines TF-IDF (70%) + keyword (30%). Best general-purpose mode for most bots." },
              { icon: Cpu, title: "Semantic (Best Accuracy)", desc: "Universal Sentence Encoder embeddings. Understands meaning, not just words. 'hii' matches 'hi'. ~25MB one-time download." },
            ]} />
            <h4>Confidence Threshold</h4>
            <p>
              The threshold determines how confident the bot must be before returning a stored answer. If the best
              match score is below the threshold, the bot falls back to the generative LLM.
            </p>
            <Callout type="warning" title="Threshold Trade-off">
              <b>Too low</b> (e.g. 0.15): the bot returns wrong answers — it accepts weak matches. This was the Phase 62
              bug ("boring" matched "Good morning").<br />
              <b>Too high</b> (e.g. 0.90): the bot rarely returns stored answers — it always falls back to the LLM,
              which is slower and costs tokens.<br />
              <b>Default</b>: hybrid=0.45, tfidf=0.40, keyword=0.25, fuzzy=0.60, semantic=0.65. Use the Evaluate tab's
              Mode Recommender to find the optimal threshold for your data.
            </Callout>
            <h4>Short-Query Protection</h4>
            <p>
              Very short messages (2 or fewer tokens, like "no", "yes", "ok") produce unreliable TF-IDF scores because
              there are so few terms to compare. The bot automatically raises the threshold for these (to at least 0.65)
              and routes them through the generative path with conversation history, so the bot understands "no" means
              "no, it doesn't live on land" based on the previous exchange.
            </p>
          </Section>

          {/* === CHAT === */}
          <Section id="chat" title="Chatting with Your Bot" icon={MessageCircle}>
            <p>
              The <b>Chat</b> tab is where you test your bot. Type a message, press Enter, and the bot responds after
              a configurable "thinking delay" (default 3 seconds — simulates the bot processing).
            </p>
            <h4>Source Badges</h4>
            <p>Every bot reply shows a colored badge indicating where the answer came from:</p>
            <FeatureGrid features={[
              { icon: CheckCircle2, title: "Retrieved (Green)", desc: "The bot found a matching Q&A pair above your threshold. This is the fastest, most reliable response." },
              { icon: Sparkles, title: "Generated (Blue)", desc: "No good match found — the AI generated a new answer using Q&A hints + RAG + plugin results as context." },
              { icon: AlertCircle, title: "Fallback (Gray)", desc: "No match AND generative fallback is disabled or failed. The bot says it doesn't understand." },
            ]} />
            <h4>Confidence Bar</h4>
            <p>
              Next to each Retrieved/Generated badge, you'll see a confidence bar showing the match score:
              <b className="text-emerald-600"> green (70%+)</b>,
              <b className="text-amber-600"> amber (40-69%)</b>, or
              <b className="text-rose-600"> rose (below 40%)</b>.
              This tells you how confident the bot is in the match.
            </p>
            <h4>Thinking Process</h4>
            <p>
              Click "Thinking process" under any bot message to see the step-by-step reasoning: tokenization, text
              normalization, entity extraction, sentiment analysis, intent detection, Q&A matching, RAG retrieval,
              and LLM generation. Each step can be expanded to see the data (e.g. the top-3 matched training pairs
              with their scores).
            </p>
            <h4>Conversation Memory</h4>
            <p>
              When "Bot memory" is on (default), the bot remembers the last 5 messages. This helps it understand
              follow-up questions like "what about that?" or "tell me more". For short follow-ups ("no", "yes", "eg"),
              the bot always uses conversation history to understand the context.
            </p>
          </Section>

          {/* === KNOWLEDGE BASE === */}
          <Section id="knowledge-base" title="Knowledge Base (RAG)" icon={Database}>
            <p>
              The <b>Knowledge</b> tab lets you add documents that the bot can retrieve from when answering questions.
              This is called <b>Retrieval-Augmented Generation (RAG)</b> — the bot finds relevant chunks of text from
              your documents and passes them to the AI as context, so it can answer questions about content that
              isn't in your Q&A training data.
            </p>
            <h4>How RAG Works</h4>
            <CodeBlock>{`1. INGEST: Add a document (URL, file, text, GitHub repo)
       │
2. CHUNK: Split into ~1200-char pieces with 180-char overlap
       │
3. EMBED: When the user asks a question, embed the query + all chunks
          (Playground: USE model in browser. Deployed: TF-IDF server-side)
       │
4. RETRIEVE: Find the top-4 most similar chunks (cosine similarity)
       │
5. GENERATE: Pass the chunks to the LLM as context:
   "Use these knowledge chunks as primary context.
    Cite them as [Knowledge N] in your answer."
       │
6. CITE: The LLM's answer references which chunks it used`}</CodeBlock>
            <h4>6 Knowledge Source Types</h4>
            <FeatureGrid features={[
              { icon: FileCode, title: "Text", desc: "Paste any raw text: course notes, product manuals, FAQ docs. Title optional." },
              { icon: Globe, title: "URL", desc: "Enter a web page URL. The server fetches it (SSRF-protected), strips HTML to text, chunks it." },
              { icon: GitBranch, title: "GitHub", desc: "Enter github.com/owner/repo. Fetches README + up to 20 files from docs/. Perfect for library docs." },
              { icon: Upload, title: "File", desc: "Upload PDF, DOCX, TXT, MD, CSV, JSON. Max 10MB. Parsed server-side via pdf-parse + mammoth." },
              { icon: Database, title: "Packs", desc: "35 curated knowledge packs from Wikipedia: Biology, Chemistry, Python, SQL, History, etc." },
              { icon: Database, title: "HuggingFace", desc: "Search millions of HF datasets by keyword. One-click ingest with auto-cleaning + dedup." },
            ]} />
            <h4>RAG-First Detection</h4>
            <p>
              Even when Q&A retrieval finds a match, the bot will skip the stored answer and consult the knowledge base
              if: (a) the user explicitly asks about knowledge ("check your knowledge base", "what do you know about"),
              or (b) the Q&A match is marginal (between threshold and threshold+0.15). This ensures the bot uses your
              documents when relevant, not just its Q&A pairs.
            </p>
            <Callout type="tip" title="RAG Toggle">
              You can turn RAG on/off in the Knowledge tab. When off, the bot only answers from Q&A pairs + generative
              fallback (no document retrieval). Useful for bots that should only answer from curated Q&A data.
            </Callout>
          </Section>

          {/* === HUGGING FACE === */}
          <Section id="huggingface" title="Hugging Face Datasets" icon={Database}>
            <p>
              The <b>HuggingFace</b> sub-tab in the Knowledge tab lets you search millions of public datasets on
              Hugging Face and ingest them with one click. The pipeline automatically fetches, cleans, deduplicates,
              and chunks the data.
            </p>
            <h4>How It Works</h4>
            <ol className="list-decimal list-inside space-y-1.5 text-sm">
              <li><b>Search</b>: Type a keyword (e.g. "squad", "medical qa", "math problems"). The HF Hub API returns up to 20 matching datasets with download counts and tags.</li>
              <li><b>Select</b>: Browse the results — each shows the dataset ID, description, downloads, likes, and tags.</li>
              <li><b>Ingest</b>: Click "+ Ingest". The server:
                <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
                  <li>Fetches available splits (train/test/validation) via the HF Datasets Server API</li>
                  <li>Picks the split with the most rows (usually "train")</li>
                  <li>Downloads up to 500 rows in batches of 100 (handles parquet, CSV, JSON automatically)</li>
                  <li>Extracts Q&A pairs (if the dataset has input/output, question/answer columns) or text chunks</li>
                  <li>Cleans: strips HTML, removes control chars, normalizes whitespace</li>
                  <li>Deduplicates: case-insensitive, preserves first occurrence</li>
                  <li>Chunks: 1200-char pieces with 180-char overlap</li>
                  <li>Stores as a knowledge source (type "huggingface")</li>
                </ul>
              </li>
              <li><b>Auto-Train</b>: If Q&A pairs were found, you're prompted to add them as training data too.</li>
            </ol>
            <h4>Supported Column Patterns</h4>
            <p>The Q&A extractor looks for these common column name patterns:</p>
            <div className="grid grid-cols-2 gap-2 my-2">
              <div className="rounded-lg bg-gray-50 p-2 text-xs">
                <b>Input columns:</b> input, question, q, prompt, user, query, instruction
              </div>
              <div className="rounded-lg bg-gray-50 p-2 text-xs">
                <b>Output columns:</b> output, answer, a, response, reply, bot, completion, target
              </div>
            </div>
            <Callout type="info" title="Example Datasets to Try">
              <b>squad</b> — reading comprehension Q&A (500 pairs)<br />
              <b>openai/gsm8k</b> — grade school math word problems with solutions<br />
              <b>openai/openai_humaneval</b> — 164 Python programming problems<br />
              <b>medalpaca/medical_meadow_medqa</b> — medical Q&A for health info bots
            </Callout>
          </Section>

          {/* === PLUGINS === */}
          <Section id="plugins" title="Plugins & Tools" icon={Zap}>
            <p>
              The <b>Plugins</b> tab lets you give your bot extra capabilities. When a user's message matches a
              plugin's triggers, the bot calls the plugin and includes the result in its answer. Plugins run before
              the generative fallback, so the LLM gets the plugin result as authoritative data.
            </p>
            <h4>4 Built-in Plugins (zero config)</h4>
            <FeatureGrid features={[
              { icon: Cpu, title: "Calculator", desc: "Evaluates math expressions. Triggers: 'calculate 15 * 23', 'what is 2+2', '5 plus 3'." },
              { icon: Search, title: "Web Search", desc: "Searches the web via z-ai SDK. Triggers: 'search for', 'google', 'weather in', 'price of'." },
              { icon: Clock, title: "DateTime", desc: "Returns current date/time with timezone. Triggers: 'what time is it', 'today's date'." },
              { icon: Code, title: "Code Runner", desc: "Runs Python/JavaScript code and returns output. Triggers: 'run this code', markdown code blocks." },
            ]} />
            <h4>Custom HTTP Plugin</h4>
            <p>
              Connect any REST API. The bot interpolates <code className="bg-gray-100 px-1 rounded">{"{{message}}"}</code>
              into the request body and extracts a field from the JSON response. Example: connect a weather API, name it
              "weather" — when a user asks "what's the weather in Nairobi?", the bot calls your API.
            </p>
            <h4>MCP Client Plugin</h4>
            <p>
              Connect to any MCP (Model Context Protocol) server — including <b>another StudyBuddy bot's</b>
              <code className="bg-gray-100 px-1 rounded">/api/mcp/[slug]</code> URL. This enables <b>bot composition</b>:
              Bot A (a research assistant) can call Bot B (a data analyst) as a tool.
            </p>
            <h4>How Plugin Detection Works</h4>
            <p>
              For built-in plugins: the bot checks trigger regex patterns against the user's message. For HTTP + MCP
              plugins: it checks if the plugin name or keywords from the description appear in the message. Up to 2
              plugins can fire per message (executed in parallel, 10-15s timeout each).
            </p>
          </Section>

          {/* === CODE SANDBOX === */}
          <Section id="code-sandbox" title="Code Sandbox" icon={Code}>
            <p>
              The <b>code_runner</b> plugin lets the bot execute Python and JavaScript code during conversations. When
              a user asks "run this code" or provides a markdown code block, the bot executes it and returns the output.
            </p>
            <h4>JavaScript Sandbox</h4>
            <p>
              Uses Node's <code className="bg-gray-100 px-1 rounded">vm</code> module with a limited context. No access
              to <code className="bg-gray-100 px-1 rounded">require</code>, <code className="bg-gray-100 px-1 rounded">process</code>,
              <code className="bg-gray-100 px-1 rounded">fs</code>, or any Node APIs. Only basic JS (
              <code>Math</code>, <code>JSON</code>, <code>Date</code>, <code>Array</code>) + a limited
              <code>console</code>. 5-second timeout.
            </p>
            <h4>Python Sandbox</h4>
            <p>
              Runs <code className="bg-gray-100 px-1 rounded">python3 -c "code"</code> as a subprocess with a 5-second
              timeout, 1MB stdout cap, and minimal environment (PATH + HOME only). Stdout and stderr are captured.
            </p>
            <Callout type="warning" title="Security Note">
              The sandbox is designed for <b>tutor bots</b> where the bot owner controls the code. It is NOT a full
              Docker sandbox. For untrusted user-submitted code, wrap the sandbox in a Docker container (E2B-style) or
              use a managed sandbox service.
            </Callout>
            <h4>Example Usage</h4>
            <CodeBlock>{`User: Run this Python code:
\`\`\`python
for i in range(5):
    print(f"Hello {i}!")
\`\`\`

Bot: [calls code_runner plugin → Python executes]

Output:
Hello 0!
Hello 1!
Hello 2!
Hello 3!
Hello 4!

[Exit code: 0, 45ms]`}</CodeBlock>
          </Section>

          {/* === EVALUATE === */}
          <Section id="evaluate" title="Evaluation & Testing" icon={BarChart3}>
            <p>
              The <b>Evaluate</b> tab is your confidence dashboard. It answers the question: "Is my bot actually any
              good?" with hard numbers, not guesswork.
            </p>
            <h4>Test Set</h4>
            <p>
              Tag Q&A pairs as "test" in the Train tab (toggle the TEST badge). Test pairs are held out from training —
              the bot never sees them during matching. Use them to measure accuracy. The "Auto-split 15%" button
              randomly tags ~15% of your data as test pairs.
            </p>
            <h4>Run Evaluation</h4>
            <p>Click "Evaluate" to run the bot against your test set. You get:</p>
            <FeatureGrid features={[
              { icon: CheckCircle2, title: "Accuracy", desc: "Percentage of test pairs where the bot retrieved the correct answer (matching output, case-insensitive)." },
              { icon: Globe, title: "Coverage", desc: "Percentage of test pairs where the bot found ANY match above threshold (not necessarily correct)." },
              { icon: AlertCircle, title: "Fallback Rate", desc: "Percentage of test pairs where the bot fell below threshold and would use generative fallback." },
            ]} />
            <h4>Mode Recommender</h4>
            <p>
              Click "Recommend" to sweep all 5 matching modes across 19 threshold values (0.05 to 0.95). The recommender
              ranks modes by accuracy and shows the optimal threshold for each. One click "Apply" switches your bot to
              the best configuration.
            </p>
            <h4>Data Quality Scanner</h4>
            <p>Click "Scan" to check your training data for common issues:</p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li><b className="text-rose-600">Contradictions</b> (error): same input, different outputs — the bot can't decide</li>
              <li><b className="text-amber-600">Near-duplicates</b> (warning): very similar inputs (cosine 0.95+) with different outputs</li>
              <li><b className="text-sky-600">Duplicates</b> (info): same input + same output — safe to dedupe</li>
              <li><b className="text-amber-600">Empty intents</b> (warning): intent with only 1 example — add at least 3</li>
              <li><b className="text-rose-600">Empty input/output</b> (error): pair with no input or output text</li>
              <li><b className="text-sky-600">Short outputs</b> (info): answers under 10 chars — bots look smarter with fuller replies</li>
            </ul>
            <h4>Live Preview</h4>
            <p>
              The Live Preview pane in the Train tab shows what the bot would retrieve for any input — no need to
              switch to Chat. Type a query and see the matched pair + score + top-3 alternatives instantly.
            </p>
          </Section>

          {/* === REVIEW === */}
          <Section id="review" title="Review Queue" icon={FileText}>
            <p>
              The <b>Review</b> tab is your continuous-learning loop. Every time the bot can't confidently retrieve an
              answer (uses generative or fallback), the turn lands here. Convert these into new training pairs to teach
              the bot what it should have said.
            </p>
            <h4>How It Works</h4>
            <ol className="list-decimal list-inside space-y-1.5 text-sm">
              <li>User sends a message that the bot can't match (score below threshold)</li>
              <li>The turn is logged to the review queue (persisted in localStorage, survives reloads)</li>
              <li>Open the Review tab to see all low-confidence turns</li>
              <li>Each item shows: the user's message, the source (Generated/Fallback), best score, top-3 weak matches, and the LLM's reply (if generated)</li>
              <li>The LLM reply is pre-filled in an editable textarea — accept it as-is or edit it</li>
              <li>Click "Add as training pair" — the Q&A pair is added to your training data and removed from the queue</li>
              <li>Next time a similar question comes in, the bot retrieves the stored answer instead of generating</li>
            </ol>
            <Callout type="tip" title="Closed Feedback Loop">
              The Review queue creates a closed feedback loop: real-user questions reveal what your bot doesn't know.
              Convert them to training pairs, redeploy, and accuracy goes up. Over time, your bot handles more and more
              questions from retrieval (fast, free) instead of generation (slow, costs tokens).
            </Callout>
          </Section>

          {/* === DEPLOY === */}
          <Section id="deploy" title="Deployment" icon={Globe}>
            <p>
              The <b>Deploy</b> tab is where you ship your bot. There are two deployment options:
            </p>
            <h4>1. Deploy to Cloud (Recommended)</h4>
            <p>
              Ships a real, server-backed chatbot at a shareable URL (<code>/embed/[slug]</code>). The bot runs
              server-side, so the generative fallback (LLM) works in production. Features:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>Server-side hybrid retrieval (TF-IDF + keyword + fuzzy)</li>
              <li>Generative fallback via GLM (works in production, unlike the HTML download)</li>
              <li>Public chat URL — share it, embed it, or call the REST API</li>
              <li>Embed on any website with a single <code>{"<iframe>"}</code> tag</li>
              <li>REST API: <code>POST /api/embed/[slug]/messages</code> with <code>{"{ message: 'hello' }"}</code></li>
              <li>Analytics: chat volume, fallback rate, top missed queries (24h/7d/30d)</li>
              <li>Pause/resume + version history (training data updates bump version)</li>
              <li>Privacy-safe logging: visitor IPs are SHA-256 hashed (never stored raw)</li>
            </ul>
            <h4>2. Download Standalone HTML (Offline)</h4>
            <p>
              Generates a single HTML file with the bot embedded — works offline, no server needed.
              <b>Limitation:</b> TF-IDF retrieval only (no LLM fallback, no analytics). The HTML file includes
              normalization, the matching engine, and a flowing StudyBuddy watermark.
            </p>
            <Callout type="info" title="Deploy Pre-flight">
              Cloud deploys are validated: 0-pair deploys are rejected, thresholds below 0.20 are rejected, 100k pair
              cap enforced. Contradictions (same input, different outputs) are reported as warnings.
            </Callout>
            <h4>Deployed Bot Management</h4>
            <p>
              Click "Manage my deployed bots" to see all your bots with stats (messages, fallbacks, unique users,
              last-active). Each bot has Open, Copy URL, Pause/Resume, and Delete actions.
            </p>
          </Section>

          {/* === CONNECT === */}
          <Section id="connect" title="Platform Integrations" icon={Link2}>
            <p>
              The <b>Connect</b> tab puts your deployed bot where your users actually are: Telegram, Slack, MCP
              (for AI assistants like Claude Desktop), or any backend via REST API.
            </p>
            <h4>Telegram</h4>
            <p>
              Talk to <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-violet-600 underline">@BotFather</a>
              on Telegram to create a bot, then paste the token here. We set up the webhook automatically — no server
              configuration needed. Users can message your bot on Telegram and it will reply using your deployed chatbot.
            </p>
            <CodeBlock>{`1. Open Telegram, search for @BotFather
2. Send /newbot, follow prompts to get a token
3. Paste token in the Connect tab → Telegram section
4. Click "Connect Telegram"
5. Message your bot on Telegram — it replies!`}</CodeBlock>
            <h4>Slack</h4>
            <p>
              Create a Slack app at <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer" className="text-violet-600 underline">api.slack.com/apps</a>,
              add a slash command pointing to the webhook URL (shown after connect), then paste your bot token + signing
              secret. Users type <code>/ask-bot hello</code> in any Slack channel to chat with the bot.
            </p>
            <h4>MCP (Claude Desktop / Cursor)</h4>
            <p>
              No setup needed — your bot is already available as an MCP server. Add the URL to your AI assistant's config:
            </p>
            <CodeBlock>{`{
  "mcpServers": {
    "chatbot": {
      "url": "https://yoursite.com/api/mcp/your-bot-slug"
    }
  }
}`}</CodeBlock>
            <p>
              Now Claude Desktop or Cursor can call your bot as a tool. The bot exposes a <code>chat_with_bot</code>
              tool that takes a <code>message</code> parameter.
            </p>
            <h4>REST API Key</h4>
            <p>
              Generate an API key to call the bot from your own backend, Zapier, n8n, or any HTTP client:
            </p>
            <CodeBlock>{`curl -X POST \\
  https://yoursite.com/api/embed/your-slug/messages \\
  -H "Authorization: Bearer sk_yourkey" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "hello"}'`}</CodeBlock>
            <p>
              Without an API key, the bot is accessible via the embed widget (rate-limited per IP: 30 messages / 5 min).
              With a key, callers are verified (constant-time compare) and get higher limits.
            </p>
          </Section>

          {/* === BRAIN === */}
          <Section id="brain" title="Brain System" icon={Sparkles}>
            <p>
              The <b>Brain</b> tab shows how your bot "grows" as you add more training data. It's a visualization of
              the bot's knowledge — vocabulary, intents, neural nodes, and connections.
            </p>
            <h4>Learning Stages</h4>
            <div className="grid grid-cols-5 gap-2 my-3">
              {[
                { stage: "Seedling", pairs: "0-9", color: "bg-amber-100 text-amber-700" },
                { stage: "Sapling", pairs: "10-49", color: "bg-lime-100 text-lime-700" },
                { stage: "Young", pairs: "50-199", color: "bg-emerald-100 text-emerald-700" },
                { stage: "Mature", pairs: "200-499", color: "bg-violet-100 text-violet-700" },
                { stage: "Expert", pairs: "500+", color: "bg-fuchsia-100 text-fuchsia-700" },
              ].map((s) => (
                <div key={s.stage} className={`rounded-lg p-2 text-center ${s.color}`}>
                  <p className="text-xs font-bold">{s.stage}</p>
                  <p className="text-[9px]">{s.pairs} pairs</p>
                </div>
              ))}
            </div>
            <h4>Model Parameters</h4>
            <p>The Brain tab shows 12 model parameters:</p>
            <FeatureGrid features={[
              { icon: Brain, title: "Training Pairs", desc: "Total Q&A pairs in your training data." },
              { icon: FileText, title: "Test Pairs", desc: "Pairs tagged as test (held out from training)." },
              { icon: BookOpen, title: "Vocabulary", desc: "Unique words across all training inputs." },
              { icon: Layers, title: "Intents", desc: "Number of distinct intent categories." },
              { icon: Settings, title: "Matching Mode", desc: "Current matching algorithm (hybrid, semantic, etc.)." },
              { icon: BarChart3, title: "Threshold", desc: "Current confidence threshold." },
              { icon: Cpu, title: "Embedding Dim", desc: "512 (only shown in semantic mode)." },
              { icon: Cpu, title: "Embeddings", desc: "Number of pre-computed USE embeddings (semantic mode)." },
              { icon: Database, title: "TF-IDF Vectors", desc: "Number of computed TF-IDF vectors." },
              { icon: Database, title: "Knowledge Chunks", desc: "Total chunks across all knowledge sources." },
              { icon: Zap, title: "Plugins", desc: "Enabled plugins / total plugins." },
              { icon: Sparkles, title: "Generative FB", desc: "Whether generative fallback is on or off." },
            ]} />
          </Section>

          {/* === SECURITY === */}
          <Section id="security" title="Security & Privacy" icon={Shield}>
            <h4>URL Scraping (SSRF Protection)</h4>
            <p>
              All URL fetches (Knowledge tab, GitHub ingestion) go through the SSRF guard (Phase 55). The guard:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>Validates the URL string (blocks private/loopback/link-local IPs)</li>
              <li>Does DNS resolution at fetch time (prevents DNS rebinding attacks)</li>
              <li>Re-validates on every redirect hop (prevents redirect-based SSRF)</li>
              <li>Enforces 5MB + 15s caps per fetch</li>
            </ul>
            <h4>API Key Storage</h4>
            <p>
              Deployed bot API keys are stored in the database (Postgres) as unique strings. They're compared using
              constant-time comparison (crypto.timingSafeEqual) to prevent timing attacks. Slack signing secrets and
              Telegram bot tokens are stored in the BotIntegration config JSON — masked in API responses (first 4 +
              last 4 chars only).
            </p>
            <h4>Visitor Privacy</h4>
            <p>
              For deployed bots, visitor IPs are <b>SHA-256 hashed</b> (never stored raw). The hash is used only for
              unique-user counting. We can't reverse the hash to recover the IP. The deployed bot's message log stores
              the visitor hash, input, output, source, score, and timestamp — no PII.
            </p>
            <h4>Code Sandbox</h4>
            <p>
              The JavaScript sandbox uses Node's <code>vm</code> with a limited context (no <code>require</code>,
              <code>process</code>, <code>fs</code>). The Python sandbox runs as a subprocess with a 5-second timeout
              and minimal environment. <b>This is not a full Docker sandbox.</b> For untrusted code, wrap in Docker/E2B.
            </p>
            <h4>Rate Limiting</h4>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li><b>Embed widget</b>: 30 messages per 5 minutes per visitor IP (in-memory sliding window)</li>
              <li><b>REST API (with key)</b>: Same IP limit + higher trust (key verified)</li>
              <li><b>Telegram/Slack webhooks</b>: No rate limit (platform handles their own limits)</li>
            </ul>
          </Section>

          {/* === FAQ === */}
          <Section id="faq" title="FAQ & Troubleshooting" icon={Lightbulb}>
            <FAQItem q="The bot returns wrong answers for short messages like 'no' or 'yes'">
              Short queries (2 or fewer tokens) produce unreliable TF-IDF scores. The bot automatically raises the
              threshold for these and routes them through the generative path with conversation history. Make sure
              "Generative fallback" is on and "Bot memory" is on. If the bot still returns wrong answers, try the
              Semantic matching mode (understands meaning, not just word overlap).
            </FAQItem>
            <FAQItem q="'hii' doesn't match 'hi'">
              TF-IDF/hybrid can't handle misspellings — "hii" and "hi" share no tokens. Solutions: (1) Switch to
              Semantic mode (USE embeddings handle misspellings natively), or (2) the abbreviation dictionary now
              includes common greeting misspellings (hii→hi, hiii→hi, hey→hi, helloo→hello).
            </FAQItem>
            <FAQItem q="The bot doesn't use my knowledge base documents">
              Check: (1) RAG toggle is ON in the Knowledge tab, (2) you have at least one knowledge source with active
              status, (3) the user's question is related to the document content. RAG only fires when the Q&A retrieval
              score is below threshold OR the user explicitly asks about knowledge ("check your knowledge base").
            </FAQItem>
            <FAQItem q="Hugging Face ingestion fails with 'HTTP 400'">
              This was a bug in the initial release (slash encoding + parquet support). It's now fixed — the bot uses
              the HF Datasets Server API which handles all formats. If you still get errors, the dataset may be private,
              empty, or contain only non-text data (images, audio).
            </FAQItem>
            <FAQItem q="The deployed bot page is blank / doesn't render">
              This was a bug (nested HTML tags). It's now fixed — the embed page uses a React client component instead
              of raw HTML. If you still see issues, make sure you're using the latest deployed URL (old URLs from
              before the fix may not work).
            </FAQItem>
            <FAQItem q="React hydration error (#418) or infinite loop (#185)">
              These were caused by localStorage reads in useState initializers and a stale-closure bug in the store
              sync effect. Both are now fixed. If you see them again, hard-refresh the page (Ctrl+Shift+R) to clear
              cached JavaScript.
            </FAQItem>
            <FAQItem q="The bot says 'I don't understand' too often">
              Your threshold may be too high, or you don't have enough training data. Try: (1) Use the Evaluate tab's
              Mode Recommender to find the optimal threshold, (2) Add more Q&A pairs (especially variations of the
              same question), (3) Turn on Generative Fallback so the LLM answers when retrieval misses, (4) Add
              knowledge sources so RAG can help.
            </FAQItem>
            <FAQItem q="The code_runner plugin doesn't work">
              The Python sandbox requires <code>python3</code> installed on the server. On Vercel, Python may not be
              available in the Node.js runtime. The JavaScript sandbox (Node <code>vm</code>) should always work. If
              Python fails, the error message will say "Failed to start python3: Is Python installed?"
            </FAQItem>
            <FAQItem q="How do I add the bot to my website?">
              Deploy to Cloud (Deploy tab), then copy the iframe embed code: <code>{'<iframe src="https://yoursite.com/embed/your-slug" width="100%" height="500" frameborder="0"></iframe>'}</code>.
              Paste it into any HTML page, WordPress, Notion, or LMS.
            </FAQItem>
            <FAQItem q="How do I connect the bot to Claude Desktop?">
              Go to the Connect tab → copy the MCP URL. Add it to your Claude Desktop config file (see the MCP section
              above). Restart Claude Desktop. Your bot is now a tool Claude can call.
            </FAQItem>
          </Section>

          {/* Footer */}
          <div className="mt-12 pt-6 border-t border-gray-200 text-center">
            <p className="text-xs text-gray-400">
              StudyBuddy Chatbot Builder — Phase 74 Documentation<br />
              Covers all features through Phase 74.1 (Hugging Face datasets + code sandbox)
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}

// === Helper Components ===

function Section({ id, title, icon: Icon, children }: { id: string; title: string; icon: any; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-10 scroll-mt-20">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-100 to-fuchsia-100 flex items-center justify-center">
          <Icon className="w-4 h-4 text-violet-600" />
        </div>
        <h3 className="text-lg font-bold text-gray-900">{title}</h3>
      </div>
      <div className="prose prose-sm max-w-none text-gray-600 space-y-3 text-sm leading-relaxed">
        {children}
      </div>
    </section>
  );
}

function Callout({ type, title, children }: { type: "info" | "tip" | "warning"; title: string; children: React.ReactNode }) {
  const styles = {
    info: "bg-sky-50 border-sky-200 text-sky-900",
    tip: "bg-emerald-50 border-emerald-200 text-emerald-900",
    warning: "bg-amber-50 border-amber-200 text-amber-900",
  };
  const icons = { info: AlertCircle, tip: CheckCircle2, warning: AlertCircle };
  const Icon = icons[type];
  return (
    <div className={`rounded-xl border p-3 my-3 ${styles[type]}`}>
      <p className="text-xs font-bold flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5" /> {title}
      </p>
      <div className="text-xs leading-relaxed">{children}</div>
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-gray-900 text-gray-300 rounded-xl p-4 overflow-x-auto my-3 text-[11px] leading-relaxed font-mono">
      {children}
    </pre>
  );
}

function FeatureGrid({ features }: { features: Array<{ icon: any; title: string; desc: string }> }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 my-3">
      {features.map((f, i) => {
        const Icon = f.icon;
        return (
          <div key={i} className="flex items-start gap-2 p-2.5 rounded-xl bg-white border border-gray-100">
            <div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
              <Icon className="w-3.5 h-3.5 text-violet-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-gray-900">{f.title}</p>
              <p className="text-[11px] text-gray-500 leading-relaxed">{f.desc}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FAQItem({ q, children }: { q: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-200 py-3">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between text-left">
        <span className="text-sm font-semibold text-gray-900 pr-4">{q}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <p className="text-xs text-gray-600 mt-2 leading-relaxed">{children}</p>}
    </div>
  );
}
