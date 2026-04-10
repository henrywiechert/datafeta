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
from backend.dependencies import ConnectionStateManager


@dataclass(frozen=True)
class ConnectorCapabilities:
    """Feature flags for connectors (capability-driven behavior)."""

    supports_json_connect: bool = True
    supports_multipart_connect: bool = False
    supports_databases: bool = False
    supports_arrow: bool = False


ConnectArgsBuilder = Callable[[BaseModel, ConnectionStateManager, Any, str], dict]
ConnectorFactory = Callable[[ConnectionStateManager], BaseConnector]
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
