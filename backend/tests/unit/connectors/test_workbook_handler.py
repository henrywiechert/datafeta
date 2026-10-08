# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Tests for the workbook handler: sheet listing, validation and sheet -> Parquet conversion."""

import datetime as dt
import os

import duckdb
import openpyxl
import pytest

from backend.connectors.file_handlers import PartInfo, resolve_part_selection
from backend.connectors.file_handlers.workbook_handler import (
    convert_sheet_to_parquet,
    list_sheets,
    validate_workbook,
)
from backend.exceptions import InvalidInputError

FIXTURES = os.path.join(os.path.dirname(__file__), "..", "..", "fixtures", "excel")


def _workbook(tmp_path, sheets, name="book.xlsx"):
    """Write an .xlsx with {sheet_name: [rows]}; the first sheet replaces the default one."""
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    for sheet_name, rows in sheets.items():
        ws = wb.create_sheet(sheet_name)
        for row in rows:
            ws.append(row)
    path = tmp_path / name
    wb.save(path)
    return str(path)


def _convert(tmp_path, path, sheet):
    out = str(tmp_path / f"{sheet}.parquet")
    assert convert_sheet_to_parquet(path, sheet, out)
    con = duckdb.connect()
    schema = {row[0]: row[1] for row in con.execute(f"DESCRIBE SELECT * FROM '{out}'").fetchall()}
    rows = con.execute(f"SELECT * FROM '{out}'").fetchall()
    return schema, rows


class TestValidateWorkbook:
    def test_valid_xlsx(self, tmp_path):
        validate_workbook(_workbook(tmp_path, {"S": [["a"], [1]]}))

    def test_rejects_wrong_signature(self, tmp_path):
        path = tmp_path / "fake.xlsx"
        path.write_text("id,name\n1,ada\n")
        with pytest.raises(InvalidInputError, match="valid Excel"):
            validate_workbook(str(path))

    def test_rejects_zip_that_is_not_a_workbook(self, tmp_path):
        import zipfile
        path = tmp_path / "fake.xlsx"
        with zipfile.ZipFile(path, "w") as archive:
            archive.writestr("hello.txt", "not a workbook")
        with pytest.raises(InvalidInputError):
            validate_workbook(str(path))

    @pytest.mark.parametrize("name", ["legacy.xls", "sample.ods"])
    def test_fixtures_validate(self, name):
        validate_workbook(os.path.join(FIXTURES, name))


class TestListSheets:
    def test_hidden_and_chart_sheets_not_selectable(self, tmp_path):
        wb = openpyxl.Workbook()
        wb.active.title = "Data"
        wb.active.append(["a"])
        hidden = wb.create_sheet("Hidden")
        hidden.sheet_state = "hidden"
        very_hidden = wb.create_sheet("VeryHidden")
        very_hidden.sheet_state = "veryHidden"
        wb.create_chartsheet("Chart")
        path = tmp_path / "book.xlsx"
        wb.save(path)

        sheets = {s.name: s for s in list_sheets(str(path))}

        assert sheets["Data"].selectable
        assert not sheets["Hidden"].selectable and sheets["Hidden"].reason == "hidden"
        assert not sheets["VeryHidden"].selectable
        assert not sheets["Chart"].selectable and sheets["Chart"].reason == "chart sheet"

    def test_keeps_workbook_order(self, tmp_path):
        path = _workbook(tmp_path, {"B": [["x"]], "A": [["y"]], "C": [["z"]]})
        assert [s.name for s in list_sheets(path)] == ["B", "A", "C"]


class TestResolvePartSelection:
    SHEETS = [PartInfo("One", True), PartInfo("Two", True), PartInfo("Secret", False, "hidden")]

    def test_none_selects_all_selectable(self):
        assert resolve_part_selection(self.SHEETS, None, "b.xlsx", "sheet") == ["One", "Two"]

    def test_keeps_workbook_order(self):
        assert resolve_part_selection(self.SHEETS, ["Two", "One"], "b.xlsx", "sheet") == ["One", "Two"]

    def test_missing_sheet_names_available_ones(self):
        with pytest.raises(InvalidInputError, match="'Three'.*Available sheets: One, Two"):
            resolve_part_selection(self.SHEETS, ["Three"], "b.xlsx", "sheet")

    def test_hidden_sheet_cannot_be_requested(self):
        with pytest.raises(InvalidInputError, match="Secret"):
            resolve_part_selection(self.SHEETS, ["Secret"], "b.xlsx", "sheet")

    def test_empty_selection_rejected(self):
        with pytest.raises(InvalidInputError, match="at least one sheet"):
            resolve_part_selection(self.SHEETS, [], "b.xlsx", "sheet")


