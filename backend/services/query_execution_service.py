"""Service for orchestrating query validation, translation, and execution."""

import json
import logging
from typing import Any, Dict, Tuple

import pyarrow as pa
from fastapi import status
from pydantic import ValidationError

from backend.connectors.base import BaseConnector
from backend.exceptions import (
    DataSourceConnectionError,
    InvalidInputError,
    QueryExecutionError,
    QueryGenerationError,
)
from backend.models.data_source import ConnectionDetails
from backend.models.query import QueryDescription, QueryResult
from backend.services.query_result_builder import QueryResultBuilder
from backend.services.query_service import QueryService
from backend.services.validation_service import ValidationService

logger = logging.getLogger(__name__)


class QueryExecutionService:
    """Orchestrates query validation, translation, and execution."""
    
    def __init__(self, connector: BaseConnector, conn_details: ConnectionDetails):
        self.connector = connector
        self.conn_details = conn_details
        self.query_service = QueryService()
        self.result_builder = QueryResultBuilder()
    
    def parse_query_description(self, query_desc_data: Dict[str, Any]) -> QueryDescription:
        """
        Parse and validate a query description from raw dict.
        
        Args:
            query_desc_data: Raw query description dict
            
        Returns:
            Validated QueryDescription object
            
        Raises:
            InvalidInputError: If validation fails
        """
        try:
            return QueryDescription.parse_obj(query_desc_data)
        except ValidationError as e:
            error_details = json.dumps(e.errors(), indent=2)
            logger.error(f"Query validation failed: {error_details}")
            raise InvalidInputError(
                f"Invalid query description:\n{error_details}",
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY
            )
    
    def validate_query(self, query_desc: QueryDescription) -> None:
        """
        Run all validations for a query description.
        
        Args:
            query_desc: Validated query description
            
        Raises:
            InvalidInputError: If validation fails
        """
        ValidationService.validate_csv_table_match(
            query_desc.target_table,
            self.connector,
            self.conn_details
        )
        ValidationService.require_target_database_for_clickhouse(
            query_desc,
            self.conn_details
        )
    
    def translate_query(
        self,
        query_desc: QueryDescription,
        force_raw: bool = False
    ) -> Tuple[str, Dict[str, Any]]:
        """
        Translate QueryDescription to SQL with optimization.
        
        Args:
            query_desc: Query description to translate
            force_raw: If True, disable sampling/optimization for raw slice caching
            
        Returns:
            Tuple of (sql_query, extended_metadata)
            
        Raises:
            QueryGenerationError: If translation fails
        """
        from backend.services.optimization.config import OptimizerConfig
        from backend.services.optimization.optimizer import QueryOptimizer
        
        db_type = self.conn_details.type
        
        try:
            config = OptimizerConfig.from_env()
            optimizer = QueryOptimizer(self.connector, config)
            
            sql_query, extended_metadata = self.query_service.translate_to_sql(
                query_desc=query_desc,
                table_name=query_desc.target_table,
                db_type=db_type,
                with_sampling=not force_raw,
                with_optimization=not force_raw,
                optimizer=optimizer,
                connector=self.connector
            )
            return sql_query, extended_metadata
            
        except ValueError as e:
            raise QueryGenerationError(f"Query generation error: {e}")
        except Exception as e:
            logger.exception("Unexpected error during query translation")
            raise QueryGenerationError("Internal server error during query generation.")
    
    def execute_json(self, query_desc: QueryDescription) -> QueryResult:
        """
        Execute query and return JSON-serializable result.
        
        Args:
            query_desc: Query description to execute
            
        Returns:
            QueryResult with columns, rows, and metadata
            
        Raises:
            QueryExecutionError: If execution fails
        """
        # Validate
        self.validate_query(query_desc)
        
        # Translate
        is_force_raw = bool(getattr(query_desc, "force_raw_rows", False))
        sql_query, extended_metadata = self.translate_query(query_desc, force_raw=is_force_raw)
        
        # Execute
        try:
            columns, rows = self.connector.fetch_data(sql_query)
            
            return self.result_builder.build_result(
                columns=columns,
                rows=rows,
                sql_query=sql_query,
                extended_metadata=extended_metadata
            )
        except NotImplementedError as e:
            raise QueryExecutionError(str(e))
        except (QueryExecutionError, DataSourceConnectionError):
            raise
        except Exception as e:
            logger.exception("Unexpected error during query execution")
            raise QueryExecutionError("An unexpected server error occurred during query execution.")
    
    def execute_arrow(self, query_desc: QueryDescription) -> Tuple[pa.Table, str, Dict[str, Any]]:
        """
        Execute query and return Arrow table with metadata.
        
        Args:
            query_desc: Query description to execute
            
        Returns:
            Tuple of (arrow_table, sql_query, extended_metadata)
            
        Raises:
            QueryExecutionError: If execution fails
        """
        # Validate
        self.validate_query(query_desc)
        
        # Translate
        is_force_raw = bool(getattr(query_desc, "force_raw_rows", False))
        sql_query, extended_metadata = self.translate_query(query_desc, force_raw=is_force_raw)
        
        # Execute
        try:
            arrow_table = self.connector.fetch_data_arrow(sql_query)
            return arrow_table, sql_query, extended_metadata
            
        except NotImplementedError as e:
            raise QueryExecutionError(str(e))
        except (QueryExecutionError, DataSourceConnectionError):
            raise
        except Exception as e:
            logger.exception("Unexpected error during Arrow query execution")
            raise QueryExecutionError("An unexpected server error occurred during query execution.")

