"""API router for snapshot (configuration) management operations."""

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body
from pydantic import BaseModel, Field

from backend.services.snapshot_service import SnapshotService

logger = logging.getLogger(__name__)

router = APIRouter()


# --- Pydantic Models for Request/Response --- #

class SnapshotMetadataResponse(BaseModel):
    """Metadata for a saved snapshot."""
    id: str
    name: str
    createdAt: str = Field(alias="createdAt")
    updatedAt: str = Field(alias="updatedAt")
    
    class Config:
        populate_by_name = True


class SaveSnapshotRequest(BaseModel):
    """Request body for saving a snapshot."""
    name: str = Field(..., description="Human-readable name for the snapshot")
    configuration: Dict[str, Any] = Field(..., description="The SavedConfiguration data")


class UpdateSnapshotRequest(BaseModel):
    """Request body for updating a snapshot."""
    name: Optional[str] = Field(None, description="New name for the snapshot")
    configuration: Optional[Dict[str, Any]] = Field(None, description="New configuration data")


class RenameSnapshotRequest(BaseModel):
    """Request body for renaming a snapshot."""
    name: str = Field(..., description="New name for the snapshot")


# --- Endpoints --- #

@router.get("/snapshots", response_model=List[SnapshotMetadataResponse])
def list_snapshots():
    """
    List all saved snapshots.
    
    Returns metadata only (id, name, timestamps) for display in a gallery.
    """
    service = SnapshotService()
    snapshots = service.list_snapshots()
    return [
        SnapshotMetadataResponse(
            id=s.id,
            name=s.name,
            createdAt=s.created_at,
            updatedAt=s.updated_at,
        )
        for s in snapshots
    ]


@router.post("/snapshots", response_model=SnapshotMetadataResponse)
def save_snapshot(request: SaveSnapshotRequest = Body(...)):
    """
    Save a new snapshot.
    
    Creates a new snapshot with a unique ID and stores the configuration.
    """
    service = SnapshotService()
    metadata = service.save_snapshot(
        name=request.name,
        configuration=request.configuration,
    )
    return SnapshotMetadataResponse(
        id=metadata.id,
        name=metadata.name,
        createdAt=metadata.created_at,
        updatedAt=metadata.updated_at,
    )


@router.get("/snapshots/{snapshot_id}")
def get_snapshot(snapshot_id: str):
    """
    Load a specific snapshot by ID.
    
    Returns the full snapshot data including configuration.
    """
    service = SnapshotService()
    data = service.get_snapshot(snapshot_id)
    return {
        "id": data.get("id"),
        "name": data.get("name"),
        "createdAt": data.get("createdAt"),
        "updatedAt": data.get("updatedAt"),
        "configuration": data.get("configuration"),
    }


@router.put("/snapshots/{snapshot_id}", response_model=SnapshotMetadataResponse)
def update_snapshot(snapshot_id: str, request: UpdateSnapshotRequest = Body(...)):
    """
    Update a snapshot.
    
    Can update name, configuration, or both.
    """
    service = SnapshotService()
    
    if request.configuration is not None:
        # Full update with new configuration
        name = request.name
        if name is None:
            # Keep existing name
            existing = service.get_snapshot(snapshot_id)
            name = existing.get("name", "Untitled")
        
        metadata = service.save_snapshot(
            name=name,
            configuration=request.configuration,
            snapshot_id=snapshot_id,
        )
    elif request.name is not None:
        # Just rename
        metadata = service.rename_snapshot(snapshot_id, request.name)
    else:
        # No changes - just return current metadata
        data = service.get_snapshot(snapshot_id)
        return SnapshotMetadataResponse(
            id=data.get("id"),
            name=data.get("name"),
            createdAt=data.get("createdAt"),
            updatedAt=data.get("updatedAt"),
        )
    
    return SnapshotMetadataResponse(
        id=metadata.id,
        name=metadata.name,
        createdAt=metadata.created_at,
        updatedAt=metadata.updated_at,
    )


@router.delete("/snapshots/{snapshot_id}")
def delete_snapshot(snapshot_id: str):
    """
    Delete a snapshot by ID.
    """
    service = SnapshotService()
    service.delete_snapshot(snapshot_id)
    return {"message": "Snapshot deleted", "id": snapshot_id}
