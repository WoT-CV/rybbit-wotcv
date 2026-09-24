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

### Later stages

- Stage 2: metadata-only capture, no body reads/clones, privacy-safe network URLs,
  explicit capture policy and FE rollout configuration; old recordings retained.
- Stage 3: real OpenTelemetry request traces, response trace IDs, CORS, propagation,
  trace/log context and Tempo links; no synthetic IDs presented as real traces.
- Stage 4: cross-component regression tests, reproducible payload/CPU checks,
  deployment/rollback instructions and a truthful production-readiness gate.

Each later section will record its fresh analysis and detailed plan before edits.
Physical iPhone validation and deployed Grafana/Tempo checks cannot be replaced
by desktop emulation or by the mere presence of running services.
