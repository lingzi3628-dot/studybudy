import { describe, it, expect } from "vitest";
import { validateNginxConfig } from "./nginx-validator";

const VALID = `user www-data;
events { worker_connections 1024; }

http {
    include /etc/nginx/mime.types;

    server {
        listen 80;
        server_name app.example.com;

        location / {
            proxy_pass http://localhost:3000;
            proxy_set_header Host $host;
        }
    }
}
`;

describe("validateNginxConfig", () => {
  it("accepts the seeded valid config and extracts the proxy route", () => {
    const v = validateNginxConfig(VALID);
    expect(v.ok).toBe(true);
    expect(v.errors).toEqual([]);
    expect(v.routes).toHaveLength(1);
    expect(v.routes[0].proxyPass).toBe("http://localhost:3000");
    expect(v.routes[0].serverName).toBe("app.example.com");
    expect(v.routes[0].listenPort).toBe(80);
  });

  it("catches a missing semicolon with the line number", () => {
    const v = validateNginxConfig(`http {
    server {
        listen 80
        server_name example.com;
    }
}
`);
    expect(v.ok).toBe(false);
    expect(v.errors[0]).toContain("line 3");
    expect(v.errors[0]).toContain('not terminated by ";"');
  });

  it("catches unbalanced open braces", () => {
    const v = validateNginxConfig("http {\n  server {\n    listen 80;\n}\n");
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.includes("block(s) left open"))).toBe(true);
  });

  it("catches an unexpected closing brace", () => {
    const v = validateNginxConfig("}\n");
    expect(v.ok).toBe(false);
    expect(v.errors[0]).toContain('unexpected "}"');
  });

  it("rejects proxy_pass outside a location block", () => {
    const v = validateNginxConfig(`http {
    server {
        listen 80;
        server_name x.com;
        proxy_pass http://localhost:3000;
    }
}
`);
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.includes("proxy_pass") && e.includes("location"))).toBe(true);
  });

  it("warns on duplicate server_name+listen conflicts", () => {
    const v = validateNginxConfig(`http {
    server {
        listen 80;
        server_name app.com;
        location / { return 200 "a"; }
    }
    server {
        listen 80;
        server_name app.com;
        location / { return 200 "b"; }
    }
}
`);
    expect(v.ok).toBe(true); // warning, not an error
    expect(v.warnings.some((w) => w.includes("duplicate listen"))).toBe(true);
  });

  it("warns on unknown directives", () => {
    const v = validateNginxConfig(`http {
    frobnicate on;
    server { listen 80; }
}
`);
    expect(v.warnings.some((w) => w.includes("frobnicate"))).toBe(true);
  });

  it("warns when a server block lives outside http{}", () => {
    const v = validateNginxConfig(`server {
    listen 80;
}
`);
    expect(v.warnings.some((w) => w.includes("outside http"))).toBe(true);
  });

  it("warns on listen without a port", () => {
    const v = validateNginxConfig(`http {
    server {
        listen localhost;
    }
}
`);
    expect(v.warnings.some((w) => w.includes("no port"))).toBe(true);
  });

  it("supports static serving with root and try_files", () => {
    const v = validateNginxConfig(`http {
    server {
        listen 80;
        server_name static.com;
        location / {
            root /var/www/html;
            try_files $uri $uri/ =404;
        }
    }
}
`);
    expect(v.ok).toBe(true);
    expect(v.routes[0].root).toBe("/var/www/html");
    expect(v.routes[0].proxyPass).toBeNull();
  });

  it("handles multiple server blocks with distinct ports", () => {
    const v = validateNginxConfig(`http {
    server {
        listen 80;
        server_name a.com;
        location / { return 301 https://a.com; }
    }
    server {
        listen 443 ssl;
        server_name a.com;
        location / { proxy_pass http://127.0.0.1:3000; }
    }
}
`);
    expect(v.ok).toBe(true);
    expect(v.routes).toHaveLength(2);
    expect(v.routes[1].listenPort).toBe(443);
    expect(v.warnings.some((w) => w.includes("duplicate"))).toBe(false);
  });

  it("ignores comments and blank lines", () => {
    const v = validateNginxConfig(`# top comment
http {
    # inner comment

    server { listen 80; }
}
`);
    expect(v.ok).toBe(true);
    expect(v.warnings).toEqual([]);
  });
});
