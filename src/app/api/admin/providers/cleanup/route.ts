import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/crypto";

export const runtime = "nodejs";

/**
 * POST /api/admin/providers/cleanup
 *
 * Finds and lists duplicate providers (same API key + same model).
 * Does NOT delete them — just returns what's duplicated so the admin
 * can clean up manually via the Visual API Studio.
 *
 * Optionally: if body.cleanup=true, deletes duplicates keeping only
 * the highest-priority one per (key + model) group.
 */
export async function GET() {
  try {
    const providers = await db.aiProvider.findMany({
      orderBy: { priority: "asc" },
      select: { id: true, name: true, providerType: true, model: true, priority: true, apiKeyEncrypted: true, enabled: true },
    });

    // Group by (decrypted key first 8 chars + model)
    const groups = new Map<string, Array<typeof providers[0]>>();
    for (const p of providers) {
      const key = p.apiKeyEncrypted ? decryptApiKey(p.apiKeyEncrypted).slice(0, 12) : "no-key";
      const groupKey = `${key}|${p.model}`;
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey)!.push(p);
    }

    const duplicates: Array<{ key: string; model: string; providers: Array<{ id: string; name: string; priority: number; enabled: boolean }> }> = [];
    for (const [groupKey, group] of groups) {
      if (group.length > 1) {
        const [keyPart, modelPart] = groupKey.split("|");
        duplicates.push({
          key: keyPart + "…",
          model: modelPart,
          providers: group.map((p) => ({ id: p.id, name: p.name, priority: p.priority, enabled: p.enabled })),
        });
      }
    }

    return NextResponse.json({
      totalProviders: providers.length,
      duplicateGroups: duplicates.length,
      duplicates,
      totalDuplicateProviders: duplicates.reduce((s, d) => s + d.providers.length, 0),
      recommendation: duplicates.length > 0
        ? `Found ${duplicates.length} groups of duplicate providers. Delete all but one in each group (keep the highest priority).`
        : "No duplicates found.",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/providers/cleanup
 * Deletes duplicate providers, keeping only the highest-priority one per
 * (key + model) group. Also deletes providers with empty/null API keys
 * that aren't keyless (pollinations).
 */
export async function DELETE() {
  try {
    const providers = await db.aiProvider.findMany({
      orderBy: { priority: "asc" },
      select: { id: true, name: true, providerType: true, model: true, priority: true, apiKeyEncrypted: true },
    });

    // Group by (key signature + model)
    const groups = new Map<string, typeof providers>();
    const toDelete: string[] = [];

    for (const p of providers) {
      const key = p.apiKeyEncrypted ? decryptApiKey(p.apiKeyEncrypted).slice(0, 12) : "no-key";
      const groupKey = `${key}|${p.model}`;
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey)!.push(p);
    }

    // In each group with >1 provider, keep the first (highest priority),
    // delete the rest.
    for (const [, group] of groups) {
      if (group.length > 1) {
        // Keep first, delete rest
        for (let i = 1; i < group.length; i++) {
          toDelete.push(group[i].id);
        }
      }
    }

    if (toDelete.length > 0) {
      await db.aiProvider.deleteMany({
        where: { id: { in: toDelete } },
      });
    }

    return NextResponse.json({
      ok: true,
      deleted: toDelete.length,
      remaining: providers.length - toDelete.length,
      message: toDelete.length > 0
        ? `Deleted ${toDelete.length} duplicate providers. ${providers.length - toDelete.length} remaining.`
        : "No duplicates to delete.",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 });
  }
}
