# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Unit tests for the query router's typed request contract.

Covers the typed request models (RowCountRequest, DistinctCountRequest,
QueryDescription bodies), wire-format compatibility, and the
QueryExecutionService.count_rows service method.
"""

import pytest
from unittest.mock import Mock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.dependencies import get_active_connector, get_connection_details
from backend.exceptions import QueryExecutionError
from backend.models.data_source import ConnectionDetails
from backend.models.query import FilterConfigEntry, QueryResult, RowCountRequest
from backend.routers import query as query_router
from backend.services.filter_conversion_service import FilterConversionService
from backend.services.query_execution_service import QueryExecutionService


def make_client(connector=None, conn_details=None) -> TestClient:
    """Build a minimal app with the query router and overridden dependencies."""
    app = FastAPI()
    app.include_router(query_router.router)
    connector = connector if connector is not None else Mock()
    conn_details = conn_details or ConnectionDetails(type='csv')
    app.dependency_overrides[get_active_connector] = lambda: connector
    app.dependency_overrides[get_connection_details] = lambda: conn_details
    return TestClient(app)


class TestRowCountEndpoint:
    """Tests for POST /row-count request contract."""

    def test_missing_table_returns_422(self):
        client = make_client()
        response = client.post("/row-count", json={"database": "db"})
        assert response.status_code == 422

    def test_happy_path(self):
        client = make_client()
        with patch.object(QueryExecutionService, 'count_rows', return_value=42) as mock_count:
            response = client.post("/row-count", json={"table": "sales"})
        assert response.status_code == 200
        assert response.json() == {"count": 42}
        request_arg = mock_count.call_args.args[0]
        assert isinstance(request_arg, RowCountRequest)
        assert request_arg.table == "sales"

    def test_wire_format_with_filters_and_virtuals(self):
        """The existing camelCase wire format must parse unchanged."""
        client = make_client()
        payload = {
            "table": "sales",
            "database": "analytics",
            "filters": {
                "region_key": {
                    "columnName": "region",
                    "type": "discrete",
                    "selectedValues": ["EU", "US"],
                    "totalAvailableCount": 5,
                },
            },
            "virtualColumns": [],
        }
        with patch.object(QueryExecutionService, 'count_rows', return_value=7):
            response = client.post("/row-count", json=payload)
        assert response.status_code == 200
        assert response.json() == {"count": 7}

    def test_unknown_keys_are_ignored(self):
        """Extra body keys must not break requests (previous Dict body was permissive)."""
        client = make_client()
        with patch.object(QueryExecutionService, 'count_rows', return_value=1):
            response = client.post(
                "/row-count", json={"table": "t", "someFutureKey": True}
            )
        assert response.status_code == 200


class TestDistinctCountEndpoint:
    """Tests for POST /distinct-count request contract."""

    def test_missing_field_returns_422(self):
        client = make_client()
        response = client.post("/distinct-count", json={"table": "t"})
        assert response.status_code == 422

    def test_missing_table_returns_422(self):
        client = make_client()
        response = client.post("/distinct-count", json={"field": "f"})
        assert response.status_code == 422

    def test_happy_path_passes_camelcase_fields_to_service(self):
        client = make_client()
        payload = {
            "field": "category",
            "table": "products",
            "database": "shop",
            "regexPattern": "%toy%",
            "dateTimePart": "year",
            "dateTimeMode": "distinct",
            "unionTables": "t1,t2",
            "sourceTable": "products",
        }
        with patch.object(query_router, 'CardinalityService') as mock_service_cls:
            mock_service_cls.return_value.get_distinct_count.return_value = 9
            response = client.post("/distinct-count", json=payload)

        assert response.status_code == 200
        assert response.json() == {"count": 9}
        kwargs = mock_service_cls.return_value.get_distinct_count.call_args.kwargs
        assert kwargs['field'] == 'category'
        assert kwargs['table'] == 'products'
        assert kwargs['database'] == 'shop'
        assert kwargs['regex_pattern'] == '%toy%'
        assert kwargs['datetime_part'] == 'year'
        assert kwargs['datetime_mode'] == 'distinct'
        assert kwargs['union_tables'] == 't1,t2'
        assert kwargs['source_table'] == 'products'
        assert kwargs['virtual_columns'] is None
        assert kwargs['virtual_table'] is None


class TestQueryEndpointValidation:
    """Tests for POST /query and /query-arrow typed bodies."""

    def test_missing_target_table_returns_422(self):
        client = make_client()
        response = client.post("/query", json={"measures": []})
        assert response.status_code == 422

    def test_invalid_aggregation_returns_422(self):
        client = make_client()
        response = client.post("/query", json={
            "target_table": "t",
            "measures": [{"field": "x", "aggregation": "median", "alias": "m"}],
        })
        assert response.status_code == 422

    def test_valid_minimal_body_accepted(self):
        client = make_client()
        result = QueryResult(columns=[], rows=[], row_count=0)
        with patch.object(QueryExecutionService, 'execute_json', return_value=result):
            response = client.post("/query", json={"target_table": "t"})
        assert response.status_code == 200
        assert response.json()["row_count"] == 0

    def test_query_arrow_missing_target_table_returns_422(self):
        client = make_client()
        response = client.post("/query-arrow", json={})
        assert response.status_code == 422


class TestCountRowsService:
    """Tests for QueryExecutionService.count_rows."""

    def _make_service(self, rows, fetch_side_effect=None):
        connector = Mock()
        if fetch_side_effect is not None:
            connector.fetch_data.side_effect = fetch_side_effect
        else:
            connector.fetch_data.return_value = ([{'name': 'cnt', 'type': 'INT'}], rows)
        service = QueryExecutionService(connector, ConnectionDetails(type='csv'))
        service.query_service = Mock()
        service.query_service.translate_to_sql.return_value = ("SELECT count(*)", {})
        return service

    def test_count_from_cnt_alias(self):
        service = self._make_service(rows=[{'cnt': 42}])
        assert service.count_rows(RowCountRequest(table='t')) == 42

    def test_count_string_coercion(self):
        service = self._make_service(rows=[{'cnt': '150'}])
        assert service.count_rows(RowCountRequest(table='t')) == 150

    def test_count_float_coercion(self):
        service = self._make_service(rows=[{'cnt': 99.7}])
        assert service.count_rows(RowCountRequest(table='t')) == 99

    def test_empty_result_returns_zero(self):
        service = self._make_service(rows=[])
        assert service.count_rows(RowCountRequest(table='t')) == 0

    def test_execution_error_does_not_leak_internal_detail(self):
        service = self._make_service(
            rows=None, fetch_side_effect=RuntimeError("internal secret detail")
        )
        with pytest.raises(QueryExecutionError) as exc_info:
            service.count_rows(RowCountRequest(table='t'))
        assert "internal secret detail" not in str(exc_info.value.detail)
        assert "Failed to count rows" in str(exc_info.value.detail)


class TestFilterConfigEntryEquivalence:
    """FilterConfigEntry.model_dump() must convert identically to the raw dicts."""

    def _convert_both(self, raw_cfg: dict):
        raw_result = FilterConversionService.convert_filters({"key": raw_cfg})
        typed = FilterConfigEntry.model_validate(raw_cfg)
        typed_result = FilterConversionService.convert_filters({"key": typed.model_dump()})
        return raw_result, typed_result

    def test_discrete_filter(self):
        raw, typed = self._convert_both({
            "columnName": "region",
            "type": "discrete",
            "selectedValues": ["EU"],
            "totalAvailableCount": 3,
        })
        assert raw == typed
        assert len(typed) == 1
        assert typed[0].operator == 'in'

    def test_discrete_exclusion_filter(self):
        raw, typed = self._convert_both({
            "columnName": "region",
            "type": "discrete",
            "selectedValues": [],
            "excludedValues": ["US"],
            "totalAvailableCount": 3,
        })
        assert raw == typed
        assert len(typed) == 1
        assert typed[0].operator == 'not in'

    def test_continuous_filter(self):
        raw, typed = self._convert_both({
            "columnName": "price",
            "type": "continuous",
            "minValue": 10,
            "maxValue": 100,
        })
        assert raw == typed
        assert [f.operator for f in typed] == ['>=', '<=']

    def test_measure_filter_uses_group_scope(self):
        raw, typed = self._convert_both({
            "columnName": "SUM(revenue)",
            "type": "measure",
            "minValue": 1000,
        })
        assert raw == typed
        assert typed[0].scope == 'group'

    def test_datetime_filter(self):
        raw, typed = self._convert_both({
            "columnName": "created_at",
            "type": "datetime",
            "startDate": "2024-01-01",
            "endDate": "2024-12-31",
        })
        assert raw == typed
        assert len(typed) == 2

    def test_unknown_filter_type_ignored(self):
        raw, typed = self._convert_both({
            "columnName": "x",
            "type": "hexbin",
        })
        assert raw == typed == []
