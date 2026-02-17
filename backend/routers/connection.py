"""API router for connection management operations."""

import logging
from typing import List, Optional

from fastapi import APIRouter, Body, Depends, File, Form, Request, UploadFile
from pydantic import BaseModel

from backend.dependencies import (
    ConnectionStateManager,
    get_session_id,
    get_state_manager,
    get_composite_key,
    list_active_sessions,
    remove_session,
    get_composite_session_key,
    session_storage,
    _session_storage_lock,
)
from backend.models.data_source import ConnectionDetails
from backend.services.connection_service import ConnectionService

logger = logging.getLogger(__name__)

router = APIRouter()


class BeaconDisconnectRequest(BaseModel):
    """Request body for the disconnect beacon endpoint."""
    tab_id: str


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
    
    with _session_storage_lock:
        if composite_key in session_storage:
            manager = session_storage[composite_key]
            
            # Clean up the connection
            if manager.current_connector:
                try:
                    manager.current_connector.disconnect()
                except Exception as e:
                    logger.warning(f"Error disconnecting connector during beacon cleanup: {e}")
            
            # Clean up all temp files (supports multi-file uploads)
            import os
            import shutil
            for temp_path in manager.current_temp_paths:
                if temp_path:
                    try:
                        if os.path.isfile(temp_path):
                            os.remove(temp_path)
                            logger.debug(f"Deleted temp file during beacon cleanup: {temp_path}")
                        elif os.path.isdir(temp_path):
                            shutil.rmtree(temp_path)
                            logger.debug(f"Deleted temp directory during beacon cleanup: {temp_path}")
                    except Exception as e:
                        logger.warning(f"Error cleaning up temp path during beacon cleanup: {e}")
            
            # Remove from storage
            del session_storage[composite_key]
            logger.info(f"Beacon cleanup completed for session: {composite_key}")
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


