"""API router for data source operations."""

import logging # Import logging
import json
import pyarrow as pa
from fastapi import APIRouter, Form, File, UploadFile, Depends, Body, status, Request
from fastapi.responses import Response
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
    
    # Parse virtual table if provided (for JOIN support)
    from backend.models.data_source import VirtualTableDefinition
    virtual_table = None
    if 'virtualTable' in request_data and request_data['virtualTable']:
        virtual_table = VirtualTableDefinition.parse_obj(request_data['virtualTable'])
    
    service = CardinalityService(connector, conn_details)
    count = service.get_distinct_count(
        field=field,
        table=table,
        database=database,
        regex_pattern=regex_pattern,
        datetime_part=datetime_part,
        datetime_mode=datetime_mode,
        union_tables=union_tables,
        virtual_columns=virtual_columns,
        virtual_table=virtual_table
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
            optimizer=optimizer,
            connector=connector  # Pass connector for union table column filtering
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


@router.post("/query-arrow")
def execute_query_arrow(
    query_desc_data: Dict[str, Any] = Body(...),
    connector: BaseConnector = Depends(get_active_connector),
    conn_details: ConnectionDetails = Depends(get_connection_details)
):
    """
    Translates a query description, executes it via the current connector, 
    and returns results in Apache Arrow IPC streaming format.
    
    This is more efficient for large datasets compared to JSON:
    - ~60-70% smaller payload (binary vs text)
    - Zero-copy parsing possible on client
    - Type fidelity preserved (int64, float64, etc.)
    
    Returns:
        Binary Arrow IPC stream with media type application/vnd.apache.arrow.stream
    """
    try:
        query_desc = QueryDescription.parse_obj(query_desc_data)
    except ValidationError as e:
        error_details = json.dumps(e.errors(), indent=2)
        logger.error(f"Query validation failed: {error_details}")
        raise InvalidInputError(f"Invalid query description:\n{error_details}", status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)

    # --- Basic Validation --- #
    ValidationService.validate_csv_table_match(query_desc.target_table, connector, conn_details)
    ValidationService.require_target_database_for_clickhouse(query_desc, conn_details)

    # --- Generate SQL using QueryService with Optimization --- #
    query_service = QueryService()
    db_type = conn_details.type

    try:
        from backend.services.optimization.optimizer import QueryOptimizer
        from backend.services.optimization.config import OptimizerConfig
        
        config = OptimizerConfig.from_env()
        optimizer = QueryOptimizer(connector, config)
        
        sql_query, extended_metadata = query_service.translate_to_sql(
            query_desc=query_desc,
            table_name=query_desc.target_table,
            db_type=db_type,
            with_sampling=True,
            with_optimization=True,
            optimizer=optimizer,
            connector=connector
        )
    except ValueError as e:
        raise QueryGenerationError(f"Query generation error: {e}")
    except Exception as e:
        logger.exception(f"Unexpected error during query translation")
        raise QueryGenerationError("Internal server error during query generation.")

    # --- Execute Query via Connector and get Arrow table --- #
    try:
        arrow_table = connector.fetch_data_arrow(sql_query)
        
        # Serialize Arrow table to IPC streaming format
        sink = pa.BufferOutputStream()
        with pa.ipc.new_stream(sink, arrow_table.schema) as writer:
            writer.write_table(arrow_table)
        
        arrow_bytes = sink.getvalue().to_pybytes()
        
        logger.info(f"Returning Arrow IPC response: {len(arrow_bytes)} bytes, {arrow_table.num_rows} rows, {arrow_table.num_columns} columns")
        
        # Base64 encode SQL to safely include in headers (handles newlines, unicode, etc.)
        import base64
        sql_b64 = base64.b64encode(sql_query.encode('utf-8')).decode('ascii')
        
        return Response(
            content=arrow_bytes,
            media_type="application/vnd.apache.arrow.stream",
            headers={
                "X-Arrow-Row-Count": str(arrow_table.num_rows),
                "X-Arrow-Column-Count": str(arrow_table.num_columns),
                "X-Query-Sql-Base64": sql_b64,
            }
        )
    except NotImplementedError as e:
        raise QueryExecutionError(str(e))
    except (QueryExecutionError, DataSourceConnectionError):
        raise
    except Exception as e:
        logger.exception(f"Unexpected error during Arrow query execution")
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
    joined_tables: Optional[str] = None,  # Comma-separated list of already-joined tables
    connector: BaseConnector = Depends(get_active_connector),
    conn_details: ConnectionDetails = Depends(get_connection_details)
):
    """
    Get suggested tables that can be joined to a primary table or already-joined tables.
    Returns list of table names with detected relationships.
    
    Args:
        database: Database name
        primary_table: Primary table name
        joined_tables: Optional comma-separated list of already-joined table names
                      (to find additional tables that can join to them)
    """
    try:
        merge_service = TableMergeService(connector)
        
        # Parse joined_tables if provided
        joined_table_list = []
        if joined_tables:
            joined_table_list = [t.strip() for t in joined_tables.split(',') if t.strip()]
        
        suggested_tables = merge_service.get_suggested_tables(
            database, 
            primary_table,
            already_joined=joined_table_list
        )
        logger.info(f"Found {len(suggested_tables)} joinable tables for '{primary_table}' (with {len(joined_table_list)} already joined)")
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

