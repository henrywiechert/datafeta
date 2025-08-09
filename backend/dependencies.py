"""FastAPI dependencies for managing application state (like current connection)."""

from typing import Optional, Dict
from fastapi import status, Depends, Request, Response
import duckdb
import logging
import uuid

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

    def set_state(
        self,
        connector: Optional[BaseConnector],
        details: Optional[ConnectionDetails],
        csv_temp_path: Optional[str] = None
    ):
        self.current_connector = connector
        self.current_connection_details = details
        self.current_csv_temp_path = csv_temp_path if details and details.type == 'csv' else None

    def clear_state(self):
        self.current_connector = None
        self.current_connection_details = None
        self.current_csv_temp_path = None

# Add logger for dependencies module
logger = logging.getLogger(__name__)

# --- Session-Based State Management --- #
# This dictionary will store state for each session, identified by a session ID.
# In a production environment, you might replace this with a more robust
# storage solution like Redis, especially if you have multiple server instances.
session_storage: Dict[str, ConnectionStateManager] = {}

# --- Dependency Functions --- #

async def get_session_cookie(request: Request) -> Optional[str]:
    """Dependency to safely get the session_id from the request cookie."""
    return request.cookies.get("session_id")

async def get_state_manager(
    request: Request,
    response: Response,
    session_id: Optional[str] = Depends(get_session_cookie)
) -> ConnectionStateManager:
    """
    Dependency to provide a session-specific connection state manager.
    It uses a cookie to identify the session. If no session ID is found,
    a new one is created and set in the response cookies.
    """
    if not session_id or session_id not in session_storage:
        # Create a new session if one doesn't exist
        session_id = str(uuid.uuid4())
        session_storage[session_id] = ConnectionStateManager()
        # Set the new session ID in the client's cookies
        response.set_cookie(key="session_id", value=session_id, httponly=True)
        logger.info(f"New session created with ID: {session_id}")
    else:
        logger.debug(f"Using existing session with ID: {session_id}")

    # Attach the session_id to the request state so other dependencies can access it
    # in the same request cycle.
    request.state.session_id = session_id

    return session_storage[session_id]

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