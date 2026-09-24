import { pathToFileURL } from "node:url";

const STATES = ["empty", "inline", "redacted", "omitted", "unknown"];
const QUERY_LIMIT = 200;
const RESPONSE_LIMIT = 8 * 1024 * 1024;

/** Input is transient Loki data. Output never contains log lines or metadata values. */
export function summarizeHttpEvidence(response) {
  if (response?.status !== "success" || response?.data?.resultType !== "streams" || !Array.isArray(response.data.result)) throw new Error("Invalid Loki result");
  const report = { entries: 0, missingMetadata: 0, states: Object.fromEntries(STATES.map(state => [state, 0])), invalidInline: 0, metadataOverBudget: 0, attributeOverBudget: 0, maxMetadataBytes: 0, maxAttributes: 0, pairedExchanges: 0, unpairedExchanges: 0, truncatedSample: false, durableCoverage: false };
  const exchanges = new Map();
  for (const stream of response.data.result) {
    if (!Array.isArray(stream?.values)) throw new Error("Invalid Loki stream");
    for (const tuple of stream.values) {
      if (++report.entries > QUERY_LIMIT) throw new Error("Loki sample exceeds requested bound");
      const metadata = tuple?.[2]?.structuredMetadata;
      if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
        report.states.unknown++;
        report.missingMetadata++;
        continue;
      }
      const values = Object.entries(metadata);
      const bytes = values.reduce((sum, [key, value]) => sum + Buffer.byteLength(key) + Buffer.byteLength(String(value)), 0);
      report.maxMetadataBytes = Math.max(report.maxMetadataBytes, bytes);
      report.maxAttributes = Math.max(report.maxAttributes, values.length);
      if (bytes > 65536 || values.length > 128) report.metadataOverBudget++;
      if (values.some(([, value]) => String(value).length > 16384)) report.attributeOverBudget++;
      const direction = metadata.http_type;
      const prefix = direction === "request" ? "http_request_body" : direction === "response" ? "http_response_body" : undefined;
      const state = prefix && STATES.includes(metadata[`${prefix}_state`]) ? metadata[`${prefix}_state`] : "unknown";
      report.states[state]++;
      if (["inline", "redacted"].includes(state) && (typeof metadata[prefix] !== "string" || metadata[prefix].length === 0)) report.invalidInline++;
      const id = metadata.http_correlation_id;
      if (typeof id === "string" && /^[\w.-]{1,128}$/.test(id) && prefix) {
        const group = exchanges.get(id) ?? { request: 0, response: 0 };
        group[direction]++;
        exchanges.set(id, group);
      }
    }
  }
  for (const group of exchanges.values()) {
    // Duplicate IDs are not a uniquely paired exchange.
    if (group.request === 1 && group.response === 1) report.pairedExchanges++;
    else report.unpairedExchanges++;
  }
  report.truncatedSample = report.entries === QUERY_LIMIT;
  return report;
}

export async function auditHttpEvidence(fetcher = fetch) {
  const url = new URL("http://127.0.0.1:3100/loki/api/v1/query_range");
  url.searchParams.set("query", '{service_name="wot-cv-be-prod",deployment_environment="prod"} | http_type=~"request|response"');
  url.searchParams.set("limit", String(QUERY_LIMIT));
  url.searchParams.set("start", String(BigInt(Date.now() - 3600000) * 1000000n));
  url.searchParams.set("direction", "backward");
  const response = await fetcher(url, { signal: AbortSignal.timeout(10000), headers: { "X-Loki-Response-Encoding-Flags": "categorize-labels" } });
  if (!response.ok) throw new Error(`Loki HTTP ${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing Loki response");
  let bytes = 0;
  const chunks = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > RESPONSE_LIMIT) throw new Error("Loki response exceeds audit bound");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  let parsed;
  try { parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new Error("Invalid Loki JSON (content suppressed)"); }
  return summarizeHttpEvidence(parsed);
}

if (process.argv[1] === "-" || (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)) {
  if (process.argv.slice(2).join(" ") !== "--live") {
    console.error("Read-only audit must be explicitly invoked with --live on the server or an SSH tunnel to localhost:3100");
    process.exitCode = 1;
  } else {
    try { console.log(JSON.stringify(await auditHttpEvidence(), null, 2)); }
    catch { console.error("HTTP evidence audit failed; no raw server content emitted"); process.exitCode = 1; }
  }
}
