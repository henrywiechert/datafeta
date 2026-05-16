# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Tests for plugin-driven behavior in ConnectionService."""

from types import SimpleNamespace
from unittest.mock import Mock

import asyncio
import pytest

from backend.session_state import ConnectionStateManager
from backend.exceptions import InvalidInputError
from backend.models.data_source import ConnectionDetails
from backend.services.connection_service import ConnectionService


def _make_request(upload_root_dir: str):
    return SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(upload_root_dir=upload_root_dir)))


def run_async(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


class TestAddFilesCapabilityGating:
    def test_add_files_rejects_connector_type_without_incremental_capability(self, tmp_path):
        state_manager = ConnectionStateManager()
        state_manager.set_state(
            connector=Mock(),
            details=ConnectionDetails(type="clickhouse", host="localhost"),
            temp_paths=[],
        )

        service = ConnectionService(state_manager=state_manager, request=_make_request(str(tmp_path)))

        with pytest.raises(InvalidInputError) as exc_info:
            run_async(service.add_files(uploaded_files=[Mock()], session_id="s1"))

        assert "not supported for connection type 'clickhouse'" in str(exc_info.value)


class TestHivePartitionConnectionTypeGuard:
    def test_load_hive_partition_requires_hive_connection_type(self, tmp_path):
        state_manager = ConnectionStateManager()
        state_manager.set_state(
            connector=Mock(),
            details=ConnectionDetails(type="csv"),
            temp_paths=[],
        )

        service = ConnectionService(state_manager=state_manager, request=_make_request(str(tmp_path)))

        with pytest.raises(InvalidInputError) as exc_info:
            run_async(
                service.load_hive_partition(
                    partition_name="us",
                    uploaded_files=[Mock()],
                    session_id="s1",
                )
            )

        assert "requires a Hive Parquet connection" in str(exc_info.value)
