/**
 * Tutor Chat Engine — Phase 52
 *
 * Shared logic for BOTH chat endpoints:
 *   - POST /api/tutor/chat        (classic, single JSON response)
 *   - POST /api/tutor/chat/stream (SSE streaming)
 *
 * Extracted from the original 768-line route so the two endpoints stay in
 * lockstep. Any behavior change must be made HERE, not in either route.
 *
 * Pipeline:
 *   detectIntents() → runWebSearch() → buildTutorSystemPrompt() → [AI CALL]
 *   → splitThinking() → postProcessReply() (graph specs + examgen + proof)
 */

import { db } from "@/lib/db";
import { callAI, type ChatMessage as AIMessage } from "@/lib/ai";
import { runProofEngine } from "@/lib/proof-engine";
import { validateAndCorrectGraphSpec } from "@/lib/graph-validator";

// Phase 91 — buildTutorSystemPrompt + TutorLearningMode extracted to a dedicated module.
// Re-export here so existing callers (both /api/tutor/chat and /api/tutor/chat/stream)
// keep compiling without any change.
export {
  buildTutorSystemPrompt,
  type TutorLearningMode,
  type BuildTutorSystemPromptOpts,
  type BuildTutorSystemPromptResult,
} from "./tutor/context-builder";

export type TutorAttachment = { type: string; url: string | null; caption: string };

// ---------------------------------------------------------------
// 1. Intent detection
// ---------------------------------------------------------------

export type TutorIntents = {
  wantsVideo: boolean;
  wantsImage: boolean;
  wantsFunctionPlot: boolean;
  wantsScatter: boolean;
  wantsBar: boolean;
  wantsHistogram: boolean;
  wantsPie: boolean;
  wantsVenn: boolean;
  wantsNumberLine: boolean;
  wantsTree: boolean;
  wantsBoxPlot: boolean;
  wantsVector: boolean;
  wantsPolygon: boolean;
  wantsNetwork: boolean;
  wantsConceptMap: boolean;
  wantsArgand: boolean;
  wantsContour: boolean;
  wantsVectorField: boolean;
  wantsTessellation: boolean;
  wantsKnot: boolean;
  wantsPictogram: boolean;
  wantsTally: boolean;
  wantsCarroll: boolean;
  wantsOgive: boolean;
  wantsUnitCircle: boolean;
  wantsTransform: boolean;
  wantsAxes3D: boolean;
  wantsTwoWay: boolean;
  wantsCSV: boolean;
  wantsERDiagram: boolean;
  wantsSteps: boolean;
  wantsSearch: boolean;
  wantsGraph: boolean;
  wantsDrawing: boolean;
};

