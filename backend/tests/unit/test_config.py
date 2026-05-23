# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Unit tests for runtime app configuration helpers."""

from backend import config


def test_standard_defaults_are_writable_and_unrestricted(monkeypatch):
    monkeypatch.delenv("APP_MODE", raising=False)
    monkeypatch.delenv("SNAPSHOT_MODE", raising=False)
    monkeypatch.delenv("CONNECTOR_ALLOWLIST", raising=False)

    assert config.app_mode() == "standard"
    assert config.snapshot_mode() == "writable"
    assert config.snapshots_writable() is True
    assert config.connector_allowlist() is None


def test_demo_defaults_are_readonly_with_safe_connectors(monkeypatch):
    monkeypatch.setenv("APP_MODE", "demo")
    monkeypatch.delenv("SNAPSHOT_MODE", raising=False)
    monkeypatch.delenv("CONNECTOR_ALLOWLIST", raising=False)

    assert config.is_demo_mode() is True
    assert config.snapshot_mode() == "readonly"
    assert config.snapshots_writable() is False
    assert config.connector_allowlist() == ["csv"]


def test_demo_connector_allowlist_keeps_manual_connectors_file_only(monkeypatch):
    monkeypatch.setenv("APP_MODE", "demo")
    monkeypatch.setenv("CONNECTOR_ALLOWLIST", "csv,clickhouse,kaggle")

    assert config.connector_allowlist() == ["csv"]
    assert config.is_connector_allowed("csv") is True
    assert config.is_connector_allowed("clickhouse") is False
    assert config.is_connector_allowed("kaggle") is False


def test_public_app_config_does_not_expose_secret_connection_values(monkeypatch):
    monkeypatch.setenv("APP_MODE", "demo")
    monkeypatch.setenv("DEMO_CLICKHOUSE_PASSWORD", "super-secret")

    payload = config.public_app_config()

    assert payload["isDemoMode"] is True
    assert "super-secret" not in str(payload)


def test_demo_dataset_catalog_accepts_optional_snapshot_id(monkeypatch):
    monkeypatch.setenv(
        "DEMO_DATASETS_JSON",
        '[{"id":"BoxPlots","database":"db","table":"table","snapshotId":"snapshot-1"}]',
    )

    assert config.demo_dataset_catalog()[0]["snapshotId"] == "snapshot-1"