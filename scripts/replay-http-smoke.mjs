import { strict as assert } from "node:assert";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createReplayCorpus } from "./lib/replay-corpus.mjs";
import { decodeReplayUpload } from "../server/dist/api/sessionReplay/replayUploadEncoding.js";
import { createCorsOptionsDelegate } from "../server/dist/lib/cors.js";

// Local synthetic HTTP only. Build server first. No DB, production requests or new dependencies.
const playwrightPath = process.argv[2];
if (!playwrightPath || process.argv.length !== 3)
  throw new Error("Usage: node scripts/replay-http-smoke.mjs <path-to-playwright-index.mjs>");
const playwright = await import(pathToFileURL(playwrightPath).href);
const requireServer = createRequire(new URL("../server/package.json", import.meta.url));
const Fastify = requireServer("fastify"),
  cors = requireServer("@fastify/cors");
const esbuild = requireServer("esbuild");
const bundle = await esbuild.build({
  entryPoints: [fileURLToPath(new URL("../server/src/analytics-script/replayUpload.ts", import.meta.url))],
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
});
const pageServer = createServer((request, response) => {
  if (request.url === "/uploader.js") {
    response.setHeader("Content-Type", "text/javascript");
    response.end(bundle.outputFiles[0].text);
  } else {
    response.setHeader("Content-Type", "text/html");
    response.end("<!doctype html><title>Synthetic Replay HTTP Smoke</title>");
  }
});
const api = Fastify({ bodyLimit: 10 * 1024 * 1024 });
let received = [],
  preflights = 0;
api.addHook("onRequest", async request => {
  if (request.method === "OPTIONS") preflights++;
});
await api.register(cors, { delegator: createCorsOptionsDelegate({ NODE_ENV: "production" }) });
api.post("/api/session-replay/record/:siteId", { preParsing: decodeReplayUpload }, async (request, reply) => {
  const encoding = request.headers["content-encoding"] ?? "identity";
  const entry = {
    case: request.params.siteId,
    encoding,
    bytes: Number(request.headers["content-length"]),
    body: request.body,
  };
  received.push(entry);
  if (request.params.siteId === "rollback" && encoding === "gzip")
    return reply.code(415).send({ error: "simulated old server" });
  return { success: true };
});
try {
  await new Promise(resolve => pageServer.listen(0, "127.0.0.1", resolve));
  await api.listen({ host: "127.0.0.1", port: 0 });
  const apiUrl = `http://127.0.0.1:${api.server.address().port}/api/session-replay/record`;
  const reports = [],
    corpus = createReplayCorpus();
  for (const engine of ["chromium", "firefox", "webkit"]) {
    let browser;
    try {
      received = [];
      preflights = 0;
      browser = await playwright[engine].launch({ headless: true });
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${pageServer.address().port}`);
      await page.evaluate(
        async ({ corpus, apiUrl }) => {
          const { createReplayUploader } = await import("/uploader.js");
          for (const [name, batch] of Object.entries(corpus)) {
            await createReplayUploader(`${apiUrl}/${name}`, { version: 1, gzip: true })(batch);
            await createReplayUploader(`${apiUrl}/legacy-${name}`, undefined)(batch);
          }
          const send = createReplayUploader(`${apiUrl}/rollback`, { version: 1, gzip: true });
          try {
            await send(corpus.mixed);
            throw new Error("Expected 415");
          } catch (error) {
            if (error.status !== 415) throw error;
          }
          // The recorder would own this retry; uploader must NOT have retried internally.
          await send(corpus.mixed);
          await Promise.all(
            [0, 1, 2].map(i =>
              createReplayUploader(`${apiUrl}/tab-${i}`, { version: 1, gzip: true })({
                ...corpus.mixed,
                userId: `tab-${i}`,
              })
            )
          );
        },
        { corpus, apiUrl }
      );
      assert.equal(received.length, 13, `${engine}: unexpected attempts`);
      for (const entry of received) {
        const name = entry.case.replace(/^legacy-/, "");
        const expected =
          corpus[name] ?? (entry.case.startsWith("tab-") ? { ...corpus.mixed, userId: entry.case } : corpus.mixed);
        assert.deepEqual(entry.body, expected, `${engine}/${entry.case}: canonical payload mismatch`);
        const plain =
          entry.case.startsWith("legacy-") ||
          entry.case === "small" ||
          (entry.case === "rollback" && entry === received[9]);
        assert.equal(entry.encoding, plain ? "identity" : "gzip");
        assert(entry.bytes > 0 && entry.bytes <= Buffer.byteLength(JSON.stringify(expected)));
      }
      assert(preflights > 0, "Cross-origin test did not preflight");
      reports.push({
        engine,
        version: browser.version(),
        passed: true,
        preflights,
        requests: received.map(({ body, ...metrics }) => metrics),
      });
    } finally {
      await browser?.close();
    }
  }
  console.log(
    JSON.stringify(
      { source: "production uploader + decoder, local HTTP, synthetic data", physicalIphone: "not-tested", reports },
      null,
      2
    )
  );
} finally {
  await api.close();
  await new Promise(resolve => pageServer.close(resolve));
}
