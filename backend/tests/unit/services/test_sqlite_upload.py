# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Tests for the SQLite upload/validation path of ConnectionService."""

import asyncio
import io
import os
import sqlite3
from types import SimpleNamespace

import pytest
from fastapi import UploadFile

from backend.connectors.registry import get_connector_registry
from backend.exceptions import InvalidInputError
from backend.services.connection_service import ConnectionService
from backend.session_state import ConnectionStateManager


def _make_request(upload_root_dir: str):
    return SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(upload_root_dir=upload_root_dir)))


def run_async(coro):
    return asyncio.run(coro)


def _make_service(tmp_path):
    return ConnectionService(
        state_manager=ConnectionStateManager(),
        request=_make_request(str(tmp_path / "uploads")),
    )


def _sqlite_bytes(tmp_path):
    path = tmp_path / "source.db"
    con = sqlite3.connect(str(path))
    try:
        con.executescript("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT); INSERT INTO t VALUES (1, 'x');")
        con.commit()
    finally:
        con.close()
    return path.read_bytes()


def _upload(filename, payload, content_type="application/octet-stream"):
    return UploadFile(
        filename=filename,
        file=io.BytesIO(payload),
        headers={"content-type": content_type} if content_type is not None else {},
    )


class TestSqliteUploadValidation:
    def test_saves_valid_database_file(self, tmp_path):
        service = _make_service(tmp_path)
        upload_dir = service._get_session_upload_dir("s1")

        saved = run_async(
            service._save_and_validate_sqlite_upload(
                _upload("shop.sqlite", _sqlite_bytes(tmp_path)), upload_dir
            )
        )

        assert os.path.exists(saved)
        assert saved.endswith(".sqlite")

    @pytest.mark.parametrize("filename", ["shop.db", "shop.sqlite", "shop.sqlite3", "SHOP.DB"])
    def test_accepts_known_extensions(self, tmp_path, filename):
        service = _make_service(tmp_path)
        upload_dir = service._get_session_upload_dir("s1")

        saved = run_async(
            service._save_and_validate_sqlite_upload(
                _upload(filename, _sqlite_bytes(tmp_path)), upload_dir
            )
        )
        assert os.path.exists(saved)

    def test_rejects_other_extensions(self, tmp_path):
        service = _make_service(tmp_path)
        upload_dir = service._get_session_upload_dir("s1")

        with pytest.raises(InvalidInputError, match="Invalid file type"):
            run_async(
                service._save_and_validate_sqlite_upload(
                    _upload("shop.csv", _sqlite_bytes(tmp_path)), upload_dir
                )
            )

    def test_rejects_non_sqlite_content_and_removes_temp_file(self, tmp_path):
        service = _make_service(tmp_path)
        upload_dir = service._get_session_upload_dir("s1")

        with pytest.raises(InvalidInputError, match="SQLite format 3"):
            run_async(
                service._save_and_validate_sqlite_upload(
                    _upload("shop.db", b"id,name\n1,ada\n"), upload_dir
                )
            )

        assert os.listdir(upload_dir) == []

    def test_rejects_unsupported_content_type(self, tmp_path):
        service = _make_service(tmp_path)
        upload_dir = service._get_session_upload_dir("s1")

        with pytest.raises(InvalidInputError, match="Unsupported content type"):
            run_async(
                service._save_and_validate_sqlite_upload(
                    _upload("shop.db", _sqlite_bytes(tmp_path), content_type="text/html"),
                    upload_dir,
                )
            )

    def test_sqlite_extensions_stay_out_of_the_file_handler_allowlist(self):
        # ALLOWED_FILE_EXTENSIONS feeds FILE_HANDLER_REGISTRY lookups (one file
        # = one table), which a SQLite database does not fit.
        from backend.services.connection_service import (
            ALLOWED_FILE_EXTENSIONS,
            ALLOWED_SQLITE_EXTENSIONS,
        )

        assert not (ALLOWED_FILE_EXTENSIONS & ALLOWED_SQLITE_EXTENSIONS)


class TestSqliteConnectorSpec:
    def test_spec_requires_multipart_upload(self):
        spec = get_connector_registry().get_spec("sqlite")
        assert spec.capabilities.supports_multipart_connect is True
        assert spec.capabilities.supports_json_connect is False
        assert spec.capabilities.supports_databases is False
        assert spec.capabilities.supports_arrow is True
        assert spec.build_multipart_connect_args is not None

    def test_builds_connect_args_from_upload(self, tmp_path):
        spec = get_connector_registry().get_spec("sqlite")
        service = _make_service(tmp_path)

        connect_args, temp_paths = run_async(
            spec.build_multipart_connect_args(
                service,
                spec.config_model(),
                [_upload("shop.db", _sqlite_bytes(tmp_path))],
                "s1",
            )
        )

        assert connect_args == {"file_path": temp_paths[0]}
        assert os.path.exists(temp_paths[0])

    def test_requires_a_file(self, tmp_path):
        spec = get_connector_registry().get_spec("sqlite")
        service = _make_service(tmp_path)

        with pytest.raises(InvalidInputError, match="required"):
            run_async(
                spec.build_multipart_connect_args(service, spec.config_model(), [], "s1")
            )

    def test_rejects_multiple_files(self, tmp_path):
        spec = get_connector_registry().get_spec("sqlite")
        service = _make_service(tmp_path)
        payload = _sqlite_bytes(tmp_path)

        with pytest.raises(InvalidInputError, match="Only one SQLite database file"):
            run_async(
                spec.build_multipart_connect_args(
                    service,
                    spec.config_model(),
                    [_upload("a.db", payload), _upload("b.db", payload)],
                    "s1",
                )
            )