# --- Kaggle-Specific Endpoints --- #

# Cache for Kaggle search results (to avoid repeated API calls and rate limits)
import hashlib
import time
import threading
from typing import Dict, Any, Optional

class KaggleSearchCache:
    """Simple TTL cache for Kaggle search results."""
    def __init__(self, ttl_seconds: int = 600, max_size: int = 100):
        self.ttl = ttl_seconds
        self.max_size = max_size
        self.cache: Dict[str, Dict[str, Any]] = {}  # key -> {results, timestamp}
        self.lock = threading.Lock()
    
    def get(self, key: str) -> Optional[Dict[str, Any]]:
        with self.lock:
            if key not in self.cache:
                return None
            entry = self.cache[key]
            if time.time() - entry['timestamp'] > self.ttl:
                del self.cache[key]
                return None
            return entry['results']
    
    def set(self, key: str, results: Dict[str, Any]) -> None:
        with self.lock:
            # Simple eviction: remove oldest if at capacity
            if key not in self.cache and len(self.cache) >= self.max_size:
                oldest_key = min(self.cache.keys(), key=lambda k: self.cache[k]['timestamp'])
                del self.cache[oldest_key]
            self.cache[key] = {'results': results, 'timestamp': time.time()}

# Global cache for Kaggle search results (10 minute TTL, max 100 searches)
_kaggle_search_cache = KaggleSearchCache(ttl_seconds=600, max_size=100)

