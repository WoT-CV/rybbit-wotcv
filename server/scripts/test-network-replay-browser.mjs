// Offline integration QA against two temporary loopback HTTP servers. No production traffic.
// Reuse an installed @playwright/test via RYBBIT_PLAYWRIGHT_PACKAGE if it is not local.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const playwright = require(process.env.RYBBIT_PLAYWRIGHT_PACKAGE || "@playwright/test");
const engine = process.env.RYBBIT_QA_BROWSER || "chromium";
assert.ok(["chromium", "webkit"].includes(engine), "Choose chromium or webkit (mobile viewport QA)");
const bundle = await build({
  entryPoints: [fileURLToPath(new URL("../src/analytics-script/networkReplay/index.ts", import.meta.url))],
  bundle: true,
  write: false,
  format: "iife",
  globalName: "NetworkReplay",
  platform: "browser",
});
const listen = server =>
  new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
const close = server => new Promise((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
const app = createServer((request, response) => {
  response.setHeader("Content-Type", "text/html");
  response.end("<!doctype html><title>Offline replay QA</title>");
});
const payload = "BODY_CANARY".repeat(220000);
let preflights = 0;
let browser;
let api;
try {
  await listen(app);
  const appUrl = "http://127.0.0.1:" + app.address().port;
  api = createServer((request, response) => {
    if (request.method === "OPTIONS") preflights++;
    request.resume();
    response.setHeader("Access-Control-Allow-Origin", appUrl);
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader(
      "Access-Control-Expose-Headers",
      request.url.startsWith("/hidden") ? "X-Correlation-Id" : "X-Correlation-Id, X-Trace-Id"
    );
    response.setHeader("X-Correlation-Id", "browser-request");
    response.setHeader("X-Trace-Id", "a".repeat(32));
    response.setHeader("Content-Type", "text/plain");
    response.end(payload);
  });
  await listen(api);
  const apiUrl = "http://127.0.0.1:" + api.address().port;
  browser = await playwright[engine].launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.goto(appUrl);
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const result = await page.evaluate(
    async ({ apiUrl, expectedSize }) => {
      const records = [];
      const nativeFetch = window.fetch;
      const nativeXhrOpen = XMLHttpRequest.prototype.open;
      const requestClone = Request.prototype.clone;
      const responseClone = Response.prototype.clone;
      let requestClones = 0;
      let responseClones = 0;
      Request.prototype.clone = function () {
        requestClones++;
        return requestClone.call(this);
      };
      Response.prototype.clone = function () {
        responseClones++;
        return responseClone.call(this);
      };
      const stop = NetworkReplay.startNetworkReplayRecorder({
        analyticsHost: "http://127.0.0.1:1",
        config: { enabled: true, captureMode: "metadata", capturePerformanceResources: false },
        emit: record => records.push(record),
      });
      try {
        const response = await fetch(
          new Request(apiUrl + "/fetch?token=QUERY_CANARY", { method: "POST", body: "REQUEST_CANARY" })
        );
        const fetchSize = (await response.text()).length;
        const xhrSize = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", apiUrl + "/xhr?token=QUERY_CANARY");
          xhr.onload = () => resolve(xhr.responseText.length);
          xhr.onerror = () => reject(new Error("XHR transport failed"));
          xhr.send("REQUEST_CANARY");
        });
        const hiddenResponse = await fetch(apiUrl + "/hidden");
        await hiddenResponse.text();
        // Emission waits for promise microtasks, not an arbitrary playback delay.
        await Promise.resolve();
        stop();
        return {
          records,
          requestClones,
          responseClones,
          fetchSize,
          xhrSize,
          expectedSize,
          fetchRestored: window.fetch === nativeFetch,
          xhrRestored: XMLHttpRequest.prototype.open === nativeXhrOpen,
        };
      } finally {
        stop();
        Request.prototype.clone = requestClone;
        Response.prototype.clone = responseClone;
      }
    },
    { apiUrl, expectedSize: payload.length }
  );
  assert.equal(result.records.length, 3);
  assert.equal(result.fetchSize, result.expectedSize);
  assert.equal(result.xhrSize, result.expectedSize);
  assert.equal(result.requestClones, 0);
  assert.equal(result.responseClones, 0);
  assert.equal(result.fetchRestored, true);
  assert.equal(result.xhrRestored, true);
  assert.equal(preflights, 0);
  assert.ok(!JSON.stringify(result.records).includes("CANARY"));
  for (const record of result.records) {
    assert.equal(record.captureMode, "metadata");
    assert.equal(record.correlationId, "browser-request");
    assert.equal(record.traceId, record.url.endsWith("/hidden") ? undefined : "a".repeat(32));
    assert.deepEqual(record.requestHeaders, {});
    assert.deepEqual(record.responseHeaders, {});
    assert.equal(record.requestBody, undefined);
    assert.equal(record.responseBody, undefined);
  }
  console.log(
    JSON.stringify(
      {
        browser: engine,
        passed: true,
        requests: result.records.length,
        bodyBytesPerResponse: payload.length,
        requestClones: result.requestClones,
        responseClones: result.responseClones,
        preflights,
        nativeBodiesIntact: true,
        corsFallbackVerified: true,
        caveat: "Desktop engine with mobile viewport, not physical iPhone Safari.",
      },
      null,
      2
    )
  );
} finally {
  await browser?.close();
  if (api?.listening) await close(api);
  if (app.listening) await close(app);
}
