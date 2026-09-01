import { describe, it, expect } from "vitest";
import {
  extractPathParams,
  isHttpMethod,
  methodHasBody,
  specToYaml,
  validateEndpoints,
  yamlScalar,
  scaffoldExpress,
  scaffoldFastApi,
  type ApiEndpoint,
} from "./openapi-designer";

const base: ApiEndpoint = {
  id: "e1",
  method: "get",
  path: "/todos",
  summary: "List todos",
  tag: "todos",
  params: [{ name: "limit", in: "query", type: "integer", required: false }],
  bodyFields: [],
  responses: [{ status: 200, description: "OK" }],
};

describe("helpers", () => {
  it("extracts path params", () => {
    expect(extractPathParams("/todos/{id}/comments/{cid}")).toEqual(["id", "cid"]);
    expect(extractPathParams("/todos")).toEqual([]);
  });

  it("validates methods and body semantics", () => {
    expect(isHttpMethod("POST")).toBe(true);
    expect(isHttpMethod("trace")).toBe(false);
    expect(methodHasBody("post")).toBe(true);
    expect(methodHasBody("get")).toBe(false);
  });

  it("quotes YAML scalars that would be misread", () => {
    expect(yamlScalar("true")).toBe('"true"');
    expect(yamlScalar("2.0")).toBe('"2.0"');
    expect(yamlScalar("a: b")).toBe('"a: b"');
    expect(yamlScalar("")).toBe('""');
    expect(yamlScalar("hello-world")).toBe("hello-world");
  });
});

describe("validateEndpoints", () => {
  it("accepts a well-formed endpoint", () => {
    expect(validateEndpoints([base])).toEqual([]);
  });

  it("requires a leading slash", () => {
    const bad = { ...base, path: "todos" };
    expect(validateEndpoints([bad])).toEqual([
      expect.stringContaining('path must start with "/"'),
    ]);
  });

  it("requires path params to be declared", () => {
    const bad = { ...base, path: "/todos/{id}" };
    expect(validateEndpoints([bad])).toEqual([
      expect.stringContaining("{id} must be declared"),
    ]);
  });

  it("rejects declared-but-unused path params", () => {
    const bad: ApiEndpoint = {
      ...base,
      params: [{ name: "id", in: "path", type: "integer", required: true }],
    };
    expect(validateEndpoints([bad])).toEqual([
      expect.stringContaining('declared in=path but not used'),
    ]);
  });

  it("rejects duplicate method+path and empty summaries", () => {
    const errors = validateEndpoints([base, { ...base, id: "e2", summary: "" }]);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("duplicate"),
        expect.stringContaining("summary is required"),
      ])
    );
  });
});

describe("specToYaml", () => {
  it("emits a valid OpenAPI 3.1 document", () => {
    const yaml = specToYaml(
      { title: "Todos API", version: "1.0.0", description: "Demo" },
      [base]
    );
    expect(yaml).toContain("openapi: 3.1.0");
    expect(yaml).toContain("title: Todos API");
    expect(yaml).toContain("paths:");
    expect(yaml).toContain("  /todos:");
    expect(yaml).toContain("    get:");
    expect(yaml).toContain("      - name: limit");
    expect(yaml).toContain("        in: query");
    expect(yaml).toContain('  "200":');
    expect(yaml).toContain("          description: OK");
  });

  it("groups multiple methods under one path key", () => {
    const post: ApiEndpoint = {
      id: "e2",
      method: "post",
      path: "/todos",
      summary: "Create todo",
      tag: "todos",
      params: [],
      bodyFields: [
        { name: "title", type: "string", required: true },
        { name: "done", type: "boolean", required: false },
      ],
      responses: [{ status: 201, description: "Created" }],
    };
    const yaml = specToYaml({ title: "T", version: "1", description: "" }, [
      base,
      post,
    ]);
    expect(yaml.match(/^  \/todos:$/gm)).toHaveLength(1);
    expect(yaml).toContain("    post:");
    expect(yaml).toContain("        required:");
    expect(yaml).toContain("                - title");
    expect(yaml).toContain("                  type: boolean");
  });

  it("auto-declares undeclared path params so the spec stays valid", () => {
    const yaml = specToYaml(
      { title: "T", version: "1", description: "" },
      [{ ...base, path: "/todos/{id}", params: [] }]
    );
    expect(yaml).toContain("- name: id");
    expect(yaml).toContain("  in: path");
    expect(yaml).toContain("  required: true");
  });

  it("emits an empty paths mapping when there are no endpoints", () => {
    const yaml = specToYaml({ title: "T", version: "1", description: "" }, []);
    expect(yaml).toContain("paths:");
    expect(yaml).toContain("  {}");
  });
});

describe("scaffoldExpress", () => {
  it("generates server.js + tag routers with :param conversion", () => {
    const files = scaffoldExpress(
      { title: "Todos API", version: "1.0.0", description: "" },
      [
        base,
        {
          id: "e2",
          method: "delete",
          path: "/todos/{id}",
          summary: "Delete todo",
          tag: "todos",
          params: [{ name: "id", in: "path", type: "integer", required: true }],
          bodyFields: [],
          responses: [{ status: 204, description: "Deleted" }],
        },
      ]
    );
    const names = files.map((f) => f.path);
    expect(names).toEqual(["express/routes-todos.js", "express/server.js"]);

    const router = files[0].content;
    expect(router).toContain("router.get('/todos'");
    expect(router).toContain("router.delete('/todos/:id'");
    expect(router).toContain("req.params.id");
    expect(router).toContain("module.exports = router;");

    const server = files[1].content;
    expect(server).toContain("app.use(express.json());");
    expect(server).toContain("require('./routes-todos')");
    expect(server).toContain("app.listen(port");
  });
});

describe("scaffoldFastApi", () => {
  it("generates main.py with pydantic models and typed routes", () => {
    const files = scaffoldFastApi(
      { title: "Todos API", version: "1.0.0", description: "" },
      [
        base,
        {
          id: "e2",
          method: "post",
          path: "/todos",
          summary: "Create todo",
          tag: "todos",
          params: [],
          bodyFields: [
            { name: "title", type: "string", required: true },
            { name: "priority", type: "integer", required: false },
          ],
          responses: [{ status: 201, description: "Created" }],
        },
      ]
    );
    expect(files).toHaveLength(1);
    const py = files[0].content;
    expect(py).toContain("from fastapi import FastAPI, HTTPException");
    expect(py).toContain("class TodosPostRequest(BaseModel):");
    expect(py).toContain("    title: str");
    expect(py).toContain("    priority: int | None = None");
    expect(py).toContain('@app.get("/todos")');
    expect(py).toContain('@app.post("/todos")');
    expect(py).toContain('    """Create todo"""');
    expect(py).toContain("    return {\"ok\": True}");
  });
});
