# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Service for managing configuration snapshots with file-based storage."""

import json
import logging
import os
import re
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.exceptions import InvalidInputError, ResourceNotFoundError

logger = logging.getLogger(__name__)

# Default storage directory (can be overridden via environment variable)
DEFAULT_SNAPSHOT_DIR = "/app/data/snapshots"

MAX_FOLDER_DEPTH = 5
MAX_FOLDER_SEGMENT_LENGTH = 64
_VALID_SEGMENT_RE = re.compile(r"^[^/\\.<>:\"'|?*\x00-\x1f]+$")


def validate_folder(folder: str) -> str:
    """Validate and normalise a folder path. Returns the cleaned path."""
    if not folder:
        return ""

    folder = folder.strip().strip("/")
    if not folder:
        return ""

    segments = folder.split("/")
    if len(segments) > MAX_FOLDER_DEPTH:
        raise InvalidInputError(
            f"Folder path exceeds maximum depth of {MAX_FOLDER_DEPTH}"
        )
    for seg in segments:
        seg = seg.strip()
        if not seg or seg in (".", ".."):
            raise InvalidInputError(f"Invalid folder segment: '{seg}'")
        if len(seg) > MAX_FOLDER_SEGMENT_LENGTH:
            raise InvalidInputError(
                f"Folder segment exceeds {MAX_FOLDER_SEGMENT_LENGTH} characters"
            )
        if not _VALID_SEGMENT_RE.match(seg):
            raise InvalidInputError(
                f"Folder segment contains invalid characters: '{seg}'"
            )

    return "/".join(s.strip() for s in segments)


class SnapshotMetadata:
    """Metadata for a saved snapshot."""
    
    def __init__(
        self,
        id: str,
        name: str,
        created_at: str,
        updated_at: str,
        folder: str = "",
    ):
        self.id = id
        self.name = name
        self.created_at = created_at
        self.updated_at = updated_at
        self.folder = folder
    
    def to_dict(self) -> Dict[str, str]:
        return {
            "id": self.id,
            "name": self.name,
            "folder": self.folder,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
        }


