"""API router for connection management operations."""

import logging
from typing import List, Optional

from fastapi import APIRouter, Body, Depends, File, Form, Request, UploadFile
from pydantic import BaseModel

from backend.dependencies import (
    get_session_id,
    get_state_manager,
    get_composite_key,
)
from backend.session_state import (
    cleanup_session,
    ConnectionStateManager,
    get_composite_session_key,
    list_active_sessions,
    remove_session,
)
from backend.models.data_source import ConnectionDetails
from backend.services.connection_service import ConnectionService
from backend.connectors.registry import get_connector_registry

logger = logging.getLogger(__name__)

router = APIRouter()


class BeaconDisconnectRequest(BaseModel):
    """Request body for the disconnect beacon endpoint."""
    tab_id: str


class ConnectorSpecResponse(BaseModel):
    id: str
    display_name: str
    capabilities: dict
    config_schema: dict


@router.get("/connectors")
def list_connectors() -> dict:
    """List available connector types and their config schemas."""
    registry = get_connector_registry()
    specs = []
    for connector_id, spec in sorted(registry.list_specs().items()):
        specs.append(
            ConnectorSpecResponse(
                id=spec.id,
                display_name=spec.display_name,
                capabilities={
                    "supports_json_connect": spec.capabilities.supports_json_connect,
                    "supports_multipart_connect": spec.capabilities.supports_multipart_connect,
                    "supports_databases": spec.capabilities.supports_databases,
                    "supports_arrow": spec.capabilities.supports_arrow,
                },
                config_schema=spec.config_model.model_json_schema(),
            ).model_dump()
        )
    return {"connectors": specs}


@router.post("/connect")
async def connect_to_datasource(
    connection_details_json: str = Form(...),
    uploaded_files: List[UploadFile] = File(default=[]),
    state_manager: ConnectionStateManager = Depends(get_state_manager),
    session_id: str = Depends(get_session_id),
    request: Request = None
):
    """
    Connect to a specified data source.
    
    For file-based sources (CSV/Parquet), upload one or more files.
    Each file becomes a separate queryable table.
    
    Supported file types:
    - CSV (.csv) - with configurable delimiter, header, date formats
    - Parquet (.parquet) - schema is automatically detected from file
    
    Args:
        connection_details_json: JSON string with connection type and options
        uploaded_files: List of files to upload (for 'csv' connection type)
        
    Returns:
        Success message and list of file paths
    """
    service = ConnectionService(state_manager=state_manager, request=request)
    return await service.connect_multipart(connection_details_json, uploaded_files, session_id)


@router.post("/connect/json")
async def connect_to_datasource_json(
    connection_details: ConnectionDetails = Body(...),
    state_manager: ConnectionStateManager = Depends(get_state_manager),
    session_id: str = Depends(get_session_id),
    request: Request = None
):
    """Connect to a data source using a JSON body (no file upload). Use for non-file sources."""
    service = ConnectionService(state_manager=state_manager, request=request)
    return await service.connect_json(connection_details, session_id)


@router.post("/connect-hive")
async def connect_hive_parquet(
    connection_details: ConnectionDetails = Body(...),
    state_manager: ConnectionStateManager = Depends(get_state_manager),
    session_id: str = Depends(get_session_id),
    request: Request = None
):
    """
    Phase 1: Connect to a Hive-partitioned Parquet dataset.
    
    Receives the file structure (list of relative paths) from the frontend
    without actual file uploads. Parses the partition structure and returns
    available partitions as tables.
    
    Args:
        connection_details: Must include type='hive_parquet' and hive_file_structure
        
    Returns:
        Dict with partition_column and list of tables (partition values)
    """
    service = ConnectionService(state_manager=state_manager, request=request)
    return await service.connect_hive(connection_details, session_id)


@router.post("/load-partition")
async def load_partition(
    partition_name: str = Form(...),
    uploaded_files: List[UploadFile] = File(...),
    state_manager: ConnectionStateManager = Depends(get_state_manager),
    session_id: str = Depends(get_session_id),
    request: Request = None
):
    """
    Phase 2: Upload files for a specific Hive partition.
    
    Called when the user selects a partition (table) in the UI.
    Uploads the parquet files for that partition and returns the schema.
    
    Args:
        partition_name: The partition value (e.g., "us", "eu")
        uploaded_files: Parquet files belonging to this partition
        
    Returns:
        Dict with columns list for the partition
    """
    service = ConnectionService(state_manager=state_manager, request=request)
    return await service.load_hive_partition(partition_name, uploaded_files, session_id)


@router.post("/add-files")
async def add_files_to_connection(
    uploaded_files: List[UploadFile] = File(...),
    state_manager: ConnectionStateManager = Depends(get_state_manager),
    session_id: str = Depends(get_session_id),
    request: Request = None,
):
    """
    Add more CSV/Parquet files to an existing file-based connection.

    Each uploaded file becomes a new queryable table in the active session.
    The connection must already be established via POST /connect.

    Args:
        uploaded_files: One or more CSV or Parquet files to add

    Returns:
        Dict with added_tables list (sanitized table names)
    """
    service = ConnectionService(state_manager=state_manager, request=request)
    return await service.add_files(uploaded_files, session_id)


@router.post("/disconnect")
async def disconnect_datasource(
    state_manager: ConnectionStateManager = Depends(get_state_manager),
    session_id: str = Depends(get_session_id),
    composite_key: str = Depends(get_composite_key),
    request: Request = None
):
    """Disconnect from the current data source and clean up temporary files."""
    service = ConnectionService(state_manager=state_manager, request=request)
    result = await service.disconnect(session_id)
    
    # Remove the tab session from storage after successful disconnect
    remove_session(composite_key)
    
    return result


@router.post("/disconnect-beacon")
async def disconnect_beacon(
    request: Request,
    body: BeaconDisconnectRequest
):
    """
    Handle disconnect beacon from browser's beforeunload event.
    
    This endpoint is called via navigator.sendBeacon() when a tab is closing.
    It cleans up the tab-specific session without requiring the full dependency chain.
    
    Note: Beacon requests don't include cookies reliably in all browsers,
    so we need to look up the session by tab_id alone if possible, or
    accept that some sessions may not be cleaned up (backend timeout handles this).
    """
    tab_id = body.tab_id
    session_id = request.cookies.get("session_id")
    
    if not session_id:
        logger.warning(f"Disconnect beacon received without session cookie for tab {tab_id}")
        return {"message": "No session cookie found", "cleaned_up": False}
    
    composite_key = get_composite_session_key(session_id, tab_id)

    if cleanup_session(composite_key):
        return {"message": "Session cleaned up", "cleaned_up": True}

    logger.debug(f"Beacon cleanup: session not found for key {composite_key}")
    return {"message": "Session not found", "cleaned_up": False}


@router.get("/debug/sessions")
async def debug_list_sessions():
    """
    Debug endpoint to list all active sessions.
    
    Returns information about all sessions including:
    - Session ID and Tab ID
    - Whether a connector is active
    - Connection type (if connected)
    - Creation and last access timestamps
    
    Note: This endpoint should be restricted in production environments.
    """
    sessions = list_active_sessions()
    return {
        "total_sessions": len(sessions),
        "sessions": sessions
    }