class TestHeaderDetection:
    def test_first_row_header(self, tmp_path):
        path = _workbook(tmp_path, {"S": [["id", "name"], [1, "ada"], [2, "bob"]]})
        schema, rows = _convert(tmp_path, path, "S")
        assert list(schema) == ["id", "name"]
        assert rows == [(1, "ada"), (2, "bob")]

    def test_title_and_blank_rows_above_header(self, tmp_path):
        path = _workbook(tmp_path, {"S": [
            ["Quarterly report"],
            [],
            ["region", "units", "price"],
            ["north", 3, 2.5],
            ["south", 4, 3.5],
        ]})
        schema, rows = _convert(tmp_path, path, "S")
        assert list(schema) == ["region", "units", "price"]
        assert rows == [("north", 3, 2.5), ("south", 4, 3.5)]

    def test_numeric_first_row_means_no_header(self, tmp_path):
        path = _workbook(tmp_path, {"S": [[1, 2.5], [2, 3.5]]})
        schema, rows = _convert(tmp_path, path, "S")
        assert list(schema) == ["column_1", "column_2"]
        assert rows == [(1, 2.5), (2, 3.5)]

    def test_offset_table_trims_empty_columns(self, tmp_path):
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "S"
        ws["C3"], ws["D3"] = "a", "b"
        ws["C4"], ws["D4"] = 1, "x"
        path = tmp_path / "book.xlsx"
        wb.save(path)
        schema, rows = _convert(tmp_path, str(path), "S")
        assert list(schema) == ["a", "b"]
        assert rows == [(1, "x")]

    def test_empty_and_duplicate_headers(self, tmp_path):
        path = _workbook(tmp_path, {"S": [["id", None, "ID", "id"], [1, 2, 3, 4]]})
        schema, _ = _convert(tmp_path, path, "S")
        # DuckDB identifiers are case-insensitive, so "ID" clashes with "id".
        assert list(schema) == ["id", "column_2", "ID_2", "id_3"]

    def test_blank_rows_between_data_dropped(self, tmp_path):
        path = _workbook(tmp_path, {"S": [["a"], [1], [], [2]]})
        _, rows = _convert(tmp_path, path, "S")
        assert rows == [(1,), (2,)]


class TestTypeInference:
    def test_integral_numbers_become_bigint(self, tmp_path):
        path = _workbook(tmp_path, {"S": [["id", "amount"], [1, 1.5], [2, 2.0]]})
        schema, rows = _convert(tmp_path, path, "S")
        assert schema == {"id": "BIGINT", "amount": "DOUBLE"}
        assert rows == [(1, 1.5), (2, 2.0)]

    def test_mixed_column_becomes_text_without_losing_values(self, tmp_path):
        rows = [["code"]] + [[i] for i in range(25)] + [["X25"], [26.0]]
        path = _workbook(tmp_path, {"S": rows})
        schema, out = _convert(tmp_path, path, "S")
        assert schema == {"code": "VARCHAR"}
        values = [r[0] for r in out]
        assert values[:2] == ["0", "1"]  # integral floats render without ".0"
        assert values[-2:] == ["X25", "26"]
        assert len(values) == 27

    def test_null_tokens_do_not_force_text(self, tmp_path):
        path = _workbook(tmp_path, {"S": [["score"], [0.5], ["n/a"], ["NULL"], [1.5]]})
        schema, rows = _convert(tmp_path, path, "S")
        assert schema == {"score": "DOUBLE"}
        assert rows == [(0.5,), (None,), (None,), (1.5,)]

    def test_dates_and_datetimes(self, tmp_path):
        path = _workbook(tmp_path, {"S": [
            ["day", "stamp"],
            [dt.date(2024, 1, 1), dt.datetime(2024, 1, 1, 0, 0)],
            [dt.date(2024, 1, 2), dt.datetime(2024, 1, 2, 13, 30)],
        ]})
        schema, rows = _convert(tmp_path, path, "S")
        # calamine reads midnight datetimes as dates; mixing promotes to TIMESTAMP.
        assert schema == {"day": "DATE", "stamp": "TIMESTAMP"}
        assert rows[1] == (dt.date(2024, 1, 2), dt.datetime(2024, 1, 2, 13, 30))

    def test_booleans(self, tmp_path):
        path = _workbook(tmp_path, {"S": [["flag"], [True], [False]]})
        schema, rows = _convert(tmp_path, path, "S")
        assert schema == {"flag": "BOOLEAN"}
        assert rows == [(True,), (False,)]

    def test_header_only_column_is_kept_as_text(self, tmp_path):
        path = _workbook(tmp_path, {"S": [["a", "notes"], [1, None]]})
        schema, rows = _convert(tmp_path, path, "S")
        assert schema == {"a": "BIGINT", "notes": "VARCHAR"}
        assert rows == [(1, None)]

    def test_large_sheet_written_in_chunks(self, tmp_path, monkeypatch):
        import backend.connectors.file_handlers.workbook_handler as module
        monkeypatch.setattr(module, "_WRITE_CHUNK_ROWS", 7)
        path = _workbook(tmp_path, {"S": [["n"]] + [[i] for i in range(50)]})
        _, rows = _convert(tmp_path, path, "S")
        assert [r[0] for r in rows] == list(range(50))


