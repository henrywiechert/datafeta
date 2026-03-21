"""API router for query execution operations."""

import base64
import logging
from typing import Any, Dict, List

import pyarrow as pa
from fastapi import APIRouter, Body, Depends
from fastapi.responses import Response

from backend.connectors.base import BaseConnector
from backend.dependencies import (
    get_active_connector,
    get_connection_details,
)
from backend.exceptions import InvalidInputError, QueryExecutionError
from backend.models.data_source import (
    ConnectionDetails,
    VirtualColumnDefinition,
    VirtualTableDefinition,
)
from backend.models.query import Measure as QueryMeasure, QueryDescription, QueryResult
from backend.services.cardinality_service import CardinalityService
from backend.services.filter_conversion_service import FilterConversionService
from backend.services.query_execution_service import QueryExecutionService
from backend.services.query_service import QueryService
from backend.services.validation_service import ValidationService

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/row-count")
def get_row_count(
    request_data: Dict[str, Any] = Body(...),
    connector: BaseConnector = Depends(get_active_connector),
    conn_details: ConnectionDetails = Depends(get_connection_details)
):
    """
    Get the total row count for a table with optional filters applied.
    
    This endpoint is used for probing dataset size to determine query strategy:
    - Small datasets: Fetch raw columns for local caching
    - Large datasets: Fetch pre-aggregated data
    
    Request body:
        table: Table name
        database: Database name (required for ClickHouse)
        filters: Optional filter configurations to apply
    
    Returns:
        {"count": <number>}
    """
    table = request_data.get('table')
    database = request_data.get('database')
    filters = request_data.get('filters', {})
    virtual_columns_data = request_data.get('virtualColumns') or []
    virtual_table_data = request_data.get('virtualTable')
    
    if not table:
        raise InvalidInputError("Table name is required")
    
    ValidationService.require_database_for_clickhouse(database, conn_details, "counting rows")
    
    try:
        # Parse virtual columns/table if provided
        virtual_columns = None
        if virtual_columns_data:
            virtual_columns = [VirtualColumnDefinition.parse_obj(vc) for vc in virtual_columns_data]

        virtual_table = None
        if virtual_table_data:
            virtual_table = VirtualTableDefinition.parse_obj(virtual_table_data)

        # Convert frontend filter-config to QueryFilter list
        query_filters = FilterConversionService.convert_filters(filters, virtual_table)

        query_desc = QueryDescription(
            target_table=table,
            target_database=database,
            dimensions=[],
            measures=[QueryMeasure(field='*', aggregation='count', alias='cnt')],
            filters=query_filters,
            virtual_table=virtual_table,
            virtual_columns=virtual_columns,
        )

        query_service = QueryService()
        sql_query, _meta = query_service.translate_to_sql(
            query_desc=query_desc,
            table_name=table,
            db_type=conn_details.type,
            with_sampling=False,
            with_optimization=False,
            optimizer=None,
            connector=connector,
        )

        logger.info(f"Row count query (translated): {sql_query}")
        columns, rows = connector.fetch_data(sql_query)
        
        if rows and len(rows) > 0:
            count = rows[0].get('cnt', rows[0].get('count', 0))
            if isinstance(count, (int, float)):
                count = int(count)
            else:
                count = int(count) if count else 0
        else:
            count = 0
        
        logger.info(f"Row count for {database}.{table}: {count:,}")
        return {"count": count}
        
    except Exception as e:
        logger.exception(f"Error counting rows in {database}.{table}")
        raise QueryExecutionError(f"Failed to count rows: {e}")


@router.post("/distinct-count")
def get_distinct_count(
    request_data: Dict[str, Any] = Body(...),
    connector: BaseConnector = Depends(get_active_connector),
    conn_details: ConnectionDetails = Depends(get_connection_details)
):
    """Get count of distinct values for a field, optionally filtered by a LIKE pattern.
    
    Now accepts POST to support virtual column definitions.
    """
    # Extract parameters
    field = request_data.get('field')
    table = request_data.get('table')
    database = request_data.get('database')
    regex_pattern = request_data.get('regexPattern')
    datetime_part = request_data.get('dateTimePart')
    datetime_mode = request_data.get('dateTimeMode')
    union_tables = request_data.get('unionTables')
    source_table = request_data.get('sourceTable')  # Explicit source table (for multi-table JOIN support)
    
    # Parse virtual columns if provided
    virtual_columns = None
    if 'virtualColumns' in request_data and request_data['virtualColumns']:
        virtual_columns = [
            VirtualColumnDefinition.parse_obj(vc) 
            for vc in request_data['virtualColumns']
        ]
    
    # Parse virtual table if provided (for JOIN support)
    virtual_table = None
    if 'virtualTable' in request_data and request_data['virtualTable']:
        virtual_table = VirtualTableDefinition.parse_obj(request_data['virtualTable'])
    
    import logging
    _logger = logging.getLogger(__name__)
    _logger.info(f"distinct-count: field={field!r}, table={table!r}, sourceTable={source_table!r}, virtualTable present={'virtualTable' in request_data}")
    if virtual_table:
        _logger.info(f"distinct-count: parsed virtual_table: primary={virtual_table.primary_table}, joined_tables={[jt.table_name for jt in virtual_table.joined_tables]}, mode={virtual_table.mode}")
    
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
        virtual_table=virtual_table,
        source_table=source_table
    )
    
    return {"count": count}


@router.post("/query", response_model=QueryResult, response_model_exclude_none=True)
def execute_query(
    query_desc_data: Dict[str, Any] = Body(...),
    connector: BaseConnector = Depends(get_active_connector),
    conn_details: ConnectionDetails = Depends(get_connection_details)
):
    """Translates a query description, executes it via the current connector, and returns results."""
    service = QueryExecutionService(connector, conn_details)
    query_desc = service.parse_query_description(query_desc_data)
    return service.execute_json(query_desc)


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
    service = QueryExecutionService(connector, conn_details)
    query_desc = service.parse_query_description(query_desc_data)
    
    arrow_table, sql_query, extended_metadata = service.execute_arrow(query_desc)
    
    # Serialize Arrow table to IPC streaming format
    sink = pa.BufferOutputStream()
    with pa.ipc.new_stream(sink, arrow_table.schema) as writer:
        writer.write_table(arrow_table)
    
    arrow_bytes = sink.getvalue().to_pybytes()
    
    logger.info(f"Returning Arrow IPC response: {len(arrow_bytes)} bytes, {arrow_table.num_rows} rows, {arrow_table.num_columns} columns")
    
    headers = {
        "X-Arrow-Row-Count": str(arrow_table.num_rows),
        "X-Arrow-Column-Count": str(arrow_table.num_columns),
    }

    # Include SQL in header only when it fits safely within typical proxy
    # limits (Node.js CRA dev-proxy caps total headers at 16 KB).
    MAX_SQL_HEADER_BYTES = 8192
    sql_b64 = base64.b64encode(sql_query.encode('utf-8')).decode('ascii')
    if len(sql_b64) <= MAX_SQL_HEADER_BYTES:
        headers["X-Query-Sql-Base64"] = sql_b64
    else:
        logger.debug("SQL too large for header (%d bytes b64), omitting X-Query-Sql-Base64", len(sql_b64))

    return Response(
        content=arrow_bytes,
        media_type="application/vnd.apache.arrow.stream",
        headers=headers,
    )

