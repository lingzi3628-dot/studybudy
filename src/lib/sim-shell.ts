/**
 * SimShell — Phase 58 (ServerBuddy)
 *
 * A bash-flavored command interpreter over the SimFs fake filesystem.
 * Everything is simulated client-side: services (nginx, ssh, app,
 * postgres, cron) have state + journals, `docker build` parses a real
 * Dockerfile the learner wrote and "runs" it, `docker-compose up`
 * handles a compose subset, and `curl` answers only from within the
 * simulation (external targets get a pointer to the real, SSRF-guarded
 * API tester in BackendBuddy).
 *
 * The teaching trick: `systemctl restart nginx` actually VALIDATES the
 * learner's nginx config — a broken config fails the restart and shows
 * up in `journalctl -u nginx`, exactly like the real world.
 */

import { SimFs, SimFsError, SimFs as SimFsClass, type SimNode } from "./sim-fs";
import { validateNginxConfig } from "./nginx-validator";

// ---------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------

export type SimService = {
  name: string;
  running: boolean;
  enabled: boolean;
  port: number | null;
  description: string;
  journal: string[]; // newest last
};

export type SimImage = {
  tag: string;
  from: string;
  exposedPorts: number[];
  cmd: string[] | null;
  workdir: string;
  env: string[];
  createdAt: number;
};

export type SimContainer = {
  id: string;
  name: string;
  image: string;
  status: "running" | "exited";
  portMaps: { host: number; container: number }[];
  logs: string[];
  createdAt: number;
};

export type ShellResult = {
  output: string;
  isError?: boolean;
  clear?: boolean;
};

const KNOWN_IMAGES = new Set([
  "node:20-alpine", "node:20", "node:latest",
  "python:3.12-slim", "python:3.12", "python:latest",
  "nginx:alpine", "nginx:latest", "nginx",
  "ubuntu:24.04", "ubuntu:latest",
  "alpine:3.20", "alpine",
]);

const PAD_WIDTH = 22;

function padCell(s: string, w = PAD_WIDTH): string {
  return (s.length >= w ? s.slice(0, w - 1) + " " : s.padEnd(w));
}

function shortHash(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0").slice(0, 12);
}

const DOCKER_NAMES = [
  "vigilant-tesla", "gallant-ada", "nostalgic-turing", "jolly-lovelace",
  "quirky-hopper", "serene-fermat", "brave-noether", "calm-gauss",
];

// ---------------------------------------------------------------------
// The shell
// ---------------------------------------------------------------------

export class SimShell {
  fs: SimFs;
  cwd: string;
  services: Map<string, SimService>;
  containers: SimContainer[] = [];
  images: SimImage[] = [];
  history: string[] = [];

  constructor() {
    this.fs = new SimFs();
    this.cwd = `/home/${this.fs.user.name}`;
    this.services = new Map(
      (
        [
          { name: "nginx", running: true, enabled: true, port: 80, description: "A high performance web server and reverse proxy", journal: [] },
          { name: "ssh", running: true, enabled: true, port: 22, description: "OpenBSD Secure Shell server", journal: [] },
          { name: "app", running: false, enabled: false, port: 3000, description: "StudyBuddy demo Node app", journal: [] },
          { name: "postgres", running: true, enabled: true, port: 5432, description: "PostgreSQL RDBMS", journal: [] },
          { name: "cron", running: true, enabled: true, port: null, description: "Regular background program processing", journal: [] },
        ] as SimService[]
      ).map((s) => [s.name, s])
    );
    this.log("systemd", "Started Session 1 of user dev.");
    this.log("nginx", "nginx: configuration file /etc/nginx/nginx.conf test is successful");
    this.log("nginx", "Started nginx. init: listen 80 ready.");
  }

  private log(service: string, line: string) {
    const s = this.services.get(service);
    if (!s) return;
    s.journal.push(line);
    if (s.journal.length > 200) s.journal.shift();
  }

  private nginxConfigText(): string {
    try {
      return this.fs.readFile("/etc/nginx/nginx.conf");
    } catch {
      return "";
    }
  }

