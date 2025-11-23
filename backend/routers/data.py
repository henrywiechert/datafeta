"""API router for data source operations."""

import logging # Import logging
import json
from fastapi import APIRouter, Form, File, UploadFile, Depends, Body, status, Request
from typing import Dict, Any, List, Optional
from pydantic import ValidationError

from backend.models.data_source import (
    ConnectionDetails, DatabaseListResponse, TableListResponse, ColumnListResponse,
    TableRelationshipsResponse, MergedColumnsResponse, VirtualTableDefinition, Column
)
from backend.models.query import QueryDescription, QueryResult
from backend.services.query_service import QueryService
from backend.services.connection_service import ConnectionService
from backend.services.table_merge_service import TableMergeService
from backend.services.query_result_builder import QueryResultBuilder
from backend.services.validation_service import ValidationService
from backend.connectors.base import BaseConnector

# Import dependencies
from backend.dependencies import (
    get_state_manager,
    get_active_connector,
    get_connection_details,
    ConnectionStateManager,
    get_session_id
)

# Import custom exceptions
from backend.exceptions import (
    InvalidInputError, DataSourceConnectionError,
    QueryGenerationError, QueryExecutionError
)

# Get a logger for this module
logger = logging.getLogger(__name__)

router = APIRouter()

# Removed Globals:
# current_connector: BaseConnector = None
# current_connection_details: ConnectionDetails = None
# current_csv_temp_path: Optional[str] = None

# --- Constants --- #
# Upload root is now managed in app state (see backend/main.py startup)

"""Router helpers are now provided by ConnectionService; keep router thin."""

# --- Endpoints --- #

@router.post("/connect")
async def connect_to_datasource(
    connection_details_json: str = Form(...),
    uploaded_file: Optional[UploadFile] = File(None),
    state_manager: ConnectionStateManager = Depends(get_state_manager),
    session_id: str = Depends(get_session_id),
    request: Request = None
):
    """Connect to a specified data source. For CSV, upload the file."""
    service = ConnectionService(state_manager=state_manager, request=request)
    return await service.connect_multipart(connection_details_json, uploaded_file, session_id)

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
    request: Request = None
):
    """Disconnect from the current data source and clean up temporary files."""
    service = ConnectionService(state_manager=state_manager, request=request)
    return await service.disconnect(session_id)

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
    ValidationService.require_database_for_clickhouse(database, conn_details, "listing tables")
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
    ValidationService.require_database_for_clickhouse(database, conn_details, "listing columns")

    columns = connector.list_columns(database=database, table=table)
    
    # Always add _source_database and _source_table virtual columns
    # These are always available to prevent charts from breaking when unions are removed
    source_database_column = Column(
        name='_source_database',
        data_type='String',
        is_datetime=False,
        table_name=None
    )
    source_table_column = Column(
        name='_source_table',
        data_type='String',
        is_datetime=False,
        table_name=None
    )
    columns.append(source_database_column)
    columns.append(source_table_column)
    
    return ColumnListResponse(columns=columns)

@router.post("/distinct-count")
def get_distinct_count(
    request_data: Dict[str, Any] = Body(...),
    connector: BaseConnector = Depends(get_active_connector),
    conn_details: ConnectionDetails = Depends(get_connection_details)
):
    """Get count of distinct values for a field, optionally filtered by a LIKE pattern.
    
    Now accepts POST to support virtual column definitions.
    """
    from backend.services.cardinality_service import CardinalityService
    from backend.models.data_source import VirtualColumnDefinition
    
    # Extract parameters
    field = request_data.get('field')
    table = request_data.get('table')
    database = request_data.get('database')
    regex_pattern = request_data.get('regexPattern')
    datetime_part = request_data.get('dateTimePart')
    datetime_mode = request_data.get('dateTimeMode')
    union_tables = request_data.get('unionTables')
    
    # Parse virtual columns if provided
    virtual_columns = None
    if 'virtualColumns' in request_data and request_data['virtualColumns']:
        virtual_columns = [
            VirtualColumnDefinition.parse_obj(vc) 
            for vc in request_data['virtualColumns']
        ]
    
    service = CardinalityService(connector, conn_details)
    count = service.get_distinct_count(
        field=field,
        table=table,
        database=database,
        regex_pattern=regex_pattern,
        datetime_part=datetime_part,
        datetime_mode=datetime_mode,
        union_tables=union_tables,
        virtual_columns=virtual_columns
    )
    
    return {"count": count}

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
        logger.error(f"Query validation failed: {error_details}")
        # Re-raise with a more user-friendly message, including validation details
        raise InvalidInputError(f"Invalid query description:\n{error_details}", status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)

    # Connection check handled by dependencies

    # --- Basic Validation --- #
    ValidationService.validate_csv_table_match(query_desc.target_table, connector, conn_details)
    ValidationService.require_target_database_for_clickhouse(query_desc, conn_details)

    # --- Generate SQL using QueryService with Optimization --- #
    query_service = QueryService()
    sql_query: str
    optimization_metadata = []
    db_type = conn_details.type

    try:
        # Initialize optimizer
        from backend.services.optimization.optimizer import QueryOptimizer
        from backend.services.optimization.config import OptimizerConfig
        
        config = OptimizerConfig.from_env()
        optimizer = QueryOptimizer(connector, config)
        
        # Translate query with optimization
        sql_query, extended_metadata = query_service.translate_to_sql(
            query_desc=query_desc,
            table_name=query_desc.target_table,
            db_type=db_type,
            with_sampling=True,  # Enable sampling for large raw queries
            with_optimization=True,  # Enable query optimizations
            optimizer=optimizer
        )
    except ValueError as e:
        raise QueryGenerationError(f"Query generation error: {e}")
    except Exception as e:
        logger.exception(f"Unexpected error during query translation")
        raise QueryGenerationError("Internal server error during query generation.")

    # --- Execute Query via Connector --- #
    try:
        columns, rows = connector.fetch_data(sql_query)
        
        # Build result using QueryResultBuilder
        result_builder = QueryResultBuilder()
        return result_builder.build_result(
            columns=columns,
            rows=rows,
            sql_query=sql_query,
            extended_metadata=extended_metadata
        )
    except NotImplementedError as e:
        # Treat as a 501-like scenario via QueryExecutionError
        raise QueryExecutionError(str(e))
    except (QueryExecutionError, DataSourceConnectionError):
        # Re-raise known typed exceptions for global handlers
        raise
    except Exception as e:
        # Log unexpected error
        logger.exception(f"Unexpected error during query execution")
        raise QueryExecutionError("An unexpected server error occurred during query execution.")