@router.post("/kaggle/search")
async def search_kaggle_datasets(
    search_request: Dict[str, Any] = Body(...)
):
    """
    Search public Kaggle datasets.
    
    Request body:
        username: Kaggle username
        api_key: Kaggle API key
        search_query: Search keywords or dataset reference (owner/dataset-name)
        max_results: Maximum number of results to return (default: 100, max: 1000)
    
    Returns list of matching datasets with metadata.
    
    Optimizations to reduce API calls and avoid rate limits:
    - Results are cached for 10 minutes (per user + query combination)
    - File counts are only fetched for the first 50 datasets
    - Small delays added between file listing calls (500ms per 10 calls)
    - Stops fetching file counts if rate limit is hit
    
    Note: If search_query looks like a dataset reference (contains '/'),
    it will attempt direct lookup. Otherwise, uses Kaggle API keyword search.
    """
    import re
    import json
    
    username = search_request.get('username')
    api_key = search_request.get('api_key')
    search_query = search_request.get('search_query', '').strip()
    max_results = min(search_request.get('max_results', 100), 1000)  # Cap at 1000, default 100
    
    if not username or not api_key:
        raise InvalidInputError("Kaggle username and API key are required")
    
    # Create cache key based on username and search query (max_results affects results)
    cache_key = f"kaggle_search:{username}:{search_query}:{max_results}"
    cache_key_hash = hashlib.md5(cache_key.encode()).hexdigest()
    
    # Check cache first
    cached_results = _kaggle_search_cache.get(cache_key_hash)
    if cached_results is not None:
        logger.info(f"Returning cached results for search '{search_query}' ({len(cached_results['datasets'])} datasets)")
        return cached_results
    
    try:
        # Monkey-patch exit() to prevent Kaggle library from calling sys.exit()
        import builtins
        original_exit = builtins.exit
        builtins.exit = lambda *args, **kwargs: None
        
        try:
            from kaggle.api.kaggle_api_extended import KaggleApi
        finally:
            # Restore original exit
            builtins.exit = original_exit
        
        # Authenticate with Kaggle (also patch exit during authenticate call)
        api = KaggleApi()
        api.username = username
        api.key = api_key
        
        # Patch exit again for authenticate() call
        builtins.exit = lambda *args, **kwargs: None
        try:
            api.authenticate()
        finally:
            builtins.exit = original_exit
        
        all_datasets = []
        
        # Check if search_query looks like a dataset reference (contains '/')
        if search_query and '/' in search_query:
            # Try direct dataset lookup first
            try:
                logger.info(f"Attempting direct lookup for dataset: {search_query}")
                dataset_metadata = api.dataset_metadata(search_query, path=None)
                # If successful, create a dataset-like object
                # We'll add this to results after the search
                direct_match = type('obj', (object,), {
                    'ref': search_query,
                    'title': dataset_metadata.get('title', search_query),
                    'isPrivate': False,
                    'size': dataset_metadata.get('totalBytes', 0),
                })()
                all_datasets.append(direct_match)
                logger.info(f"Direct lookup successful for {search_query}")
            except Exception as direct_error:
                logger.debug(f"Direct lookup failed for {search_query}: {direct_error}")
                # Fall through to regular search
        
        # Fetch datasets with pagination
        # Note: Kaggle API internally limits results, but we can try to get more
        page = 1
        
        while len(all_datasets) < max_results:
            try:
                # Use sort_by='hottest' for most relevant results
                # But if search_query is empty, don't sort to get more variety
                # Note: The Kaggle API doesn't expose a page_size parameter in dataset_list
                # It internally uses a fixed page size, so we rely on pagination
                datasets = api.dataset_list(
                    search=search_query if search_query else None,
                    page=page,
                    sort_by='hottest' if search_query else 'published'
                )
                
                if not datasets:
                    break  # No more results
                
                all_datasets.extend(datasets)
                
                # Kaggle API returns fixed-size pages (typically 20 results)
                # If we got fewer results, we've likely reached the end
                if len(datasets) < 20:
                    break
                
                page += 1
                
            except Exception as page_error:
                logger.warning(f"Error fetching page {page}: {page_error}")
                break  # Stop pagination on error
        
        # Trim to max_results
        all_datasets = all_datasets[:max_results]
        
        results = []
        seen_refs = set()  # Track seen dataset refs to avoid duplicates
        rate_limit_hit = False
        file_list_call_count = 0  # Track API calls to add delays
        MAX_FILE_LIST_CALLS = 50  # Limit file listing to first 50 datasets to avoid rate limits
        
        for dataset in all_datasets:
            # Skip duplicates
            if dataset.ref in seen_refs:
                continue
            seen_refs.add(dataset.ref)
            
            # Skip private datasets
            if hasattr(dataset, 'isPrivate') and dataset.isPrivate:
                continue
            
            # Get file count for CSV files (skip if we've hit rate limits or exceeded max calls)
            csv_file_count = None  # None means "unknown"
            if not rate_limit_hit and file_list_call_count < MAX_FILE_LIST_CALLS:
                try:
                    # Add a small delay every 10 API calls to avoid rate limits
                    # Kaggle API typically allows ~100 calls per minute
                    if file_list_call_count > 0 and file_list_call_count % 10 == 0:
                        import asyncio
                        await asyncio.sleep(0.5)  # 500ms delay
                    
                    files = api.dataset_list_files(dataset.ref).files
                    csv_file_count = sum(1 for f in files if f.name.lower().endswith('.csv'))
                    file_list_call_count += 1
                except Exception as file_error:
                    error_msg = str(file_error)
                    # If we get a 403 error, skip this dataset as it's not accessible
                    if '403' in error_msg or 'Forbidden' in error_msg:
                        logger.debug(f"Skipping dataset {dataset.ref} - 403 Forbidden when listing files")
                        continue
                    # If we hit rate limits, stop trying to list files for remaining datasets
                    elif '429' in error_msg or 'Too Many Requests' in error_msg:
                        logger.warning(f"Rate limit hit while listing files for {dataset.ref}. File counts will be unavailable for remaining datasets.")
                        rate_limit_hit = True
                        csv_file_count = None
                    else:
                        # For other errors, just set count to unknown
                        logger.debug(f"Error listing files for {dataset.ref}: {error_msg}")
                        csv_file_count = None
            elif file_list_call_count >= MAX_FILE_LIST_CALLS and not rate_limit_hit:
                # Log once when we hit the limit
                logger.info(f"Reached file listing limit ({MAX_FILE_LIST_CALLS} datasets). Remaining datasets will not have file counts.")
                rate_limit_hit = True  # Reuse flag to prevent further attempts
            
            # Convert size to MB (use size attribute if available, otherwise 0)
            size_mb = 0
            if hasattr(dataset, 'size'):
                size_mb = round(dataset.size / (1024 * 1024), 2) if dataset.size else 0
            elif hasattr(dataset, 'totalBytes'):
                size_mb = round(dataset.totalBytes / (1024 * 1024), 2) if dataset.totalBytes else 0
            
            # Get last updated date if available
            last_updated = None
            if hasattr(dataset, 'lastUpdated') and dataset.lastUpdated:
                last_updated = str(dataset.lastUpdated)
            elif hasattr(dataset, 'last_updated') and dataset.last_updated:
                last_updated = str(dataset.last_updated)
            
            results.append({
                'ref': dataset.ref,
                'title': dataset.title or dataset.ref,
                'size_mb': size_mb,
                'csv_file_count': csv_file_count,
                'last_updated': last_updated
            })
        
        logger.info(f"Found {len(results)} datasets for search '{search_query}' (fetched {len(all_datasets)} total, {len(results)} accessible)")
        
        # Cache the results before returning
        response = {'datasets': results}
        _kaggle_search_cache.set(cache_key_hash, response)
        logger.debug(f"Cached search results for key: {cache_key_hash}")
        
        return response
        
    except Exception as e:
        logger.exception("Failed to search Kaggle datasets")
        raise DataSourceConnectionError(f"Kaggle search failed: {e}")