class TestTextDates:
    """Dates stored as text parse only with the configured (CSV) formats."""

    ROWS = [["start", "site"], ["10/04/2026 22:00", "A"], ["10/06/2026 20:45", "B"]]

    def _convert_with(self, tmp_path, rows, **formats):
        path = _workbook(tmp_path, {"S": rows})
        out = str(tmp_path / "out.parquet")
        assert convert_sheet_to_parquet(path, "S", out, **formats)
        con = duckdb.connect()
        schema = {r[0]: r[1] for r in con.execute(f"DESCRIBE SELECT * FROM '{out}'").fetchall()}
        return schema, con.execute(f"SELECT * FROM '{out}'").fetchall()

    def test_text_stays_text_without_matching_format(self, tmp_path):
        schema, rows = self._convert_with(
            tmp_path, self.ROWS, date_format="%Y-%m-%d", timestamp_format="%Y-%m-%d %H:%M:%S"
        )
        assert schema["start"] == "VARCHAR"
        assert rows[0][0] == "10/04/2026 22:00"

    def test_timestamp_format_parses_text(self, tmp_path):
        schema, rows = self._convert_with(tmp_path, self.ROWS, timestamp_format="%m/%d/%Y %H:%M")
        assert schema == {"start": "TIMESTAMP", "site": "VARCHAR"}
        assert rows[0][0] == dt.datetime(2026, 10, 4, 22, 0)

    def test_format_decides_day_month_order(self, tmp_path):
        _, rows = self._convert_with(tmp_path, self.ROWS, timestamp_format="%d/%m/%Y %H:%M")
        assert rows[0][0] == dt.datetime(2026, 4, 10, 22, 0)

    def test_date_format_parses_text(self, tmp_path):
        rows = [["day"], ["17.10.2024"], [" 18.10.2024 "]]
        schema, out = self._convert_with(tmp_path, rows, date_format="%d.%m.%Y")
        assert schema == {"day": "DATE"}
        assert out == [(dt.date(2024, 10, 17),), (dt.date(2024, 10, 18),)]

    def test_one_unparseable_value_keeps_column_text(self, tmp_path):
        rows = self.ROWS + [["unknown", "C"]]
        schema, out = self._convert_with(tmp_path, rows, timestamp_format="%m/%d/%Y %H:%M")
        assert schema["start"] == "VARCHAR"
        assert out[-1][0] == "unknown"

    def test_text_mixed_with_real_date_cells(self, tmp_path):
        rows = [["when"], [dt.datetime(2026, 10, 5, 1, 30)], ["10/04/2026 22:00"]]
        schema, out = self._convert_with(tmp_path, rows, timestamp_format="%m/%d/%Y %H:%M")
        assert schema == {"when": "TIMESTAMP"}
        assert out == [(dt.datetime(2026, 10, 5, 1, 30),), (dt.datetime(2026, 10, 4, 22, 0),)]

    def test_numbers_stored_as_text_are_not_dates(self, tmp_path):
        rows = [["tac"], ["10621440"], ["10621441"]]
        schema, _ = self._convert_with(
            tmp_path, rows, date_format="%Y%m%d", timestamp_format="%m/%d/%Y %H:%M"
        )
        # "10621440" is not a valid %Y%m%d date (month 62), so the column stays text.
        assert schema == {"tac": "VARCHAR"}


class TestEmptySheets:
    def test_empty_sheet_returns_false(self, tmp_path):
        path = _workbook(tmp_path, {"Empty": [], "S": [["a"], [1]]})
        out = tmp_path / "out.parquet"
        assert not convert_sheet_to_parquet(path, "Empty", str(out))
        assert not out.exists()

    def test_header_only_sheet_returns_false(self, tmp_path):
        path = _workbook(tmp_path, {"S": [["a", "b"]]})
        assert not convert_sheet_to_parquet(path, "S", str(tmp_path / "out.parquet"))


class TestFixtureFormats:
    def test_xls(self, tmp_path):
        schema, rows = _convert(tmp_path, os.path.join(FIXTURES, "legacy.xls"), "Data")
        assert schema == {"id": "BIGINT", "label": "VARCHAR", "when": "DATE", "code": "VARCHAR"}
        assert rows[-1] == (3, "item3", dt.date(2024, 3, 3), "X30")

    def test_ods(self, tmp_path):
        schema, rows = _convert(tmp_path, os.path.join(FIXTURES, "sample.ods"), "Values")
        assert schema == {"id": "BIGINT", "value": "DOUBLE", "flag": "BOOLEAN"}
        assert rows == [(1, 1.5, True), (2, 2.5, False), (3, 3.5, True)]
