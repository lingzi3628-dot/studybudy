/**
 * BackendBuddy — sql.js sandbox (Phase 55).
 *
 * In-browser SQLite (WASM) with a thin, testable wrapper:
 * - `splitSqlStatements` is pure logic (comment/string aware).
 * - `createSqlSandbox` wraps a sql.js Database with per-statement reports
 *   (rows, rowcounts, errors) and schema introspection (tables, columns,
 *   PKs, FKs) used by the ER visualizer.
 *
 * WASM: the browser loads /sql-wasm.wasm from public/ (copied by
 * scripts/copy-sql-wasm.mjs); Node tests pass an explicit wasmPath.
 */
import initSqlJs from "sql.js";

type SqlDatabase = import("sql.js").Database;

export type SqlValue = string | number | Uint8Array | null;

export type StatementResult = {
  sql: string;
  columns: string[];
  rows: SqlValue[][];
  rowCount: number;
  rowsModified: number;
};

export type SandboxError = { sql: string; message: string };

export type RunReport = {
  results: StatementResult[];
  error: SandboxError | null;
  statementsRun: number;
  totalRows: number;
};

export type TableColumn = { name: string; type: string; pk: boolean; notNull: boolean };
export type TableSchema = {
  name: string;
  columns: TableColumn[];
  fks: { from: string; toTable: string; to: string }[];
};
export type SchemaSummary = {
  tables: TableSchema[];
  relations: { from: string; fromColumn: string; to: string; toColumn: string }[];
};

export type SqlSandbox = {
  run(script: string): RunReport;
  schema(): SchemaSummary;
  export(): Uint8Array;
  load(data: Uint8Array): void;
};

type QueryResult = { columns: string[]; values: SqlValue[][] };

/** Collapse whitespace for display (never mutates execution). */
export function compressSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

/**
 * Splits a SQL script into individual statements, respecting:
 * '...' strings (with '' escapes), "..." identifiers, `...` MySQL-style
 * identifiers, [bracketed] identifiers, -- line comments and slash-star
 * block comments. Comment-only fragments and empty statements are dropped.
 */
export function splitSqlStatements(sql: string): string[] {
  const out: string[] = [];
  let cur = "";
  let i = 0;
  type State = "normal" | "line" | "block" | "single" | "double" | "backtick" | "bracket";
  let state: State = "normal";

  while (i < sql.length) {
    const ch = sql[i];
    const next = i + 1 < sql.length ? sql[i + 1] : "";

    if (state === "normal") {
      if (ch === "-" && next === "-") { state = "line"; cur += ch + next; i += 2; continue; }
      if (ch === "/" && next === "*") { state = "block"; cur += ch + next; i += 2; continue; }
      if (ch === "'") { state = "single"; cur += ch; i += 1; continue; }
      if (ch === '"') { state = "double"; cur += ch; i += 1; continue; }
      if (ch === "`") { state = "backtick"; cur += ch; i += 1; continue; }
      if (ch === "[") { state = "bracket"; cur += ch; i += 1; continue; }
      if (ch === ";") { out.push(cur); cur = ""; i += 1; continue; }
      cur += ch; i += 1; continue;
    }
    if (state === "line") {
      if (ch === "\n") state = "normal";
      cur += ch; i += 1; continue;
    }
    if (state === "block") {
      if (ch === "*" && next === "/") { state = "normal"; cur += ch + next; i += 2; continue; }
      cur += ch; i += 1; continue;
    }
    if (state === "single") {
      if (ch === "'") {
        if (next === "'") { cur += ch + next; i += 2; continue; }
        state = "normal";
      }
      cur += ch; i += 1; continue;
    }
    if (state === "double") {
      if (ch === '"') {
        if (next === '"') { cur += ch + next; i += 2; continue; }
        state = "normal";
      }
      cur += ch; i += 1; continue;
    }
    if (state === "backtick") {
      if (ch === "`") state = "normal";
      cur += ch; i += 1; continue;
    }
    // bracket
    if (ch === "]") state = "normal";
    cur += ch; i += 1;
  }
  out.push(cur);

  return out
    .map((s) => s.trim())
    .filter((s) => stripComments(s).trim().length > 0);
}

function stripComments(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

let sqlJsPromise: Promise<import("sql.js").SqlJsStatic> | null = null;

async function loadSqlJs(wasmPath?: string): Promise<import("sql.js").SqlJsStatic> {
  if (!sqlJsPromise) {
    sqlJsPromise = initSqlJs({ locateFile: () => wasmPath ?? "/sql-wasm.wasm" });
  }
  return sqlJsPromise;
}

export async function createSqlSandbox(opts?: {
  wasmPath?: string;
  file?: Uint8Array;
}): Promise<SqlSandbox> {
  const SQL = await loadSqlJs(opts?.wasmPath);
  let db: SqlDatabase = opts?.file ? new SQL.Database(opts.file) : new SQL.Database();

  const safeExec = (sql: string): QueryResult => {
    try {
      const res = db.exec(sql);
      return { columns: res[0]?.columns ?? [], values: (res[0]?.values ?? []) as SqlValue[][] };
    } catch {
      return { columns: [], values: [] };
    }
  };

  return {
    run(script: string): RunReport {
      const statements = splitSqlStatements(script);
      const results: StatementResult[] = [];
      let error: SandboxError | null = null;
      let totalRows = 0;

      for (const stmt of statements) {
        try {
          const res = db.exec(stmt);
          const rowsModified = db.getRowsModified();
          const columns = res[0]?.columns ?? [];
          const rows: SqlValue[][] = [];
          for (const part of res) rows.push(...(part.values as SqlValue[][]));
          const rowCount = rows.length;
          results.push({ sql: compressSql(stmt), columns, rows, rowCount, rowsModified });
          totalRows += rowCount;
        } catch (e) {
          error = { sql: compressSql(stmt), message: e instanceof Error ? e.message : String(e) };
          break;
        }
      }

      return { results, error, statementsRun: results.length, totalRows };
    },

    schema(): SchemaSummary {
      const tables: TableSchema[] = [];
      const relations: SchemaSummary["relations"] = [];
      const master = safeExec(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      );
      for (const row of master.values) {
        const name = String(row[0]);
        const info = safeExec(`PRAGMA table_info(${quoteIdent(name)})`);
        const columns: TableColumn[] = info.values.map((r) => ({
          name: String(r[1]),
          type: String(r[2] ?? ""),
          pk: Number(r[5] ?? 0) > 0,
          notNull: Number(r[3] ?? 0) === 1,
        }));
        const fks: TableSchema["fks"] = [];
        const fkRows = safeExec(`PRAGMA foreign_key_list(${quoteIdent(name)})`);
        for (const r of fkRows.values) {
          const toTable = String(r[2]);
          const from = String(r[3]);
          const to = r[4] == null ? "rowid" : String(r[4]);
          fks.push({ from, toTable, to });
          relations.push({ from: name, fromColumn: from, to: toTable, toColumn: to });
        }
        tables.push({ name, columns, fks });
      }
      return { tables, relations };
    },

    export(): Uint8Array {
      return db.export();
    },

    load(data: Uint8Array): void {
      db.close();
      db = new SQL.Database(data);
    },
  };
}
