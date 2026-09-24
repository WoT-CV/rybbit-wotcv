import { test } from "node:test";
import { strict as assert } from "node:assert";
import { summarizeHttpEvidence, auditHttpEvidence } from "../audit-http-evidence.mjs";

const fixture = metadata => ({ status: "success", data: { resultType: "streams", result: [{ stream: { secret: "secret" }, values: metadata.map(item => ["1", "secret body", {structuredMetadata: item}]) }] } });

test("separates missing evidence and empty body without leaking values", () => {
  const report = summarizeHttpEvidence(fixture([
    { http_type: "request", http_correlation_id: "secret-id", http_request_body_state: "empty" },
    { http_type: "response", http_correlation_id: "secret-id", http_response_body_state: "inline", http_response_body: "secret" },
    { http_type: "response", http_response_body_state: "forged" },
    { http_type: "response", http_response_body_state: "inline" },
  ]));
  assert.equal(report.pairedExchanges, 1);
  assert.equal(report.states.unknown, 1);
  assert.equal(report.invalidInline, 1);
  assert.equal(report.durableCoverage, false);
  assert.ok(!JSON.stringify(report).includes("secret"));
});

test("detects metadata and attribute bounds and refuses oversized samples", () => {
  const report = summarizeHttpEvidence(fixture([{ body: "ą".repeat(40000), ...Object.fromEntries(Array.from({length: 129}, (_, i) => [String(i), ""])) }]));
  assert.equal(report.metadataOverBudget, 1);
  assert.equal(report.attributeOverBudget, 1);
  assert.throws(() => summarizeHttpEvidence(fixture(Array.from({length: 201}, () => ({})))));
});

test("duplicate IDs and empty samples are not complete coverage", () => {
  const entry = {http_type: "request", http_correlation_id: "repeat"};
  assert.equal(summarizeHttpEvidence(fixture([entry, entry])).pairedExchanges, 0);
  assert.equal(summarizeHttpEvidence(fixture([])).durableCoverage, false);
});

test("malformed response cannot leak text through parser error", async () => {
  await assert.rejects(auditHttpEvidence(async () => new Response("secret body")), error => !error.message.includes("secret body"));
});
