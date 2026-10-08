# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Unit tests for backend session state helpers."""

from unittest.mock import Mock

import pytest

from backend.models.data_source import ConnectionDetails
from backend.session_state import (
    ConnectionStateManager,
    StagedUpload,
    _session_storage_lock,
    cleanup_session,
    session_storage,
)


@pytest.fixture(autouse=True)
def reset_session_storage():
    """Keep the global session store isolated across tests."""
    with _session_storage_lock:
        session_storage.clear()
    yield
    with _session_storage_lock:
        session_storage.clear()


def test_clear_state_keeps_staged_uploads(tmp_path):
    """A connect clears the previous connection before consuming staged uploads."""
    manager = ConnectionStateManager()
    manager.staged_uploads["u1"] = StagedUpload(path=str(tmp_path / "a.xlsx"), original_filename="a.xlsx")

    manager.clear_state()

    assert "u1" in manager.staged_uploads


def test_cleanup_session_deletes_staged_uploads(tmp_path):
    staged_path = tmp_path / "pending.xlsx"
    staged_path.write_bytes(b"PK")
    manager = ConnectionStateManager()
    manager.staged_uploads["u1"] = StagedUpload(path=str(staged_path), original_filename="pending.xlsx")

    with _session_storage_lock:
        session_storage["session-1:tab-a"] = manager

    assert cleanup_session("session-1:tab-a") is True
    assert not staged_path.exists()


def test_cleanup_session_returns_false_for_missing_key():
    assert cleanup_session("missing:tab") is False


def test_cleanup_session_disconnects_connector_and_deletes_paths(tmp_path):
    file_path = tmp_path / "temp.csv"
    file_path.write_text("a,b\n1,2\n")
    dir_path = tmp_path / "tempdir"
    dir_path.mkdir()
    nested_file = dir_path / "x.txt"
    nested_file.write_text("payload")

    connector = Mock()
    manager = ConnectionStateManager()
    manager.set_state(
        connector=connector,
        details=ConnectionDetails(type="csv"),
        temp_paths=[str(file_path), str(dir_path)],
    )

    with _session_storage_lock:
        session_storage["session-1:tab-a"] = manager

    assert cleanup_session("session-1:tab-a") is True

    connector.disconnect.assert_called_once()
    assert not file_path.exists()
    assert not dir_path.exists()
    assert "session-1:tab-a" not in session_storage


def test_cleanup_session_continues_when_connector_disconnect_fails(tmp_path):
    file_path = tmp_path / "temp.csv"
    file_path.write_text("a,b\n1,2\n")

    connector = Mock()
    connector.disconnect.side_effect = RuntimeError("boom")

    manager = ConnectionStateManager()
    manager.set_state(
        connector=connector,
        details=ConnectionDetails(type="csv"),
        temp_paths=[str(file_path)],
    )

    with _session_storage_lock:
        session_storage["session-2:tab-b"] = manager

    assert cleanup_session("session-2:tab-b") is True
    connector.disconnect.assert_called_once()
    assert not file_path.exists()
    assert "session-2:tab-b" not in session_storage
