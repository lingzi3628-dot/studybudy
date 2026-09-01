import { describe, it, expect } from "vitest";
import { SimShell } from "./sim-shell";

function runAll(sh: SimShell, lines: string[]) {
  return lines.map((l) => sh.run(l));
}

describe("filesystem commands", () => {
  it("pwd/whoami/hostname/date basics", () => {
    const sh = new SimShell();
    expect(sh.run("pwd").output).toBe("/home/dev");
    expect(sh.run("whoami").output).toBe("dev");
    expect(sh.run("hostname").output).toBe("webdev");
    expect(sh.run("date").output.length).toBeGreaterThan(10);
  });

  it("ls lists names, ls -l renders permission strings", () => {
    const sh = new SimShell();
    expect(sh.run("ls ~").output).toContain("welcome.txt");
    expect(sh.run("ls ~").output).toContain("projects/");
    const long = sh.run("ls -l /etc").output;
    expect(long).toContain("drwxr-xr-x");
    expect(long).toContain("nginx");
    expect(long).toContain("root");
  });

  it("ls -a includes . and ..", () => {
    const sh = new SimShell();
    expect(sh.run("ls -a ~").output).toContain("..");
  });

  it("cd moves and rejects files/missing dirs", () => {
    const sh = new SimShell();
    sh.run("cd ~/projects/app");
    expect(sh.run("pwd").output).toBe("/home/dev/projects/app");
    expect(sh.run("cd nope").isError).toBe(true);
    expect(sh.run("cd index.js").isError).toBe(true);
    sh.run("cd"); // no arg → home
    expect(sh.run("pwd").output).toBe("/home/dev");
  });

  it("cat reads files; unknown file errors like real cat", () => {
    const sh = new SimShell();
    expect(sh.run("cat ~/welcome.txt").output).toContain("Welcome");
    expect(sh.run("cat /nope.txt").isError).toBe(true);
    expect(sh.run("cat /nope.txt").output).toContain("No such file");
  });

  it("echo with > and >> writes and appends", () => {
    const sh = new SimShell();
    sh.run("echo hello > /home/dev/greet.txt");
    expect(sh.run("cat /home/dev/greet.txt").output).toBe("hello");
    sh.run("echo world >> /home/dev/greet.txt");
    expect(sh.run("cat /home/dev/greet.txt").output).toBe("hello\nworld");
  });

  it("touch creates files, mkdir -p nests, rm cleans up", () => {
    const sh = new SimShell();
    sh.run("touch /home/dev/newfile.txt");
    expect(sh.run("cat /home/dev/newfile.txt").output).toBe("");
    sh.run("mkdir -p /home/dev/a/b/c");
    expect(sh.run("ls /home/dev/a/b").output).toContain("c");
    sh.run("rm /home/dev/newfile.txt");
    expect(sh.run("cat /home/dev/newfile.txt").isError).toBe(true);
    sh.run("rm -r /home/dev/a");
    expect(sh.run("ls /home/dev").output).not.toContain("a/");
  });

  it("grep finds matching lines with line numbers", () => {
    const sh = new SimShell();
    sh.run("echo fix it > /home/dev/todo.txt");
    const r = sh.run("grep fix /home/dev/todo.txt");
    expect(r.output).toContain("1:fix it");
    expect(sh.run("grep zzz /home/dev/todo.txt").output).toBe("");
  });

  it("chmod 755 works on own files; root-owned needs sudo", () => {
    const sh = new SimShell();
    sh.run("touch /home/dev/run.sh");
    const ok = sh.run("chmod 755 /home/dev/run.sh");
    expect(ok.isError).toBeUndefined();
    expect(sh.run("ls -l /home/dev/run.sh").output).toContain("-rwxr-xr-x");
    const denied = sh.run("chmod 600 /etc/hostname");
    expect(denied.isError).toBe(true);
    expect(denied.output).toContain("not permitted");
  });

  it("unknown commands and help", () => {
    const sh = new SimShell();
    expect(sh.run("frobnicate").output).toContain("command not found");
    expect(sh.run("help").output).toContain("simulated shell");
  });

  it("clear signals the UI to wipe the scrollback", () => {
    const sh = new SimShell();
    expect(sh.run("clear").clear).toBe(true);
  });
});

