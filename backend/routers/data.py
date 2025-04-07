"""API router for data source operations."""
from fastapi import APIRouter, HTTPException, Form, File, UploadFile, Depends, Body
from typing import Dict, Any, List, Optional
import shutil
import tempfile
import os
from pydantic import ValidationError

from backend.models.data_source import (
    ConnectionDetails, DatabaseListResponse, TableListResponse, ColumnListResponse
)
from backend.models.query import QueryDescription, QueryResult
from backend.services.query_service import QueryService
from backend.connectors.base import BaseConnector
from backend.connectors.csv_connector import CsvConnector
from backend.connectors.clickhouse_connector import ClickHouseConnector

router = APIRouter()

# Globals for connection state
current_connector: BaseConnector = None
current_connection_details: ConnectionDetails = None
current_csv_temp_path: Optional[str] = None # New global for CSV temp file path

# Temporary directory to store uploaded CSVs
# In a real app, consider a more robust storage solution and cleanup strategy
UPLOAD_DIR = tempfile.mkdtemp(prefix="datafeta_csv_")

def get_connector(connection_details: ConnectionDetails) -> BaseConnector:
    """Factory function to get the appropriate connector."""
    if connection_details.type == "csv":
        return CsvConnector()
    elif connection_details.type == "clickhouse":
        return ClickHouseConnector()
    else:
        raise ValueError(f"Unsupported data source type: {connection_details.type}")

@router.post("/connect", status_code=200)
async def connect_to_datasource(
    connection_details_json: str = Form(...), # Accept JSON string via Form
    uploaded_file: Optional[UploadFile] = File(None)
):
    """Connect to a specified data source. For CSV, upload the file."""
    global current_connector, current_connection_details, current_csv_temp_path # Add new global
    temp_file_path = None
    connection_details: ConnectionDetails

    print(connection_details_json)

    # --- Reset state before attempting connection --- START
    # Disconnect previous if exists
    if current_connector:
        current_connector.disconnect()
        current_connector = None
    # Clear previous temp file path if exists
    if current_csv_temp_path and os.path.exists(current_csv_temp_path):
        try:
            os.remove(current_csv_temp_path)
        except OSError as e:
             print(f"Error cleaning up previous temp file {current_csv_temp_path}: {e}")
    current_csv_temp_path = None
    current_connection_details = None
    # --- Reset state before attempting connection --- END

    try:
        # Parse the JSON string into the Pydantic model
        try:
            connection_details = ConnectionDetails.parse_raw(connection_details_json)
        except ValidationError as e:
            # Return 422 directly if JSON parsing/validation fails
            raise HTTPException(status_code=422, detail=f"Invalid connection details format: {e}")

        connect_args = {}
        effective_connection_details = connection_details.copy(deep=True)

        if connection_details.type == "csv":
            if not uploaded_file:
                raise HTTPException(status_code=400, detail="A CSV file upload is required for type 'csv'")
            if not uploaded_file.filename or not uploaded_file.filename.lower().endswith('.csv'):
                 raise HTTPException(status_code=400, detail="Invalid file type or missing filename. Only CSV files are allowed.")

            try:
                fd, temp_file_path = tempfile.mkstemp(suffix=".csv", dir=UPLOAD_DIR)
                os.close(fd)
                with open(temp_file_path, "wb") as buffer:
                    shutil.copyfileobj(uploaded_file.file, buffer)
                connect_args['file_path'] = temp_file_path
                # DO NOT store temp_file_path on effective_connection_details anymore
                # effective_connection_details.file_path = temp_file_path # REMOVED
            except Exception as e:
                if temp_file_path and os.path.exists(temp_file_path):
                    os.remove(temp_file_path)
                raise HTTPException(status_code=500, detail=f"Failed to save uploaded CSV file: {e}")
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
                 raise HTTPException(status_code=400, detail="Either connection_string or host must be provided for ClickHouse")
        else:
             raise HTTPException(status_code=400, detail=f"Unsupported data source type: {connection_details.type}")

        # Connect using the prepared args
        connector = get_connector(effective_connection_details)
        connector.connect(connect_args)

        # Update global state on SUCCESS
        current_connector = connector
        current_connection_details = effective_connection_details
        if connection_details.type == "csv":
            current_csv_temp_path = temp_file_path # Store temp path only if CSV connection succeeds
        else:
            current_csv_temp_path = None # Ensure it's None for non-CSV

        return {"message": f"Successfully connected to {connection_details.type} source.", "file_path": temp_file_path if temp_file_path else None}

    except (ValueError, ConnectionError, HTTPException) as e:
        # Ensure temp file is cleaned up on any connection failure
        if temp_file_path and os.path.exists(temp_file_path):
            os.remove(temp_file_path)
        # Reset globals as connection failed
        current_connector = None
        current_connection_details = None
        current_csv_temp_path = None
        if isinstance(e, HTTPException):
            raise e
        else:
            # Catch potential ValueErrors from get_connector as well
            raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        if temp_file_path and os.path.exists(temp_file_path):
            os.remove(temp_file_path)
        current_connector = None
        current_connection_details = None
        current_csv_temp_path = None
        # Log the full error for debugging
        print(f"Unexpected error during connect: {e}") # Consider proper logging
        raise HTTPException(status_code=500, detail=f"An unexpected server error occurred.")