export function detectIntents(userMessage: string): TutorIntents {
  const wantsVideo = /\bvideo\b|\bclip\b|\bwatch\b|youtube|\bsend me.*(video|clip)\b|show me.*(video|clip)\b/i.test(userMessage);
  const wantsImage = /\bimage\b|\bpicture\b|\bphoto\b|\billustration\b/i.test(userMessage) &&
                     !/draw.*(graph|chart|plot|curve|function|polygon|triangle|circle)/i.test(userMessage) &&
                     !/\bdiagram\b.*\bof\b.*\bvenn\b/i.test(userMessage);
  const wantsFunctionPlot = /\b(y\s*=|f\(x\)|graph (?:of )?(?:y|x|sin|cos|tan|x²|x\^))\b|draw\s+(?:y\s*=|f\(x\))/i.test(userMessage) &&
                            !/\b(scatter|bar|pie|histogram|box|venn|tree|number line|vector)\b/i.test(userMessage);
  const wantsScatter = /\b(scatter|data points?|plot (?:the|these|all) (?:data )?points?|line of best fit|velocity.*(vs|versus).*time|distance.*(vs|versus).*time|time series)\b/i.test(userMessage) ||
                       /\(\s*\d+\s*,\s*\d+\s*\)/.test(userMessage);
  const wantsBar = /\b(bar\s*(chart|graph)|bar plot|column chart|frequency.*by)\b/i.test(userMessage);
  const wantsHistogram = /\bhistogram\b|frequency distribution|frequency.*class\b/i.test(userMessage);
  const wantsPie = /\bpie\s*(chart)?\b|percentages?\s*(of (a whole|the))?|proportion of\b/i.test(userMessage);
  const wantsVenn = /\bvenn\b|\bset[s]?\b.*\b(union|intersection|overlap|disjoint|difference)\b/i.test(userMessage);
  const wantsNumberLine = /\bnumber line\b|inequality|x\s*[<>≤≥]|x\s*∈|\b(-?\d+)\s*[<≤]\s*x\s*[<≤]\s*(-?\d+)\b/i.test(userMessage);
  const wantsTree = /\btree diagram\b|probability tree|outcome tree/i.test(userMessage);
  const wantsBoxPlot = /\bbox\s*(and|&|-)?\s*whisker\b|\bbox\s*plot\b|quartile|five[- ]number summary/i.test(userMessage);
  const wantsVector = /\bvector(s)?\b|force diagram|\bdisplacement vector\b|\bresultant\b/i.test(userMessage) && !/vector field/i.test(userMessage);
  const wantsPolygon = /\b(triangle|quadrilateral|pentagon|hexagon|heptagon|octagon|polygon|square|rectangle|rhombus|trapezium|trapezoid|parallelogram|kite)\b/i.test(userMessage) &&
                       /draw|sketch|construct|label|illustrat/i.test(userMessage);
  const wantsNetwork = /\bnetwork graph\b|graph theory|vertices and edges|social network|friend graph/i.test(userMessage);
  const wantsConceptMap = /\bconcept map\b|\bmind map\b|\bmindmap\b|\brelationship between\b/i.test(userMessage);
  const wantsArgand = /\bargand\b|complex plane|complex number plot|plot.*\bz_\d|plot.*complex number/i.test(userMessage);
  const wantsContour = /\bcontour map\b|contour lines?|level curves?|topographic|elevation levels?/i.test(userMessage);
  const wantsVectorField = /\bvector field\b|direction field|force field|magnetic field|electric field|flow field/i.test(userMessage);
  const wantsTessellation = /\btessellat|tiling pattern|tile the plane|repeating pattern of/i.test(userMessage);
  const wantsKnot = /\btrefoil\b|\bknot diagram\b|\bfigure.?eight knot\b|\bknot theory\b/i.test(userMessage);
  const wantsPictogram = /\bpictograph\b|\bpictogram\b|picture graph|symbol.*count|emoji.*count/i.test(userMessage);
  const wantsTally = /\btally (chart|marks?)\b|count tallies/i.test(userMessage);
  const wantsCarroll = /\bcarroll (diagram|sort)\b|sort by two attributes|sort.*yes.*no/i.test(userMessage);
  const wantsOgive = /\bogive\b|cumulative frequency curve|cumulative frequency graph/i.test(userMessage);
  const wantsUnitCircle = /\bunit circle\b|sin.*cos.*circle|trig.*circle|cos θ.*sin θ/i.test(userMessage);
  const wantsTransform = /\b(reflect|rotate|translate|enlarge|transformation).* (across|in|by|through|of|line|scale factor)/i.test(userMessage) ||
                          /\breflect (triangle|shape|figure) across\b/i.test(userMessage) ||
                          /\brotate (triangle|shape|figure) (by|around)\b/i.test(userMessage);
  const wantsAxes3D = /\b3d (coordinate|axes|space|system)\b|plot.*in 3d|point.*in 3d|\(x, y, z\)|3d graph/i.test(userMessage);
  const wantsTwoWay = /\btwo[- ]way table\b|contingency table|cross[- ]tabulation/i.test(userMessage);
  const wantsCSV = /\bexcel sheet\b|\bspreadsheet\b|\bworksheet\b|\bbuild a sheet\b|make a (food capacity|payment|attendance|inventory|grade book|budget) (sheet|worksheet|spreadsheet)/i.test(userMessage);
  const wantsERDiagram = /\b(er diagram|entity.?relationship|database schema|database design|access table|ms access|simple database|build a database|design a database)/i.test(userMessage);
  const wantsSteps = /\bstep by step\b|\bstep[- ]by[- ]step\b|\bshow your work\b|\bhow to solve\b|\bwork it out\b|\bworking for\b/i.test(userMessage) ||
                     (/\bsolve\b/i.test(userMessage) && /=/i.test(userMessage));
  const wantsDrawing = /\b(draw|sketch|illustrate|visuali[sz]e|diagram|construction|construct)\b/i.test(userMessage) ||
                       /\b(create|make|show)\s+(?:me\s+)?(?:a|an|the)?\s*(?:picture|drawing|diagram|concept map|mind map)\b/i.test(userMessage);
  const wantsSearch = /\bfind\b|\bsearch\b|\blook up\b|\bwhat is\b|\bwho is\b|\bwhen did\b|\bhow does\b/i.test(userMessage) && !wantsVideo &&
                      !wantsScatter && !wantsBar && !wantsHistogram && !wantsPie && !wantsVenn &&
                      !wantsNumberLine && !wantsTree && !wantsBoxPlot && !wantsVector && !wantsPolygon;

  const wantsGraph = wantsFunctionPlot || wantsScatter || wantsBar || wantsHistogram || wantsPie ||
                     wantsVenn || wantsNumberLine || wantsTree || wantsBoxPlot || wantsVector ||
                     wantsPolygon || wantsNetwork || wantsConceptMap || wantsArgand || wantsContour ||
                     wantsVectorField || wantsTessellation || wantsKnot ||
                     wantsPictogram || wantsTally || wantsCarroll || wantsOgive || wantsUnitCircle ||
                     wantsTransform || wantsAxes3D || wantsTwoWay ||
                     wantsCSV || wantsERDiagram || wantsSteps || wantsDrawing;

  return {
    wantsVideo, wantsImage, wantsFunctionPlot, wantsScatter, wantsBar, wantsHistogram,
    wantsPie, wantsVenn, wantsNumberLine, wantsTree, wantsBoxPlot, wantsVector,
    wantsPolygon, wantsNetwork, wantsConceptMap, wantsArgand, wantsContour,
    wantsVectorField, wantsTessellation, wantsKnot, wantsPictogram, wantsTally,
    wantsCarroll, wantsOgive, wantsUnitCircle, wantsTransform, wantsAxes3D,
    wantsTwoWay, wantsCSV, wantsERDiagram, wantsSteps, wantsSearch, wantsGraph, wantsDrawing,
  };
}