describe("services + journal", () => {
  it("ps aux shows running services", () => {
    const sh = new SimShell();
    const out = sh.run("ps aux").output;
    expect(out).toContain("nginx");
    expect(out).toContain("postgres");
    expect(out).not.toContain("/usr/sbin/app"); // app starts stopped
  });

  it("systemctl status shows active/inactive states", () => {
    const sh = new SimShell();
    expect(sh.run("systemctl status nginx").output).toContain("active (running)");
    expect(sh.run("systemctl status app").output).toContain("inactive");
    expect(sh.run("systemctl status bogus").isError).toBe(true);
  });

  it("systemctl start/stop flips service state", () => {
    const sh = new SimShell();
    sh.run("systemctl start app");
    expect(sh.run("systemctl status app").output).toContain("active (running)");
    sh.run("systemctl stop app");
    expect(sh.run("systemctl status app").output).toContain("inactive");
  });

  it("journalctl -u shows per-service logs", () => {
    const sh = new SimShell();
    const out = sh.run("journalctl -u nginx -n 5").output;
    expect(out).toContain("nginx[");
    expect(out).toContain("listen 80 ready");
    expect(sh.run("journalctl -u bogus").isError).toBe(true);
  });

  it("a broken nginx config FAILS restart and journals the error — the teaching moment", () => {
    const sh = new SimShell();
    // nginx.conf is root-owned: need sudo to make it writable (teaching!)
    const ch = sh.run("sudo chmod 666 /etc/nginx/nginx.conf");
    expect(ch.isError).toBeUndefined();
    sh.run("echo not-a-config > /etc/nginx/nginx.conf");
    const r = sh.run("systemctl restart nginx");
    expect(r.isError).toBe(true);
    expect(r.output).toContain("Job for nginx.service failed");
    expect(r.output).toContain("nginx -t");
    const j = sh.run("journalctl -u nginx -n 2").output;
    expect(j).toContain("[emerg]");
  });
});

describe("nginx -t and curl", () => {
  it("nginx -t validates the seeded config", () => {
    const sh = new SimShell();
    const r = sh.run("nginx -t");
    expect(r.isError).toBeUndefined();
    expect(r.output).toContain("test is successful");
  });

  it("curl localhost:80 serves the nginx index", () => {
    const sh = new SimShell();
    const r = sh.run("curl http://localhost/");
    expect(r.output).toContain("HTTP/1.1 200 OK");
    expect(r.output).toContain("It works!");
  });

  it("curl 404s unknown paths and refuses unknown hosts", () => {
    const sh = new SimShell();
    expect(sh.run("curl http://localhost/missing.html").output).toContain("404");
    const r = sh.run("curl http://example.com/");
    expect(r.isError).toBe(true);
    expect(r.output).toContain("Could not resolve host");
  });

  it("curl refuses connection to a stopped port", () => {
    const sh = new SimShell();
    const r = sh.run("curl http://localhost:3000/");
    expect(r.isError).toBe(true);
    expect(r.output).toContain("Connection refused");
  });

  it("curl reaches a running container's mapped port", () => {
    const sh = new SimShell();
    sh.run("cd ~/projects/app");
    sh.run("docker build -t myapp .");
    sh.run("docker run -d -p 8080:3000 myapp");
    const r = sh.run("curl http://localhost:8080/");
    expect(r.output).toContain("200 OK");
    expect(r.output).toContain("Hello from the demo app!");
  });
});

