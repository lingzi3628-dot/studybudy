import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Vitest config — Phase 53.
 *
 * Before this file existed, tests could only import modules with RELATIVE
 * imports (./code-extract) because the `@/*` tsconfig alias wasn't visible
 * to vitest. That blocked testing tutor-chat-engine (imports @/lib/db etc.).
 *
 * The alias + DATABASE_URL stub let pure-logic tests import engine modules
 * whose import chains reference the Prisma client — no connection is ever
 * opened unless a query runs (these tests only call pure functions).
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    env: {
      // PrismaClient constructor validates the datasource URL format —
      // give it a syntactically valid postgres URL it will never connect to.
      DATABASE_URL: process.env.DATABASE_URL || "postgresql://test:test@localhost:5432/test",
      API_KEY_ENCRYPTION_SECRET: "0000000000000000000000000000000000000000000000000000000000000000",
    },
  },
});
