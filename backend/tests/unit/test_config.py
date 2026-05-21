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
    assert config.connector_allowlist() == ["csv", "clickhouse"]


def test_public_app_config_does_not_expose_secret_connection_values(monkeypatch):
    monkeypatch.setenv("APP_MODE", "demo")
    monkeypatch.setenv("DEMO_CLICKHOUSE_PASSWORD", "super-secret")

    payload = config.public_app_config()

    assert payload["isDemoMode"] is True
    assert "super-secret" not in str(payload)