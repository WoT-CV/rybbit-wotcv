# Replay observability integration

## Scope and stage gates (2026-09-24)

Implementation is local. Production remains read-only; no deployment, migrations,
retention changes, or historical replay rewriting are part of this operation.
Every stage is re-analysed before implementation, tested, self-reviewed and committed.
Commits exclude pre-existing work in other repositories. No push is implied.

### Stage 1 — Correlation and Grafana links

Re-analysis: production already returns a CORS-exposed `X-Correlation-Id`.
A read-only request was located in Loki by `http_correlation_id`. Its log pair
did not carry a trace ID. Existing recordings keep correlation inside response
headers, which would disappear when header capture is disabled.

Implementation plan:
1. Add optional, validated correlation metadata to the existing version-1 network
   event. Capture only response IDs; never inject headers or invent backend IDs.
2. Parse new fields and retain legacy response-header fallback. Reject malformed
   IDs before using them in queries.
3. Configure site-scoped, exact-origin Grafana profiles on the server. Restrict
   configuration reads to authenticated replay readers; public replay permission
   alone must not disclose the integration configuration.
4. Build Explore URLs using encoded JSON, fixed service/environment selectors and
   absolute request timestamps. Allow only administrator-configured HTTPS targets,
   no credentials, no URLs from recordings, and no calls to Grafana while recording.
5. Add compact, translated links to request details, preserving existing bodies.
6. Test validation, origin/site isolation, legacy data, link escaping, time bounds,
   missing IDs, and authenticated/public behavior. Run focused tests and typechecks,
   inspect the staged diff, then commit this stage.

Acceptance: IDs survive disabled header capture and valid configured requests open
the correct time-scoped logs without granting any Grafana privileges.

Configuration (opt-in, backend environment only):

```dotenv
WOTCV_REPLAY_OBSERVABILITY_PROFILES='[{"siteIds":[2],"requestOrigin":"https://api.example.com","grafanaUrl":"https://monitoring.example.com/grafana","orgId":1,"lokiDatasourceUid":"wotcv-loki","serviceName":"wot-cv-be-prod","environment":"prod","timePaddingMs":120000}]'
```

Replace every example with verified values from your own deployment, including the
numeric Rybbit site ID and Grafana datasource UID (not its display name). An optional
`tempoDatasourceUid` enables trace links once the request has a real trace ID.
Use separate profiles for separate request origins/environments; duplicate origins
within one site fail closed. Credentials and API keys must never appear in profiles.
Profiles are returned only by the authenticated `replay:read` site-scoped endpoint;
they do not belong to the public tracking configuration. Grafana performs its own
authentication and authorization. Do not create anonymous dashboard access to make
these links work. Historic recordings retain their original body data and can link
using the legacy response correlation header, subject to Loki retention.

Stage 1 review and verification:
- Reviewed site authorization, exact-origin matching, malformed IDs, URL injection,
  public replay access, legacy headers, bounded time ranges and recorder cleanup.
- Fixed the test route's Fastify parameter type and bounded the maximum end timestamp.
- Restored message key ordering after extraction and supplied all 12 translations.
- `pnpm install --frozen-lockfile` restored the existing dependency versions, without
  manifest/lockfile changes; the earlier NextConfig error was a stale local install.
- `pnpm typecheck` passed. Network UI tests: 28 passed; observer/config/access tests:
  34 passed. Scoped ESLint: no errors, one existing TanStack Virtual compiler warning.
- Tracker production bundles and compressed assets build successfully. No migration
  or production operation was run. Live Grafana login/click-through remains a rollout gate.

### Stage 2 — Metadata-only network capture

Fresh analysis: disabling body flags currently still clones `Request` during fetch
registration. XHR saves all outgoing headers and reads all response headers even
when neither is emitted. Resource Timing has a separate emission path. WoT-CV FE
currently explicitly disables password/email/telephone masking. Old JSON site
configuration must continue working without a database migration.

Implementation plan (before stage-2 code changes):
1. Add an optional `captureMode` (`full`/`metadata`) with legacy `full` default;
   share the policy between server and recorder. Metadata mode forcibly disables
   both body and header flags, even when a stale config says otherwise.
2. Accept metadata as a script-tag privacy cap, never as permission to enable
   replay or override an administrator's stricter policy. Preserve tracking opt-out.
3. Remove Request construction/cloning and body reads when body capture is off.
   Avoid XHR header enumeration and retention, except content type when body
   capture actually requires it. Preserve native responses, errors and cleanup.
4. Sanitize fetch/XHR/resource/current-page network URLs (no query, fragment or
   credentials; only HTTP(S)); constrain emitted error information in metadata mode.
   Apply a final metadata-only emission allowlist to all observer paths.
5. Mark new metadata events and explain intentional body omission in replay UI;
   retain parser/UI compatibility with historical full recordings.
6. Make WoT-CV FE emit a metadata cap by default, allow explicit build-time rollback,
   reject invalid modes, and mask sensitive inputs. Do not alter DOM fidelity,
   sampling, API calls or consent/identity lifecycle in this stage.
7. Test conflicting flags, script/API precedence, opt-out, Request/Response clone
   spies, large/streaming bodies, native errors, XHR, Resource Timing, URL privacy,
   legacy recordings and generated HTML. Run typechecks/lint/builds, self-review
   and commit separately in each affected repository with the stage name.

Limits: URL paths can still contain identifiers; backend endpoint design and Loki
redaction remain relevant. DOM snapshots dominate the measured large replay; this
network optimization alone is not evidence that the iPhone playback issue is fixed.

