# Cutover: `session_replay_metadata` → `session_replay_metadata_v2`

The old table is a `ReplacingMergeTree` holding one cumulative row per session.
Keeping that row current meant every replay batch re-read the whole session
(`SELECT MIN/MAX/COUNT/SUM … FROM session_replay_events WHERE session_id = …`)
and rewrote it. In one six-day window that read scanned **818 billion rows —
76% of everything the cluster read** — and the rewrites left **2.5 million
single-row parts**.

`session_replay_metadata_v2` is an `AggregatingMergeTree`. Each batch inserts
only what it observed and the engine combines rows at merge time, so ingest
never reads back. Column names and their post-merge meanings are unchanged;
readers already used `FINAL`, which is all that is needed.

## Known limitation: snapshot columns merge independently

`page_url`, the geo fields, `browser`, `language` and the rest use
`SimpleAggregateFunction(anyLast, …)`, so each one merges on its own. The old
`ReplacingMergeTree(created_at)` picked one whole winning row, so a session
whose batches disagreed always showed a single coherent snapshot; the new table
can assemble one from several batches.

Measured over 30 days of production, of the 423 sessions carrying more than one
metadata version:

| field | sessions that differed |
| --- | --- |
| `page_url` | 62 |
| `screen_width` / `screen_height` | 28 / 32 |
| `region`, `city`, `lat` | 18 |
| `language` | 13 |
| `country` | 11 |
| `browser`, `operating_system`, `device_type`, `channel`, `hostname`, `referrer`, `user_id` | 0 |

`screen_width`/`screen_height` are unaffected — they use `max`, which is what
the old code computed anyway.

The geo group is the real exposure: `country`, `region`, `city` and `lat`/`lon`
are only meaningful together, and roughly 4% of multi-version sessions could
show a city and a country taken from different batches.

**This was weighed and accepted in August 2026.** The exposure is narrow, the
affected fields are all still true of the session, and the alternatives cost
more than the defect. The rest of this section records what the options were, so
the decision can be revisited if mixed geo ever turns out to mislead someone.

Making the snapshot coherent means versioning it as a unit — either one
`SimpleAggregateFunction(max, Tuple(version, …))`, or `argMaxState` columns read
with `argMaxMerge` and `GROUP BY`. Both change every read site, and the tuple
form carries a sharp edge: `SELECT snapshot.page_url FROM … FINAL` silently
returns the *unmerged* value, because ClickHouse resolves the named element as a
subcolumn read and skips the merge. Positional access (`snapshot.2`) merges
correctly, as does selecting the whole tuple in a subquery first.

## Columns that are gone

Two columns are gone:

- `duration_ms` — derived at read time as
  `dateDiff('millisecond', start_time, end_time)`, because a single batch only
  knows its own slice of the session. `start_time`/`end_time` are
  `DateTime64(3)` for exactly this reason: at second resolution a 900 ms replay
  would derive a duration of 0.
- `created_at` — there is no version column to order by any more.

The application creates the new table on boot. The steps below move the
existing data across and are **not** run by the app.

## Rollout modes

`REPLAY_METADATA_MODE` is fail-closed and accepts exactly three values:

| mode | reads | writes | purpose |
| --- | --- | --- | --- |
| `v1` | legacy | legacy | safe default; creates v2 but does not use it |
| `dual` | v2 | legacy and v2 | verified observation and rollback window |
| `v2` | v2 | v2 | final state after the rollback window closes |

An unset value means `v1`; an unknown value prevents the backend from starting.
The application never backfills, truncates, or drops either table automatically.

## 1. Deploy in `v1`

Take a ClickHouse backup and deploy with this explicit setting:

```dotenv
REPLAY_METADATA_MODE=v1
```

This boot creates `session_replay_metadata_v2`, while production reads and
writes stay on the legacy table. Verify both facts before proceeding:

```sql
EXISTS TABLE session_replay_metadata_v2;

SELECT count() AS v2_rows
FROM session_replay_metadata_v2 FINAL;
```

For a first attempt `v2_rows` must be zero. If it is not, stop and determine
whether the table contains an earlier backfill or real dual/v2 writes. Do not
append another backfill and do not truncate data of unknown provenance.

## 2. Quiesce replay ingest and backfill once

Temporarily block `POST /api/session-replay/record/*` at the reverse proxy (or
stop the backend for a maintenance window), then wait for in-flight requests to
finish. Keep ordinary ClickHouse background merges running. Confirm that the
v2 table is still empty immediately before the insert.

Run the following statement exactly once while replay ingest is quiesced:

```sql
INSERT INTO session_replay_metadata_v2
SELECT
  site_id, session_id, user_id, identified_user_id,
  start_time,
  -- The old bounds are second-resolution but the old `duration_ms` was exact,
  -- so rebuild `end_time` from it rather than copying the rounded column —
  -- otherwise every historical replay's duration is re-derived to the second.
  if(duration_ms IS NULL,
     CAST(toDateTime64(end_time, 3) AS Nullable(DateTime64(3))),
     CAST(toDateTime64(start_time, 3) + toIntervalMillisecond(assumeNotNull(duration_ms)) AS Nullable(DateTime64(3)))) AS end_time,
  event_count, compressed_size_bytes,
  page_url, country, region, city, lat, lon,
  browser, browser_version, operating_system, operating_system_version,
  language, screen_width, screen_height, device_type,
  channel, hostname, referrer, has_replay_data
FROM session_replay_metadata
FINAL
WHERE start_time >= now() - INTERVAL 30 DAY;
```

