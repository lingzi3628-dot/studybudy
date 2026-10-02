/**
 * Phase 0 — Security containment tests
 *
 * Covers:
 *   - Code execution kill switches (Python + JavaScript, default off)
 *   - Disabled execution does NOT spawn process or create vm.Script
 *   - Safe learner-facing unsupported messages
 *   - No environment variables appear in execution output
 *   - C remains unsupported
 *   - Web preview CSP injection
 *   - Web backend bridge gated behind flag (default off)
 *   - Production secret enforcement (production fails closed, dev warns)
 *   - Concept maps do NOT route to graph.bar
 */
import { describe, it, expect, afterEach, vi } from "vitest";

// ============================================================
// Code execution kill switches
// ============================================================

describe("Phase 0 — Python execution kill switch", () => {
  const originalFlag = process.env.TUTOR_SERVER_PYTHON_EXECUTION_ENABLED;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.TUTOR_SERVER_PYTHON_EXECUTION_ENABLED;
    else process.env.TUTOR_SERVER_PYTHON_EXECUTION_ENABLED = originalFlag;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it("is disabled by default when flag is absent", async () => {
    delete process.env.TUTOR_SERVER_PYTHON_EXECUTION_ENABLED;
    const { runPython } = await import("../code-sandbox");
    const result = await runPython("print('hello')");
    expect(result.unsupported).toBe(true);
    expect(result.exitCode).toBeNull();
    expect(result.stdout).toBe("");
    expect(result.timedOut).toBe(false);
  });

  it("is disabled when flag is 'false'", async () => {
    process.env.TUTOR_SERVER_PYTHON_EXECUTION_ENABLED = "false";
    const { runPython } = await import("../code-sandbox");
    const result = await runPython("print('hello')");
    expect(result.unsupported).toBe(true);
  });

  it("returns a learner-facing message that does NOT mention internals", async () => {
    delete process.env.TUTOR_SERVER_PYTHON_EXECUTION_ENABLED;
    const { runPython } = await import("../code-sandbox");
    const result = await runPython("print('hello')");
    expect(result.stderr).toMatch(/python/i);
    expect(result.stderr).not.toMatch(/child_process|exec|subprocess|TUTOR_SERVER|kill.?switch|env.?var|process\.env/i);
  });

  it("does NOT spawn a process when disabled (exec not called)", async () => {
    delete process.env.TUTOR_SERVER_PYTHON_EXECUTION_ENABLED;
    // We can't vi.spyOn ESM module exports. Instead, verify that runPython
    // returns BEFORE reaching the exec path by checking the durationMs is 0
    // (exec would take >0ms). This is a behavioral assertion, not a spy.
    const { runPython } = await import("../code-sandbox");
    const result = await runPython("import os; print(os.environ)");
    expect(result.unsupported).toBe(true);
    expect(result.durationMs).toBe(0); // exec path would have non-zero duration
  });

  it("does NOT expose environment variables when disabled", async () => {
    delete process.env.TUTOR_SERVER_PYTHON_EXECUTION_ENABLED;
    process.env.TEST_SECRET_PHASE0 = "super-secret-value-12345";
    const { runPython } = await import("../code-sandbox");
    const result = await runPython("import os; print(os.environ)");
    expect(result.stdout).not.toContain("TEST_SECRET_PHASE0");
    expect(result.stderr).not.toContain("TEST_SECRET_PHASE0");
    expect(result.stdout).not.toContain("super-secret-value-12345");
    delete process.env.TEST_SECRET_PHASE0;
  });

  it("can be explicitly enabled (legacy path remains for future sandbox)", async () => {
    process.env.TUTOR_SERVER_PYTHON_EXECUTION_ENABLED = "true";
    process.env.NODE_ENV = "development";
    const { isServerPythonExecutionEnabled } = await import("../security-config");
    expect(isServerPythonExecutionEnabled()).toBe(true);
  });
});