// ---------------------------------------------------------------
// 2. Web search (videos / images / general context)
// ---------------------------------------------------------------

export async function runWebSearch(opts: {
  userMessage: string;
  intents: TutorIntents;
  dataSaver: boolean;
  onStatus?: (status: { phase: "start" | "done"; tool: "web_search" | "image_search"; success?: boolean }) => void;
}): Promise<{ searchContext: string; searchAttachments: TutorAttachment[] }> {
  const { userMessage, intents, dataSaver, onStatus } = opts;
  let searchContext = "";
  const searchAttachments: TutorAttachment[] = [];

  // Phase 45: skip image search entirely in Data Saver mode (saves an external call).
  // Video and general web searches are still allowed because they're cheap.
  if ((intents.wantsSearch || intents.wantsVideo || (intents.wantsImage && !dataSaver)) &&
      (intents.wantsSearch || intents.wantsVideo || intents.wantsImage)) {
    try {
      const ZAI = (await import("z-ai-web-dev-sdk")).default;
      const client = await ZAI.create();

      // For videos, explicitly search YouTube
      const searchQuery = intents.wantsVideo
        ? `${userMessage.replace(/video|clip|watch|send me|show me/gi, "").trim()} site:youtube.com`
        : userMessage;

      onStatus?.({ phase: "start", tool: "web_search" });
      const searchResult: any = await client.functions.invoke("web_search", {
        query: searchQuery,
        num: intents.wantsVideo ? 5 : 6,
      });

      // SDK returns array of SearchFunctionResultItem (not {results: [...]})
      const results: any[] = Array.isArray(searchResult)
        ? searchResult
        : (searchResult?.results ?? searchResult?.data ?? []);
      onStatus?.({ phase: "done", tool: "web_search", success: results.length > 0 });

      if (results.length > 0) {
        const resultLines = results.slice(0, 6).map((r: any) =>
          `- ${r.name ?? r.title ?? "Result"} (${r.url ?? r.link ?? ""})\n  ${r.snippet ?? r.description ?? ""}`
        ).join("\n");
        searchContext = `\n\nWEB SEARCH RESULTS for "${userMessage}":\n${resultLines}`;

        if (intents.wantsSearch && !intents.wantsVideo) {
          for (const result of results.slice(0, 4)) {
            const url = result.url ?? result.link ?? "";
            if (/^https?:\/\//i.test(url)) {
              searchAttachments.push({
                type: "source",
                url,
                caption: String(result.name ?? result.title ?? "Web source").slice(0, 180),
              });
            }
          }
        }

        // Find YouTube videos for video requests
        if (intents.wantsVideo) {
          const ytResults = results.filter((r: any) => {
            const u = r.url ?? r.link ?? "";
            return /youtube\.com\/watch|youtu\.be\//.test(u);
          }).slice(0, 2);

          for (const r of ytResults) {
            const url = r.url ?? r.link ?? "";
            searchAttachments.push({
              type: "video",
              url,
              caption: r.name ?? r.title ?? "YouTube video",
            });
          }
        }

        // Find images via image-search SDK
        if (intents.wantsImage && !dataSaver) {
          try {
            onStatus?.({ phase: "start", tool: "image_search" });
            const imageSearchRes: any = await client.images.search.create({
              query: userMessage.replace(/image|picture|photo|diagram|show me|send me/gi, "").trim(),
              count: 3,
            });
            const imageResults: any[] = imageSearchRes?.results ?? [];
            for (const r of imageResults.slice(0, 2)) {
              const imgUrl = r.original_url ?? r.url ?? r.thumbnail;
              if (imgUrl) {
                searchAttachments.push({
                  type: "image",
                  url: imgUrl,
                  caption: r.caption ?? r.title ?? "Related image",
                });
              }
            }
            onStatus?.({ phase: "done", tool: "image_search", success: imageResults.length > 0 });
          } catch (imgErr: any) {
            onStatus?.({ phase: "done", tool: "image_search", success: false });
            console.error("[tutor-engine] image search failed:", imgErr?.message);
          }
        }
      }
    } catch (e: any) {
      onStatus?.({ phase: "done", tool: "web_search", success: false });
      console.error("[tutor-engine] web search failed:", e?.message);
    }
  }

  return { searchContext, searchAttachments };
}

