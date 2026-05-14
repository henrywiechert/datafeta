# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Tests for FilterConversionService discrete filter handling."""

from backend.services.filter_conversion_service import FilterConversionService


def test_discrete_omits_when_all_selected_with_total_count():
    filters = {
        "f1": {
            "columnName": "region",
            "type": "discrete",
            "selectedValues": ["a", "b", "c"],
            "totalAvailableCount": 3,
        }
    }
    out = FilterConversionService.convert_filters(filters)
    assert out == []


def test_discrete_in_when_partial_selection():
    filters = {
        "f1": {
            "columnName": "region",
            "type": "discrete",
            "selectedValues": ["a", "b"],
            "totalAvailableCount": 3,
        }
    }
    out = FilterConversionService.convert_filters(filters)
    assert len(out) == 1
    assert out[0].operator == "in"
    assert out[0].value == ["a", "b"]


def test_discrete_omits_empty_selection_without_exclusion():
    filters = {
        "f1": {
            "columnName": "region",
            "type": "discrete",
            "selectedValues": [],
        }
    }
    assert FilterConversionService.convert_filters(filters) == []


def test_discrete_not_in_pure_exclusion_empty_selected():
    filters = {
        "f1": {
            "columnName": "region",
            "type": "discrete",
            "selectedValues": [],
            "excludedValues": ["x"],
        }
    }
    out = FilterConversionService.convert_filters(filters)
    assert len(out) == 1
    assert out[0].operator == "not in"
    assert out[0].value == ["x"]


def test_discrete_not_in_when_exclusion_shorter_than_in():
    filters = {
        "f1": {
            "columnName": "region",
            "type": "discrete",
            "selectedValues": ["a", "b", "c", "d"],
            "excludedValues": ["z"],
            "totalAvailableCount": 5,
        }
    }
    out = FilterConversionService.convert_filters(filters)
    assert len(out) == 1
    assert out[0].operator == "not in"
    assert out[0].value == ["z"]


def test_discrete_in_when_all_selected_but_no_total_count_still_emits_in():
    """Without totalAvailableCount, backend cannot prove 'select all' — keep prior behavior."""
    filters = {
        "f1": {
            "columnName": "region",
            "type": "discrete",
            "selectedValues": ["a", "b", "c"],
        }
    }
    out = FilterConversionService.convert_filters(filters)
    assert len(out) == 1
    assert out[0].operator == "in"
