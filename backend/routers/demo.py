# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Hosted-demo dataset catalog and connection helpers."""

from fastapi import APIRouter, Depends, Request, status

from backend.config import (
    demo_clickhouse_connection,
    demo_dataset_catalog,
    demo_datasets_enabled,
    is_connector_allowed,
)
from backend.dependencies import get_session_id, get_state_manager
from backend.exceptions import InvalidInputError
from backend.models.data_source import ConnectionDetails
from backend.services.connection_service import ConnectionService
from backend.session_state import ConnectionStateManager


router = APIRouter()


@router.get("/demo/datasets")
def list_demo_datasets() -> dict:
    if not demo_datasets_enabled():
        return {"datasets": []}
    return {"datasets": demo_dataset_catalog()}


@router.post("/demo/datasets/{dataset_id}/connect")
async def connect_demo_dataset(
    dataset_id: str,
    state_manager: ConnectionStateManager = Depends(get_state_manager),
    session_id: str = Depends(get_session_id),
    request: Request = None,
) -> dict:
    if not demo_datasets_enabled():
        raise InvalidInputError("Demo datasets are disabled", status_code=status.HTTP_403_FORBIDDEN)
    if not is_connector_allowed("clickhouse"):
        raise InvalidInputError("Demo ClickHouse connections are disabled", status_code=status.HTTP_403_FORBIDDEN)

    dataset = next((item for item in demo_dataset_catalog() if item["id"] == dataset_id), None)
    if not dataset:
        raise InvalidInputError("Unknown demo dataset", status_code=status.HTTP_404_NOT_FOUND)

    connection = demo_clickhouse_connection()
    if not connection:
        raise InvalidInputError("Demo ClickHouse connection is not configured", status_code=status.HTTP_503_SERVICE_UNAVAILABLE)

    details = ConnectionDetails(
        type="clickhouse",
        host=connection["host"],
        port=connection["port"],
        user=connection["user"],
        password=connection["password"],
        database=dataset["database"],
    )
    service = ConnectionService(state_manager=state_manager, request=request)
    result = await service.connect_json(details, session_id)
    return {
        **result,
        "dataset": {
            "id": dataset["id"],
            "database": dataset["database"],
            "table": dataset["table"],
        },
    }