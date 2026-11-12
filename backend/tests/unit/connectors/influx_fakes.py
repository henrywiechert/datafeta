# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""A fake InfluxDB HTTP session for connector and router tests.

Its responses mirror what InfluxDB 1.8.10 and 2.7.12 return for the same
statements (SHOW queries, chunked SELECT with epoch=ns, error shapes).
"""

import json
import re

import pytest

from backend.connectors import influxql_client


class FakeResponse:
    def __init__(self, status_code=200, payload=None, lines=None, headers=None):
        self.status_code = status_code
        self._payload = payload
        self._lines = lines or []
        self.headers = headers or {}
        self.reason = "reason"
        self.text = json.dumps(payload) if payload is not None else ""

    def json(self):
        if self._payload is None:
            raise ValueError("no json")
        return self._payload

    def iter_lines(self, chunk_size=512, delimiter=None):
        for line in self._lines:
            yield json.dumps(line).encode()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def influx_series(name, columns, values, partial=False):
    series = {"name": name, "columns": columns, "values": values}
    if partial:
        series["partial"] = True
    return series


def influx_result(*series, error=None):
    result = {"statement_id": 0}
    if error:
        result["error"] = error
    if series:
        result["series"] = list(series)
    return {"results": [result]}


class FakeInflux:
    """Answers the statements the connector sends, like a small InfluxDB."""

    def __init__(self, measurements, chunks=None, status_code=200):
        # measurements: name -> {"tags": [...], "fields": [(key, type), ...]}
        self.measurements = measurements
        # chunks: name -> list of row-lists (one list per chunk), rows as [time, c0, c1, ...]
        self.chunks = chunks or {}
        self.status_code = status_code
        self.statements = []
        self.verify = True
        self.auth = None
        self.headers = {}
        self.closed = False

    def close(self):
        self.closed = True

    def get(self, url, timeout=None):
        return FakeResponse(204, headers={"X-Influxdb-Version": "v2.7.12"})

    def post(self, url, data=None, stream=False, timeout=None):
        statement = data["q"]
        self.statements.append(data)
        if self.status_code != 200:
            return FakeResponse(self.status_code, payload={"error": "authorization failed"})
        if statement == "SHOW DATABASES":
            return FakeResponse(payload=influx_result(influx_series("databases", ["name"], [["telegraf"], ["_internal"], ["app"]])))
        if statement == "SHOW MEASUREMENTS":
            values = [[name] for name in sorted(self.measurements)]
            return FakeResponse(payload=influx_result(*([influx_series("measurements", ["name"], values)] if values else [])))
        if statement == "SHOW FIELD KEYS":
            return FakeResponse(payload=influx_result(*[
                influx_series(name, ["fieldKey", "fieldType"], [list(f) for f in m["fields"]])
                for name, m in sorted(self.measurements.items()) if m["fields"]
            ]))
        if statement == "SHOW TAG KEYS":
            return FakeResponse(payload=influx_result(*[
                influx_series(name, ["tagKey"], [[t] for t in m["tags"]])
                for name, m in sorted(self.measurements.items()) if m["tags"]
            ]))
        if statement.startswith("SELECT"):
            assert data["chunked"] == "true" and data["epoch"] == "ns"
            name = re.search(r'FROM "((?:[^"\\]|\\.)*)"', statement).group(1)
            aliases = re.findall(r" AS (c\d+)", statement)
            chunks = self.chunks.get(name, [])
            lines = [
                influx_result(influx_series(name, ["time"] + aliases, rows, partial=i < len(chunks) - 1))
                for i, rows in enumerate(chunks)
            ] or [influx_result()]
            return FakeResponse(lines=lines)
        raise AssertionError(f"unexpected statement {statement}")


@pytest.fixture
def fake_server(monkeypatch):
    def install(measurements, chunks=None, status_code=200):
        fake = FakeInflux(measurements, chunks, status_code)
        monkeypatch.setattr(influxql_client.requests, "Session", lambda: fake)
        return fake
    return install
