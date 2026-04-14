"""FastAPI dependency helpers for resolving session-scoped backend state."""

import logging
import uuid
from typing import Optional

from fastapi import Depends, Header, Request, Response, status

from backend.connectors.base import BaseConnector
from backend.exceptions import InvalidInputError
from backend.models.data_source import ConnectionDetails
from backend.session_state import (
    ConnectionStateManager,
    _session_storage_lock,
    get_composite_session_key,
    session_storage,
)


logger = logging.getLogger(__name__)


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
                logger.info("New tab session created: %s", composite_key)
    else:
        # Update last accessed time
        session_storage[composite_key].touch()
        logger.debug("Using existing tab session: %s", composite_key)

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