// ---------------------------------------------------------------
// 3. System prompt  → moved to src/lib/tutor/context-builder.ts (Phase 91)
// ---------------------------------------------------------------


// ---------------------------------------------------------------
// 4. Thinking block split
// ---------------------------------------------------------------

export function splitThinking(reply: string): { clean: string; steps: string[] } {
  const thinkingMatch = reply.match(/<thinking>([\s\S]*?)<\/thinking>/i);
  if (!thinkingMatch) return { clean: reply, steps: [] };
  const thinkingText = thinkingMatch[1].trim();
  const steps = thinkingText
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5)
    .slice(0, 10);
  return { clean: reply.replace(/<thinking>[\s\S]*?<\/thinking>/i, "").trim(), steps };
}

// ---------------------------------------------------------------
// 5. Graph spec parsing + validation + concept map fallback
// ---------------------------------------------------------------

const KNOWN_GRAPH_TYPES = new Set([
  "function", "scatter", "bar", "histogram", "pie", "venn",
  "numberline", "tree", "network", "vector", "polygon", "boxplot",
  "slopefield", "stemleaf", "frequency_polygon", "freeform",
  "argand", "contour", "vectorfield", "tessellation", "knot",
  "pictogram", "tally", "carroll", "ogive", "unitcircle",
  "transform", "axes3d", "twoway", "erdiagram", "csv", "steps", "scene",
]);

function tryParseGraphSpec(raw: string): any | null {
  let s = raw.trim();
  if (!s) return null;
  s = s.replace(/^```[\w-]*\s*/i, "").replace(/```\s*$/i, "");
  const firstBrace = s.indexOf("{");
  const lastBrace = s.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) return null;
  const jsonStr = s.slice(firstBrace, lastBrace + 1);
  try {
    const obj = JSON.parse(jsonStr);
    if (obj && typeof obj === "object" && typeof obj.type === "string" && KNOWN_GRAPH_TYPES.has(obj.type)) {
      return obj;
    }
    // Also accept old "conceptmap" tag — wrap as network type
    if (obj && typeof obj === "object" && obj.nodes && obj.edges && !obj.type) {
      return { ...obj, type: "network" };
    }
  } catch {
    return null;
  }
  return null;
}

