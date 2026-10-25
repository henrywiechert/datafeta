# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Run the FastAPI backend in-process on a loopback port."""
from __future__ import annotations

import logging
import os
import socket
import sys
import threading
import traceback

from PySide6.QtCore import QObject, Signal

from . import paths

log = logging.getLogger("datafeta_desktop.backend")


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def prepare_environment(port: int) -> None:
    """Point the backend at this shell's data dirs and bundled frontend/docs assets."""
    os.environ["DATAFETA_HOST"] = "127.0.0.1"
    os.environ["DATAFETA_PORT"] = str(port)
    os.environ["DATAFETA_DATA_DIR"] = str(paths.data_dir())
    os.environ.setdefault("LOG_LEVEL", "info")

    if not paths.is_frozen() and str(paths.repo_root()) not in sys.path:
        sys.path.insert(0, str(paths.repo_root()))

    data_path = paths.data_dir()
    for sub in ("snapshots", "uploads", "logs"):
        (data_path / sub).mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("SNAPSHOT_STORAGE_DIR", str(data_path / "snapshots"))
    os.environ.setdefault("UPLOAD_ROOT_DIR", str(data_path / "uploads"))
    os.environ.setdefault("LOG_FILE", str(data_path / "logs" / "backend.log"))

    bundle = paths.bundle_dir()
    static_dir = bundle / "backend" / "static"
    if static_dir.is_dir():
        os.environ.setdefault("FRONTEND_STATIC_DIR", str(static_dir))
    docs_dir = bundle / "site"
    if docs_dir.is_dir():
        os.environ.setdefault("DOCS_STATIC_DIR", str(docs_dir))

    # The UI is served from the backend's own origin, so CORS is unused; keep a loopback
    # allowlist for safety.
    if not os.environ.get("CORS_ALLOW_ORIGINS"):
        os.environ["CORS_ALLOW_ORIGINS"] = (
            f"http://127.0.0.1:{port},http://localhost:{port}"
        )


def load_backend_app():
    """Import the FastAPI app. Call before QtWebEngine starts: its Chromium init loads Qt's
    shared libs (e.g. libzstd) globally, which can shadow newer copies backend deps need."""
    from backend.main import app

    return app


class BackendServer(QObject):
    """uvicorn on a worker thread. `exited` fires (queued to the GUI thread) when it stops."""

    exited = Signal(str)

    def __init__(self, port: int, asgi_app) -> None:
        super().__init__()
        self.port = port
        self._app = asgi_app
        self._server = None
        self._thread: threading.Thread | None = None
        self._stopping = False

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.port}/"

    @property
    def started(self) -> bool:
        return bool(self._server is not None and self._server.started)

    @property
    def stopping(self) -> bool:
        return self._stopping

    def start(self) -> None:
        self._thread = threading.Thread(target=self._run, name="datafeta-backend", daemon=True)
        self._thread.start()

    def _run(self) -> None:
        reason = "stopped"
        try:
            import uvicorn

            config = uvicorn.Config(
                self._app,
                host="127.0.0.1",
                port=self.port,
                log_level=os.environ.get("LOG_LEVEL", "info").lower(),
                # Match Docker/deploy header size allowance for large saved configs.
                h11_max_incomplete_event_size=131072,
            )
            self._server = uvicorn.Server(config)
            if self._stopping:
                return
            # uvicorn skips signal handlers off the main thread; Qt owns process shutdown.
            self._server.run()
            if not self._stopping:
                reason = "the server loop exited"
        except BaseException as exc:  # noqa: BLE001 - report anything that kills the backend
            log.error("Backend crashed:\n%s", traceback.format_exc())
            reason = f"{type(exc).__name__}: {exc}"
        finally:
            self.exited.emit(reason)

    def stop(self, timeout: float = 5.0) -> None:
        """Graceful uvicorn shutdown (runs FastAPI shutdown handlers, like SIGTERM did)."""
        self._stopping = True
        if self._server is not None:
            self._server.should_exit = True
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout)
            if self._thread.is_alive():
                log.warning("Backend did not stop within %.1fs", timeout)
