import "dotenv/config";

import type { FastifyBaseLogger } from "fastify";
import { pino, type LoggerOptions } from "pino";

const REDACTED_LOG_PATHS = [
  "authorization",
  "cookie",
  "password",
  "token",
  "accessToken",
  "refreshToken",
  "apiKey",
  "secret",
  "headers.authorization",
  "headers.cookie",
  "req.headers.authorization",
  "req.headers.cookie",
  "request.headers.authorization",
  "request.headers.cookie",
  "*.password",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
  "*.apiKey",
  "*.secret",
  "payload.license_key",
  "payload.prev_license_key",
  "payload.parent_license_key",
] as const;

function defaultLogLevel(): string {
  if (process.env.NODE_ENV === "production") return "info";
  if (process.env.NODE_ENV === "test") return "silent";
  return "debug";
}

function createLogger(name: string): FastifyBaseLogger {
  const options: LoggerOptions = {
    name,
    level: process.env.LOG_LEVEL || defaultLogLevel(),
    redact: {
      paths: [...REDACTED_LOG_PATHS],
      censor: "[REDACTED]",
    },
    serializers: {
      req(request) {
        return {
          method: request.method,
          url: request.url,
          path: request.url,
          parameters: request.params,
        };
      },
      res(reply) {
        return {
          statusCode: reply.statusCode,
        };
      },
    },
  };

  if (process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test") {
    options.transport = {
      target: "pino-pretty",
      options: {
        colorize: true,
        singleLine: true,
        translateTime: "HH:MM:ss",
        ignore: "pid,hostname,name",
        destination: 1,
      },
    };
  }

  return pino(options) as FastifyBaseLogger;
}

export const logger = createLogger("rybbit");

export const createServiceLogger = (service: string) => {
  return logger.child({ service });
};
