# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Unit tests for snapshot router capability modes."""

import pytest

from backend.exceptions import InvalidInputError
from backend.routers import snapshot
from backend.services.snapshot_service import SnapshotService


def test_readonly_snapshot_mode_allows_list_and_blocks_write(tmp_path, monkeypatch):
    storage_dir = tmp_path / "curated"
    service = SnapshotService(storage_dir=str(storage_dir))
    service.save_snapshot("Curated", {"sheets": []})

    monkeypatch.setenv("SNAPSHOT_MODE", "readonly")
    monkeypatch.setenv("CURATED_SNAPSHOT_DIR", str(storage_dir))

    items = snapshot.list_snapshots()
    assert len(items) == 1
    assert items[0].name == "Curated"

    with pytest.raises(InvalidInputError, match="read-only"):
        request = snapshot.SaveSnapshotRequest(name="Nope", configuration={"sheets": []})
        snapshot.save_snapshot(request)