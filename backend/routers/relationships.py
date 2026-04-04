"""API router for multi-table support operations."""

import logging
from typing import List, Optional

from fastapi import APIRouter, Body, Depends

from backend.connectors.base import BaseConnector
from backend.dependencies import (
    get_active_connector,
    get_connection_details,
)
from backend.exceptions import DataSourceConnectionError
from backend.models.data_source import (
    ConnectionDetails,
    ForeignKeyRelationship,
    MergedColumnsResponse,
    TableRelationshipsResponse,
)
from backend.services.table_merge_service import TableMergeService
from backend.services.cardinality_service import CardinalityService

logger = logging.getLogger(__name__)

router = APIRouter()


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
    Uses heuristic FK detection. For manual FK mappings, use POST /suggested-joins instead.
    
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


@router.post("/suggested-joins")
def post_suggested_joins(
    database: str,
    primary_table: str = Body(...),
    joined_tables: Optional[List[str]] = Body(None),
    custom_relationships: Optional[List[ForeignKeyRelationship]] = Body(None),
    connector: BaseConnector = Depends(get_active_connector),
    conn_details: ConnectionDetails = Depends(get_connection_details)
):
    """
    Get suggested tables that can be joined to a primary table or already-joined tables.
    Accepts custom FK relationships to bypass heuristic detection.
    
    Args:
        database: Database name (query param)
        primary_table: Primary table name
        joined_tables: Optional list of already-joined table names
        custom_relationships: Optional explicit FK relationships.
                            When provided (even if empty []), bypasses heuristic detection.
    """
    try:
        merge_service = TableMergeService(connector)
        
        suggested_tables = merge_service.get_suggested_tables(
            database, 
            primary_table,
            already_joined=joined_tables or [],
            relationships=custom_relationships
        )
        logger.info(f"Found {len(suggested_tables)} joinable tables for '{primary_table}' (custom_relationships={'yes' if custom_relationships is not None else 'no'})")
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
    custom_relationships: Optional[List[ForeignKeyRelationship]] = Body(None),
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
        custom_relationships: Optional explicit FK relationships for JOIN mode.
                            When provided (even if empty []), bypasses heuristic detection.
    
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
            auto_detect=auto_detect,
            custom_relationships=custom_relationships
        )
    except Exception as e:
        logger.error(f"Error creating merged columns: {e}")
        raise DataSourceConnectionError(f"Failed to create merged columns: {e}")


@router.post("/check-key-uniqueness")
def check_key_uniqueness(
    database: str,
    table: str = Body(...),
    columns: List[str] = Body(...),
    connector: BaseConnector = Depends(get_active_connector),
    conn_details: ConnectionDetails = Depends(get_connection_details)
):
    """
    Check whether a set of columns forms a unique key in a table.

    Returns total_rows, unique_keys, is_unique, and duplicate_rows.
    """
    try:
        service = CardinalityService(connector, conn_details)
        return service.check_composite_key_uniqueness(
            table=table,
            columns=columns,
            database=database
        )
    except Exception as e:
        logger.error(f"Error checking key uniqueness: {e}")
        raise DataSourceConnectionError(f"Failed to check key uniqueness: {e}")

