# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Connection lifecycle service: handles connect/disconnect and file management."""

import json
import os
import shutil
import tempfile
import logging
import uuid
from typing import Collection, Optional, Dict, Any, List, Tuple

from fastapi import Request, UploadFile, status
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool

from backend.models.data_source import ConnectionDetails
from backend.connectors.base import BaseConnector
from backend.connectors.file_handlers import (
    FILE_EXTENSIONS,
    FILE_MIME_TYPES,
    PartInfo,
    build_parsing_options,
    handler_for,
    resolve_part_selection,
)
from backend.connectors.registry import get_connector_registry
from backend.connectors.sqlite_connector import validate_sqlite_file
from backend.exceptions import (
    AppException,
    InvalidInputError,
    DataSourceConnectionError,
    FileProcessingError,
    ResourceNotFoundError,
)
from backend.session_state import ConnectionStateManager, StagedUpload
from backend.utils.compression import (
    ALLOWED_COMPRESSED_MIME_TYPES,
    COMPRESSION_EXTENSIONS,
    ZIP_EXTENSION,
    decompress_file,
    split_compression_suffix,
)
from backend.utils.logging_utils import redact_sensitive


logger = logging.getLogger(__name__)


MAX_FILE_UPLOAD_BYTES = 1024 * 1024 * 1024  # 1 GB per file

# Total size a single compressed upload may expand to (guards against zip bombs).
MAX_DECOMPRESSED_UPLOAD_BYTES = 10 * 1024 * 1024 * 1024  # 10 GB

# Data file extensions and MIME types come from the registered format handlers.
ALLOWED_FILE_EXTENSIONS = FILE_EXTENSIONS
ALLOWED_FILE_MIME_TYPES = FILE_MIME_TYPES

# SQLite database files are handled separately from the per-format file
# handlers: they are a connector of their own (a whole schema), not a file
# format of the file connector.
ALLOWED_SQLITE_EXTENSIONS = {'.sqlite', '.sqlite3', '.db'}

