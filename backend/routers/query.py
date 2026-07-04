# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""API router for query execution operations."""

import base64
import logging

import pyarrow as pa
from fastapi import APIRouter, Body, Depends
from fastapi.responses import Response

from backend.connectors.base import BaseConnector
from backend.dependencies import (
    get_active_connector,
    get_connection_details,
)
from backend.models.data_source import ConnectionDetails
from backend.models.query import (
    CountResponse,
    DistinctCountRequest,
    QueryDescription,
    QueryResult,
    RowCountRequest,
)
from backend.services.cardinality_service import CardinalityService
from backend.services.query_execution_service import QueryExecutionService

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/row-count", response_model=CountResponse)
def get_row_count(
    request: RowCountRequest = Body(...),
    connector: BaseConnector = Depends(get_active_connector),
    conn_details: ConnectionDetails = Depends(get_connection_details)
):
    """
    Get the total row count for a table with optional filters applied.
    
    This endpoint is used for probing dataset size to determine query strategy:
    - Small datasets: Fetch raw columns for local caching
    - Large datasets: Fetch pre-aggregated data
    """
    service = QueryExecutionService(connector, conn_details)
    return CountResponse(count=service.count_rows(request))


@router.post("/distinct-count", response_model=CountResponse)
def get_distinct_count(
    request: DistinctCountRequest = Body(...),
    connector: BaseConnector = Depends(get_active_connector),
    conn_details: ConnectionDetails = Depends(get_connection_details)
):
    """Get count of distinct values for a field, optionally filtered by a LIKE pattern."""
    logger.info(
        "distinct-count: field=%r, table=%r, sourceTable=%r, virtualTable present=%s",
        request.field, request.table, request.sourceTable, request.virtualTable is not None,
    )
    if request.virtualTable:
        logger.info(
            "distinct-count: virtual_table: primary=%s, joined_tables=%s, mode=%s",
            request.virtualTable.primary_table,
            [jt.table_name for jt in request.virtualTable.joined_tables],
            request.virtualTable.mode,
        )
    
    service = CardinalityService(connector, conn_details)
    count = service.get_distinct_count(
        field=request.field,
        table=request.table,
        database=request.database,
        regex_pattern=request.regexPattern,
        datetime_part=request.dateTimePart,
        datetime_mode=request.dateTimeMode,
        union_tables=request.unionTables,
        virtual_columns=request.virtualColumns or None,
        virtual_table=request.virtualTable,
        source_table=request.sourceTable
    )
    
    return CountResponse(count=count)


@router.post("/query", response_model=QueryResult, response_model_exclude_none=True)
def execute_query(
    query_desc: QueryDescription = Body(...),
    connector: BaseConnector = Depends(get_active_connector),
    conn_details: ConnectionDetails = Depends(get_connection_details)
):
    """Translates a query description, executes it via the current connector, and returns results."""
    service = QueryExecutionService(connector, conn_details)
    return service.execute_json(query_desc)


@router.post("/query-arrow")
def execute_query_arrow(
    query_desc: QueryDescription = Body(...),
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

