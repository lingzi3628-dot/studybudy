/**
 * SimFs — Phase 58 (ServerBuddy)
 *
 * A client-side simulated Linux filesystem: a tree of nodes with
 * permissions and ownership, POSIX-style path resolution, and the
 * primitives the shell interpreter needs (ls, cd, cat, write, mkdir,
 * rm, chmod, chown). Everything is in-memory — no real server, no risk.
 *
 * Permissions are checked for a single virtual user ("dev", group
 * "dev"); root-owned nodes deny read/write unless the shell elevates
 * via `sudo` (the sim grants elevation with a notice, teaching when
 * sudo is needed without blocking the learner).
 */

export type SimNodeType = "dir" | "file";

export type SimNode = {
  name: string;
  type: SimNodeType;
  /** octal permission bits, e.g. 0o644 */
  mode: number;
  owner: string; // "dev" | "root" | service users
  group: string;
  content: string; // files only
  children: Map<string, SimNode>; // dirs only
  modifiedAt: number;
};

export type SimUser = { name: string; group: string; elevated: boolean };

export const DEFAULT_USER: SimUser = { name: "dev", group: "dev", elevated: false };

const DIR_DEFAULT = 0o755;
const FILE_DEFAULT = 0o644;

function now(): number {
  return Date.now();
}

function newDir(name: string, owner = "dev", mode = DIR_DEFAULT): SimNode {
  return { name, type: "dir", mode, owner, group: owner === "root" ? "root" : "dev", content: "", children: new Map(), modifiedAt: now() };
}

function newFile(name: string, content = "", owner = "dev", mode = FILE_DEFAULT): SimNode {
  return { name, type: "file", mode, owner, group: owner === "root" ? "root" : "dev", content, children: new Map(), modifiedAt: now() };
}

export class SimFs {
  root: SimNode;
  user: SimUser;

  constructor(user: SimUser = DEFAULT_USER) {
    // Clone the user so elevation state never leaks across instances
    this.user = { ...user };
    this.root = newDir("/", "root");
    this.seedDefaultTree();
  }

  // -----------------------------------------------------------------
  // Default filesystem the learner boots into
  // -----------------------------------------------------------------

  private seedDefaultTree() {
    const etc = newDir("etc", "root");
    const nginx = newDir("nginx", "root");
    nginx.children.set("nginx.conf", newFile(
      "nginx.conf",
      `user www-data;
events { worker_connections 1024; }

http {
    include /etc/nginx/mime.types;

    server {
        listen 80;
        server_name localhost;

        location / {
            root /var/www/html;
            try_files $uri $uri/ =404;
        }
    }
}
`,
      "root",
      0o644
    ));
    const systemd = newDir("systemd", "root");
    const systemDir = newDir("system", "root");
    systemDir.children.set("app.service", newFile(
      "app.service",
      `[Unit]
Description=StudyBuddy demo Node app
After=network.target

[Service]
WorkingDirectory=/home/dev/projects/app
ExecStart=/usr/bin/node index.js
Restart=on-failure
User=dev

[Install]
WantedBy=multi-user.target
`,
      "root"
    ));
    systemd.children.set("system", systemDir);
    etc.children.set("nginx", nginx);
    etc.children.set("systemd", systemd);
    etc.children.set("hostname", newFile("hostname", "webdev\n", "root"));

    const varDir = newDir("var", "root");
    const log = newDir("log", "root");
    const nginxLog = newDir("nginx", "root");
    nginxLog.children.set("access.log", newFile("access.log", "", "root"));
    nginxLog.children.set("error.log", newFile("error.log", "", "root"));
    log.children.set("nginx", nginxLog);
    log.children.set("syslog", newFile("syslog", "", "root"));
    const www = newDir("www", "root");
    const html = newDir("html", "root");
    html.children.set("index.html", newFile(
      "index.html",
      "<h1>It works! (simulated)</h1>\n",
      "root"
    ));
    www.children.set("html", html);
    varDir.children.set("log", log);
    varDir.children.set("www", www);

    const home = newDir("home", "root");
    const dev = newDir("dev");
    dev.children.set("welcome.txt", newFile(
      "welcome.txt",
      `Welcome to the ServerBuddy simulated shell!

Everything here is fake — you cannot break anything.
Try: ls -l, cat welcome.txt, systemctl status nginx, docker ps

Write a Dockerfile in ~/projects/app and run:
  docker build -t myapp .
  docker run -p 8080:3000 myapp
`
    ));
    const projects = newDir("projects");
    const app = newDir("app");
    app.children.set("index.js", newFile(
      "index.js",
      `const http = require('http');
http.createServer((req, res) => res.end('Hello from the demo app!')).listen(3000);
`
    ));
    app.children.set("Dockerfile", newFile(
      "Dockerfile",
      `FROM node:20-alpine
WORKDIR /app
COPY index.js .
EXPOSE 3000
CMD ["node", "index.js"]
`
    ));
    app.children.set("docker-compose.yml", newFile(
      "docker-compose.yml",
      `services:
  web:
    build: .
    ports:
      - "8080:3000"
`
    ));
    projects.children.set("app", app);
    dev.children.set("projects", projects);
    home.children.set("dev", dev);

    const usrBin = newDir("bin", "root");
    usrBin.children.set("node", newFile("node", "", "root", 0o755));
    const usr = newDir("usr", "root");
    usr.children.set("bin", usrBin);

    this.root.children.set("etc", etc);
    this.root.children.set("var", varDir);
    this.root.children.set("home", home);
    this.root.children.set("usr", usr);
    this.root.children.set("tmp", newDir("tmp", "root", 0o777));
  }

