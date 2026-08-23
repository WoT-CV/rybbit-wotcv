#!/usr/bin/env python3
"""Fail-closed validation for WoT-CV Compose persistence.

The module intentionally uses only the Python standard library so deployment
scripts and CI can run the same checks without installing dependencies.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Optional, Sequence, Tuple


class ValidationError(ValueError):
    """Raised when persistent storage does not match the deployment contract."""


# Replay tables have a 30-day TTL. A fixed 29-day cohort is guaranteed not to
# expire while the baseline remains below the much shorter six-hour age limit.
REPLAY_PROTECTED_WINDOW_SECONDS = 29 * 24 * 60 * 60
MAX_EVENT_INVARIANT_AGE_SECONDS = 6 * 60 * 60


@dataclass(frozen=True)
class VolumeSpec:
    logical_name: str
    service_name: str
    target: str
    expected_name: str


@dataclass(frozen=True)
class EventInvariants:
    count: int
    minimum_timestamp: int
    maximum_timestamp: int
    sessions: int = 0
    daily_sessions: int = 0
    snapshot_timestamp: int = 0
    replay_window_start_timestamp: int = 0
    protected_cohort_end_timestamp: int = 0
    replay_events: int = 0
    replay_sessions: int = 0
    replay_metadata_sessions: int = 0
    protected_replay_events: int = 0
    protected_replay_sessions: int = 0
    protected_replay_metadata_sessions: int = 0
    replay_metadata_v2_sessions: int = 0
    protected_replay_metadata_v2_sessions: int = 0


@dataclass(frozen=True)
class PostgresInvariants:
    users: int
    sites: int


def _as_mapping(value: Any, description: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ValidationError(f"{description} must be a JSON object.")
    return value


def validate_compose_config(
    config: Mapping[str, Any],
    expected_project: str,
    volume_specs: Sequence[VolumeSpec],
) -> None:
    actual_project = config.get("name")
    if actual_project != expected_project:
        raise ValidationError(
            f"Compose project is {actual_project!r}; expected {expected_project!r}."
        )

    volumes = _as_mapping(config.get("volumes"), "Compose volumes")
    services = _as_mapping(config.get("services"), "Compose services")

    for spec in volume_specs:
        volume = _as_mapping(
            volumes.get(spec.logical_name),
            f"Compose volume {spec.logical_name!r}",
        )
        if volume.get("name") != spec.expected_name:
            raise ValidationError(
                f"Compose volume {spec.logical_name!r} resolves to "
                f"{volume.get('name')!r}; expected {spec.expected_name!r}."
            )
        if volume.get("external") is not True:
            raise ValidationError(
                f"Compose volume {spec.logical_name!r} must be external."
            )

        service = _as_mapping(
            services.get(spec.service_name),
            f"Compose service {spec.service_name!r}",
        )
        service_volumes = service.get("volumes") or []
        matching_mounts = [
            mount
            for mount in service_volumes
            if isinstance(mount, Mapping)
            and mount.get("type") == "volume"
            and mount.get("source") == spec.logical_name
            and mount.get("target") == spec.target
        ]
        if len(matching_mounts) != 1:
            raise ValidationError(
                f"Compose service {spec.service_name!r} must mount volume "
                f"{spec.logical_name!r} exactly once at {spec.target!r}."
            )


def validate_container_mounts(
    service_name: str,
    actual_project: str,
    expected_project: str,
    expected_volume: str,
    target: str,
    mounts: Sequence[Mapping[str, Any]],
) -> None:
    if actual_project != expected_project:
        raise ValidationError(
            f"Running {service_name} container belongs to Compose project "
            f"{actual_project!r}; expected {expected_project!r}."
        )

    target_mounts = [mount for mount in mounts if mount.get("Destination") == target]
    if len(target_mounts) != 1:
        raise ValidationError(
            f"Running {service_name} container must have exactly one mount at "
            f"{target!r}; found {len(target_mounts)}."
        )

    mount = target_mounts[0]
    if mount.get("Type") != "volume":
        raise ValidationError(
            f"Running {service_name} container uses {mount.get('Type')!r} at "
            f"{target!r}; a named volume is required."
        )
    if mount.get("Name") != expected_volume:
        raise ValidationError(
            f"Running {service_name} container mounts volume "
            f"{mount.get('Name')!r}; expected {expected_volume!r}."
        )
    if mount.get("RW") is not True:
        raise ValidationError(
            f"Running {service_name} container mount at {target!r} is read-only."
        )


def parse_event_invariants(raw: str) -> EventInvariants:
    values = raw.strip().split()
    if len(values) != 16:
        raise ValidationError(
            "ClickHouse event invariants must contain count, min timestamp, "
            "max timestamp, sessions, daily sessions, snapshot timestamp, "
            "replay protection window start, protected cohort end, total replay "
            "events and sessions, total legacy replay metadata sessions, "
            "protected replay events and sessions, protected legacy replay "
            "metadata sessions, and total and protected v2 replay metadata "
            "sessions."
        )

    try:
        (
            count,
            minimum_timestamp,
            maximum_timestamp,
            sessions,
            daily_sessions,
            snapshot_timestamp,
            replay_window_start_timestamp,
            protected_cohort_end_timestamp,
            replay_events,
            replay_sessions,
            replay_metadata_sessions,
            protected_replay_events,
            protected_replay_sessions,
            protected_replay_metadata_sessions,
            replay_metadata_v2_sessions,
            protected_replay_metadata_v2_sessions,
        ) = map(int, values)
    except ValueError as error:
        raise ValidationError(
            "ClickHouse event invariants must contain integers."
        ) from error

    if min(
        count,
        minimum_timestamp,
        maximum_timestamp,
        sessions,
        daily_sessions,
        snapshot_timestamp,
        replay_window_start_timestamp,
        protected_cohort_end_timestamp,
        replay_events,
        replay_sessions,
        replay_metadata_sessions,
        protected_replay_events,
        protected_replay_sessions,
        protected_replay_metadata_sessions,
        replay_metadata_v2_sessions,
        protected_replay_metadata_v2_sessions,
    ) < 0:
        raise ValidationError("ClickHouse event invariants cannot be negative.")
    if count == 0 and (minimum_timestamp != 0 or maximum_timestamp != 0):
        raise ValidationError(
            "Empty ClickHouse events must report zero min and max timestamps."
        )
    if count > 0 and minimum_timestamp > maximum_timestamp:
        raise ValidationError(
            "ClickHouse minimum event timestamp cannot exceed the maximum."
        )
    if snapshot_timestamp == 0:
        raise ValidationError(
            "ClickHouse invariant snapshot timestamp must be positive."
        )
    if protected_cohort_end_timestamp > snapshot_timestamp:
        raise ValidationError(
            "ClickHouse protected cohort cannot end after its snapshot."
        )
    if replay_window_start_timestamp >= protected_cohort_end_timestamp:
        raise ValidationError(
            "ClickHouse replay protection window must start before its cohort end."
        )

    for description, protected_value, total_value in (
        ("replay events", protected_replay_events, replay_events),
        ("replay sessions", protected_replay_sessions, replay_sessions),
        (
            "legacy replay metadata sessions",
            protected_replay_metadata_sessions,
            replay_metadata_sessions,
        ),
        (
            "v2 replay metadata sessions",
            protected_replay_metadata_v2_sessions,
            replay_metadata_v2_sessions,
        ),
    ):
        if protected_value > total_value:
            raise ValidationError(
                f"Protected ClickHouse {description} cannot exceed its total."
            )

    return EventInvariants(
        count=count,
        minimum_timestamp=minimum_timestamp,
        maximum_timestamp=maximum_timestamp,
        sessions=sessions,
        daily_sessions=daily_sessions,
        snapshot_timestamp=snapshot_timestamp,
        replay_window_start_timestamp=replay_window_start_timestamp,
        protected_cohort_end_timestamp=protected_cohort_end_timestamp,
        replay_events=replay_events,
        replay_sessions=replay_sessions,
        replay_metadata_sessions=replay_metadata_sessions,
        protected_replay_events=protected_replay_events,
        protected_replay_sessions=protected_replay_sessions,
        protected_replay_metadata_sessions=protected_replay_metadata_sessions,
        replay_metadata_v2_sessions=replay_metadata_v2_sessions,
        protected_replay_metadata_v2_sessions=(
            protected_replay_metadata_v2_sessions
        ),
    )


def assert_event_invariants_not_decreased(
    before: EventInvariants,
    after: EventInvariants,
) -> None:
    expected_window_start = (
        before.protected_cohort_end_timestamp - REPLAY_PROTECTED_WINDOW_SECONDS
    )
    if before.replay_window_start_timestamp != expected_window_start:
        raise ValidationError(
            "ClickHouse replay protection window is not anchored 29 days "
            "before the baseline snapshot."
        )
    if before.protected_cohort_end_timestamp != before.snapshot_timestamp:
        raise ValidationError(
            "ClickHouse protected cohort must end at the baseline snapshot."
        )
    if after.replay_window_start_timestamp != before.replay_window_start_timestamp:
        raise ValidationError(
            "ClickHouse replay protection window changed during deployment."
        )
    if (
        after.protected_cohort_end_timestamp
        != before.protected_cohort_end_timestamp
    ):
        raise ValidationError(
            "ClickHouse protected cohort end changed during deployment."
        )

    invariant_age = after.snapshot_timestamp - before.snapshot_timestamp
    if invariant_age < 0:
        raise ValidationError(
            "ClickHouse invariant snapshot timestamp moved backward during deployment."
        )
    if invariant_age > MAX_EVENT_INVARIANT_AGE_SECONDS:
        raise ValidationError(
            "ClickHouse event baseline is older than the six-hour deployment "
            "safety limit; capture a fresh baseline."
        )

    if after.count < before.count:
        raise ValidationError(
            f"ClickHouse event count decreased from {before.count} to {after.count}."
        )
    if before.count > 0:
        if after.count == 0:
            raise ValidationError("ClickHouse events disappeared after deployment.")
        if after.minimum_timestamp > before.minimum_timestamp:
            raise ValidationError(
                "ClickHouse oldest event moved forward from "
                f"{before.minimum_timestamp} to {after.minimum_timestamp}."
            )
        if after.maximum_timestamp < before.maximum_timestamp:
            raise ValidationError(
                "ClickHouse newest event moved backward from "
                f"{before.maximum_timestamp} to {after.maximum_timestamp}."
            )

    for description, before_value, after_value in (
        ("session count", before.sessions, after.sessions),
        ("daily session count", before.daily_sessions, after.daily_sessions),
        (
            "protected replay event count",
            before.protected_replay_events,
            after.protected_replay_events,
        ),
        (
            "protected replay session count",
            before.protected_replay_sessions,
            after.protected_replay_sessions,
        ),
        (
            "protected legacy replay metadata session count",
            before.protected_replay_metadata_sessions,
            after.protected_replay_metadata_sessions,
        ),
        (
            "protected v2 replay metadata session count",
            before.protected_replay_metadata_v2_sessions,
            after.protected_replay_metadata_v2_sessions,
        ),
    ):
        if after_value < before_value:
            raise ValidationError(
                f"ClickHouse {description} decreased from "
                f"{before_value} to {after_value}."
            )


def parse_postgres_invariants(raw: str) -> PostgresInvariants:
    values = raw.strip().split()
    if len(values) != 2:
        raise ValidationError(
            "PostgreSQL invariants must contain user and site counts."
        )

    try:
        users, sites = map(int, values)
    except ValueError as error:
        raise ValidationError(
            "PostgreSQL invariants must contain integers."
        ) from error

    if min(users, sites) < 0:
        raise ValidationError("PostgreSQL invariants cannot be negative.")

    return PostgresInvariants(users, sites)


def assert_postgres_invariants_not_decreased(
    before: PostgresInvariants,
    after: PostgresInvariants,
) -> None:
    for description, before_value, after_value in (
        ("user count", before.users, after.users),
        ("site count", before.sites, after.sites),
    ):
        if after_value < before_value:
            raise ValidationError(
                f"PostgreSQL {description} decreased from "
                f"{before_value} to {after_value}."
            )


def _volume_specs(args: argparse.Namespace) -> Tuple[VolumeSpec, ...]:
    return (
        VolumeSpec(
            "clickhouse-data",
            "clickhouse",
            "/var/lib/clickhouse",
            args.clickhouse_volume,
        ),
        VolumeSpec(
            "postgres-data",
            "postgres",
            "/var/lib/postgresql/data",
            args.postgres_volume,
        ),
        VolumeSpec("redis-data", "redis", "/data", args.redis_volume),
    )


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    config_parser = subparsers.add_parser("validate-config")
    config_parser.add_argument("--config", type=Path, required=True)
    config_parser.add_argument("--expected-project", required=True)
    config_parser.add_argument("--clickhouse-volume", required=True)
    config_parser.add_argument("--postgres-volume", required=True)
    config_parser.add_argument("--redis-volume", required=True)

    container_parser = subparsers.add_parser("validate-container")
    container_parser.add_argument("--service", required=True)
    container_parser.add_argument("--actual-project", required=True)
    container_parser.add_argument("--expected-project", required=True)
    container_parser.add_argument("--expected-volume", required=True)
    container_parser.add_argument("--target", required=True)
    container_parser.add_argument("--mounts-json", required=True)

    events_parser = subparsers.add_parser("compare-events")
    events_parser.add_argument("--before", required=True)
    events_parser.add_argument("--after", required=True)

    postgres_parser = subparsers.add_parser("compare-postgres")
    postgres_parser.add_argument("--before", required=True)
    postgres_parser.add_argument("--after", required=True)

    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = _build_parser().parse_args(argv)

    try:
        if args.command == "validate-config":
            with args.config.open(encoding="utf-8") as stream:
                config = _as_mapping(json.load(stream), "Compose configuration")
            validate_compose_config(
                config,
                args.expected_project,
                _volume_specs(args),
            )
            print("Compose persistence validation passed.")
        elif args.command == "validate-container":
            parsed_mounts = json.loads(args.mounts_json)
            if not isinstance(parsed_mounts, list):
                raise ValidationError("Docker mounts must be a JSON array.")
            mounts = [
                _as_mapping(mount, "Docker mount") for mount in parsed_mounts
            ]
            validate_container_mounts(
                args.service,
                args.actual_project,
                args.expected_project,
                args.expected_volume,
                args.target,
                mounts,
            )
            print(f"{args.service} persistence validation passed.")
        elif args.command == "compare-events":
            before = parse_event_invariants(args.before)
            after = parse_event_invariants(args.after)
            assert_event_invariants_not_decreased(before, after)
            print(
                "ClickHouse event invariants preserved "
                f"(events {before.count} -> {after.count}, "
                f"sessions {before.sessions} -> {after.sessions}, "
                f"TTL replay events {before.replay_events} -> "
                f"{after.replay_events}, protected replay events "
                f"{before.protected_replay_events} -> "
                f"{after.protected_replay_events}, protected replay metadata "
                f"sessions v1 {before.protected_replay_metadata_sessions} -> "
                f"{after.protected_replay_metadata_sessions}, v2 "
                f"{before.protected_replay_metadata_v2_sessions} -> "
                f"{after.protected_replay_metadata_v2_sessions})."
            )
        elif args.command == "compare-postgres":
            before = parse_postgres_invariants(args.before)
            after = parse_postgres_invariants(args.after)
            assert_postgres_invariants_not_decreased(before, after)
            print(
                "PostgreSQL invariants preserved "
                f"(users {before.users} -> {after.users}, "
                f"sites {before.sites} -> {after.sites})."
            )
        else:  # pragma: no cover - argparse enforces known commands.
            raise AssertionError(f"Unsupported command: {args.command}")
    except (json.JSONDecodeError, OSError, ValidationError) as error:
        print(f"Persistence validation failed: {error}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
