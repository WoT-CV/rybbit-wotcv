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

### Stage 4 — Release validation

Fresh analysis (before implementation): the separately tested recorder and UI need
a shared regression contract for new metadata and historical full payloads. The
local anonymized large replay has 7631 events; its network events represent only
about 8.36% of serialized event bytes, while snapshots/mutations represent about
85.95%. Payload savings must not be described as a proportional whole-replay RAM
or iPhone stability improvement. The present solution also deliberately depends
on site-specific Grafana configuration and the new tracker being deployed before FE.

Implementation plan:

1. Add a cross-component test: normalized response IDs -> metadata allowlist ->
   version-1 JSON -> playback parser -> bounded Loki/Tempo links. Include metadata
   privacy canaries and an unchanged historical recording with its original body.
2. Add an offline, read-only benchmark using the actual compiled metadata projector.
   Support a synthetic default fixture and an explicitly supplied local event array.
   Report aggregate bytes, compressed bytes and median projection/serialization CPU;
   never print bodies, URLs, headers, IDs or upload recordings. Do not rewrite history.
3. Re-run all Rybbit and FE unit tests, relevant Java reactor suites, typechecks,
   scoped lint, production builds and tracker reproducibility. Inspect failures to
   distinguish new defects from existing tooling/environment problems. Fix scoped
   findings, rerun affected checks and record exact limits instead of bypassing tests.
4. Document deployment order (Rybbit -> Java services -> Grafana config -> FE),
   authenticated smoke tests, CORS/no-new-preflight, missing-trace behavior, sampling,
   retention, privacy, rollback and mixed-version behavior. Keep secrets out of docs.
5. Review the complete staged result, history/working trees and user-owned changes,
   then commit stage 4. Re-review all stages and add a named corrective stage if
   a material implementation defect remains.
6. Separate code completion from production acceptance: existing-account Grafana
   navigation, live export into Tempo and physical iPhone playback are explicit
   release gates. No deployment, credentials extraction or production data mutation.

Self-review finding: a typo/empty manually supplied script-tag mode previously
left legacy full collection in effect. Tighten only explicit invalid values to
metadata; trim/case-normalize valid values; preserve absent attribute compatibility.
Add regression cases and rebuild/retest the generated tracker before the stage commit.

### Stage 4 self-review and results

- Cross-component tests verify capture -> serialization -> playback -> Loki/Tempo,
  including historical body compatibility and absent CORS trace exposure.
- Real query-cache tests verify signed-out behavior, immediate logout hiding,
  site/account isolation while a new query is pending, and 403/503 fallbacks.
- Full Rybbit client suite: 639 passed. Full Rybbit backend suite, rerun after the
  fail-closed script-tag correction: 2303 passed, 16 existing skipped tests. Both
  typechecks and backend/client production builds passed.
- Full WoT-CV FE suite: 1811 passed, 1 existing skipped test; typecheck and production
  build passed. Existing large-chunk warnings are not evidence of a new regression.
- BE selected full Maven reactor: observability 49, domain 851, api-shared 120
  (1020 passed, none skipped). Refresher: observability 35, domain 1052, api-service
  45 (1132 passed, none skipped). Both complete application reactors packaged with
  `-DskipTests`; that packaging also compiles other modules' tests, but is not a
  claim that every other module's tests or infrastructure integration tests ran.
- Offline real-browser QA passed in Chromium and WebKit at a 390 x 844 touch/mobile
  viewport: fetch with a Request object, XHR, cross-origin responses, an unexposed
  trace header, 2,420,000-byte bodies, zero Request/Response clones, zero new OPTIONS
  requests, unchanged application body reads and restored native methods on cleanup.
  The recorder still reads the two allowlisted correlation headers, not the complete
  HTTP header sets. The browser test contacts two temporary loopback servers only.
- Reviewed privacy caps, all observer paths/unload, metadata size validation,
  exact-origin/site authorization, script/API precedence, logout behavior, time
  bounds, query escaping, translations, real trace lineage and raw-log policy.
- Review corrections: invalid explicit tracker modes fail closed to metadata;
  offline browser QA rejects engines that do not support its mobile options and
  handles loopback listen failures. Generated tracker files are rebuilt, not edited.
- No migration, dependency/version upgrade, new exporter or Rybbit-to-Grafana proxy.
  No production mutation or `git push` was performed by this implementation.

#### Repeatable local checks

From the Rybbit repository with locked dependencies installed:

```powershell
pnpm test
pnpm typecheck
pnpm --filter rybbit-backend build
pnpm --filter client build
node server/scripts/benchmark-network-replay.mjs
# Optional, read-only aggregate projection of a local rrweb event array:
node server/scripts/benchmark-network-replay.mjs C:/path/to/anonymized-events.json
# Reuse the existing WoT-CV FE Playwright installation; do not auto-upgrade dependencies.
$env:RYBBIT_PLAYWRIGHT_PACKAGE = 'C:/PROJECTS/wot-cv-fe/node_modules/@playwright/test'
$env:RYBBIT_QA_BROWSER = 'chromium'
node server/scripts/test-network-replay-browser.mjs
$env:RYBBIT_QA_BROWSER = 'webkit'
node server/scripts/test-network-replay-browser.mjs
```

