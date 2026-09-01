import { describe, it, expect, beforeAll } from "vitest";
import { join } from "node:path";
import {
  splitSqlStatements,
  compressSql,
  createSqlSandbox,
  type SqlSandbox,
} from "./sql-sandbox";
import { SQL_SAMPLES, DEFAULT_QUERIES, getSample } from "./sql-samples";

const WASM = join(process.cwd(), "node_modules", "sql.js", "dist", "sql-wasm.wasm");

describe("splitSqlStatements", () => {
  it("splits on top-level semicolons", () => {
    expect(splitSqlStatements("SELECT 1; SELECT 2;")).toEqual(["SELECT 1", "SELECT 2"]);
  });

  it("keeps semicolons inside string literals", () => {
    expect(splitSqlStatements("INSERT INTO t VALUES ('a;b'); SELECT 1;")).toEqual([
      "INSERT INTO t VALUES ('a;b')",
      "SELECT 1",
    ]);
  });

  it("ignores semicolons inside -- line comments", () => {
    const sql = "-- a comment with a semicolon;\nSELECT 1;";
    expect(splitSqlStatements(sql)).toEqual(["-- a comment with a semicolon;\nSELECT 1"]);
  });

  it("ignores semicolons inside /* block comments */", () => {
    const sql = "/* semi; colon */ SELECT 1;";
    expect(splitSqlStatements(sql)).toEqual(["/* semi; colon */ SELECT 1"]);
  });

  it("drops comment-only fragments and empties", () => {
    const sql = ";; -- just a comment\n  ; /* block only */ ; SELECT 1;";
    expect(splitSqlStatements(sql)).toEqual(["SELECT 1"]);
  });

  it("returns [] for empty input and handles escaped quotes", () => {
    expect(splitSqlStatements("   ")).toEqual([]);
    expect(splitSqlStatements("SELECT 'it''s ok'")).toEqual(["SELECT 'it''s ok'"]);
  });
});

describe("compressSql", () => {
  it("collapses whitespace", () => {
    expect(compressSql("SELECT\n   1  +  1")).toBe("SELECT 1 + 1");
  });
});

describe("createSqlSandbox (integration against real sql.js WASM)", () => {
  let sandbox: SqlSandbox;

  beforeAll(async () => {
    sandbox = await createSqlSandbox({ wasmPath: WASM });
  });

  it("runs the blog schema + seed without errors", () => {
    const blog = getSample("blog")!;
    const r1 = sandbox.run(blog.schemaSql);
    expect(r1.error).toBeNull();
    expect(r1.statementsRun).toBeGreaterThan(5);
    const r2 = sandbox.run(blog.seedSql);
    expect(r2.error).toBeNull();
    expect(r2.totalRows).toBe(0); // INSERTs return no result rows
    expect(r2.results.every((s) => s.rowsModified > 0)).toBe(true);
  });

  it("returns columns and rows for SELECTs", () => {
    const r = sandbox.run("SELECT name FROM users ORDER BY id LIMIT 2;");
    expect(r.error).toBeNull();
    expect(r.results[0].columns).toEqual(["name"]);
    expect(r.results[0].rows).toEqual([["Amina"], ["Brian"]]);
    expect(r.totalRows).toBe(2);
  });

  it("reports syntax errors without throwing", () => {
    const r = sandbox.run("SELECT 1; SELECT FROM nowhere;");
    expect(r.error).not.toBeNull();
    expect(r.error!.message).toMatch(/syntax/i);
    expect(r.statementsRun).toBe(1);
  });

  it("surfaces missing-table errors", () => {
    const r = sandbox.run("SELECT * FROM nope;");
    expect(r.error).not.toBeNull();
    expect(r.error!.message).toMatch(/no such table/i);
  });

  it("introspects tables, PKs and FK relationships", () => {
    const schema = sandbox.schema();
    const names = schema.tables.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["users", "posts", "comments", "tags", "post_tags"]));
    const posts = schema.tables.find((t) => t.name === "posts")!;
    expect(posts.columns.find((c) => c.name === "id")!.pk).toBe(true);
    expect(posts.columns.find((c) => c.name === "user_id")!.notNull).toBe(true);
    expect(posts.fks).toContainEqual({ from: "user_id", toTable: "users", to: "id" });
    expect(schema.relations).toContainEqual({
      from: "comments",
      fromColumn: "post_id",
      to: "posts",
      toColumn: "id",
    });
  });

  it("excludes internal sqlite tables", () => {
    const names = sandbox.schema().tables.map((t) => t.name);
    expect(names.every((n) => !n.startsWith("sqlite_"))).toBe(true);
  });

  it("exports and reloads the database byte-for-byte", () => {
    const dump = sandbox.export();
    const fresh = sandbox.export(); // stable across calls
    sandbox.load(dump);
    const r = sandbox.run("SELECT COUNT(*) AS n FROM posts;");
    expect(r.results[0].rows[0][0]).toBe(4);
    expect(fresh.length).toBeGreaterThan(0);
  });

  it("runs the default query pack against the blog sample", () => {
    const r = sandbox.run(DEFAULT_QUERIES);
    expect(r.error).toBeNull();
    expect(r.statementsRun).toBe(3);
    expect(r.totalRows).toBeGreaterThan(0);
  });

  it("every sample builds in a fresh sandbox", async () => {
    for (const sample of SQL_SAMPLES) {
      const box = await createSqlSandbox({ wasmPath: WASM });
      const r1 = box.run(sample.schemaSql);
      expect(r1.error).toBeNull();
      const r2 = box.run(sample.seedSql);
      expect(r2.error).toBeNull();
      expect(box.schema().tables.length).toBeGreaterThanOrEqual(4);
    }
  });
});
