import type { LoggerOptions } from "pino";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { childLogger, childMock, pinoMock, rootLogger } = vi.hoisted(() => {
  const childLogger = { kind: "child" };
  const childMock = vi.fn(() => childLogger);
  const rootLogger = { child: childMock };
  const pinoMock = vi.fn((_options: LoggerOptions) => rootLogger);

  return { childLogger, childMock, pinoMock, rootLogger };
});

vi.mock("pino", () => ({ pino: pinoMock }));

const originalNodeEnv = process.env.NODE_ENV;
const originalLogLevel = process.env.LOG_LEVEL;

async function importLogger(nodeEnv: string, logLevel = "") {
  process.env.NODE_ENV = nodeEnv;
  process.env.LOG_LEVEL = logLevel;
  vi.resetModules();
  pinoMock.mockClear();
  childMock.mockClear();

  const loggerModule = await import("./logger.js");
  const options = pinoMock.mock.calls[0]?.[0];
  if (!options) throw new Error("Logging runtime did not create the root logger");

  return { loggerModule, options };
}

beforeEach(() => {
  process.env.LOG_LEVEL = "";
});

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;

  if (originalLogLevel === undefined) delete process.env.LOG_LEVEL;
  else process.env.LOG_LEVEL = originalLogLevel;
});

describe("logging runtime", () => {
  it("uses structured info logging in production", async () => {
    const { options } = await importLogger("production");

    expect(options).toMatchObject({
      name: "rybbit",
      level: "info",
      redact: { censor: "[REDACTED]" },
    });
    expect(options).not.toHaveProperty("transport");
  });

  it("uses readable debug logging in development", async () => {
    const { options } = await importLogger("development");

    expect(options).toMatchObject({
      level: "debug",
      transport: {
        target: "pino-pretty",
        options: { colorize: true, singleLine: true, destination: 1 },
      },
    });
  });

  it("is silent by default in tests", async () => {
    const { options } = await importLogger("test");

    expect(options).toMatchObject({ level: "silent" });
    expect(options).not.toHaveProperty("transport");
  });

  it("lets LOG_LEVEL override the environment default", async () => {
    const { options } = await importLogger("production", "warn");

    expect(options).toMatchObject({ level: "warn" });
  });

  it("creates background children from the shared root", async () => {
    const { loggerModule } = await importLogger("test");

    expect(loggerModule.createServiceLogger("uptime")).toBe(childLogger);
    expect(childMock).toHaveBeenCalledWith({ service: "uptime" });
  });

  it("keeps request and response serialization in the shared runtime", async () => {
    const { options } = await importLogger("production");

    expect(
      options.serializers?.req({
        method: "GET",
        url: "/api/sites/1",
        params: { siteId: 1 },
        headers: { authorization: "secret" },
      })
    ).toEqual({
      method: "GET",
      url: "/api/sites/1",
      path: "/api/sites/1",
      parameters: { siteId: 1 },
    });
    expect(options.serializers?.res({ statusCode: 204 })).toEqual({ statusCode: 204 });
  });
});
