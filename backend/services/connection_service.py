"""Connection lifecycle service: handles connect/disconnect and file management."""

import os
import shutil
import tempfile
import logging
from typing import Optional, Dict, Any, List

from fastapi import Request, UploadFile, status
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from backend.models.data_source import ConnectionDetails
from backend.connectors.base import BaseConnector
from backend.connectors.file_connector import FileConnector
from backend.connectors.file_handlers import FILE_HANDLER_REGISTRY
from backend.connectors.clickhouse_connector import ClickHouseConnector
from backend.connectors.kaggle_connector import KaggleConnector
from backend.exceptions import (
    AppException,
    InvalidInputError,
    DataSourceConnectionError,
    FileProcessingError,
)
from backend.dependencies import ConnectionStateManager


logger = logging.getLogger(__name__)


MAX_FILE_UPLOAD_BYTES = 64 * 1024 * 1024  # 64 MiB per file

# Supported file extensions
ALLOWED_FILE_EXTENSIONS = {'.csv', '.parquet'}

# MIME types for CSV files
ALLOWED_CSV_MIME_TYPES = {
    "text/csv",
    "application/csv",
    "application/vnd.ms-excel",
    "text/plain",
}

# MIME types for Parquet files
ALLOWED_PARQUET_MIME_TYPES = {
    "application/octet-stream",
    "application/x-parquet",
    "application/vnd.apache.parquet",
}

# Combined allowed MIME types
ALLOWED_FILE_MIME_TYPES = ALLOWED_CSV_MIME_TYPES | ALLOWED_PARQUET_MIME_TYPES


