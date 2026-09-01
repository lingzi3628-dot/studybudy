#!/usr/bin/env node
/**
 * Packages the Next.js standalone output for self-hosted deploys
 * (copies .next/static and public/ into .next/standalone).
 *
 * On Vercel, `output: "standalone"` is disabled (Vercel traces and packages
 * its own output — enabling it there breaks file tracing with
 * `ENOENT .next/next-server.js.nft.json`), so this is a no-op.
 */
import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";

const standaloneDir = join(process.cwd(), ".next", "standalone");

if (!existsSync(standaloneDir)) {
  console.log("[package-standalone] no .next/standalone output (Vercel build) — skipping.");
  process.exit(0);
}

console.log("[package-standalone] copying static assets into standalone output…");
cpSync(join(process.cwd(), ".next", "static"), join(standaloneDir, ".next", "static"), {
  recursive: true,
});
if (existsSync(join(process.cwd(), "public"))) {
  cpSync(join(process.cwd(), "public"), join(standaloneDir, "public"), { recursive: true });
}
console.log("[package-standalone] done — run `bun .next/standalone/server.js` to start.");