  /** Main entry — run one command line. */
  run(input: string): ShellResult {
    const line = input.trim();
    if (!line) return { output: "" };
    this.history.push(line);

    let elevated = false;
    let work = line;
    if (work.startsWith("sudo ")) {
      elevated = true;
      work = work.slice(5).trim();
      if (!work) return { output: "usage: sudo <command>" };
    }
    this.fs.user.elevated = elevated;
    if (elevated && !work.startsWith("chown") && !work.startsWith("chmod") && !work.startsWith("rm") && !work.startsWith("cat")) {
      // Note once, so learners see why nothing failed
      // (kept subtle — only for commands that usually require root)
    }

    try {
      // Output redirection for echo
      const redirect = work.match(/^(.*?)\s*(>>|>)\s*(\S+)\s*$/);
      if (redirect && !work.startsWith("echo")) {
        return { output: `bash: syntax error near unexpected token \`>'`, isError: true };
      }
      if (work.startsWith("echo")) {
        return this.cmdEcho(work, redirect);
      }
      const [cmd, ...args] = work.split(/\s+/);
      switch (cmd) {
        case "help": return { output: this.cmdHelp() };
        case "pwd": return { output: this.cwd };
        case "whoami": return { output: this.fs.user.name };
        case "hostname": return { output: "webdev" };
        case "date": return { output: new Date().toString() };
        case "clear": return { output: "", clear: true };
        case "exit":
        case "logout": return { output: "logout (this is a simulation — just close the tab when done)" };
        case "ls": return this.cmdLs(args);
        case "cd": return this.cmdCd(args);
        case "cat": return this.cmdCat(args);
        case "touch": return this.cmdTouch(args);
        case "mkdir": return this.cmdMkdir(args);
        case "rm": return this.cmdRm(args);
        case "chmod": return this.cmdChmod(args);
        case "chown": return this.cmdChown(args);
        case "grep": return this.cmdGrep(args);
        case "ps": return this.cmdPs(args);
        case "systemctl": return this.cmdSystemctl(args, elevated);
        case "journalctl": return this.cmdJournalctl(args);
        case "nginx": return this.cmdNginx(args);
        case "curl": return this.cmdCurl(args);
        case "docker": return this.cmdDocker(args);
        case "docker-compose": return this.cmdDockerCompose(args);
        case "compose": return this.cmdDockerCompose(args);
        case "history": return { output: this.history.map((h, i) => padCell(String(i + 1), 6) + h).join("\n") };
        default:
          return { output: `bash: ${cmd}: command not found (try \`help\`)`, isError: true };
      }
    } catch (e) {
      if (e instanceof SimFsError) return { output: `${cmd0(work)}: ${e.message}`, isError: true };
      return { output: `${cmd0(work)}: ${e instanceof Error ? e.message : String(e)}`, isError: true };
    } finally {
      this.fs.user.elevated = false;
    }
  }

  // -----------------------------------------------------------------
  // Filesystem commands
  // -----------------------------------------------------------------

  private cmdHelp(): string {
    return `ServerBuddy simulated shell — everything here is fake and safe.

Filesystem   ls [-la] [path] · cd [path] · pwd · cat FILE · touch FILE
             mkdir [-p] DIR · rm [-r] PATH · echo TEXT > FILE · echo TEXT >> FILE
             grep PATTERN FILE · chmod MODE PATH · sudo chown USER PATH
Permissions  ls -l shows rwx bits; root-owned files need sudo
Services     ps aux · systemctl status|start|stop|restart|enable SERVICE
             journalctl -u SERVICE [-n LINES] · services: nginx ssh app postgres cron
Nginx        nginx -t (validates /etc/nginx/nginx.conf — or edit it in the Nginx tab)
Docker       docker build -t TAG [DIR] · docker run [-p HOST:CT] [-d] [-n NAME] IMG
             docker ps · docker stop ID · docker rm ID · docker images · docker logs ID
             docker pull IMAGE · docker-compose up [-d] | down | ps | logs
Network      curl http://localhost[:port]/path (simulation answers for local services)
Other        whoami · hostname · date · history · clear · exit`;
  }

  private cmdLs(args: string[]): ShellResult {
    const long = args.includes("-l") || args.includes("-la") || args.includes("-al");
    const all = args.includes("-a") || args.includes("-la") || args.includes("-al");
    const pathArg = args.find((a) => !a.startsWith("-")) ?? ".";
    const abs = this.fs.resolvePath(pathArg, this.cwd);
    let nodes: SimNode[] = this.fs.list(abs);
    if (all) {
      const dotEntries = long
        ? ["total " + (nodes.length + 2)]
        : [];
      if (long) {
        const d = new Date();
        const stamp = `${d.toLocaleString("en", { month: "short" })} ${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        return {
          output: [
            dotEntries[0],
            `drwxr-xr-x ${padCell(this.fs.get(abs)?.owner ?? "dev", 6)} ${padCell(this.fs.get(abs)?.group ?? "dev", 6)} ${padCell("4096", 6)} ${stamp} .`,
            `drwxr-xr-x ${padCell("root", 6)} ${padCell("root", 6)} ${padCell("4096", 6)} ${stamp} ..`,
            ...nodes.map((n) => {
              const nd = new Date(n.modifiedAt);
              const st = `${nd.toLocaleString("en", { month: "short" })} ${nd.getDate()} ${String(nd.getHours()).padStart(2, "0")}:${String(nd.getMinutes()).padStart(2, "0")}`;
              return `${SimFsClass.modeString(n)} ${padCell(n.owner, 6)} ${padCell(n.group, 6)} ${padCell(String(n.content.length || 4096), 6)} ${st} ${n.name}`;
            }),
          ].join("\n"),
        };
      }
      return { output: [".", "..", ...nodes.map((n) => (n.type === "dir" ? `${n.name}/` : n.name))].join("  ") };
    }
    if (long) {
      const lines = nodes.map((n) => {
        const date = new Date(n.modifiedAt);
        const stamp = `${date.toLocaleString("en", { month: "short" })} ${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
        return `${SimFsClass.modeString(n)} ${padCell(n.owner, 6)} ${padCell(n.group, 6)} ${padCell(String(n.content.length || 4096), 6)} ${stamp} ${n.name}`;
      });
      return { output: `total ${nodes.length}\n${lines.join("\n")}` };
    }
    return { output: nodes.map((n) => (n.type === "dir" ? `${n.name}/` : n.name)).join("  ") || "" };
  }

