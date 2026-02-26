"""Tests for null_column_builder – especially the rebuild_select_with_nulls logic."""

import pytest

from backend.models.query import Dimension
from backend.services.query_components.union.null_column_builder import (
    rebuild_select_with_nulls,
)


def _dim(field: str, flavour: str = "discrete") -> Dimension:
    return Dimension(field=field, flavour=flavour)


class TestRebuildSelectWithNulls_NullCastOverride:
    """
    When rebuild_select_with_nulls receives SQL from build_null_only_query
    (the missing-filter-field path), ALL columns appear as CAST(NULL ...) even
    for columns that physically exist in the table.  The function must replace
    those NULL-cast expressions with direct column references for physical
    columns so that ClickHouse resolves the real column type and avoids
    NO_COMMON_TYPE errors in UNION ALL.
    """

    def test_physical_columns_get_direct_reference_instead_of_null_cast(self):
        """Physical columns that exist in the table must NOT stay as CAST(NULL ...)."""
        # Simulate SQL produced by build_null_only_query for msg2RarPayload
        # where rnti and lcrId exist but preambleData.preambleType does not.
        null_sql = (
            "SELECT "
            "CAST(NULL AS Nullable(String)) AS `lcrId`, "
            "CAST(NULL AS Nullable(String)) AS `preambleData.preambleType`, "
            "CAST(NULL AS Nullable(String)) AS `rnti` "
            "FROM `mydb`.`msg2RarPayload` WHERE 1=0"
        )

        all_dimension_fields = [
            ("lcrId", _dim("lcrId")),
            ("preambleData.preambleType", _dim("preambleData.preambleType")),
            ("rnti", _dim("rnti")),
        ]

        # msg2RarPayload has lcrId and rnti, but NOT preambleData.preambleType
        table_columns = {"lcrId", "rnti", "someOtherCol"}

        result = rebuild_select_with_nulls(
            single_sql=null_sql,
            all_dimension_fields=all_dimension_fields,
            all_measure_fields=[],
            table_columns=table_columns,
            table_name="msg2RarPayload",
            db_type="clickhouse",
            quote_char="`",
        )

        # lcrId and rnti should be direct column references, not NULL casts
        assert "`lcrId` AS `lcrId`" in result
        assert "`rnti` AS `rnti`" in result
        # preambleData.preambleType should remain a NULL cast (not in table)
        assert "CAST(NULL" in result
        assert "`preambleData.preambleType`" in result

    def test_virtual_column_null_cast_is_preserved(self):
        """Virtual columns whose source fields are missing must keep their NULL cast."""
        null_sql = (
            "SELECT "
            "CAST(NULL AS Nullable(Float64)) AS `cslot`, "
            "CAST(NULL AS Nullable(String)) AS `rnti` "
            "FROM `mydb`.`msg2RarPayload` WHERE 1=0"
        )

        all_dimension_fields = [
            ("cslot", _dim("cslot", "continuous")),
            ("rnti", _dim("rnti")),
        ]

        # cslot is a virtual column needing hfnTickCount, sfn, slot
        vc_source_map = {"cslot": ["hfnTickCount", "sfn", "slot"]}

        def can_compute(field, src_map, cols):
            return all(s in cols for s in src_map.get(field, []))

        # Table has rnti but NOT the source fields for cslot
        table_columns = {"rnti", "otherCol"}

        result = rebuild_select_with_nulls(
            single_sql=null_sql,
            all_dimension_fields=all_dimension_fields,
            all_measure_fields=[],
            table_columns=table_columns,
            table_name="msg2RarPayload",
            db_type="clickhouse",
            quote_char="`",
            vc_source_map=vc_source_map,
            can_compute_virtual_column_fn=can_compute,
        )

        # cslot should stay as NULL (virtual column, source fields missing)
        assert "CAST(NULL" in result
        # rnti should be a direct column reference
        assert "`rnti` AS `rnti`" in result

    def test_normal_expressions_are_not_affected(self):
        """When the input SQL has real expressions (not NULLs), they are preserved."""
        normal_sql = (
            "SELECT "
            "`lcrId` AS `lcrId`, "
            "`rnti` AS `rnti` "
            "FROM `mydb`.`preambleData` WHERE 1=1"
        )

        all_dimension_fields = [
            ("lcrId", _dim("lcrId")),
            ("rnti", _dim("rnti")),
        ]

        table_columns = {"lcrId", "rnti"}

        result = rebuild_select_with_nulls(
            single_sql=normal_sql,
            all_dimension_fields=all_dimension_fields,
            all_measure_fields=[],
            table_columns=table_columns,
            table_name="preambleData",
            db_type="clickhouse",
            quote_char="`",
        )

        assert "`lcrId` AS `lcrId`" in result
        assert "`rnti` AS `rnti`" in result
        assert "CAST(NULL" not in result
