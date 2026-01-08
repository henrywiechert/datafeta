"""FastAPI dependencies for managing application state (like current connection)."""

from typing import Optional, Dict, List
from fastapi import status, Depends, Request, Response, Header
import asyncio
import threading
import duckdb
import logging
import uuid
from datetime import datetime, timezone

from backend.connectors.base import BaseConnector
from backend.models.data_source import ConnectionDetails
from backend.exceptions import InvalidInputError

# --- Simple State Manager Class --- #

class ConnectionStateManager:
    """Simple class to hold the current connection state."""
    def __init__(self):
        self.current_connector: Optional[BaseConnector] = None
        self.current_connection_details: Optional[ConnectionDetails] = None
        self.current_csv_temp_path: Optional[str] = None
        # Per-session async lock to serialize connect/disconnect
        self.lock: asyncio.Lock = asyncio.Lock()
        # Track when this session was created and last accessed
        self.created_at: datetime = datetime.now(timezone.utc)
        self.last_accessed_at: datetime = datetime.now(timezone.utc)

    def set_state(
        self,
        connector: Optional[BaseConnector],
        details: Optional[ConnectionDetails],
        csv_temp_path: Optional[str] = None
    ):
        self.current_connector = connector
        self.current_connection_details = details
        self.current_csv_temp_path = csv_temp_path if details and details.type == 'csv' else None
        self.last_accessed_at = datetime.now(timezone.utc)

    def clear_state(self):
        self.current_connector = None
        self.current_connection_details = None
        self.current_csv_temp_path = None
        self.last_accessed_at = datetime.now(timezone.utc)

    def touch(self):
        """Update last accessed timestamp."""
        self.last_accessed_at = datetime.now(timezone.utc)

# Add logger for dependencies module
logger = logging.getLogger(__name__)

# --- Session-Based State Management --- #
# This dictionary will store state for each session, identified by a composite key (session_id:tab_id).
# In a production environment, you might replace this with a more robust
# storage solution like Redis, especially if you have multiple server instances.
session_storage: Dict[str, ConnectionStateManager] = {}
# Global lock to guard session_storage mutations in multi-threaded servers
_session_storage_lock = threading.Lock()


def get_composite_session_key(session_id: str, tab_id: Optional[str]) -> str:
    """
    Generate a composite key for session storage.
    If tab_id is provided, creates a tab-specific session.
    If not, falls back to session-only key for backward compatibility.
    """
    if tab_id:
        return f"{session_id}:{tab_id}"
    return session_id


def list_active_sessions() -> List[dict]:
    """
    Return information about all active sessions for debugging purposes.
    """
    with _session_storage_lock:
        sessions = []
        for key, manager in session_storage.items():
            # Parse the composite key
            parts = key.split(':', 1)
            session_id = parts[0]
            tab_id = parts[1] if len(parts) > 1 else None
            
            sessions.append({
                'composite_key': key,
                'session_id': session_id,
                'tab_id': tab_id,
                'has_connector': manager.current_connector is not None,
                'connection_type': manager.current_connection_details.type if manager.current_connection_details else None,
                'csv_temp_path': manager.current_csv_temp_path,
                'created_at': manager.created_at.isoformat(),
                'last_accessed_at': manager.last_accessed_at.isoformat(),
            })
        return sessions


def remove_session(composite_key: str) -> bool:
    """
    Remove a session from storage by its composite key.
    Returns True if the session was found and removed, False otherwise.
    """
    with _session_storage_lock:
        if composite_key in session_storage:
            del session_storage[composite_key]
            logger.info(f"Removed session: {composite_key}")
            return True
        return False


# --- Dependency Functions --- #

async def get_session_cookie(request: Request) -> Optional[str]:
    """Dependency to safely get the session_id from the request cookie."""
    return request.cookies.get("session_id")


async def get_tab_id_header(x_tab_id: Optional[str] = Header(None)) -> Optional[str]:
    """Dependency to get the tab ID from the X-Tab-Id header."""
    return x_tab_id

async def get_state_manager(
    request: Request,
    response: Response,
    session_id: Optional[str] = Depends(get_session_cookie),
    tab_id: Optional[str] = Depends(get_tab_id_header)
) -> ConnectionStateManager:
    """
    Dependency to provide a session-specific connection state manager.
    It uses a cookie to identify the session and the X-Tab-Id header to
    isolate state per browser tab.
    
    The composite key (session_id:tab_id) ensures each browser tab has
    independent connection state, even within the same browser session.
    """
    # Ensure we have a session_id (create new if needed)
    if not session_id:
        session_id = str(uuid.uuid4())
        response.set_cookie(key="session_id", value=session_id, httponly=True)
        logger.info(f"New session cookie created: {session_id}")
    
    # Generate composite key for this session+tab combination
    composite_key = get_composite_session_key(session_id, tab_id)
    
    if composite_key not in session_storage:
        with _session_storage_lock:
            # Double-check after acquiring lock
            if composite_key not in session_storage:
                session_storage[composite_key] = ConnectionStateManager()
                logger.info(f"New tab session created: {composite_key}")
    else:
        # Update last accessed time
        session_storage[composite_key].touch()
        logger.debug(f"Using existing tab session: {composite_key}")

    # Attach identifiers to the request state for other dependencies
    request.state.session_id = session_id
    request.state.tab_id = tab_id
    request.state.composite_session_key = composite_key

    return session_storage[composite_key]

async def get_session_id(
    request: Request,
    _manager: ConnectionStateManager = Depends(get_state_manager)
) -> str:
    """
    Dependency to get the session ID, ensuring the state manager has been
    initialized first.
    """
    try:
        return request.state.session_id
    except AttributeError:
        # This is a safeguard and should not be reached if the dependency order is correct.
        raise RuntimeError("get_state_manager must be run before get_session_id.")


async def get_composite_key(
    request: Request,
    _manager: ConnectionStateManager = Depends(get_state_manager)
) -> str:
    """
    Dependency to get the composite session key (session_id:tab_id),
    ensuring the state manager has been initialized first.
    """
    try:
        return request.state.composite_session_key
    except AttributeError:
        raise RuntimeError("get_state_manager must be run before get_composite_key.")

async def get_active_connector(manager: ConnectionStateManager = Depends(get_state_manager)) -> BaseConnector:
    """Dependency to get the currently active connector. Raises InvalidInputError if not connected."""
    if not manager.current_connector:
        raise InvalidInputError(
            detail="Not connected to any data source.",
            status_code=status.HTTP_400_BAD_REQUEST
        )
    return manager.current_connector

async def get_connection_details(manager: ConnectionStateManager = Depends(get_state_manager)) -> ConnectionDetails:
    """Dependency to get the details of the current connection. Raises InvalidInputError if not connected."""
    if not manager.current_connection_details:
        raise InvalidInputError(
            detail="Not connected to any data source (missing details).",
            status_code=status.HTTP_400_BAD_REQUEST
        )
    return manager.current_connection_details 