"""API router for metadata discovery operations."""

import logging
from typing import Optional

from fastapi import APIRouter, Body, Depends

from backend.connectors.base import BaseConnector
from backend.dependencies import (
    get_active_connector,
    get_connection_details,
)
from backend.exceptions import InvalidInputError
from backend.models.data_source import (
    ClickHousePatternPreviewRequest,
    ClickHousePatternPreviewResponse,
    Column,
    ColumnListResponse,
    ConnectionDetails,
    DatabaseListResponse,
    PatternMatchedDatabaseTables,
    TableReference,
    TableListResponse,
)
from backend.services.validation_service import ValidationService

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/databases", response_model=DatabaseListResponse)
def list_databases(
    connector: BaseConnector = Depends(get_active_connector),
    conn_details: ConnectionDetails = Depends(get_connection_details)
):
    """List databases for the current connection (if applicable)."""
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


@router.post("/clickhouse-pattern-preview", response_model=ClickHousePatternPreviewResponse)
def preview_clickhouse_pattern_matches(
    request: ClickHousePatternPreviewRequest = Body(...),
    connector: BaseConnector = Depends(get_active_connector),
    conn_details: ConnectionDetails = Depends(get_connection_details)
):
    """Preview ClickHouse database/table matches for bulk union selection."""
    if conn_details.type != 'clickhouse':
        raise InvalidInputError('Pattern preview is only available for ClickHouse connections.')

    try:
        grouped_matches, truncated = connector.preview_table_references(
            database_pattern=request.database_pattern,
            table_pattern=request.table_pattern,
            pattern_mode=request.pattern_mode,
            max_databases=request.max_databases,
            max_total_matches=request.max_total_matches,
            max_tables_per_database=request.max_tables_per_database,
        )
    except NotImplementedError as exc:
        raise InvalidInputError(str(exc)) from exc

    current_primary = (
        (request.current_primary.database, request.current_primary.table_name)
        if request.current_primary else None
    )
    existing_union = {
        (table.database, table.table_name)
        for table in request.existing_union_tables
    }

    resolved_tables = []
    excluded_existing = []
    for match in grouped_matches:
        database = match['database']
        for table_name in match['tables']:
            table_ref = TableReference(database=database, table_name=table_name)
            key = (database, table_name)
            if key == current_primary or key in existing_union:
                excluded_existing.append(table_ref)
                continue
            resolved_tables.append(table_ref)

    warnings = []
    if truncated:
        warnings.append('Preview results were truncated to stay within configured safety limits.')

    return ClickHousePatternPreviewResponse(
        matched_databases=[match['database'] for match in grouped_matches],
        matches=[PatternMatchedDatabaseTables(**match) for match in grouped_matches],
        resolved_tables=resolved_tables,
        excluded_existing=excluded_existing,
        truncated=truncated,
        warnings=warnings,
    )