describe("docker simulation", () => {
  it("builds the seeded Dockerfile step by step", () => {
    const sh = new SimShell();
    sh.run("cd ~/projects/app");
    const r = sh.run("docker build -t myapp .");
    expect(r.isError).toBeUndefined();
    expect(r.output).toContain("Step 1/5 : FROM node:20-alpine");
    expect(r.output).toContain("Step 5/5 : CMD");
    expect(r.output).toContain("Successfully tagged myapp");
    expect(sh.run("docker images").output).toContain("myapp");
  });

  it("fails without -t, without Dockerfile, and on COPY of missing files", () => {
    const sh = new SimShell();
    expect(sh.run("docker build .").isError).toBe(true);
    const noFile = sh.run("docker build -t x /tmp");
    expect(noFile.isError).toBe(true);
    expect(noFile.output).toContain("no such file");
    // build from a dir with a Dockerfile that copies a missing file
    sh.run("mkdir -p /home/dev/badapp");
    sh.run("echo 'FROM node:20-alpine' > /home/dev/badapp/Dockerfile");
    sh.run("echo 'COPY ghost.js .' >> /home/dev/badapp/Dockerfile");
    const r = sh.run("docker build -t bad /home/dev/badapp");
    expect(r.isError).toBe(true);
    expect(r.output).toContain("COPY failed");
  });

  it("run without a built image suggests building", () => {
    const sh = new SimShell();
    const r = sh.run("docker run nope");
    expect(r.isError).toBe(true);
    expect(r.output).toContain("docker build");
  });

  it("run starts a container, ps lists it, stop+rm retire it", () => {
    const sh = new SimShell();
    sh.run("cd ~/projects/app");
    sh.run("docker build -t myapp .");
    sh.run("docker run -d -p 8080:3000 myapp");
    const ps = sh.run("docker ps").output;
    expect(ps).toContain("myapp");
    expect(ps).toContain("8080->3000");
    const id = sh.run("docker ps").output.split("\n")[1].trim().split(/\s+/)[0];
    const stopped = sh.run(`docker stop ${id}`);
    expect(stopped.isError).toBeUndefined();
    expect(sh.run("docker ps").output.split("\n")).toHaveLength(1);
    sh.run(`docker rm ${id}`);
    expect(sh.run("docker ps").output).not.toContain("myapp");
  });

  it("refuses duplicate host ports with the real daemon error", () => {
    const sh = new SimShell();
    sh.run("cd ~/projects/app");
    sh.run("docker build -t myapp .");
    sh.run("docker run -d -p 8080:3000 myapp");
    const r = sh.run("docker run -d -p 8080:4000 myapp");
    expect(r.isError).toBe(true);
    expect(r.output).toContain("port is already allocated");
  });

  it("rm of a running container is refused", () => {
    const sh = new SimShell();
    sh.run("cd ~/projects/app");
    sh.run("docker build -t myapp .");
    sh.run("docker run -d myapp");
    const id = sh.run("docker ps").output.split("\n")[1].trim().split(/\s+/)[0];
    const r = sh.run(`docker rm ${id}`);
    expect(r.isError).toBe(true);
    expect(r.output).toContain("running container");
  });

  it("docker logs shows container output", () => {
    const sh = new SimShell();
    sh.run("cd ~/projects/app");
    sh.run("docker build -t myapp .");
    sh.run("docker run -d myapp");
    const id = sh.run("docker ps").output.split("\n")[1].trim().split(/\s+/)[0];
    const logs = sh.run(`docker logs ${id}`).output;
    expect(logs).toContain("Server listening");
  });

  it("docker pull registers a base image", () => {
    const sh = new SimShell();
    const r = sh.run("docker pull nginx:alpine");
    expect(r.output).toContain("Downloaded newer image");
    expect(sh.run("docker images").output).toContain("nginx:alpine");
  });
});

describe("docker-compose simulation", () => {
  it("parses a compose subset", () => {
    const text = `version: "3"
services:
  web:
    build: .
    ports:
      - "8080:3000"
  cache:
    image: nginx:alpine
`;
    const services = SimShell.parseCompose(text);
    expect(services).toHaveLength(2);
    expect(services[0].name).toBe("web");
    expect(services[0].build).toBe(true);
    expect(services[0].ports).toEqual([{ host: 8080, container: 3000 }]);
    expect(services[1].image).toBe("nginx:alpine");
  });

  it("up -d starts services; down removes them", () => {
    const sh = new SimShell();
    sh.run("cd ~/projects/app");
    const up = sh.run("docker-compose up -d");
    expect(up.isError).toBeUndefined();
    expect(up.output).toContain("web started");
    const ps = sh.run("docker-compose ps").output;
    expect(ps).toContain("8080->3000");
    const down = sh.run("docker-compose down");
    expect(down.output).toContain("removed");
    expect(sh.run("docker-compose ps").output.split("\n")).toHaveLength(1);
  });

  it("complains when no compose file exists", () => {
    const sh = new SimShell();
    const r = sh.run("docker-compose up");
    expect(r.isError).toBe(true);
    expect(r.output).toContain("docker-compose.yml");
  });
});

describe("sudo + history", () => {
  it("sudo elevates chown and drops back after", () => {
    const sh = new SimShell();
    const r = sh.run("sudo chown root /home/dev/welcome.txt");
    expect(r.isError).toBeUndefined();
    expect(sh.run("ls -l /home/dev/welcome.txt").output).toContain("root");
  });

  it("history records commands", () => {
    const sh = new SimShell();
    sh.run("pwd");
    sh.run("whoami");
    const h = sh.run("history").output;
    expect(h).toContain("pwd");
    expect(h).toContain("whoami");
  });
});
