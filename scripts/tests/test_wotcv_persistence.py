import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))

from wotcv_persistence import (  # noqa: E402
    EventInvariants,
    PostgresInvariants,
    ValidationError,
    VolumeSpec,
    assert_event_invariants_not_decreased,
    assert_postgres_invariants_not_decreased,
    parse_event_invariants,
    parse_postgres_invariants,
    validate_compose_config,
    validate_container_mounts,
)


VOLUME_SPECS = (
    VolumeSpec(
        "clickhouse-data",
        "clickhouse",
        "/var/lib/clickhouse",
        "rybbit_clickhouse-data",
    ),
    VolumeSpec(
        "postgres-data",
        "postgres",
        "/var/lib/postgresql/data",
        "rybbit_postgres-data",
    ),
    VolumeSpec("redis-data", "redis", "/data", "rybbit_redis-data"),
)


def valid_compose_config():
    return {
        "name": "rybbit",
        "volumes": {
            spec.logical_name: {
                "name": spec.expected_name,
                "external": True,
            }
            for spec in VOLUME_SPECS
        },
        "services": {
            spec.service_name: {
                "volumes": [
                    {
                        "type": "volume",
                        "source": spec.logical_name,
                        "target": spec.target,
                    }
                ]
            }
            for spec in VOLUME_SPECS
        },
    }


class ComposeConfigTests(unittest.TestCase):
    def test_accepts_expected_external_volumes(self):
        validate_compose_config(valid_compose_config(), "rybbit", VOLUME_SPECS)

    def test_rejects_wrong_project(self):
        config = valid_compose_config()
        config["name"] = "rybbit-wotcv"

        with self.assertRaisesRegex(ValidationError, "Compose project"):
            validate_compose_config(config, "rybbit", VOLUME_SPECS)

    def test_rejects_wrong_volume_name(self):
        config = valid_compose_config()
        config["volumes"]["clickhouse-data"]["name"] = (
            "rybbit-wotcv_clickhouse-data"
        )

        with self.assertRaisesRegex(ValidationError, "resolves to"):
            validate_compose_config(config, "rybbit", VOLUME_SPECS)

    def test_rejects_non_external_volume(self):
        config = valid_compose_config()
        config["volumes"]["postgres-data"]["external"] = False

        with self.assertRaisesRegex(ValidationError, "must be external"):
            validate_compose_config(config, "rybbit", VOLUME_SPECS)

    def test_rejects_missing_service_mount(self):
        config = valid_compose_config()
        config["services"]["redis"]["volumes"] = []

        with self.assertRaisesRegex(ValidationError, "exactly once"):
            validate_compose_config(config, "rybbit", VOLUME_SPECS)


class ContainerMountTests(unittest.TestCase):
    def test_accepts_expected_named_volume(self):
        validate_container_mounts(
            "clickhouse",
            "rybbit",
            "rybbit",
            "rybbit_clickhouse-data",
            "/var/lib/clickhouse",
            [
                {
                    "Type": "volume",
                    "Name": "rybbit_clickhouse-data",
                    "Destination": "/var/lib/clickhouse",
                    "RW": True,
                }
            ],
        )

    def test_rejects_wrong_running_project(self):
        with self.assertRaisesRegex(ValidationError, "belongs to Compose project"):
            validate_container_mounts(
                "postgres",
                "other",
                "rybbit",
                "rybbit_postgres-data",
                "/var/lib/postgresql/data",
                [],
            )

    def test_rejects_bind_mount(self):
        with self.assertRaisesRegex(ValidationError, "named volume is required"):
            validate_container_mounts(
                "redis",
                "rybbit",
                "rybbit",
                "rybbit_redis-data",
                "/data",
                [
                    {
                        "Type": "bind",
                        "Destination": "/data",
                        "RW": True,
                    }
                ],
            )

    def test_rejects_wrong_named_volume(self):
        with self.assertRaisesRegex(ValidationError, "expected"):
            validate_container_mounts(
                "redis",
                "rybbit",
                "rybbit",
                "rybbit_redis-data",
                "/data",
                [
                    {
                        "Type": "volume",
                        "Name": "wrong_redis-data",
                        "Destination": "/data",
                        "RW": True,
                    }
                ],
            )

    def test_rejects_read_only_mount(self):
        with self.assertRaisesRegex(ValidationError, "read-only"):
            validate_container_mounts(
                "postgres",
                "rybbit",
                "rybbit",
                "rybbit_postgres-data",
                "/var/lib/postgresql/data",
                [
                    {
                        "Type": "volume",
                        "Name": "rybbit_postgres-data",
                        "Destination": "/var/lib/postgresql/data",
                        "RW": False,
                    }
                ],
            )


