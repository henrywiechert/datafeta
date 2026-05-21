# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Unit tests for hosted-demo router behavior."""

from backend.routers.demo import list_demo_datasets


def test_demo_catalog_is_empty_when_unconfigured(monkeypatch):
    monkeypatch.setenv("DEMO_DATASETS_ENABLED", "true")
    monkeypatch.delenv("DEMO_DATASETS_JSON", raising=False)

    assert list_demo_datasets() == {"datasets": []}