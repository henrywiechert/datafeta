# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Desktop sidecar entrypoint: configure data dirs and run uvicorn on localhost."""
from __future__ import annotations

import os
import sys
from pathlib import Path


def _bundle_dir() -> Path:
    """Return the directory that contains bundled static assets."""
    if getattr(sys, "frozen", False):
        # PyInstaller onedir: datas land in sys._MEIPASS (_internal).
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            return Path(meipass)
        return Path(sys.executable).resolve().parent
    # Dev: repo root (desktop/sidecar/ -> ../..)
    return Path(__file__).resolve().parents[2]


def _prepare_env() -> None:
    data_dir = os.environ.get("DATAFETA_DATA_DIR")
    if data_dir:
        data_path = Path(data_dir)
        data_path.mkdir(parents=True, exist_ok=True)
        (data_path / "snapshots").mkdir(parents=True, exist_ok=True)
        (data_path / "uploads").mkdir(parents=True, exist_ok=True)
        (data_path / "logs").mkdir(parents=True, exist_ok=True)
        os.environ.setdefault("SNAPSHOT_STORAGE_DIR", str(data_path / "snapshots"))
        os.environ.setdefault("UPLOAD_ROOT_DIR", str(data_path / "uploads"))
        os.environ.setdefault("LOG_FILE", str(data_path / "logs" / "backend.log"))

    bundle = _bundle_dir()
    static_dir = bundle / "backend" / "static"
    if static_dir.is_dir():
        os.environ.setdefault("FRONTEND_STATIC_DIR", str(static_dir))

    docs_dir = bundle / "site"
    if docs_dir.is_dir():
        os.environ.setdefault("DOCS_STATIC_DIR", str(docs_dir))

    # Desktop binds loopback only; Electron loads the same origin so CORS is unused,
    # but keep a permissive localhost list for safety if the UI origin differs.
    if not os.environ.get("CORS_ALLOW_ORIGINS"):
        host = os.environ.get("DATAFETA_HOST", "127.0.0.1")
        port = os.environ.get("DATAFETA_PORT", "8000")
        os.environ["CORS_ALLOW_ORIGINS"] = (
            f"http://{host}:{port},http://127.0.0.1:{port},http://localhost:{port}"
        )


def main() -> None:
    _prepare_env()

    # Ensure repo root is importable when running from source.
    if not getattr(sys, "frozen", False):
        repo_root = str(Path(__file__).resolve().parents[2])
        if repo_root not in sys.path:
            sys.path.insert(0, repo_root)

    import uvicorn

    from backend.main import app

    host = os.environ.get("DATAFETA_HOST", "127.0.0.1")
    port = int(os.environ.get("DATAFETA_PORT", "8000"))
    log_level = os.environ.get("LOG_LEVEL", "info").lower()

    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level=log_level,
        # Match Docker/deploy header size allowance for large saved configs.
        h11_max_incomplete_event_size=131072,
    )


if __name__ == "__main__":
    main()
