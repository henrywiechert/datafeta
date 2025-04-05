"""Connector for CSV files."""
import pandas as pd
import os
from typing import List, Dict, Any
from backend.models import Database, Table, Column
from .base import BaseConnector
import io

class CsvConnector(BaseConnector):
    def __init__(self):
        # No DataFrame needed here anymore for metadata
        # self.df: pd.DataFrame = None
        self.file_path: str = None
        self._table_name: str = None

    def connect(self, connection_details: Dict[str, Any]) -> None:
        # Store the path to the temporary file saved by the router
        self.file_path = connection_details.get("file_path")
        if not self.file_path or not os.path.exists(self.file_path):
            # Ensure the temporary file actually exists before proceeding
            raise ConnectionError(f"Temporary CSV file not found or inaccessible at {self.file_path}")

        # Store the derived table name once
        self._table_name = os.path.splitext(os.path.basename(self.file_path))[0]
        print(f"CSV Connector connected to temp file: {self.file_path}")


    def disconnect(self) -> None:
        # Only need to clear the path reference
        # Actual file deletion is handled by the router using current_csv_temp_path
        print(f"CSV Connector disconnected from temp file: {self.file_path}")
        self.file_path = None
        self._table_name = None


    def list_databases(self) -> List[Database]:
        # CSV files don't have databases
        return []

    def list_tables(self, database: str = None) -> List[Table]:
        # Return the stored table name if connected
        if self._table_name:
            return [Table(name=self._table_name)]
        return []

    def list_columns(self, database: str = None, table: str = None) -> List[Column]:
        # Read only a few rows to infer columns and types
        if not self.file_path:
             raise ConnectionError("Not connected (file path is missing).")
        if table != self._table_name:
             raise ValueError(f"Requested table '{table}' does not match connected CSV '{self._table_name}'")

        try:
            # Read just enough rows to get headers and infer types reasonably
            # Using nrows=0 reads only headers, but dtypes might be less accurate.
            # Using a small number like 5 helps pandas infer types better.
            # Consider adding encoding/separator options later.
            df_sample = pd.read_csv(self.file_path, nrows=5)
            columns = []
            for col_name, dtype in df_sample.dtypes.items():
                columns.append(Column(name=str(col_name), data_type=str(dtype)))
            return columns
        except pd.errors.EmptyDataError:
            # Handle case where CSV is empty or header-only
            try:
                 # Try reading just the header
                 df_header = pd.read_csv(self.file_path, nrows=0)
                 return [Column(name=str(col_name), data_type='object') for col_name in df_header.columns]
            except Exception as e:
                 raise RuntimeError(f"Failed to read columns from CSV header {self.file_path}: {e}")
        except Exception as e:
            raise RuntimeError(f"Failed to read columns from CSV {self.file_path}: {e}")

    # TODO later: Implement fetch_data that reads from self.file_path potentially with chunking

    # TODO: Implement fetch_data that reads from self.file_path potentially with chunking 