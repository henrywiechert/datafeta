"""Base class for data source connectors."""
from abc import ABC, abstractmethod
from typing import List, Dict, Any
from backend.models import Database, Table, Column

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

    # Later: Add method for fetching data
    # @abstractmethod
    # def fetch_data(self, query: str) -> List[Dict[str, Any]]:
    #     pass 