  private cmdCd(args: string[]): ShellResult {
    const target = args[0] ?? `~`;
    const abs = this.fs.resolvePath(target, this.cwd);
    const node = this.fs.get(abs);
    if (!node) return { output: `cd: ${target}: No such file or directory`, isError: true };
    if (node.type !== "dir") return { output: `cd: ${target}: Not a directory`, isError: true };
    this.cwd = abs;
    return { output: "" };
  }

  private cmdCat(args: string[]): ShellResult {
    if (args.length === 0) return { output: "cat: missing file operand", isError: true };
    const outs: string[] = [];
    for (const a of args) {
      const abs = this.fs.resolvePath(a, this.cwd);
      outs.push(this.fs.readFile(abs)); // throws with shell-like message
    }
    return { output: outs.join("\n") };
  }

  private cmdTouch(args: string[]): ShellResult {
    if (args.length === 0) return { output: "touch: missing file operand", isError: true };
    for (const a of args) {
      const abs = this.fs.resolvePath(a, this.cwd);
      if (this.fs.exists(abs)) {
        const node = this.fs.get(abs)!;
        node.modifiedAt = Date.now();
      } else {
        this.fs.writeFile(abs, "");
      }
    }
    return { output: "" };
  }

  private cmdMkdir(args: string[]): ShellResult {
    const recursive = args.includes("-p");
    const targets = args.filter((a) => !a.startsWith("-"));
    if (targets.length === 0) return { output: "mkdir: missing operand", isError: true };
    for (const t of targets) this.fs.mkdir(this.fs.resolvePath(t, this.cwd), recursive);
    return { output: "" };
  }

  private cmdRm(args: string[]): ShellResult {
    const recursive = args.includes("-r") || args.includes("-rf") || args.includes("-fr");
    const targets = args.filter((a) => !a.startsWith("-"));
    if (targets.length === 0) return { output: "rm: missing operand", isError: true };
    for (const t of targets) this.fs.remove(this.fs.resolvePath(t, this.cwd), recursive);
    return { output: "" };
  }

  private cmdChmod(args: string[]): ShellResult {
    const spec = args.find((a) => /^[0-7]{3,4}$/.test(a) || /^[ugoa]*[+\-=][rwx]+/.test(a) || a.includes(","));
    const rest = args.filter((a) => a !== spec);
    const target = rest.find((a) => !a.startsWith("-"));
    if (!spec || !target) return { output: "chmod: missing operand (usage: chmod 755 FILE | chmod u+x FILE)", isError: true };
    this.fs.chmod(this.fs.resolvePath(target, this.cwd), spec);
    return { output: "" };
  }

  private cmdChown(args: string[]): ShellResult {
    const ownerSpec = args[0];
    const target = args[1];
    if (!ownerSpec || !target) return { output: "chown: missing operand (usage: chown user[:group] FILE)", isError: true };
    const [owner, group] = ownerSpec.split(":");
    this.fs.chown(this.fs.resolvePath(target, this.cwd), owner, group);
    return { output: "" };
  }

  private cmdGrep(args: string[]): ShellResult {
    const [pattern, ...files] = args.filter((a) => !a.startsWith("-"));
    if (!pattern || files.length === 0) {
      return { output: "grep: usage: grep PATTERN FILE", isError: true };
    }
    const out: string[] = [];
    for (const f of files) {
      const content = this.fs.readFile(this.fs.resolvePath(f, this.cwd));
      content.split("\n").forEach((line, i) => {
        if (line.includes(pattern)) out.push(`${files.length > 1 ? `${f}:` : ""}${i + 1}:${line}`);
      });
    }
    return { output: out.join("\n") || "" };
  }

