"""Builder for creating table context from query descriptions."""

from typing import Dict, Any, Optional

from pypika import Query, Table

from backend.models.query import QueryDescription
from backend.services.query_components.contexts import TableContext
from backend.exceptions import QueryGenerationError


class TableContextBuilder:
    """Responsible for creating PyPika table context from query descriptions.
    
    Handles both single-table queries and multi-table queries with JOINs.
    """

    def build(
        self,
        query_desc: QueryDescription,
        db_type: str,
        fallback_table_name: Optional[str]
    ) -> TableContext:
        """Create initial PyPika query and table context for the provided description.
        
        Args:
            query_desc: The query description containing table and join information
            db_type: Database type ('clickhouse', 'duckdb', etc.)
            fallback_table_name: Fallback table name if not specified in query_desc
            
        Returns:
            TableContext containing query, table_map, default_table, and primary_table
            
        Raises:
            QueryGenerationError: If target table is not specified for single table queries
        """
        if query_desc.virtual_table:
            return self._build_multi_table_context(query_desc, db_type)
        else:
            return self._build_single_table_context(query_desc, db_type, fallback_table_name)

    def _build_multi_table_context(
        self,
        query_desc: QueryDescription,
        db_type: str
    ) -> TableContext:
        """Build table context for multi-table queries with JOINs."""
        table_map: Dict[str, Any] = {}
        
        # Create primary table
        primary_table_name = query_desc.virtual_table.primary_table
        primary_table = self._create_table(
            primary_table_name,
            db_type,
            query_desc.target_database
        )
        
        table_map[primary_table_name] = primary_table
        query = Query.from_(primary_table)
        
        # Process joined tables
        for join_def in query_desc.virtual_table.joined_tables:
            join_table = self._create_table(
                join_def.table_name,
                db_type,
                query_desc.target_database
            )
            table_map[join_def.table_name] = join_table
            
            # Apply JOIN with conditions
            if join_def.on_conditions:
                query = self._apply_join(
                    query,
                    join_def,
                    join_table,
                    table_map,
                    primary_table
                )
        
        default_table = table_map.get(primary_table_name, primary_table)
        return TableContext(
            query=query,
            table_map=table_map,
            default_table=default_table,
            primary_table=primary_table
        )

    def _build_single_table_context(
        self,
        query_desc: QueryDescription,
        db_type: str,
        fallback_table_name: Optional[str]
    ) -> TableContext:
        """Build table context for single-table queries."""
        target_table_name = query_desc.target_table or fallback_table_name
        if not target_table_name:
            raise QueryGenerationError(
                "Target table must be specified for single table queries."
            )
        
        table = self._create_table(
            target_table_name,
            db_type,
            query_desc.target_database
        )
        
        table_map = {target_table_name: table}
        query = Query.from_(table)
        
        return TableContext(
            query=query,
            table_map=table_map,
            default_table=table,
            primary_table=table
        )

    def _create_table(
        self,
        table_name: str,
        db_type: str,
        database: Optional[str]
    ) -> Table:
        """Create a PyPika Table with optional schema for ClickHouse."""
        if db_type == 'clickhouse' and database:
            return Table(table_name, schema=database)
        return Table(table_name)

    def _apply_join(
        self,
        query: Query,
        join_def: Any,
        join_table: Table,
        table_map: Dict[str, Any],
        primary_table: Table
    ) -> Query:
        """Apply JOIN clause to query based on join definition.
        
        Parses the ON condition and applies the appropriate JOIN type.
        """
        # Build a combined join condition from all on_conditions (supports composite keys)
        combined_condition = None
        for condition in join_def.on_conditions:
            parts = condition.split('=')

            if len(parts) != 2:
                continue

            # Split only on first dot to handle column names that contain dots
            left_part = parts[0].strip().split('.', 1)
            right_part = parts[1].strip().split('.', 1)

            if len(left_part) != 2 or len(right_part) != 2:
                continue

            left_table_name, left_col = left_part
            right_table_name, right_col = right_part

            left_table_obj = table_map.get(left_table_name, primary_table)
            right_table_obj = table_map.get(right_table_name, join_table)

            cond = left_table_obj[left_col] == right_table_obj[right_col]
            combined_condition = cond if combined_condition is None else (combined_condition & cond)

        if combined_condition is None:
            return query

        # Apply appropriate JOIN type
        if join_def.join_type == 'LEFT':
            return query.left_join(join_table).on(combined_condition)
        elif join_def.join_type == 'RIGHT':
            return query.right_join(join_table).on(combined_condition)
        elif join_def.join_type == 'FULL':
            return query.full_outer_join(join_table).on(combined_condition)
        else:  # INNER join is default
            return query.inner_join(join_table).on(combined_condition)
