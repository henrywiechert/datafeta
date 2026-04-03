"""Service for creating virtual merged tables from multiple physical tables."""

import logging
from typing import List, Dict, Optional
from backend.models.data_source import (
    Column, 
    ForeignKeyRelationship, 
    VirtualTableDefinition,
    TableJoinDefinition,
    UnionTableDefinition,
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
        primary_table: str,
        already_joined: Optional[List[str]] = None
    ) -> List[TableJoinDefinition]:
        """
        Suggest potential joins for a primary table based on detected foreign keys.
        Supports transitive joins through already-joined tables.
        
        Args:
            database: Database name
            primary_table: The primary table to find joins for
            already_joined: List of tables already joined (for transitive relationship detection)
            
        Returns:
            List of suggested join definitions
        """
        # Detect all foreign key relationships in the database
        all_relationships = self.connector.detect_foreign_keys(database)
        
        suggested_joins = []
        
        # Build list of tables to check for relationships (primary + already joined)
        tables_to_check = [primary_table]
        if already_joined:
            tables_to_check.extend(already_joined)
        
        # Find relationships where any of our tables is involved
        for rel in all_relationships:
            join_def = None
            
            # Check each table we're connected to
            for check_table in tables_to_check:
                # Case 1: check_table has FK to another table
                if rel.from_table == check_table:
                    target_table = rel.to_table
                    # Don't suggest joining to ourselves or already-joined tables
                    if target_table not in tables_to_check:
                        join_def = TableJoinDefinition(
                            table_name=target_table,
                            join_type='LEFT',  # Default to LEFT JOIN to preserve all primary records
                            on_conditions=[
                                f"{check_table}.{fc} = {target_table}.{tc}"
                                for fc, tc in zip(rel.from_columns, rel.to_columns)
                            ],
                            alias=None
                        )
                        break
                
                # Case 2: Another table has FK to check_table
                elif rel.to_table == check_table:
                    source_table = rel.from_table
                    # Don't suggest joining to ourselves or already-joined tables
                    if source_table not in tables_to_check:
                        join_def = TableJoinDefinition(
                            table_name=source_table,
                            join_type='LEFT',
                            on_conditions=[
                                f"{check_table}.{tc} = {source_table}.{fc}"
                                for fc, tc in zip(rel.from_columns, rel.to_columns)
                            ],
                            alias=None
                        )
                        break
            
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
            # When we have joined_tables, we need to find join paths for ALL of them
            # This includes both direct joins to primary and transitive joins through other joined tables
            if joined_tables:
                # Build the full set of tables incrementally to handle transitive joins
                all_join_defs = []
                remaining_tables = set(joined_tables)
                processed_tables = []
                
                # Process tables in order, building up the join graph
                while remaining_tables:
                    # Get suggestions based on what we've processed so far
                    suggested_joins = self.suggest_joins(database, primary_table, already_joined=processed_tables)
                    
                    # Find which remaining tables are in the suggestions
                    found_in_round = []
                    for join_def in suggested_joins:
                        if join_def.table_name in remaining_tables:
                            all_join_defs.append(join_def)
                            found_in_round.append(join_def.table_name)
                            remaining_tables.remove(join_def.table_name)
                            processed_tables.append(join_def.table_name)
                    
                    # If we didn't find any tables in this round, we can't join the remaining ones
                    if not found_in_round:
                        logger.warning(f"Could not find join paths for tables: {remaining_tables}")
                        break
                
                joins = all_join_defs
            elif auto_detect:
                # Use all suggested joins
                joins = self.suggest_joins(database, primary_table, already_joined=None)
        
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
        Get all columns from a virtual table.
        
        For JOIN mode: Adds table name prefixes to distinguish columns from different tables.
        For UNION mode: Returns columns without prefixes (all tables have same schema).
        
        Args:
            database: Database name
            virtual_table: Virtual table definition
            
        Returns:
            MergedColumnsResponse with columns (prefixed for JOIN, unprefixed for UNION)
        """
        all_columns = []
        
        # UNION mode: Flexible schema support - merge all columns from all tables
        if virtual_table.mode == 'union':
            # Collect all unique columns across all tables
            column_map = {}  # {column_name: Column}
            
            # Get columns from primary table
            try:
                primary_columns = self.connector.list_columns(database, virtual_table.primary_table)
                for col in primary_columns:
                    if col.name not in column_map:
                        column_map[col.name] = Column(
                            name=col.name,
                            data_type=col.data_type,
                            cast_type=col.cast_type,
                            cast_replacement=col.cast_replacement,
                            is_datetime=col.is_datetime,
                            table_name=None  # No specific table for UNION columns
                        )
            except Exception as e:
                logger.error(f"Error getting columns from primary table {virtual_table.primary_table}: {e}")
            
            # Get columns from union tables
            for ut in virtual_table.union_tables:
                # Parse qualified table names (database/table format)
                # Using '/' separator to avoid conflicts with column names that contain dots
                if (ut.database is None or ut.database == "") and '/' in ut.table_name:
                    parts = ut.table_name.split('/', 1)
                    if len(parts) == 2:
                        ut_database, ut_table = parts
                    else:
                        ut_database = database
                        ut_table = ut.table_name
                else:
                    ut_database = ut.database if ut.database else database
                    ut_table = ut.table_name
                try:
                    union_columns = self.connector.list_columns(ut_database, ut_table)
                    for col in union_columns:
                        if col.name not in column_map:
                            # New column found - add it
                            column_map[col.name] = Column(
                                name=col.name,
                                data_type=col.data_type,
                                cast_type=col.cast_type,
                                cast_replacement=col.cast_replacement,
                                is_datetime=col.is_datetime,
                                table_name=None
                            )
                except Exception as e:
                    logger.error(f"Error getting columns from {ut_database}.{ut_table}: {e}")
                    # Continue with other tables
            
            all_columns = list(column_map.values())
            logger.info(f"UNION mode: {len(all_columns)} unique columns from {len(virtual_table.union_tables) + 1} tables (flexible schema)")
            
            return MergedColumnsResponse(
                columns=all_columns,
                virtual_table=virtual_table
            )
        
        # JOIN mode: Add table prefixes to distinguish columns
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
            logger.info(f"Fetching columns for joined table: {join_def.table_name}")
            try:
                joined_columns = self.connector.list_columns(database, join_def.table_name)
                logger.info(f"Got {len(joined_columns)} columns from {join_def.table_name}")
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
        
        logger.info(f"JOIN mode: {len(all_columns)} total from {1 + len(virtual_table.joined_tables)} tables")
        
        return MergedColumnsResponse(
            columns=all_columns,
            virtual_table=virtual_table
        )
    
    def get_suggested_tables(
        self,
        database: str,
        primary_table: str,
        already_joined: Optional[List[str]] = None
    ) -> List[str]:
        """
        Get list of tables that can be joined to the primary table or already-joined tables.
        
        Supports transitive relationships: if you've already joined table B to table A,
        this will also suggest tables that can join to B.
        
        Args:
            database: Database name
            primary_table: Primary table name
            already_joined: List of tables already joined (to find additional joinable tables)
            
        Returns:
            List of table names that have detected relationships (excluding already joined)
        """
        already_joined = already_joined or []
        
        # Get all relationships in the database
        all_relationships = self.connector.detect_foreign_keys(database)
        
        # Tables to check for relationships (primary + already joined)
        tables_to_check = {primary_table} | set(already_joined)
        
        # Find all tables that can be joined
        joinable_tables = set()
        
        for rel in all_relationships:
            # Check if the from_table is one we're looking at
            if rel.from_table in tables_to_check:
                if rel.to_table not in tables_to_check:
                    joinable_tables.add(rel.to_table)
            
            # Check if the to_table is one we're looking at (reverse relationship)
            elif rel.to_table in tables_to_check:
                if rel.from_table not in tables_to_check:
                    joinable_tables.add(rel.from_table)
        
        result = sorted(list(joinable_tables))
        logger.info(
            f"Found {len(result)} joinable tables for primary '{primary_table}' "
            f"with {len(already_joined)} already joined: {result}"
        )
        return result

    def get_similar_tables(
        self,
        database: str,
        primary_table: str
    ) -> List[str]:
        """
        Get list of tables with identical schemas that can be combined with UNION ALL.
        
        Args:
            database: Database name
            primary_table: Primary table to compare against
            
        Returns:
            List of table names with matching schemas
        """
        similar_tables = self.connector.detect_similar_tables(database, primary_table)
        logger.info(f"Found {len(similar_tables)} similar tables for '{primary_table}'")
        return similar_tables

    def create_union_virtual_table(
        self,
        database: str,
        primary_table: str,
        union_tables: List[Dict[str, str]]
    ) -> VirtualTableDefinition:
        """
        Create a virtual table definition for UNION ALL operation (cross-database support).
        
        Args:
            database: Default database name (for primary table if not specified)
            primary_table: Primary table name
            union_tables: List of dicts with 'database' and 'table_name' keys
                         Example: [{'database': 'db1', 'table_name': 'orders'}, ...]
            
        Returns:
            VirtualTableDefinition with union mode
        """
        from backend.models.data_source import UnionTableDefinition
        
        union_defs = []
        for ut in union_tables:
            if isinstance(ut, dict):
                # New format: dict with database and table_name
                union_defs.append(UnionTableDefinition(
                    table_name=ut['table_name'],
                    database=ut.get('database')
                ))
            else:
                # Legacy format: just table name string (backward compatibility)
                union_defs.append(UnionTableDefinition(
                    table_name=ut,
                    database=None
                ))
        
        return VirtualTableDefinition(
            primary_table=primary_table,
            mode='union',
            union_tables=union_defs,
            name=f"{primary_table}_combined"
        )

    def get_merged_columns_with_virtual(
        self,
        database: str,
        primary_table: str,
        joined_tables: Optional[List[str]] = None,
        union_tables: Optional[List] = None,
        auto_detect: bool = True
    ) -> MergedColumnsResponse:
        """
        Get a merged column list from multiple tables with automatic virtual table creation.
        
        Supports two modes:
        - JOIN mode: Tables with different schemas, columns get table prefixes
        - UNION mode: Flexible schemas with NULL fill, adds _source_database and _source_table columns
        
        Args:
            database: Database name
            primary_table: Primary/main table
            joined_tables: Optional list of tables to join (JOIN mode)
            union_tables: Optional list of tables/dicts to union (UNION mode)
                         Can be: [{'database': 'db1', 'table_name': 'orders'}, ...]
                         Or legacy: ['table1', 'table2', ...]
            auto_detect: Whether to auto-detect joins (default: True, for JOIN mode only)
        
        Returns:
            MergedColumnsResponse with columns and virtual table definition
        """
        # Determine mode and create appropriate virtual table
        # Check for union_tables is not None (to handle empty list correctly)
        if union_tables is not None:
            # UNION mode
            virtual_table = self.create_union_virtual_table(
                database=database,
                primary_table=primary_table,
                union_tables=union_tables
            )
        else:
            # JOIN mode (default)
            virtual_table = self.create_virtual_table(
                database=database,
                primary_table=primary_table,
                joined_tables=joined_tables,
                auto_detect=auto_detect
            )
        
        # Get merged columns
        result = self.get_merged_columns(database, virtual_table)
        
        # Add the virtual _source_database and _source_table columns for ALL modes
        # These fields are always available to prevent charts from breaking when unions are removed
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
        result.columns.append(source_database_column)
        result.columns.append(source_table_column)
        logger.info(f"Added _source_database and _source_table virtual columns")
        
        mode_info = (
            f"UNION ({len(virtual_table.union_tables) + 1} tables)" 
            if virtual_table.mode == 'union' 
            else f"JOIN ({len(virtual_table.joined_tables) + 1} tables)"
        )
        logger.info(f"Created virtual table with {len(result.columns)} columns in {mode_info} mode")
        
        return result
