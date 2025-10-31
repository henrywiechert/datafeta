"""Service for creating virtual merged tables from multiple physical tables."""

import logging
from typing import List, Dict, Optional
from backend.models.data_source import (
    Column, 
    ForeignKeyRelationship, 
    VirtualTableDefinition,
    TableJoinDefinition,
    MergedColumnsResponse
)
from backend.connectors.base import BaseConnector

logger = logging.getLogger(__name__)


class TableMergeService:
    """Service to handle multi-table operations and virtual table creation."""
    
    def __init__(self, connector: BaseConnector):
        self.connector = connector
    
    def suggest_joins(
        self, 
        database: str, 
        primary_table: str
    ) -> List[TableJoinDefinition]:
        """
        Suggest potential joins for a primary table based on detected foreign keys.
        
        Args:
            database: Database name
            primary_table: The primary table to find joins for
            
        Returns:
            List of suggested join definitions
        """
        # Detect all foreign key relationships in the database
        all_relationships = self.connector.detect_foreign_keys(database)
        
        suggested_joins = []
        
        # Find relationships where the primary table is involved
        for rel in all_relationships:
            join_def = None
            
            # Case 1: Primary table has FK to another table
            if rel.from_table == primary_table:
                join_def = TableJoinDefinition(
                    table_name=rel.to_table,
                    join_type='LEFT',  # Default to LEFT JOIN to preserve all primary records
                    on_conditions=[f"{primary_table}.{rel.from_column} = {rel.to_table}.{rel.to_column}"],
                    alias=None
                )
            
            # Case 2: Another table has FK to primary table
            elif rel.to_table == primary_table:
                join_def = TableJoinDefinition(
                    table_name=rel.from_table,
                    join_type='LEFT',
                    on_conditions=[f"{primary_table}.{rel.to_column} = {rel.from_table}.{rel.from_column}"],
                    alias=None
                )
            
            if join_def:
                # Avoid duplicate suggestions
                if not any(j.table_name == join_def.table_name for j in suggested_joins):
                    suggested_joins.append(join_def)
                    logger.info(f"Suggested join: {primary_table} -> {join_def.table_name}")
        
        return suggested_joins
    
    def create_virtual_table(
        self,
        database: str,
        primary_table: str,
        joined_tables: Optional[List[str]] = None,
        auto_detect: bool = True
    ) -> VirtualTableDefinition:
        """
        Create a virtual table definition with automatic join detection.
        
        Args:
            database: Database name
            primary_table: The primary/main table
            joined_tables: Optional list of table names to join (if None and auto_detect=True, auto-suggest)
            auto_detect: Whether to automatically detect and add joins
            
        Returns:
            VirtualTableDefinition with join specifications
        """
        joins = []
        
        if auto_detect or joined_tables:
            # Get all suggested joins
            suggested_joins = self.suggest_joins(database, primary_table)
            
            if joined_tables:
                # Filter to only the requested tables
                joins = [j for j in suggested_joins if j.table_name in joined_tables]
            elif auto_detect:
                # Use all suggested joins
                joins = suggested_joins
        
        virtual_table = VirtualTableDefinition(
            primary_table=primary_table,
            joined_tables=joins,
            name=f"virtual_{primary_table}_merged"
        )
        
        logger.info(f"Created virtual table '{virtual_table.name}' with {len(joins)} joins")
        return virtual_table
    
    def get_merged_columns(
        self,
        database: str,
        virtual_table: VirtualTableDefinition
    ) -> MergedColumnsResponse:
        """
        Get all columns from a virtual table with table name prefixes.
        
        Args:
            database: Database name
            virtual_table: Virtual table definition
            
        Returns:
            MergedColumnsResponse with prefixed columns
        """
        all_columns = []
        
        # Get columns from primary table
        primary_columns = self.connector.list_columns(database, virtual_table.primary_table)
        for col in primary_columns:
            # Add table prefix
            prefixed_col = Column(
                name=f"{virtual_table.primary_table}.{col.name}",
                data_type=col.data_type,
                cast_type=col.cast_type,
                cast_replacement=col.cast_replacement,
                is_datetime=col.is_datetime,
                table_name=virtual_table.primary_table
            )
            all_columns.append(prefixed_col)
        
        # Get columns from joined tables
        for join_def in virtual_table.joined_tables:
            try:
                joined_columns = self.connector.list_columns(database, join_def.table_name)
                for col in joined_columns:
                    # Add table prefix
                    prefixed_col = Column(
                        name=f"{join_def.table_name}.{col.name}",
                        data_type=col.data_type,
                        cast_type=col.cast_type,
                        cast_replacement=col.cast_replacement,
                        is_datetime=col.is_datetime,
                        table_name=join_def.table_name
                    )
                    all_columns.append(prefixed_col)
            except Exception as e:
                logger.error(f"Error getting columns from {join_def.table_name}: {e}")
                # Continue with other tables
        
        logger.info(f"Merged columns: {len(all_columns)} total from {1 + len(virtual_table.joined_tables)} tables")
        
        return MergedColumnsResponse(
            columns=all_columns,
            virtual_table=virtual_table
        )
    
    def get_suggested_tables(
        self,
        database: str,
        primary_table: str
    ) -> List[str]:
        """
        Get list of tables that can be joined to the primary table.
        
        Args:
            database: Database name
            primary_table: Primary table name
            
        Returns:
            List of table names that have detected relationships
        """
        suggested_joins = self.suggest_joins(database, primary_table)
        return [join.table_name for join in suggested_joins]
