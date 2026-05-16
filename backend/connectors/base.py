# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Base class for data source connectors."""
from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, List, Dict, Any, Tuple

import pyarrow as pa

from backend.models.data_source import Database, Table, Column, ForeignKeyRelationship

if TYPE_CHECKING:
    from backend.dialects import SqlDialect


class BaseConnector(ABC):
    """
    Abstract base class for all data source connectors.
    
    Connectors provide a unified interface for interacting with different
    data sources (databases, files, APIs). Each connector must implement
    the core methods for connection management, metadata discovery, and
    query execution.
    """

    @property
    @abstractmethod
    def sql_dialect(self) -> "SqlDialect":
        """
        Return the SQL dialect for this connector.
        
        The dialect encapsulates database-specific SQL syntax and functions,
        enabling query services to generate correct SQL without scattered
        conditional logic.
        """

    @abstractmethod
    def connect(self, connection_details: Dict[str, Any]) -> None:
        """Establish a connection to the data source."""
        pass

    @abstractmethod
    def disconnect(self) -> None:
        """Close the connection."""
        pass

    @abstractmethod
    def list_databases(self) -> List[Database]:
        """List available databases (if applicable)."""
        pass

    @abstractmethod
    def list_tables(self, database: str) -> List[Table]:
        """List tables within a specific database or context."""
        pass

    @abstractmethod
    def list_columns(self, database: str, table: str) -> List[Column]:
        """List columns and their types for a specific table."""
        pass

    @abstractmethod
    def fetch_data(self, query: str) -> Tuple[List[Dict[str, str]], List[Dict[str, Any]]]:
        """
        Executes a query and fetches data.

        Args:
            query: The executable query string (e.g., SQL).

        Returns:
            A tuple containing:
            - List of column definitions (e.g., [{'name': 'col1', 'type': 'String'}, ...])
            - List of data rows (e.g., [{'col1': 'valA', 'col2': 123}, ...])
        """
        pass

    def fetch_data_arrow(self, query: str) -> pa.Table:
        """
        Executes a query and returns data as an Apache Arrow Table.
        
        This is more efficient for large datasets as it avoids JSON serialization.
        Subclasses should override this method for optimal performance.
        Default implementation falls back to fetch_data() and converts to Arrow.

        Args:
            query: The executable query string (e.g., SQL).

        Returns:
            PyArrow Table containing the query results.
        """
        # Default fallback: use fetch_data and convert to Arrow
        columns, rows = self.fetch_data(query)
        
        if not rows:
            # Create empty table with schema from columns
            schema_fields = [(col['name'], pa.string()) for col in columns]
            schema = pa.schema(schema_fields)
            return pa.table({col['name']: [] for col in columns}, schema=schema)
        
        # Convert row-oriented data to columnar format for Arrow
        column_data = {col['name']: [] for col in columns}
        for row in rows:
            for col in columns:
                column_data[col['name']].append(row.get(col['name']))
        
        return pa.table(column_data)

    def detect_foreign_keys(self, database: str) -> List[ForeignKeyRelationship]:
        """
        Detect foreign key relationships between tables in a database.
        
        This is optional and may return empty list if not supported or detectable.
        Subclasses can override to provide database-specific FK detection.
        
        Args:
            database: The database name to analyze
            
        Returns:
            List of detected foreign key relationships
        """
        return []  # Default: no FK detection

    def detect_similar_tables(self, database: str, primary_table: str, min_common_columns: int = 3) -> List[str]:
        """
        Detect tables with similar schemas that can be combined with UNION ALL.
        
        This is optional and may return empty list if not supported.
        Subclasses can override to provide database-specific schema matching.
        
        Args:
            database: The database name to search
            primary_table: Reference table to compare against
            min_common_columns: Minimum number of common columns required (default: 3)
            
        Returns:
            List of table names with similar schemas
        """
        return []  # Default: no schema detection

    def preview_table_references(
        self,
        database_pattern: str,
        table_pattern: str,
        pattern_mode: str,
        max_databases: int,
        max_total_matches: int,
        max_tables_per_database: int,
    ) -> Tuple[List[Dict[str, Any]], bool]:
        """
        Preview database/table matches for bulk selection helpers.

        Returns:
            A tuple of (grouped matches, truncated), where grouped matches are dicts
            in the form {'database': str, 'tables': List[str]}.
        """
        raise NotImplementedError('Pattern preview is not supported for this connector.')

    # Later: Add method for fetching data
    # @abstractmethod
    # def fetch_data(self, query: str) -> List[Dict[str, Any]]:
    #     pass 