class EventInvariantTests(unittest.TestCase):
    def test_parses_valid_invariants(self):
        self.assertEqual(
            parse_event_invariants("12\t100\t200\t4\t6\t8\t3\t3\t2\n"),
            EventInvariants(12, 100, 200, 4, 6, 8, 3, 3, 2),
        )

    def test_accepts_new_events_without_losing_old_range(self):
        assert_event_invariants_not_decreased(
            EventInvariants(12, 100, 200),
            EventInvariants(15, 90, 250),
        )

    def test_rejects_decreased_count(self):
        with self.assertRaisesRegex(ValidationError, "count decreased"):
            assert_event_invariants_not_decreased(
                EventInvariants(12, 100, 200),
                EventInvariants(11, 100, 250),
            )

    def test_rejects_lost_oldest_events(self):
        with self.assertRaisesRegex(ValidationError, "oldest event moved forward"):
            assert_event_invariants_not_decreased(
                EventInvariants(12, 100, 200),
                EventInvariants(15, 150, 250),
            )

    def test_rejects_lost_newest_events(self):
        with self.assertRaisesRegex(ValidationError, "newest event moved backward"):
            assert_event_invariants_not_decreased(
                EventInvariants(12, 100, 200),
                EventInvariants(15, 90, 150),
            )

    def test_rejects_malformed_values(self):
        with self.assertRaisesRegex(ValidationError, "must contain"):
            parse_event_invariants("12 100")

    def test_rejects_lost_daily_sessions(self):
        with self.assertRaisesRegex(ValidationError, "daily session count decreased"):
            assert_event_invariants_not_decreased(
                EventInvariants(12, 100, 200, 4, 6, 8, 3, 3, 2),
                EventInvariants(12, 100, 200, 4, 5, 8, 3, 3, 2),
            )

    def test_rejects_lost_replay_metadata(self):
        with self.assertRaisesRegex(
            ValidationError, "replay metadata session count decreased"
        ):
            assert_event_invariants_not_decreased(
                EventInvariants(12, 100, 200, 4, 6, 8, 3, 3, 2),
                EventInvariants(12, 100, 200, 4, 6, 8, 3, 2, 2),
            )

    def test_rejects_lost_v2_replay_metadata_even_without_events(self):
        with self.assertRaisesRegex(
            ValidationError, "v2 replay metadata session count decreased"
        ):
            assert_event_invariants_not_decreased(
                EventInvariants(0, 0, 0, 0, 0, 0, 0, 0, 3),
                EventInvariants(0, 0, 0, 0, 0, 0, 0, 0, 2),
            )


class PostgresInvariantTests(unittest.TestCase):
    def test_parses_valid_invariants(self):
        self.assertEqual(
            parse_postgres_invariants("4 3\n"),
            PostgresInvariants(4, 3),
        )

    def test_accepts_new_users_and_sites(self):
        assert_postgres_invariants_not_decreased(
            PostgresInvariants(4, 3),
            PostgresInvariants(5, 4),
        )

    def test_rejects_decreased_user_count(self):
        with self.assertRaisesRegex(ValidationError, "user count decreased"):
            assert_postgres_invariants_not_decreased(
                PostgresInvariants(4, 3),
                PostgresInvariants(3, 3),
            )

    def test_rejects_decreased_site_count(self):
        with self.assertRaisesRegex(ValidationError, "site count decreased"):
            assert_postgres_invariants_not_decreased(
                PostgresInvariants(4, 3),
                PostgresInvariants(4, 2),
            )


if __name__ == "__main__":
    unittest.main()
