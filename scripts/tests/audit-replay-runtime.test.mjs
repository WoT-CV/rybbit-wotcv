import assert from "node:assert/strict";
import { test } from "node:test";
import {
  auditReplayRuntime,
  boundedText,
  classifyReplayRuntime,
  hasMetadataTrackerTag,
} from "../audit-replay-runtime.mjs";

const sha = "a".repeat(40),
  digest = `sha256:${"b".repeat(64)}`;
const observation = (gzip = true) => {
  const config = {
    sessionReplay: true,
    replayTransport: { version: 1, gzip },
    networkReplay: {
      maxBodySizeBytes: 1000000,
      bodyReadTimeoutMs: 1000,
      maxNetworkEventSizeBytes: 2500000,
      maxReplayBatchSizeBytes: 7000000,
    },
  };
  return {
    localHealth: { status: "ok", gitSha: sha, imageDigest: digest },
    publicHealth: { status: "ok", gitSha: sha, imageDigest: digest },
    version: "2.9.1",
    localConfig: structuredClone(config),
    publicConfig: structuredClone(config),
    frontendMetadataTag: true,
    cors: {
      status: 204,
      origin: "https://wot-cv.com",
      credentials: null,
      headers: "Content-Type, Content-Encoding",
      methods: "GET, POST, OPTIONS",
    },
    beArtifact: { runtimeSha: "c".repeat(7), checkoutSha: "c".repeat(40) },
    containers: ["backend", "client", "clickhouse", "postgres", "redis"].map(name => ({
      name,
      status: "running",
      health: name === "client" ? undefined : "healthy",
      restarts: 0,
      oomKilled: false,
      imageId: digest,
      gitSha: sha,
      imageTag: `ghcr.io/wot-cv/rybbit-wotcv-${name}:sha-${sha}`,
      gzip: String(gzip),
    })),
  };
};

test("enabled capability is separate from traffic and body coverage proof", () => {
  const report = classifyReplayRuntime(observation());
  assert.equal(report.ok, true);
  assert.equal(report.gzip, "enabled");
  assert.equal(report.actualCompressedTrafficMeasured, false);
  assert.equal(report.durableHttpBodyCoverageConfirmed, false);
  assert.deepEqual(report.warnings, []);
});

test("disabled, missing and mismatched capabilities are not conflated", () => {
  const disabled = classifyReplayRuntime(observation(false));
  assert.equal(disabled.gzip, "disabled");
  assert.ok(disabled.warnings.includes("gzip_disabled"));
  const missing = observation();
  delete missing.publicConfig.replayTransport;
  assert.equal(classifyReplayRuntime(missing).gzip, "unknown");
  assert.equal(classifyReplayRuntime(missing).ok, false);
  const mismatched = observation();
  mismatched.publicConfig.replayTransport.gzip = false;
  assert.equal(classifyReplayRuntime(mismatched).gzip, "mismatch");
  const unknown = observation();
  delete unknown.containers[0].gzip;
  assert.equal(classifyReplayRuntime(unknown).gzip, "unknown");
});

test("unavailable health, increased limits, wrong image and CORS fail closed", () => {
  for (const mutate of [
    o => (o.localHealth = null),
    o => o.localConfig.networkReplay.maxBodySizeBytes++,
    o => (o.containers[0].imageId = "private-image"),
    o => (o.cors.origin = "*"),
    o => (o.cors.headers = "X-Content-Encoding"),
    o => (o.containers[0].oomKilled = true),
    o => (o.publicConfig.sessionReplay = false),
    o => (o.version = null),
    o => o.publicConfig.networkReplay.maxBodySizeBytes--,
  ]) {
    const o = observation();
    mutate(o);
    assert.equal(classifyReplayRuntime(o).ok, false);
  }
});

test("runtime JAR is not silently substituted by server checkout and output is allowlisted", () => {
  const o = observation();
  o.beArtifact.checkoutSha = "d".repeat(40);
  assert.equal(classifyReplayRuntime(o).beArtifact.provenance, "mismatch");
  o.beArtifact.runtimeSha = "private-value";
  o.version = "private-version";
  o.containers[0].status = "private-state";
  const report = classifyReplayRuntime(o);
  assert.equal(report.beArtifact.provenance, "unknown");
  assert.equal(report.applicationVersion, null);
  assert.ok(!JSON.stringify(report).includes("private"));
  assert.equal(classifyReplayRuntime({}).ok, false);
});

test("metadata tag must be on the actual published tracker, not a comment or other script", () => {
  const tag = '<script src="https://tracking.wot-cv.com/api/script.js" data-replay-network-mode="metadata">';
  assert.equal(hasMetadataTrackerTag(tag), true);
  assert.equal(hasMetadataTrackerTag(`<!-- ${tag} -->`), false);
  assert.equal(hasMetadataTrackerTag(tag.replace("tracking.wot-cv.com", "evil.example")), false);
  assert.equal(hasMetadataTrackerTag(tag.replace("metadata", "full")), false);
});

test("HTTP body collection is bounded and cancels the stream", async () => {
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      pull(c) {
        c.enqueue(new Uint8Array(64));
      },
      cancel() {
        cancelled = true;
      },
    })
  );
  await assert.rejects(boundedText(response, 32), /exceeds bound/);
  assert.equal(cancelled, true);
});

test("transport failures remain unknown and do not print exception data", async () => {
  const report = await auditReplayRuntime(
    async () => {
      throw new Error("private-response");
    },
    {
      containers: () => {
        throw new Error("private-env");
      },
      beArtifact: () => null,
    }
  );
  assert.equal(report.ok, false);
  assert.equal(report.gzip, "unknown");
  assert.ok(!JSON.stringify(report).includes("private"));
});

test("live adapter performs only bounded GET and OPTIONS and drops extra server fields", async () => {
  const o = observation(),
    methods = [];
  const fetcher = async (url, options) => {
    methods.push(options.method ?? "GET");
    assert.ok(options.signal instanceof AbortSignal);
    if (options.method === "OPTIONS")
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": o.cors.origin,
          "access-control-allow-headers": o.cors.headers,
          "access-control-allow-methods": o.cors.methods,
        },
      });
    if (url.endsWith("/api/health")) return Response.json({ ...o.localHealth, privateToken: "private-value" });
    if (url.includes("/tracking-config/")) return Response.json(o.localConfig);
    if (url.endsWith("/api/version")) return Response.json({ version: o.version });
    if (url === "https://wot-cv.com")
      return new Response(
        '<script src="https://tracking.wot-cv.com/api/script.js" data-replay-network-mode="metadata">'
      );
    throw new Error("Unexpected URL");
  };
  const report = await auditReplayRuntime(fetcher, { containers: () => o.containers, beArtifact: () => o.beArtifact });
  assert.equal(report.ok, true);
  assert.equal(report.gzip, "enabled");
  assert.deepEqual(methods.sort(), ["GET", "GET", "GET", "GET", "GET", "GET", "OPTIONS"]);
  assert.ok(!JSON.stringify(report).includes("private"));
});