@router.post("/disconnect", status_code=200)
def disconnect_datasource():
    """Disconnect from the current data source and clean up temporary files."""
    global current_connector, current_connection_details, current_csv_temp_path # Add new global

    file_to_delete = current_csv_temp_path # Use the specific global variable

    # Reset state first
    if current_connector:
        current_connector.disconnect()
        current_connector = None
    current_connection_details = None
    current_csv_temp_path = None # Reset temp path global

    # Clean up the temp file if path was stored
    if file_to_delete and os.path.exists(file_to_delete):
         try:
             # Basic check to prevent deleting outside UPLOAD_DIR
             if os.path.commonpath([UPLOAD_DIR]) == os.path.commonpath([UPLOAD_DIR, file_to_delete]):
                os.remove(file_to_delete)
                print(f"Deleted temp file: {file_to_delete}") # Optional logging
             else:
                 print(f"Refusing to delete file outside temp dir: {file_to_delete}")
         except OSError as e:
             print(f"Error deleting temp file {file_to_delete}: {e}")

    return {"message": "Successfully disconnected."}

@router.get("/databases", response_model=DatabaseListResponse)
def list_databases():
    """List databases for the current connection (if applicable)."""
    if not current_connector:
        raise HTTPException(status_code=400, detail="Not connected to any data source.")
    if current_connection_details.type == "csv":
         # CSV files don't have databases
         return DatabaseListResponse(databases=[])
    try:
        databases = current_connector.list_databases()
        return DatabaseListResponse(databases=databases)
    except (ConnectionError, RuntimeError) as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/tables", response_model=TableListResponse)
def list_tables(database: str = None):
    """List tables for the current connection and selected database."""
    if not current_connector:
        raise HTTPException(status_code=400, detail="Not connected to any data source.")
    if current_connection_details.type == "clickhouse" and not database:
         raise HTTPException(status_code=400, detail="'database' query parameter is required for ClickHouse connections.")

    try:
        # For CSV, database parameter is ignored
        tables = current_connector.list_tables(database=database)
        return TableListResponse(tables=tables)
    except (ConnectionError, RuntimeError, ValueError) as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/columns", response_model=ColumnListResponse)
def list_columns(table: str, database: str = None):
    """List columns for the selected table (and database if applicable)."""
    if not current_connector:
        raise HTTPException(status_code=400, detail="Not connected to any data source.")
    if not table:
        raise HTTPException(status_code=400, detail="'table' query parameter is required.")
    if current_connection_details.type == "clickhouse" and not database:
        raise HTTPException(status_code=400, detail="'database' query parameter is required for ClickHouse connections.")

    try:
        # For CSV, database parameter is ignored
        columns = current_connector.list_columns(database=database, table=table)
        return ColumnListResponse(columns=columns)
    except (ConnectionError, RuntimeError, ValueError) as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Query Endpoint --- #

@router.post("/query", response_model=QueryResult, response_model_exclude_none=True)
async def execute_query(query_desc: QueryDescription = Body(...)):
    """Translates a query description, executes it via the current connector, and returns results."""
    global current_connector, current_connection_details

    if not current_connector or not current_connection_details:
        raise HTTPException(status_code=400, detail="Not connected to any data source.")

    # --- Basic Validation --- #
    # Ensure target table/db in query description match the connection context if possible
    # This logic might need refinement based on how you manage selected table/db state globally

    # For CSV, the table name must match the one derived from the filename
    if current_connection_details.type == 'csv':
        # Assuming CsvConnector stores the table name in _table_name
        expected_table = getattr(current_connector, '_table_name', None)
        if not expected_table or query_desc.target_table != expected_table:
             raise HTTPException(
                status_code=400,
                detail=f"Query target table '{query_desc.target_table}' does not match connected CSV table '{expected_table}'."
            )
    # For ClickHouse, ensure a database was provided in the query description
    elif current_connection_details.type == 'clickhouse':
        if not query_desc.target_database:
            raise HTTPException(
                status_code=400,
                detail="target_database must be provided in the query description for ClickHouse."
            )
        # We could also potentially validate against current_connection_details.database if it was set during connection

    # --- Generate SQL using QueryService --- #
    query_service = QueryService()
    sql_query: str
    db_type = current_connection_details.type # Pass db_type for potential dialect handling

    try:
        # Validate QueryDescription using Pydantic (already done by FastAPI, but good practice)
        # query_desc = QueryDescription(**query_dict) # Already done by FastAPI

        # Translate to SQL
        sql_query = query_service.translate_to_sql(
            query_desc=query_desc,
            table_name=query_desc.target_table, # Use table from query desc
            db_type=db_type
        )

    except ValueError as e:
        # Catch translation errors (e.g., unsupported function, bad format)
        raise HTTPException(status_code=400, detail=f"Query generation error: {e}")
    except Exception as e:
        # Catch unexpected translation errors
        print(f"Unexpected error during query translation: {e}")
        raise HTTPException(status_code=500, detail="Internal server error during query generation.")

    # --- Execute Query via Connector --- #
    try:
        # Remove await, as fetch_data is synchronous for ClickHouse (and Base class)
        columns, rows = current_connector.fetch_data(sql_query)
        return QueryResult(
            columns=columns,
            rows=rows,
            row_count=len(rows),
            error=None
        )
    except NotImplementedError as e:
        # Handle connectors that haven't implemented fetch_data (like CSV currently)
        return QueryResult(
             columns=[],
             rows=[],
             row_count=0,
             error=str(e)
         )
    except (ConnectionError, RuntimeError) as e:
        # Handle errors during query execution by the connector
        return QueryResult(
            columns=[],
            rows=[],
            row_count=0,
            error=f"Query execution error: {e}"
        )
        # Or re-raise as HTTPException:
        # raise HTTPException(status_code=500, detail=f"Query execution error: {e}")
    except Exception as e:
        # Catch unexpected execution errors
        print(f"Unexpected error during query execution: {e}")
        return QueryResult(
             columns=[],
             rows=[],
             row_count=0,
             error="An unexpected server error occurred during query execution."
         )
        # Or re-raise:
        # raise HTTPException(status_code=500, detail="An unexpected server error occurred during query execution.") 