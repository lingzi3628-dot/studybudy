/**
 * Phase 9 debug — probe Tools Hub to discover the correct endpoint IDs.
 * Usage: npx tsx scripts/probe-tools-hub.ts
 *
 * Tests multiple possible endpoint paths for each tool and reports which
 * ones return 200 vs 404 vs other errors.
 */
const BASE_URL = process.env.TOOLHUB_BASE_URL || "https://toolhub.space-z.ai";
const API_KEY = process.argv[2] || "";

if (!API_KEY) {
  console.error("Usage: npx tsx scripts/probe-tools-hub.ts <api-key>");
  console.error("Get your key from the Tools Hub dashboard.");
  process.exit(1);
}

// All possible tool IDs we want to discover
const TOOLS_TO_PROBE = [
  // Code sandbox (known working)
  "sandbox",
  // AI Tutor
  "tutor",
  // TTS / Lesson Narrator
  "tts", "narrator", "lesson-narrator", "speak", "text-to-speech",
  // ASR / Voice Answer
  "asr", "transcribe", "voice", "dictation", "speech-to-text", "stt",
  // VLM / Diagram Explainer
  "vlm", "vision", "diagram", "image-explain", "explain-image",
  // Image generation
  "image-gen", "image", "generate-image", "image-generation", "draw", "dalle",
  // Web search
  "search", "web-search", "research", "web-search-assistant",
  // Web reader / content extractor
  "web-reader", "extract", "reader", "web-extract", "content-extractor",
];

async function probeEndpoint(toolId: string): Promise<{ status: number; body: string }> {
  try {
    const res = await fetch(`${BASE_URL}/api/tools/${toolId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
        "X-Hub-Key": API_KEY,
      },
      body: JSON.stringify({ test: true }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.text().catch(() => "");
    return { status: res.status, body: body.slice(0, 300) };
  } catch (err: any) {
    return { status: 0, body: `Network error: ${err?.message ?? err}` };
  }
}

async function main() {
  console.log(`\nProbing Tools Hub at ${BASE_URL}`);
  console.log(`API key: ${API_KEY.slice(0, 8)}...${API_KEY.slice(-4)}\n`);
  console.log("Testing each possible tool endpoint...\n");

  const results: { toolId: string; status: number; body: string }[] = [];

  for (const toolId of TOOLS_TO_PROBE) {
    process.stdout.write(`  /api/tools/${toolId}... `);
    const result = await probeEndpoint(toolId);
    results.push({ toolId, ...result });

    if (result.status === 0) {
      console.log(`❌ NETWORK ERROR`);
    } else if (result.status === 200) {
      console.log(`✅ 200 OK`);
    } else if (result.status === 400) {
      console.log(`🟡 400 (exists but bad request — endpoint IS valid)`);
    } else if (result.status === 401 || result.status === 403) {
      console.log(`🟡 ${result.status} (auth issue — endpoint IS valid)`);
    } else if (result.status === 404) {
      console.log(`❌ 404 (endpoint doesn't exist)`);
    } else if (result.status === 405) {
      console.log(`🟡 405 (method not allowed — try GET?)`);
    } else {
      console.log(`🟡 ${result.status}`);
    }
  }

  // Summary
  console.log("\n=== SUMMARY ===");
  console.log("\n✅ Working endpoints (200):");
  results.filter(r => r.status === 200).forEach(r => console.log(`  /api/tools/${r.toolId}`));

  console.log("\n🟡 Valid endpoints (400/401/403 — exists but needs correct params):");
  results.filter(r => [400, 401, 403].includes(r.status)).forEach(r => {
    console.log(`  /api/tools/${r.toolId} → ${r.status}: ${r.body.slice(0, 100)}`);
  });

  console.log("\n❌ Not found (404):");
  results.filter(r => r.status === 404).forEach(r => console.log(`  /api/tools/${r.toolId}`));

  // Also try GET /api/plugins to see the actual tool list
  console.log("\n=== GET /api/plugins ===");
  try {
    const res = await fetch(`${BASE_URL}/api/plugins`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "X-Hub-Key": API_KEY,
      },
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    console.log(`Status: ${res.status}`);
    console.log(`Body: ${text.slice(0, 1000)}`);
  } catch (err: any) {
    console.log(`Error: ${err?.message}`);
  }

  console.log("\nDone. Copy the ✅ or 🟡 endpoints — those are the real tool IDs.");
}

main().catch(e => { console.error(e); process.exit(1); });