The browser engines must already be installed for the matching Playwright package.
`pnpm --filter rybbit-backend check:analytics` rebuilds the tracker and checks `git
diff` against the index. It must be run with the intended generated bundles staged
or committed; an unstaged source/bundle update legitimately fails that comparison.
Do not discard the bundles or weaken this check to make it green.

#### Measured payload impact (offline, one local fixture)

| Input                                        | Full event JSON | Metadata projection | Reduction |
| -------------------------------------------- | --------------: | ------------------: | --------: |
| Synthetic 500 network requests               |     2,600,281 B |           266,781 B |    89.74% |
| Large recording, all 7631 events             |    21,762,744 B |        20,693,424 B |     4.91% |
| Network part of that recording, 917 requests |     1,819,840 B |           750,520 B |    58.76% |
| Large recording, all events gzip             |     1,811,360 B |         1,795,593 B |     0.87% |

On that local run median projection time was 1.219 ms and serialization changed
from 28.025 to 26.889 ms (7 timed iterations after warmup). These are Node/offline
measurements, not browser recording CPU, heap usage, production throughput or
iPhone playback measurements. Historical recordings were not changed. Network
events are only about 8.36% of this recording; DOM snapshots/mutations dominate.
Avoid promising an 89% reduction for an entire real session or a Safari crash fix.

## Controlled rollout runbook

### 0. Release inventory and prerequisites

1. Record reviewed commit IDs, running image IDs, current tracker asset hash,
   site network configuration and FE release/build environment. Keep configuration
   backups in the deployment secret store, not source control or a pasted log.
2. Verify the numeric Rybbit site ID and exact API origin, production service name
   and deployment environment labels in Loki. Confirm the Grafana base URL,
   organization ID and **datasource UIDs**, separately for Loki and Tempo. Display
   names and example UIDs above are not sufficient. Use an existing authorized
   Grafana account; do not extract provisioning credentials or enable anonymous access.
3. Confirm the established OTel collector/exporter, sampling and retention settings.
   Keep them unchanged unless separately reviewed; tracing must not become a new
   unbounded log store. Correlation IDs belong in log fields/span attributes, not
   high-cardinality metric labels or new Loki stream labels.
4. Confirm that authenticated log viewers are allowed to see the existing backend
   raw HTTP logs. This feature does not mask their bodies or Authorization/Cookie
   fields; the current explicit raw-log policy is unchanged pending a separate decision.
   There is no requirement to keep full Rybbit network capture while making that decision.
5. Run staging first. Keep normal application health/error-rate monitoring and
   rollback artifacts available. These changes require no new database migration.

### 1. Deploy Rybbit first

1. Deploy the reviewed backend **and** replay UI together through the existing
   deployment procedure. Confirm the health git SHA, images and tracking script
   content, including any existing asset cache/proxy. A package version alone does
   not distinguish these fork changes.
2. Existing sites default to their legacy behavior when `captureMode` is absent;
   the new recorder understands the metadata cap without forcing replay on.
3. On the intended site, use the existing authorized site-configuration API if a
   server-side metadata cap is required. Its partial update is
   `PUT /api/sites/<siteId>/config` with
   `{"networkReplayConfig":{"captureMode":"metadata"}}`. This requires the site's
   settings-write permission, not merely replay-read permission. Preserve other
   limits/flags and do not turn on a previously disabled recorder. The tracking API
   returns this config under `networkReplay` (a different field name); the existing
   UI toggle controls enablement, not the capture mode. Metadata forcibly disables
   request/response body and full-header collection.
4. With a new controlled recording verify fetch, XHR and Resource Timing records:
   `captureMode=metadata`, empty header maps, absent bodies/error messages/stack,
   URLs without query, fragment or userinfo, and retained safe correlation IDs.
   Method, origin/path, status, timing and sizes remain. Paths and DOM may still
   contain personal identifiers; this is not whole-session anonymization.
5. Open a historical full recording. Its bodies must still be readable; do not
   retroactively rewrite it, truncate it or change retention as part of this rollout.

### 2. Deploy Java trace response changes

1. Deploy BE and refresher independently using their normal pipelines. Keep existing
   OTel starter/exporter settings, HTTP contracts and dedicated reserve executors.
2. Make a permitted, non-mutating API GET from the real FE origin. Verify status/body
   are unchanged and CORS exposes X-Correlation-Id and X-Trace-Id on allowed origins.
   The recorder adds no request headers, so it must not cause additional preflights.
3. For a sampled request compare the exact response X-Trace-Id with the server span
   in Tempo and trace_id in its Loki request/response logs. Find the same log pair by
   `http_correlation_id`. A sampled header by itself does not prove export succeeded.
