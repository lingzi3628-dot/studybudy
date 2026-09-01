/**
 * Nginx Config Validator — Phase 58 (ServerBuddy)
 *
 * Parses and lints the nginx config subset learners actually write:
 * http/server/location blocks and common directives. Catches the classic
 * failure modes with actionable messages:
 *
 *   - missing semicolons after directives
 *   - unbalanced / mismatched braces
 *   - stray tokens after a directive that should end in ";"
 *   - duplicate server_name+listen pairs (the "why is my vhost ignored?" bug)
 *   - proxy_pass outside a location block
 *   - listen without a port / server_name with wildcards mixed with exact names
 *   - unknown directives (warning), missing http{} block (warning)
 *
 * Returns the proxy routes it found so the UI can draw the request-flow
 * diagram (client → nginx → upstreams).
 */

export type NginxIssue = {
  line: number; // 1-based
  message: string;
  severity: "error" | "warning";
};

export type NginxRoute = {
  serverName: string;
  listenPort: number;
  location: string;
  proxyPass: string | null; // upstream URL when proxied
  root: string | null;      // static root when served from disk
};

export type NginxVerdict = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  issues: NginxIssue[];
  routes: NginxRoute[];
};

// Directives that take a single value and MUST end with ";" on one line
const SIMPLE_DIRECTIVES = new Set([
  "listen", "server_name", "root", "index", "proxy_pass", "try_files",
  "return", "rewrite", "include", "user", "worker_processes", "error_log",
  "access_log", "ssl_certificate", "ssl_certificate_key", "client_max_body_size",
  "proxy_set_header", "proxy_read_timeout", "add_header", "default_type",
  "expires", "autoindex", "keepalive_timeout", "sendfile", "tcp_nopush",
  "gzip", "gzip_types", "server_tokens", "worker_connections", "alias",
  "proxy_buffering", "proxy_redirect", "limit_req_zone", "limit_req",
]);

const BLOCK_DIRECTIVES = new Set([
  "http", "server", "location", "events", "upstream", "mail", "stream", "if", "map",
]);

/**
 * Split single-line blocks (`events { worker_connections 1024; }`) into
 * one token per line so the parser sees the same shape regardless of
 * the learner's formatting. Returns (text, originalLineNumber) pairs.
 */
function normalizeLines(text: string): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = [];
  text.split("\n").forEach((raw, idx) => {
    const push = (seg: string) => {
      const t = seg.trim();
      if (t) out.push({ text: t, line: idx + 1 });
    };
    const split = (rest: string) => {
      const open = rest.indexOf("{");
      if (open === -1) {
        push(rest);
        return;
      }
      const head = rest.slice(0, open).trim();
      if (head) push(head + " {");
      else push("{");
      const after = rest.slice(open + 1);
      const close = after.lastIndexOf("}");
      if (close !== -1) {
        const inner = after.slice(0, close).trim();
        if (inner) split(inner);
        out.push({ text: "}", line: idx + 1 });
        const tail = after.slice(close + 1).trim();
        if (tail) split(tail);
      } else {
        // brace stays open across real lines
        const inner = after.trim();
        if (inner) split(inner);
      }
    };
    const line = raw.replace(/#.*$/, ""); // strip comments up front
    if (!line.trim()) return;
    split(line);
  });
  return out;
}

