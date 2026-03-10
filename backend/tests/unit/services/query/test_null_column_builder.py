"""Tests for null_column_builder – especially the rebuild_select_with_nulls logic."""

import pytest

from backend.models.query import Dimension
from backend.services.query_components.union.null_column_builder import (
    build_null_column,
    build_null_only_query,
    extract_base_clickhouse_type,
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

    def test_missing_column_uses_type_from_column_types(self):
        """Missing columns should use the actual DB type from column_types rather than defaulting to String."""
        null_sql = (
            "SELECT "
            "CAST(NULL AS Nullable(String)) AS `rrmPhrScaled` "
            "FROM `mydb`.`dlFdSchedData` WHERE 1=0"
        )

        all_dimension_fields = [
            ("rrmPhrScaled", _dim("rrmPhrScaled", "continuous")),
        ]

        # dlFdSchedData does NOT have the column
        table_columns = {"otherCol"}

        result = rebuild_select_with_nulls(
            single_sql=null_sql,
            all_dimension_fields=all_dimension_fields,
            all_measure_fields=[],
            table_columns=table_columns,
            table_name="dlFdSchedData",
            db_type="clickhouse",
            quote_char="`",
            column_types={"rrmPhrScaled": "Float64"},
        )

        assert "Nullable(Float64)" in result
        assert "Nullable(String)" not in result


class TestExtractBaseClickhouseType:
    def test_plain_type(self):
        assert extract_base_clickhouse_type("Float64") == "Float64"

    def test_nullable_wrapper(self):
        assert extract_base_clickhouse_type("Nullable(Float64)") == "Float64"

    def test_low_cardinality_wrapper(self):
        assert extract_base_clickhouse_type("LowCardinality(String)") == "String"

    def test_nested_wrappers(self):
        assert extract_base_clickhouse_type("LowCardinality(Nullable(String))") == "String"

    def test_int32(self):
        assert extract_base_clickhouse_type("Nullable(Int32)") == "Int32"


class TestBuildNullColumnWithColumnType:
    """build_null_column should prefer column_type over String default for dimensions."""

    def test_uses_column_type_for_numeric_dimension(self):
        result = build_null_column("rrmPhrScaled", False, "clickhouse", "`", column_type="Float64")
        assert "Nullable(Float64)" in result
        assert "Nullable(String)" not in result

    def test_uses_column_type_nullable_stripped(self):
        result = build_null_column("myCol", False, "clickhouse", "`", column_type="Nullable(Int32)")
        assert "Nullable(Int32)" in result
        assert "Nullable(String)" not in result

    def test_output_type_takes_precedence_over_column_type(self):
        result = build_null_column("vc", False, "clickhouse", "`", output_type="DOUBLE", column_type="String")
        assert "Nullable(Float64)" in result

    def test_defaults_to_string_without_column_type(self):
        result = build_null_column("myDim", False, "clickhouse", "`")
        assert "Nullable(String)" in result

    def test_measure_ignores_column_type(self):
        result = build_null_column("myMeasure", True, "clickhouse", "`", column_type="String")
        assert "Nullable(Float64)" in result


class TestBuildNullOnlyQueryWithColumnTypes:
    """build_null_only_query should pass column_types through to build_null_column."""

    def test_numeric_dimension_gets_correct_type(self):
        result = build_null_only_query(
            database="mydb",
            table_name="dlFdSchedData",
            missing_dimension_keys=["rrmPhrScaled"],
            missing_measure_keys=[],
            db_type="clickhouse",
            quote_char="`",
            column_types={"rrmPhrScaled": "Float64"},
        )
        assert "Nullable(Float64)" in result
        assert "Nullable(String)" not in result