  private cmdEcho(work: string, redirect: RegExpMatchArray | null): ShellResult {
    // With a redirect, everything before the > / >> marker is the body
    const rawBody = redirect ? redirect[1] : work;
    const body = rawBody.slice(4).trim().replace(/^["']+|["']+$/g, "");
    if (!redirect) return { output: body };
    const [, , op, file] = redirect;
    const abs = this.fs.resolvePath(file, this.cwd);
    try {
      const existing = op === ">>" && this.fs.exists(abs) ? this.fs.readFile(abs) : "";
      this.fs.writeFile(abs, (existing ? existing + "\n" : "") + body);
      return { output: "" };
    } catch (e) {
      return { output: `bash: ${file}: ${e instanceof Error ? e.message : "error"}`, isError: true };
    }
  }

  // -----------------------------------------------------------------
  // Processes & services
  // -----------------------------------------------------------------

  private runningRows(): string[][] {
    const rows: string[][] = [
      ["PID", "USER", "%CPU", "%MEM", "COMMAND"],
    ];
    rows.push(["1", "root", "0.1", "0.3", "/sbin/init (simulated)"]);
    for (const s of this.services.values()) {
      if (s.running) {
        rows.push([String(100 + s.name.length * 7), s.port === null ? "root" : "www-data", "0.4", "1.2", `/usr/sbin/${s.name}`]);
      }
    }
    for (const c of this.containers) {
      if (c.status === "running") {
        rows.push([String(200 + (c.id.charCodeAt(0) % 80)), "dev", "1.1", "3.4", `docker: ${c.image} (${c.name})`]);
      }
    }
    return rows;
  }

  private cmdPs(_args: string[]): ShellResult {
    const rows = this.runningRows();
    const out = rows.map((r, i) => (i === 0 ? r.join("  ") : r.slice(0, 4).map((c, j) => padCell(c, j === 0 ? 6 : j === 1 ? 8 : 6)).join("") + r[4]));
    return { output: out.join("\n") };
  }

  private cmdSystemctl(args: string[], elevated: boolean): ShellResult {
    const [action, serviceName] = args;
    if (!action || !serviceName) {
      return { output: "systemctl: usage: systemctl status|start|stop|restart|enable SERVICE", isError: true };
    }
    const svc = this.services.get(serviceName.replace(".service", ""));
    if (!svc) return { output: `Unit ${serviceName}.service could not be found.`, isError: true };

    switch (action) {
      case "status": {
        const state = svc.running ? "active (running)" : svc.enabled ? "inactive (dead)" : "inactive (dead)";
        const lines = [
          `● ${svc.name}.service - ${svc.description}`,
          `     Loaded: loaded (/etc/systemd/system/${svc.name}.service; ${svc.enabled ? "enabled" : "disabled"})`,
          `     Active: ${state}`,
        ];
        if (svc.running) {
          const recent = svc.journal.slice(-2);
          for (const l of recent) lines.push(`      ${l}`);
        }
        return { output: lines.join("\n") };
      }
      case "start": {
        if (svc.running) return { output: "" };
        if (svc.name === "nginx") {
          const verdict = validateNginxConfig(this.nginxConfigText());
          if (!verdict.ok) {
            this.log("nginx", `nginx: [emerg] ${verdict.errors[0]}`);
            return {
              output: `Job for nginx.service failed because the control process exited with error code.\nSee "systemctl status nginx" and "journalctl -u nginx" for details.\nHint: run \`nginx -t\` — ${verdict.errors[0]}`,
              isError: true,
            };
          }
        }
        svc.running = true;
        this.log(svc.name, `Started ${svc.description.toLowerCase()}.`);
        return { output: "" };
      }
      case "stop": {
        if (!svc.running) return { output: "" };
        svc.running = false;
        this.log(svc.name, `Stopped ${svc.description.toLowerCase()}.`);
        return { output: "" };
      }
      case "restart": {
        const stopRes = svc.running ? this.cmdSystemctl(["stop", svc.name], elevated) : { output: "" };
        const startRes = this.cmdSystemctl(["start", svc.name], elevated);
        if (startRes.isError) return startRes;
        return stopRes;
      }
      case "enable": {
        svc.enabled = true;
        return { output: `Created symlink /etc/systemd/system/multi-user.target.wants/${svc.name}.service → /etc/systemd/system/${svc.name}.service.` };
      }
      default:
        return { output: `systemctl: unknown operation ${action}`, isError: true };
    }
  }

  private cmdJournalctl(args: string[]): ShellResult {
    const uIdx = args.indexOf("-u");
    const nIdx = args.indexOf("-n");
    const service = uIdx >= 0 ? args[uIdx + 1]?.replace(".service", "") : undefined;
    const limit = nIdx >= 0 ? parseInt(args[nIdx + 1], 10) || 10 : 10;
    const stamp = () => {
      const d = new Date();
      return d.toISOString().replace("T", " ").slice(0, 19);
    };
    const render = (name: string, lines: string[]) =>
      lines.slice(-limit).map((l) => `${stamp()} webdev ${name}[${100 + name.length * 7}]: ${l}`);

    if (service) {
      const svc = this.services.get(service);
      if (!svc) return { output: `Failed to add match "_SYSTEMD_UNIT=${service}.service".`, isError: true };
      return { output: render(service, svc.journal).join("\n") || "-- No entries --" };
    }
    const all: string[] = [];
    for (const s of this.services.values()) all.push(...render(s.name, s.journal.slice(-limit)));
    return { output: all.slice(-limit).join("\n") || "-- No entries --" };
  }

  // -----------------------------------------------------------------
  // Nginx
  // -----------------------------------------------------------------

  private cmdNginx(args: string[]): ShellResult {
    if (args[0] !== "-t") {
      return { output: "nginx: supported in this simulation: nginx -t (test configuration)", isError: true };
    }
    const config = this.nginxConfigText();
    if (!config.trim()) {
      return { output: "nginx: the configuration file /etc/nginx/nginx.conf has no contents", isError: true };
    }
    const verdict = validateNginxConfig(config);
    const prefix = "nginx: the configuration file /etc/nginx/nginx.conf syntax is ";
    if (verdict.ok) {
      return { output: `${prefix}ok\nnginx: configuration file /etc/nginx/nginx.conf test is successful` };
    }
    return {
      output: [`${prefix}is invalid:`, ...verdict.errors.map((e) => `nginx: [emerg] ${e}`)].join("\n"),
      isError: true,
    };
  }

  // -----------------------------------------------------------------
  // curl — answers only from inside the simulation
  // -----------------------------------------------------------------

  private cmdCurl(args: string[]): ShellResult {
    const url = args.find((a) => !a.startsWith("-"));
    if (!url) return { output: "curl: no URL specified", isError: true };
    const m = url.match(/^http:\/\/([^/:]+)(?::(\d+))?(\/.*)?$/);
    if (!m) {
      return {
        output: `curl: this simulation only answers http://localhost[:port] requests.\nFor real external URLs use BackendBuddy's API Tester (the SSRF-guarded /api/tools/http proxy).`,
        isError: true,
      };
    }
    const [, host, portStr, path = "/"] = m;
    const port = portStr ? parseInt(portStr, 10) : 80;
    if (!["localhost", "127.0.0.1", "0.0.0.0", "webdev"].includes(host)) {
      return {
        output: `curl: (6) Could not resolve host: ${host} — the sim network only resolves localhost`,
        isError: true,
      };
    }

    // Containers first (mapped host ports)
    const container = this.containers.find(
      (c) => c.status === "running" && c.portMaps.some((p) => p.host === port)
    );
    if (container) {
      const body = this.containerResponseBody(container);
      this.appendAccessLog(port, path, 200);
      return { output: this.httpResponse(200, body) };
    }

    // Then services
    for (const s of this.services.values()) {
      if (s.running && s.port === port) {
        if (s.name === "nginx") {
          const served = this.serveNginx(path);
          this.appendAccessLog(port, path, served.status);
          return { output: this.httpResponse(served.status, served.body) };
        }
        if (s.name === "app") {
          return { output: this.httpResponse(200, "Hello from the demo app!") };
        }
        return { output: this.httpResponse(200, `${s.name} responded (simulated binary/protocol output suppressed)`) };
      }
    }

    return { output: `curl: (7) Failed to connect to localhost port ${port}: Connection refused`, isError: true };
  }

  private appendAccessLog(port: number, path: string, status: number) {
    const nginxSvc = this.services.get("nginx");
    if (nginxSvc?.running && port === 80) {
      this.log("nginx", `${Date.now() % 100000} "GET ${path}" ${status} — simulated access log`);
    }
  }

  private serveNginx(path: string): { status: number; body: string } {
    // Serve files from /var/www/html for the default server block
    if (path === "/" || path === "/index.html") {
      try {
        const body = this.fs.readFile("/var/www/html/index.html");
        return { status: 200, body };
      } catch {
        return { status: 500, body: "500 Internal Server Error (index.html missing)" };
      }
    }
    const target = this.fs.get("/var/www/html" + path);
    if (target && target.type === "file") return { status: 200, body: target.content };
    return { status: 404, body: "<h1>404 Not Found</h1>" };
  }

  private containerResponseBody(container: SimContainer): string {
    const image = this.images.find((i) => i.tag === container.image);
    if (image?.from.startsWith("node")) return "Hello from the demo app!";
    if (image?.from.startsWith("nginx")) return "<h1>It works! (from a container)</h1>";
    return `Response from container ${container.name} (simulated)`;
  }

  private httpResponse(status: number, body: string): string {
    const reason = { 200: "OK", 404: "Not Found", 500: "Internal Server Error" }[status] ?? "OK";
    return [
      `HTTP/1.1 ${status} ${reason}`,
      "Server: nginx/1.24-sim (ServerBuddy)",
      "Content-Type: text/html",
      `Content-Length: ${body.length}`,
      "",
      body,
    ].join("\n");
  }

  // -----------------------------------------------------------------
  // docker
  // -----------------------------------------------------------------

  private cmdDocker(args: string[]): ShellResult {
    const sub = args[0];
    switch (sub) {
      case undefined:
        return { output: "docker: usage: docker build|run|ps|stop|rm|images|logs|pull …", isError: true };
      case "build": return this.dockerBuild(args.slice(1));
      case "run": return this.dockerRun(args.slice(1));
      case "ps": return this.dockerPs();
      case "images": return this.dockerImages();
      case "stop": return this.dockerStop(args.slice(1));
      case "rm": return this.dockerRm(args.slice(1));
      case "logs": return this.dockerLogs(args.slice(1));
      case "pull": return this.dockerPull(args.slice(1));
      default:
        return { output: `docker: unknown command '${sub}' (try build, run, ps, stop, rm, images, logs, pull)`, isError: true };
    }
  }

  /** Parse a Dockerfile into instruction records. */
  static parseDockerfile(text: string): { instruction: string; args: string }[] {
    return text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => {
        const sp = l.indexOf(" ");
        return sp < 0
          ? { instruction: l.toUpperCase(), args: "" }
          : { instruction: l.slice(0, sp).toUpperCase(), args: l.slice(sp + 1).trim() };
      })
      .filter((r) => r.instruction !== "ARG" && r.instruction !== "MAINTAINER");
  }

  private dockerBuild(args: string[]): ShellResult {
    const tIdx = args.indexOf("-t");
    const tag = tIdx >= 0 ? args[tIdx + 1] : null;
    const contextPath = args.filter((a) => !a.startsWith("-") && a !== tag)[0] ?? ".";
    if (!tag) {
      return { output: "docker build: give the image a name with -t, e.g. `docker build -t myapp .`", isError: true };
    }
    const dockerfilePath = this.fs.resolvePath(contextPath === "." ? "Dockerfile" : `${contextPath}/Dockerfile`, this.cwd);
    let dockerfile: string;
    try {
      dockerfile = this.fs.readFile(dockerfilePath);
    } catch {
      return {
        output: `unable to prepare context: unable to evaluate symlinks in Dockerfile path: open ${dockerfilePath}: no such file or directory\nHint: cd into your project directory (it needs a Dockerfile) — try ~/projects/app`,
        isError: true,
      };
    }

    const steps = SimShell.parseDockerfile(dockerfile);
    if (steps.length === 0 || steps[0].instruction !== "FROM") {
      return { output: "failed to solve: Dockerfile parse error: no build stage in current context (a Dockerfile must start with FROM)", isError: true };
    }

    const from = steps[0].args.split(" ")[0];
    const lines: string[] = [];
    if (!KNOWN_IMAGES.has(from)) {
      lines.push(`Unable to find image '${from}' locally`);
      lines.push(`${from}: Pulling from library/${from.split(":")[0]}`);
      lines.push(`Status: Downloaded newer image for ${from}`);
    }
    const env: string[] = [];
    let workdir = "/";
    let cmd: string[] | null = null;
    const exposed: number[] = [];
    let copyFailed = false;

    steps.forEach((step, i) => {
      const n = i + 1;
      const total = steps.length;
      const hash = shortHash(`${tag}:${i}:${step.args}`);
      lines.push(`Step ${n}/${total} : ${step.instruction} ${step.args}`);
      switch (step.instruction) {
        case "WORKDIR":
          workdir = step.args.startsWith("/") ? step.args : `${workdir === "/" ? "" : workdir}/${step.args}`;
          lines.push(` ---> Running in ${shortHash("w" + hash)}\n ---> Removing intermediate container ${shortHash("w" + hash)}`);
          break;
        case "COPY":
        case "ADD": {
          const [src] = step.args.split(/\s+/);
          const srcPath = this.fs.resolvePath(src, this.cwd);
          if (src !== "." && !this.fs.exists(srcPath)) {
            lines.push(` ---> ERROR: COPY failed: file not found in build context: '${src}'`);
            copyFailed = true;
            break;
          }
          break;
        }
        case "RUN":
          lines.push(` ---> Running in ${shortHash("r" + hash)}`);
          lines.push(this.simulateRunOutput(step.args));
          lines.push(` ---> Removing intermediate container ${shortHash("r" + hash)}`);
          break;
        case "ENV":
          env.push(step.args);
          break;
        case "EXPOSE": {
          const p = parseInt(step.args, 10);
          if (!Number.isNaN(p)) exposed.push(p);
          break;
        }
        case "CMD":
        case "ENTRYPOINT":
          try {
            cmd = JSON.parse(step.args) as string[];
          } catch {
            cmd = step.args.split(/\s+/);
          }
          break;
      }
      if (!(copyFailed && (step.instruction === "COPY" || step.instruction === "ADD"))) {
        lines.push(` ---> ${hash}`);
      }
    });

    // If a COPY failed we bail out early
    if (copyFailed) {
      return { output: lines.join("\n"), isError: true };
    }

    this.images = this.images.filter((i) => i.tag !== tag);
    this.images.push({ tag, from, exposedPorts: exposed, cmd, workdir, env, createdAt: Date.now() });
    lines.push(`Successfully built ${shortHash(tag)}`);
    lines.push(`Successfully tagged ${tag}`);
    return { output: lines.join("\n") };
  }

  private simulateRunOutput(args: string): string {
    if (args.includes("npm ")) return "up to date, audited 1 package in 512ms\nfound 0 vulnerabilities";
    if (args.includes("apt")) return "Reading package lists... Done\nBuilding dependency tree... Done\n0 upgraded, 0 newly installed.";
    if (args.includes("pip")) return "Requirement already satisfied: pip in /usr/local/lib/python3.12";
    return `${args.split(/\s+/)[0]}: (simulated build output)`;
  }

  private dockerRun(args: string[]): ShellResult {
    let detached = false;
    let name: string | null = null;
    const portMaps: { host: number; container: number }[] = [];
    const envs: string[] = [];
    const rest: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === "-d") detached = true;
      else if (a === "--name") name = args[++i];
      else if (a === "-p" || a === "--publish") {
        const spec = args[++i];
        const [h, c] = spec.split(":").map((v) => parseInt(v, 10));
        if (Number.isNaN(h) || Number.isNaN(c)) return { output: `docker: invalid port mapping '${spec}'`, isError: true };
        portMaps.push({ host: h, container: c });
      } else if (a === "-e" || a === "--env") {
        envs.push(args[++i]);
      } else if (a === "-it" || a === "-i" || a === "-t") {
        // accepted, terminal not simulated
      } else rest.push(a);
    }
    const image = rest[0];
    if (!image) return { output: "docker: 'docker run' requires at least 1 argument (the image)", isError: true };
    const img = this.images.find((i) => i.tag === image);
    if (!img) {
      return {
        output: `Unable to find image '${image}' locally\ndocker: Error response from daemon: pull access denied for ${image} — build it first with \`docker build -t ${image} .\` or \`docker pull ${image}\`.`,
        isError: true,
      };
    }

