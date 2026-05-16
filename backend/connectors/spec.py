# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Connector plugin specification types.

This module defines the minimal metadata needed to treat connectors as plugins:
- connector id (type key)
- dialect + capabilities
- config model for validation
- factory for instantiation
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Awaitable, Callable, List, Optional, Tuple, Type

from pydantic import BaseModel

from backend.connectors.base import BaseConnector
from backend.dialects import SqlDialect


@dataclass(frozen=True)
class ConnectorCapabilities:
    """Feature flags for connectors (capability-driven behavior)."""

    supports_json_connect: bool = True
    supports_multipart_connect: bool = False
    supports_databases: bool = False
    supports_arrow: bool = False
    supports_incremental_file_add: bool = False


ConnectArgsBuilder = Callable[[BaseModel, Any, str], dict]
ConnectorFactory = Callable[[], BaseConnector]
MultipartConnectArgsBuilder = Callable[[Any, BaseModel, List[Any], str], Awaitable[Tuple[dict, List[str]]]]


@dataclass(frozen=True)
class ConnectorSpec:
    """Plugin descriptor for a connector type."""

    id: str
    display_name: str
    dialect: SqlDialect
    capabilities: ConnectorCapabilities
    config_model: Type[BaseModel]
    factory: ConnectorFactory
    build_connect_args: Optional[ConnectArgsBuilder] = None
    build_multipart_connect_args: Optional[MultipartConnectArgsBuilder] = None
