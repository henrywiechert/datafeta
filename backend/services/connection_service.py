# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
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
from backend.connectors.file_handlers import FILE_HANDLER_REGISTRY
from backend.connectors.registry import get_connector_registry
from backend.exceptions import (
    AppException,
    InvalidInputError,
    DataSourceConnectionError,
    FileProcessingError,
)
from backend.session_state import ConnectionStateManager
from backend.utils.logging_utils import redact_sensitive


logger = logging.getLogger(__name__)


MAX_FILE_UPLOAD_BYTES = 1024 * 1024 * 1024  # 1 GB per file

# Supported file extensions
ALLOWED_FILE_EXTENSIONS = {'.csv', '.parquet', '.json', '.ndjson', '.jsonl'}

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

# MIME types for JSON / NDJSON / JSONL files
ALLOWED_JSON_MIME_TYPES = {
    "application/json",
    "application/x-ndjson",
    "application/jsonl",
}

# Combined allowed MIME types
ALLOWED_FILE_MIME_TYPES = ALLOWED_CSV_MIME_TYPES | ALLOWED_PARQUET_MIME_TYPES | ALLOWED_JSON_MIME_TYPES


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

    async def _save_and_validate_uploaded_file(
        self,
        uploaded_file: UploadFile,
        session_upload_dir: str,
    ) -> str:
        """
        Validate, save, and content-check a single uploaded file.

        Returns the temp file path on success. Cleans up the temp file and
        re-raises on any validation or I/O error.
        """
        if not uploaded_file.filename:
            raise InvalidInputError("Missing filename for uploaded file.")

        file_ext = self._get_file_extension(uploaded_file.filename)
        if file_ext not in ALLOWED_FILE_EXTENSIONS:
            raise InvalidInputError(
                f"Invalid file type: {file_ext}. Allowed: {', '.join(sorted(ALLOWED_FILE_EXTENSIONS))}"
            )

        if uploaded_file.content_type not in ALLOWED_FILE_MIME_TYPES:
            raise InvalidInputError(
                detail=f"Unsupported content type: {uploaded_file.content_type}",
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            )

        fd, temp_file_path = tempfile.mkstemp(suffix=file_ext, dir=session_upload_dir)
        os.close(fd)

        try:
            await self._save_uploaded_file_with_limit(uploaded_file, temp_file_path, MAX_FILE_UPLOAD_BYTES)
            handler = FILE_HANDLER_REGISTRY[file_ext]({})
            await run_in_threadpool(handler.validate, temp_file_path)
        except Exception:
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
            raise

        logger.info(f"Saved uploaded file: {uploaded_file.filename} -> {temp_file_path}")
        return temp_file_path

    @staticmethod
    def _get_connector(connection_details: ConnectionDetails) -> BaseConnector:
        registry = get_connector_registry()
        return registry.create(connection_details.type)

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

            registry = get_connector_registry()
            spec = registry.get_spec(connection_details.type)
            if not spec.capabilities.supports_multipart_connect:
                raise InvalidInputError(
                    f"{connection_details.type} connections do not support multipart upload.",
                    status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                )

            connect_args: Dict[str, Any]
            effective_connection_details = connection_details.copy(deep=True)

            try:
                cfg = spec.config_model.model_validate(connection_details.model_dump())
            except Exception as e:
                raise InvalidInputError(
                    f"Invalid connection details for type '{connection_details.type}': {e}",
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                )

            if not spec.build_multipart_connect_args:
                raise InvalidInputError(
                    f"Multipart connect is not implemented for type '{connection_details.type}'.",
                    status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                )
            connect_args, temp_file_paths = await spec.build_multipart_connect_args(
                self,
                cfg,
                uploaded_files,
                session_id,
            )

            connector = self._get_connector(effective_connection_details)
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
            registry = get_connector_registry()
            spec = registry.get_spec(connection_details.type)

            if not spec.capabilities.supports_json_connect:
                raise InvalidInputError(
                    f"{connection_details.type} connections require multipart upload. "
                    f"Use /api/v1/data/connect with form-data.",
                    status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                )

            connect_args: Dict[str, Any] = {}
            effective_connection_details = connection_details.copy(deep=True)

            # Validate config via connector spec model
            try:
                cfg = spec.config_model.model_validate(connection_details.model_dump())
            except Exception as e:
                raise InvalidInputError(
                    f"Invalid connection details for type '{connection_details.type}': {e}",
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                )

            if spec.build_connect_args:
                connect_args = spec.build_connect_args(cfg, self.request, session_id)
            else:
                connect_args = cfg.model_dump(exclude_none=True)

            logger.info(
                "Prepared connect args for connector type '%s': %s",
                connection_details.type,
                redact_sensitive(connect_args),
            )

            connector = self._get_connector(effective_connection_details)
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

    async def connect_hive(
        self,
        connection_details: ConnectionDetails,
        session_id: str,
    ) -> Dict[str, Any]:
        """
        Phase 1: Connect to Hive-partitioned Parquet dataset.
        
        Parses the file structure to identify partitions without uploading files.
        
        Args:
            connection_details: Must include type='hive_parquet' and hive_file_structure
            session_id: Session identifier
            
        Returns:
            Dict with partition_column and list of tables (partition values)
        """
        async with self.state_manager.lock:
            await self._clear_previous_state(session_id)

        connector: Optional[BaseConnector] = None
        try:
            registry = get_connector_registry()
            spec = registry.get_spec(connection_details.type)
            if spec.id != "hive_parquet":
                raise InvalidInputError(
                    "connect_hive endpoint requires type='hive_parquet'",
                    status_code=status.HTTP_400_BAD_REQUEST,
                )

            try:
                cfg = spec.config_model.model_validate(connection_details.model_dump())
            except Exception as e:
                raise InvalidInputError(
                    f"Invalid connection details for type '{connection_details.type}': {e}",
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                )

            if not spec.build_connect_args:
                raise RuntimeError("Hive parquet spec must provide build_connect_args")

            connect_args = spec.build_connect_args(cfg, self.request, session_id)

            connector = self._get_connector(connection_details)
            await run_in_threadpool(connector.connect, connect_args)

            self.state_manager.set_state(
                connector=connector,
                details=connection_details,
                temp_paths=[],  # No files uploaded yet
            )

            # Return partition info for the frontend
            tables = connector.list_tables()
            return {
                "message": f"Connected to Hive Parquet dataset with {len(tables)} partition(s).",
                "partition_column": connector.partition_column,
                "tables": [t.name for t in tables],
            }

        except (InvalidInputError, DataSourceConnectionError) as e:
            self.state_manager.clear_state()
            raise e
        except Exception:
            self.state_manager.clear_state()
            logger.exception("Unexpected error during Hive Parquet connect")
            raise AppException("An unexpected server error occurred during connection.")

    async def load_hive_partition(
        self,
        partition_name: str,
        uploaded_files: List[UploadFile],
        session_id: str,
    ) -> Dict[str, Any]:
        """
        Phase 2: Upload files for a specific Hive partition.
        
        Args:
            partition_name: The partition value (e.g., "us", "eu")
            uploaded_files: Parquet files belonging to this partition
            session_id: Session identifier
            
        Returns:
            Dict with columns list for the partition
        """
        connector = self.state_manager.current_connector
        details = self.state_manager.current_connection_details
        if not connector:
            raise DataSourceConnectionError("Not connected to any data source")

        if not details or details.type != "hive_parquet":
            raise InvalidInputError("load_hive_partition requires a Hive Parquet connection")

        if not uploaded_files:
            raise InvalidInputError("At least one parquet file is required")

        session_upload_dir = self._get_session_upload_dir(session_id)
        temp_file_paths: List[str] = []

        try:
            for uploaded_file in uploaded_files:
                if not uploaded_file.filename:
                    raise InvalidInputError("Missing filename for uploaded file.")
                
                file_ext = self._get_file_extension(uploaded_file.filename)
                if file_ext != '.parquet':
                    raise InvalidInputError(
                        f"Only parquet files are allowed for Hive partitions. Got: {file_ext}"
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
                    if os.path.exists(temp_file_path):
                        os.remove(temp_file_path)
                        temp_file_paths.remove(temp_file_path)
                    raise
                
                # Validate parquet file
                handler = FILE_HANDLER_REGISTRY['.parquet']({})
                await run_in_threadpool(handler.validate, temp_file_path)
                
                logger.info(f"Saved partition file: {uploaded_file.filename} -> {temp_file_path}")

            # Close all uploaded files
            for uploaded_file in uploaded_files:
                await uploaded_file.close()

            # Register files with the connector
            await run_in_threadpool(connector.load_partition, partition_name, temp_file_paths)

            # Update temp paths in state manager
            existing_paths = self.state_manager.current_temp_paths or []
            self.state_manager.set_state(
                connector=connector,
                details=self.state_manager.current_connection_details,
                temp_paths=existing_paths + temp_file_paths,
            )

            # Get columns for the loaded partition
            columns = await run_in_threadpool(connector.list_columns, None, partition_name)

            return {
                "message": f"Loaded partition '{partition_name}' with {len(temp_file_paths)} file(s).",
                "partition_name": partition_name,
                "columns": [{"name": c.name, "data_type": c.data_type, "is_datetime": c.is_datetime} for c in columns],
            }

        except (InvalidInputError, DataSourceConnectionError) as e:
            # Clean up temp files on error
            for path in temp_file_paths:
                if path and os.path.exists(path):
                    os.remove(path)
            raise e
        except Exception:
            # Clean up temp files on error
            for path in temp_file_paths:
                if path and os.path.exists(path):
                    os.remove(path)
            logger.exception("Unexpected error during partition load")
            raise AppException("An unexpected server error occurred during partition load.")

    async def add_files(
        self,
        uploaded_files: List[UploadFile],
        session_id: str,
    ) -> Dict[str, Any]:
        """
        Add more files to an existing CSV/Parquet connection.

        Each uploaded file becomes a new table in the active FileConnector.
        The session's tracked temp paths are extended so disconnect cleans them up.

        Args:
            uploaded_files: Files to append to the current connection
            session_id: Session identifier for file isolation

        Returns:
            Dict with added_tables list
        """
        async with self.state_manager.lock:
            connector = self.state_manager.current_connector
            if not connector:
                raise InvalidInputError("Not connected to any data source.")

            if not uploaded_files:
                raise InvalidInputError("At least one file is required.")

            details = self.state_manager.current_connection_details
            if not details:
                raise InvalidInputError("Missing active connection details.")

            spec = get_connector_registry().get_spec(details.type)
            if not spec.capabilities.supports_incremental_file_add:
                raise InvalidInputError(
                    f"Adding files is not supported for connection type '{details.type}'."
                )

            if not hasattr(connector, "add_file"):
                raise InvalidInputError(
                    f"Active connector for type '{details.type}' does not support file appends."
                )
            csv_config = {
                'delimiter': details.csv_delimiter or ',',
                'header': details.csv_has_header if details.csv_has_header is not None else True,
                'decimal_separator': details.csv_decimal_separator or '.',
                'thousands_separator': details.csv_thousands_separator or '',
                'date_format': details.csv_date_format or '%Y-%m-%d',
                'timestamp_format': details.csv_timestamp_format or '%Y-%m-%d %H:%M:%S',
                'sample_size': (
                    -1
                    if details.csv_sample_full_dataset
                    else (details.csv_sample_size or 1000)
                ),
            }

            session_upload_dir = self._get_session_upload_dir(session_id)
            temp_file_paths: List[str] = []
            added_tables: List[str] = []

            try:
                for uploaded_file in uploaded_files:
                    temp_file_path = await self._save_and_validate_uploaded_file(
                        uploaded_file, session_upload_dir
                    )
                    temp_file_paths.append(temp_file_path)
                    table_name = await run_in_threadpool(
                        connector.add_file, temp_file_path, uploaded_file.filename, csv_config
                    )
                    added_tables.append(table_name)
                    logger.info(f"Added file to session: {uploaded_file.filename} -> table '{table_name}'")

                for uploaded_file in uploaded_files:
                    await uploaded_file.close()

                self.state_manager.append_temp_paths(temp_file_paths)

                return {
                    "message": f"Added {len(added_tables)} file(s) to the current connection.",
                    "added_tables": added_tables,
                }

            except (InvalidInputError, DataSourceConnectionError) as e:
                for path in temp_file_paths:
                    if path and os.path.exists(path):
                        os.remove(path)
                raise e
            except Exception:
                for path in temp_file_paths:
                    if path and os.path.exists(path):
                        os.remove(path)
                logger.exception("Unexpected error during add_files")
                raise AppException("An unexpected server error occurred while adding files.")

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