    // Port conflicts
    for (const pm of portMaps) {
      const taken = [...this.services.values()].some((s) => s.running && s.port === pm.host)
        || this.containers.some((c) => c.status === "running" && c.portMaps.some((p) => p.host === pm.host));
      if (taken) {
        return {
          output: `docker: Error response from daemon: driver failed programming external connectivity on endpoint: bind 0.0.0.0:${pm.host} port is already allocated`,
          isError: true,
        };
      }
    }

    const id = shortHash(`${image}:${Date.now()}`);
    const cname = name ?? DOCKER_NAMES[Math.floor(Math.random() * DOCKER_NAMES.length)] + "-" + id.slice(0, 4);
    const logs: string[] = [];
    const effectiveCmd = rest.slice(1).length > 0 ? rest.slice(1) : img.cmd;
    if (img.from.startsWith("node")) {
      const port = img.exposedPorts[0] ?? 3000;
      logs.push(``);
      logs.push(`> node ${effectiveCmd?.[1] ?? "index.js"}`);
      logs.push(``);
      logs.push(`Server listening on http://0.0.0.0:${port}`);
    } else if (img.from.startsWith("nginx")) {
      logs.push("/docker-entrypoint.sh: Launching nginx");
      logs.push("nginx start: worker processes ready");
    } else if (effectiveCmd && effectiveCmd.length > 0) {
      logs.push(effectiveCmd.join(" "));
    }
    const container: SimContainer = {
      id,
      name: cname,
      image,
      status: "running",
      portMaps,
      logs,
      createdAt: Date.now(),
    };
    this.containers.push(container);
    const out = [id];
    if (!detached) {
      // Foreground: show the logs as if attached, then "Ctrl+C" note
      out.push(...logs, "^C (container keeps running in this simulation)");
    }
    return { output: out.join("\n") };
  }

  private dockerPs(): ShellResult {
    const running = this.containers.filter((c) => c.status === "running");
    const header = padCell("CONTAINER ID", 16) + padCell("IMAGE", 20) + padCell("STATUS", 14) + padCell("PORTS", 18) + "NAMES";
    if (running.length === 0) return { output: header };
    const rows = running.map((c) =>
      padCell(c.id, 16)
      + padCell(c.image, 20)
      + padCell("Up " + Math.max(1, Math.round((Date.now() - c.createdAt) / 60000)) + "m", 14)
      + padCell(c.portMaps.map((p) => `${p.host}->${p.container}`).join(", "), 18)
      + c.name
    );
    return { output: [header, ...rows].join("\n") };
  }

  private dockerImages(): ShellResult {
    const header = padCell("REPOSITORY:TAG", 26) + padCell("CREATED", 12) + "SIZE";
    if (this.images.length === 0) return { output: header };
    return {
      output: [
        header,
        ...this.images.map((i) =>
          padCell(i.tag, 26) + padCell("1 minute ago", 12) + "SIM_MB"
        ),
      ].join("\n"),
    };
  }

  private findContainer(spec: string): SimContainer | undefined {
    return this.containers.find((c) => c.id === spec || c.name === spec);
  }

  private dockerStop(args: string[]): ShellResult {
    const c = args[0] ? this.findContainer(args[0]) : undefined;
    if (!c) return { output: `docker: Error: no such container: ${args[0] ?? ""}`, isError: true };
    c.status = "exited";
    return { output: c.id };
  }

  private dockerRm(args: string[]): ShellResult {
    const c = args[0] ? this.findContainer(args[0]) : undefined;
    if (!c) return { output: `docker: Error: no such container: ${args[0] ?? ""}`, isError: true };
    if (c.status === "running") return { output: `docker: Error response from daemon: cannot remove a running container — stop it first`, isError: true };
    this.containers = this.containers.filter((x) => x !== c);
    return { output: c.id };
  }

  private dockerLogs(args: string[]): ShellResult {
    const c = args[0] ? this.findContainer(args[0]) : undefined;
    if (!c) return { output: `docker: Error: no such container: ${args[0] ?? ""}`, isError: true };
    return { output: c.logs.join("\n") || "-- no logs --" };
  }

  private dockerPull(args: string[]): ShellResult {
    const image = args[0];
    if (!image) return { output: "docker pull: requires an image name", isError: true };
    if (!this.images.some((i) => i.tag === image)) {
      this.images.push({ tag: image, from: image, exposedPorts: [], cmd: null, workdir: "/", env: [], createdAt: Date.now() });
    }
    return {
      output: `${image}: Pulling from library/${image.split(":")[0]}\nDigest: sha256:${shortHash(image)}\nStatus: Downloaded newer image for ${image}`,
    };
  }

  // -----------------------------------------------------------------
  // docker-compose (subset)
  // -----------------------------------------------------------------

  static parseCompose(text: string): { name: string; image?: string; build?: boolean; ports: { host: number; container: number }[]; env: string[] }[] {
    const services: ReturnType<typeof SimShell.parseCompose> = [];
    let current: (typeof services)[number] | null = null;
    let inPorts = false;
    let inEnv = false;
    for (const raw of text.split("\n")) {
      const line = raw.replace(/\t/g, "  ");
      if (!line.trim() || line.trim().startsWith("#")) continue;
      const indent = line.length - line.trimStart().length;
      const trimmed = line.trim();
      if (indent === 0 && trimmed.endsWith(":")) {
        continue; // top-level key like "services:" or "version:"
      }
      if (indent === 2 && trimmed.endsWith(":")) {
        current = { name: trimmed.slice(0, -1), ports: [], env: [] };
        services.push(current);
        inPorts = false;
        inEnv = false;
        continue;
      }
      if (!current) continue;
      if (indent === 4 && !trimmed.startsWith("-")) {
        inPorts = trimmed.startsWith("ports:");
        inEnv = trimmed.startsWith("environment:");
        // split on the FIRST colon only — values may contain colons (image tags, ports)
        const colon = trimmed.indexOf(":");
        const k = colon >= 0 ? trimmed.slice(0, colon).trim() : trimmed;
        const v = colon >= 0 ? trimmed.slice(colon + 1).trim() : "";
        if (k === "image" && v) current.image = v.replace(/["']/g, "");
        if (k === "build") current.build = true;
        continue;
      }
      if (trimmed.startsWith("-") && current) {
        const item = trimmed.slice(1).trim().replace(/["']/g, "");
        if (inPorts) {
          const [h, c] = item.split(":").map((v) => parseInt(v, 10));
          if (!Number.isNaN(h) && !Number.isNaN(c)) current.ports.push({ host: h, container: c });
        } else if (inEnv) {
          current.env.push(item);
        }
      }
    }
    return services;
  }

  private cmdDockerCompose(args: string[]): ShellResult {
    const sub = args[0];
    const composePath = this.fs.resolvePath("docker-compose.yml", this.cwd);
    let text: string;
    try {
      text = this.fs.readFile(composePath);
    } catch {
      return { output: `no configuration file provided: open ${composePath}: no such file or directory\nHint: create a docker-compose.yml in the current directory (~/projects/app has one to start from)`, isError: true };
    }
    const services = SimShell.parseCompose(text);
    if (services.length === 0) {
      return { output: "no services defined in docker-compose.yml", isError: true };
    }

    switch (sub) {
      case "up": {
        const out: string[] = [];
        // Build images for build: services first
        for (const s of services) {
          out.push(`[+] Running ${services.length}/1 · service ${s.name}`);
          if (s.build) {
            const buildRes = this.dockerBuild(["-t", `${s.name}-image`, "."]);
            out.push(buildRes.output);
            if (buildRes.isError) return { output: out.join("\n"), isError: true };
          } else if (s.image) {
            if (!this.images.some((i) => i.tag === s.image)) {
              out.push(this.dockerPull([s.image]).output);
            }
          }
        }
        for (const s of services) {
          const runArgs = ["-d"];
          for (const p of s.ports) runArgs.push("-p", `${p.host}:${p.container}`);
          runArgs.push(s.build ? `${s.name}-image` : (s.image ?? `${s.name}:latest`));
          const runRes = this.dockerRun(runArgs);
          if (runRes.isError) return { output: [...out, runRes.output].join("\n"), isError: true };
          out.push(` ✔ Container ${s.name} started`);
        }
        return { output: out.join("\n") };
      }
      case "down": {
        let removed = 0;
        for (const s of services) {
          for (const c of this.containers.filter((x) => x.image === (s.build ? `${s.name}-image` : s.image))) {
            c.status = "exited";
            this.containers = this.containers.filter((x) => x !== c);
            removed++;
          }
        }
        return { output: `[+] Running ${removed}/0\n ✔ Containers stopped and removed` };
      }
      case "ps":
        return this.dockerPs();
      case "logs": {
        const all = this.containers
          .filter((c) => c.status === "running")
          .flatMap((c) => c.logs.map((l) => `${c.name}  | ${l}`));
        return { output: all.join("\n") || "-- no logs --" };
      }
      default:
        return { output: `docker-compose: unknown command '${sub ?? ""}' (try up, down, ps, logs)`, isError: true };
    }
  }
}

function cmd0(work: string): string {
  return work.split(/\s+/)[0];
}
