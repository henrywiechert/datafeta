# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Session state storage and helpers for per-request connection context."""

import asyncio
import logging
import os
import shutil
import threading
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Dict, List, Optional

from backend.models.data_source import ConnectionDetails

if TYPE_CHECKING:
    from backend.connectors.base import BaseConnector


logger = logging.getLogger(__name__)


class ConnectionStateManager:
    """Hold the current connector state for a session or browser tab."""

    def __init__(self):
        self.current_connector: Optional["BaseConnector"] = None
        self.current_connection_details: Optional[ConnectionDetails] = None
        # Support multiple temp files (CSV and/or Parquet).
        self.current_temp_paths: List[str] = []
        # Per-session async lock to serialize connect/disconnect.
        self.lock: asyncio.Lock = asyncio.Lock()
        # Track when this session was created and last accessed.
        self.created_at: datetime = datetime.now(timezone.utc)
        self.last_accessed_at: datetime = datetime.now(timezone.utc)

    def set_state(
        self,
        connector: Optional["BaseConnector"],
        details: Optional[ConnectionDetails],
        temp_paths: Optional[List[str]] = None,
    ):
        self.current_connector = connector
        self.current_connection_details = details
        # Store temp paths for any file-backed connector (csv, hive_parquet, etc.).
        if temp_paths:
            self.current_temp_paths = temp_paths
        else:
            self.current_temp_paths = []
        self.last_accessed_at = datetime.now(timezone.utc)

    def clear_state(self):
        self.current_connector = None
        self.current_connection_details = None
        self.current_temp_paths = []
        self.last_accessed_at = datetime.now(timezone.utc)

    def append_temp_paths(self, paths: List[str]) -> None:
        """Append newly tracked temp paths to the session state."""
        self.current_temp_paths = (self.current_temp_paths or []) + paths
        self.last_accessed_at = datetime.now(timezone.utc)

    def touch(self):
        """Update the last accessed timestamp."""
        self.last_accessed_at = datetime.now(timezone.utc)


# This dictionary stores state for each session, identified by a composite
# key (session_id:tab_id). In production this could move to Redis or another
# shared store.
session_storage: Dict[str, ConnectionStateManager] = {}

# Global lock to guard session_storage mutations in multi-threaded servers.
_session_storage_lock = threading.Lock()


def get_composite_session_key(session_id: str, tab_id: Optional[str]) -> str:
    """Generate a storage key for a session and optional browser tab."""
    if tab_id:
        return f"{session_id}:{tab_id}"
    return session_id


def list_active_sessions() -> List[dict]:
    """Return all active sessions for debugging and observability."""
    with _session_storage_lock:
        sessions = []
        for key, manager in session_storage.items():
            parts = key.split(":", 1)
            session_id = parts[0]
            tab_id = parts[1] if len(parts) > 1 else None

            sessions.append(
                {
                    "composite_key": key,
                    "session_id": session_id,
                    "tab_id": tab_id,
                    "has_connector": manager.current_connector is not None,
                    "connection_type": manager.current_connection_details.type
                    if manager.current_connection_details
                    else None,
                    "temp_paths": manager.current_temp_paths,
                    "file_count": len(manager.current_temp_paths),
                    "created_at": manager.created_at.isoformat(),
                    "last_accessed_at": manager.last_accessed_at.isoformat(),
                }
            )
        return sessions


def remove_session(composite_key: str) -> bool:
    """Remove a session from storage by its composite key."""
    with _session_storage_lock:
        if composite_key in session_storage:
            del session_storage[composite_key]
            logger.info("Removed session: %s", composite_key)
            return True
        return False


def cleanup_session(composite_key: str) -> bool:
    """Disconnect and remove a tracked session and its temp paths."""
    with _session_storage_lock:
        manager = session_storage.get(composite_key)
        if not manager:
            return False

        if manager.current_connector:
            try:
                manager.current_connector.disconnect()
            except Exception as exc:
                logger.warning(
                    "Error disconnecting connector during session cleanup: %s",
                    exc,
                )

        for temp_path in manager.current_temp_paths:
            if not temp_path:
                continue
            try:
                if os.path.isfile(temp_path):
                    os.remove(temp_path)
                    logger.debug("Deleted temp file during session cleanup: %s", temp_path)
                elif os.path.isdir(temp_path):
                    shutil.rmtree(temp_path)
                    logger.debug(
                        "Deleted temp directory during session cleanup: %s",
                        temp_path,
                    )
            except Exception as exc:
                logger.warning(
                    "Error cleaning up temp path during session cleanup: %s",
                    exc,
                )

        del session_storage[composite_key]
        logger.info("Session cleanup completed: %s", composite_key)
        return True
