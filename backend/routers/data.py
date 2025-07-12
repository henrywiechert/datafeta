"""API router for data source operations."""

import logging # Import logging
import shutil
import tempfile
import os
import json
from fastapi import APIRouter, Form, File, UploadFile, Depends, Body, status
from typing import Dict, Any, List, Optional
from pydantic import ValidationError

from backend.models.data_source import (
    ConnectionDetails, DatabaseListResponse, TableListResponse, ColumnListResponse
)
from backend.models.query import QueryDescription, QueryResult
from backend.services.query_service import QueryService
from backend.connectors.base import BaseConnector
from backend.connectors.file_connector import FileConnector
from backend.connectors.clickhouse_connector import ClickHouseConnector

# Import dependencies
from backend.dependencies import (
    get_state_manager,
    get_active_connector,
    get_connection_details,
    ConnectionStateManager
)

# Import custom exceptions
from backend.exceptions import (
    AppException, InvalidInputError, DataSourceConnectionError,
    QueryGenerationError, QueryExecutionError, FileProcessingError
)

# Get a logger for this module
logger = logging.getLogger(__name__)

router = APIRouter()

# Removed Globals:
# current_connector: BaseConnector = None
# current_connection_details: ConnectionDetails = None
# current_csv_temp_path: Optional[str] = None

# --- Constants --- #
# Keep UPLOAD_DIR here for now, or move to config/dependencies
UPLOAD_DIR = tempfile.mkdtemp(prefix="datafeta_csv_")

# --- Helper Functions --- #
def get_connector(connection_details: ConnectionDetails) -> BaseConnector:
    """Factory function to get the appropriate connector."""
    if connection_details.type == "csv":
        return FileConnector()
    elif connection_details.type == "clickhouse":
        return ClickHouseConnector()
    else:
        raise ValueError(f"Unsupported data source type for connector factory: {connection_details.type}")

# --- Endpoints --- #

