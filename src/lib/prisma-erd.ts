/**
 * BackendBuddy — Prisma schema → ER model (Phase 55).
 *
 * Minimal, dependency-free parser: `model X { ... }` blocks → tables with
 * columns/PKs and FK relations derived from `@relation(fields:, references:)`.
 * Back-relation fields (e.g. `posts Post[]`) are intentionally skipped —
 * they are not columns.
 */

export type ErdColumn = { name: string; type: string; pk: boolean; notNull: boolean };
export type ErdTable = { name: string; columns: ErdColumn[] };
export type ErdRelation = { from: string; fromColumn: string; to: string; toColumn: string };
export type ErdModel = { tables: ErdTable[]; relations: ErdRelation[] };

const SCALAR_TYPES = new Set([
  "String", "Int", "BigInt", "Float", "Decimal", "Boolean", "DateTime", "Json", "Bytes",
]);

export function parsePrismaModels(schema: string): ErdModel {
  const tables: ErdTable[] = [];
  const relations: ErdRelation[] = [];

  const modelRe = /model\s+([A-Za-z_]\w*)\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = modelRe.exec(schema)) !== null) {
    const name = m[1];
    const body = m[2];
    const columns: ErdColumn[] = [];
    const compositePk = new Set<string>();

    for (let line of body.split("\n")) {
      line = line.trim();
      if (!line || line.startsWith("//")) continue;

      const attrOnly = /^@@(\w+)\s*(\([^)]*\))?$/.exec(line);
      if (attrOnly) {
        if (attrOnly[1] === "id") {
          const inner = /\[([^\]]*)\]/.exec(attrOnly[2] ?? "");
          for (const field of (inner?.[1] ?? "").split(",")) {
            const f = field.trim();
            if (f) compositePk.add(f);
          }
        }
        continue;
      }

      const fm = /^([A-Za-z_]\w*)\s+([A-Za-z_]\w*)(\[\])?(\?)?\s*(.*)$/.exec(line);
      if (!fm) continue;
      const [, fieldName, rawType, list, optional, attrs] = fm;
      const isList = list === "[]";
      const isOptional = optional === "?";
      const baseType = rawType;

      if (!SCALAR_TYPES.has(baseType)) {
        // Model-typed field: only meaningful with @relation(fields:, references:)
        if (/@relation\b/.test(attrs) && attrs) {
          const fieldsM = /fields:\s*\[([^\]]*)\]/.exec(attrs);
          const refsM = /references:\s*\[([^\]]*)\]/.exec(attrs);
          const fields = (fieldsM?.[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
          const refs = (refsM?.[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
          fields.forEach((f, i) => {
            relations.push({
              from: name,
              fromColumn: f,
              to: baseType,
              toColumn: refs[i] ?? "id",
            });
          });
        }
        // back-relations (no @relation attrs) are skipped entirely
        continue;
      }

      columns.push({
        name: fieldName,
        type: isList ? `${baseType}[]` : baseType + (isOptional ? "?" : ""),
        pk: /@id\b/.test(attrs),
        notNull: !isOptional,
      });
    }

    for (const col of columns) {
      if (compositePk.has(col.name)) col.pk = true;
    }
    tables.push({ name, columns });
  }

  return { tables, relations };
}
