import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// Uses an explicitly supplied, existing Playwright installation; never installs dependencies or touches production.
const path = process.argv[2];
if (!path || process.argv.length !== 3) throw new Error("Usage: node scripts/replay-browser-benchmark.mjs <path-to-playwright-index.mjs>");
const playwright = await import(pathToFileURL(path).href);
const modules = new Map(await Promise.all(["replay-browser-measure.mjs", "replay-corpus.mjs", "replay-wire-experiment.mjs"].map(async name =>
  [`/${name}`, await readFile(new URL(`lib/${name}`, import.meta.url))])));
const server = createServer((request, response) => {
  if (request.url === "/") { response.setHeader("Content-Type", "text/html"); response.end("<!doctype html><title>Synthetic Replay Benchmark</title>"); }
  else if (modules.has(request.url)) { response.setHeader("Content-Type", "text/javascript"); response.end(modules.get(request.url)); }
  else { response.statusCode = 404; response.end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
try {
  const reports = [];
  for (const engine of ["chromium", "firefox", "webkit"]) {
    let browser;
    try {
      browser = await playwright[engine].launch({ headless: true });
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      const report = await page.evaluate(async () => (await import("/replay-browser-measure.mjs")).measureBrowser());
      reports.push({ engine, version: browser.version(), ...report });
    } finally { await browser?.close(); }
  }
  console.log(JSON.stringify({ physicalIphone: "not-tested", reports }, null, 2));
} finally { await new Promise(resolve => server.close(resolve)); }