@router.post("/connect", status_code=status.HTTP_200_OK)
async def connect_to_datasource(
    connection_details_json: str = Form(...),
    uploaded_file: Optional[UploadFile] = File(None),
    state_manager: ConnectionStateManager = Depends(get_state_manager)
):
    """Connect to a specified data source. For CSV, upload the file."""
    # Removed global access
    temp_file_path = None
    connection_details: ConnectionDetails

    # --- Reset previous state via StateManager --- START
    if state_manager.current_connector:
        state_manager.current_connector.disconnect()
    if state_manager.current_csv_temp_path and os.path.exists(state_manager.current_csv_temp_path):
        try:
            # Basic check to prevent deleting outside UPLOAD_DIR
            if os.path.commonpath([UPLOAD_DIR]) == os.path.commonpath([UPLOAD_DIR, state_manager.current_csv_temp_path]):
                os.remove(state_manager.current_csv_temp_path)
            else:
                # Log warning
                logger.warning(f"Refusing to delete file outside temp dir on connect: {state_manager.current_csv_temp_path}")
        except OSError as e:
             # Log error
             logger.error(f"Error cleaning up previous temp file {state_manager.current_csv_temp_path}", exc_info=True)
    # Clear state before attempting new connection
    state_manager.clear_state()
    # --- Reset previous state via StateManager --- END

    connector: Optional[BaseConnector] = None
    try:
        try:
            connection_details = ConnectionDetails.parse_raw(connection_details_json)
        except ValidationError as e:
            # Use InvalidInputError for Pydantic validation errors
            raise InvalidInputError(f"Invalid connection details format: {e}", status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)

        connect_args = {}
        effective_connection_details = connection_details.copy(deep=True)

        if connection_details.type == "csv":
            if not uploaded_file:
                raise InvalidInputError("A CSV file upload is required for type 'csv'")
            if not uploaded_file.filename or not uploaded_file.filename.lower().endswith('.csv'):
                 raise InvalidInputError("Invalid file type or missing filename. Only CSV files are allowed.")
            try:
                fd, temp_file_path = tempfile.mkstemp(suffix=".csv", dir=UPLOAD_DIR)
                os.close(fd)
                with open(temp_file_path, "wb") as buffer:
                    shutil.copyfileobj(uploaded_file.file, buffer)
                connect_args['file_path'] = temp_file_path
            except Exception as e:
                # Wrap file saving errors
                if temp_file_path and os.path.exists(temp_file_path):
                    os.remove(temp_file_path)
                raise FileProcessingError(f"Failed to save uploaded CSV file: {e}")
            finally:
                 if uploaded_file:
                     await uploaded_file.close()

        elif connection_details.type == "clickhouse":
            if connection_details.connection_string:
                 connect_args['connection_string'] = connection_details.connection_string
            elif connection_details.host:
                 ch_args = {
                     "host": connection_details.host,
                     "port": connection_details.port,
                     "user": connection_details.user,
                     "password": connection_details.password,
                     "database": connection_details.database,
                 }
                 connect_args = {k: v for k, v in ch_args.items() if v is not None}
            else:
                 raise InvalidInputError("Either connection_string or host must be provided for ClickHouse")
        else:
             # Unsupported type is an invalid input
             raise InvalidInputError(f"Unsupported data source type: {connection_details.type}")

        connector = get_connector(effective_connection_details)
        connector.connect(connect_args)

        state_manager.set_state(
            connector=connector,
            details=effective_connection_details,
            csv_temp_path=temp_file_path
        )

        return {"message": f"Successfully connected to {connection_details.type} source.", "file_path": temp_file_path if temp_file_path else None}

    except (InvalidInputError, FileProcessingError, DataSourceConnectionError) as e:
        # Expected errors: cleanup temp file, clear state, re-raise
        if temp_file_path and os.path.exists(temp_file_path):
             os.remove(temp_file_path)
        state_manager.clear_state() # This now also closes DuckDB conn
        # No need to call connector.disconnect() as state is cleared
        raise e
    except Exception as e:
        # Unexpected errors: cleanup temp file, clear state, log, raise generic 500
        if temp_file_path and os.path.exists(temp_file_path):
             os.remove(temp_file_path)
        state_manager.clear_state() # This now also closes DuckDB conn
        logger.exception(f"Unexpected error during connect")
        raise AppException("An unexpected server error occurred during connection.")

@router.post("/disconnect", status_code=status.HTTP_200_OK)
def disconnect_datasource(state_manager: ConnectionStateManager = Depends(get_state_manager)):
    """Disconnect from the current data source and clean up temporary files."""
    # Removed global access
    file_to_delete = state_manager.current_csv_temp_path

    if state_manager.current_connector:
        state_manager.current_connector.disconnect()

    # Clear state via manager
    state_manager.clear_state()

    # Clean up temp file if path was stored
    if file_to_delete and os.path.exists(file_to_delete):
         try:
            if os.path.commonpath([UPLOAD_DIR]) == os.path.commonpath([UPLOAD_DIR, file_to_delete]):
                os.remove(file_to_delete)
                # Log info
                logger.info(f"Deleted temp file: {file_to_delete}")
            else:
                 # Log warning
                 logger.warning(f"Refusing to delete file outside temp dir: {file_to_delete}")
         except OSError as e:
             # Log error
             logger.error(f"Error deleting temp file {file_to_delete}", exc_info=True)

    return {"message": "Successfully disconnected."}

@router.get("/databases", response_model=DatabaseListResponse)
def list_databases(
    connector: BaseConnector = Depends(get_active_connector),
    conn_details: ConnectionDetails = Depends(get_connection_details)
):
    """List databases for the current connection (if applicable)."""
    # Removed global access and explicit checks - handled by dependencies
    if conn_details.type == "csv":
         return DatabaseListResponse(databases=[])
    databases = connector.list_databases()
    return DatabaseListResponse(databases=databases)