Stage 2 review and verification:
- Reviewed all emissions including Resource Timing and unload. Metadata uses an
  explicit allowlist; raw exception strings/status text and all bodies/headers are
  omitted. Request and Response clone spies stay at zero for 2.4 MB bodies; native
  response/error identity and body readability are preserved.
- Fixed validation to permit a small metadata event budget without the irrelevant
  full-body limit blocking it. Fixed a Resource Timing test fixture's DOM type.
- 70 recorder/config tests and 29 network UI/parser tests passed. Both Rybbit
  typechecks, backend build, tracker generation, client production build and scoped
  UI lint passed. FE: 23 focused tests, typecheck, production build and scoped lint
  passed (existing large-chunk warning only). No version/lockfile upgrades.
- No production configuration, past recording, database or consent state changed.
- Rollout order: new Rybbit tracker, verify the effective metadata policy, then FE.
  Build-time FE rollback to `full` cannot override a metadata server policy; a server
  rollback must explicitly re-enable the four body/header flags if required.

### Stage 3 — Real server traces and Tempo

Fresh analysis (before implementation): the exact installed OpenTelemetry 2.31.1
source orders its MVC filter at `HIGHEST_PRECEDENCE + 1`. Both BE and refresher
register their Logbook filters at the same order. Depending on registration order,
the HTTP log pair is emitted outside the server span. A read-only production GET
confirmed a correlation ID and a searchable Loki pair, but no trace/span fields.
This is evidence of the symptom, not proof that production tracing is entirely off.

The starter already instruments Spring Boot 4 `RestTemplateBuilder` through a
customizer (including non-bean clients built by the existing refresher clients).
Do not inject another tracing interceptor or change the isolated clan-reserve pools.

Implementation plan:
1. Preserve correlation at order +0, OpenTelemetry at +1, add response trace context
   at +2, move Logbook to +3 and the refresher exception filter to +4. Thus normal,
   denied and failed requests have logging inside the existing server span.
2. Read `Span.current()` only; expose `X-Trace-Id` only for valid sampled context.
   Never trust an incoming X-Trace-Id or substitute correlation IDs. Add the
   correlation ID as a span attribute, bridge real IDs into MDC for text logs and
   restore previous MDC even after errors. Preserve native status/body behavior.
3. Expose X-Trace-Id alongside X-Correlation-Id in BE CORS without widening allowed
   origins, credentials, request headers or methods. The browser adds no headers,
   so this feature introduces no preflight requests.
4. Read the two response IDs independently in fetch/XHR. Missing, opaque, malformed,
   zero and unsampled IDs yield correlation-only diagnostics. Keep schema v1 and
   support historical response-header fallback without reading body streams.
5. Create a separate Tempo Explore action with the configured datasource UID and
   a validated real trace ID, bounded absolute range and no application credentials.
   Keep logs available when Tempo is not configured. Translate the action in all locales.
6. Test actual OTel servlet instrumentation, parent trace continuation, outbound
   propagation, filter ordering, response/CORS behavior, MDC cleanup, errors, disabled
   sampling, link encoding and independent fallbacks. Test offline with in-memory
   export; do not send test payloads to the production collector.
7. Run builds and relevant regression suites, inspect each diff and staged file list,
   fix findings, then commit stage 3 separately in every changed repository. Preserve
   the pre-existing BE ResourceTimingFilter index entries and any concurrent user work.

Privacy review: backend Logbook deliberately preserves raw HTTP headers/bodies,
with explicit regression tests for that policy. Changing that existing policy is
not a prerequisite for recording metadata-only in Rybbit. It is left untouched
pending the user's separate choice; Grafana access/retention must be restricted.
No new sensitive body collection, anonymous Grafana access or server secrets are added.

Stage 3 self-review and verification:
- Fixed the actual ordering collision in both Java services. No extra server span,
  request header injection, tracing dependency upgrade or executor changes.
- Tested actual MVC instrumentation with an incoming W3C parent, actual Logbook
  callbacks and the starter's Boot 4 RestTemplate customizer: one server span and
  one client span, same trace, correct parent IDs and restored MDC. Added the
  missing restclient starter to the BE API module's **test scope only**.
- BE focused tests: 36 passed, including 401/500, unsampled/no-op contexts,
  exception identity, CORS and correlation. Refresher's full selected reactor:
  observability 35, domain 1052, api-service 45 passed (1132 total, none skipped).
- Rybbit: 32 network UI/parser/link tests and 30 recorder tests passed; both
  typechecks, backend/tracker build and scoped UI lint passed. All 12 locales filled.
- Confirmed Tempo query contract against Grafana's datasource schema:
  [traceId query type and query field](https://raw.githubusercontent.com/grafana/grafana/v12.2.0/public/app/plugins/datasource/tempo/dataquery.gen.ts).
  A sampled ID is not a delivery guarantee: exporter failures, retention and
  tail-sampling can still make a valid trace unavailable.
- Existing backend raw-log policy is unchanged pending the explicit user choice.
  Production has not been changed by this implementation.

### Stage 4 — Release validation (plan to be re-analysed before implementation)

Cross-component regression tests, reproducible payload/CPU checks, deployment and
rollback instructions, and an evidence-backed production-readiness gate.

Each later section will record its fresh analysis and detailed plan before edits.
Physical iPhone validation and deployed Grafana/Tempo checks cannot be replaced
by desktop emulation or by the mere presence of running services.