class ConnectorRegistry:
    """Registry for connector constructors by type key."""
    def __init__(self):
        self._builders: Dict[str, Any] = {}

    def register(self, key: str, builder: Any) -> None:
        self._builders[key] = builder

    def create(self, key: str, state_manager: ConnectionStateManager) -> BaseConnector:
        if key not in self._builders:
            raise InvalidInputError(
                f"Unsupported data source type for connector factory: {key}",
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        return self._builders[key](state_manager)


class ConnectionService:
    def __init__(self, state_manager: ConnectionStateManager, request: Request):
        self.state_manager = state_manager
        self.request = request

    # ----- Helpers -----
    def _get_upload_root_dir(self) -> str:
        upload_root_dir = getattr(self.request.app.state, "upload_root_dir", None)
        if not upload_root_dir:
            raise RuntimeError("Upload root directory is not initialized")
        return upload_root_dir

    def _get_session_upload_dir(self, session_id: str) -> str:
        upload_root_dir = self._get_upload_root_dir()
        session_dir = os.path.join(upload_root_dir, session_id)
        os.makedirs(session_dir, exist_ok=True)
        return session_dir

    @staticmethod
    def _is_path_within_directory(path: str, directory: str) -> bool:
        try:
            directory_real = os.path.realpath(directory)
            path_real = os.path.realpath(path)
            return os.path.commonpath([directory_real]) == os.path.commonpath([directory_real, path_real])
        except Exception:
            return False

    @staticmethod
    async def _save_uploaded_file_with_limit(uploaded_file: UploadFile, dest_path: str, max_bytes: int) -> None:
        def _copy_limited():
            bytes_copied = 0
            with open(dest_path, "wb") as buffer:
                while True:
                    chunk = uploaded_file.file.read(1024 * 1024)
                    if not chunk:
                        break
                    bytes_copied += len(chunk)
                    if bytes_copied > max_bytes:
                        raise InvalidInputError(
                            detail=f"Uploaded file exceeds max size of {max_bytes} bytes.",
                            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        )
                    buffer.write(chunk)
        await run_in_threadpool(_copy_limited)

    @staticmethod
    def _get_file_extension(filename: str) -> str:
        """Get the lowercase file extension from a filename."""
        _, ext = os.path.splitext(filename)
        return ext.lower()

    @staticmethod
    def _get_connector(connection_details: ConnectionDetails, state_manager: ConnectionStateManager) -> BaseConnector:
        # Lazy init a module-level registry
        global _CONNECTOR_REGISTRY
        try:
            registry = _CONNECTOR_REGISTRY
        except NameError:
            registry = ConnectorRegistry()
            # For csv we need FileConnector which requires state_manager
            registry.register("csv", lambda sm: FileConnector(state_manager=sm))
            # ClickHouse connector ignores state_manager
            registry.register("clickhouse", lambda sm: ClickHouseConnector())
            # Kaggle connector requires state_manager for session file management
            registry.register("kaggle", lambda sm: KaggleConnector(state_manager=sm))
            _CONNECTOR_REGISTRY = registry
        return registry.create(connection_details.type, state_manager)

    async def _clear_previous_state(self, session_id: str) -> None:
        if self.state_manager.current_connector:
            await run_in_threadpool(self.state_manager.current_connector.disconnect)
        
        # Clean up all temp files (supports multi-file uploads)
        temp_paths = self.state_manager.current_temp_paths or []
        if temp_paths:
            upload_root_dir = self._get_upload_root_dir()
            for temp_path in temp_paths:
                if temp_path and os.path.exists(temp_path):
                    try:
                        if self._is_path_within_directory(temp_path, upload_root_dir):
                            os.remove(temp_path)
                            logger.debug(f"Deleted temp file during clear: {temp_path}")
                        else:
                            logger.warning(
                                f"Refusing to delete file outside upload root during clear: {temp_path}"
                            )
                    except OSError:
                        logger.error(
                            f"Error cleaning up previous temp file {temp_path}",
                            exc_info=True,
                        )
        self.state_manager.clear_state()

    # ----- Public API -----
    async def connect_multipart(
        self,
        connection_details_json: str,
        uploaded_files: List[UploadFile],
        session_id: str,
    ) -> Dict[str, Any]:
        """
        Connect to file-based data sources (CSV, Parquet).
        
        Supports single or multiple file uploads. Each file becomes a separate table.
        
        Args:
            connection_details_json: JSON string with connection configuration
            uploaded_files: List of uploaded files (CSV and/or Parquet)
            session_id: Session identifier for file isolation
            
        Returns:
            Dict with success message and file paths
        """
        async with self.state_manager.lock:
            await self._clear_previous_state(session_id)

        temp_file_paths: List[str] = []
        connector: Optional[BaseConnector] = None
        try:
            try:
                connection_details = ConnectionDetails.parse_raw(connection_details_json)
            except ValidationError as e:
                raise InvalidInputError(
                    f"Invalid connection details format: {e}",
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                )

            connect_args: Dict[str, Any] = {}
            effective_connection_details = connection_details.copy(deep=True)

            if connection_details.type == "csv":
                if not uploaded_files:
                    raise InvalidInputError("At least one file upload is required for type 'csv'")
                
                session_upload_dir = self._get_session_upload_dir(session_id)
                file_infos: List[Dict[str, str]] = []
                
                try:
                    for uploaded_file in uploaded_files:
                        # Validate filename and extension
                        if not uploaded_file.filename:
                            raise InvalidInputError("Missing filename for uploaded file.")
                        
                        file_ext = self._get_file_extension(uploaded_file.filename)
                        if file_ext not in ALLOWED_FILE_EXTENSIONS:
                            raise InvalidInputError(
                                f"Invalid file type: {file_ext}. Allowed: {', '.join(ALLOWED_FILE_EXTENSIONS)}"
                            )
                        
                        # Validate MIME type
                        if uploaded_file.content_type not in ALLOWED_FILE_MIME_TYPES:
                            raise InvalidInputError(
                                detail=f"Unsupported content type: {uploaded_file.content_type}",
                                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                            )
                        
                        # Save file to temp location
                        fd, temp_file_path = tempfile.mkstemp(suffix=file_ext, dir=session_upload_dir)
                        os.close(fd)
                        temp_file_paths.append(temp_file_path)
                        
                        try:
                            await self._save_uploaded_file_with_limit(
                                uploaded_file, temp_file_path, MAX_FILE_UPLOAD_BYTES
                            )
                        except InvalidInputError:
                            # Remove the file we just created if save failed
                            if os.path.exists(temp_file_path):
                                os.remove(temp_file_path)
                                temp_file_paths.remove(temp_file_path)
                            raise
                        
                        # Validate file using the appropriate format handler
                        handler = FILE_HANDLER_REGISTRY[file_ext]({})
                        await run_in_threadpool(handler.validate, temp_file_path)
                        
                        file_infos.append({
                            "file_path": temp_file_path,
                            "original_filename": uploaded_file.filename,
                        })
                        
                        logger.info(f"Saved uploaded file: {uploaded_file.filename} -> {temp_file_path}")
                        
                finally:
                    # Close all uploaded files
                    for uploaded_file in uploaded_files:
                        await uploaded_file.close()
                
                # Build connect args with multi-file support
                connect_args['file_paths'] = file_infos
                
                # Pass CSV configuration options (applied to all CSV files)
                if connection_details.csv_delimiter is not None:
                    connect_args['csv_delimiter'] = connection_details.csv_delimiter
                if connection_details.csv_has_header is not None:
                    connect_args['csv_has_header'] = connection_details.csv_has_header
                if connection_details.csv_decimal_separator is not None:
                    connect_args['csv_decimal_separator'] = connection_details.csv_decimal_separator
                if connection_details.csv_thousands_separator is not None:
                    connect_args['csv_thousands_separator'] = connection_details.csv_thousands_separator
                if connection_details.csv_date_format is not None:
                    connect_args['csv_date_format'] = connection_details.csv_date_format
                if connection_details.csv_timestamp_format is not None:
                    connect_args['csv_timestamp_format'] = connection_details.csv_timestamp_format
                    
            elif connection_details.type == "clickhouse":
                if connection_details.connection_string:
                    connect_args['connection_string'] = connection_details.connection_string
                elif connection_details.host:
                    ch_args = {
                        "host": connection_details.host,
                        "port": connection_details.port,
                        "user": connection_details.user,
                        "password": connection_details.password,
                        "database": connection_details.database,
                    }
                    connect_args = {k: v for k, v in ch_args.items() if v is not None}
                else:
                    raise InvalidInputError("Either connection_string or host must be provided for ClickHouse")
            else:
                raise InvalidInputError(f"Unsupported data source type: {connection_details.type}")

            connector = self._get_connector(effective_connection_details, self.state_manager)
            await run_in_threadpool(connector.connect, connect_args)

            self.state_manager.set_state(
                connector=connector,
                details=effective_connection_details,
                temp_paths=temp_file_paths,
            )

            return {
                "message": f"Successfully connected to {connection_details.type} source with {len(temp_file_paths)} file(s).",
                "file_paths": temp_file_paths,
            }

        except (InvalidInputError, FileProcessingError, DataSourceConnectionError) as e:
            # Clean up all temp files on error
            for path in temp_file_paths:
                if path and os.path.exists(path):
                    os.remove(path)
            self.state_manager.clear_state()
            raise e
        except Exception:
            # Clean up all temp files on error
            for path in temp_file_paths:
                if path and os.path.exists(path):
                    os.remove(path)
            self.state_manager.clear_state()
            logger.exception("Unexpected error during connect (multipart)")
            raise AppException("An unexpected server error occurred during connection.")

    async def connect_json(
        self,
        connection_details: ConnectionDetails,
        session_id: str,
    ) -> Dict[str, Any]:
        async with self.state_manager.lock:
            await self._clear_previous_state(session_id)

        connector: Optional[BaseConnector] = None
        try:
            if connection_details.type == "csv":
                raise InvalidInputError(
                    "CSV connections require multipart upload. Use /api/v1/data/connect with form-data.",
                    status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                )

            connect_args: Dict[str, Any] = {}
            effective_connection_details = connection_details.copy(deep=True)

            if connection_details.type == "clickhouse":
                logger.info(f"ClickHouse connection details: host={connection_details.host}, port={connection_details.port}")
                if connection_details.connection_string:
                    connect_args['connection_string'] = connection_details.connection_string
                elif connection_details.host:
                    ch_args = {
                        "host": connection_details.host,
                        "port": connection_details.port,
                        "user": connection_details.user,
                        "password": connection_details.password,
                        "database": connection_details.database,
                    }
                    connect_args = {k: v for k, v in ch_args.items() if v is not None}
                    logger.info(f"ClickHouse connect_args: {connect_args}")
                else:
                    raise InvalidInputError("Either connection_string or host must be provided for ClickHouse")
            elif connection_details.type == "kaggle":
                logger.info(f"Kaggle connection for dataset: {connection_details.kaggle_dataset}")
                # Create session-specific download directory
                session_dir = self._get_session_upload_dir(session_id)
                connect_args = {
                    "kaggle_username": connection_details.kaggle_username,
                    "kaggle_api_key": connection_details.kaggle_api_key,
                    "kaggle_dataset": connection_details.kaggle_dataset,
                    "kaggle_csv_files": connection_details.kaggle_csv_files,
                    "download_dir": session_dir,
                }
                logger.info(f"Kaggle connect_args prepared for dataset: {connection_details.kaggle_dataset}")

            connector = self._get_connector(effective_connection_details, self.state_manager)
            await run_in_threadpool(connector.connect, connect_args)

            self.state_manager.set_state(
                connector=connector,
                details=effective_connection_details,
                temp_paths=None,
            )

            return {"message": f"Successfully connected to {connection_details.type} source."}
        except (InvalidInputError, DataSourceConnectionError) as e:
            self.state_manager.clear_state()
            raise e
        except Exception:
            self.state_manager.clear_state()
            logger.exception("Unexpected error during connect (json)")
            raise AppException("An unexpected server error occurred during connection.")

    async def disconnect(self, session_id: str) -> Dict[str, Any]:
        files_to_delete = self.state_manager.current_temp_paths or []
        session_upload_dir = None
        try:
            upload_root_dir = self._get_upload_root_dir()
            session_upload_dir = os.path.join(upload_root_dir, session_id) if session_id else None
        except Exception:
            session_upload_dir = None

        async with self.state_manager.lock:
            if self.state_manager.current_connector:
                await run_in_threadpool(self.state_manager.current_connector.disconnect)

            self.state_manager.clear_state()

            # Delete all temp files
            deleted_count = 0
            for file_to_delete in files_to_delete:
                if file_to_delete and os.path.exists(file_to_delete):
                    try:
                        if session_upload_dir and self._is_path_within_directory(file_to_delete, session_upload_dir):
                            os.remove(file_to_delete)
                            deleted_count += 1
                            logger.debug(f"Deleted temp file: {file_to_delete}")
                        else:
                            logger.warning(f"Refusing to delete file outside session temp dir: {file_to_delete}")
                    except OSError:
                        logger.error(f"Error deleting temp file {file_to_delete}", exc_info=True)
            
            if deleted_count > 0:
                logger.info(f"Deleted {deleted_count} temp file(s) during disconnect")

        return {"message": "Successfully disconnected."}


