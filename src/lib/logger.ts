/**
 * Structured logging — Phase 90.5 / Phase 1
 *
 * Provides a simple structured logger that outputs JSON in production
 * and pretty-printed text in development. Uses console.* under the hood
 * (no external dependency needed — works in serverless environments).
 *
 * Phase 1 — Added request/turn ID context support:
 *   - logger.withTurn({ turnId, requestId, userId }) returns a child logger
 *     that automatically includes turn/request/user IDs in every log entry.
 *   - This enables tracing a single user action across multiple log lines
 *     (auth → token deduction → AI call → post-process → DB write).
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.info("user logged in", { userId: "123", email: "a@b.com" });
 *   logger.error("AI call failed", { provider: "glm", error: "timeout" });
 *
 *   const turnLogger = logger.withTurn({ turnId: "turn_abc", requestId: "req_xyz", userId: "u123" });
 *   turnLogger.info("token deducted", { cost: 15, balance: 485 });
 *   // → { level: "info", message: "token deducted", turnId: "turn_abc", requestId: "req_xyz", userId: "u123", cost: 15, balance: 485 }
 */

type LogLevel = "debug" | "info" | "warn" | "error";

type LogEntry = {
  level: LogLevel;
  message: string;
  timestamp: string;
  turnId?: string;
  requestId?: string;
  userId?: string;
  [key: string]: any;
};

type TurnContext = {
  turnId?: string;
  requestId?: string;
  userId?: string;
};

const isDev = process.env.NODE_ENV === "development";
const isProd = process.env.NODE_ENV === "production";

function formatLog(level: LogLevel, message: string, meta?: Record<string, any>, turnContext?: TurnContext): string {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...turnContext,
    ...meta,
  };

  if (isProd) {
    // Production: JSON (for log aggregation services)
    return JSON.stringify(entry);
  } else {
    // Development: pretty-printed
    const turnStr = turnContext?.turnId ? ` [${turnContext.turnId}]` : "";
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
    const color = {
      debug: "\x1b[90m",
      info: "\x1b[36m",
      warn: "\x1b[33m",
      error: "\x1b[31m",
    }[level];
    const reset = "\x1b[0m";
    return `${color}[${level.toUpperCase()}]${reset}${turnStr} ${message}${metaStr}`;
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

  /**
   * Phase 1 — Create a turn-scoped logger that automatically includes
   * turnId, requestId, and userId in every log entry.
   *
   * Usage:
   *   const turnLogger = logger.withTurn({ turnId, requestId, userId });
   *   turnLogger.info("token deducted", { cost: 15 });
   *   // → includes turnId, requestId, userId automatically
   */
  withTurn(turnContext: TurnContext) {
    return {
      debug: (msg: string, meta?: Record<string, any>) => {
        if (!isProd) console.debug(formatLog("debug", msg, meta, turnContext));
      },
      info: (msg: string, meta?: Record<string, any>) => {
        console.info(formatLog("info", msg, meta, turnContext));
      },
      warn: (msg: string, meta?: Record<string, any>) => {
        console.warn(formatLog("warn", msg, meta, turnContext));
      },
      error: (msg: string, meta?: Record<string, any>) => {
        console.error(formatLog("error", msg, meta, turnContext));
      },
      child: (extraContext: Record<string, any>) => {
        const merged = { ...turnContext, ...extraContext };
        return logger.withTurn(merged);
      },
    };
  },
};
