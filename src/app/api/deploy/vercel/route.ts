import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/deploy/vercel — Phase 54 (WebBuddy)
 *
 * Deploys a WebBuddy project's static files to Vercel using the USER'S OWN
 * token (BYOT — Bring Your Own Token). The token is accepted in the request
 * body, used for this one API call, and NEVER stored — mirroring the BYOK
 * philosophy used for AI keys.
 *
 * Body: { projectId: string, token: string, teamId?: string }
 *
 * Vercel API: POST /v13/deployments with inline file contents (static sites
 * only — no build step; framework: null). Deployment runs on Vercel's edge;
 * we poll readyState briefly so the user usually gets a live URL at once.
 *
 * Security limits: max 20 files, max 4 MB total — static sites only.
 */

const MAX_FILES = 20;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;

type VercelDeploymentResponse = {
  url?: string;
  readyState?: string;
  error?: { message?: string; code?: string };
};

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({}));
  const projectId = (body?.projectId ?? "").toString().trim();
  const token = (body?.token ?? "").toString().trim();
  const teamId = (body?.teamId ?? "").toString().trim();

  if (!projectId || !token) {
    return NextResponse.json(
      { error: "projectId and token are required" },
      { status: 400 }
    );
  }
  // Loose sanity check — Vercel tokens are opaque strings ≥ 20 chars.
  if (token.length < 20 || /\s/.test(token)) {
    return NextResponse.json({ error: "That doesn't look like a valid Vercel token" }, { status: 400 });
  }

  // Load project + files (owner only — deploying someone else's public
  // project would leak its files to the deployer's account, which is fine,
  // but keep it owner-only for simplicity and predictability).
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { userId: true, title: true, files: { select: { path: true, content: true } } },
  });
  if (!project || project.userId !== user.id) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const deployable = project.files.filter(
    (f) => /\.(html|css|js|mjs|json|svg|png|jpg|jpeg|gif|webp|ico|txt|md|woff2?)$/i.test(f.path)
  );
  if (!deployable.some((f) => f.path.toLowerCase().endsWith(".html"))) {
    return NextResponse.json(
      { error: "Project needs at least one .html file to deploy as a static site" },
      { status: 400 }
    );
  }
  if (deployable.length > MAX_FILES) {
    return NextResponse.json(
      { error: `Too many files to deploy (${deployable.length}). Max is ${MAX_FILES}.` },
      { status: 400 }
    );
  }
  const totalBytes = deployable.reduce((n, f) => n + Buffer.byteLength(f.content, "utf8"), 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    return NextResponse.json(
      { error: `Site is too large to deploy (${(totalBytes / 1024 / 1024).toFixed(1)} MB). Max is 4 MB.` },
      { status: 400 }
    );
  }

  const slug =
    project.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "studybuddy-site";
  const deployName = `${slug}-${Math.random().toString(36).slice(2, 8)}`;

  const apiUrl = new URL("https://api.vercel.com/v13/deployments");
  if (teamId) apiUrl.searchParams.set("teamId", teamId);

  let res: Response;
  try {
    res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: deployName,
        target: "production",
        files: deployable.map((f) => ({
          path: f.path.replace(/^\//, ""),
          file: f.content,
        })),
        projectSettings: {
          framework: null, // "Other" — pure static hosting, no build step
          buildCommand: null,
          installCommand: null,
          devCommand: null,
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return NextResponse.json(
      { error: "Couldn't reach Vercel. Check your connection and try again." },
      { status: 502 }
    );
  }

  const data = (await res.json().catch(() => ({}))) as VercelDeploymentResponse;

  if (!res.ok) {
    const msg =
      res.status === 401 || res.status === 403
        ? "Vercel rejected the token. Generate a new one at vercel.com/account/tokens."
        : res.status === 402
          ? "Your Vercel account needs a payment method before deploying."
          : data?.error?.message ?? `Vercel deploy failed (HTTP ${res.status}).`;
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // Briefly poll so static sites usually report READY immediately.
  let readyState = data.readyState ?? "QUEUED";
  let url = data.url ? `https://${data.url}` : null;
  if (data.url && teamId === "") {
    const pollUrl = new URL(`https://api.vercel.com/v13/deployments/${data.url}`);
    for (let i = 0; i < 6 && readyState !== "READY" && readyState !== "ERROR"; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const poll = await fetch(pollUrl, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10_000),
        });
        const pdata = (await poll.json().catch(() => ({}))) as VercelDeploymentResponse;
        readyState = pdata.readyState ?? readyState;
      } catch {
        break;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    url,
    readyState,
    note:
      readyState === "READY"
        ? "Deployed and live!"
        : "Deployment queued — it usually goes live within a minute. Refresh the URL shortly.",
  });
}