export async function parseGraphAttachments(opts: {
  reply: string;
  userMessage: string;
  userId: string;
  intents: TutorIntents;
}): Promise<TutorAttachment[]> {
  const { reply, userMessage, userId, intents } = opts;
  const attachments: TutorAttachment[] = [];

  try {
    const foundSpecs: any[] = [];

    // 1) Fenced code blocks (ANY language tag)
    const codeBlockRe = /```([\w-]*)\s*([\s\S]*?)```/g;
    let codeBlockMatch: RegExpExecArray | null;
    while ((codeBlockMatch = codeBlockRe.exec(reply)) !== null) {
      const lang = (codeBlockMatch[1] ?? "").toLowerCase();
      const body = codeBlockMatch[2] ?? "";
      if (["bash", "sh", "shell", "python", "py", "javascript", "js", "typescript", "ts", "html", "css", "sql"].includes(lang)) {
        continue;
      }
      const spec = tryParseGraphSpec(body);
      if (spec) foundSpecs.push(spec);
    }

    // 2) Inline JSON-looking text outside code blocks
    const inlineJsonRe = /\{\s*"(?:type|title)"\s*:[^{}]*\}/g;
    const strippedReply = reply.replace(/```[\s\S]*?```/g, "");
    let inlineMatch: RegExpExecArray | null;
    while ((inlineMatch = inlineJsonRe.exec(strippedReply)) !== null) {
      const start = inlineMatch.index;
      const end = strippedReply.indexOf("}", start);
      if (end === -1) continue;
      let depth = 0;
      let lastBrace = -1;
      for (let i = start; i < strippedReply.length; i++) {
        if (strippedReply[i] === "{") depth++;
        else if (strippedReply[i] === "}") {
          depth--;
          if (depth === 0) { lastBrace = i; break; }
        }
      }
      if (lastBrace === -1) continue;
      const candidate = strippedReply.slice(start, lastBrace + 1);
      const spec = tryParseGraphSpec(candidate);
      if (spec) foundSpecs.push(spec);
    }

    // 3) Validate + correct each spec (with one AI retry on failure)
    for (const spec of foundSpecs) {
      let validation = validateAndCorrectGraphSpec(spec);

      if (!validation.valid && foundSpecs.length <= 2) {
        try {
          const fixMessages: AIMessage[] = [
            {
              role: "system",
              content:
                "You are a graph spec validator. The user asked a math/science question and your previous reply contained a graph spec that failed validation. " +
                "Output ONLY a single corrected JSON graph spec (no markdown fences, no explanation, no other text). " +
                "Use the exact same graph type but fix the listed errors. Include all required fields for that type.",
            },
            {
              role: "user",
              content:
                `The original (invalid) spec was:\n${JSON.stringify(spec, null, 2)}\n\n` +
                `Validation errors:\n- ${validation.errors.join("\n- ")}\n\n` +
                (validation.warnings.length > 0 ? `Auto-correction warnings:\n- ${validation.warnings.join("\n- ")}\n\n` : "") +
                `Output a corrected JSON spec now. Start with { and end with }. Do not include any other text.`,
            },
          ];
          const fixReply = await callAI(fixMessages, null, {
            userId,
            route: "/api/tutor/chat/retry-graph",
          });
          const trimmed = fixReply.trim().replace(/^```[\w-]*\s*/i, "").replace(/```\s*$/i, "");
          const fb = trimmed.indexOf("{");
          const lb = trimmed.lastIndexOf("}");
          if (fb !== -1 && lb !== -1 && lb > fb) {
            const retrySpec = JSON.parse(trimmed.slice(fb, lb + 1));
            const retryValidation = validateAndCorrectGraphSpec(retrySpec);
            if (retryValidation.valid) {
              console.log("[tutor-engine] graph spec retry succeeded — recovered", retrySpec.type);
              validation = retryValidation;
            } else {
              console.error("[tutor-engine] graph spec retry still invalid:", retryValidation.errors.join("; "));
            }
          }
        } catch (retryErr: any) {
          console.error("[tutor-engine] graph spec retry failed:", retryErr?.message);
        }
      }

      if (!validation.valid) {
        console.error("[tutor-engine] graph spec invalid (post-retry):", validation.errors.join("; "));
        continue;
      }
      const correctedSpec = validation.correctedSpec;

      let attachmentType = "graph";
      if (correctedSpec.type === "network") {
        const titleLower = (correctedSpec.title ?? "").toLowerCase();
        if (/concept map|mind map|mindmap/.test(titleLower) || intents.wantsConceptMap) {
          attachmentType = "conceptmap";
        }
      }
      attachments.push({
        type: attachmentType,
        url: null,
        caption: JSON.stringify(correctedSpec),
      });
    }

    // Recover when a model explains a requested drawing but omits its spec.
    // This keeps the drawing format generic and avoids one-off intent handlers.
    if (intents.wantsDrawing && !intents.wantsConceptMap && attachments.length === 0) {
      try {
        const sceneReply = await callAI([
          {
            role: "system",
            content: "Create a clear educational drawing as ONLY one JSON object. Use {\"type\":\"scene\",\"title\":\"...\",\"elements\":[...]}. Use scene elements of kind rect, circle, ellipse, line, arrow, text, or polygon. Coordinates: x 0–1000, y 0–750. Include readable labels, show important construction/relationship details, and do not output SVG, markdown, or prose.",
          },
          {
            role: "user",
            content: `Drawing requested: ${userMessage.slice(0, 1200)}\n\nTutor explanation for context: ${reply.slice(0, 1800)}`,
          },
        ], null, { userId, route: "/api/tutor/chat/retry-drawing" });
        const recovered = tryParseGraphSpec(sceneReply);
        if (recovered) {
          recovered.type = "scene";
          const validation = validateAndCorrectGraphSpec(recovered);
          if (validation.valid) {
            attachments.push({ type: "graph", url: null, caption: JSON.stringify(validation.correctedSpec) });
          }
        }
      } catch (drawingErr: any) {
        console.error("[tutor-engine] drawing recovery failed:", drawingErr?.message);
      }
    }

    // 4) Concept map fallback synthesis (from reply structure)
    if (intents.wantsConceptMap && foundSpecs.length === 0) {
      const PALETTE = ["#4F46E5", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4", "#EC4899"];
      let terms: string[] = (reply.match(/\*\*([A-Z][^*]+)\*\*/g) ?? [])
        .slice(0, 8)
        .map((s) => s.slice(2, -2).trim());
      if (terms.length < 3) {
        const headerMatches = reply.match(/^#{1,6}\s+(?:\d+\.\d+\s+)?([A-Z][^\n]+)/gm) ?? [];
        const headerTerms = headerMatches
          .map((h) => h.replace(/^#{1,6}\s+(?:\d+\.\d+\s+)?/, "").trim())
          .filter((t) => t.length >= 3 && t.length <= 30)
          .slice(0, 8);
        const seen = new Set(terms.map((t) => t.toLowerCase()));
        for (const ht of headerTerms) {
          if (!seen.has(ht.toLowerCase())) { terms.push(ht); seen.add(ht.toLowerCase()); }
        }
      }
      let topicName = "Topic";
      const topicMatch = userMessage.match(/(?:concept\s+map|mind\s+map)\s+(?:of\s+)?(.+)/i);
      if (topicMatch) {
        topicName = topicMatch[1].trim().replace(/[.?!]+$/, "").replace(/\bthe\b/gi, "").trim();
        topicName = topicName.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
        if (topicName.length > 30) topicName = topicName.slice(0, 30) + "…";
      }
      if (terms.length === 0) {
        terms = topicName !== "Topic" ? ["Definition", "Components", "Process", "Examples", "Importance"] : ["Concept A", "Concept B", "Concept C", "Concept D"];
      }
      const nodes: any[] = [{ id: "n0", label: topicName, color: "#1E40AF" }];
      terms.slice(0, 8).forEach((t, i) => {
        nodes.push({ id: `n${i + 1}`, label: t.length > 30 ? t.slice(0, 30) + "…" : t, color: PALETTE[(i + 1) % PALETTE.length] });
      });
      const edges: any[] = [];
      for (let i = 1; i < nodes.length; i++) edges.push({ from: "n0", to: `n${i}`, label: "part of" });
      const synthesized = { type: "network", title: `Concept Map: ${topicName}`, nodes, edges };
      attachments.push({ type: "conceptmap", url: null, caption: JSON.stringify(synthesized) });
    }
  } catch (parseErr: any) {
    console.error("[tutor-engine] attachment parse failed:", parseErr?.message);
  }

  return attachments;
}

// ---------------------------------------------------------------
// 6. Exam generation block
// ---------------------------------------------------------------

export function parseExamGen(reply: string): any | null {
  try {
    let examGenMatch = reply.match(/```examgen\s*([\s\S]*?)```/);
    // Some models emit a nested ```json fence INSIDE the examgen block:
    //   ```examgen
    //   ```json
    //   {...}
    //   ```
    //   ```
    // The non-greedy match then closes at the inner fence and captures
    // nothing useful, which made the inner-fence cleanup below unreachable.
    // Detect that shape and re-capture greedily (brace-slicing below
    // tolerates the trailing fence marks).
    if (examGenMatch) {
      const captured = examGenMatch[1].trim();
      if (!captured || captured.startsWith("```")) {
        const greedy = reply.match(/```examgen\s*([\s\S]*)```/);
        if (greedy) examGenMatch = greedy;
      }
    }
    if (examGenMatch) {
      let cleaned = examGenMatch[1].trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
      }
      const firstBrace = cleaned.indexOf("{");
      const lastBrace = cleaned.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1) {
        return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
      }
    }
  } catch (examParseErr: any) {
    console.error("[tutor-engine] examgen parse failed:", examParseErr?.message);
  }
  return null;
}

// Phase 86 — parse in-chat interactive quiz blocks
// Format: ```quiz { "title": "...", "questions": [...] } ```
// Returns the parsed quiz spec or null
export function parseQuiz(reply: string): any | null {
  try {
    const quizMatch = reply.match(/```quiz\s*([\s\S]*?)```/);
    if (!quizMatch) return null;
    let cleaned = quizMatch[1].trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    }
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1) return null;
    const parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    // Validate basic shape
    if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) return null;
    return parsed;
  } catch (quizParseErr: any) {
    console.error("[tutor-engine] quiz parse failed:", quizParseErr?.message);
  }
  return null;
}