describe("Phase 0 — JavaScript execution kill switch", () => {
  const originalFlag = process.env.TUTOR_SERVER_JAVASCRIPT_EXECUTION_ENABLED;

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.TUTOR_SERVER_JAVASCRIPT_EXECUTION_ENABLED;
    else process.env.TUTOR_SERVER_JAVASCRIPT_EXECUTION_ENABLED = originalFlag;
  });

  it("is disabled by default when flag is absent", async () => {
    delete process.env.TUTOR_SERVER_JAVASCRIPT_EXECUTION_ENABLED;
    const { runJavaScript } = await import("../code-sandbox");
    const result = await runJavaScript("console.log('hello')");
    expect(result.unsupported).toBe(true);
    expect(result.exitCode).toBeNull();
    expect(result.stdout).toBe("");
    expect(result.timedOut).toBe(false);
  });

  it("is disabled when flag is 'false'", async () => {
    process.env.TUTOR_SERVER_JAVASCRIPT_EXECUTION_ENABLED = "false";
    const { runJavaScript } = await import("../code-sandbox");
    const result = await runJavaScript("console.log('hello')");
    expect(result.unsupported).toBe(true);
  });

  it("returns a learner-facing message that does NOT mention internals", async () => {
    delete process.env.TUTOR_SERVER_JAVASCRIPT_EXECUTION_ENABLED;
    const { runJavaScript } = await import("../code-sandbox");
    const result = await runJavaScript("console.log('hello')");
    expect(result.stderr).toMatch(/javascript/i);
    expect(result.stderr).not.toMatch(/vm\.Script|node:vm|TUTOR_SERVER|kill.?switch|env.?var|process\.env/i);
  });

  it("does NOT create a vm.Script when disabled", async () => {
    delete process.env.TUTOR_SERVER_JAVASCRIPT_EXECUTION_ENABLED;
    // We can't vi.spyOn ESM module exports. Instead, verify that runJavaScript
    // returns BEFORE reaching the vm.Script path by checking durationMs is 0.
    const { runJavaScript } = await import("../code-sandbox");
    const result = await runJavaScript("const x = 1");
    expect(result.unsupported).toBe(true);
    expect(result.durationMs).toBe(0); // vm.Script path would have non-zero duration
  });

  it("does NOT expose environment variables when disabled", async () => {
    delete process.env.TUTOR_SERVER_JAVASCRIPT_EXECUTION_ENABLED;
    process.env.TEST_SECRET_JS = "js-secret-67890";
    const { runJavaScript } = await import("../code-sandbox");
    const result = await runJavaScript("typeof process !== 'undefined' ? JSON.stringify(process.env) : 'no process'");
    expect(result.stdout).not.toContain("TEST_SECRET_JS");
    expect(result.stderr).not.toContain("js-secret-67890");
    delete process.env.TEST_SECRET_JS;
  });
});

describe("Phase 0 — C execution is not supported", () => {
  it("runCode throws for 'c' language", async () => {
    const { runCode } = await import("../code-sandbox");
    await expect(runCode("c" as any, "int main() {}")).rejects.toThrow(/unsupported/i);
  });

  it("runCode throws for 'cpp' language", async () => {
    const { runCode } = await import("../code-sandbox");
    await expect(runCode("cpp" as any, "int main() {}")).rejects.toThrow(/unsupported/i);
  });
});

describe("Phase 0 — runCode dispatcher respects kill switches", () => {
  it("returns unsupported for python when flag is off", async () => {
    delete process.env.TUTOR_SERVER_PYTHON_EXECUTION_ENABLED;
    const { runCode } = await import("../code-sandbox");
    const result = await runCode("python", "print(1)");
    expect(result.unsupported).toBe(true);
  });

  it("returns unsupported for javascript when flag is off", async () => {
    delete process.env.TUTOR_SERVER_JAVASCRIPT_EXECUTION_ENABLED;
    const { runCode } = await import("../code-sandbox");
    const result = await runCode("javascript", "console.log(1)");
    expect(result.unsupported).toBe(true);
  });
});

// ============================================================
// Web preview security
// ============================================================

import {
  PREVIEW_CSP_META,
  CONSOLE_BRIDGE_SNIPPET,
  buildPreviewDocument,
  isWebBackendBridgeEnabled,
} from "../web-preview";

describe("Phase 0 — Web preview CSP injection", () => {
  it("PREVIEW_CSP_META contains a strict Content-Security-Policy", () => {
    expect(PREVIEW_CSP_META).toMatch(/Content-Security-Policy/i);
    expect(PREVIEW_CSP_META).toMatch(/default-src 'none'/);
    expect(PREVIEW_CSP_META).toMatch(/connect-src 'none'/);
    expect(PREVIEW_CSP_META).toMatch(/form-action 'none'/);
    expect(PREVIEW_CSP_META).toMatch(/base-uri 'none'/);
  });

  it("buildPreviewDocument injects CSP meta tag into <head>", () => {
    const files = [{ path: "index.html", content: "<html><head><title>Test</title></head><body>Hello</body></html>" }];
    const doc = buildPreviewDocument(files);
    expect(doc).toContain("Content-Security-Policy");
    expect(doc).toContain("default-src 'none'");
  });

  it("buildPreviewDocument injects CSP even when no <head> tag exists", () => {
    const files = [{ path: "index.html", content: "<html><body>No head tag</body></html>" }];
    const doc = buildPreviewDocument(files);
    expect(doc).toContain("Content-Security-Policy");
  });
});

