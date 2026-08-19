/**
 * End-to-end test of the /api/search/images endpoint logic.
 * Uses AbortController (more compatible than AbortSignal.timeout).
 *
 * Run with: bun run scripts/test-images-api.ts
 */
const POLLINATIONS = "https://image.pollinations.ai/prompt";

async function fetchImage(prompt: string, seed: number): Promise<{ ok: boolean; bytes?: number; error?: string; dataUrl?: string }> {
  const url = `${POLLINATIONS}/${encodeURIComponent(prompt)}?width=512&height=512&seed=${seed}&nologo=true`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 30_000);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; StudyBuddyBot/1.0)",
          "Accept": "image/*,*/*",
        },
      });
      clearTimeout(tid);

      if (res.status === 429) {
        console.log(`  attempt ${attempt}: 429, retrying in ${1500 * attempt}ms`);
        await new Promise((r) => setTimeout(r, 1500 * attempt));
        continue;
      }
      if (!res.ok) {
        console.log(`  attempt ${attempt}: HTTP ${res.status}`);
        await new Promise((r) => setTimeout(r, 500 * attempt));
        continue;
      }
      const buf = await res.arrayBuffer();
      if (buf.byteLength < 100) {
        return { ok: false, error: "empty image" };
      }
      const b64 = Buffer.from(buf).toString("base64");
      return { ok: true, bytes: buf.byteLength, dataUrl: `data:image/jpeg;base64,${b64.slice(0, 30)}...` };
    } catch (e: any) {
      console.log(`  attempt ${attempt} error:`, e?.message);
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  return { ok: false, error: "failed after 3 attempts" };
}

console.log("Testing sequential image fetch (count=2)...");
const prompt = "photosynthesis";
const timestamp = Date.now();
const images = [];

for (let i = 0; i < 2; i++) {
  // Pollinations rejects seed values > 999,999 with HTTP 500.
  const seed = Math.floor(Math.random() * 999_999) + i * 7;
  console.log(`\nImage ${i+1} (seed=${seed}):`);
  const result = await fetchImage(prompt, seed);
  if (result.ok) {
    console.log(`  ✓ Got ${result.bytes} bytes`);
    images.push(result.dataUrl);
  } else {
    console.log(`  ✗ Failed: ${result.error}`);
  }
  if (i < 1) await new Promise((r) => setTimeout(r, 500));
}

console.log(`\n=== Result: ${images.length}/2 images fetched ===`);
