# HTTP evidence: release gates without an archive

Grafana: https://dashboard.wot-cv.com, org 1; Loki `bet3mn133whkwd`, Tempo
`df0rqhtz9e3uoa`. Links require existing Grafana access; no tokens in replay.
No body archive or multipart reader exists. A trace/log link does not prove
that body exists. Neither this audit nor a successful exporter call is a receipt.

Run on server (read-only): `node scripts/audit-http-evidence.mjs --live`.
The 200-entry/one-hour sample is explicitly bounded and not a completeness audit.
Lost Loki records cannot be detected from Loki alone. Compare independent staging
request counts with exporter and Loki counters; do not increase query/ingest limits.

Grafana LogQL (normalised OTel metadata names):

```logql
{service_name="wot-cv-be-prod",deployment_environment="prod"} | http_response_body_state="omitted"
{service_name="wot-cv-be-prod",deployment_environment="prod"} | http_request_body_state="empty"
{service_name="wot-cv-be-prod",deployment_environment="prod"} | http_response_body_state=~"inline|redacted"
```

Use structured metadata, not indexed labels, for states/IDs/body; no new labels
containing users, URLs, traces or correlations. Monitor Collector refused/dropped
log records, export failures/queue utilisation and `loki_discarded_samples_total`
by reason. Verify exact metric names with the deployed Collector version; no
counter present is NOT proof of zero drops. Retention overlap is at most the
actually configured period, never lifetime coverage of retained replay.

## Mandatory staging matrix (synthetic accounts only)

For register, auth/refresh, account, clan/player lists and management routes:
record template + method + status + media type + request state + response state.
Exercise 2xx, 401/403, 5xx, proxy rejection, client abort, chunked, empty body,
whitespace, UTF-8, 8191/8192/8193 characters, 64KiB overflow, streaming, HEAD/204/304.
Verify exact permitted inline body in Loki after SDK/Collector; redacted fields
must be masked, bytes/characters accounted separately. A pre-filter failure
must not be presented as a logbook capture. Repeat after exporter delay/restart.

Current limits: Logbook 8192 characters; capture 64KiB; SDK attribute 16384
characters / 512 attributes; Loki 64KiB / 128 structured metadata attributes,
256KiB line. Resource attributes also consume the Loki budget. New state fields
must not displace bodies silently. Oversized or absent body remains omitted or
unknown. Do not mark the matrix PASS solely on unit tests or read-only prod samples.

NO-GO for additional full-body removal while any body representation lacks a
verified durable replacement. Production rollout of logging fixes needs this
matrix; production activation of compression additionally needs real browser
and proxy tests. Existing historical full recordings are never rewritten.
