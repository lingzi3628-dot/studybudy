import { describe, it, expect } from "vitest";
import {
  RUNBOOKS, getRunbook, gradeQuiz, generateSystemdUnit, generateCaddyfile,
  generateVercelScript, generateRailwayScript,
} from "./deploy-runbooks";

describe("runbook catalog", () => {
  it("ships Vercel, Railway, and VPS+Caddy runbooks", () => {
    expect(RUNBOOKS.map((r) => r.id).sort()).toEqual(["railway", "vercel", "vps-caddy"]);
    for (const r of RUNBOOKS) {
      expect(r.steps.length).toBeGreaterThanOrEqual(4);
      expect(r.quiz.length).toBeGreaterThanOrEqual(2);
      for (const q of r.quiz) {
        expect(q.options.length).toBeGreaterThanOrEqual(3);
        expect(q.correctIndex).toBeGreaterThanOrEqual(0);
        expect(q.correctIndex).toBeLessThan(q.options.length);
        expect(q.explanation.length).toBeGreaterThan(10);
      }
    }
  });

  it("runbook steps have titles, bodies, and at least one generated artifact overall", () => {
    for (const r of RUNBOOKS) {
      for (const s of r.steps) {
        expect(s.title.length).toBeGreaterThan(3);
        expect(s.body.length).toBeGreaterThan(20);
      }
      expect(r.steps.some((s) => s.generates)).toBe(true);
    }
  });

  it("getRunbook resolves by id", () => {
    expect(getRunbook("vercel")?.platform).toBe("Vercel");
    expect(getRunbook("nope")).toBeUndefined();
  });
});

describe("gradeQuiz", () => {
  it("passes only on a perfect score (the deploy gate)", () => {
    const rb = getRunbook("vps-caddy")!;
    const perfect = rb.quiz.map((q) => q.correctIndex);
    expect(gradeQuiz(rb, perfect).passed).toBe(true);
    expect(gradeQuiz(rb, perfect).correct).toBe(rb.quiz.length);
    const wrong = rb.quiz.map((q) => (q.correctIndex + 1) % q.options.length);
    expect(gradeQuiz(rb, wrong).passed).toBe(false);
    expect(gradeQuiz(rb, wrong).correct).toBe(0);
  });

  it("reports per-question verdicts", () => {
    const rb = getRunbook("vercel")!;
    const answers = rb.quiz.map((q, i) => (i === 0 ? q.correctIndex : (q.correctIndex + 1) % q.options.length));
    const g = gradeQuiz(rb, answers);
    expect(g.perQuestion[0]).toBe(true);
    expect(g.perQuestion[1]).toBe(false);
  });
});

describe("generators", () => {
  it("systemd unit includes the app config and hardening", () => {
    const unit = generateSystemdUnit({
      appName: "my-app",
      workingDirectory: "/home/dev/app",
      execStart: "/usr/bin/node server.js",
      port: 3000,
    });
    expect(unit).toContain("[Unit]");
    expect(unit).toContain("Description=my-app");
    expect(unit).toContain("WorkingDirectory=/home/dev/app");
    expect(unit).toContain("ExecStart=/usr/bin/node server.js");
    expect(unit).toContain("Environment=PORT=3000");
    expect(unit).toContain("Restart=on-failure");
    expect(unit).toContain("WantedBy=multi-user.target");
    expect(unit).toContain("NoNewPrivileges=true");
  });

  it("Caddyfile proxies to the upstream and sets HSTS", () => {
    const cf = generateCaddyfile("app.example.com", 3000);
    expect(cf).toContain("app.example.com {");
    expect(cf).toContain("reverse_proxy localhost:3000");
    expect(cf).toContain("Strict-Transport-Security");
    expect(cf).toContain("log {");
  });

  it("deploy scripts set -euo pipefail and end with the deploy step", () => {
    const v = generateVercelScript();
    expect(v).toContain("set -euo pipefail");
    expect(v).toContain("vercel --prod");
    expect(v).toContain("prisma migrate deploy");
    const r = generateRailwayScript();
    expect(r).toContain("set -euo pipefail");
    expect(r).toContain("railway up");
    expect(r).toContain("--database postgres");
  });
});
