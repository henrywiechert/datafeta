# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Decompression of uploaded files (gzip, bzip2, xz, zstd, zip).

Uploads are decompressed to plain files once, right after they are saved, so
every downstream reader (DuckDB CSV/JSON/Parquet readers, the SQLite
extension, the content sniffers) keeps working on ordinary files.
"""
import bz2
import gzip
import lzma
import os
import tempfile
import zipfile
from typing import BinaryIO, Callable, Collection, Dict, List, Optional, Tuple

from fastapi import status

from backend.exceptions import InvalidInputError

try:  # Python 3.14+
    from compression import zstd as _zstd
except ImportError:  # pragma: no cover - depends on interpreter version
    try:
        from backports import zstd as _zstd
    except ImportError:
        _zstd = None

_CHUNK_BYTES = 1024 * 1024

# Single-stream formats: extension -> opener returning a readable binary stream.
_STREAM_OPENERS: Dict[str, Callable[[str], BinaryIO]] = {
    ".gz": lambda path: gzip.open(path, "rb"),
    ".gzip": lambda path: gzip.open(path, "rb"),
    ".bz2": lambda path: bz2.open(path, "rb"),
    ".xz": lambda path: lzma.open(path, "rb"),
}
if _zstd is not None:
    _STREAM_OPENERS[".zst"] = lambda path: _zstd.open(path, "rb")

ZIP_EXTENSION = ".zip"

COMPRESSION_EXTENSIONS = frozenset(_STREAM_OPENERS) | {ZIP_EXTENSION}

# Browsers report compressed files inconsistently (and often as a generic
# binary stream or with no type at all). The decompressed content is validated
# by the regular per-format checks afterwards, so the MIME type is only a
# coarse first filter here.
ALLOWED_COMPRESSED_MIME_TYPES = {
    "application/gzip",
    "application/x-gzip",
    "application/x-bzip",
    "application/x-bzip2",
    "application/x-xz",
    "application/zstd",
    "application/x-zstd",
    "application/zip",
    "application/x-zip",
    "application/x-zip-compressed",
    "multipart/x-zip",
    "application/octet-stream",
    "",
}

# Errors raised by the codecs for corrupt, truncated or unsupported input.
_DECOMPRESSION_ERRORS: Tuple[type, ...] = (
    OSError,
    EOFError,
    lzma.LZMAError,
    zipfile.BadZipFile,
    NotImplementedError,  # unsupported zip compression method
    RuntimeError,  # encrypted zip member
)
if _zstd is not None:
    _DECOMPRESSION_ERRORS += (_zstd.ZstdError,)


def split_compression_suffix(filename: str) -> Tuple[str, Optional[str]]:
    """Split a trailing compression extension off a filename.

    ``"sales.csv.gz"`` -> ``("sales.csv", ".gz")``; ``"sales.csv"`` ->
    ``("sales.csv", None)``. For zip archives the inner name is meaningless
    (member names are used instead) but is returned the same way.
    """
    stem, ext = os.path.splitext(filename)
    ext = ext.lower()
    if ext in COMPRESSION_EXTENSIONS:
        return stem, ext
    return filename, None


def _file_ext(filename: str) -> str:
    return os.path.splitext(filename)[1].lower()


def _copy_limited(src: BinaryIO, dest_path: str, budget: List[int]) -> None:
    """Copy src to dest_path, decrementing budget[0]; raise once it goes negative."""
    with open(dest_path, "wb") as out:
        while True:
            chunk = src.read(_CHUNK_BYTES)
            if not chunk:
                break
            budget[0] -= len(chunk)
            if budget[0] < 0:
                raise InvalidInputError(
                    detail="Decompressed upload exceeds the maximum allowed size.",
                    status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                )
            out.write(chunk)


def _new_temp_path(dest_dir: str, suffix: str) -> str:
    fd, path = tempfile.mkstemp(suffix=suffix, dir=dest_dir)
    os.close(fd)
    return path


def _is_ignored_zip_member(info: zipfile.ZipInfo) -> bool:
    """Directories and OS metadata (macOS resource forks, dotfiles) are skipped."""
    if info.is_dir():
        return True
    parts = info.filename.replace("\\", "/").split("/")
    return parts[0] == "__MACOSX" or os.path.basename(info.filename).startswith(".")


def decompress_file(
    src_path: str,
    compression_ext: str,
    original_filename: str,
    allowed_extensions: Collection[str],
    dest_dir: str,
    max_decompressed_bytes: int,
    max_members: Optional[int] = None,
) -> List[Tuple[str, str]]:
    """Decompress src_path into new temp files in dest_dir.

    Returns ``(temp_path, inner_filename)`` pairs - one for stream formats, one
    per matching member for zip archives. Each temp path carries the inner
    file's extension so format detection keeps working. ``max_decompressed_bytes``
    caps the total output size (zip-bomb guard); ``max_members`` caps how many
    data files a zip may contain.

    On any error, files created here are removed; src_path is left in place.
    """
    allowed = {ext.lower() for ext in allowed_extensions}
    allowed_display = ", ".join(sorted(allowed))
    budget = [max_decompressed_bytes]
    outputs: List[Tuple[str, str]] = []

    try:
        if compression_ext == ZIP_EXTENSION:
            with zipfile.ZipFile(src_path) as archive:
                members = [
                    info for info in archive.infolist()
                    if not _is_ignored_zip_member(info)
                    and _file_ext(info.filename) in allowed
                ]
                if not members:
                    raise InvalidInputError(
                        f"Zip archive '{original_filename}' contains no supported files "
                        f"({allowed_display})."
                    )
                if max_members is not None and len(members) > max_members:
                    raise InvalidInputError(
                        f"Zip archive '{original_filename}' must contain at most "
                        f"{max_members} supported file(s), found {len(members)}."
                    )
                for info in members:
                    inner_name = os.path.basename(info.filename.replace("\\", "/"))
                    dest_path = _new_temp_path(dest_dir, _file_ext(inner_name))
                    outputs.append((dest_path, inner_name))
                    with archive.open(info) as src:
                        _copy_limited(src, dest_path, budget)
        else:
            opener = _STREAM_OPENERS.get(compression_ext)
            if opener is None:
                raise InvalidInputError(f"Unsupported compression format: {compression_ext}")
            inner_name, _ = split_compression_suffix(original_filename)
            inner_ext = _file_ext(inner_name)
            if inner_ext not in allowed:
                raise InvalidInputError(
                    f"Cannot determine the file type inside '{original_filename}'. "
                    f"Name compressed files like 'data.csv{compression_ext}' "
                    f"(allowed inner types: {allowed_display})."
                )
            dest_path = _new_temp_path(dest_dir, inner_ext)
            outputs.append((dest_path, inner_name))
            with opener(src_path) as src:
                _copy_limited(src, dest_path, budget)
    except Exception as e:
        for path, _ in outputs:
            if os.path.exists(path):
                os.remove(path)
        if isinstance(e, _DECOMPRESSION_ERRORS) and not isinstance(e, InvalidInputError):
            raise InvalidInputError(
                f"Could not decompress '{original_filename}': the file is corrupt "
                f"or not a valid {compression_ext.lstrip('.')} archive ({e})."
            ) from e
        raise

    return outputs
