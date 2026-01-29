"""Service for managing configuration snapshots with file-based storage."""

import json
import logging
import os
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.exceptions import InvalidInputError, ResourceNotFoundError

logger = logging.getLogger(__name__)

# Default storage directory (can be overridden via environment variable)
DEFAULT_SNAPSHOT_DIR = "/app/data/snapshots"


class SnapshotMetadata:
    """Metadata for a saved snapshot."""
    
    def __init__(
        self,
        id: str,
        name: str,
        created_at: str,
        updated_at: str,
    ):
        self.id = id
        self.name = name
        self.created_at = created_at
        self.updated_at = updated_at
    
    def to_dict(self) -> Dict[str, str]:
        return {
            "id": self.id,
            "name": self.name,
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
    ) -> SnapshotMetadata:
        """
        Save a new snapshot or overwrite an existing one.
        
        Args:
            name: Human-readable name for the snapshot.
            configuration: The SavedConfiguration data to store.
            snapshot_id: Optional ID to overwrite. If None, creates new snapshot.
            
        Returns:
            Metadata of the saved snapshot.
        """
        self.ensure_storage_dir()
        
        now = datetime.now(timezone.utc).isoformat()
        
        if snapshot_id:
            # Update existing snapshot
            existing = self._read_snapshot_file(snapshot_id)
            created_at = existing.get("createdAt", now)
        else:
            # Create new snapshot
            snapshot_id = str(uuid.uuid4())
            created_at = now
        
        data = {
            "id": snapshot_id,
            "name": name.strip() or "Untitled",
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
        )
