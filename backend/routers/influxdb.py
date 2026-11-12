# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Pre-connect discovery for InfluxDB: list databases and measurements.

These endpoints make the server contact a user-supplied URL, so they are
refused whenever the InfluxDB connector is disabled (e.g. in demo mode).
"""

import logging
from typing import Any, Dict

from fastapi import APIRouter, Body, status
from starlette.concurrency import run_in_threadpool

from backend.config import is_connector_allowed
from backend.connectors.influxdb_connector import table_names_for
from backend.connectors.influxql_client import (
    InfluxDbServerConfig,
    describe_measurements,
    list_databases,
)
from backend.exceptions import InvalidInputError

logger = logging.getLogger(__name__)

router = APIRouter()


def _server_config(body: Dict[str, Any]) -> InfluxDbServerConfig:
    if not is_connector_allowed("influxdb"):
        raise InvalidInputError("InfluxDB connections are disabled", status_code=status.HTTP_403_FORBIDDEN)
    try:
        return InfluxDbServerConfig.model_validate(body)
    except ValueError as e:
        raise InvalidInputError(
            f"Invalid InfluxDB connection details: {e}",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        )


@router.post("/databases")
async def list_influxdb_databases(body: Dict[str, Any] = Body(...)):
    """List databases (2.x: buckets with a DBRP mapping) on an InfluxDB server.

    Request body: influx_url, influx_auth, influx_username, influx_password,
    influx_token, influx_verify_ssl.
    """
    cfg = _server_config(body)

    def _discover():
        client = cfg.client()
        try:
            return client.ping(), list_databases(client)
        finally:
            client.close()

    version, databases = await run_in_threadpool(_discover)
    return {"server_version": version, "databases": databases}


@router.post("/measurements")
async def list_influxdb_measurements(body: Dict[str, Any] = Body(...)):
    """List the measurements of a database with their tag/field counts.

    Request body: the server fields of /databases plus influx_database.
    """
    cfg = _server_config(body)
    database = str(body.get("influx_database") or "").strip()
    if not database:
        raise InvalidInputError("influx_database is required", status_code=status.HTTP_422_UNPROCESSABLE_CONTENT)

    def _discover():
        client = cfg.client()
        try:
            return describe_measurements(client, database)
        finally:
            client.close()

    schemas = await run_in_threadpool(_discover)
    table_names = table_names_for([schema.name for schema in schemas])
    return {
        "measurements": [
            {
                "name": schema.name,
                "table_name": table_names[schema.name],
                "tag_count": len(schema.tags),
                "field_count": len(schema.fields),
            }
            for schema in schemas
        ]
    }
