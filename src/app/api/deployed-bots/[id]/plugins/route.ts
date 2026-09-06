import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { listBuiltinPluginsForUI, BUILTIN_PLUGINS } from "@/lib/plugins/registry";

export const runtime = "nodejs";

/**
 * GET /api/deployed-bots/[id]/plugins
 *   List all plugins for this bot. Also returns the catalog of available
 *   built-in plugins (so the UI can show "Add built-in" buttons).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id } = await params;

  const bot = await db.deployedBot.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!bot || bot.userId !== user.id) {
    return NextResponse.json({ error: "Bot not found" }, { status: 404 });
  }

  const plugins = await db.botPlugin.findMany({
    where: { botId: id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      type: true,
      description: true,
      config: true,
      enabled: true,
      callCount: true,
      lastCalledAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    plugins: plugins.map((p) => ({
      ...p,
      config: maskSecrets(p.config as any),
      lastCalledAt: p.lastCalledAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
    })),
    availableBuiltin: listBuiltinPluginsForUI(),
  });
}

/** Mask sensitive fields (API keys, tokens) in plugin config. */
function maskSecrets(config: any): any {
  if (!config || typeof config !== "object") return config;
  const masked = { ...config };
  if (masked.headers) {
    masked.headers = Object.fromEntries(
      Object.entries(masked.headers).map(([k, v]: [string, any]) => {
        if (k.toLowerCase().includes("key") || k.toLowerCase().includes("token") || k.toLowerCase().includes("auth")) {
          return [k, v ? `${String(v).slice(0, 4)}…${String(v).slice(-4)}` : ""];
        }
        return [k, v];
      }),
    );
  }
  return masked;
}

/**
 * POST /api/deployed-bots/[id]/plugins
 *   Body: { name, type, description?, config }
 *   type "builtin": config = { builtinName } — adds a built-in plugin
 *   type "http":    config = { method, url, headers, bodyTemplate, responsePath }
 *   type "mcp":     config = { serverUrl, toolName }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as {
    name?: string;
    type?: string;
    description?: string;
    config?: any;
  };

  const bot = await db.deployedBot.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!bot || bot.userId !== user.id) {
    return NextResponse.json({ error: "Bot not found" }, { status: 404 });
  }

  const type = body.type;
  if (!["builtin", "http", "mcp"].includes(type || "")) {
    return NextResponse.json({ error: "type must be 'builtin', 'http', or 'mcp'" }, { status: 400 });
  }

  let name = (body.name || "").toString().trim();
  let description = (body.description || "").toString().trim();
  let config = body.config || {};

  // For builtin plugins, auto-fill the name + description from the registry.
  if (type === "builtin") {
    const builtinName = config.builtinName || name;
    const builtin = BUILTIN_PLUGINS.find((p) => p.name === builtinName);
    if (!builtin) {
      return NextResponse.json({ error: `Unknown built-in plugin: ${builtinName}` }, { status: 400 });
    }
    name = builtin.name;
    description = builtin.description;
    config = { builtinName: builtin.name };
  } else {
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    if (type === "http") {
      if (!config.url) return NextResponse.json({ error: "HTTP plugin requires url in config" }, { status: 400 });
      if (!description) description = `HTTP ${config.method || "POST"} to ${config.url}`;
    } else if (type === "mcp") {
      if (!config.serverUrl) return NextResponse.json({ error: "MCP plugin requires serverUrl in config" }, { status: 400 });
      if (!description) description = `MCP tool: ${config.toolName || "chat_with_bot"}`;
    }
  }

  try {
    const plugin = await db.botPlugin.create({
      data: {
        botId: id,
        name,
        type: type!,
        description: description.slice(0, 500),
        config,
        enabled: true,
      },
    });
    return NextResponse.json({
      plugin: {
        id: plugin.id,
        name: plugin.name,
        type: plugin.type,
        description: plugin.description,
        enabled: plugin.enabled,
      },
    });
  } catch (e: any) {
    // Unique constraint violation — plugin with this name already exists.
    if (e?.code === "P2002") {
      return NextResponse.json({ error: `A plugin named "${name}" already exists for this bot` }, { status: 409 });
    }
    throw e;
  }
}

/**
 * DELETE /api/deployed-bots/[id]/plugins?pluginId=...  (query param)
 *   OR DELETE /api/deployed-bots/[id]/plugins  with body { pluginId }
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id } = await params;
  const url = new URL(req.url);
  const pluginId = url.searchParams.get("pluginId");

  const bot = await db.deployedBot.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!bot || bot.userId !== user.id) {
    return NextResponse.json({ error: "Bot not found" }, { status: 404 });
  }

  if (!pluginId) {
    return NextResponse.json({ error: "pluginId query param is required" }, { status: 400 });
  }

  await db.botPlugin.deleteMany({ where: { id: pluginId, botId: id } });
  return NextResponse.json({ ok: true });
}

/**
 * PATCH /api/deployed-bots/[id]/plugins
 *   Body: { pluginId, enabled? }
 *   Toggles a plugin on/off.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { pluginId?: string; enabled?: boolean };

  const bot = await db.deployedBot.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!bot || bot.userId !== user.id) {
    return NextResponse.json({ error: "Bot not found" }, { status: 404 });
  }

  if (!body.pluginId) {
    return NextResponse.json({ error: "pluginId is required" }, { status: 400 });
  }

  const updated = await db.botPlugin.updateMany({
    where: { id: body.pluginId, botId: id },
    data: { enabled: body.enabled },
  });

  if (updated.count === 0) {
    return NextResponse.json({ error: "Plugin not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
