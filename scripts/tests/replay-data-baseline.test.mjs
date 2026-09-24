import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createReplayCorpus } from "../lib/replay-corpus.mjs";
import { auditRuntime, measureCorpus, sanitizeTrackingConfig } from "../replay-data-baseline.mjs";

const config = () => ({ networkReplay: {
  captureMode: "metadata", enabled: true, captureFetch: true, captureXhr: true,
  capturePerformanceResources: true, captureInitialPerformanceResources: true,
  captureRequestHeaders: false, captureResponseHeaders: false, captureRequestBody: false, captureResponseBody: false,
  maxBodySizeBytes: 1_000_000, bodyReadTimeoutMs: 1000, maxNetworkEventSizeBytes: 2_500_000, maxReplayBatchSizeBytes: 7_000_000,
} });

test("corpus is deterministic, independent and retains Unicode, full bodies and unknown events", () => {
  const first = createReplayCorpus();
  assert.deepEqual(first, createReplayCorpus());
  first.small.events.length = 0;
  assert.equal(createReplayCorpus().small.events.length, 1);
  assert.match(JSON.stringify(first.legacy), /Zażółć/);
  assert.equal(first.mixed.events[3].data.payload.nil, null);
  assert.equal(first.metadata.events[0].data.payload.requests[0].sizes.transferSize, 0);
});

test("measurements use UTF-8 bytes and round-trip every fixture", () => {
  const corpus = createReplayCorpus();
  for (const result of measureCorpus(corpus, 2)) {
    assert.equal(result.jsonBytes, Buffer.byteLength(JSON.stringify(corpus[result.name])));
    assert(result.gzipBytes > 0);
    assert(result.cpuP95Ms >= 0);
  }
  assert.throws(() => measureCorpus(corpus, 0));
  assert.throws(() => measureCorpus(corpus, Infinity));
});

test("runtime output contains only whitelisted fields; bad values fail closed", () => {
  const input = config();
  input.networkReplay.secret = "do-not-output";
  input.password = "do-not-output";
  assert(!JSON.stringify(sanitizeTrackingConfig(input)).includes("do-not-output"));
  input.networkReplay.maxBodySizeBytes = -1;
  assert.throws(() => sanitizeTrackingConfig(input), /Invalid limit/);
  assert.throws(() => sanitizeTrackingConfig({ networkReplay: { captureMode: "secret" } }), /Invalid tracking configuration/);
  input.networkReplay.maxBodySizeBytes = 1_000_001;
  assert.throws(() => sanitizeTrackingConfig(input), /Limit increased: maxBodySizeBytes/);
});

test("live audit is explicit, bounded and rejects non-success HTTP", async () => {
  const result = await auditRuntime(async (url, options) => {
    assert.equal(new URL(url).hostname, "tracking.wot-cv.com");
    assert(options.signal instanceof AbortSignal);
    return { ok: true, json: async () => config() };
  });
  assert.equal(result.maxBodySizeBytes, 1_000_000);
  await assert.rejects(auditRuntime(async () => ({ ok: false, status: 503 })), /HTTP 503/);
  await assert.rejects(auditRuntime(async () => ({ ok: true, json: async () => { throw new Error("secret response text"); } })), error => {
    assert.equal(error.message, "Tracking configuration is not valid JSON");
    return true;
  });
});