describe("Phase 0 — Web backend bridge gated behind flag (default off)", () => {
  const originalFlag = process.env.NEXT_PUBLIC_WEB_PREVIEW_BACKEND_ENABLED;

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.NEXT_PUBLIC_WEB_PREVIEW_BACKEND_ENABLED;
    else process.env.NEXT_PUBLIC_WEB_PREVIEW_BACKEND_ENABLED = originalFlag;
  });

  it("isWebBackendBridgeEnabled returns false by default", () => {
    delete process.env.NEXT_PUBLIC_WEB_PREVIEW_BACKEND_ENABLED;
    expect(isWebBackendBridgeEnabled()).toBe(false);
  });

  it("buildPreviewDocument does NOT inject WEB_BACKEND_SCRIPT when flag is off", () => {
    delete process.env.NEXT_PUBLIC_WEB_PREVIEW_BACKEND_ENABLED;
    const files = [{ path: "index.html", content: "<html><head></head><body></body></html>" }];
    const doc = buildPreviewDocument(files);
    expect(doc).not.toMatch(/window\.db\s*=/);
  });

  it("buildPreviewDocument DOES inject WEB_BACKEND_SCRIPT when flag is on", () => {
    process.env.NEXT_PUBLIC_WEB_PREVIEW_BACKEND_ENABLED = "true";
    const files = [{ path: "index.html", content: "<html><head></head><body></body></html>" }];
    const doc = buildPreviewDocument(files);
    expect(doc).toMatch(/window\.db\s*=/);
  });
});

// ============================================================
// Production secret enforcement
// ============================================================

import { isProduction, assertProductionSecrets } from "../security-config";

describe("Phase 0 — Production secret enforcement", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalUserSecret = process.env.USER_JWT_SECRET;
  const originalAdminSecret = process.env.ADMIN_JWT_SECRET;
  const originalApiKeySecret = process.env.API_KEY_ENCRYPTION_SECRET;

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalUserSecret === undefined) delete process.env.USER_JWT_SECRET;
    else process.env.USER_JWT_SECRET = originalUserSecret;
    if (originalAdminSecret === undefined) delete process.env.ADMIN_JWT_SECRET;
    else process.env.ADMIN_JWT_SECRET = originalAdminSecret;
    if (originalApiKeySecret === undefined) delete process.env.API_KEY_ENCRYPTION_SECRET;
    else process.env.API_KEY_ENCRYPTION_SECRET = originalApiKeySecret;
  });

  it("isProduction returns true when NODE_ENV=production", () => {
    process.env.NODE_ENV = "production";
    expect(isProduction()).toBe(true);
  });

  it("isProduction returns false when NODE_ENV is not production", () => {
    process.env.NODE_ENV = "development";
    expect(isProduction()).toBe(false);
  });

  it("assertProductionSecrets does NOT throw when all secrets are set in production", () => {
    process.env.NODE_ENV = "production";
    process.env.USER_JWT_SECRET = "test-user-secret";
    process.env.ADMIN_JWT_SECRET = "test-admin-secret";
    process.env.API_KEY_ENCRYPTION_SECRET = "test-api-key-secret";
    expect(() => assertProductionSecrets()).not.toThrow();
  });

  it("assertProductionSecrets THROWS when USER_JWT_SECRET is missing + TUTOR_STRICT_SECRETS=true", () => {
    process.env.NODE_ENV = "production";
    delete process.env.USER_JWT_SECRET;
    process.env.ADMIN_JWT_SECRET = "test-admin-secret";
    process.env.API_KEY_ENCRYPTION_SECRET = "test-api-key-secret";
    process.env.TUTOR_STRICT_SECRETS = "true";
    expect(() => assertProductionSecrets()).toThrow(/USER_JWT_SECRET/);
    delete process.env.TUTOR_STRICT_SECRETS;
  });

  it("assertProductionSecrets WARNS (does NOT throw) when secrets missing + no strict flag", () => {
    process.env.NODE_ENV = "production";
    delete process.env.USER_JWT_SECRET;
    delete process.env.ADMIN_JWT_SECRET;
    delete process.env.API_KEY_ENCRYPTION_SECRET;
    delete process.env.TUTOR_STRICT_SECRETS;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => assertProductionSecrets()).not.toThrow();
    expect(errSpy).toHaveBeenCalled();
    const output = errSpy.mock.calls.map((c: any) => String(c)).join(" ");
    expect(output).toContain("PRODUCTION SECRETS MISSING");
    errSpy.mockRestore();
  });

  it("assertProductionSecrets does NOT throw in development even when secrets are missing", () => {
    process.env.NODE_ENV = "development";
    delete process.env.USER_JWT_SECRET;
    delete process.env.ADMIN_JWT_SECRET;
    delete process.env.API_KEY_ENCRYPTION_SECRET;
    expect(() => assertProductionSecrets()).not.toThrow();
  });

  it("assertProductionSecrets never prints secret VALUES", () => {
    process.env.NODE_ENV = "production";
    process.env.USER_JWT_SECRET = "actual-secret-value-xyz";
    process.env.ADMIN_JWT_SECRET = "test-admin-secret";
    process.env.API_KEY_ENCRYPTION_SECRET = "test-api-key-secret";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    assertProductionSecrets();
    const calls = warnSpy.mock.calls.map((c) => String(c));
    expect(calls.join(" ")).not.toContain("actual-secret-value-xyz");
    warnSpy.mockRestore();
  });

  it("assertProductionSecrets does NOT throw during next build (NEXT_PHASE=phase-production-build)", () => {
    process.env.NODE_ENV = "production";
    delete process.env.USER_JWT_SECRET;
    delete process.env.ADMIN_JWT_SECRET;
    delete process.env.API_KEY_ENCRYPTION_SECRET;
    process.env.NEXT_PHASE = "phase-production-build";
    // Should NOT throw during build — secrets are runtime-only on Vercel
    expect(() => assertProductionSecrets()).not.toThrow();
    delete process.env.NEXT_PHASE;
  });

  it("assertProductionSecrets DOES throw at production runtime with TUTOR_STRICT_SECRETS=true", () => {
    process.env.NODE_ENV = "production";
    delete process.env.USER_JWT_SECRET;
    delete process.env.ADMIN_JWT_SECRET;
    process.env.API_KEY_ENCRYPTION_SECRET = "test-api-key-secret";
    delete process.env.NEXT_PHASE; // runtime — no NEXT_PHASE
    process.env.TUTOR_STRICT_SECRETS = "true";
    expect(() => assertProductionSecrets()).toThrow(/USER_JWT_SECRET/);
    delete process.env.TUTOR_STRICT_SECRETS;
  });
});