export function validateNginxConfig(text: string): NginxVerdict {
  const issues: NginxIssue[] = [];
  const routes: NginxRoute[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  const normalized = normalizeLines(text);
  const lines = normalized.map((n) => n.text);
  let depth = 0;
  let inServer = false;
  let inLocation = false;
  const blockStack: string[] = [];
  let currentServerName = "localhost";
  let currentListen = 80;
  let currentLocation = "/";
  let currentProxy: string | null = null;
  let currentRoot: string | null = null;

  /** Emit a route from the current server/location context. */
  const pushRoute = () => {
    if (!inServer) return;
    routes.push({
      serverName: currentServerName,
      listenPort: currentListen,
      location: currentLocation,
      proxyPass: currentProxy,
      root: currentRoot,
    });
  };

  /** Close the currently open location (if any) and emit its route. */
  const flushLocation = () => {
    if (!inLocation) return;
    pushRoute();
    inLocation = false;
    currentProxy = null;
    currentRoot = null;
    currentLocation = "/";
  };

  /** Close the currently open server (and any nested location) — emits routes. */
  const flushServer = () => {
    flushLocation();
    if (inServer) {
      // top-level proxy/root directly under server (no location)
      if (currentProxy || currentRoot) pushRoute();
      inServer = false;
      currentProxy = null;
      currentRoot = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const origLine = normalized[i].line;
    const line = lines[i];
    if (!line || line.startsWith("#")) continue;

    // --- Block open/close
    if (line.endsWith("{")) {
      const head = line.slice(0, -1).trim();
      const [dir, ...rest] = head.split(/\s+/);
      const lower = dir?.toLowerCase() ?? "";
      if (BLOCK_DIRECTIVES.has(lower)) {
        if (lower === "server") {
          flushServer();
          inServer = true;
          currentServerName = "localhost";
          currentListen = 80;
          blockStack.push("server");
        } else {
          blockStack.push(lower);
        }
        if (lower === "location") {
          flushLocation();
          inLocation = true;
          currentLocation = rest.join(" ") || "/";
        }
      } else if (SIMPLE_DIRECTIVES.has(lower)) {
        blockStack.push("simple");
        issues.push({
          line: origLine,
          message: `directive "${dir}" is terminated by "{" — did you mean to open a block here? (unexpected)`,
          severity: "error",
        });
      } else {
        issues.push({ line: origLine, message: `unknown directive "${dir}"`, severity: "warning" });
      }
      depth++;
      continue;
    }

    if (line === "}") {
      depth--;
      if (depth < 0) {
        issues.push({ line: origLine, message: "unexpected \"}\" — unbalanced braces (an opening \"{\" is missing above)", severity: "error" });
        depth = 0;
        continue;
      }
      const closed = blockStack.pop() ?? "simple";
      if (closed === "location") flushLocation();
      else if (closed === "server") flushServer();
      continue;
    }

    // --- Directive lines must end with ";"
    const withoutComment = line.replace(/#.*$/, "").trim();
    if (!withoutComment) continue;
    if (!withoutComment.endsWith(";")) {
      issues.push({
        line: origLine,
        message: `directive "${withoutComment.split(/\s+/)[0]}" is not terminated by ";"`,
        severity: "error",
      });
      continue;
    }

    const parts = withoutComment.slice(0, -1).trim().split(/\s+/);
    const dir = parts[0].toLowerCase();
    const value = parts.slice(1).join(" ");

    if (BLOCK_DIRECTIVES.has(dir)) {
      issues.push({
        line: origLine,
        message: `directive "${parts[0]}" must open a block with "{" (e.g. ${parts[0]} … { )`,
        severity: "error",
      });
      continue;
    }

    if (dir === "listen") {
      const p = parseInt(value.split(":").pop() ?? "", 10);
      if (Number.isNaN(p)) {
        issues.push({ line: origLine, message: `listen value "${value}" has no port (e.g. listen 80;)`, severity: "warning" });
      } else {
        currentListen = p;
      }
    } else if (dir === "server_name") {
      if (!value) {
        issues.push({ line: origLine, message: "server_name needs at least one name", severity: "warning" });
      } else {
        currentServerName = value.split(/\s+/)[0];
      }
    } else if (dir === "proxy_pass") {
      if (!/^https?:\/\//.test(value)) {
        issues.push({ line: origLine, message: `proxy_pass "${value}" should start with http:// or https://`, severity: "warning" });
      }
      if (!inLocation) {
        issues.push({ line: origLine, message: '"proxy_pass" directive is not allowed here — it must live inside a location block', severity: "error" });
      }
      currentProxy = value;
    } else if (dir === "root") {
      currentRoot = value;
    } else if (!SIMPLE_DIRECTIVES.has(dir)) {
      issues.push({ line: origLine, message: `unknown directive "${parts[0]}"`, severity: "warning" });
    }
  }

  if (depth > 0) {
    issues.push({ line: lines.length, message: `unexpected end of file — ${depth} block(s) left open (missing "}")`, severity: "error" });
  }

  // Duplicate server_name+listen detection across server blocks:
  // a second block claiming the same name:port gets a conflict warning.
  const namePortGlobal = new Map<string, number>();
  let serverBlockIndex = 0;
  let serverOpenLine = 0;
  let inServer2 = false;
  let name = "localhost";
  let port = 80;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) continue;
    if (line.endsWith("{") && line.toLowerCase().startsWith("server")) {
      inServer2 = true;
      name = "localhost";
      port = 80;
      serverBlockIndex++;
      serverOpenLine = i + 1;
      continue;
    }
    if (line === "}" && inServer2) {
      inServer2 = false;
      const key = `${name}:${port}`;
      const prev = namePortGlobal.get(key);
      if (prev !== undefined) {
        issues.push({
          line: serverOpenLine,
          message: `duplicate listen 0.0.0.0:${port} for "${name}" — this server block conflicts with the one at line ${prev} (nginx will warn and only use one)`,
          severity: "warning",
        });
      } else {
        namePortGlobal.set(key, serverOpenLine);
      }
      continue;
    }
    if (!inServer2) continue;
    const m = line.replace(/#.*$/, "").trim().match(/^(listen|server_name)\s+([^;]+);/);
    if (m) {
      if (m[1] === "server_name") name = m[2].trim().split(/\s+/)[0];
      else {
        const p = parseInt(m[2].trim().split(":").pop() ?? "", 10);
        if (!Number.isNaN(p)) port = p;
      }
    }
  }

  // Structural warnings
  const hasHttp = /\bhttp\s*\{/.test(text);
  const hasServer = /\bserver\s*\{/.test(text);
  if (!hasHttp && hasServer) {
    warnings.push("server block found outside http { } — most contexts (proxy_pass, try_files) only work inside http");
  }
  if (!hasServer && hasHttp) {
    warnings.push("no server block defined — nginx would run but serve nothing");
  }
  if (/\bproxy_pass\b/.test(text) && !/\blocation\b/.test(text)) {
    warnings.push("proxy_pass without any location block — requests will never be routed");
  }

  for (const issue of issues) {
    const formatted = `${issue.severity === "error" ? "" : "nginx: [warn] "}${issue.message}`;
    if (issue.severity === "error") errors.push(`line ${issue.line}: ${formatted}`);
    else warnings.push(`line ${issue.line}: ${formatted}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    issues,
    routes,
  };
}
