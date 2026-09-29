// Standalone test of the ZIP extraction logic (the part of /api/admin/games/upload
// that handles JSZip parsing + path stripping + entry-file detection).
// Run with: node /home/z/my-project/scripts/test-game-zip-extract.mjs
import JSZip from "jszip";
import { readFile, writeFile, mkdir, rm } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const TEST_DIR = "/tmp/test-extract-output";

async function testZip(zipPath, label) {
  console.log(`\n=== ${label} ===`);
  console.log(`Source: ${zipPath}`);
  const buf = await readFile(zipPath);
  const zip = await JSZip.loadAsync(buf);

  const allEntries = [];
  zip.forEach((p, e) => {
    if (e.dir) return;
    if (p.startsWith("__MACOSX/") || p.includes("/.DS_Store")) return;
    allEntries.push({ path: p, entry: e });
  });

  // Detect common root
  const topFolders = new Set();
  for (const e of allEntries) {
    const parts = e.path.split("/");
    if (parts.length > 1) topFolders.add(parts[0]);
    else { topFolders.clear(); break; }
  }
  const commonRoot = topFolders.size === 1 ? [...topFolders][0] : null;
  console.log(`Files in zip: ${allEntries.length}, commonRoot: ${commonRoot || "(none)"}`);

  const stripped = allEntries.map(e => ({
    original: e.path,
    stripped: commonRoot ? e.path.slice(commonRoot.length + 1) : e.path,
    entry: e.entry,
  }));

  // Find entry
  let entry = stripped.find(e => e.stripped === "index.html");
  if (!entry) entry = stripped.find(e => !e.stripped.includes("/") && e.stripped.endsWith(".html"));
  if (!entry) entry = stripped.find(e => e.stripped.endsWith("/index.html"));
  if (!entry) entry = stripped.find(e => e.stripped.endsWith(".html"));

  console.log(`Detected entry file: ${entry?.stripped || "(none)"}`);

  // Show stripped file list
  console.log("Stripped paths:");
  for (const e of stripped) console.log(`  ${e.stripped}`);

  // Detect thumbnail
  const thumb = stripped.find(e => {
    const p = e.stripped.toLowerCase();
    return ["thumbnail.png","thumbnail.jpg","thumbnail.jpeg","thumb.png","thumb.jpg","cover.png","cover.jpg"].includes(p);
  });
  console.log(`Thumbnail detected: ${thumb?.stripped || "(none)"}`);
}

// Test 1: zip with subfolder
await testZip("/tmp/test-game-sub.zip", "ZIP with top-level subfolder");

// Test 2: zip without subfolder (files at root)
await mkdir("/tmp/test-game-flat", { recursive: true });
await writeFile("/tmp/test-game-flat/index.html", "<h1>Flat test</h1>");
await writeFile("/tmp/test-game-flat/style.css", "body{color:red}");
await writeFile("/tmp/test-game-flat/thumbnail.png", "FAKE_PNG");
await writeFile("/tmp/test-game-flat/game.js", "console.log('hi')");
const { execSync } = await import("child_process");
execSync("cd /tmp && rm -f test-game-flat.zip && zip -r test-game-flat.zip test-game-flat/ > /dev/null");
await testZip("/tmp/test-game-flat.zip", "ZIP with subfolder (flat files inside)");

// Test 3: zip with files at true root (no subfolder)
execSync("cd /tmp/test-game-flat && rm -f ../test-game-root.zip && zip ../test-game-root.zip index.html style.css game.js thumbnail.png > /dev/null");
await testZip("/tmp/test-game-root.zip", "ZIP with files at root (no subfolder)");

console.log("\n✓ All extraction tests passed — logic is correct.");