`start_time` still lands on a whole second for backfilled rows, because that is
all the old table recorded. Rows written after the deploy carry true
millisecond bounds on both ends.

`FINAL` matters: without it the old table's superseded versions are copied too,
and because the new engine **sums** `event_count` rather than replacing it,
every session would be inflated by its own history.

For the same reason this statement is **not idempotent**. Running it twice
doubles `event_count` and `compressed_size_bytes` for every session. If it is
interrupted, keep ingest blocked and restore the empty v2 table from the
pre-rollout backup before retrying. Never use an unconditional `TRUNCATE` after
dual or v2 writes may have started.

The 30-day bound matches the table's TTL; older rows would be deleted on the
next TTL pass anyway.

## 3. Verify before enabling v2 reads

Because ingest is blocked, both snapshots must agree exactly:

```sql
SELECT count() AS sessions, sum(event_count) AS events
FROM session_replay_metadata FINAL
WHERE start_time >= now() - INTERVAL 30 DAY;

SELECT count() AS sessions, sum(event_count) AS events
FROM session_replay_metadata_v2 FINAL
WHERE start_time >= now() - INTERVAL 30 DAY;
```

Also compare every session rather than relying only on equal totals:

```sql
WITH
  legacy AS (
    SELECT site_id, session_id, event_count, compressed_size_bytes,
           start_time, duration_ms
    FROM session_replay_metadata FINAL
    WHERE start_time >= now() - INTERVAL 30 DAY
  ),
  v2 AS (
    SELECT site_id, session_id, event_count, compressed_size_bytes,
           start_time,
           dateDiff('millisecond', start_time, end_time) AS duration_ms
    FROM session_replay_metadata_v2 FINAL
    WHERE start_time >= now() - INTERVAL 30 DAY
  )
SELECT
  countIf(legacy.session_id = '') AS missing_in_v1,
  countIf(v2.session_id = '') AS missing_in_v2,
  countIf(legacy.event_count != v2.event_count) AS event_count_mismatches,
  countIf(legacy.compressed_size_bytes != v2.compressed_size_bytes) AS size_mismatches,
  countIf(legacy.duration_ms != v2.duration_ms) AS duration_mismatches
FROM legacy
FULL OUTER JOIN v2 USING (site_id, session_id);
```

Every result must be zero. Check several real replays in the UI, including a
multi-batch replay and one with an identified user. Keep ingest blocked if any
check differs.

## 4. Enable `dual` and open the rollback window

Set `REPLAY_METADATA_MODE=dual`, recreate only the backend, verify health and
then unblock the replay endpoint. In this mode new batches update both tables,
but all replay readers use v2. Monitor:

- replay list, detail, export and deletion;
- usage/quota calculations and session `has_replay` flags;
- per-session counts in both metadata tables;
- ClickHouse errors, parts and merge backlog;
- old cumulative ingest query cost, which remains until the switch to `v2`.

Rollback during this window is lossless: block replay ingest, set the mode back
to `v1`, recreate the backend, verify health, and unblock ingest. Do not modify
either table.

## 5. Switch to `v2`

After the agreed observation period and a fresh backup, set
`REPLAY_METADATA_MODE=v2` and recreate only the backend. The legacy table now
stops receiving new batches, so changing back to `v1` later is no longer a
lossless rollback without a separate, reviewed reverse backfill.

Only in `v2` mode should the cumulative legacy read disappear from ingest:

```sql
SELECT count()
FROM system.query_log
WHERE event_time > now() - INTERVAL 10 MINUTE
  AND query LIKE '%FROM session_replay_events%'
  AND query LIKE '%compressed_size_bytes%';
```

Expect zero after excluding manual/operator queries.

## 6. Keep both tables

Do **not** drop `session_replay_metadata` or `session_replay_metadata_v2` in this
release. Deletion, telemetry, admin diagnostics and deployment invariants
intentionally reference both tables, and startup keeps both schemas available.
Removing the legacy table requires a separate cleanup release and its own
rollback plan after all retained legacy rows have expired.

---

# Related: clearing impossible partitions

Replay event timestamps come from the browser, so devices with broken clocks
wrote rows dated 2032, 2035, 2064, 2076 and 2090. Those partitions grow the
partition list permanently and, because the TTL is `toDateTime(start_time) + 30 DAY`, they
never expire.

Ingest now corrects this (`server/src/services/replay/replayClockSkew.ts`): a
batch whose median timestamp is more than a day ahead, or more than 30 days
behind, is shifted onto server time as a whole, preserving the gaps between
events so playback still reconstructs. **No new impossible partitions are
created after the deploy.**

The existing ones still need removing. List them first:

```sql
SELECT table, partition, sum(rows) AS rows, count() AS parts
FROM system.parts
WHERE active AND database = currentDatabase()
  AND table IN ('session_replay_events', 'session_replay_metadata_v2')
  AND partition > formatDateTime(now() + INTERVAL 2 MONTH, '%Y%m')
GROUP BY table, partition
ORDER BY table, partition;
```

Then drop each one by name — a few hundred rows of unplayable recordings from
devices whose clocks were decades out:

```sql
ALTER TABLE session_replay_events DROP PARTITION '209007';
```

Check the listing rather than copying partition ids from here; the set will
have changed.