  // -----------------------------------------------------------------
  // Path resolution
  // -----------------------------------------------------------------

  /** Split an absolute path into segments, resolving ".", ".." and empty parts. */
  static resolveSegments(path: string): string[] {
    const parts = path.split("/");
    const out: string[] = [];
    for (const p of parts) {
      if (p === "" || p === ".") continue;
      if (p === "..") out.pop();
      else out.push(p);
    }
    return out;
  }

  /**
   * Resolve a user-typed path against the cwd. Supports "~" for the
   * user's home and relative segments.
   */
  resolvePath(path: string, cwd: string): string {
    const home = `/home/${this.user.name}`;
    let p = path.trim();
    if (p === "" || p === "~") p = home;
    else if (p.startsWith("~/")) p = home + p.slice(1);
    if (p.startsWith("/")) return SimFs.resolveSegments(p).map((s, i, arr) => "/" + s).join("") || "/";
    const base = SimFs.resolveSegments(cwd);
    const merged = SimFs.resolveSegments([...base, p].join("/"));
    return merged.map((s) => "/" + s).join("") || "/";
  }

  /** Walk to the parent of `path`; returns null when a segment is missing or not a dir. */
  private walkParent(absPath: string): SimNode | null {
    const segs = SimFs.resolveSegments(absPath);
    let node = this.root;
    for (let i = 0; i < segs.length - 1; i++) {
      const next: SimNode | undefined = node.children.get(segs[i]);
      if (!next || next.type !== "dir") return null;
      node = next;
    }
    return node;
  }

  /** Look up a node by absolute path; null when missing. */
  get(absPath: string): SimNode | null {
    const segs = SimFs.resolveSegments(absPath);
    let node = this.root;
    for (const s of segs) {
      if (node.type !== "dir") return null;
      const next: SimNode | undefined = node.children.get(s);
      if (!next) return null;
      node = next;
    }
    return node;
  }

  /** True when the path exists. */
  exists(absPath: string): boolean {
    return this.get(absPath) !== null;
  }

  // -----------------------------------------------------------------
  // Permission checks
  // -----------------------------------------------------------------

  private hasBit(mode: number, bit: number): boolean {
    return (mode & bit) !== 0;
  }

  canRead(node: SimNode): boolean {
    if (this.user.elevated || node.owner === this.user.name) return true;
    if (node.group === this.user.group) return this.hasBit(node.mode, 0o040);
    return this.hasBit(node.mode, 0o004);
  }

  canWrite(node: SimNode): boolean {
    if (this.user.elevated || node.owner === this.user.name) return true;
    if (node.group === this.user.group) return this.hasBit(node.mode, 0o020);
    return this.hasBit(node.mode, 0o002);
  }

  // -----------------------------------------------------------------
  // Primitives (throw SimFsError with a shell-like message on failure)
  // -----------------------------------------------------------------

