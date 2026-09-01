#!/usr/bin/env node
/**
 * Copies sql.js's WASM binary into public/ so the browser sandbox can load it
 * via locateFile: () => "/sql-wasm.wasm". Wired as predev/prebuild in package.json.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const src = join(process.cwd(), "node_modules", "sql.js", "dist", "sql-wasm.wasm");
const outDir = join(process.cwd(), "public");

if (!existsSync(src)) {
  console.error("[copy-sql-wasm] node_modules/sql.js/dist/sql-wasm.wasm not found — run npm install first.");
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
copyFileSync(src, join(outDir, "sql-wasm.wasm"));
console.log("[copy-sql-wasm] public/sql-wasm.wasm updated.");
