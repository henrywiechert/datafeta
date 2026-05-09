"""API router for snapshot (configuration) management operations."""

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body
from pydantic import BaseModel, ConfigDict, Field

from backend.services.snapshot_service import SnapshotService

logger = logging.getLogger(__name__)

router = APIRouter()


# --- Pydantic Models for Request/Response --- #

class SnapshotMetadataResponse(BaseModel):
    """Metadata for a saved snapshot."""
    id: str
    name: str
    folder: str = ""
    createdAt: str = Field(alias="createdAt")
    updatedAt: str = Field(alias="updatedAt")
    
    model_config = ConfigDict(populate_by_name=True)


class SaveSnapshotRequest(BaseModel):
    """Request body for saving a snapshot."""
    name: str = Field(..., description="Human-readable name for the snapshot")
    configuration: Dict[str, Any] = Field(..., description="The SavedConfiguration data")
    folder: Optional[str] = Field("", description="Folder path (e.g. 'Sales/Reports')")


class UpdateSnapshotRequest(BaseModel):
    """Request body for updating a snapshot."""
    name: Optional[str] = Field(None, description="New name for the snapshot")
    configuration: Optional[Dict[str, Any]] = Field(None, description="New configuration data")
    folder: Optional[str] = Field(None, description="Folder path to move into")


class MoveSnapshotRequest(BaseModel):
    """Request body for moving a snapshot to a folder."""
    folder: str = Field(..., description="Target folder path (empty string for root)")


class RenameFolderRequest(BaseModel):
    """Request body for renaming a folder."""
    oldPath: str = Field(..., description="Current folder path")
    newPath: str = Field(..., description="New folder path")


def _metadata_response(m) -> SnapshotMetadataResponse:
    return SnapshotMetadataResponse(
        id=m.id,
        name=m.name,
        folder=m.folder,
        createdAt=m.created_at,
        updatedAt=m.updated_at,
    )


# --- Endpoints --- #

@router.get("/snapshots", response_model=List[SnapshotMetadataResponse])
def list_snapshots():
    """
    List all saved snapshots.
    
    Returns metadata only (id, name, folder, timestamps) for display in a gallery.
    """
    service = SnapshotService()
    snapshots = service.list_snapshots()
    return [_metadata_response(s) for s in snapshots]


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
        folder=request.folder,
    )
    return _metadata_response(metadata)


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
        "folder": data.get("folder", ""),
        "createdAt": data.get("createdAt"),
        "updatedAt": data.get("updatedAt"),
        "configuration": data.get("configuration"),
    }


@router.put("/snapshots/{snapshot_id}", response_model=SnapshotMetadataResponse)
def update_snapshot(snapshot_id: str, request: UpdateSnapshotRequest = Body(...)):
    """
    Update a snapshot.
    
    Can update name, configuration, folder, or a combination.
    """
    service = SnapshotService()
    
    if request.configuration is not None:
        name = request.name
        if name is None:
            existing = service.get_snapshot(snapshot_id)
            name = existing.get("name", "Untitled")
        
        metadata = service.save_snapshot(
            name=name,
            configuration=request.configuration,
            snapshot_id=snapshot_id,
            folder=request.folder,
        )
    elif request.name is not None:
        metadata = service.rename_snapshot(snapshot_id, request.name)
        if request.folder is not None:
            metadata = service.move_snapshot(snapshot_id, request.folder)
    elif request.folder is not None:
        metadata = service.move_snapshot(snapshot_id, request.folder)
    else:
        data = service.get_snapshot(snapshot_id)
        return SnapshotMetadataResponse(
            id=data.get("id"),
            name=data.get("name"),
            folder=data.get("folder", ""),
            createdAt=data.get("createdAt"),
            updatedAt=data.get("updatedAt"),
        )
    
    return _metadata_response(metadata)


@router.post("/snapshots/rename-folder")
def rename_folder(request: RenameFolderRequest = Body(...)):
    """Rename a folder, updating all snapshots within it."""
    service = SnapshotService()
    count = service.rename_folder(request.oldPath, request.newPath)
    return {"updatedCount": count, "oldPath": request.oldPath, "newPath": request.newPath}


@router.post("/snapshots/{snapshot_id}/move", response_model=SnapshotMetadataResponse)
def move_snapshot(snapshot_id: str, request: MoveSnapshotRequest = Body(...)):
    """Move a snapshot to a different folder."""
    service = SnapshotService()
    metadata = service.move_snapshot(snapshot_id, request.folder)
    return _metadata_response(metadata)


@router.delete("/snapshots/{snapshot_id}")
def delete_snapshot(snapshot_id: str):
    """
    Delete a snapshot by ID.
    """
    service = SnapshotService()
    service.delete_snapshot(snapshot_id)
    return {"message": "Snapshot deleted", "id": snapshot_id}
