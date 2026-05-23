# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Runtime application configuration helpers.

The all-in-one Docker image is shared between normal and hosted-demo deployments,
so these helpers intentionally read runtime environment variables instead of
frontend build-time flags.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional


DEFAULT_SNAPSHOT_DIR = "/app/data/snapshots"
TRUTHY = {"1", "true", "yes", "on"}
FALSY = {"0", "false", "no", "off"}


def _normalise(value: Optional[str]) -> str:
    return (value or "").strip().lower()


def _env_bool(name: str, default: bool) -> bool:
    raw = _normalise(os.environ.get(name))
    if not raw:
        return default
    if raw in TRUTHY:
        return True
    if raw in FALSY:
        return False
    return default


def app_mode() -> str:
    return _normalise(os.environ.get("APP_MODE")) or "standard"


def is_demo_mode() -> bool:
    return app_mode() == "demo"


def snapshot_mode() -> str:
    raw = _normalise(os.environ.get("SNAPSHOT_MODE"))
    if raw in {"writable", "readonly", "disabled"}:
        return raw
    return "readonly" if is_demo_mode() else "writable"


def snapshots_enabled() -> bool:
    return snapshot_mode() != "disabled"


def snapshots_writable() -> bool:
    return snapshot_mode() == "writable"


def snapshot_storage_dir() -> str:
    if snapshot_mode() == "readonly":
        return (
            os.environ.get("CURATED_SNAPSHOT_DIR")
            or os.environ.get("SNAPSHOT_STORAGE_DIR")
            or DEFAULT_SNAPSHOT_DIR
        )
    return os.environ.get("SNAPSHOT_STORAGE_DIR") or DEFAULT_SNAPSHOT_DIR


def debug_api_enabled() -> bool:
    return _env_bool("DEBUG_API_ENABLED", default=not is_demo_mode())


def debug_ui_enabled() -> bool:
    return _env_bool("DEBUG_UI_ENABLED", default=not is_demo_mode())


def connector_allowlist() -> Optional[List[str]]:
    raw = os.environ.get("CONNECTOR_ALLOWLIST")
    if raw is None or not raw.strip():
        return ["csv"] if is_demo_mode() else None

    values = [part.strip() for part in raw.split(",") if part.strip()]
    if is_demo_mode():
        safe_values = [value for value in values if value == "csv"]
        return safe_values or ["csv"]
    return values or None


def is_connector_allowed(connector_id: str) -> bool:
    allowed = connector_allowlist()
    if allowed is None:
        return True
    return connector_id in allowed


def demo_datasets_enabled() -> bool:
    return _env_bool("DEMO_DATASETS_ENABLED", default=is_demo_mode())


def demo_dataset_catalog() -> List[Dict[str, Any]]:
    raw = os.environ.get("DEMO_DATASETS_JSON")
    if not raw:
        return []

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return []

    if not isinstance(parsed, list):
        return []

    safe_items: List[Dict[str, Any]] = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        dataset_id = str(item.get("id", "")).strip()
        database = str(item.get("database", "")).strip()
        table = str(item.get("table", "")).strip()
        if not dataset_id or not database or not table:
            continue
        safe_items.append(
            {
                "id": dataset_id,
                "label": str(item.get("label") or dataset_id),
                "description": str(item.get("description") or ""),
                "database": database,
                "table": table,
                "snapshotId": str(item.get("snapshotId") or ""),
            }
        )
    return safe_items


def demo_clickhouse_connection() -> Optional[Dict[str, Any]]:
    host = os.environ.get("DEMO_CLICKHOUSE_HOST")
    if not host:
        return None
    return {
        "host": host,
        "port": int(os.environ.get("DEMO_CLICKHOUSE_PORT") or 8123),
        "user": os.environ.get("DEMO_CLICKHOUSE_USER") or "default",
        "password": os.environ.get("DEMO_CLICKHOUSE_PASSWORD") or "",
    }


def public_app_config() -> Dict[str, Any]:
    allowed = connector_allowlist()
    return {
        "appMode": app_mode(),
        "isDemoMode": is_demo_mode(),
        "snapshots": {
            "enabled": snapshots_enabled(),
            "writable": snapshots_writable(),
            "mode": snapshot_mode(),
        },
        "debugUiEnabled": debug_ui_enabled(),
        "connectors": {
            "restricted": allowed is not None,
            "allowed": allowed or [],
        },
        "demoDatasets": {
            "enabled": demo_datasets_enabled(),
            "available": bool(demo_dataset_catalog()),
        },
    }


def ensure_parent_dir(path: str) -> None:
    Path(path).mkdir(parents=True, exist_ok=True)