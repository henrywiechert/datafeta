"""Base class for data source connectors."""
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Tuple
from backend.models.data_source import Database, Table, Column, ForeignKeyRelationship

class BaseConnector(ABC):

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

    def detect_similar_tables(self, database: str, primary_table: str) -> List[str]:
        """
        Detect tables with identical schemas that can be combined with UNION ALL.
        
        This is optional and may return empty list if not supported.
        Subclasses can override to provide database-specific schema matching.
        
        Args:
            database: The database name to search
            primary_table: Reference table to compare against
            
        Returns:
            List of table names with matching schemas
        """
        return []  # Default: no schema detection

    # Later: Add method for fetching data
    # @abstractmethod
    # def fetch_data(self, query: str) -> List[Dict[str, Any]]:
    #     pass 