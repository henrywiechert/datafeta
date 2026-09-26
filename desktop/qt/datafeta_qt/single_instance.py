# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Single-instance lock (Electron's requestSingleInstanceLock + "second-instance")."""
from __future__ import annotations

import getpass
import re

from PySide6.QtCore import QObject, Signal
from PySide6.QtNetwork import QLocalServer, QLocalSocket


class SingleInstance(QObject):
    """First instance listens on a local socket; later instances ping it and exit."""

    activated = Signal()

    def __init__(self, key: str) -> None:
        super().__init__()
        user = re.sub(r"[^A-Za-z0-9_.-]", "_", getpass.getuser())
        self._name = f"{key}-{user}"
        self._server: QLocalServer | None = None

    def acquire(self) -> bool:
        """True if this process is the primary instance."""
        probe = QLocalSocket()
        probe.connectToServer(self._name)
        if probe.waitForConnected(500):
            probe.write(b"activate\n")
            probe.waitForBytesWritten(500)
            probe.disconnectFromServer()
            return False

        # Nobody answered: any leftover Unix socket file is stale.
        QLocalServer.removeServer(self._name)
        self._server = QLocalServer(self)
        self._server.setSocketOptions(QLocalServer.SocketOption.UserAccessOption)
        self._server.newConnection.connect(self._on_connection)
        # Best effort: if listening fails we still run, just without the lock.
        self._server.listen(self._name)
        return True

    def _on_connection(self) -> None:
        assert self._server is not None
        while self._server.hasPendingConnections():
            conn = self._server.nextPendingConnection()
            conn.disconnected.connect(conn.deleteLater)
            self.activated.emit()
