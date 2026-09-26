# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Run the FastAPI backend in-process on a loopback port (replaces the Electron sidecar process)."""
from __future__ import annotations

import logging
import os
import socket
import sys
import threading
import traceback

from PySide6.QtCore import QObject, Signal

from . import paths

log = logging.getLogger("datafeta_qt.backend")


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def prepare_environment(port: int) -> None:
    """Set the same env the Electron shell passes to the sidecar, then reuse its env prep."""
    os.environ["DATAFETA_HOST"] = "127.0.0.1"
    os.environ["DATAFETA_PORT"] = str(port)
    os.environ["DATAFETA_DATA_DIR"] = str(paths.data_dir())
    os.environ.setdefault("LOG_LEVEL", "info")

    if not paths.is_frozen():
        for extra in (paths.repo_root(), paths.repo_root() / "desktop" / "sidecar"):
            if str(extra) not in sys.path:
                sys.path.insert(0, str(extra))

    from entrypoint import _prepare_env  # desktop/sidecar/entrypoint.py

    _prepare_env()


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
