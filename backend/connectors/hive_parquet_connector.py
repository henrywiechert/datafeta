# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Connector for Hive-partitioned Parquet datasets with lazy partition loading."""
import logging
import os
import re
import duckdb
from typing import List, Dict, Any, Tuple, Optional
from collections import defaultdict

import pyarrow as pa

from backend.models.data_source import Database, Table, Column
from backend.dialects import SqlDialect, DuckDbDialect
from .base import BaseConnector
from backend.exceptions import DataSourceConnectionError, InvalidInputError, QueryExecutionError

logger = logging.getLogger(__name__)

_duckdb_dialect = DuckDbDialect()


class PartitionNotLoadedError(InvalidInputError):
    """Raised when attempting to access a partition that hasn't been loaded yet."""
    def __init__(self, partition_name: str):
        super().__init__(
            detail=f"Partition '{partition_name}' not loaded. Please load the partition first.",
        )


class HiveParquetConnector(BaseConnector):
    """Connector for Hive-partitioned Parquet datasets with lazy loading.
    
    Supports two-phase connection:
    1. connect() - Parse file structure, identify partitions
    2. load_partition() - Upload and register files for specific partitions
    
    Example file structure:
        dataset/
            region=us/
                file1.parquet
                file2.parquet
            region=eu/
                file1.parquet
    
    This would result in:
        - partition_column = "region"
        - available_partitions = ["us", "eu"]
    """

    @property
    def sql_dialect(self) -> SqlDialect:
        return _duckdb_dialect

    def __init__(self):
        self._partition_column: Optional[str] = None
        self._available_partitions: List[str] = []
        self._loaded_partitions: Dict[str, List[str]] = {}  # partition_name -> [file_paths]

    def connect(self, connection_details: Dict[str, Any]) -> None:
        """Phase 1: Parse file structure and extract partition information.
        
        Args:
            connection_details: Dict containing:
                - hive_file_structure: List of relative file paths from folder picker
        """
        self._partition_column = None
        self._available_partitions = []
        self._loaded_partitions = {}

        file_structure = connection_details.get("hive_file_structure", [])
        if not file_structure:
            raise InvalidInputError("No file structure provided for Hive Parquet connection")

        self._partition_column, self._available_partitions = self._parse_structure(file_structure)
        
        if not self._partition_column:
            raise InvalidInputError(
                "Could not detect partition structure. Expected format: column=value/file.parquet"
            )
        
        if not self._available_partitions:
            raise InvalidInputError("No partitions found in the provided file structure")

        logger.info(
            f"HiveParquetConnector connected: partition_column='{self._partition_column}', "
            f"partitions={self._available_partitions}"
        )

    def _parse_structure(self, paths: List[str]) -> Tuple[Optional[str], List[str]]:
        """Extract partition column and values from file paths.
        
        Expects paths like:
            - root_folder/region=us/file1.parquet
            - root_folder/region=eu/file2.parquet
        
        The root folder is stripped to find the partition pattern.
        
        Returns:
            Tuple of (partition_column, list_of_partition_values)
        """
        # Pattern to match partition format: column=value/
        # Can appear after the root folder: root/column=value/ or at the start: column=value/
        partition_pattern = re.compile(r'([^/=]+)=([^/]+)/')
        partition_values = defaultdict(set)

        for path in paths:
            normalized = path.replace('\\', '/')
            if not normalized.lower().endswith('.parquet'):
                continue

            # Strip the root folder (first path segment) to avoid matching root=folder patterns
            parts = normalized.split('/', 1)
            if len(parts) < 2:
                continue
            path_without_root = parts[1]

            match = partition_pattern.search(path_without_root)
            if match:
                col_name = match.group(1)
                col_value = match.group(2)
                partition_values[col_name].add(col_value)

        if not partition_values:
            return None, []

        # Use the most common partition column (in case of nested partitions, take first level)
        partition_column = max(partition_values.keys(), key=lambda k: len(partition_values[k]))
        values = sorted(partition_values[partition_column])

        return partition_column, values

    def load_partition(self, partition_name: str, file_paths: List[str]) -> None:
        """Phase 2: Register uploaded files for a specific partition.
        
        Args:
            partition_name: The partition value (e.g., "us", "eu")
            file_paths: List of absolute file paths to the uploaded parquet files
        """
        if partition_name not in self._available_partitions:
            raise InvalidInputError(
                f"Unknown partition '{partition_name}'. Available: {self._available_partitions}"
            )

        for path in file_paths:
            if not os.path.exists(path):
                raise DataSourceConnectionError(f"Partition file not found: {path}")

        self._loaded_partitions[partition_name] = file_paths
        logger.info(f"Loaded partition '{partition_name}' with {len(file_paths)} file(s)")

    def is_partition_loaded(self, partition_name: str) -> bool:
        """Check if a partition has been loaded."""
        return partition_name in self._loaded_partitions

    def get_loaded_partitions(self) -> List[str]:
        """Return list of currently loaded partition names."""
        return list(self._loaded_partitions.keys())

    @property
    def partition_column(self) -> Optional[str]:
        """Return the detected partition column name."""
        return self._partition_column

    def disconnect(self) -> None:
        """Clean up connector state."""
        partitions = list(self._loaded_partitions.keys())
        logger.info(f"HiveParquetConnector disconnecting, loaded partitions were: {partitions}")
        self._partition_column = None
        self._available_partitions = []
        self._loaded_partitions = {}

    def list_databases(self) -> List[Database]:
        """Hive Parquet doesn't have databases - return empty list."""
        return []

    def list_tables(self, database: str = None) -> List[Table]:
        """Return all available partitions as tables."""
        return [Table(name=p) for p in self._available_partitions]

    def list_columns(self, database: str = None, table: str = None) -> List[Column]:
        """Return columns for a loaded partition.
        
        Args:
            database: Ignored for Hive Parquet
            table: The partition name to get columns for
            
        Raises:
            PartitionNotLoadedError: If the partition hasn't been loaded yet
        """
        if table not in self._loaded_partitions:
            raise PartitionNotLoadedError(table)
        
        if not self._loaded_partitions:
            raise DataSourceConnectionError("No partitions loaded")

        file_paths = self._loaded_partitions[table]
        if not file_paths:
            raise DataSourceConnectionError(f"No files for partition '{table}'")

        con = None
        try:
            con = duckdb.connect(database=':memory:', read_only=False)
            
            # Read schema from the partition files
            reader_sql = self._build_partition_reader_sql(table)
            describe_sql = f"DESCRIBE (SELECT * FROM {reader_sql} LIMIT 0)"
            
            logger.debug(f"Describing partition '{table}' with: {describe_sql}")
            result = con.execute(describe_sql).fetchall()
            
            columns = []
            datetime_types = {'TIMESTAMP', 'DATE', 'TIME', 'TIMESTAMP WITH TIME ZONE'}
            for row in result:
                col_name = row[0]
                col_type = row[1].upper()
                col = Column(name=col_name, data_type=col_type)
                if col_type in datetime_types:
                    col.is_datetime = True
                columns.append(col)
            
            return columns
            
        except PartitionNotLoadedError:
            raise
        except Exception as e:
            logger.exception(f"Error listing columns for partition '{table}'")
            raise DataSourceConnectionError(f"Failed to list columns for partition '{table}': {e}")
        finally:
            if con:
                con.close()

    def _build_partition_reader_sql(self, partition_name: str) -> str:
        """Build DuckDB read_parquet SQL for a partition's files."""
        if partition_name not in self._loaded_partitions:
            raise PartitionNotLoadedError(partition_name)

        file_paths = self._loaded_partitions[partition_name]
        
        if len(file_paths) == 1:
            escaped_path = file_paths[0].replace("'", "''")
            return f"read_parquet('{escaped_path}')"
        else:
            # Multiple files - use list syntax
            escaped_paths = [f"'{p.replace(chr(39), chr(39)*2)}'" for p in file_paths]
            paths_list = ", ".join(escaped_paths)
            return f"read_parquet([{paths_list}])"

    def _create_all_views(self, con: duckdb.DuckDBPyConnection) -> None:
        """Create views for all loaded partitions in the DuckDB connection."""
        for partition_name in self._loaded_partitions:
            safe_view_name = f'"{partition_name}"'
            reader_sql = self._build_partition_reader_sql(partition_name)
            create_view_sql = f"CREATE OR REPLACE TEMPORARY VIEW {safe_view_name} AS SELECT * FROM {reader_sql};"
            logger.debug(f"Creating view: {create_view_sql}")
            con.execute(create_view_sql)

    def fetch_data(self, query: str) -> Tuple[List[Dict[str, str]], List[Dict[str, Any]]]:
        """Execute a query against loaded partitions.
        
        Args:
            query: SQL query referencing partition names as table names
            
        Returns:
            Tuple of (columns, rows)
        """
        if not self._loaded_partitions:
            raise DataSourceConnectionError("No partitions loaded. Load at least one partition first.")

        con = None
        try:
            con = duckdb.connect(database=':memory:', read_only=False)
            self._create_all_views(con)

            loaded = list(self._loaded_partitions.keys())
            logger.debug(f"Executing query against loaded partitions {loaded}: {query}")
            
            result_relation = con.execute(query)
            arrow_table = result_relation.to_arrow_table()

            columns = []
            if arrow_table.schema:
                for i in range(len(arrow_table.schema)):
                    field = arrow_table.schema.field(i)
                    columns.append({'name': field.name, 'type': str(field.type)})
            
            rows = arrow_table.to_pylist()
            
            logger.debug(f"Fetch data returning {len(columns)} columns and {len(rows)} rows")
            return columns, rows

        except Exception as e:
            logger.exception("Error executing query on Hive partitions")
            raise QueryExecutionError(f"Failed to execute query on Hive partitions: {e}")
        finally:
            if con:
                con.close()

    def fetch_data_arrow(self, query: str) -> pa.Table:
        """Execute a query and return results as Apache Arrow Table.
        
        Args:
            query: SQL query referencing partition names as table names
            
        Returns:
            PyArrow Table with query results
        """
        if not self._loaded_partitions:
            raise DataSourceConnectionError("No partitions loaded. Load at least one partition first.")

        con = None
        try:
            con = duckdb.connect(database=':memory:', read_only=False)
            self._create_all_views(con)

            loaded = list(self._loaded_partitions.keys())
            logger.debug(f"Executing Arrow query against loaded partitions {loaded}: {query}")
            
            result_relation = con.execute(query)
            arrow_table = result_relation.to_arrow_table()
            
            logger.debug(f"Arrow fetch returning {arrow_table.num_columns} columns and {arrow_table.num_rows} rows")
            return arrow_table

        except Exception as e:
            logger.exception("Error executing Arrow query on Hive partitions")
            raise QueryExecutionError(f"Failed to execute Arrow query on Hive partitions: {e}")
        finally:
            if con:
                con.close()
