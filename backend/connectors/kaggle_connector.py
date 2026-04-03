"""Connector for Kaggle public datasets."""
import logging
import os
import re
from typing import List, Dict, Any, Tuple, Optional, TYPE_CHECKING

import duckdb

from backend.models.data_source import Database, Table, Column, ForeignKeyRelationship
from .base import BaseConnector
from .fk_detection import detect_foreign_keys_by_naming_convention
from backend.exceptions import DataSourceConnectionError, InvalidInputError, QueryExecutionError
from backend.utils.type_conversion import process_query_result_data

# Import only for type checking to prevent circular import
if TYPE_CHECKING:
    from kaggle.api.kaggle_api_extended import KaggleApi
    from backend.dependencies import ConnectionStateManager

logger = logging.getLogger(__name__)


class KaggleConnector(BaseConnector):
    """Connector for querying public Kaggle datasets using DuckDB."""
    
    def __init__(self, state_manager: "ConnectionStateManager"):
        self.state_manager = state_manager
        self.api: Optional[KaggleApi] = None
        self.username: Optional[str] = None
        self.api_key: Optional[str] = None
        self.dataset: Optional[str] = None  # Format: "owner/dataset-name"
        self.download_dir: Optional[str] = None
        self.downloaded_files: List[str] = []  # Track downloaded file paths
        self._cached_csv_files: Optional[List[str]] = None  # Cache CSV file list to avoid repeated API calls
        
    def _sanitize_table_name(self, filename: str) -> str:
        """
        Sanitize a filename to create a valid SQL table name.
        Similar to FileConnector's implementation.
        """
        # Remove extension
        name = os.path.splitext(filename)[0]
        
        # Convert to lowercase
        name = name.lower()
        
        # Replace spaces and special characters with underscores
        name = re.sub(r'[^\w]+', '_', name)
        
        # Remove consecutive underscores
        name = re.sub(r'_+', '_', name)
        
        # Remove leading/trailing underscores
        name = name.strip('_')
        
        # Ensure it doesn't start with a number
        if name and name[0].isdigit():
            name = 'table_' + name
        
        # If empty after sanitization, use a default name
        if not name:
            name = 'kaggle_table'
        
        return name
    
    def _authenticate_kaggle(self) -> None:
        """Authenticate with Kaggle API using provided credentials."""
        if not self.username or not self.api_key:
            raise DataSourceConnectionError("Kaggle username and API key are required")
        
        try:
            # Monkey-patch exit() to prevent Kaggle library from calling sys.exit()
            import builtins
            original_exit = builtins.exit
            builtins.exit = lambda *args, **kwargs: None
            
            try:
                # Import KaggleApi here to avoid sys.exit() during module import
                from kaggle.api.kaggle_api_extended import KaggleApi
                
                self.api = KaggleApi()
                # Set credentials programmatically
                self.api.username = self.username
                self.api.key = self.api_key
                self.api.authenticate()
                logger.info(f"Successfully authenticated with Kaggle as {self.username}")
            finally:
                # Restore original exit
                builtins.exit = original_exit
        except Exception as e:
            logger.exception("Failed to authenticate with Kaggle API")
            raise DataSourceConnectionError(f"Kaggle authentication failed: {e}")
    
    def _list_dataset_files(self) -> List[str]:
        """List all CSV files in the connected dataset."""
        if not self.api or not self.dataset:
            raise DataSourceConnectionError("Not connected to a Kaggle dataset")
        
        # Return cached list if available to avoid repeated API calls that may fail with 403
        if self._cached_csv_files is not None:
            logger.debug(f"Returning cached CSV file list ({len(self._cached_csv_files)} files)")
            return self._cached_csv_files
        
        try:
            owner, dataset_name = self.dataset.split('/')
            logger.debug(f"Listing files for dataset {self.dataset}")
            files = self.api.dataset_list_files(owner, dataset_name).files
            csv_files = [f.name for f in files if f.name.lower().endswith('.csv')]
            logger.info(f"Found {len(csv_files)} CSV files in dataset {self.dataset}")
            # Cache the result
            self._cached_csv_files = csv_files
            return csv_files
        except Exception as e:
            error_msg = str(e)
            if '403' in error_msg or 'Forbidden' in error_msg:
                raise DataSourceConnectionError(
                    f"Cannot access dataset '{self.dataset}': 403 Forbidden. "
                    f"Visit https://www.kaggle.com/datasets/{self.dataset} to accept the dataset's terms and conditions."
                )
            logger.exception(f"Failed to list files in dataset {self.dataset}")
            raise DataSourceConnectionError(f"Failed to list dataset files: {e}")
    
    def _download_file(self, filename: str) -> str:
        """Download a specific file from the dataset to the session directory."""
        if not self.api or not self.dataset or not self.download_dir:
            raise DataSourceConnectionError("Not connected to a Kaggle dataset")
        
        file_path = os.path.join(self.download_dir, filename)
        
        # Skip if already downloaded
        if os.path.exists(file_path):
            logger.debug(f"File {filename} already downloaded to {file_path}")
            return file_path
        
        try:
            owner, dataset_name = self.dataset.split('/')
            logger.info(f"Downloading {filename} from {self.dataset}...")
            # Note: dataset_download_file signature is (owner, dataset, file_name, path=None, force=False, quiet=True)
            self.api.dataset_download_file(
                dataset=f"{owner}/{dataset_name}",
                file_name=filename,
                path=self.download_dir,
                force=False,
                quiet=False
            )
            
            if not os.path.exists(file_path):
                raise DataSourceConnectionError(f"File {filename} was not downloaded successfully")
            
            self.downloaded_files.append(file_path)
            logger.info(f"Successfully downloaded {filename} to {file_path}")
            return file_path
        except Exception as e:
            error_msg = str(e)
            if '403' in error_msg or 'Forbidden' in error_msg:
                raise DataSourceConnectionError(
                    f"Cannot download file from dataset '{self.dataset}': 403 Forbidden. "
                    f"Visit https://www.kaggle.com/datasets/{self.dataset} to accept the dataset's terms and conditions."
                )
            logger.exception(f"Failed to download file {filename} from dataset {self.dataset}")
            raise DataSourceConnectionError(f"Failed to download file {filename}: {e}")
    
    def connect(self, connection_details: Dict[str, Any]) -> None:
        """Establish a connection to a Kaggle dataset."""
        self.username = connection_details.get("kaggle_username")
        self.api_key = connection_details.get("kaggle_api_key")
        self.dataset = connection_details.get("kaggle_dataset")
        self.download_dir = connection_details.get("download_dir")
        csv_files_from_frontend = connection_details.get("kaggle_csv_files")
        
        if not self.dataset:
            raise DataSourceConnectionError("Kaggle dataset reference is required (format: owner/dataset-name)")
        
        if not self.download_dir:
            raise DataSourceConnectionError("Download directory is required for Kaggle connector")
        
        # Validate dataset format
        if '/' not in self.dataset or len(self.dataset.split('/')) != 2:
            raise InvalidInputError("Kaggle dataset must be in format 'owner/dataset-name'")
        
        # Authenticate with Kaggle
        self._authenticate_kaggle()
        
        # Use pre-fetched file list from frontend if available (avoids 403 errors)
        if csv_files_from_frontend:
            self._cached_csv_files = csv_files_from_frontend
            logger.info(f"Successfully connected to Kaggle dataset: {self.dataset} ({len(csv_files_from_frontend)} CSV files from frontend)")
            return
        
        # Try to pre-cache the file list to avoid issues later
        # If this fails, we'll just proceed and try again when needed
        try:
            owner, dataset_name = self.dataset.split('/')
            files = self.api.dataset_list_files(owner, dataset_name).files
            csv_files = [f.name for f in files if f.name.lower().endswith('.csv')]
            self._cached_csv_files = csv_files
            logger.info(f"Successfully connected to Kaggle dataset: {self.dataset} ({len(csv_files)} CSV files)")
        except Exception as e:
            error_msg = str(e)
            # If we get a 403, don't cache anything and let it fail later with a proper error
            if '403' not in error_msg and 'Forbidden' not in error_msg:
                logger.warning(f"Failed to pre-cache file list during connect: {e}")
            # For 403 errors, we'll try again later when list_tables is called
            logger.info(f"Connected to Kaggle dataset: {self.dataset} (file list not cached)")
    
    def disconnect(self) -> None:
        """Clean up downloaded files and close connection."""
        # Delete all downloaded files
        for file_path in self.downloaded_files:
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                    logger.debug(f"Deleted downloaded file: {file_path}")
                except OSError as e:
                    logger.warning(f"Failed to delete file {file_path}: {e}")
        
        self.downloaded_files.clear()
        self.api = None
        self.username = None
        self.api_key = None
        self.dataset = None
        self.download_dir = None
        self._cached_csv_files = None  # Clear cache
        logger.info("Disconnected from Kaggle dataset")
    
    def list_databases(self) -> List[Database]:
        """Return a single 'kaggle' database."""
        return [Database(name="kaggle")]
    
    def list_tables(self, database: str = None) -> List[Table]:
        """List CSV files in the dataset as tables."""
        if database and database != "kaggle":
            raise InvalidInputError(f"Invalid database '{database}'. Kaggle connector only supports 'kaggle' database.")
        
        csv_files = self._list_dataset_files()
        tables = [Table(name=self._sanitize_table_name(f)) for f in csv_files]
        return tables
    
    def list_columns(self, database: str = None, table: str = None) -> List[Column]:
        """List columns in a dataset file by downloading and inspecting with DuckDB."""
        if database and database != "kaggle":
            raise InvalidInputError(f"Invalid database '{database}'. Kaggle connector only supports 'kaggle' database.")
        
        if not table:
            raise InvalidInputError("Table name is required")
        
        # Find the original filename for this table
        csv_files = self._list_dataset_files()
        filename = None
        for f in csv_files:
            if self._sanitize_table_name(f) == table:
                filename = f
                break
        
        if not filename:
            raise InvalidInputError(f"Table '{table}' not found in dataset {self.dataset}")
        
        # Download the file
        file_path = self._download_file(filename)
        
        # Use DuckDB to inspect the CSV schema
        con = None
        try:
            con = duckdb.connect(database=':memory:', read_only=False)
            
            # Create a temporary view from the CSV
            safe_view_name = f'"{table}"'
            csv_reader_sql = f"read_csv_auto('{file_path}', ignore_errors=true)"
            create_view_sql = f"CREATE OR REPLACE TEMPORARY VIEW {safe_view_name} AS SELECT * FROM {csv_reader_sql};"
            logger.debug(f"Creating view with SQL: {create_view_sql}")
            con.execute(create_view_sql)
            
            # Describe the view to get column information
            describe_query = f"DESCRIBE {safe_view_name};"
            result = con.execute(describe_query).fetchall()
            
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
        except Exception as e:
            logger.exception(f"Error describing table {table}")
            raise DataSourceConnectionError(f"Failed to list columns for table {table}: {e}")
        finally:
            if con:
                con.close()
    
    def fetch_data(self, query: str) -> Tuple[List[Dict[str, str]], List[Dict[str, Any]]]:
        """Execute query against downloaded Kaggle dataset files using DuckDB."""
        if not self.dataset:
            raise DataSourceConnectionError("Not connected to a Kaggle dataset")
        
        # Parse query to find which tables are referenced
        # For simplicity, download all CSV files that might be needed
        csv_files = self._list_dataset_files()
        
        # Download all CSV files (they'll be cached if already downloaded)
        for csv_file in csv_files:
            self._download_file(csv_file)
        
        # Execute query using DuckDB
        con = None
        try:
            con = duckdb.connect(database=':memory:', read_only=False)
            
            # Create views for all downloaded CSV files
            for csv_file in csv_files:
                table_name = self._sanitize_table_name(csv_file)
                file_path = os.path.join(self.download_dir, csv_file)
                safe_view_name = f'"{table_name}"'
                csv_reader_sql = f"read_csv_auto('{file_path}', ignore_errors=true)"
                create_view_sql = f"CREATE OR REPLACE TEMPORARY VIEW {safe_view_name} AS SELECT * FROM {csv_reader_sql};"
                logger.debug(f"Creating view {table_name} from {csv_file}")
                con.execute(create_view_sql)
            
            # Execute the user's query
            logger.debug(f"Executing query: {query}")
            result_relation = con.execute(query)
            arrow_table = result_relation.fetch_arrow_table()
            
            # Extract columns and rows
            columns = []
            if arrow_table.schema:
                for i in range(len(arrow_table.schema)):
                    field = arrow_table.schema.field(i)
                    columns.append({'name': field.name, 'type': str(field.type)})
            
            rows = arrow_table.to_pylist()
            
            # Convert any Decimal types to floats for JSON serialization
            rows = process_query_result_data(rows)
            
            logger.debug(f"Query returned {len(columns)} columns and {len(rows)} rows")
            return columns, rows
        except Exception as e:
            logger.exception("Error executing query on Kaggle dataset")
            raise QueryExecutionError(f"Failed to execute query: {e}")
        finally:
            if con:
                con.close()
    
    def detect_foreign_keys(self, database: str) -> List[ForeignKeyRelationship]:
        """
        Detect potential foreign key relationships in Kaggle dataset by analyzing column names.
        
        Delegates to the shared naming-convention heuristic after gathering
        the column inventory for each table.
        
        Args:
            database: Database name (should be 'kaggle' or None)
            
        Returns:
            List of detected foreign key relationships
        """
        if database and database != "kaggle":
            raise InvalidInputError(f"Invalid database '{database}'. Kaggle connector only supports 'kaggle' database.")
        
        try:
            tables = self.list_tables(database)
            
            # Build a map of table -> columns
            table_columns: Dict[str, List[Column]] = {}
            for table in tables:
                try:
                    table_columns[table.name] = self.list_columns(database, table.name)
                except Exception as e:
                    logger.warning(f"Could not list columns for {table.name}: {e}")
                    continue
            
            return detect_foreign_keys_by_naming_convention(table_columns)
            
        except Exception as e:
            logger.warning(f"Error detecting foreign keys in Kaggle dataset: {e}")
            return []  # Return empty list on error, don't break existing functionality