class SnapshotService:
    """Service for CRUD operations on configuration snapshots."""
    
    def __init__(self, storage_dir: Optional[str] = None):
        """
        Initialize the snapshot service.
        
        Args:
            storage_dir: Directory to store snapshots. Defaults to SNAPSHOT_STORAGE_DIR
                        env var or /app/data/snapshots.
        """
        self.storage_dir = Path(
            storage_dir 
            or os.environ.get("SNAPSHOT_STORAGE_DIR") 
            or DEFAULT_SNAPSHOT_DIR
        )
    
    def ensure_storage_dir(self) -> None:
        """Create storage directory if it doesn't exist."""
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"Snapshot storage directory ensured: {self.storage_dir}")
    
    def _get_snapshot_path(self, snapshot_id: str) -> Path:
        """Get the file path for a snapshot."""
        # Validate ID to prevent path traversal
        if not snapshot_id or "/" in snapshot_id or "\\" in snapshot_id or ".." in snapshot_id:
            raise InvalidInputError(f"Invalid snapshot ID: {snapshot_id}")
        return self.storage_dir / f"{snapshot_id}.json"
    
    def _read_snapshot_file(self, snapshot_id: str) -> Dict[str, Any]:
        """Read and parse a snapshot file."""
        path = self._get_snapshot_path(snapshot_id)
        if not path.exists():
            raise ResourceNotFoundError("Snapshot", snapshot_id)
        
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in snapshot file {path}: {e}")
            raise InvalidInputError(f"Snapshot file is corrupted: {snapshot_id}")
    
    def _write_snapshot_file(self, snapshot_id: str, data: Dict[str, Any]) -> None:
        """Write snapshot data to file atomically."""
        path = self._get_snapshot_path(snapshot_id)
        
        # Write to temp file first, then rename for atomic operation
        fd, temp_path = tempfile.mkstemp(
            suffix=".json",
            prefix="snapshot_",
            dir=self.storage_dir
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            
            # Atomic rename
            os.replace(temp_path, path)
            logger.info(f"Snapshot saved: {snapshot_id}")
        except Exception:
            # Clean up temp file on failure
            if os.path.exists(temp_path):
                os.unlink(temp_path)
            raise
    
    def list_snapshots(self) -> List[SnapshotMetadata]:
        """
        List all saved snapshots.
        
        Returns:
            List of snapshot metadata (id, name, timestamps).
        """
        self.ensure_storage_dir()
        snapshots = []
        
        for path in self.storage_dir.glob("*.json"):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                
                snapshots.append(SnapshotMetadata(
                    id=data.get("id", path.stem),
                    name=data.get("name", "Untitled"),
                    created_at=data.get("createdAt", ""),
                    updated_at=data.get("updatedAt", ""),
                    folder=data.get("folder", ""),
                ))
            except Exception as e:
                logger.warning(f"Failed to read snapshot file {path}: {e}")
                continue
        
        # Sort by updated_at descending (most recent first)
        snapshots.sort(key=lambda s: s.updated_at, reverse=True)
        return snapshots
    
    def save_snapshot(
        self,
        name: str,
        configuration: Dict[str, Any],
        snapshot_id: Optional[str] = None,
        folder: Optional[str] = None,
    ) -> SnapshotMetadata:
        """
        Save a new snapshot or overwrite an existing one.
        
        Args:
            name: Human-readable name for the snapshot.
            configuration: The SavedConfiguration data to store.
            snapshot_id: Optional ID to overwrite. If None, creates new snapshot.
            folder: Optional folder path (e.g. "Sales/Reports"). Defaults to ""
                    (root) for new snapshots or preserves existing folder on overwrite.
            
        Returns:
            Metadata of the saved snapshot.
        """
        self.ensure_storage_dir()
        
        now = datetime.now(timezone.utc).isoformat()
        
        if snapshot_id:
            existing = self._read_snapshot_file(snapshot_id)
            created_at = existing.get("createdAt", now)
            resolved_folder = (
                validate_folder(folder) if folder is not None
                else existing.get("folder", "")
            )
        else:
            snapshot_id = str(uuid.uuid4())
            created_at = now
            resolved_folder = validate_folder(folder) if folder else ""
        
        data = {
            "id": snapshot_id,
            "name": name.strip() or "Untitled",
            "folder": resolved_folder,
            "createdAt": created_at,
            "updatedAt": now,
            "configuration": configuration,
        }
        
        self._write_snapshot_file(snapshot_id, data)
        
        return SnapshotMetadata(
            id=snapshot_id,
            name=data["name"],
            created_at=created_at,
            updated_at=now,
            folder=resolved_folder,
        )
    
    def get_snapshot(self, snapshot_id: str) -> Dict[str, Any]:
        """
        Get a snapshot by ID.
        
        Args:
            snapshot_id: The snapshot ID.
            
        Returns:
            The full snapshot data including configuration.
        """
        self.ensure_storage_dir()
        data = self._read_snapshot_file(snapshot_id)
        return data
    
    def get_snapshot_configuration(self, snapshot_id: str) -> Dict[str, Any]:
        """
        Get only the configuration from a snapshot.
        
        Args:
            snapshot_id: The snapshot ID.
            
        Returns:
            The SavedConfiguration data.
        """
        data = self.get_snapshot(snapshot_id)
        configuration = data.get("configuration")
        if not configuration:
            raise InvalidInputError(f"Snapshot {snapshot_id} has no configuration data")
        return configuration
    
    def delete_snapshot(self, snapshot_id: str) -> None:
        """
        Delete a snapshot by ID.
        
        Args:
            snapshot_id: The snapshot ID to delete.
        """
        self.ensure_storage_dir()
        path = self._get_snapshot_path(snapshot_id)
        
        if not path.exists():
            raise ResourceNotFoundError("Snapshot", snapshot_id)
        
        try:
            path.unlink()
            logger.info(f"Snapshot deleted: {snapshot_id}")
        except Exception as e:
            logger.error(f"Failed to delete snapshot {snapshot_id}: {e}")
            raise InvalidInputError(f"Failed to delete snapshot: {e}")
    
    def rename_snapshot(self, snapshot_id: str, new_name: str) -> SnapshotMetadata:
        """
        Rename a snapshot.
        
        Args:
            snapshot_id: The snapshot ID.
            new_name: The new name for the snapshot.
            
        Returns:
            Updated metadata.
        """
        self.ensure_storage_dir()
        data = self._read_snapshot_file(snapshot_id)
        
        now = datetime.now(timezone.utc).isoformat()
        data["name"] = new_name.strip() or "Untitled"
        data["updatedAt"] = now
        
        self._write_snapshot_file(snapshot_id, data)
        
        return SnapshotMetadata(
            id=snapshot_id,
            name=data["name"],
            created_at=data.get("createdAt", ""),
            updated_at=now,
            folder=data.get("folder", ""),
        )

    def move_snapshot(self, snapshot_id: str, folder: str) -> SnapshotMetadata:
        """
        Move a snapshot to a different folder.
        
        Args:
            snapshot_id: The snapshot ID.
            folder: Target folder path (empty string for root).
            
        Returns:
            Updated metadata.
        """
        self.ensure_storage_dir()
        resolved_folder = validate_folder(folder)
        data = self._read_snapshot_file(snapshot_id)

        now = datetime.now(timezone.utc).isoformat()
        data["folder"] = resolved_folder
        data["updatedAt"] = now

        self._write_snapshot_file(snapshot_id, data)

        return SnapshotMetadata(
            id=snapshot_id,
            name=data.get("name", "Untitled"),
            created_at=data.get("createdAt", ""),
            updated_at=now,
            folder=resolved_folder,
        )

    def rename_folder(self, old_path: str, new_path: str) -> int:
        """
        Rename a folder, updating all snapshots whose folder starts with old_path.
        
        Args:
            old_path: Current folder path.
            new_path: New folder path.
            
        Returns:
            Number of snapshots updated.
        """
        self.ensure_storage_dir()
        old_path = validate_folder(old_path)
        new_path = validate_folder(new_path)

        if not old_path:
            raise InvalidInputError("Cannot rename root folder")
        if not new_path:
            raise InvalidInputError("New folder path cannot be empty")
        if old_path == new_path:
            return 0

        updated_count = 0
        now = datetime.now(timezone.utc).isoformat()

        for path in self.storage_dir.glob("*.json"):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)

                current_folder = data.get("folder", "")
                if current_folder == old_path or current_folder.startswith(old_path + "/"):
                    data["folder"] = new_path + current_folder[len(old_path):]
                    data["updatedAt"] = now
                    snapshot_id = data.get("id", path.stem)
                    self._write_snapshot_file(snapshot_id, data)
                    updated_count += 1
            except Exception as e:
                logger.warning(f"Failed to process snapshot file {path} during folder rename: {e}")
                continue

        return updated_count
