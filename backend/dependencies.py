"""FastAPI dependencies for managing application state (like current connection)."""

from typing import Optional
from fastapi import status, Depends
import duckdb
import logging

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
        # Add holder for persistent DuckDB connection for FileConnector
        self.duckdb_connection: Optional[duckdb.DuckDBPyConnection] = None

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
        # Keep the logic here to close the connection when state is cleared
        if self.duckdb_connection:
            try:
                self.duckdb_connection.close()
                logger.info("Closed persistent DuckDB connection.")
            except Exception as e:
                logger.error(f"Error closing persistent DuckDB connection: {e}")
            self.duckdb_connection = None

        self.current_connector = None
        self.current_connection_details = None
        self.current_csv_temp_path = None

# Add logger for dependencies module
logger = logging.getLogger(__name__)

# --- Global Instance (Singleton Pattern) --- #
# This single instance will be shared across requests.
# For more complex scenarios or true per-user state, other mechanisms like
# sessions or request state might be needed.
connection_state_manager = ConnectionStateManager()

# --- Dependency Functions --- #

async def get_state_manager() -> ConnectionStateManager:
    """Dependency to provide the global connection state manager."""
    return connection_state_manager

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