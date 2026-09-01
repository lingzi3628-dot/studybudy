/**
 * BackendBuddy — OpenAPI endpoint designer (Phase 55).
 *
 * Pure logic: a structured endpoint model → valid OpenAPI 3.1 YAML,
 * structural validation, and deterministic Express/FastAPI scaffold
 * generation (delivered through the Phase 48 "Save as project" pipeline).
 * No YAML parser dependency — we emit what we validate.
 */

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";
export type ApiType = "string" | "number" | "integer" | "boolean" | "string[]";

export type ApiParam = {
  name: string;
  in: "path" | "query";
  type: Exclude<ApiType, "string[]">;
  required: boolean;
};

export type ApiBodyField = { name: string; type: ApiType; required: boolean };

export type ApiResponseDef = { status: number; description: string };

export type ApiEndpoint = {
  id: string;
  method: HttpMethod;
  path: string; // e.g. "/todos/{id}"
  summary: string;
  tag: string;
  params: ApiParam[];
  bodyFields: ApiBodyField[];
  responses: ApiResponseDef[];
};

export type ApiSpecInfo = { title: string; version: string; description: string };

export const DEFAULT_RESPONSES: ApiResponseDef[] = [
  { status: 200, description: "OK" },
];

export const HTTP_METHODS: HttpMethod[] = ["get", "post", "put", "patch", "delete"];

export function isHttpMethod(value: string): value is HttpMethod {
  return (HTTP_METHODS as string[]).includes(value.toLowerCase());
}

/** Body-carrying methods (per common REST semantics). */
export function methodHasBody(method: HttpMethod): boolean {
  return method === "post" || method === "put" || method === "patch";
}

/** Extracts {param} names from a path: "/todos/{id}" → ["id"]. */
export function extractPathParams(path: string): string[] {
  const out: string[] = [];
  const re = /\{([^{}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path)) !== null) out.push(m[1].trim());
  return out;
}

