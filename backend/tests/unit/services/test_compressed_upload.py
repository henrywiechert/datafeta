# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Tests for compressed (gz/bz2/xz/zst/zip) uploads through ConnectionService."""

import asyncio
import bz2
import gzip
import io
import lzma
import os
import sqlite3
import zipfile
from types import SimpleNamespace

import pytest
from fastapi import UploadFile

import backend.services.connection_service as connection_service_module
from backend.connectors.file_connector import FileConnector
from backend.connectors.registry import get_connector_registry
from backend.exceptions import InvalidInputError
from backend.services.connection_service import ConnectionService
from backend.session_state import ConnectionStateManager
from backend.utils.compression import COMPRESSION_EXTENSIONS, split_compression_suffix

CSV_BYTES = b"id,name\n1,ada\n2,bob\n"
NDJSON_BYTES = b'{"id": 1, "name": "ada"}\n{"id": 2, "name": "bob"}\n'


def _make_service(tmp_path):
    request = SimpleNamespace(
        app=SimpleNamespace(state=SimpleNamespace(upload_root_dir=str(tmp_path / "uploads")))
    )
    return ConnectionService(state_manager=ConnectionStateManager(), request=request)


def run_async(coro):
    return asyncio.run(coro)


def _upload(filename, payload, content_type="application/octet-stream"):
    return UploadFile(
        filename=filename,
        file=io.BytesIO(payload),
        headers={"content-type": content_type} if content_type is not None else {},
    )


def _zip_bytes(members):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in members.items():
            archive.writestr(name, data)
    return buf.getvalue()


def _sqlite_bytes(tmp_path):
    path = tmp_path / "source.db"
    con = sqlite3.connect(str(path))
    try:
        con.executescript("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT); INSERT INTO t VALUES (1, 'x');")
        con.commit()
    finally:
        con.close()
    return path.read_bytes()


_STREAM_COMPRESSORS = {
    ".gz": gzip.compress,
    ".bz2": bz2.compress,
    ".xz": lzma.compress,
}
if ".zst" in COMPRESSION_EXTENSIONS:
    from backend.utils.compression import _zstd

    _STREAM_COMPRESSORS[".zst"] = _zstd.compress


class TestSplitCompressionSuffix:
    @pytest.mark.parametrize(
        "filename, expected",
        [
            ("sales.csv.gz", ("sales.csv", ".gz")),
            ("Sales.CSV.XZ", ("Sales.CSV", ".xz")),
            ("data.zip", ("data", ".zip")),
            ("sales.csv", ("sales.csv", None)),
        ],
    )
    def test_split(self, filename, expected):
        assert split_compression_suffix(filename) == expected


class TestCompressedDataFileUpload:
    @pytest.mark.parametrize("ext", sorted(_STREAM_COMPRESSORS))
    def test_stream_compressed_csv_is_decompressed(self, tmp_path, ext):
        service = _make_service(tmp_path)
        upload_dir = service._get_session_upload_dir("s1")

        saved = run_async(
            service._save_and_validate_uploaded_files(
                _upload(f"sales.csv{ext}", _STREAM_COMPRESSORS[ext](CSV_BYTES)), upload_dir
            )
        )

        assert len(saved) == 1
        path, name = saved[0]
        assert name == "sales.csv"
        assert path.endswith(".csv")
        with open(path, "rb") as f:
            assert f.read() == CSV_BYTES
        # Only the decompressed copy remains.
        assert os.listdir(upload_dir) == [os.path.basename(path)]

    def test_accepts_missing_content_type_for_compressed_upload(self, tmp_path):
        service = _make_service(tmp_path)
        upload_dir = service._get_session_upload_dir("s1")

        saved = run_async(
            service._save_and_validate_uploaded_files(
                _upload("events.ndjson.gz", gzip.compress(NDJSON_BYTES), content_type=None),
                upload_dir,
            )
        )
        assert saved[0][1] == "events.ndjson"

    def test_zip_with_several_files_yields_one_entry_each(self, tmp_path):
        service = _make_service(tmp_path)
        upload_dir = service._get_session_upload_dir("s1")
        payload = _zip_bytes(
            {
                "dataset/customers.csv": CSV_BYTES,
                "dataset/events.jsonl": NDJSON_BYTES,
                "dataset/README.md": b"ignored",
                "__MACOSX/dataset/._customers.csv": b"ignored",
            }
        )

        saved = run_async(
            service._save_and_validate_uploaded_files(
                _upload("dataset.zip", payload, content_type="application/zip"), upload_dir
            )
        )

        assert sorted(name for _, name in saved) == ["customers.csv", "events.jsonl"]
        assert sorted(os.listdir(upload_dir)) == sorted(os.path.basename(p) for p, _ in saved)

    def test_zip_without_supported_files_is_rejected(self, tmp_path):
        service = _make_service(tmp_path)
        upload_dir = service._get_session_upload_dir("s1")

        with pytest.raises(InvalidInputError, match="contains no supported files"):
            run_async(
                service._save_and_validate_uploaded_files(
                    _upload("docs.zip", _zip_bytes({"README.md": b"x"})), upload_dir
                )
            )
        assert os.listdir(upload_dir) == []

    def test_unknown_inner_type_is_rejected_before_saving(self, tmp_path):
        service = _make_service(tmp_path)
        upload_dir = service._get_session_upload_dir("s1")

        with pytest.raises(InvalidInputError, match="Invalid file type"):
            run_async(
                service._save_and_validate_uploaded_files(
                    _upload("sales.gz", gzip.compress(CSV_BYTES)), upload_dir
                )
            )
        assert os.listdir(upload_dir) == []

    def test_corrupt_archive_is_rejected_and_cleaned_up(self, tmp_path):
        service = _make_service(tmp_path)
        upload_dir = service._get_session_upload_dir("s1")

        with pytest.raises(InvalidInputError, match="Could not decompress"):
            run_async(
                service._save_and_validate_uploaded_files(
                    _upload("sales.csv.gz", b"definitely not gzip"), upload_dir
                )
            )
        assert os.listdir(upload_dir) == []

    def test_invalid_decompressed_content_is_rejected_and_cleaned_up(self, tmp_path):
        service = _make_service(tmp_path)
        upload_dir = service._get_session_upload_dir("s1")

        with pytest.raises(InvalidInputError, match="valid JSON"):
            run_async(
                service._save_and_validate_uploaded_files(
                    _upload("events.json.gz", gzip.compress(b"id,name\n1,ada\n")), upload_dir
                )
            )
        assert os.listdir(upload_dir) == []

    def test_decompressed_size_limit(self, tmp_path, monkeypatch):
        monkeypatch.setattr(connection_service_module, "MAX_DECOMPRESSED_UPLOAD_BYTES", 1024)
        service = _make_service(tmp_path)
        upload_dir = service._get_session_upload_dir("s1")
        big_csv = b"id,name\n" + b"1,ada\n" * 10_000

        with pytest.raises(InvalidInputError, match="exceeds the maximum") as exc_info:
            run_async(
                service._save_and_validate_uploaded_files(
                    _upload("big.csv.gz", gzip.compress(big_csv)), upload_dir
                )
            )
        assert exc_info.value.status_code == 413
        assert os.listdir(upload_dir) == []