4. On an existing safe BE -> refresher flow verify the outbound client and refresher
   server spans continue the same W3C trace with correct parentage. Do not trigger
   business mutations just to produce a trace. Deferred scheduler work is not
   automatically promised to be a synchronous child of that HTTP request.
5. Check representative 401/500 and unsampled/missing-trace behavior in staging.
   Missing OTel context must not break HTTP. Missing trace exposure leaves log
   correlation usable. Never synthesize a Tempo ID from a correlation ID.

### 3. Enable only verified Grafana profiles

1. Supply `WOTCV_REPLAY_OBSERVABILITY_PROFILES` to the Rybbit backend environment,
   using verified per-site/origin values and optional `tempoDatasourceUid`. Recreate
   or redeploy that backend through the established procedure to apply the env.
   Leave `[]` to disable links. No access token, password or Grafana API key belongs here.
2. With an authorized site replay reader request `GET /api/sites/<siteId>/replay-observability`.
   Confirm only this site's profiles, `Cache-Control: private, no-store`, and no
   credentials. Public replay permission alone must not expose the profiles. A
   malformed environment value returns a generic 503 and disables the links.
3. In an authenticated replay, select a request for the exact configured API origin.
   Open its log link in a separate tab: check datasource, service/environment,
   correlation filter, time window and Grafana login/access. Then open its trace
   link and confirm the exact same request's real trace ID. No Grafana requests are
   sent while the tracked end user browses the application.
4. Check an unconfigured origin, missing IDs, other site and signed-out/public replay:
   no observability links/configuration should be exposed for unauthorized access.
   Verify logout before handing the browser to another account.
5. A trace may be absent due to sampling, export failure or expired retention. Logs
   and replay retention can also differ. Do not increase permissions or fabricate
   IDs to make an empty Grafana result disappear.

### 4. Deploy FE and accept the canary

1. Build FE with the default metadata mode, or explicitly
   `VITE_RYBBIT_NETWORK_REPLAY_MODE=metadata`. Verify the actual served HTML has
   `data-replay-network-mode="metadata"`, correct site/host and sensitive input masking.
2. Refresh already open pages to load the new tracker/config. Old live documents
   keep their already loaded code until reload; a server deployment cannot remotely
   replace their in-memory recorder. Clear only affected asset caches if needed,
   not all user storage, sessions or application state.
3. Check consent/opt-out, login/logout identity, payment callback exclusions, normal
   API behavior and a new metadata recording. Preserve the existing business events.
4. Compare **new equivalent recordings** and traffic/request counts during a limited
   canary. Inspect browser CPU/heap/network with the recorder on/off where practical;
   do not use the offline JSON benchmark as proof of runtime memory savings.
5. On a physical iPhone repeat the previously failing replay scenario: seek around
   the reported point, speed up, change orientation, background/foreground the tab,
   and test both a new metadata recording and the old large full recording. Record
   iOS/browser version, recording ID, time and outcome. Avoid sharing raw recordings
   with credentials. Desktop WebKit cannot replace this acceptance check.

## Rollback and mixed-version rules

- **Broken links/export:** set profiles to `[]` (or omit Tempo UID for logs-only),
  redeploy backend configuration and re-open/refetch the viewer. Metadata collection
  keeps working; there is no need to re-enable bodies because Grafana is unavailable.
- **Java regression:** roll back the affected Java release through its normal
  pipeline. Correlation-only recordings/UI remain compatible. No schema rollback.
- **FE regression:** roll back FE independently, retaining the new Rybbit tracker and
  a server-side metadata cap. An older FE may omit the cap; server policy therefore
  provides privacy protection across mixed FE versions.
- **Explicit return to full capture:** requires a conscious privacy decision. Build
  FE with `VITE_RYBBIT_NETWORK_REPLAY_MODE=full` and adjust the authorized server policy
  to full if necessary; normalized metadata configs have all four capture flags false,
  so those flags require explicit re-enabling. A FE `full` cap cannot weaken the server.
- **Old Rybbit tracker:** it ignores the new script-tag mode. Do not call a downgrade
  privacy-safe merely because new FE still emits the attribute. Prefer keeping the
  new tracker; otherwise disable network capture on the affected site before rollback
  and verify the old effective configuration. Previously open pages still need reload.
- Leave historical recordings, backups, database schemas, input masking, consent and
  existing identifiers intact. No mass delete, migration rollback, force push or data
  rewriting is needed for this integration.

## Release decision

The four implementation stages and local validation are complete; controlled
staging/canary rollout can start with the runbook above. This is **not an unconditional
production acceptance**. Real datasource values/Grafana account click-through,
end-to-end production trace export and physical iPhone playback remain external
acceptance gates. The read-only production observation saw only stage 1 deployed;
it must not be reported as proof that stages 2-4 are running. No production deployment
or push has been done by this task. Existing backend raw-log retention/access and the
separate masking-policy choice remain the operator's responsibility.
