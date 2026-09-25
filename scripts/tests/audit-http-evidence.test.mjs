import { test } from "node:test";
import { strict as assert } from "node:assert";
import { summarizeHttpEvidence, auditHttpEvidence } from "../audit-http-evidence.mjs";

const fixture = metadata => ({
  status: "success",
  data: {
    resultType: "streams",
    result: [
      {
        stream: { secret: "secret" },
        values: metadata.map(item => ["1", "secret body", { structuredMetadata: item }]),
      },
    ],
  },
});

test("separates missing evidence and empty body without leaking values", () => {
  const report = summarizeHttpEvidence(
    fixture([
      {
        http_type: "request",
        http_host: "api.wot-cv.com",
        http_method: "GET",
        http_route: "/secret-route",
        http_correlation_id: "secret-id",
        http_request_body_state: "empty",
      },
      {
        http_type: "response",
        http_host: "api.wot-cv.com",
        http_method: "GET",
        http_route: "/secret-route",
        http_correlation_id: "secret-id",
        http_response_body_state: "inline",
        http_response_body: "secret",
      },
      { http_type: "response", http_response_body_state: "forged" },
      { http_type: "response", http_response_body_state: "inline" },
    ])
  );
  assert.equal(report.pairedExchanges, 1);
  assert.equal(report.states.unknown, 1);
  assert.equal(report.invalidInline, 1);
  assert.equal(report.durableCoverage, false);
  assert.ok(!JSON.stringify(report).includes("secret"));
});

const hop = (host, direction, extra = {}) => ({
  http_host: host,
  http_method: "GET",
  http_route: "/private-route",
  http_correlation_id: "private-id",
  http_type: direction,
  ...extra,
});

test("same correlation ID cannot pair different HTTP hops", () => {
  const report = summarizeHttpEvidence(
    fixture([
      hop("api.wot-cv.com", "request"),
      hop("localhost:9090", "response"),
      hop("api.wot-cv.com", "response", { http_route: "/different" }),
    ])
  );
  assert.equal(report.pairedExchanges, 0);
  assert.equal(report.unpairedExchanges, 3);
  assert.equal(report.scopes.ownApi.entries, 2);
  assert.equal(report.scopes.otherHosts.entries, 1);
  assert.ok(!JSON.stringify(report).includes("private"));
});

test("scope separates declared capture from legacy and unknown evidence", () => {
  const report = summarizeHttpEvidence(
    fixture([
      hop("api.wot-cv.com", "request", { http_request_body_state: "empty", http_request_body_reason: "zero_bytes" }),
      hop("api.wot-cv.com", "response", {
        http_response_body_state: "inline",
        http_response_body_reason: "captured",
        http_response_body: "private-body",
      }),
      hop("localhost:9090", "request", {
        http_request_body_state: "inline",
        http_request_body_reason: "legacy_inline_unverified",
        http_request_body: "private-body",
      }),
      hop("localhost:9090", "response", {
        http_response_body_state: "unknown",
        http_response_body_reason: "capture_unverified",
      }),
    ])
  );
  assert.equal(report.scopes.ownApi.evidence.explicitState, 2);
  assert.equal(report.scopes.otherHosts.evidence.legacyUnverified, 1);
  assert.equal(report.scopes.otherHosts.evidence.unknown, 1);
  assert.equal(report.pairedExchanges, 2);
  assert.equal(report.scopes.ownApi.pairedExchanges, 1);
  assert.equal(report.durableCoverage, false);
});

test("unknown fields cannot leak via reason keys and contradictory empty is not evidence", () => {
  const report = summarizeHttpEvidence(
    fixture([
      {
        http_type: "request",
        http_request_body_state: "empty",
        http_request_body_reason: "zero_bytes",
        http_request_body: "private-content",
      },
      {
        http_type: "request",
        http_request_body_state: "inline",
        http_request_body_reason: "private-reason",
        http_request_body: "private-content",
      },
      { http_type: "request", http_request_body_reason: "__proto__" },
      null,
    ])
  );
  assert.equal(report.evidence.inconsistent, 1);
  assert.equal(report.evidence.unknown, 3);
  assert.equal(report.unscopedPairingEntries, 4);
  assert.equal(report.scopes.unknown.entries, 4);
  assert.equal(report.reasons.unrecognized_or_missing, 2);
  assert.ok(!JSON.stringify(report).includes("private"));
  assert.ok(!JSON.stringify(report).includes("__proto__"));
});

test("duplicate request or response is ambiguous even within a scoped hop", () => {
  const report = summarizeHttpEvidence(
    fixture([hop("api.wot-cv.com", "request"), hop("api.wot-cv.com", "request"), hop("api.wot-cv.com", "response")])
  );
  assert.equal(report.pairedExchanges, 0);
  assert.equal(report.scopes.ownApi.unpairedExchanges, 1);
});

test("near-match hosts are not own API", () => {
  const report = summarizeHttpEvidence(
    fixture([hop("api.wot-cv.com.evil.test", "request"), hop("user@api.wot-cv.com", "request")])
  );
  assert.equal(report.scopes.ownApi.entries, 0);
  assert.equal(report.scopes.otherHosts.entries, 1);
  assert.equal(report.scopes.unknown.entries, 1);
});

test("detects metadata and attribute bounds and refuses oversized samples", () => {
  const report = summarizeHttpEvidence(
    fixture([
      { body: "ą".repeat(40000), ...Object.fromEntries(Array.from({ length: 129 }, (_, i) => [String(i), ""])) },
    ])
  );
  assert.equal(report.metadataOverBudget, 1);
  assert.equal(report.attributeOverBudget, 1);
  assert.throws(() => summarizeHttpEvidence(fixture(Array.from({ length: 201 }, () => ({})))));
});

test("duplicate IDs and empty samples are not complete coverage", () => {
  const entry = { http_type: "request", http_correlation_id: "repeat" };
  assert.equal(summarizeHttpEvidence(fixture([entry, entry])).pairedExchanges, 0);
  assert.equal(summarizeHttpEvidence(fixture([])).durableCoverage, false);
});

test("malformed response cannot leak text through parser error", async () => {
  await assert.rejects(
    auditHttpEvidence(async () => new Response("secret body")),
    error => !error.message.includes("secret body")
  );
});