// Phase 86.2 — parse draw_task blocks (user draws on canvas, AI reviews)
// Format: ```draw_task { "title": "...", "prompt": "...", "hint": "...", "expectedKeywords": [...] } ```
export function parseDrawTask(reply: string): any | null {
  try {
    const match = reply.match(/```draw_task\s*([\s\S]*?)```/);
    if (!match) return null;
    let cleaned = match[1].trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    }
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1) return null;
    const parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    if (!parsed || !parsed.prompt) return null;
    return parsed;
  } catch (err: any) {
    console.error("[tutor-engine] draw_task parse failed:", err?.message);
  }
  return null;
}

// ---------------------------------------------------------------
// 7. Post-process pipeline (graphs + examgen + proof engine)
// ---------------------------------------------------------------

export async function postProcessReply(opts: {
  reply: string;
  userMessage: string;
  userId: string;
  userGrade: string | null;
  userTrack?: string | null;  // Phase 88.1 — needed to skip proof engine for higher-ed
  intents: TutorIntents;
  thinkingSteps: string[];
  clientPlatform?: "mobile" | "web";
}): Promise<{
  reply: string;
  attachments: TutorAttachment[];
  examGen: any | null;
  proof: any | null;
  thinkingSteps: string[];
  proofThinkingSteps: string[];
}> {
  const { reply, userMessage, userId, userGrade, userTrack, intents, thinkingSteps, clientPlatform = "web" } = opts;
  const isHigherEd = userTrack === "university" || userTrack === "college" || userTrack === "tvet"
    || (userTrack === "mixed" && !!userGrade);  // unlikely but safe

  // A structured, model-authored offer lets the clients show a real handoff
  // action without guessing from topic keywords or displaying internal data.
  const workspaceMatch = reply.match(/```computer_workspace\s*([\s\S]*?)```/i);
  let workspaceOffer: { title: string; reason: string; benefit: string; workspace: string } | null = null;
  if (workspaceMatch) {
    try {
      const value = JSON.parse(workspaceMatch[1]);
      const workspace = ["computer", "design", "study", "exam", "code", "web", "modeling", "simulation", "data", "tvet"].includes(value?.workspace) ? value.workspace : null;
      if (workspace && [value.title, value.reason, value.benefit].every((part) => typeof part === "string" && part.trim().length > 0)) {
        workspaceOffer = {
          title: value.title.trim().slice(0, 80),
          reason: value.reason.trim().slice(0, 240),
          benefit: value.benefit.trim().slice(0, 240),
          workspace,
        };
      }
    } catch {}
  }
  let learnerReply = reply.replace(/\n?```computer_workspace\s*[\s\S]*?```\s*/i, "").trim();

  // Graph + concept map attachments
  const attachments = await parseGraphAttachments({
    reply: learnerReply,
    userMessage,
    userId,
    intents,
  });
  let drawingFallback = false;
  // If generation/recovery yielded no renderable drawing, offer the real
  // Study Room board as a graceful fallback instead of leaving a prose-only
  // answer that looks like the tutor ignored the drawing request.
  if (intents.wantsDrawing && !attachments.some((item) => item.type === "graph" || item.type === "conceptmap")) {
    drawingFallback = true;
    workspaceOffer ??= {
      title: "Continue the drawing on a computer",
      reason: "I could not produce a clear, renderable drawing for this request in chat.",
      benefit: "Use the larger Study Room board to sketch the construction and ask me to review your work.",
      workspace: "design",
    };
  }
  const refusalWithoutHandoff = clientPlatform === "mobile" && !workspaceOffer &&
    /\b(?:unsupported|not supported\b|not available\b|unavailable\b|too complex to handle on (?:this|a) (?:phone|mobile)|beyond (?:my|the app's|the mobile app's) (?:current )?(?:ability|capabilities|limits)|outside (?:my|the app's|the mobile app's) (?:current )?(?:ability|capabilities)|(?:I|we) (?:can't|cannot|am unable to) (?:(?:help|assist|do|draw|create|generate|render|build|run|perform|handle|support|make|edit|analy[sz]e|complete|fulfill)\b.{0,120}(?:here|in chat|on (?:this|the )?(?:phone|device)|in (?:the )?app|with the available tools|currently)?|do that|help with that|complete that|fulfill that|perform that task|support that request))/i.test(learnerReply);
  if (refusalWithoutHandoff) {
    workspaceOffer = {
      title: "Continue with the full website tutor",
      reason: "This task is beyond what the mobile app can complete in this chat.",
      benefit: "Continue this same conversation on the website and use its larger tutor workspace and available tools.",
      workspace: "computer",
    };
  }
  if (workspaceOffer) attachments.push({ type: "computer_workspace", url: null, caption: JSON.stringify(workspaceOffer) });

  // Phase 86 — In-chat interactive quiz
  // Parse the ```quiz block + strip it from the visible reply + return as attachment
  const quizSpec = parseQuiz(learnerReply);
  if (quizSpec) {
    // Strip the quiz block from the visible reply (so user doesn't see raw JSON)
    learnerReply = learnerReply.replace(/```quiz\s*[\s\S]*?```\s*/i, "").trim();
    attachments.push({
      type: "quiz",
      url: null,
      caption: JSON.stringify(quizSpec),
    });
  }

  // Phase 86.2 — Draw task (user draws on canvas, AI reviews)
  const drawTaskSpec = parseDrawTask(learnerReply);
  if (drawTaskSpec) {
    learnerReply = learnerReply.replace(/```draw_task\s*[\s\S]*?```\s*/i, "").trim();
    attachments.push({
      type: "draw_task",
      url: null,
      caption: JSON.stringify(drawTaskSpec),
    });
  }

  // Exam generation config
  const examGenRaw = parseExamGen(learnerReply);
  const examGen = examGenRaw ? {
    topic: examGenRaw.topic ?? "General",
    numQuestions: Math.min(40, Math.max(5, Number(examGenRaw.numQuestions) || 10)),
    numPages: Math.min(10, Math.max(1, Number(examGenRaw.numPages) || 2)),
    gradeLevel: examGenRaw.gradeLevel ?? userGrade ?? "General",
    examType: examGenRaw.examType ?? "kcse_style",
    difficulty: examGenRaw.difficulty ?? "medium",
  } : null;

  // Proof Data Engine — validates the reply against curriculum
  let finalReply = drawingFallback
    ? `${learnerReply}\n\nI could not create a clear drawing to display here. You can continue on the computer drawing board below; it supports freehand sketches and basic lines and circles, and I can review a saved attempt.`
    : learnerReply;
  let proof: any = null;
  // Phase 88.1 — Skip proof engine for higher-ed students.
  // The proof engine validates against K-12 curriculum + checks readability
  // for primary school levels. For university/college/tvet students, it
  // produces false warnings like "Some sentences may be too long for upper
  // primary students" — which is irrelevant + confusing for adult learners.
  if (!isHigherEd) {
    try {
      proof = await runProofEngine(learnerReply, userGrade ?? "Form 1", userMessage, userId);
      if (proof.corrections.length > 0) {
        finalReply += "\n\n---\n**🔍 Verification Notes:**\n" + proof.corrections.join("\n");
      }
      if (proof.warnings.length > 0) {
        finalReply += "\n\n**⚠️ Notes:**\n" + proof.warnings.join("\n");
      }
    } catch (proofErr: any) {
      console.error("[tutor-engine] proof engine failed:", proofErr?.message);
    }
  }

  return {
    reply: finalReply,
    attachments,
    examGen,
    proof: proof ? {
      passed: proof.passed,
      curriculumMatch: proof.curriculumMatch,
      readabilityScore: proof.readabilityScore,
      factualConfidence: proof.factualConfidence,
    } : null,
    thinkingSteps,
    proofThinkingSteps: proof?.thinkingSteps ?? [],
  };
}