export function validateEndpoints(endpoints: ApiEndpoint[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();

  endpoints.forEach((ep, index) => {
    const label = `#${index + 1} ${ep.method.toUpperCase()} ${ep.path || "(no path)"}`;
    if (!ep.path.startsWith("/")) {
      errors.push(`${label}: path must start with "/".`);
    }
    if (!ep.summary.trim()) {
      errors.push(`${label}: summary is required.`);
    }
    if (!ep.responses.length) {
      errors.push(`${label}: define at least one response.`);
    }

    const declared = ep.params.filter((p) => p.in === "path").map((p) => p.name);
    const required = extractPathParams(ep.path);
    for (const name of required) {
      if (!declared.includes(name)) {
        errors.push(`${label}: path parameter {${name}} must be declared with in=path.`);
      }
    }
    for (const name of declared) {
      if (!required.includes(name)) {
        errors.push(`${label}: parameter "${name}" is declared in=path but not used in the path.`);
      }
    }

    const key = `${ep.method} ${ep.path}`;
    if (seen.has(key)) errors.push(`${label}: duplicate method + path.`);
    seen.add(key);
  });

  return errors;
}

/** Quote a YAML scalar when needed (numbers, bools, nulls, colons, empties…). */
export function yamlScalar(value: string): string {
  if (value === "") return '""';
  const needsQuote =
    /^-?(\d+\.?\d*|\.\d+)(e-?\d+)?$/i.test(value) ||
    /^(true|false|null|yes|no|on|off|~)$/i.test(value) ||
    /[:#\n]/.test(value) ||
    value !== value.trim() ||
    /^[-?:*,[\]{}#&*!|>'"%@`]/.test(value);
  if (needsQuote) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}

function endpointParamsYaml(ep: ApiEndpoint, indent: string): string[] {
  const lines: string[] = [];
  const pathParams = new Set(extractPathParams(ep.path));
  const ordered = [...ep.params].sort((a, b) => {
    const ai = a.in === "path" ? 0 : 1;
    const bi = b.in === "path" ? 0 : 1;
    return ai - bi;
  });
  const emitted = new Set<string>();
  for (const p of ordered) {
    const key = `${p.in}:${p.name}`;
    if (emitted.has(key)) continue;
    emitted.add(key);
    lines.push(`${indent}- name: ${yamlScalar(p.name)}`);
    lines.push(`${indent}  in: ${p.in}`);
    lines.push(`${indent}  required: ${p.in === "path" ? true : p.required}`);
    lines.push(`${indent}  schema:`);
    lines.push(`${indent}    type: ${p.type}`);
  }
  // Auto-declare any path param the designer didn't add explicitly so the
  // emitted spec is always structurally valid.
  for (const name of pathParams) {
    if (emitted.has(`path:${name}`)) continue;
    lines.push(`${indent}- name: ${yamlScalar(name)}`);
    lines.push(`${indent}  in: path`);
    lines.push(`${indent}  required: true`);
    lines.push(`${indent}  schema:`);
    lines.push(`${indent}    type: string`);
  }
  return lines;
}

function endpointYaml(ep: ApiEndpoint, indent: string): string {
  const pad = `${indent}    `;
  const lines: string[] = [];
  lines.push(`${indent}  ${ep.method}:`);
  lines.push(`${pad}tags: [${yamlScalar(ep.tag || "default")}]`);
  lines.push(`${pad}summary: ${yamlScalar(ep.summary)}`);

  const params = endpointParamsYaml(ep, pad);
  if (params.length) {
    lines.push(`${pad}parameters:`);
    lines.push(...params);
  }

  if (methodHasBody(ep.method) && ep.bodyFields.length) {
    const requiredFields = ep.bodyFields.filter((f) => f.required).map((f) => f.name);
    lines.push(`${pad}requestBody:`);
    lines.push(`${pad}  required: true`);
    lines.push(`${pad}  content:`);
    lines.push(`${pad}    application/json:`);
    lines.push(`${pad}      schema:`);
    lines.push(`${pad}        type: object`);
    if (requiredFields.length) {
      lines.push(`${pad}        required:`);
      for (const name of requiredFields) lines.push(`${pad}          - ${yamlScalar(name)}`);
    }
    lines.push(`${pad}        properties:`);
    for (const f of ep.bodyFields) {
      lines.push(`${pad}          ${yamlScalar(f.name)}:`);
      lines.push(`${pad}            type: ${f.type === "string[]" ? "array" : f.type}`);
      if (f.type === "string[]") lines.push(`${pad}            items: { type: string }`);
    }
  }

  lines.push(`${pad}responses:`);
  for (const r of ep.responses.length ? ep.responses : DEFAULT_RESPONSES) {
    lines.push(`${pad}  ${yamlScalar(String(r.status))}:`);
    lines.push(`${pad}    description: ${yamlScalar(r.description || "Response")}`);
  }
  return lines.join("\n");
}

/** Emits a complete OpenAPI 3.1 document from the designer model. */
export function specToYaml(info: ApiSpecInfo, endpoints: ApiEndpoint[]): string {
  const lines: string[] = [];
  lines.push("openapi: 3.1.0");
  lines.push("info:");
  lines.push(`  title: ${yamlScalar(info.title || "API")}`);
  lines.push(`  version: ${yamlScalar(info.version || "1.0.0")}`);
  if (info.description.trim()) {
    lines.push(`  description: ${yamlScalar(info.description.trim())}`);
  }

  const tags = [...new Set(endpoints.map((e) => e.tag || "default"))];
  if (tags.length) {
    lines.push("tags:");
    for (const t of tags) lines.push(`  - name: ${yamlScalar(t)}`);
  }

  lines.push("paths:");

  if (!endpoints.length) {
    lines.push("  {}");
    return lines.join("\n");
  }

  // Group by path, preserving first-seen order.
  const byPath = new Map<string, ApiEndpoint[]>();
  for (const ep of endpoints) {
    const list = byPath.get(ep.path) ?? [];
    list.push(ep);
    byPath.set(ep.path, list);
  }

  for (const [path, eps] of byPath) {
    lines.push(`  ${yamlScalar(path)}:`);
    for (const ep of eps) lines.push(endpointYaml(ep, "  "));
  }

  return lines.join("\n");
}

function pascal(s: string): string {
  return s
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/^(.)/, (c) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, "") || "Api";
}

const PY_TYPES: Record<ApiType, string> = {
  string: "str",
  number: "float",
  integer: "int",
  boolean: "bool",
  "string[]": "list[str]",
};

/** Deterministic Express (JavaScript) scaffold from the designer model. */
export function scaffoldExpress(
  info: ApiSpecInfo,
  endpoints: ApiEndpoint[]
): { path: string; content: string }[] {
  const tags = [...new Set(endpoints.map((e) => e.tag || "default"))];
  const files: { path: string; content: string }[] = [];

  for (const tag of tags) {
    const eps = endpoints.filter((e) => (e.tag || "default") === tag);
    const lines: string[] = [];
    lines.push(`// ${info.title} — ${tag} routes (generated by BackendBuddy)`);
    lines.push("// TODO: replace the placeholder handlers with real logic.");
    lines.push("");
    lines.push("const express = require('express');");
    lines.push("");
    lines.push(`const router = express.Router();`);
    lines.push("");
    for (const ep of eps) {
      const route = ep.path.replace(/\{([^{}]+)\}/g, ":$1");
      const pathParams = extractPathParams(ep.path);
      const notes: string[] = [];
      for (const p of ep.params) {
        notes.push(
          `//   ${p.in === "path" ? "req.params" : "req.query"}.${p.name} (${p.type}${p.in === "path" ? "" : p.required ? ", required" : ", optional"})`
        );
      }
      for (const f of ep.bodyFields) {
        notes.push(`//   req.body.${f.name} (${f.type}${f.required ? ", required" : ", optional"})`);
      }
      lines.push(`// ${ep.summary}`);
      if (notes.length) {
        lines.push("// Inputs:");
        lines.push(...notes);
      }
      lines.push(`router.${ep.method}('${route}', async (req, res) => {`);
      lines.push("  try {");
      lines.push(`    // TODO: implement "${ep.summary}"`);
      lines.push(`    res.status(${ep.responses[0]?.status ?? 200}).json({ ok: true });`);
      lines.push("  } catch (err) {");
      lines.push("    console.error(err);");
      lines.push("    res.status(500).json({ error: 'Internal server error' });");
      lines.push("  }");
      lines.push("});");
      lines.push("");
    }
    lines.push("module.exports = router;");
    files.push({ path: `express/routes-${tag}.js`, content: lines.join("\n") });
  }

  const mountLines: string[] = [];
  for (const tag of tags) {
    const eps = endpoints.filter((e) => (e.tag || "default") === tag);
    const prefix = commonPrefix(eps.map((e) => e.path));
    mountLines.push(`app.use('${prefix}', require('./routes-${tag}'));`);
  }

  const server = [
    `// ${info.title} — Express server (generated by BackendBuddy)`,
    "const express = require('express');",
    "",
    "const app = express();",
    "app.use(express.json());",
    "",
    ...mountLines,
    "",
    "app.use((err, req, res, next) => {",
    "  console.error(err);",
    "  res.status(500).json({ error: 'Internal server error' });",
    "});",
    "",
    "const port = process.env.PORT || 3000;",
    "app.listen(port, () => console.log(`Listening on :${port}`));",
    "",
  ];
  files.push({ path: "express/server.js", content: server.join("\n") });
  return files;
}

function commonPrefix(paths: string[]): string {
  if (!paths.length) return "/";
  const segs = paths.map((p) => p.split("/").filter(Boolean));
  const first = segs[0] ?? [];
  let prefix = "";
  for (let i = 0; i < first.length; i++) {
    const seg = first[i];
    if (seg.startsWith("{") || segs.some((s) => s[i] !== seg)) break;
    prefix += `/${seg}`;
  }
  return prefix || "/";
}

/** Deterministic FastAPI (Python) scaffold from the designer model. */
export function scaffoldFastApi(
  info: ApiSpecInfo,
  endpoints: ApiEndpoint[]
): { path: string; content: string }[] {
  const lines: string[] = [];
  const usedModels = new Set<string>();

  lines.push(`# ${info.title} — FastAPI app (generated by BackendBuddy)`);
  lines.push("# TODO: replace the placeholder responses with real logic.");
  lines.push("");
  lines.push("from fastapi import FastAPI, HTTPException");
  lines.push("from pydantic import BaseModel");
  lines.push("");
  lines.push("app = FastAPI(");
  lines.push(`    title=${pyStr(info.title || "API")},`);
  lines.push(`    version=${pyStr(info.version || "1.0.0")},`);
  lines.push(")");
  lines.push("");

  const bodyModels: string[] = [];
  const routes: string[] = [];

  endpoints.forEach((ep, index) => {
    let modelName: string | null = null;
    if (methodHasBody(ep.method) && ep.bodyFields.length) {
      modelName = `${pascal(ep.tag || "Api")}${pascal(ep.method)}Request`;
      while (usedModels.has(modelName)) modelName = `${modelName}X`;
      usedModels.add(modelName);
      const model: string[] = [];
      model.push(`class ${modelName}(BaseModel):`);
      for (const f of ep.bodyFields) {
        const type = PY_TYPES[f.type] ?? "str";
        if (f.required) model.push(`    ${safeIdent(f.name)}: ${type}`);
        else model.push(`    ${safeIdent(f.name)}: ${type} | None = None`);
      }
      bodyModels.push(model.join("\n"));
    }

    const pathArgs = extractPathParams(ep.path).map((p) => `${safeIdent(p)}: str`);
    const fnName = `${ep.method}_${(ep.tag || "api").replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase()}_${index}`;
    const funcArgs = [...pathArgs];
    if (modelName) funcArgs.push(`body: ${modelName}`);
    for (const p of ep.params.filter((p) => p.in === "query")) {
      funcArgs.push(`${safeIdent(p.name)}: ${PY_TYPES[p.type]} | None = None`);
    }

    routes.push(`@app.${ep.method}("${ep.path}")`);
    routes.push(`def ${fnName}(${funcArgs.join(", ")}):`);
    routes.push(`    """${ep.summary}"""`);
    if (ep.params.length || ep.bodyFields.length) {
      routes.push("    # Inputs:");
      for (const p of ep.params) {
        routes.push(
          `    #   ${p.in === "path" ? "path" : "query"}: ${p.name} (${p.type})`
        );
      }
      for (const f of ep.bodyFields) {
        routes.push(`    #   body: ${f.name} (${f.type})`);
      }
    }
    routes.push(`    # TODO: implement "${ep.summary}"`);
    routes.push(`    return {"ok": True}`);
    routes.push("");
  });

  const content = [
    ...lines,
    ...(bodyModels.length ? [...bodyModels, ""] : []),
    ...routes,
  ].join("\n");

  return [{ path: "fastapi/main.py", content }];
}

function pyStr(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function safeIdent(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9_]/g, "_");
  return /^[0-9]/.test(cleaned) ? `f_${cleaned}` : cleaned || "field";
}
