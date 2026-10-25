# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""App identity, per-OS locations and version lookup."""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

APP_NAME = "Data Slicer"
PRODUCT_NAME = "Data Slicer"
APP_ID = "io.datafeta.dataslicer"
# Kept from the former Electron shell so existing uploads/snapshots/logs carry over.
DATA_FOLDER = "datafeta-desktop"


def is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def repo_root() -> Path:
    # desktop/datafeta_desktop/paths.py -> repo root
    return Path(__file__).resolve().parents[2]


def bundle_dir() -> Path:
    """Directory holding bundled data files (PyInstaller _MEIPASS, or the repo in dev)."""
    if is_frozen():
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            return Path(meipass)
        return Path(sys.executable).resolve().parent
    return repo_root()


def user_data_dir() -> Path:
    """Per-user application data folder."""
    if sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    elif sys.platform == "win32":
        base = Path(os.environ.get("APPDATA") or Path.home() / "AppData" / "Roaming")
    else:
        base = Path(os.environ.get("XDG_CONFIG_HOME") or Path.home() / ".config")
    return base / DATA_FOLDER


def data_dir() -> Path:
    override = os.environ.get("DATAFETA_DATA_DIR")
    return Path(override) if override else user_data_dir() / "data"


def web_profile_dir() -> Path:
    """QtWebEngine storage (localStorage, cache)."""
    return user_data_dir() / "qt-webengine"


def updates_dir() -> Path:
    return user_data_dir() / "qt-updates"


def icon_path() -> Path | None:
    icon = bundle_dir() / "frontend" / "public" / "logo512.png"
    return icon if icon.is_file() else None


def app_version() -> str:
    """Desktop app version (desktop/package.json)."""
    try:
        pkg = json.loads((bundle_dir() / "desktop" / "package.json").read_text(encoding="utf-8"))
        return str(pkg.get("version") or "0.0.0")
    except (OSError, ValueError):
        return "0.0.0"
