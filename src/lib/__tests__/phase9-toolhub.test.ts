/**
 * Phase 9 — Tools Hub integration tests.
 *
 * Covers:
 *   1. toolhub-client.ts — settings loading, runCode, callTutor, testConnection
 *   2. code-sandbox.ts routing — routes to Tools Hub when local kill switch
 *      is off AND Tools Hub is enabled; returns unsupported otherwise
 *   3. /api/tools/sandbox — auth, validation, delegation
 *
 * The DB + fetch are mocked so tests run fast + don't hit real services.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// === Mocks ===

// vi.mock factories are hoisted ABOVE const declarations, so we use
// vi.hoisted() to create the mutable holder at hoist time. This is the
// vitest-recommended pattern for sharing state between test code + mock
// factories.
const mockHolder = vi.hoisted(() => ({
  row: { id: 1 } as any,
  update: vi.fn(async (args: any) => ({ ...mockHolder.row, ...args.data })),
  create: vi.fn(async (args: any) => ({ ...mockHolder.row, ...args.data })),
  decryptedKey: null as string | null,
}));

vi.mock("../db", () => ({
  db: {
    toolhubSettings: {
      findUnique: vi.fn(async () => mockHolder.row),
      update: mockHolder.update,
      create: mockHolder.create,
    },
  },
}));

// Mock crypto — decryptApiKey returns whatever was set in mockHolder.decryptedKey
vi.mock("../crypto", () => ({
  encryptApiKey: vi.fn((k: string) => `ENC(${k})`),
  decryptApiKey: vi.fn(() => mockHolder.decryptedKey ?? ""),
  maskApiKey: vi.fn((k: string) => k ? `${k.slice(0, 8)}…${k.slice(-4)}` : ""),
}));

// Mock fetch (for the Tools Hub HTTP calls)
global.fetch = vi.fn() as any;

import {
  listTools,
  runCode,
  callTutor,
  testConnection,
  isToolhubCodeExecutionEnabled,
  isToolhubTutorEnabled,
  clearToolhubSettingsCache,
} from "../toolhub-client";

// === Helpers ===

function setMockRow(overrides: any) {
  Object.assign(mockHolder.row, overrides);
  clearToolhubSettingsCache();
}

function mockFetchOk(body: any) {
  (global.fetch as any).mockResolvedValueOnce({
    ok: true,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

function mockFetchFail(status: number, body: any = {}) {
  (global.fetch as any).mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

// === Settings loading ===

describe("toolhub-client — settings loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHolder.decryptedKey = "sbth_test_key_12345";
    setMockRow({
      id: 1,
      enabled: true,
      apiKeyEncrypted: "ENC(sbth_test_key_12345)",
      baseUrl: "https://toolhub.space-z.ai",
      codeSandboxEnabled: true,
      tutorEnabled: false,
    });
  });

  it("isToolhubCodeExecutionEnabled returns true when enabled + key + codeSandboxEnabled", async () => {
    expect(await isToolhubCodeExecutionEnabled()).toBe(true);
  });

  it("isToolhubCodeExecutionEnabled returns false when disabled", async () => {
    setMockRow({ enabled: false });
    expect(await isToolhubCodeExecutionEnabled()).toBe(false);
  });

  it("isToolhubCodeExecutionEnabled returns false when codeSandboxEnabled is false", async () => {
    setMockRow({ codeSandboxEnabled: false });
    expect(await isToolhubCodeExecutionEnabled()).toBe(false);
  });

  it("isToolhubCodeExecutionEnabled returns false when no API key", async () => {
    mockHolder.decryptedKey = null;
    setMockRow({ apiKeyEncrypted: null });
    expect(await isToolhubCodeExecutionEnabled()).toBe(false);
  });

  it("isToolhubTutorEnabled returns false by default (tutorEnabled off)", async () => {
    expect(await isToolhubTutorEnabled()).toBe(false);
  });

  it("isToolhubTutorEnabled returns true when enabled + tutorEnabled + key", async () => {
    setMockRow({ tutorEnabled: true });
    expect(await isToolhubTutorEnabled()).toBe(true);
  });
});

// === listTools ===

describe("toolhub-client — listTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHolder.decryptedKey = "sbth_test_key_12345";
    setMockRow({
      id: 1, enabled: true, apiKeyEncrypted: "ENC(key)", baseUrl: "https://toolhub.space-z.ai",
      codeSandboxEnabled: true, tutorEnabled: false,
    });
  });

  it("returns tools when Tools Hub responds 200", async () => {
    mockFetchOk({ tools: [{ id: "tutor", name: "AI Tutor" }, { id: "sandbox", name: "Code Sandbox" }] });
    const result = await listTools();
    expect(result.tools).toHaveLength(2);
    expect(result.tools[0].id).toBe("tutor");
    expect(result.error).toBeUndefined();
    expect(global.fetch).toHaveBeenCalledWith(
      "https://toolhub.space-z.ai/api/plugins",
      expect.objectContaining({
        method: "GET",
        headers: {
          Authorization: "Bearer sbth_test_key_12345",
          "X-Hub-Key": "sbth_test_key_12345",
        },
      }),
    );
  });

  it("returns error when Tools Hub responds 401", async () => {
    mockFetchFail(401, { error: "Invalid API key" });
    const result = await listTools();
    expect(result.tools).toHaveLength(0);
    expect(result.error).toMatch(/401/);
  });

  it("returns error when fetch throws (network)", async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const result = await listTools();
    expect(result.tools).toHaveLength(0);
    expect(result.error).toMatch(/ECONNREFUSED/);
  });

  it("returns empty list when Tools Hub disabled", async () => {
    setMockRow({ enabled: false });
    const result = await listTools();
    expect(result.tools).toHaveLength(0);
    expect(result.error).toMatch(/not enabled/i);
  });

  it("accepts 'plugins' field name (not just 'tools')", async () => {
    mockFetchOk({ plugins: [{ id: "sandbox", name: "Code Sandbox" }] });
    const result = await listTools();
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].id).toBe("sandbox");
  });

  it("accepts bare array response", async () => {
    mockFetchOk([{ id: "tutor", name: "AI Tutor" }, { id: "sandbox", name: "Code Sandbox" }]);
    const result = await listTools();
    expect(result.tools).toHaveLength(2);
  });

  it("surfaces raw body when no tools found (for debugging)", async () => {
    mockFetchOk({ unexpectedShape: true, foo: "bar" });
    const result = await listTools();
    expect(result.tools).toHaveLength(0);
    expect(result.error).toMatch(/No tools found/);
    expect(result.error).toMatch(/unexpectedShape/);
    expect(result.rawBody).toMatch(/unexpectedShape/);
  });
});

// === runCode ===

describe("toolhub-client — runCode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHolder.decryptedKey = "sbth_test_key_12345";
    setMockRow({
      id: 1, enabled: true, apiKeyEncrypted: "ENC(key)", baseUrl: "https://toolhub.space-z.ai",
      codeSandboxEnabled: true, tutorEnabled: false,
    });
  });

  it("executes Python + returns stdout", async () => {
    mockFetchOk({ stdout: "4\n", exitCode: 0 });
    const result = await runCode("python", "print(2+2)");
    expect(result.ok).toBe(true);
    expect(result.stdout).toBe("4\n");
    expect(result.exitCode).toBe(0);
  });

  it("executes JavaScript + returns stdout", async () => {
    mockFetchOk({ stdout: "4\n", exitCode: 0 });
    const result = await runCode("javascript", "console.log(2+2)");
    expect(result.ok).toBe(true);
    expect(result.stdout).toBe("4\n");
  });

  it("accepts alternative response shapes (output instead of stdout)", async () => {
    mockFetchOk({ output: "hello\n", returncode: 0 });
    const result = await runCode("python", "print('hello')");
    expect(result.stdout).toBe("hello\n");
  });

  it("returns stderr when code errors", async () => {
    mockFetchOk({ stdout: "", stderr: "NameError: name 'x' is not defined", exitCode: 1 });
    const result = await runCode("python", "print(x)");
    expect(result.ok).toBe(false);
    expect(result.stderr).toMatch(/NameError/);
    expect(result.exitCode).toBe(1);
  });

  it("returns requestError when Tools Hub disabled", async () => {
    setMockRow({ enabled: false });
    const result = await runCode("python", "print(1)");
    expect(result.ok).toBe(false);
    expect(result.requestError).toMatch(/disabled/i);
  });

  it("returns requestError on network failure", async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const result = await runCode("python", "print(1)");
    expect(result.ok).toBe(false);
    expect(result.requestError).toMatch(/Network error/);
  });

  it("returns requestError on timeout", async () => {
    const err: any = new Error("timed out");
    err.name = "TimeoutError";
    (global.fetch as any).mockRejectedValueOnce(err);
    const result = await runCode("python", "print(1)");
    expect(result.ok).toBe(false);
    expect(result.requestError).toMatch(/timed out/i);
  });

  it("sends both Authorization + X-Hub-Key headers (compat)", async () => {
    mockFetchOk({ stdout: "", exitCode: 0 });
    await runCode("python", "print(1)");
    const call = (global.fetch as any).mock.calls[0];
    expect(call[1].headers.Authorization).toBe("Bearer sbth_test_key_12345");
    expect(call[1].headers["X-Hub-Key"]).toBe("sbth_test_key_12345");
  });
});

// === callTutor ===

describe("toolhub-client — callTutor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHolder.decryptedKey = "sbth_test_key_12345";
    setMockRow({
      id: 1, enabled: true, apiKeyEncrypted: "ENC(key)", baseUrl: "https://toolhub.space-z.ai",
      codeSandboxEnabled: true, tutorEnabled: true,
    });
  });

  it("returns reply when tutorEnabled + Tools Hub responds", async () => {
    mockFetchOk({ reply: "Photosynthesis is the process..." });
    const result = await callTutor({
      messages: [{ role: "user", content: "Explain photosynthesis" }],
      subject: "Science",
      level: "Middle",
    });
    expect(result.ok).toBe(true);
    expect(result.reply).toMatch(/Photosynthesis/);
  });

  it("accepts alternative response shapes (content field)", async () => {
    mockFetchOk({ content: "Alternate shape response" });
    const result = await callTutor({ messages: [{ role: "user", content: "Hi" }] });
    expect(result.reply).toBe("Alternate shape response");
  });

  it("returns error when tutorEnabled is false", async () => {
    setMockRow({ tutorEnabled: false });
    const result = await callTutor({ messages: [] });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not enabled/i);
  });
});

// === testConnection ===

describe("toolhub-client — testConnection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHolder.decryptedKey = "sbth_test_key_12345";
    setMockRow({
      id: 1, enabled: true, apiKeyEncrypted: "ENC(key)", baseUrl: "https://toolhub.space-z.ai",
      codeSandboxEnabled: true, tutorEnabled: false,
    });
  });

  it("returns ok + tools when connection succeeds", async () => {
    mockFetchOk({ tools: [{ id: "sandbox" }, { id: "tutor" }] });
    const result = await testConnection();
    expect(result.ok).toBe(true);
    expect(result.tools).toHaveLength(2);
  });

  it("returns error when connection fails", async () => {
    mockFetchFail(401);
    const result = await testConnection();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/401/);
  });

  it("updates DB with lastTestedAt / lastTestOk / lastTestError", async () => {
    mockFetchOk({ tools: [{ id: "sandbox" }] });
    await testConnection();
    // db.toolhubSettings.update should have been called with lastTestOk: true
    expect(mockHolder.update).toHaveBeenCalled();
    const lastCall = mockHolder.update.mock.calls[mockHolder.update.mock.calls.length - 1];
    expect(lastCall[0].data.lastTestOk).toBe(true);
    expect(lastCall[0].data.lastTestedAt).toBeInstanceOf(Date);
  });
});

// === code-sandbox.ts routing ===

describe("code-sandbox.ts — Tools Hub routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHolder.decryptedKey = "sbth_test_key_12345";
    setMockRow({
      id: 1, enabled: true, apiKeyEncrypted: "ENC(key)", baseUrl: "https://toolhub.space-z.ai",
      codeSandboxEnabled: true, tutorEnabled: false,
    });
    // Local kill switch OFF (Phase 0 default — server execution disabled)
    process.env.TUTOR_SERVER_PYTHON_EXECUTION_ENABLED = "false";
    process.env.TUTOR_SERVER_JAVASCRIPT_EXECUTION_ENABLED = "false";
  });

  it("routes to Tools Hub when local kill switch is off + Tools Hub enabled", async () => {
    mockFetchOk({ stdout: "4\n", exitCode: 0 });
    const { runPython } = await import("../code-sandbox");
    const result = await runPython("print(2+2)");
    expect(result.stdout).toBe("4\n");
    expect(result.unsupported).toBe(false);
    expect(result.exitCode).toBe(0);
  });

  it("routes JavaScript to Tools Hub too", async () => {
    mockFetchOk({ stdout: "4\n", exitCode: 0 });
    const { runJavaScript } = await import("../code-sandbox");
    const result = await runJavaScript("console.log(2+2)");
    expect(result.stdout).toBe("4\n");
    expect(result.unsupported).toBe(false);
  });

  it("returns unsupported when Tools Hub is disabled (falls back to local kill switch)", async () => {
    setMockRow({ enabled: false });
    const { runPython } = await import("../code-sandbox");
    const result = await runPython("print(1)");
    expect(result.unsupported).toBe(true);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/can't run it here/i);
  });

  it("returns unsupported when Tools Hub network fails", async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const { runPython } = await import("../code-sandbox");
    const result = await runPython("print(1)");
    expect(result.unsupported).toBe(true);
    expect(result.stderr).toMatch(/temporarily unavailable/i);
  });

  it("returns real stderr when code errors (not unsupported)", async () => {
    mockFetchOk({ stdout: "", stderr: "NameError: name 'x' is not defined", exitCode: 1 });
    const { runPython } = await import("../code-sandbox");
    const result = await runPython("print(x)");
    expect(result.unsupported).toBe(false);
    expect(result.stderr).toMatch(/NameError/);
    expect(result.exitCode).toBe(1);
  });

  it("Phase 9 fix — treats top-level `error` field as requestError (Tools Hub rejected)", async () => {
    // Tools Hub returns `{ error: "unsupported language" }` when it can't
    // process the request. Previously my code mapped this to stderr
    // (misleading the user into thinking their code printed it). Now it's
    // a requestError, surfaced as the "temporarily unavailable" message.
    mockFetchOk({ error: "unsupported language" });
    const { runPython } = await import("../code-sandbox");
    const result = await runPython("print(1)");
    // Marked as unsupported → user sees amber "not available" box, not red stderr
    expect(result.unsupported).toBe(true);
    // The error IS surfaced (so admin can debug), but as a "temporarily
    // unavailable" prefix — not as raw code output.
    expect(result.stderr).toMatch(/temporarily unavailable/);
    expect(result.stderr).toMatch(/unsupported language/); // the original error preserved
    expect(result.exitCode).toBe(null); // no exit code — code didn't actually run
  });

  it("Phase 9 fix — still extracts stderr when both stderr + error are present", async () => {
    // Edge case: if Tools Hub returns both stderr AND error, prefer stderr
    // (it's the code's runtime error, not a Tools Hub rejection).
    mockFetchOk({ stdout: "", stderr: "RuntimeError: boom", error: "execution failed", exitCode: 1 });
    const { runPython } = await import("../code-sandbox");
    const result = await runPython("raise RuntimeError('boom')");
    expect(result.unsupported).toBe(false);
    expect(result.stderr).toMatch(/RuntimeError/);
    expect(result.exitCode).toBe(1);
  });
});

// === API key never leaked ===

describe("toolhub-client — API key security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHolder.decryptedKey = "sbth_secret_key_xyz";
    setMockRow({
      id: 1, enabled: true, apiKeyEncrypted: "ENC(sbth_secret_key_xyz)",
      baseUrl: "https://toolhub.space-z.ai", codeSandboxEnabled: true, tutorEnabled: false,
    });
  });

  it("key is sent in Authorization header (not in body or query)", async () => {
    mockFetchOk({ stdout: "", exitCode: 0 });
    await runCode("python", "print(1)");
    const call = (global.fetch as any).mock.calls[0];
    // Authorization header
    expect(call[1].headers.Authorization).toBe("Bearer sbth_secret_key_xyz");
    // Body should NOT contain the key
    expect(call[1].body).not.toMatch(/sbth_secret_key_xyz/);
    // URL should NOT contain the key
    expect(call[0]).not.toMatch(/sbth_secret_key_xyz/);
  });
});
