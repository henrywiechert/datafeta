# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Service for common validation patterns across endpoints."""

import logging
from typing import Optional

from backend.models.data_source import ConnectionDetails
from backend.exceptions import InvalidInputError
from backend.dialects import get_dialect

logger = logging.getLogger(__name__)


class ValidationService:
    """Handles common validation patterns for database operations."""
    
    @staticmethod
    def require_database_for_clickhouse(
        database: Optional[str],
        conn_details: ConnectionDetails,
        operation: str = "operation"
    ) -> None:
        """
        Validate that a database parameter is provided for ClickHouse connections.
        
        Args:
            database: The database parameter to validate
            conn_details: Current connection details
            operation: Description of the operation (for error message)
            
        Raises:
            InvalidInputError: If ClickHouse connection and database is missing
        """
        dialect = get_dialect(conn_details.type)
        if dialect.requires_database and not database:
            raise InvalidInputError(
                f"'database' parameter is required for {dialect.name} connections when performing {operation}."
            )
    
    @staticmethod
    def require_target_database_for_clickhouse(
        query_desc,
        conn_details: ConnectionDetails
    ) -> None:
        """
        Validate that target_database is provided in query description for ClickHouse.
        
        Args:
            query_desc: Query description object with target_database attribute
            conn_details: Current connection details
            
        Raises:
            InvalidInputError: If ClickHouse connection and target_database is missing
        """
        dialect = get_dialect(conn_details.type)
        if dialect.requires_database and not query_desc.target_database:
            raise InvalidInputError(
                f"target_database must be provided in the query description for {dialect.name}."
            )
    
    @staticmethod
    def validate_csv_table_match(
        target_table: str,
        connector,
        conn_details: ConnectionDetails
    ) -> None:
        """
        Validate that the query target table matches one of the connected file tables.
        
        Supports both single-file (legacy _table_name) and multi-file (_files list)
        connectors.
        
        Args:
            target_table: The target table from query description
            connector: The active connector
            conn_details: Current connection details
            
        Raises:
            InvalidInputError: If CSV connection and table name not found in connected files
        """
        if conn_details.type == 'csv':
            # New multi-file connector: check against _files list
            files = getattr(connector, '_files', None)
            if files is not None:
                known_tables = {f.table_name for f in files}
                if target_table not in known_tables:
                    raise InvalidInputError(
                        f"Query target table '{target_table}' does not match any "
                        f"connected file table. Available: {sorted(known_tables)}."
                    )
                return
            # Legacy single-file fallback: check against _table_name
            expected_table = getattr(connector, '_table_name', None)
            if not expected_table or target_table != expected_table:
                raise InvalidInputError(
                    f"Query target table '{target_table}' does not match "
                    f"connected CSV table '{expected_table}'."
                )