# --- Multi-Table Support Endpoints --- #

@router.get("/table-relationships", response_model=TableRelationshipsResponse)
def get_table_relationships(
    database: str,
    connector: BaseConnector = Depends(get_active_connector),
    conn_details: ConnectionDetails = Depends(get_connection_details)
):
    """
    Detect and return foreign key relationships in a database.
    Uses heuristics (column naming patterns) for databases that don't have formal FK constraints.
    """
    try:
        relationships = connector.detect_foreign_keys(database)
        logger.info(f"Detected {len(relationships)} relationships in database '{database}'")
        return TableRelationshipsResponse(relationships=relationships)
    except Exception as e:
        logger.error(f"Error detecting relationships: {e}")
        raise DataSourceConnectionError(f"Failed to detect table relationships: {e}")

@router.get("/suggested-joins")
def get_suggested_joins(
    database: str,
    primary_table: str,
    connector: BaseConnector = Depends(get_active_connector),
    conn_details: ConnectionDetails = Depends(get_connection_details)
):
    """
    Get suggested tables that can be joined to a primary table.
    Returns list of table names with detected relationships.
    """
    try:
        merge_service = TableMergeService(connector)
        suggested_tables = merge_service.get_suggested_tables(database, primary_table)
        logger.info(f"Found {len(suggested_tables)} joinable tables for '{primary_table}'")
        return {
            "primary_table": primary_table,
            "suggested_tables": suggested_tables
        }
    except Exception as e:
        logger.error(f"Error getting suggested joins: {e}")
        raise DataSourceConnectionError(f"Failed to get suggested joins: {e}")

@router.get("/suggested-unions")
def get_suggested_unions(
    database: str,
    primary_table: str,
    connector: BaseConnector = Depends(get_active_connector),
    conn_details: ConnectionDetails = Depends(get_connection_details)
):
    """
    DEPRECATED: This endpoint is deprecated in favor of manual table selection.
    
    Previously returned tables with matching schemas that could be combined with UNION ALL.
    Now returns empty list as cross-database UNION ALL uses manual selection.
    """
    logger.warning("Deprecated endpoint /suggested-unions called - returning empty list")
    return {
        "primary_table": primary_table,
        "suggested_tables": []
    }

@router.post("/merged-columns", response_model=MergedColumnsResponse)
def get_merged_columns(
    database: str,
    primary_table: str,
    joined_tables: Optional[List[str]] = Body(None),
    union_tables: Optional[List] = Body(None),
    auto_detect: bool = Body(True),
    connector: BaseConnector = Depends(get_active_connector),
    conn_details: ConnectionDetails = Depends(get_connection_details)
):
    """
    Get a merged column list from multiple tables (supports cross-database UNION).
    
    Supports two modes:
    - JOIN mode: Tables with different schemas, columns get table prefixes
    - UNION mode: Flexible schemas with NULL fill, adds _source_database and _source_table columns
    
    Args:
        database: Default database name (for primary table)
        primary_table: Primary/main table
        joined_tables: Optional list of tables to join (JOIN mode)
        union_tables: Optional list of union table definitions (UNION mode)
                     Format: [{"database": "db1", "table_name": "orders"}, ...]
                     Legacy format: ["table1", "table2"] (uses default database)
        auto_detect: Whether to auto-detect joins (default: True, for JOIN mode only)
    
    Returns:
        MergedColumnsResponse with columns and virtual table definition
    """
    try:
        merge_service = TableMergeService(connector)
        return merge_service.get_merged_columns_with_virtual(
            database=database,
            primary_table=primary_table,
            joined_tables=joined_tables,
            union_tables=union_tables,
            auto_detect=auto_detect
        )
    except Exception as e:
        logger.error(f"Error creating merged columns: {e}")
        raise DataSourceConnectionError(f"Failed to create merged columns: {e}")

# Upload root cleanup is handled in app shutdown in backend/main.py