class TestCompressedSqliteUpload:
    def test_gzipped_database(self, tmp_path):
        service = _make_service(tmp_path)
        upload_dir = service._get_session_upload_dir("s1")

        saved = run_async(
            service._save_and_validate_sqlite_upload(
                _upload("shop.sqlite.gz", gzip.compress(_sqlite_bytes(tmp_path))), upload_dir
            )
        )
        assert saved.endswith(".sqlite")
        assert os.listdir(upload_dir) == [os.path.basename(saved)]

    def test_zipped_database(self, tmp_path):
        service = _make_service(tmp_path)
        upload_dir = service._get_session_upload_dir("s1")

        saved = run_async(
            service._save_and_validate_sqlite_upload(
                _upload("shop.zip", _zip_bytes({"shop.db": _sqlite_bytes(tmp_path)})), upload_dir
            )
        )
        assert saved.endswith(".db")

    def test_zip_with_several_databases_is_rejected(self, tmp_path):
        service = _make_service(tmp_path)
        upload_dir = service._get_session_upload_dir("s1")
        db = _sqlite_bytes(tmp_path)

        with pytest.raises(InvalidInputError, match="at most 1"):
            run_async(
                service._save_and_validate_sqlite_upload(
                    _upload("shops.zip", _zip_bytes({"a.db": db, "b.db": db})), upload_dir
                )
            )
        assert os.listdir(upload_dir) == []


class TestCompressedCsvConnect:
    def test_zip_members_become_tables(self, tmp_path):
        spec = get_connector_registry().get_spec("csv")
        service = _make_service(tmp_path)
        cfg = spec.config_model.model_validate({"type": "csv"})
        payload = _zip_bytes({"customers.csv": CSV_BYTES, "orders.csv": CSV_BYTES})

        connect_args, temp_paths = run_async(
            spec.build_multipart_connect_args(service, cfg, [_upload("shop.zip", payload)], "s1")
        )

        assert len(temp_paths) == 2
        connector = FileConnector()
        connector.connect(connect_args)
        try:
            assert sorted(t.name for t in connector.list_tables()) == ["customers", "orders"]
        finally:
            connector.disconnect()

    def test_earlier_files_are_removed_when_a_later_upload_fails(self, tmp_path):
        spec = get_connector_registry().get_spec("csv")
        service = _make_service(tmp_path)
        cfg = spec.config_model.model_validate({"type": "csv"})
        uploads = [
            _upload("good.csv.gz", gzip.compress(CSV_BYTES)),
            _upload("bad.csv.gz", b"not gzip"),
        ]

        with pytest.raises(InvalidInputError):
            run_async(spec.build_multipart_connect_args(service, cfg, uploads, "s1"))
        assert os.listdir(service._get_session_upload_dir("s1")) == []
