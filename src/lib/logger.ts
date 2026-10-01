/**
 * Structured logging — Phase 90.5
 *
 * Provides a simple structured logger that outputs JSON in production
 * and pretty-printed text in development. Uses console.* under the hood
 * (no external dependency needed — works in serverless environments).
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.info("user logged in", { userId: "123", email: "a@b.com" });
 *   logger.error("AI call failed", { provider: "glm", error: "timeout" });
 *   logger.warn("rate limit hit", { ip: "1.2.3.4", route: "/api/tutor/chat" });
 */

type LogLevel = "debug" | "info" | "warn" | "error";

type LogEntry = {
  level: LogLevel;
  message: string;
  timestamp: string;
  [key: string]: any;
};

const isDev = process.env.NODE_ENV === "development";
const isProd = process.env.NODE_ENV === "production";

function formatLog(level: LogLevel, message: string, meta?: Record<string, any>): string {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };

  if (isProd) {
    // Production: JSON (for log aggregation services)
    return JSON.stringify(entry);
  } else {
    // Development: pretty-printed
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
    const color = {
      debug: "\x1b[90m",
      info: "\x1b[36m",
      warn: "\x1b[33m",
      error: "\x1b[31m",
    }[level];
    const reset = "\x1b[0m";
    return `${color}[${level.toUpperCase()}]${reset} ${message}${metaStr}`;
  }
}

export const logger = {
  debug(message: string, meta?: Record<string, any>) {
    if (!isProd) console.debug(formatLog("debug", message, meta));
  },

  info(message: string, meta?: Record<string, any>) {
    console.info(formatLog("info", message, meta));
  },

  warn(message: string, meta?: Record<string, any>) {
    console.warn(formatLog("warn", message, meta));
  },

  error(message: string, meta?: Record<string, any>) {
    console.error(formatLog("error", message, meta));
  },

  // Create a child logger with persistent context
  child(context: Record<string, any>) {
    return {
      debug: (msg: string, meta?: Record<string, any>) => this.debug(msg, { ...context, ...meta }),
      info: (msg: string, meta?: Record<string, any>) => this.info(msg, { ...context, ...meta }),
      warn: (msg: string, meta?: Record<string, any>) => this.warn(msg, { ...context, ...meta }),
      error: (msg: string, meta?: Record<string, any>) => this.error(msg, { ...context, ...meta }),
    };
  },
};
