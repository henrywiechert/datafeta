"""API router for metadata discovery operations."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends

from backend.connectors.base import BaseConnector
from backend.dependencies import (
    get_active_connector,
    get_connection_details,
)
from backend.models.data_source import (
    Column,
    ColumnListResponse,
    ConnectionDetails,
    DatabaseListResponse,
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