  list(absPath: string): SimNode[] {
    const node = this.get(absPath);
    if (!node) throw new SimFsError(`cannot access '${absPath}': No such file or directory`);
    if (node.type === "file") return [node];
    if (!this.canRead(node)) throw new SimFsError(`cannot open directory '${absPath}': Permission denied`);
    return [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  readFile(absPath: string): string {
    const node = this.get(absPath);
    if (!node) throw new SimFsError(`${absPath}: No such file or directory`);
    if (node.type === "dir") throw new SimFsError(`${absPath}: Is a directory`);
    if (!this.canRead(node)) throw new SimFsError(`${absPath}: Permission denied`);
    return node.content;
  }

  writeFile(absPath: string, content: string, createMissing = true): void {
    const parent = this.walkParent(absPath);
    if (!parent) throw new SimFsError(`${absPath}: No such file or directory`);
    const segs = SimFs.resolveSegments(absPath);
    const name = segs[segs.length - 1];
    const existing = parent.children.get(name);
    if (existing) {
      // Overwriting an existing file needs write on the FILE, not the dir
      if (existing.type === "dir") throw new SimFsError(`${absPath}: Is a directory`);
      if (!this.canWrite(existing)) throw new SimFsError(`${absPath}: Permission denied`);
      existing.content = content;
      existing.modifiedAt = now();
    } else {
      // Creating a new file needs write on the parent directory
      if (!this.canWrite(parent)) throw new SimFsError(`${absPath}: Permission denied`);
      if (!createMissing) throw new SimFsError(`${absPath}: No such file or directory`);
      parent.children.set(name, newFile(name, content, this.user.name));
    }
  }

  mkdir(absPath: string, recursive = false): void {
    const segs = SimFs.resolveSegments(absPath);
    if (segs.length === 0) throw new SimFsError("cannot create directory '/': File exists");
    let node = this.root;
    for (let i = 0; i < segs.length; i++) {
      const name = segs[i];
      const existing: SimNode | undefined = node.children.get(name);
      if (existing) {
        if (existing.type === "file") throw new SimFsError(`cannot create directory '${absPath}': File exists`);
        if (i === segs.length - 1 && !recursive) throw new SimFsError(`cannot create directory '${absPath}': File exists`);
        node = existing;
      } else {
        if (i < segs.length - 1 && !recursive) throw new SimFsError(`cannot create directory '${absPath}': No such file or directory`);
        const created = newDir(name, this.user.name);
        node.children.set(name, created);
        node = created;
      }
    }
  }

  remove(absPath: string, recursive = false): void {
    if (absPath === "/" || SimFs.resolveSegments(absPath).length === 0) {
      throw new SimFsError("refusing to remove '/' — even in a simulation, some habits matter");
    }
    const node = this.get(absPath);
    if (!node) throw new SimFsError(`cannot remove '${absPath}': No such file or directory`);
    const parent = this.walkParent(absPath);
    if (!parent) throw new SimFsError(`cannot remove '${absPath}': No such file or directory`);
    const name = SimFs.resolveSegments(absPath).slice(-1)[0];
    if (node.type === "dir" && node.children.size > 0 && !recursive) {
      throw new SimFsError(`cannot remove '${absPath}': Directory not empty`);
    }
    if (!this.canWrite(parent)) throw new SimFsError(`cannot remove '${absPath}': Permission denied`);
    parent.children.delete(name);
  }

  /** Parse "755" (octal string) or symbolic "+x", "u+rwx,go-r" forms. */
  static parseMode(spec: string, current: number): number {
    const octal = spec.match(/^[0-7]{3,4}$/);
    if (octal) return parseInt(spec, 8);
    let mode = current;
    for (const clause of spec.split(",")) {
      const m = clause.match(/^([ugoa]*)([+\-=])([rwx]+)$/);
      if (!m) throw new SimFsError(`invalid mode: '${spec}'`);
      const who = m[1] === "" ? "a" : m[1];
      const op = m[2];
      const bits = m[3]
        .split("")
        .reduce((acc, c) => acc | ({ r: 4, w: 2, x: 1 } as Record<string, number>)[c], 0);
      const targets: ("owner" | "group" | "other")[] = [];
      if (who.includes("u") || who === "a") targets.push("owner");
      if (who.includes("g") || who === "a") targets.push("group");
      if (who.includes("o") || who === "a") targets.push("other");
      const shifts: Record<string, number> = { owner: 6, group: 3, other: 0 };
      for (const t of targets) {
        const shift = shifts[t];
        if (op === "+") mode |= bits << shift;
        else if (op === "-") mode &= ~(bits << shift);
        else mode = (mode & ~(0b111 << shift)) | (bits << shift);
      }
    }
    return mode;
  }

  chmod(absPath: string, spec: string): void {
    const node = this.get(absPath);
    if (!node) throw new SimFsError(`cannot access '${absPath}': No such file or directory`);
    if (!this.user.elevated && node.owner !== this.user.name) {
      throw new SimFsError(`changing permissions of '${absPath}': Operation not permitted (hint: sudo)`);
    }
    node.mode = SimFs.parseMode(spec, node.mode);
    node.modifiedAt = now();
  }

  chown(absPath: string, owner: string, group?: string): void {
    const node = this.get(absPath);
    if (!node) throw new SimFsError(`cannot access '${absPath}': No such file or directory`);
    if (!this.user.elevated) {
      throw new SimFsError(`changing ownership of '${absPath}': Operation not permitted (hint: sudo)`);
    }
    node.owner = owner;
    node.group = group ?? owner;
  }

  /** The current node's permission string for ls -l, e.g. "drwxr-xr-x". */
  static modeString(node: SimNode): string {
    const type = node.type === "dir" ? "d" : "-";
    const bit = (v: number, c: string) => (v ? c : "-");
    const triplet = (shift: number) =>
      bit((node.mode >> shift) & 4, "r") + bit((node.mode >> shift) & 2, "w") + bit((node.mode >> shift) & 1, "x");
    return type + triplet(6) + triplet(3) + triplet(0);
  }
}

export class SimFsError extends Error {}