# Browsers report SQLite files inconsistently (often as a generic binary
# stream, sometimes with no type at all), so the file header checked after
# upload is what actually validates the content.
ALLOWED_SQLITE_MIME_TYPES = {
    "application/octet-stream",
    "application/x-sqlite3",
    "application/vnd.sqlite3",
    "application/x-sqlite",
    "application/db",
    "",
}


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

    async def _save_upload(
        self,
        uploaded_file: UploadFile,
        session_upload_dir: str,
        allowed_extensions: Collection[str],
        allowed_mime_types: Collection[str],
        max_members: Optional[int] = None,
    ) -> List[Tuple[str, str]]:
        """
        Check extension and MIME type, save an upload and decompress it if needed.

        Compressed uploads (e.g. ``data.csv.gz`` or a ``.zip`` archive) are
        decompressed into plain files and the compressed copy is discarded.
        Returns ``(temp_path, original_filename)`` pairs, where the filename is
        the inner (decompressed) name used for table naming. Content validation
        is left to the caller.
        """
        if not uploaded_file.filename:
            raise InvalidInputError("Missing filename for uploaded file.")

        inner_name, compression_ext = split_compression_suffix(uploaded_file.filename)
        file_ext = self._get_file_extension(inner_name)
        content_type = uploaded_file.content_type or ""

        # Zip member names are only known after the upload; stream formats
        # carry the inner type in the filename (``.csv.gz``) and fail early.
        if compression_ext != ZIP_EXTENSION and file_ext not in allowed_extensions:
            allowed = sorted(allowed_extensions)
            raise InvalidInputError(
                f"Invalid file type: {file_ext or uploaded_file.filename}. Allowed: {', '.join(allowed)} "
                f"(optionally compressed as {', '.join(sorted(COMPRESSION_EXTENSIONS))})"
            )

        mime_types = ALLOWED_COMPRESSED_MIME_TYPES if compression_ext else allowed_mime_types
        if content_type not in mime_types:
            raise InvalidInputError(
                detail=f"Unsupported content type: {uploaded_file.content_type}",
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            )

        fd, temp_file_path = tempfile.mkstemp(suffix=compression_ext or file_ext, dir=session_upload_dir)
        os.close(fd)

        try:
            await self._save_uploaded_file_with_limit(uploaded_file, temp_file_path, MAX_FILE_UPLOAD_BYTES)
            if not compression_ext:
                return [(temp_file_path, uploaded_file.filename)]
            saved = await run_in_threadpool(
                decompress_file,
                temp_file_path,
                compression_ext,
                uploaded_file.filename,
                allowed_extensions,
                session_upload_dir,
                MAX_DECOMPRESSED_UPLOAD_BYTES,
                max_members,
            )
        except Exception:
            self._remove_paths([temp_file_path])
            raise

        # The decompressed copies are all that is needed from here on.
        self._remove_paths([temp_file_path])
        logger.info(f"Decompressed upload {uploaded_file.filename} -> {[name for _, name in saved]}")
        return saved

    @staticmethod
    def _remove_paths(paths: List[str]) -> None:
        for path in paths:
            if path and os.path.exists(path):
                os.remove(path)

    async def _save_and_validate_uploaded_files(
        self,
        uploaded_file: UploadFile,
        session_upload_dir: str,
    ) -> List[Tuple[str, str]]:
        """
        Validate, save, and content-check a single uploaded data file.

        A compressed upload may expand to several files (zip archives), so this
        returns ``(temp_path, original_filename)`` pairs. Each file is checked
        by its format handler. Cleans up the temp files and re-raises on any
        validation or I/O error.
        """
        saved = await self._save_upload(
            uploaded_file, session_upload_dir, ALLOWED_FILE_EXTENSIONS, ALLOWED_FILE_MIME_TYPES
        )
        try:
            for temp_file_path, _ in saved:
                await run_in_threadpool(handler_for(temp_file_path).validate, temp_file_path)
        except Exception:
            self._remove_paths([path for path, _ in saved])
            raise

        for temp_file_path, name in saved:
            logger.info(f"Saved uploaded file: {name} -> {temp_file_path}")
        return saved

    async def gather_files(
        self,
        uploaded_files: List[UploadFile],
        session_id: str,
        staged_files: Optional[List[Dict[str, Any]]] = None,
    ) -> Tuple[List[Dict[str, Any]], List[str]]:
        """
        The data-file pipeline shared by connect, add-files and staging.

        Saves, decompresses and validates the uploads and appends them to the
        already-staged files. Returns FileConnector ``file_paths`` entries
        (``file_path``, ``original_filename`` and, for staged multi-part
        files, ``parts``) plus the temp paths the caller now owns. On error
        every file is removed, staged ones included, and the error re-raised.
        """
        file_infos: List[Dict[str, Any]] = list(staged_files or [])
        temp_paths: List[str] = [info["file_path"] for info in file_infos]
        session_upload_dir = self._get_session_upload_dir(session_id)
        try:
            for uploaded_file in uploaded_files:
                saved = await self._save_and_validate_uploaded_files(uploaded_file, session_upload_dir)
                for temp_file_path, original_filename in saved:
                    temp_paths.append(temp_file_path)
                    file_infos.append({
                        "file_path": temp_file_path,
                        "original_filename": original_filename,
                    })
        except Exception:
            self._remove_paths(temp_paths)
            raise
        finally:
            for uploaded_file in uploaded_files:
                await uploaded_file.close()
        return file_infos, temp_paths

    async def _save_and_validate_sqlite_upload(
        self,
        uploaded_file: UploadFile,
        session_upload_dir: str,
    ) -> str:
        """
        Validate, save, and content-check an uploaded SQLite database file.

        Kept separate from _save_and_validate_uploaded_files because SQLite is
        a connector of its own rather than a format of the file connector: a
        SQLite file is a whole schema. A compressed upload must therefore
        contain exactly one database file.

        Returns the temp file path on success. Cleans up the temp file and
        re-raises on any validation or I/O error.
        """
        saved = await self._save_upload(
            uploaded_file,
            session_upload_dir,
            ALLOWED_SQLITE_EXTENSIONS,
            ALLOWED_SQLITE_MIME_TYPES,
            max_members=1,
        )
        temp_file_path = saved[0][0]
        try:
            await run_in_threadpool(validate_sqlite_file, temp_file_path)
        except Exception:
            self._remove_paths([temp_file_path])
            raise

        logger.info(f"Saved uploaded SQLite database: {uploaded_file.filename} -> {temp_file_path}")
        return temp_file_path

    # ----- Staged uploads (part picker) -----
    def _discard_staged_uploads(self) -> int:
        """Delete this tab's unconsumed staged uploads; returns how many were removed."""
        staged = self.state_manager.take_staged_uploads()
        upload_root_dir = self._get_upload_root_dir()
        paths = [s.path for s in staged if self._is_path_within_directory(s.path, upload_root_dir)]
        self._remove_paths(paths)
        return len(staged)

    def _take_staged_files(self, staged_uploads_json: Optional[str]) -> List[Dict[str, Any]]:
        """
        Consume staged uploads referenced by a connect/add-files request.

        ``staged_uploads_json`` is a JSON list of ``{"upload_id", "parts"}``;
        ``parts`` (multi-part files only) may be omitted to load every
        selectable part. Everything is validated before any entry is consumed,
        so a rejected request leaves the staged files in place for a retry.
        Returns FileConnector ``file_paths`` entries; the caller owns the files from here.
        """
        if not staged_uploads_json:
            return []
        try:
            refs = json.loads(staged_uploads_json)
        except json.JSONDecodeError as e:
            raise InvalidInputError(
                f"Invalid staged_uploads_json: {e}",
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            )
        if not isinstance(refs, list) or not all(
            isinstance(ref, dict) and isinstance(ref.get("upload_id"), str) for ref in refs
        ):
            raise InvalidInputError(
                "staged_uploads_json must be a list of {upload_id, parts} objects.",
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            )

        staged_uploads = self.state_manager.staged_uploads
        file_infos: List[Dict[str, Any]] = []
        for ref in refs:
            staged = staged_uploads.get(ref["upload_id"])
            if staged is None:
                raise ResourceNotFoundError("Staged upload", ref["upload_id"])
            info: Dict[str, Any] = {
                "file_path": staged.path,
                "original_filename": staged.original_filename,
            }
            if staged.parts is not None:
                info["parts"] = resolve_part_selection(
                    [PartInfo(**part) for part in staged.parts],
                    ref.get("parts"),
                    staged.original_filename,
                    staged.part_label or "part",
                )
            file_infos.append(info)

        for ref in refs:
            staged_uploads.pop(ref["upload_id"], None)
        return file_infos

    async def stage_files(
        self,
        uploaded_files: List[UploadFile],
        session_id: str,
    ) -> Dict[str, Any]:
        """
        Save and validate data files without connecting, listing their parts.

        The client shows multi-part files (e.g. workbook sheets) in a picker and
        then connects (or adds files) by upload id, so each file is uploaded
        only once. Zip archives expand to one staged entry per member. Earlier
        unconsumed staged uploads of this tab are discarded first: only one
        picker is open at a time.
        """
        if not uploaded_files:
            raise InvalidInputError("At least one file is required.")

        async with self.state_manager.lock:
            self._discard_staged_uploads()
            file_infos, temp_paths = await self.gather_files(uploaded_files, session_id)

            entries: List[Dict[str, Any]] = []
            staged_uploads: Dict[str, StagedUpload] = {}
            try:
                for info in file_infos:
                    handler = handler_for(info["file_path"])
                    parts = await run_in_threadpool(handler.list_parts, info["file_path"])
                    part_dicts = [part.to_dict() for part in parts] if parts is not None else None
                    upload_id = uuid.uuid4().hex
                    staged_uploads[upload_id] = StagedUpload(
                        path=info["file_path"],
                        original_filename=info["original_filename"],
                        parts=part_dicts,
                        part_label=handler.FORMAT.part_label,
                    )
                    entries.append({
                        "upload_id": upload_id,
                        "filename": info["original_filename"],
                        "format": handler.FORMAT.key,
                        "part_label": handler.FORMAT.part_label,
                        "parts": part_dicts,
                    })
            except Exception:
                self._remove_paths(temp_paths)
                raise

            self.state_manager.staged_uploads.update(staged_uploads)
            logger.info(f"Staged {len(entries)} upload(s): {[e['filename'] for e in entries]}")
            return {"uploads": entries}

    async def discard_staged(self) -> Dict[str, Any]:
        """Delete staged uploads the user abandoned (e.g. a cancelled part picker)."""
        async with self.state_manager.lock:
            removed = self._discard_staged_uploads()
        return {"message": f"Discarded {removed} staged upload(s)."}

    @staticmethod
    def _forget_tables(connector: Optional[BaseConnector], table_names: List[str]) -> None:
        remove = getattr(connector, "remove_tables", None)
        if remove and table_names:
            remove(table_names)

    @staticmethod
    def _take_skipped_parts(connector: Optional[BaseConnector]) -> List[str]:
        take = getattr(connector, "take_skipped_parts", None)
        return take() if take else []

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
        staged_uploads_json: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Connect to file-based data sources (registered file formats, SQLite).
        
        Supports single or multiple file uploads. Each file becomes a separate
        table; a multi-part file (e.g. a workbook) one per selected part.
        
        Args:
            connection_details_json: JSON string with connection configuration
            uploaded_files: Uploaded data files
            session_id: Session identifier for file isolation
            staged_uploads_json: Optional JSON list of {upload_id, parts} referencing
                files saved earlier via stage_files (instead of, or besides, uploads)
            
        Returns:
            Dict with success message, file paths and skipped (empty) parts
        """
        async with self.state_manager.lock:
            await self._clear_previous_state(session_id)
            staged_files = self._take_staged_files(staged_uploads_json)

        # Consumed staged files are owned here until the builder tracks them.
        temp_file_paths: List[str] = [f["file_path"] for f in staged_files]
        connector: Optional[BaseConnector] = None
        try:
            try:
                connection_details = ConnectionDetails.model_validate_json(connection_details_json)
            except ValidationError as e:
                raise InvalidInputError(
                    f"Invalid connection details format: {e}",
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                )

            registry = get_connector_registry()
            spec = registry.get_spec(connection_details.type)
            if not spec.capabilities.supports_multipart_connect:
                raise InvalidInputError(
                    f"{connection_details.type} connections do not support multipart upload.",
                    status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                )

            connect_args: Dict[str, Any]
            effective_connection_details = connection_details.model_copy(deep=True)

            try:
                cfg = spec.config_model.model_validate(connection_details.model_dump())
            except Exception as e:
                raise InvalidInputError(
                    f"Invalid connection details for type '{connection_details.type}': {e}",
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                )

            if not spec.build_multipart_connect_args:
                raise InvalidInputError(
                    f"Multipart connect is not implemented for type '{connection_details.type}'.",
                    status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                )
            build_args: List[Any] = [self, cfg, uploaded_files, session_id]
            if staged_files:
                build_args.append(staged_files)
            connect_args, temp_file_paths = await spec.build_multipart_connect_args(*build_args)

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
                "skipped_parts": self._take_skipped_parts(connector),
            }

        except (InvalidInputError, FileProcessingError, DataSourceConnectionError) as e:
            # Clean up all temp files on error
            self._remove_paths(temp_file_paths)
            self.state_manager.clear_state()
            raise e
        except Exception:
            # Clean up all temp files on error
            self._remove_paths(temp_file_paths)
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
            effective_connection_details = connection_details.model_copy(deep=True)

            # Validate config via connector spec model
            try:
                cfg = spec.config_model.model_validate(connection_details.model_dump())
            except Exception as e:
                raise InvalidInputError(
                    f"Invalid connection details for type '{connection_details.type}': {e}",
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
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
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
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
                await run_in_threadpool(handler_for(temp_file_path).validate, temp_file_path)
                
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
        staged_uploads_json: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Add more files to an existing file connection.

        Each file becomes a new table in the active FileConnector (one per
        selected part for multi-part files). Files go through the same pipeline
        as connect, and are all validated before any table is added. The
        session's tracked temp paths are extended so disconnect cleans them up.

        Args:
            uploaded_files: Files to append to the current connection
            session_id: Session identifier for file isolation
            staged_uploads_json: Optional JSON list of {upload_id, parts} referencing
                files saved earlier via stage_files

        Returns:
            Dict with added_tables and skipped_parts lists
        """
        async with self.state_manager.lock:
            connector = self.state_manager.current_connector
            if not connector:
                raise InvalidInputError("Not connected to any data source.")

            if not uploaded_files and not staged_uploads_json:
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
            # Same options as the initial connect, so added files parse alike.
            options = build_parsing_options(details.model_dump())

            staged_files = self._take_staged_files(staged_uploads_json)
            file_infos, temp_file_paths = await self.gather_files(
                uploaded_files, session_id, staged_files
            )
            added_tables: List[str] = []
            try:
                for info in file_infos:
                    table_names = await run_in_threadpool(
                        connector.add_file,
                        info["file_path"],
                        info["original_filename"],
                        options,
                        info.get("parts"),
                    )
                    added_tables.extend(table_names)
                    logger.info(f"Added file to session: {info['original_filename']} -> tables {table_names}")

                self.state_manager.append_temp_paths(temp_file_paths)

                return {
                    "message": f"Added {len(added_tables)} table(s) to the current connection.",
                    "added_tables": added_tables,
                    "skipped_parts": self._take_skipped_parts(connector),
                }

            except (InvalidInputError, DataSourceConnectionError) as e:
                # Tables from earlier files in this batch would point at deleted
                # files, so drop them (and their derived files) too.
                self._forget_tables(connector, added_tables)
                self._remove_paths(temp_file_paths)
                raise e
            except Exception:
                self._forget_tables(connector, added_tables)
                self._remove_paths(temp_file_paths)
                logger.exception("Unexpected error during add_files")
                raise AppException("An unexpected server error occurred while adding files.")

    async def disconnect(self, session_id: str) -> Dict[str, Any]:
        files_to_delete = (self.state_manager.current_temp_paths or []) + [
            staged.path for staged in self.state_manager.take_staged_uploads()
        ]
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