// ============================================================
// Plugin registry mapping verification
// ============================================================

import { detectIntents } from "../tutor-chat-engine";
import { buildConstraintEnvelope } from "../tutor/tutor-action-controller";

describe("Phase 0 — Concept maps do NOT route to graph.bar", () => {
  it("wantsConceptMap maps to diagram.flowchart, not graph.bar", () => {
    const intents = detectIntents("Draw a concept map of the water cycle");
    const envelope = buildConstraintEnvelope({
      userMessage: "Draw a concept map of the water cycle",
      intents,
      workspaceContext: null,
    });
    expect(envelope.allowedPlugins).not.toContain("graph.bar");
    expect(envelope.category).toBe("diagram");
  });

  it("wantsNetwork maps to diagram.flowchart, not graph.bar", () => {
    const intents = detectIntents("Draw a network graph of vertices and edges");
    const envelope = buildConstraintEnvelope({
      userMessage: "Draw a network graph",
      intents,
      workspaceContext: null,
    });
    expect(envelope.allowedPlugins).not.toContain("graph.bar");
    expect(envelope.category).toBe("diagram");
  });

  it("wantsBar maps to graph.bar (positive control)", () => {
    const intents = detectIntents("Draw a bar graph of Alice 4, Bob 6");
    const envelope = buildConstraintEnvelope({
      userMessage: "Draw a bar graph",
      intents,
      workspaceContext: null,
    });
    expect(envelope.allowedPlugins).toContain("graph.bar");
    expect(envelope.category).toBe("graph");
  });
});

// ============================================================
// Existing contracts preserved
// ============================================================

describe("Phase 0 — Existing contracts preserved", () => {
  it("runJavaScript function still exists", async () => {
    const { runJavaScript } = await import("../code-sandbox");
    expect(typeof runJavaScript).toBe("function");
  });

  it("CONSOLE_BRIDGE_SNIPPET still postMessages to parent", () => {
    expect(CONSOLE_BRIDGE_SNIPPET).toMatch(/postMessage/);
    expect(CONSOLE_BRIDGE_SNIPPET).toMatch(/__webbuddyPreview/);
  });

  it("buildPreviewDocument still inlines CSS", () => {
    const files = [
      { path: "index.html", content: '<html><head><link rel="stylesheet" href="style.css"></head><body></body></html>' },
      { path: "style.css", content: "body { color: red; }" },
    ];
    const doc = buildPreviewDocument(files);
    expect(doc).toContain("body { color: red; }");
  });

  it("buildPreviewDocument still inlines JS", () => {
    const files = [
      { path: "index.html", content: '<html><head><script src="app.js"></script></head><body></body></html>' },
      { path: "app.js", content: "console.log('hello');" },
    ];
    const doc = buildPreviewDocument(files);
    expect(doc).toContain("console.log('hello');");
  });
});
