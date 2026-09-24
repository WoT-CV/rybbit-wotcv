// Offline aggregates only. Never upload, print or rewrite the supplied recording.
// Run after "pnpm --filter rybbit-backend build".
import { readFile, stat } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { gzipSync } from "node:zlib";
import { toMetadataRequest } from "../dist/analytics-script/networkReplay/metadataCapture.js";
import { readResponseCorrelation } from "@rybbit/shared";

const bytes = value => Buffer.byteLength(JSON.stringify(value));
const isNetwork = event =>
  event?.type === 6 && event.data?.plugin === "rrweb/network@1" && Array.isArray(event.data.payload?.requests);
const project = events =>
  events.map(event => {
    if (!isNetwork(event)) return event;
    const requests = event.data.payload.requests.map(request => {
      const headers = Object.entries(request.responseHeaders ?? {});
      const ids = readResponseCorrelation(name => headers.find(([key]) => key.toLowerCase() === name)?.[1] ?? null);
      return toMetadataRequest({
        ...request,
        correlationId: request.correlationId ?? ids.correlationId,
        traceId: request.traceId ?? ids.traceId,
      });
    });
    return { ...event, data: { ...event.data, payload: { ...event.data.payload, requests } } };
  });
const measure = callback => {
  callback(); // warmup
  const timings = [];
  for (let iteration = 0; iteration < 7; iteration++) {
    const start = performance.now();
    callback();
    timings.push(performance.now() - start);
  }
  return Number(timings.sort((a, b) => a - b)[3].toFixed(3));
};
const synthetic = () =>
  Array.from({ length: 500 }, (_, index) => ({
    type: 6,
    timestamp: 1700000000000 + index,
    data: {
      plugin: "rrweb/network@1",
      payload: {
        version: 1,
        requests: [
          {
            schemaVersion: 1,
            requestId: String(index),
            method: "GET",
            initiatorType: "fetch",
            url: "https://api.example.com/players?private=synthetic",
            currentUrl: "https://app.example.com/players",
            startedAt: 1700000000000 + index,
            completedAt: 1700000000100 + index,
            outcome: "success",
            status: 200,
            requestHeaders: { authorization: "synthetic-only" },
            responseHeaders: { "x-correlation-id": "synthetic-" + index, "x-trace-id": "a".repeat(32) },
            responseBody: {
              kind: "json",
              value: JSON.stringify({
                players: Array.from({ length: 100 }, (_, player) => ({
                  id: player,
                  label: "Synthetic player " + player,
                })),
              }),
            },
            performanceEntryFound: false,
          },
        ],
      },
    },
  }));

try {
  const path = process.argv[2];
  if (process.argv.length > 3) throw new Error("Expected at most one local fixture argument");
  if (path && (await stat(path)).size > 256 * 1024 * 1024) throw new Error("Fixture exceeds 256 MiB safety limit");
  const events = path ? JSON.parse(await readFile(path, "utf8")) : synthetic();
  if (!Array.isArray(events)) throw new Error("Fixture must be an rrweb event array");
  const metadata = project(events);
  const network = events.filter(isNetwork);
  const networkMetadata = metadata.filter(isNetwork);
  const before = bytes(events);
  const after = bytes(metadata);
  console.log(
    JSON.stringify(
      {
        input: path ? "local-fixture" : "synthetic",
        events: events.length,
        networkEvents: network.length,
        networkRequests: network.reduce((count, event) => count + event.data.payload.requests.length, 0),
        serializedBytes: {
          full: before,
          metadata: after,
          reductionPercent: Number((100 * (1 - after / before)).toFixed(2)),
        },
        networkBytes: { full: bytes(network), metadata: bytes(networkMetadata) },
        gzipBytes: {
          full: gzipSync(JSON.stringify(events)).length,
          metadata: gzipSync(JSON.stringify(metadata)).length,
        },
        medianCpuMs: {
          metadataProjection: measure(() => project(events)),
          fullSerialization: measure(() => JSON.stringify(events)),
          metadataSerialization: measure(() => JSON.stringify(metadata)),
        },
        caveat:
          "Offline projection/serialization only. Not recording CPU, browser RAM, Safari stability or a historical data migration.",
      },
      null,
      2
    )
  );
} catch {
  // Error messages from malformed JSON can contain private input. Do not echo them.
  console.error(
    "Benchmark failed. Check fixture readability/format/size and build the backend first. No recording was modified."
  );
  process.exitCode = 1;
}