@router.get("/tables", response_model=TableListResponse)
def list_tables(
    database: Optional[str] = None,
    connector: BaseConnector = Depends(get_active_connector),
    conn_details: ConnectionDetails = Depends(get_connection_details)
):
    """List tables for the current connection and selected database."""
    if conn_details.type == "clickhouse" and not database:
         raise InvalidInputError("'database' query parameter is required for ClickHouse connections.")
    tables = connector.list_tables(database=database)
    return TableListResponse(tables=tables)

@router.get("/columns", response_model=ColumnListResponse)
def list_columns(
    table: str,
    database: Optional[str] = None,
    connector: BaseConnector = Depends(get_active_connector),
    conn_details: ConnectionDetails = Depends(get_connection_details)
):
    """List columns for the selected table (and database if applicable)."""
    # Removed check for table existence - handled implicitly?
    # if not table: raise HTTPException(...) # FastAPI handles missing required query param

    if conn_details.type == "clickhouse" and not database:
        raise InvalidInputError("'database' query parameter is required for ClickHouse connections.")

    columns = connector.list_columns(database=database, table=table)
    return ColumnListResponse(columns=columns)

@router.post("/query", response_model=QueryResult, response_model_exclude_none=True)
def execute_query(
    query_desc_data: Dict[str, Any] = Body(...),
    connector: BaseConnector = Depends(get_active_connector),
    conn_details: ConnectionDetails = Depends(get_connection_details)
):
    """Translates a query description, executes it via the current connector, and returns results."""
    try:
        query_desc = QueryDescription.parse_obj(query_desc_data)
    except ValidationError as e:
        # Format the validation error for better readability
        error_details = json.dumps(e.errors(), indent=2)
        # Re-raise with a more user-friendly message, including validation details
        raise InvalidInputError(f"Invalid query description:\n{error_details}", status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)

    # Connection check handled by dependencies

    # --- Basic Validation --- #
    if conn_details.type == 'csv':
        expected_table = getattr(connector, '_table_name', None)
        if not expected_table or query_desc.target_table != expected_table:
             raise InvalidInputError(f"Query target table '{query_desc.target_table}' does not match connected CSV table '{expected_table}'.")
    elif conn_details.type == 'clickhouse':
        if not query_desc.target_database:
            raise InvalidInputError("target_database must be provided in the query description for ClickHouse.")

    # --- Generate SQL using QueryService --- #
    query_service = QueryService()
    sql_query: str
    db_type = conn_details.type

    try:
        sql_query = query_service.translate_to_sql(
            query_desc=query_desc,
            table_name=query_desc.target_table,
            db_type=db_type,
            with_sampling=True  # Enable sampling for large raw queries
        )
    except ValueError as e:
        raise QueryGenerationError(f"Query generation error: {e}")
    except Exception as e:
        print(f"Unexpected error during query translation: {e}")
        raise QueryGenerationError("Internal server error during query generation.")

    # --- Execute Query via Connector --- #
    try:
        columns, rows = connector.fetch_data(sql_query)
        return QueryResult(
            columns=columns,
            rows=rows,
            row_count=len(rows),
            query_sql=sql_query,
            error=None
        )
    except NotImplementedError as e:
        return QueryResult(columns=[], rows=[], row_count=0, error=str(e), query_sql=sql_query)
    except (QueryExecutionError, DataSourceConnectionError) as e:
        return QueryResult(columns=[], rows=[], row_count=0, error=f"Query execution error: {e}", query_sql=sql_query)
    except Exception as e:
        # Log unexpected error
        logger.exception(f"Unexpected error during query execution")
        raise QueryExecutionError("An unexpected server error occurred during query execution.")

# Consider adding a shutdown event handler to clean UPLOAD_DIR
# Needs access to app instance, usually done in main.py
# @app.on_event("shutdown")
# def shutdown_event():
#     try:
#         if os.path.exists(UPLOAD_DIR):
#              shutil.rmtree(UPLOAD_DIR)
#              print(f"Cleaned up temporary directory: {UPLOAD_DIR}")
#     except Exception as e:
#         print(f"Error cleaning up temp directory {UPLOAD_DIR}: {e}") 