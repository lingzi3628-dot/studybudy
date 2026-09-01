import { describe, it, expect } from "vitest";
import { SimFs, SimFsError } from "./sim-fs";

describe("path resolution", () => {
  const fs = new SimFs();
  it("resolves absolute, relative, . and .. paths", () => {
    expect(fs.resolvePath("/etc/nginx/nginx.conf", "/")).toBe("/etc/nginx/nginx.conf");
    expect(fs.resolvePath("nginx/nginx.conf", "/etc")).toBe("/etc/nginx/nginx.conf");
    expect(fs.resolvePath("./nginx/../systemd", "/etc")).toBe("/etc/systemd");
    expect(fs.resolvePath("../dev", "/home/dev")).toBe("/home/dev");
  });

  it("handles ~ and ~/ paths", () => {
    expect(fs.resolvePath("~", "/etc")).toBe("/home/dev");
    expect(fs.resolvePath("~/projects/app", "/")).toBe("/home/dev/projects/app");
  });

  it("collapses duplicate slashes and trailing slash", () => {
    expect(fs.resolvePath("/etc//nginx/", "/")).toBe("/etc/nginx");
  });

  it("returns / for the root", () => {
    expect(fs.resolvePath("/", "/")).toBe("/");
    expect(fs.resolvePath("../../..", "/etc")).toBe("/");
  });
});

describe("read/write/list", () => {
  it("seeds the default tree", () => {
    const fs = new SimFs();
    expect(fs.readFile("/etc/hostname")).toBe("webdev\n");
    expect(fs.exists("/home/dev/projects/app/Dockerfile")).toBe(true);
    expect(fs.readFile("/var/www/html/index.html")).toContain("It works");
  });

  it("lists directories sorted and throws on missing paths", () => {
    const fs = new SimFs();
    const names = fs.list("/etc").map((n) => n.name);
    expect(names).toEqual(["hostname", "nginx", "systemd"]);
    expect(() => fs.list("/nope")).toThrow(SimFsError);
  });

  it("writes new files and updates existing ones", () => {
    const fs = new SimFs();
    fs.writeFile("/home/dev/notes.txt", "hello");
    expect(fs.readFile("/home/dev/notes.txt")).toBe("hello");
    fs.writeFile("/home/dev/notes.txt", "updated");
    expect(fs.readFile("/home/dev/notes.txt")).toBe("updated");
  });

  it("refuses to write into a missing directory without createMissing", () => {
    const fs = new SimFs();
    expect(() => fs.writeFile("/no/such/file.txt", "x", false)).toThrow(SimFsError);
  });

  it("throws Is a directory for cat on dirs", () => {
    const fs = new SimFs();
    expect(() => fs.readFile("/etc")).toThrow(/Is a directory/);
  });
});

describe("mkdir / remove", () => {
  it("mkdir creates single directories, throws on existing without -p", () => {
    const fs = new SimFs();
    fs.mkdir("/home/dev/test");
    expect(fs.exists("/home/dev/test")).toBe(true);
    expect(() => fs.mkdir("/home/dev/test")).toThrow(/File exists/);
  });

  it("mkdir -p creates nested paths and tolerates existing", () => {
    const fs = new SimFs();
    fs.mkdir("/home/dev/a/b/c", true);
    expect(fs.exists("/home/dev/a/b/c")).toBe(true);
    expect(() => fs.mkdir("/home/dev/a/b/c", true)).not.toThrow();
    expect(() => fs.mkdir("/home/dev/x/y", false)).toThrow(/No such file or directory/);
  });

  it("rm deletes files, requires -r for non-empty dirs, protects /", () => {
    const fs = new SimFs();
    fs.writeFile("/home/dev/tmp.txt", "x");
    fs.remove("/home/dev/tmp.txt");
    expect(fs.exists("/home/dev/tmp.txt")).toBe(false);
    expect(() => fs.remove("/home/dev/projects")).toThrow(/Directory not empty/);
    fs.remove("/home/dev/projects", true);
    expect(fs.exists("/home/dev/projects")).toBe(false);
    expect(() => fs.remove("/")).toThrow(/refusing/);
  });
});

describe("permissions", () => {
  it("modeString renders rwx triplets", () => {
    const fs = new SimFs();
    expect(SimFs.modeString(fs.get("/etc/nginx/nginx.conf")!)).toBe("-rw-r--r--");
    expect(SimFs.modeString(fs.get("/etc")!)).toBe("drwxr-xr-x");
  });

  it("chmod octal + symbolic both work on own files", () => {
    const fs = new SimFs();
    fs.writeFile("/home/dev/script.sh", "#!/bin/sh\n");
    fs.chmod("/home/dev/script.sh", "755");
    expect(SimFs.modeString(fs.get("/home/dev/script.sh")!)).toBe("-rwxr-xr-x");
    fs.chmod("/home/dev/script.sh", "u+x,g-w");
    expect(SimFs.modeString(fs.get("/home/dev/script.sh")!)).toBe("-rwxr-xr-x");
    fs.chmod("/home/dev/script.sh", "o-r");
    expect(SimFs.modeString(fs.get("/home/dev/script.sh")!)).toBe("-rwxr-x--x");
  });

  it("denies chmod on root-owned files without sudo, allows elevated", () => {
    const fs = new SimFs();
    expect(() => fs.chmod("/etc/hostname", "600")).toThrow(/Operation not permitted/);
    fs.user.elevated = true;
    expect(() => fs.chmod("/etc/hostname", "600")).not.toThrow();
    fs.user.elevated = false;
  });

  it("denies read of root-owned 0600 files until elevated", () => {
    const fs = new SimFs();
    fs.user.elevated = true;
    fs.writeFile("/etc/secret.key", "abc");
    fs.chown("/etc/secret.key", "root");
    fs.chmod("/etc/secret.key", "600");
    fs.user.elevated = false;
    // dev cannot read root's 600 file
    expect(() => fs.readFile("/etc/secret.key")).toThrow(/Permission denied/);
    fs.user.elevated = true;
    expect(fs.readFile("/etc/secret.key")).toBe("abc");
  });

  it("chown requires elevation", () => {
    const fs = new SimFs();
    expect(() => fs.chown("/home/dev/welcome.txt", "root")).toThrow(/Operation not permitted/);
    fs.user.elevated = true;
    fs.chown("/home/dev/welcome.txt", "root");
    expect(fs.get("/home/dev/welcome.txt")!.owner).toBe("root");
  });
});

describe("parseMode", () => {
  it("parses octal strings", () => {
    expect(SimFs.parseMode("644", 0o600)).toBe(0o644);
    expect(SimFs.parseMode("755", 0o600)).toBe(0o755);
  });

  it("parses symbolic clauses", () => {
    expect(SimFs.parseMode("+x", 0o644)).toBe(0o755);
    expect(SimFs.parseMode("u+rwx,go=rx", 0)).toBe(0o755);
    expect(SimFs.parseMode("a-r", 0o644)).toBe(0o200);
  });

  it("throws on garbage", () => {
    expect(() => SimFs.parseMode("zzz", 0o644)).toThrow(/invalid mode/);
  });
});
