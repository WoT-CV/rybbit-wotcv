import Fastify from "fastify";
import cors from "@fastify/cors";
import { gzipSync } from "node:zlib";
import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { decodeReplayUpload } from "./replayUploadEncoding.js";
import { createCorsOptionsDelegate } from "../../lib/cors.js";

const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map(app => app.close()));
});
async function app(limit = 1024) {
  const instance = Fastify({ bodyLimit: limit });
  apps.push(instance);
  await instance.register(cors, { delegator: createCorsOptionsDelegate({ NODE_ENV: "production" }) });
  instance.post(
    "/api/session-replay/record/:siteId",
    { preParsing: decodeReplayUpload },
    async request => request.body
  );
  instance.post("/api/track", async request => request.body);
  return instance;
}
const headers = { "content-type": "application/json", "content-encoding": "gzip" };
const url = "/api/session-replay/record/test";

describe("bounded route-local replay gzip", () => {
  it("bounds chunked input without relying on Content-Length", async () => {
    const payload = gzipSync(randomBytes(2048));
    const response = await (
      await app()
    ).inject({
      method: "POST",
      url,
      headers,
      payload: Readable.from([payload.subarray(0, 900), payload.subarray(900)]),
    });
    expect(response.statusCode).toBe(413);
  });
  it("validates gzip checksum before ingest", async () => {
    const payload = gzipSync("{}");
    payload[payload.length - 5] ^= 1;
    const response = await (await app()).inject({ method: "POST", url, headers, payload });
    expect(response.statusCode).toBe(400);
  });
  it("round trips Unicode, old body, unknown plugin, IDs and event order unchanged", async () => {
    const server = await app();
    const value = {
      userId: "snapshot",
      events: [
        { type: 6, timestamp: 123, sequenceNumber: 0, data: { plugin: "unknown", value: "Zażółć 🐸", n: null } },
        { type: 6, timestamp: 123, sequenceNumber: 1, data: { responseBody: { value: "unchanged" } } },
      ],
    };
    for (const encoding of ["gzip", "identity", undefined]) {
      const response = await server.inject({
        method: "POST",
        url,
        headers: { "content-type": "application/json", ...(encoding ? { "content-encoding": encoding } : {}) },
        payload: encoding === "gzip" ? gzipSync(JSON.stringify(value)) : JSON.stringify(value),
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(value);
    }
  });
  it.each(["br", "gzip, gzip", "deflate", ""])("rejects unsupported encoding %s", async encoding => {
    const response = await (
      await app()
    ).inject({ method: "POST", url, headers: { ...headers, "content-encoding": encoding }, payload: "{}" });
    expect(response.statusCode).toBe(415);
  });
  it.each([Buffer.from("secret-invalid-gzip"), gzipSync("{}").subarray(0, 10), gzipSync("not-json")])(
    "rejects malformed/truncated gzip or JSON",
    async payload => {
      const response = await (await app()).inject({ method: "POST", url, headers, payload });
      expect(response.statusCode).toBe(400);
      expect(response.body).not.toContain("secret-invalid-gzip");
    }
  );
  it("rejects compressed input above the SAME body limit", async () => {
    const response = await (await app()).inject({ method: "POST", url, headers, payload: gzipSync(randomBytes(2048)) });
    expect(response.statusCode).toBe(413);
  });
  it.each([false, true])("rejects decoded bomb (concatenated=%s)", async concatenated => {
    const payload = concatenated
      ? Buffer.concat([gzipSync(" ".repeat(600)), gzipSync(" ".repeat(600))])
      : gzipSync(" ".repeat(1025));
    const response = await (await app()).inject({ method: "POST", url, headers, payload });
    expect(response.statusCode).toBe(413);
  });
  it("accepts exactly the decoded boundary and rejects one byte over", async () => {
    const server = await app();
    for (const size of [1024, 1025]) {
      const response = await server.inject({
        method: "POST",
        url,
        headers,
        payload: gzipSync(JSON.stringify("x".repeat(size - 2))),
      });
      expect(response.statusCode).toBe(size === 1024 ? 200 : 413);
    }
  });
  it("rejects non-JSON compressed media and does not decode unrelated endpoints", async () => {
    const server = await app();
    expect(
      (
        await server.inject({
          method: "POST",
          url,
          headers: { ...headers, "content-type": "text/plain" },
          payload: gzipSync("{}"),
        })
      ).statusCode
    ).toBe(415);
    expect(
      (await server.inject({ method: "POST", url: "/api/track", headers, payload: gzipSync("{}") })).statusCode
    ).toBe(400);
  });
  it("allows the encoding CORS header only for record, without cross-origin credentials", async () => {
    const server = await app();
    for (const path of [url, "/api/track"]) {
      const response = await server.inject({
        method: "OPTIONS",
        url: path,
        headers: {
          origin: "https://example.test",
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type,content-encoding",
        },
      });
      expect(response.statusCode).toBe(204);
      expect(String(response.headers["access-control-allow-headers"]).toLowerCase().includes("content-encoding")).toBe(
        path === url
      );
      expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
    }
  });
});
