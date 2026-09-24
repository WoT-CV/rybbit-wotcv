import { strict as assert } from "node:assert";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import { createReplayCorpus } from "./lib/replay-corpus.mjs";

const LIMIT_KEYS = ["maxBodySizeBytes", "bodyReadTimeoutMs", "maxNetworkEventSizeBytes", "maxReplayBatchSizeBytes"];
export const FROZEN_REPLAY_LIMITS = Object.freeze({
  maxBodySizeBytes: 1_000_000,
  bodyReadTimeoutMs: 1000,
  maxNetworkEventSizeBytes: 2_500_000,
  maxReplayBatchSizeBytes: 7_000_000,
});
const FLAG_KEYS = ["enabled", "captureFetch", "captureXhr", "capturePerformanceResources", "captureInitialPerformanceResources", "captureRequestHeaders", "captureResponseHeaders", "captureRequestBody", "captureResponseBody"];

export function sanitizeTrackingConfig(input) {
  const config = input?.networkReplay;
  if (!config || !["full", "metadata"].includes(config.captureMode)) throw new Error("Invalid tracking configuration");
  const result = { captureMode: config.captureMode };
  for (const key of LIMIT_KEYS) {
    if (!Number.isSafeInteger(config[key]) || config[key] <= 0) throw new Error(`Invalid limit: ${key}`);
    if (config[key] > FROZEN_REPLAY_LIMITS[key]) throw new Error(`Limit increased: ${key}`);
    result[key] = config[key];
  }
  for (const key of FLAG_KEYS) {
    if (typeof config[key] !== "boolean") throw new Error(`Invalid flag: ${key}`);
    result[key] = config[key];
  }
  return result;
}

export function measureCorpus(corpus = createReplayCorpus(), attempts = 30) {
  assert(Number.isInteger(attempts) && attempts >= 1 && attempts <= 100, "Invalid benchmark iterations");
  return Object.entries(corpus).map(([name, batch]) => {
    const raw = Buffer.from(JSON.stringify(batch), "utf8");
    const times = [];
    let compressed;
    for (let index = -3; index < attempts; index++) {
      const started = performance.now();
      compressed = gzipSync(raw);
      if (index >= 0) times.push(performance.now() - started);
    }
    assert.deepEqual(gunzipSync(compressed), raw, `Round-trip failed: ${name}`);
    times.sort((left, right) => left - right);
    return {
      name, events: batch.events.length, jsonBytes: raw.byteLength, gzipBytes: compressed.byteLength,
      savedPercent: Number((100 * (1 - compressed.byteLength / raw.byteLength)).toFixed(2)),
      cpuP95Ms: Number(times[Math.ceil(times.length * 0.95) - 1].toFixed(3)),
    };
  });
}

export async function auditRuntime(fetcher = fetch) {
  const response = await fetcher("https://tracking.wot-cv.com/api/site/tracking-config/3e894930d08d", { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Tracking configuration HTTP ${response.status}`);
  let input;
  try {
    input = await response.json();
  } catch {
    throw new Error("Tracking configuration is not valid JSON");
  }
  return sanitizeTrackingConfig(input);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args.some(arg => arg !== "--live")) throw new Error("Usage: node scripts/replay-data-baseline.mjs [--live]");
    const report = { runtime: process.version, measurement: "synthetic Node CPU; not a browser benchmark", fixtures: measureCorpus() };
    if (args.includes("--live")) report.trackingConfig = await auditRuntime();
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Baseline failed");
    process.exitCode = 1;
  }
}
