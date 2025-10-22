"""API router for data source operations."""

import logging # Import logging
import json
from fastapi import APIRouter, Form, File, UploadFile, Depends, Body, status, Request
from typing import Dict, Any, List, Optional
from pydantic import ValidationError

from backend.models.data_source import (
    ConnectionDetails, DatabaseListResponse, TableListResponse, ColumnListResponse
)
from backend.models.query import QueryDescription, QueryResult
from backend.services.query_service import QueryService
from backend.services.connection_service import ConnectionService
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

@router.get("/distinct-count")
def get_distinct_count(
    field: str,
    table: str,
    database: Optional[str] = None,
    regexPattern: Optional[str] = None,
    dateTimePart: Optional[str] = None,
    dateTimeMode: Optional[str] = None,
    connector: BaseConnector = Depends(get_active_connector),
    conn_details: ConnectionDetails = Depends(get_connection_details)
):
    """Get count of distinct values for a field, optionally filtered by a LIKE pattern."""
    if conn_details.type == "clickhouse" and not database:
        raise InvalidInputError("'database' query parameter is required for ClickHouse connections.")
    
    from pypika import Query, Table, functions as fn
    from pypika.terms import Term
    from pypika.functions import Cast
    from backend.services.query_service import QueryService
    
    # Custom term for COUNT(DISTINCT field)
    class CountDistinct(Term):
        def __init__(self, field_expr):
            super().__init__()
            self.field_expr = field_expr
        
        def get_sql(self, **kwargs):
            field_sql = self.field_expr.get_sql(**kwargs)
            return f"COUNT(DISTINCT {field_sql})"
    
    # Build the table reference
    if conn_details.type == 'clickhouse' and database:
        db_table = Table(table, schema=database)
    else:
        db_table = Table(table)
    
    # Determine the field to count
    query_service = QueryService()
    if dateTimePart and dateTimeMode:
        # For datetime parts, we need to extract the part first
        field_expr = query_service._get_datetime_part_expression(
            getattr(db_table, field), dateTimePart, dateTimeMode, conn_details.type
        )
    else:
        field_expr = getattr(db_table, field)
    
    # Build count query using custom CountDistinct
    count_expr = CountDistinct(field_expr)
    count_query = Query.from_(db_table).select(count_expr.as_('count'))
    
    # Apply regex filter if provided
    if regexPattern:
        # Convert to LIKE pattern: %pattern%
        like_pattern = f"%{regexPattern}%"
        if dateTimePart and dateTimeMode:
            # For datetime parts, apply LIKE to the extracted expression
            # Need to cast to string for LIKE comparison
            if conn_details.type == 'clickhouse':
                count_query = count_query.where(
                    Cast(field_expr, 'String').like(like_pattern)
                )
            else:
                # DuckDB
                count_query = count_query.where(
                    Cast(field_expr, 'VARCHAR').like(like_pattern)
                )
        else:
            # Regular field - apply LIKE directly
            count_query = count_query.where(field_expr.like(like_pattern))
    
    # Execute query with appropriate quote character
    quote_char = '`' if conn_details.type == 'clickhouse' else '"'
    sql = count_query.get_sql(quote_char=quote_char)
    logger.info(f"Executing distinct count query: {sql}")
    
    try:
        columns, rows = connector.fetch_data(sql)
        logger.info(f"Count query returned {len(rows)} rows. Columns: {columns}")
        
        if rows and len(rows) > 0:
            row = rows[0]
            logger.info(f"First row: {row}, type: {type(row)}")
            
            if isinstance(row, dict):
                # Try multiple possible key names
                # ClickHouse returns 'uniqExact(field)' or similar for COUNT(DISTINCT)
                # We aliased it as 'count' but ClickHouse might ignore the alias
                count = (
                    row.get('count') or 
                    row.get('COUNT(DISTINCT') or 
                    row.get(f'uniqExact({field})') or
                    # Fallback: get the first value in the dict
                    (list(row.values())[0] if row else 0)
                )
                logger.info(f"Extracted count from dict: {count}, keys: {row.keys()}")
            elif isinstance(row, (list, tuple)):
                count = row[0] if len(row) > 0 else 0
                logger.info(f"Extracted count from list/tuple: {count}")
            else:
                count = int(row)
                logger.info(f"Converted row to int: {count}")
            
            logger.info(f"Returning count: {count}")
            return {"count": count}
        
        logger.warning("No rows returned from count query")
        return {"count": 0}
    except Exception as e:
        logger.exception(f"Error executing distinct count query: {sql}")
        raise QueryExecutionError(f"Failed to count distinct values: {str(e)}")

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
    if conn_details.type == 'csv':
        expected_table = getattr(connector, '_table_name', None)
        if not expected_table or query_desc.target_table != expected_table:
             raise InvalidInputError(f"Query target table '{query_desc.target_table}' does not match connected CSV table '{expected_table}'.")
    elif conn_details.type == 'clickhouse':
        if not query_desc.target_database:
            raise InvalidInputError("target_database must be provided in the query description for ClickHouse.")

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
        
        # Extract optimization metadata
        optimization_metadata = extended_metadata.get('optimizations', [])
        hints_used = extended_metadata.get('hints_used')
        override = extended_metadata.get('override')
        
        # Calculate reduction factor if optimization was applied
        reduction_factor = None
        original_estimate = None
        if optimization_metadata:
            # For now, just use the estimated reduction from metadata
            # In Phase 3, we'll add actual estimation queries
            for opt in optimization_metadata:
                if opt.get('reduction'):
                    reduction_factor = opt['reduction']
                    break
        
        # Calculate result dimensions
        from backend.models.query import ResultDimensions
        row_count = len(rows)
        column_count = len(columns)
        result_dimensions = ResultDimensions(
            rows=row_count,
            columns=column_count,
            size_display=f"{row_count:,} × {column_count}"
        )
        
        return QueryResult(
            columns=columns,
            rows=rows,
            row_count=row_count,
            query_sql=sql_query,
            error=None,
            optimizations_applied=optimization_metadata if optimization_metadata else None,
            original_estimate=original_estimate,
            reduction_factor=reduction_factor,
            optimization_hints_used=hints_used,
            optimization_override=override,
            result_dimensions=result_dimensions
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

# Upload root cleanup is handled in app shutdown in backend/main.py