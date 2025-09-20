"""Connection lifecycle service: handles connect/disconnect and CSV file management."""

import os
import shutil
import tempfile
import csv
import logging
from typing import Optional, Dict, Any

from fastapi import Request, UploadFile, status
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from backend.models.data_source import ConnectionDetails
from backend.connectors.base import BaseConnector
from backend.connectors.file_connector import FileConnector
from backend.connectors.clickhouse_connector import ClickHouseConnector
from backend.exceptions import (
    AppException,
    InvalidInputError,
    DataSourceConnectionError,
    FileProcessingError,
)
from backend.dependencies import ConnectionStateManager


logger = logging.getLogger(__name__)


MAX_CSV_UPLOAD_BYTES = 64 * 1024 * 1024  # 64 MiB
CSV_SNIFF_BYTES = 16384
ALLOWED_CSV_MIME_TYPES = {
    "text/csv",
    "application/csv",
    "application/vnd.ms-excel",
    "text/plain",
}


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
    async def _validate_csv_file(path: str) -> None:
        def _validate():
            if not os.path.exists(path):
                raise FileProcessingError("Temporary file missing during validation.")
            with open(path, "rb") as f:
                sample_bytes = f.read(CSV_SNIFF_BYTES)
            sample = sample_bytes.decode("utf-8", errors="ignore")
            if not sample or not sample.strip():
                raise InvalidInputError("Uploaded CSV file is empty or unreadable.")
            try:
                csv.Sniffer().sniff(sample)
            except csv.Error:
                try:
                    next(csv.reader(sample.splitlines()))
                except Exception:
                    raise InvalidInputError("Uploaded file does not appear to be valid CSV.")
        await run_in_threadpool(_validate)

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
            _CONNECTOR_REGISTRY = registry
        return registry.create(connection_details.type, state_manager)

    async def _clear_previous_state(self, session_id: str) -> None:
        if self.state_manager.current_connector:
            await run_in_threadpool(self.state_manager.current_connector.disconnect)
        if self.state_manager.current_csv_temp_path and os.path.exists(self.state_manager.current_csv_temp_path):
            try:
                upload_root_dir = self._get_upload_root_dir()
                if self._is_path_within_directory(self.state_manager.current_csv_temp_path, upload_root_dir):
                    os.remove(self.state_manager.current_csv_temp_path)
                else:
                    logger.warning(
                        f"Refusing to delete file outside upload root during clear: {self.state_manager.current_csv_temp_path}"
                    )
            except OSError:
                logger.error(
                    f"Error cleaning up previous temp file {self.state_manager.current_csv_temp_path}",
                    exc_info=True,
                )
        self.state_manager.clear_state()

    # ----- Public API -----
    async def connect_multipart(
        self,
        connection_details_json: str,
        uploaded_file: Optional[UploadFile],
        session_id: str,
    ) -> Dict[str, Any]:
        await self._clear_previous_state(session_id)

        temp_file_path: Optional[str] = None
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
                if not uploaded_file:
                    raise InvalidInputError("A CSV file upload is required for type 'csv'")
                if not uploaded_file.filename or not uploaded_file.filename.lower().endswith('.csv'):
                    raise InvalidInputError("Invalid file type or missing filename. Only CSV files are allowed.")
                if uploaded_file.content_type not in ALLOWED_CSV_MIME_TYPES:
                    raise InvalidInputError(
                        detail=f"Unsupported content type: {uploaded_file.content_type}",
                        status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                    )
                try:
                    session_upload_dir = self._get_session_upload_dir(session_id)
                    fd, temp_file_path = tempfile.mkstemp(suffix=".csv", dir=session_upload_dir)
                    os.close(fd)
                    try:
                        await self._save_uploaded_file_with_limit(uploaded_file, temp_file_path, MAX_CSV_UPLOAD_BYTES)
                    except InvalidInputError:
                        if temp_file_path and os.path.exists(temp_file_path):
                            os.remove(temp_file_path)
                        raise
                    await self._validate_csv_file(temp_file_path)
                    connect_args['file_path'] = temp_file_path
                finally:
                    if uploaded_file:
                        await uploaded_file.close()
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
                csv_temp_path=temp_file_path,
            )

            return {"message": f"Successfully connected to {connection_details.type} source.", "file_path": temp_file_path}

        except (InvalidInputError, FileProcessingError, DataSourceConnectionError) as e:
            if temp_file_path and os.path.exists(temp_file_path):
                os.remove(temp_file_path)
            self.state_manager.clear_state()
            raise e
        except Exception:
            if temp_file_path and os.path.exists(temp_file_path):
                os.remove(temp_file_path)
            self.state_manager.clear_state()
            logger.exception("Unexpected error during connect (multipart)")
            raise AppException("An unexpected server error occurred during connection.")

    async def connect_json(
        self,
        connection_details: ConnectionDetails,
        session_id: str,
    ) -> Dict[str, Any]:
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

            connector = self._get_connector(effective_connection_details, self.state_manager)
            await run_in_threadpool(connector.connect, connect_args)

            self.state_manager.set_state(
                connector=connector,
                details=effective_connection_details,
                csv_temp_path=None,
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
        file_to_delete = self.state_manager.current_csv_temp_path
        session_upload_dir = None
        try:
            upload_root_dir = self._get_upload_root_dir()
            session_upload_dir = os.path.join(upload_root_dir, session_id) if session_id else None
        except Exception:
            session_upload_dir = None

        if self.state_manager.current_connector:
            await run_in_threadpool(self.state_manager.current_connector.disconnect)

        self.state_manager.clear_state()

        if file_to_delete and os.path.exists(file_to_delete):
            try:
                if session_upload_dir and self._is_path_within_directory(file_to_delete, session_upload_dir):
                    os.remove(file_to_delete)
                    logger.info(f"Deleted temp file: {file_to_delete}")
                else:
                    logger.warning(f"Refusing to delete file outside session temp dir: {file_to_delete}")
            except OSError:
                logger.error(f"Error deleting temp file {file_to_delete}", exc_info=True)

        return {"message": "Successfully disconnected."}