@router.post("/kaggle/files")
async def list_kaggle_dataset_files(
    file_request: Dict[str, Any] = Body(...)
):
    """
    List CSV files in a specific Kaggle dataset.
    
    Request body:
        username: Kaggle username
        api_key: Kaggle API key
        dataset: Dataset reference (owner/dataset-name)
    
    Returns list of CSV files with sizes.
    """
    username = file_request.get('username')
    api_key = file_request.get('api_key')
    dataset = file_request.get('dataset')
    
    if not username or not api_key or not dataset:
        raise InvalidInputError("Kaggle username, API key, and dataset are required")
    
    if '/' not in dataset:
        raise InvalidInputError("Dataset must be in format 'owner/dataset-name'")
    
    try:
        # Monkey-patch exit() to prevent Kaggle library from calling sys.exit()
        import builtins
        original_exit = builtins.exit
        builtins.exit = lambda *args, **kwargs: None
        
        try:
            from kaggle.api.kaggle_api_extended import KaggleApi
        finally:
            # Restore original exit
            builtins.exit = original_exit
        
        # Authenticate with Kaggle (also patch exit during authenticate call)
        api = KaggleApi()
        api.username = username
        api.key = api_key
        
        # Patch exit again for authenticate() call
        builtins.exit = lambda *args, **kwargs: None
        try:
            api.authenticate()
        finally:
            builtins.exit = original_exit
        
        # List files in the dataset
        try:
            files_list = api.dataset_list_files(dataset).files
        except Exception as list_error:
            # Check if this is a 403 Forbidden error
            error_msg = str(list_error)
            if '403' in error_msg or 'Forbidden' in error_msg:
                raise DataSourceConnectionError(
                    f"Cannot access dataset '{dataset}': 403 Forbidden. "
                    f"You may need to accept the dataset's terms first. "
                    f"Visit https://www.kaggle.com/datasets/{dataset} and click 'Download' or view the data to accept terms."
                )
            raise
        
        # Filter for CSV files and format response
        csv_files = []
        for file in files_list:
            if file.name.lower().endswith('.csv'):
                # Try to get file size from various possible attributes
                size_mb = 0
                size_bytes = None
                
                # Check different possible attribute names
                for attr in ['size', 'totalBytes', 'total_bytes']:
                    if hasattr(file, attr):
                        val = getattr(file, attr)
                        if val and val > 0:
                            size_bytes = val
                            break
                
                if size_bytes:
                    size_mb = round(size_bytes / (1024 * 1024), 2)
                
                csv_files.append({
                    'name': file.name,
                    'size_mb': size_mb
                })
        
        logger.info(f"Found {len(csv_files)} CSV files in dataset '{dataset}'")
        return {'files': csv_files}
        
    except Exception as e:
        logger.exception(f"Failed to list files in dataset '{dataset}'")
        raise DataSourceConnectionError(f"Failed to list dataset files: {e}")

# Upload root cleanup is handled in app shutdown in backend/main.py